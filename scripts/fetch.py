#!/usr/bin/env python3
"""Collect new reading candidates from RSS/Atom feeds, listing pages and Hacker News.

Writes data/candidates.json: items not already in docs/data/items.json and
published within --days. The daily routine summarises and scores them, then
appends them to docs/data/items.json. Standard library only.
"""
import argparse
import hashlib
import html
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 reading-list/1.0"
TRACKING = re.compile(r"^(utm_|ref$|ref_src$|source$|r$|s$|publication_id$|post_id$|isFreemail$|triedRedirect$)")
def _ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
        if not ssl.get_default_verify_paths().cafile and os.path.exists("/etc/ssl/cert.pem"):
            ctx.load_verify_locations("/etc/ssl/cert.pem")
        return ctx


SSL_CTX = _ssl_ctx()
PAGE_CAP = 6  # max new links per listing page per run (no dates on those pages)


def canon(url: str) -> str:
    p = urllib.parse.urlsplit(url.strip())
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not TRACKING.match(k)]
    path = p.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower().removeprefix("www."), path, urllib.parse.urlencode(q), ""))


def item_id(url: str) -> str:
    return hashlib.sha1(canon(url).encode()).hexdigest()[:12]


ALT_UA = "Mozilla/5.0 (compatible; reading-list/1.0; +https://github.com/viveksinha/reading-list)"


def get(url: str, timeout=20) -> bytes:
    try:
        data = _get(url, UA, timeout)
    except urllib.error.HTTPError as exc:
        if exc.code not in (400, 403, 406):
            raise
        data = _get(url, ALT_UA, timeout)  # some sites reject one UA or the other
    return data


def _get(url, ua, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        data = r.read()
    if data[:2] == b"\x1f\x8b":
        import gzip
        data = gzip.decompress(data)
    return data.lstrip(b"\xef\xbb\xbf \r\n\t")


def clean(text: str, limit=800) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text or "", flags=re.S | re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def parse_date(s: str):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child(el, name):
    for c in el:
        if local(c.tag) == name:
            return c
    return None


def text_of(el, *names):
    for n in names:
        c = child(el, n)
        if c is not None and (c.text or "").strip():
            return c.text.strip()
    return ""


def parse_feed(data: bytes):
    root = ET.fromstring(data)
    entries = [e for e in root.iter() if local(e.tag) in ("item", "entry")]
    out = []
    for e in entries:
        link = text_of(e, "link")
        if not link:
            for c in e:
                if local(c.tag) == "link" and c.get("rel", "alternate") == "alternate" and c.get("href"):
                    link = c.get("href")
                    break
        if not link:
            continue
        desc = text_of(e, "encoded", "description", "summary", "content")
        out.append({
            "title": clean(text_of(e, "title"), 300),
            "url": link,
            "published": parse_date(text_of(e, "pubDate", "published", "updated", "date")),
            "excerpt": clean(desc),
        })
    return out


def fetch_feed(src):
    try:
        return src, parse_feed(get(src["url"])), None
    except Exception as exc:  # report and continue; one bad feed must not stop the run
        return src, [], f"{type(exc).__name__}: {exc}"


def fetch_page(src):
    try:
        body = get(src["url"]).decode("utf-8", "replace")
    except Exception as exc:
        return src, [], f"{type(exc).__name__}: {exc}"
    seen, out = set(), []
    for href in re.findall(r'href="([^"#?]+)"', body):
        if src.get("exclude") and re.match(src["exclude"], href):
            continue
        if re.match(src["pattern"], href) and href not in seen:
            seen.add(href)
            url = src.get("base", "") + href
            slug = href.rstrip("/").rsplit("/", 1)[-1].replace("-", " ")
            out.append({"title": slug.capitalize(), "url": url, "published": None, "excerpt": "", "needs_title": True})
    return src, out, None


def fetch_hn(cfg, since: datetime):
    q = urllib.parse.urlencode({
        "tags": "story",
        "numericFilters": f"created_at_i>{int(since.timestamp())},points>={cfg['min_points']}",
        "hitsPerPage": 300,
    })
    hits = json.loads(get(f"https://hn.algolia.com/api/v1/search_by_date?{q}"))["hits"]
    kws = [k.lower() for k in cfg["keywords"]]
    out = []
    for h in hits:
        title = h.get("title") or ""
        if not any(k in f" {title.lower()} " for k in kws):
            continue
        hn_url = f"https://news.ycombinator.com/item?id={h['objectID']}"
        out.append({
            "title": title, "url": h.get("url") or hn_url,
            "published": datetime.fromtimestamp(h["created_at_i"], timezone.utc),
            "excerpt": "", "discussion_url": hn_url, "points": h.get("points"),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3, help="look-back window")
    ap.add_argument("--out", default=str(ROOT / "data" / "candidates.json"))
    args = ap.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    cfg = json.loads((ROOT / "sources.json").read_text())
    items_path = ROOT / "docs" / "data" / "items.json"
    known = {canon(i["url"]) for i in json.loads(items_path.read_text())} if items_path.exists() else set()

    cands, errors, seen = [], {}, set(known)

    def add(src, entry, kind=None):
        key = canon(entry["url"])
        if key in seen:
            return
        seen.add(key)
        pub = entry.get("published")
        cands.append({
            "id": item_id(entry["url"]),
            "title": entry["title"], "url": entry["url"],
            "source_id": src["id"], "source": src["name"], "group": src["group"],
            "kind": kind or src["kind"],
            "published": (pub or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
            "excerpt": entry.get("excerpt", ""),
            **({"discussion_url": entry["discussion_url"]} if entry.get("discussion_url") else {}),
            **({"points": entry["points"]} if entry.get("points") else {}),
            **({"needs_title": True} if entry.get("needs_title") else {}),
        })

    with ThreadPoolExecutor(max_workers=12) as pool:
        for src, entries, err in pool.map(fetch_feed, cfg["feeds"]):
            if err:
                errors[src["id"]] = err
            for e in entries:
                if e["published"] and e["published"] >= since:
                    add(src, e)
        for src, entries, err in pool.map(fetch_page, cfg.get("pages", [])):
            if err:
                errors[src["id"]] = err
            for e in entries[:PAGE_CAP]:
                add(src, e)

    try:
        hn_src = {"id": "hackernews", "name": "Hacker News", "group": "community", "kind": "community"}
        for e in fetch_hn(cfg["hackernews"], since):
            add(hn_src, e)
    except Exception as exc:
        errors["hackernews"] = f"{type(exc).__name__}: {exc}"

    cands.sort(key=lambda c: c["published"], reverse=True)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "since": since.isoformat(timespec="seconds"),
                               "errors": errors, "candidates": cands}, indent=1, ensure_ascii=False))
    print(f"{len(cands)} candidates since {since:%Y-%m-%d}; {len(errors)} source errors -> {out}", file=sys.stderr)
    for k, v in errors.items():
        print(f"  ! {k}: {v}", file=sys.stderr)


if __name__ == "__main__":
    main()
