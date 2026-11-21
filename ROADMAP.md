# Roadmap

<!--
Single file for todos, ideas, decisions and diary, read by Projects Overview
(https://alessiomartini.github.io/projects-overview/). Protocol: templates/ROADMAP.md of projects-overview.
-->

## Left half-done
- [x] Map with filters by food/drink and total price
- [x] Automatic update from OpenStreetMap
- [x] Photo of the venue in the card (only where OSM has a Wikimedia reference, coverage ~0.5%)
- [x] Menu photos with price extraction
  - [x] Prices from PDF menus (pdftotext)
  - [x] Menus as images (OCR)
- [x] Flag prices older than 12 months to re-check

## Ideas

### Centralised feedback (idea, not yet decided)

- [ ] Centralised feedback (idea, not yet decided)

Today this repo has its own dedicated Cloudflare D1 database
(`eating-amsterdam`, see `backend/README.md`) with its own Worker, and the same
goes for two other sites of Alessio's (`ear-training`, `geopolitics-atlas`), each
with its own D1 + Worker to collect notes/feedback.

Idea under consideration, **not taken**: consolidate into a single D1 database
shared by all of Alessio's sites, with a table like

```sql
notes(id, site, page, text, created_at, ...)
```

where `site` tells where a note comes from, behind a single Worker with a CORS
allowlist per domain (as `ALLOWED_ORIGINS` in `backend/wrangler.toml` does today,
but with several domains instead of one).

**Pros:**
- fewer Cloudflare accounts/infrastructure to maintain (one D1 + one Worker
  instead of one per site);
- a single place to read all the notes of all the sites.

**Cons:**
- a bug in the shared Worker would break note collection everywhere, whereas
  today each site is isolated: a problem in one does not touch the others;
- the history already present in the existing D1 databases would have to be migrated (here: tables
  `prices`, `flags`, `feedback` of the `eating-amsterdam` database).

Low priority: the current system (Worker + dedicated D1, see
`backend/src/worker.js`) works well as it is.

## Decisions and things tried

Notes on what is missing, what is left half-done, and proposals not yet decided.
For how the project is built today see `README.md` (site) and
`backend/README.md` (Worker + D1).

### Left half-done

- **Photo of the venue in the card**: done with the only free source that needs no keys,
  Wikimedia Commons. `npm run enrich:photos` starts from the OSM tags `wikidata`,
  `wikimedia_commons`, `image` (now saved in `photoRef` by `fetch:osm`) and resolves the
  file (file named in OSM > P18 of Wikidata > first file of a Commons category,
  only if the category name contains the venue's name), then saves in
  `place.photo` the thumbnail (hotlink, no file in the repo), author, licence and file
  page; the card shows the photo with its attribution. Commons was chosen because every
  file has a clear author and licence, unlike Google Places (not connected, restrictive
  ToS). Known limit: low coverage, 23 venues out of 4713 (~0.5%) with a photo, because
  only ~38 venues have a Wikimedia reference in OSM; the rest show no photo.
  It grows only if someone adds the tags in OSM. The weekly refresh runs the
  script (`continue-on-error`).
- **Menu photos with price extraction**: today `scripts/scrape-menus.mjs`
  reads HTML pages, PDFs and menu images published by the venue (OCR with `tesseract`,
  see below). A photo taken by a user is not handled: it stays out of scope.
- **PDF menus**: `scrape-menus` follows up to 2 `.pdf` links on the same host that
  look like a menu, only if the HTML and menu pages are not enough, and extracts their text with
  `pdftotext -layout` (poppler, child process: no npm dependency). Same parser
  and same plausibility limits as the HTML (`extractItemsFromText`); the venue gets
  `menu.menuSource: "pdf"`. Without `pdftotext` it is skipped with a log line; the
  weekly workflow installs it (`poppler-utils`, `continue-on-error`). Discarded:
  PDFs on other hosts (as for pages) and PDFs over 10 MB. 
- **Menus as images**: up to 2 `.jpg/.png/.webp` images on the same host with
  menu/kaart/prijzen/drinks in the name or alt (max 8 MB), read with `tesseract`
  (eng+nld, child process, no npm dependency), with a clean-up of typical OCR
  defects ("12.5O"); `menuSource: "ocr"`. Optional: without `tesseract` it is skipped with a
  log line; the weekly workflow installs it. Not tested in bulk on real sites.
- **Flagging old prices** (> 12 months): done, "re-check" badge in
  list and card. Limit: `npm run check:stale` lists only menu prices
  (`menu.scrapedAt`); community prices live in the Worker, not in the repo,
  so only the UI flags them. A filter to hide them is still missing.
- **`data/feedback.json` and `npm run sync:backend`**: the weekly workflow
  that brings prices and reports from the Worker into the repo exists, but there is
  still no interface to mark a report as "read/resolved"
  other than editing `status` by hand via SQL (see `backend/README.md` →
  "Looking inside").

## Log
- 2026-11-21: 🤖 ROADMAP translated to English (language rule: projects in English or bilingual EN/IT). 🤖 the menu scraper also reads menus published as images (OCR with `tesseract`, `menuSource: "ocr"`, optional), with tests and `tesseract-ocr` in the workflow.
- 2026-11-14: 🤖 the menu scraper also reads menus published as PDFs (`pdftotext`, `menuSource: "pdf"`), with tests and a `poppler-utils` step in the workflow; image OCR still to do.
- 2026-11-07: 🤖 venue photo from Wikimedia Commons in the card (`enrich:photos`, `photoRef` in `fetch:osm`, author/licence attribution, parsing tests); coverage 23/4713.
- 2026-11-06: feedback now goes to the shared site-notes Worker (local queue until accepted), even without the prices backend; removed the prefilled GitHub issue; `/api/feedback` of the prices backend is no longer used by the site; site-notes deploy needed. canonical notes widget v2 (site-notes/widget): removed old button/modal/queue, migrated outbox and local notes of the store. notes widget aligned to the final version (key#field migration, dedupe), ?v=3.
- 2026-10-19: installable as a standalone app from the phone (manifest with its own name, icon and scope)
- 2026-10-18: FUTURE-ARCHITECTURE.md merged into ROADMAP.md (single protocol)
- 2026-10-18: 🤖 "re-check" badge on prices (measured or from menu) older than 12 months, computed at render time, plus `npm run check:stale`
- 2026-10-15: created the roadmap for Projects Overview
