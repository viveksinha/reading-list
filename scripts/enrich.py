#!/usr/bin/env python3
"""Add pictures and reading time to docs/data/items.json, then write the site's feed.

- Article image: the page's og:image / twitter:image, stored as item["image"]
  ("" when the page has none). Images are linked, not copied.
- Reading time: item["minutes"], from the words in the page's paragraphs (0 = unknown).
- Date check: when the page's own publish date is 2+ days older than item["published"]
  (a feed re-dated an old post), the page date wins. Community links keep their post date.
- Source logo: the site's apple-touch-icon or largest icon, saved once per source to
  docs/logos/<key>.<ext> and listed in docs/logos/index.json (null = none found).

- Feed: docs/feed.xml, an Atom feed of the latest Must read and Worth it items.

Run after merge.py. Only items and sources not seen before are fetched. Standard library only.
"""
import json
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape
import sys
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fetch import SSL_CTX, UA, article_date, parse_date  # noqa: E402

ITEMS = ROOT / "docs" / "data" / "items.json"
LOGOS = ROOT / "docs" / "logos"
COMMUNITY = {"hackernews": "news.ycombinator.com", "lobsters": "lobste.rs"}
MAX_LOGO = 150_000


class Head(HTMLParser):
    """Collect <meta> and <link> tags from the page head."""

    def __init__(self):
        super().__init__()
        self.meta, self.links = {}, []

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"]
        elif tag == "link" and a.get("href"):
            self.links.append(a)


