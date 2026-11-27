#!/usr/bin/env python3
"""Merge scored candidates into docs/data/items.json.

Input: data/scored.json, a list of {"id", "summary", "category", "importance", "tags"}
(optionally "title" to fix a scraped title, "story" to group posts about the same news,
or "skip": true to drop an item). Each new item gets "added" (when it joined the site).
An entry whose id is already on the site only sets that item's "story" key.
Extra items with no candidate (e.g. from Gmail) must carry the full item fields:
id, title, url, source, kind, published, summary, category, importance, tags.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fetch import canon, item_id  # noqa: E402

CATEGORIES = {
    "Real-time Analytics", "Streaming", "Lakehouse", "Data Engineering", "Databases & Systems",
    "AI Models & Research", "AI Engineering", "AI Industry", "Product Management",
    "Growth & GTM", "Strategy & Markets", "Engineering Culture", "Philosophy & Ideas",
    "Science & Progress",
}
KEEP = ("id", "title", "url", "source", "source_id", "group", "kind", "published",
        "summary", "category", "importance", "tags", "discussion_url", "points",
        "story", "image", "minutes", "added")


def main():
    cand_path = ROOT / "data" / "candidates.json"
    scored_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "scored.json"
    items_path = ROOT / "docs" / "data" / "items.json"

    cands = {c["id"]: c for c in json.loads(cand_path.read_text())["candidates"]} if cand_path.exists() else {}
    items = json.loads(items_path.read_text()) if items_path.exists() else []
    known = {canon(i["url"]) for i in items}
    by_id = {i["id"]: i for i in items}

    added, grouped, problems = 0, 0, []
    for s in json.loads(scored_path.read_text()):
        if s.get("skip"):
            continue
        if s.get("id") in by_id:  # already on the site: only a story key can change
            if s.get("story"):
                by_id[s["id"]]["story"] = s["story"]
                grouped += 1
            continue
        base = dict(cands.get(s.get("id"), {}))
        base.update({k: v for k, v in s.items() if v not in (None, "")})
        base.pop("needs_title", None)
        if not base.get("url") or not base.get("title"):
            problems.append(f"{s.get('id')}: missing url/title")
            continue
        base["id"] = base.get("id") or item_id(base["url"])
        if base.get("category") not in CATEGORIES:
            problems.append(f"{base['id']}: unknown category {base.get('category')!r}")
            continue
        base["importance"] = max(1, min(3, int(base.get("importance", 1))))
        if canon(base["url"]) in known:
            continue
        known.add(canon(base["url"]))
        base["added"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        items.append({k: base[k] for k in KEEP if k in base})
        added += 1

    items.sort(key=lambda i: i["published"], reverse=True)
    items_path.write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n")
    print(f"added {added}; grouped {grouped} existing; total {len(items)}")
    for p in problems:
        print("  !", p)


if __name__ == "__main__":
    main()
