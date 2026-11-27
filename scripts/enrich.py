#!/usr/bin/env python3
"""Add pictures to docs/data/items.json: an article image and a source logo.

- Article image: the page's og:image / twitter:image, stored as item["image"]
  ("" when the page has none, so it is not fetched again). Images are linked, not copied.
- Source logo: the site's apple-touch-icon or largest icon, saved once per source to
  docs/logos/<key>.<ext> and listed in docs/logos/index.json (null = none found).

Run after merge.py. Only items and sources not seen before are fetched. Standard library only.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fetch import SSL_CTX, UA  # noqa: E402

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


def article_image(item):
    if "news.ycombinator.com" in item["url"]:
        return item["id"], ""
    try:
        p, final = head_of(item["url"])
    except Exception:
        return item["id"], ""
    if not p:
        return item["id"], ""
    src = p.meta.get("og:image") or p.meta.get("og:image:url") or p.meta.get("twitter:image") or ""
    src = https(urllib.parse.urljoin(final, src.strip())) if src.strip() else ""
    return item["id"], src if src.startswith("https://") else ""


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
    todo = [i for i in items if "image" not in i]
    with ThreadPoolExecutor(max_workers=12) as pool:
        found = dict(pool.map(article_image, todo))
    for i in items:
        if i["id"] in found:
            i["image"] = found[i["id"]]
    ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n")
    print(f"images: checked {len(todo)}, found {sum(1 for v in found.values() if v)}")

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


if __name__ == "__main__":
    main()