def fetch(url, limit=400_000, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,image/*,*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.headers.get("Content-Type", ""), r.read(limit), r.geturl()


def head_of(url):
    ctype, body, final = fetch(url)
    if "html" not in ctype:
        return None, final
    p = Head()
    p.feed(body.decode("utf-8", "replace"))
    return p, final


def https(url):
    return "https:" + url[5:] if url.startswith("http:") else url


def words_in(body: str) -> int:
    body = re.sub(r"<(script|style|nav|header|footer|aside)[^>]*>.*?</\1>", " ", body, flags=re.S | re.I)
    paras = re.findall(r"<p[\s>].*?</p>", body, flags=re.S | re.I)
    return sum(len(re.sub(r"<[^>]+>", " ", x).split()) for x in paras)


def article_info(item):
    """(id, image url, reading minutes, page publish date) for one article page."""
    if "news.ycombinator.com" in item["url"]:
        return item["id"], "", 0, None
    try:
        ctype, raw, final = fetch(item["url"], limit=2_000_000)
    except Exception:
        return item["id"], "", 0, None
    if "html" not in ctype:
        return item["id"], "", 0, None
    body = raw.decode("utf-8", "replace")
    p = Head()
    p.feed(body[:400_000])
    src = (p.meta.get("og:image") or p.meta.get("og:image:url") or p.meta.get("twitter:image") or "").strip()
    src = https(urllib.parse.urljoin(final, src)) if src else ""
    words = words_in(body)
    minutes = max(1, round(words / 230)) if 150 < words < 120 * 230 else 0  # >2h = page noise
    return item["id"], src if src.startswith("https://") else "", minutes, article_date(body)


def image_ext(data, ctype):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:4] == b"GIF8":
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:4] == b"\x00\x00\x01\x00":
        return "ico"
    if "svg" in ctype or b"<svg" in data[:500]:
        return "svg"
    return None


def png_width(data):
    return int.from_bytes(data[16:20], "big") if data[:8] == b"\x89PNG\r\n\x1a\n" else 0


def icon_candidates(domain):
    """Icon URLs from the home page, best first."""
    try:
        p, final = head_of(f"https://{domain}/")
    except Exception:
        return []
    if not p:
        return []
    scored = []
    for link in p.links:
        rel = link.get("rel", "").lower()
        if "icon" not in rel or "mask" in rel:
            continue
        m = re.match(r"(\d+)x\d+", link.get("sizes", ""))
        size = int(m.group(1)) if m else (180 if "apple" in rel else 32)
        if link["href"].lower().endswith(".svg") or "svg" in link.get("type", ""):
            size = 160
        if size > 512:
            size = 1
        scored.append((size, urllib.parse.urljoin(final, link["href"])))
    return [u for _, u in sorted(scored, reverse=True)]


def logo(key, domain):
    tries = icon_candidates(domain) + [
        f"https://www.google.com/s2/favicons?domain={domain}&sz=128",
        f"https://{domain}/favicon.ico",
    ]
    for url in tries:
        try:
            ctype, data, _ = fetch(https(url), limit=MAX_LOGO + 1)
        except Exception:
            continue
        ext = image_ext(data, ctype)
        if not ext or len(data) > MAX_LOGO or len(data) < 100:
            continue
        if "google.com/s2" in url and png_width(data) < 32:
            continue  # Google's generic globe
        (LOGOS / f"{key}.{ext}").write_bytes(data)
        return key, f"logos/{key}.{ext}"
    return key, None


def logo_key(item):
    return item.get("source_id") or re.sub(r"[^a-z0-9]+", "-", item["source"].lower()).strip("-")


def main():
    items = json.loads(ITEMS.read_text())
    todo = [i for i in items if "image" not in i or "minutes" not in i]
    with ThreadPoolExecutor(max_workers=12) as pool:
        found = {k: rest for k, *rest in pool.map(article_info, todo)}
    redated = 0
    for i in items:
        if i["id"] in found:
            img, mins, page_date = found[i["id"]]
            if not i.get("image"):
                i["image"] = img
            i["minutes"] = mins
            if page_date and i.get("kind") not in ("community", "paper") and \
                    (parse_date(i["published"]) - page_date).days >= 2:
                i["published"] = page_date.isoformat(timespec="seconds")
                redated += 1
    items.sort(key=lambda i: i["published"], reverse=True)
    ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n")
    print(f"pages: checked {len(todo)}, images {sum(1 for v in found.values() if v[0])}, "
          f"reading times {sum(1 for v in found.values() if v[1])}, re-dated {redated}")

    LOGOS.mkdir(parents=True, exist_ok=True)
    index_path = LOGOS / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    domains = {}
    for i in items:
        key = logo_key(i)
        if key not in index:
            domains.setdefault(key, Counter())[urllib.parse.urlsplit(i["url"]).netloc.removeprefix("www.")] += 1
    jobs = [(k, COMMUNITY.get(k) or c.most_common(1)[0][0]) for k, c in domains.items()]
    with ThreadPoolExecutor(max_workers=12) as pool:
        index.update(pool.map(lambda j: logo(*j), jobs))
    index_path.write_text(json.dumps(dict(sorted(index.items())), indent=1) + "\n")
    print(f"logos: checked {len(jobs)}, found {sum(1 for k, _ in jobs if index.get(k))}")
    write_feed(items)


SITE = "https://viveksinha.github.io/reading-list/"


def write_feed(items, limit=60):
    picks = [i for i in items if i.get("importance", 1) >= 2][:limit]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    entries = []
    for i in picks:
        label = "Must read" if i["importance"] == 3 else "Worth it"
        summary = f"{label} · {i['category']} · {i['source']}. {i['summary']}"
        entries.append(f"""  <entry>
    <title>{escape(i["title"])}</title>
    <link href="{escape(i["url"])}"/>
    <id>{escape(SITE)}#{i["id"]}</id>
    <updated>{i.get("added") or i["published"]}</updated>
    <published>{i["published"]}</published>
    <author><name>{escape(i["source"])}</name></author>
    <category term="{escape(i["category"])}"/>
    <summary>{escape(summary)}</summary>
  </entry>""")
    (ROOT / "docs" / "feed.xml").write_text(f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Reading List</title>
  <subtitle>Must read and Worth it picks on data infrastructure, AI, product and the future.</subtitle>
  <link href="{SITE}"/>
  <link rel="self" href="{SITE}feed.xml"/>
  <id>{SITE}</id>
  <updated>{now}</updated>
{chr(10).join(entries)}
</feed>
""")
    print(f"feed: {len(entries)} entries")


if __name__ == "__main__":
    main()
