# Reader profile and scoring guide

The reader is a product manager at a real-time analytics company (Apache Pinot / StarTree Cloud).
Their work touches: real-time OLAP, streaming ingestion (Kafka, Kinesis, Flink), lakehouse and
open table formats (Iceberg, Delta, Hudi, Unity / Polaris / Glue catalogs), query performance,
indexing, cloud data platform UX, and AI on top of data (agents, MCP, text-to-SQL, observability).
They also care about product management craft, B2B SaaS growth and pricing, and where AI is heading.
Outside work they read philosophy and big-idea essays (ethics, mind, meaning, science and society).

## Categories (pick exactly one)

| Category | Covers |
|---|---|
| Real-time Analytics | OLAP engines, Pinot, Druid, ClickHouse, user-facing analytics, observability data |
| Streaming | Kafka, Flink, Kinesis, CDC, stream processing |
| Lakehouse | Iceberg, Delta, Hudi, Parquet, catalogs, warehouses, Databricks/Snowflake platform news |
| Data Engineering | pipelines, dbt, orchestration, data quality, data teams |
| Databases & Systems | storage engines, distributed systems, performance, infra engineering |
| AI Models & Research | model releases, benchmarks, research papers, training |
| AI Engineering | agents, MCP, RAG, evals, LLM apps, AI coding tools, AI for data |
| AI Industry | AI company strategy, policy, funding, market moves |
| Product Management | PM craft, discovery, roadmaps, PM careers, product leadership |
| Growth & GTM | pricing, PLG, marketing, sales, SaaS metrics |
| Strategy & Markets | tech strategy, market analysis, cloud/SaaS market, competitive moves |
| Engineering Culture | eng management, careers, org design, developer productivity |
| Science & Progress | science news, energy, chips and hardware, biotech, progress studies, how technology changes the economy |
| Philosophy & Ideas | philosophy, ethics, mind and consciousness, meaning, history of ideas, essays on science and society |

## Importance (1-3)

- **3 = Must read.** Direct impact on StarTree's market or roadmap (competitor launches, real-time /
  lakehouse / streaming shifts, AI-on-data moves by major vendors), major AI model or platform
  shifts, or exceptional PM / strategy writing.
- **2 = Worth reading.** Solid, relevant, would make the reader better at the job.
- **1 = Skim.** Tangential, promotional, routine release notes, tutorials, or weak relevance.

Vendor marketing posts default to 1 unless they announce something material.

Science & Progress is scored like Philosophy & Ideas: a deep piece on where technology, science or
the economy is heading is 2, an exceptional one is 3; routine science news is 1.

Papers (Hugging Face daily papers) are 2 when the result could change how AI systems are built or
used, 3 only for a clear step change; incremental benchmark papers are 1.

Philosophy & Ideas is scored on its own terms, not work relevance: a deep, original essay is 2,
an exceptional one (or one on AI and mind/ethics) is 3; book reviews, news and light pieces are 1.

## People to watch

Original essays, talks and long interviews by these people are importance 3. Link posts, short
notes and reposts from prolific writers (e.g. Simon Willison) keep normal scoring.

**AI**
- Cat Wu (Claude Code / Cowork product lead at Anthropic; Core Products PM lead at OpenAI from Nov 2026)
- Andrej Karpathy, Sam Altman, Dario Amodei, Demis Hassabis, Ilya Sutskever
- Mike Krieger, Kevin Weil, Fidji Simo, Boris Cherny (AI product leaders)
- Simon Willison, Ethan Mollick, Nathan Lambert, Jack Clark, Dwarkesh Patel, swyx
- Chip Huyen, Eugene Yan, Hamel Husain, Jason Liu, Lilian Weng, Andrew Ng, Sebastian Raschka

**Product**
- Marty Cagan, Teresa Torres, Lenny Rachitsky, Shreyas Doshi, Julie Zhuo, John Cutler
- April Dunford, Elena Verna, Kyle Poyar, Andrew Chen, Casey Winters, Ben Thompson

## Summary style

Two sentences, max ~45 words, in plain words: what it says, then why it matters. The site is
public, so write for any technical reader: no "this reader", "your product" or "your team".
No hype, no "this article explores". Don't copy the source text.
Tags: 2-4 lowercase keywords (e.g. `iceberg`, `pricing`, `agents`).

## Same story, several sources

When two or more items (new or already in `docs/data/items.json`) cover the same event or
announcement, give each the same `story` key: a short kebab-case slug such as `anthropic-ipo`.
The site shows one card per story and lists the other sources on it. Different angles on a broad
topic (two essays about agents) are not one story.

## Dates

`published` must be the article's own publish date. Never use the day it was found. If an item's
page shows it is older than its feed date, use the page date. An old post re-shared on Hacker
News or Lobsters keeps the discussion date, since that is when it surfaced.

## Daily brief

After scoring, write `docs/data/brief.json`:

```json
{"date": "YYYY-MM-DD", "headline": "...", "text": "...", "picks": ["<id>", "..."]}
```

- `picks`: 3-5 ids of the most important items **published in the last 3 days** (check each
  item's `published`; never pick an older item, however important).
- `headline`: one line, under 90 characters, naming what changed, not a teaser.
- `text`: 2-3 plain sentences tying the picks together. State only what the picked items say,
  and don't call anything "this week" or "today" unless its `published` date says so.
