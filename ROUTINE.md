# Daily update routine

Run by a scheduled Claude cloud routine once a day. Steps:

1. `python3 scripts/fetch.py --days 3` — writes `data/candidates.json` (RSS feeds, listing pages,
   Hacker News). Already-published URLs are skipped automatically.
2. **Gmail** — search `label:Newsletters newer_than:3d` in the connected Gmail account.
   - Skip any email whose article is already a candidate or already in `docs/data/items.json`
     (most Substack posts arrive by RSS too).
   - For the rest (email-only newsletters, Blind digests, links the owner emailed to the
     `+reading` address), take the public article URL, its title and the publication name.
     Use `kind: "saved"` for links the owner sent to themselves, otherwise `kind: "newsletter"`.
   - Never copy email addresses, unsubscribe links, tracking or redirect URLs, or the email text.
3. Score every candidate and Gmail item using `interests.md` and write `data/scored.json`
   (`id`, `summary`, `category`, `importance`, `tags`; full item fields for Gmail items; `skip: true`
   for non-articles). Then run `python3 scripts/merge.py`.
   Then run `python3 scripts/enrich.py` to add each new article's preview image and any new
   source logo (`docs/logos/`).
4. Privacy check before committing — this must print nothing:
   `grep -niE '@gmail|wiki\.viveksinha|unsubscribe|substack\.com/redirect|list-manage' docs/data/items.json`
5. Commit `docs/data/items.json` and `docs/logos/` as `Daily update YYYY-MM-DD` and push to `main`.
   GitHub Pages republishes the site on push.
