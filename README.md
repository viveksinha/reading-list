# Reading List

A daily, scored digest of data-infrastructure, AI and product-management writing, published at
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

- **Sources:** company engineering blogs, AI labs, data and PM newsletters (via RSS), Hacker News
  (keyword + points filter), Lobsters, and email-only newsletters.
- **Scoring:** one of 12 categories, importance 1–3 (Must read / Worth it / Skim), 2–4 tags.
  The rubric lives in [`interests.md`](interests.md).
- **Daily update:** see [`ROUTINE.md`](ROUTINE.md).

## Folder map

```
docs/            the site (GitHub Pages root): index.html, style.css, app.js, data/items.json, logos/
scripts/         fetch.py (collect candidates), merge.py (add scored items to the site),
                 enrich.py (article preview images + source logos)
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

Filters by importance, time range, read state, type and category; search (press `/`); star and
mark-as-read; source logos and article preview images (Must reads get a large one); sepia/light/dark/black/system theme, four text sizes, sans or serif, compact spacing. Reading
state and settings stay in your browser.
