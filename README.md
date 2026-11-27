# Reading List

A daily, scored digest of writing on data infrastructure, AI, product and the future of technology, published at
**https://viveksinha.github.io/reading-list/**.

Each item is a short, machine-written summary with a link to the original. Nothing here
republishes the source text.

## How it works

```
sources.json ──► scripts/fetch.py ──► data/candidates.json ─┐
Gmail "Newsletters" label (email-only sources) ─────────────┤
                                                            ▼
                      Claude routine scores with interests.md ──► scripts/merge.py ──► docs/data/items.json ──► GitHub Pages
```

- **Sources:** company engineering blogs, AI labs, data and PM newsletters, science and
  progress writing (via RSS), Hacker News (keyword + points filter), Lobsters, Hugging Face daily
  papers, and email-only newsletters.
- **Scoring:** one of 14 categories, importance 1–3 (Must read / Worth it / Skim), 2–4 tags, and a
  `story` key when several sources cover the same news. The routine also writes a daily brief.
- **Dates:** every item carries the article's own publish date. Listing-page posts without one
  are dropped rather than stamped with the day they were found.
  The rubric lives in [`interests.md`](interests.md).
- **Daily update:** see [`ROUTINE.md`](ROUTINE.md).

## Folder map

```
docs/            the site (GitHub Pages root): index.html, style.css, app.js, feed.xml (Atom),
                 data/items.json, data/brief.json, logos/
scripts/         fetch.py (collect candidates), merge.py (add scored items to the site),
                 enrich.py (preview images, reading times, logos, date check, feed)
sources.json     feeds, listing pages and Hacker News filter
interests.md     reader profile, categories, importance rubric, summary style
ROUTINE.md       the daily routine's steps
```

## Run locally

```
python3 scripts/fetch.py --days 7        # collect candidates
python3 -m http.server -d docs 8000      # preview the site at http://localhost:8000
```

## Reader features

- A daily brief at the top: what changed, with 3–5 picks.
- "New since your last visit" count and a New filter; stories covered by several sources show as
  one card with "Also covered by".
- Reading time on each card and a Quick / Long length filter; trending topics for the week.
- Keyboard: `j`/`k` move, `o` opens, `s` stars, `m` marks read, `c` copies a link, `/` searches,
  `?` lists keys. Links to a single pick (`#a-<id>`) scroll to and highlight it.
- Filters by importance, time range, read state, type and category; star and mark-as-read;
  source logos and thumbnails; five themes, four text sizes, sans or serif, compact spacing.
- RSS: [`feed.xml`](https://viveksinha.github.io/reading-list/feed.xml) carries Must read and Worth it picks.

Reading state and settings stay in your browser.
