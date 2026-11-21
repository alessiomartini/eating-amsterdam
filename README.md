# 🥙 Eating Amsterdam

A collaborative map of places where you can eat well on a budget in Amsterdam and
the surrounding area: snack bars, döner, falafel, cheap restaurants. It does not filter by type
of venue or cuisine, but by **what you want to drink or eat**: you pick one or
more items (coffee, beer, döner, pizza...) and the map shows only the venues that
have all of them, coloured by the total price of what you picked. Filters
also for rating, distance and **vegetarian/vegan options**.

The interface is in English; the code and these notes are in English too (or bilingual EN/IT).
Static site, no backend and no database: it can be published for free on GitHub Pages.

## The reference items

Instead of loose prices ("I paid 7.50"), every venue answers the same
questions, so that venues become comparable:

| to drink | to nibble | to sit down |
|---|---|---|
| cheapest coffee, beer, wine, cocktail | fries, croissant, döner, pizza, ice cream | cheapest pasta, first and second course |

Each item appears only where it makes sense: döner where döner is made, cocktail
not in a friet kiosk, pasta in an Italian place. The "cheapest dish of the venue", instead — a
pseudo-item that applied to any place — is gone:
it meant nothing for comparing two different venues,
exactly like filtering by cuisine type or venue category. You always pick
a concrete item, or nothing.

You can pick **more than one item together** ("I fancy coffee and beer"): the venue
appears only if it offers both (AND, not "almost"), and the price shown — also used
to sort and colour the markers — is the **simple sum** of the items
picked, not a weighted average: colours and ranking change depending on what
you picked, they are not a fixed number per venue.

Every price carries its own provenance, and the provenance is always
visible:

| | |
|---|---|
| **measured** | entered by someone who was there. This is the good data |
| **from menu** | read from the venue's website (`npm run scrape:menus`) |
| **estimated** | computed by us, shown with `≈` and in italics |

Estimates never enter the average of real prices and can be excluded from the
filters with "Real prices only". An estimate passed off as a real price would be
worse than no price.

### The student discount badge

Some venues give student discounts — 'Skek for example — but there is no
standard OpenStreetMap tag for it, and it appears in no API: only
people who have been there know it. So it is a report like prices, with the same rule:
the latest one wins, and **if reports contradict each other the contradiction is
shown** instead of silently letting the most recent win. The 🎓 badge appears
in the list and there is a matching filter.

The structure is generic (`flags` table): adding other boolean facts —
"cash only", "open late at night" — costs one entry in `assets/js/flags.js`
and one in the Worker.

### The history, as in fuel-price apps

For each item it shows **the last price entered**, not the average: prices
change and an average gets old. The full history can be consulted in the
venue's card.

If the last price differs too much from the previous ones (more than 60% above or 40% below,
with at least two prices before) a **`?`** mark appears: the price is
still shown, but saying that we are not sure. It may be a
typo, a different dish, or a real price rise — the next person who
passes by and enters theirs will settle it.

---

## The price problem (and why we do not scrape Google Maps)

This needs saying up front, because it shapes everything else:

| Data | Where it comes from |
|---|---|
| Name, position, address, cuisine type, opening hours | **OpenStreetMap** (Overpass API) — free, no key |
| `diet:vegetarian` / `diet:vegan` tags | **OpenStreetMap** |
| Stars and number of reviews | **Google Places API** (optional, needs a key) |
| Price band `€`…`€€€€` | **Google Places API** (`priceLevel`) |
| **Menu prices** | **the venue's website**, read by `scripts/scrape-menus.mjs` |
| **Price of the single dish** | **users** — the only truly reliable source |

Two clarifications:

1. **Scraping Google Maps pages is not a good route.** It violates Google's
   Terms of Service, the HTML changes constantly and server IPs
   get blocked quickly. The Places API does the same thing legally, with
   a monthly free quota that is more than enough for a project like this.
2. **Not even the Places API gives prices.** It returns only `priceLevel`, i.e.
   a band from `€` to `€€€€`, not "the döner costs €7.50". That is why the site is
   built around prices entered by users: it is the only way to get the
   data that is really needed, and it is also what makes the project useful compared to
   Google Maps.

When there are several prices for the same item the **median** is used, not the mean,
so a single wrong price does not distort everything. Markers are coloured by band:
🟢 ≤ €10 · 🟡 €10–18 · 🔴 > €18 · ⚪ price still unknown.

---

## What ends up on the map

Not only restaurants and fast food: also **bars, pubs and beer gardens**, because in
Amsterdam in the brown cafés and student bars you eat and drink
cheaply, which is the point of this site.

Venues that OpenStreetMap classifies as something else are left out — 'Skek is an
`amenity=pub` and is included, but Kriterion is an `amenity=cinema` and no query
by category will ever pick it up. For those there is `data/extra-places.json`: you
list the OSM id and the next refresh includes them.

To understand why a venue is missing:

```bash
node scripts/osm-lookup.mjs "Kriterion"
```

It prints the tags OSM knows, so you can see right away whether the problem is the query, the
bounding box, or that the venue is simply not on OSM. It is also available as a workflow,
to run it without having the project locally.

## Reports from the site

The **Feedback** button opens a text box, with attached what the
user was looking at (active filters, number of results, selected
venue): it avoids the classic "it doesn't work" with no idea what was
on screen.

The report goes to the shared `site-notes` Worker (same D1 as all the sites, write-only; it stays queued in the browser
until the server has accepted it); a copy stays in the writer's browser.

## Trying it locally

```bash
npm run dev       # http://localhost:5173
npm test          # unit tests of the opening-hours parser
```

Nothing to install: no npm dependencies, Leaflet comes from a CDN.

On first start `data/places.json` is empty, so **the site queries Overpass
directly from the browser** and caches the result for a week. After
a few seconds the venues of the area appear.

**What area it covers.** Not the municipal border but a wider rectangle
(`METRO_BBOX` in `scripts/osm-common.js`): Amsterdam plus Diemen, Amstelveen,
Ouder-Amstel, Badhoevedorp and the southern edge of Zaandam. For someone looking for a döner an
administrative border means nothing. To change it, just edit
those four coordinates.

To commit the dataset into the repo (so the site loads instantly and works
even if Overpass is down):

```bash
npm run fetch:osm
```

## Reading prices from menus

```bash
npm run scrape:menus -- --limit 300 --max-age 90
```

For each venue that has a website (2437 of the 4027 in the dataset) it reads the homepage and,
if that is not enough, a couple of pages that look like the menu. It recognises Dutch and English
price formats (`€ 3,50`, `3.50 euro`, `€12,-`), discards implausible values
— a coffee at €45 is a phone number, not a coffee — and for
first and second courses takes the cheapest dish of the section.

It behaves well: it identifies itself with a User-Agent, respects `robots.txt`, never makes
two requests at once to the same host and leaves a second between one page and
the next. It also records failed attempts, so as not to repeat them every week.

Many venues publish the menu only as a PDF: if the homepage or the menu pages
are not enough, the scraper follows at most two links to `.pdf` on the same host
that look like a menu (file name or text with menu/kaart/drinks/food…), downloads them
with the same rules (robots.txt, 10 MB cap) and extracts the text with
`pdftotext -layout` (`poppler-utils` package, no npm dependency). The text
goes through the same parser as the HTML; in the venue's `menu` there appears `menuSource: "pdf"`
and `menu.url` points to the PDF. Without `pdftotext` PDFs are skipped with a log line.
Same scheme for photographed menus: up to 2 `.jpg/.png/.webp` images on the same
host (link or `<img>`) whose name or text mentions menu/kaart/prijzen/drinks, read with
`tesseract` (eng+nld, child process, 8 MB cap; `tesseract-ocr` and
`tesseract-ocr-nld` packages) and passed through the same parser: `menuSource: "ocr"`. Without
`tesseract` it is skipped with a log line.

**It does not scrape Google Maps**: those pages are covered by Google's ToS,
change constantly and block datacenter IPs. Google's "euro symbol" is
obtained legally from the Places API, below.

## How an estimate is made

When for an item there is neither a measured price nor one from the menu, the site
estimates one (`assets/js/items.js`) starting from a typical Amsterdam price and
adjusting it with the available signals:

- Google's **price band** (`priceLevel`), if present: it is the best signal;
- otherwise the **type of venue** (a fast food costs less than a restaurant);
- the **area**, as distance from the Dam: centre, first ring, outskirts;
- the **rating**, with small weight: highly rated venues cost a bit more.

The result is a range, not a single number: when `priceLevel` is missing
the range widens, because that is the honest way of saying how little we know.
The starting numbers are a reasonable guess, not data: they exist to
be replaced by real prices as they arrive.

## Ratings and price bands from Google (optional)

```bash
export GOOGLE_MAPS_API_KEY=...          # console.cloud.google.com → enable "Places API (New)"
npm run enrich:google -- --limit 200    # in batches, to keep an eye on the quota
```

The script matches each OSM venue with the nearest Google listing within 200 m and saves
`rating`, `reviews` and `priceLevel` into `data/places.json`. Without a key the site
works all the same: only the stars are missing.

## Collecting users' prices

Contributions (prices, ratings, notes, favourites, venues added by hand) are saved
in the `localStorage` of the browser of whoever writes them. From the **⚙️ Data** panel they are
exported to a JSON file; to make them part of the shared dataset:

```bash
npm run merge:contributions -- contributi-di-alessio.json
git commit -am "prezzi: contributi di alessio"
```

There is also an [issue template](.github/ISSUE_TEMPLATE/nuovo-prezzo.yml) for those who
prefer to report a price without touching the site.

> This is the no-backend mode, which remains the default behaviour.
> With the backend switched on (`backend/`) prices become public the moment
> they are entered, and the export only serves to make a copy.

## Shared prices (backend)

With a Cloudflare Worker and a D1 database prices no longer stay in the
browser of whoever writes them: they are seen immediately on all devices. The instructions
are in [`backend/README.md`](backend/README.md): `npx wrangler login` and then
`npm run backend:setup`, which does everything else.

As long as `data/config.json` has `apiBase: null` the site works exactly as
before, so the backend can be switched on and off without touching the rest.

How the site behaves when it is on:

- a price entered goes straight to the server, and **if there is no network it stays
  queued** and goes out at the next load or as soon as the phone is back
  online. It is a site used on the street: it must not lose anything;
- opening a venue's card downloads the prices that arrived after the last
  synchronisation, so you immediately see what others have entered;
- the weekly workflow brings prices and reports into the repo
  (`data/places.json` and `data/feedback.json`): the site stays fast, works
  even with the Worker down, and the data is versioned.

## Publishing online

`Settings → Pages → Source: GitHub Actions`, then every push to `main` publishes the
site ([workflow](.github/workflows/deploy-pages.yml)). A second
[workflow](.github/workflows/refresh-osm.yml) re-downloads the OSM data every Monday
morning and commits the differences.

---

## How it is built

```
index.html                 page structure
assets/css/style.css       light/dark theme (follows the system, ☀/☾ button in topbar, choice in localStorage "ea-theme"), map + list layout
assets/js/
  app.js                   startup and wiring of the pieces
  data.js                  dataset loading, derived fields (price, rating)
  filters.js               filter logic: chosen items (AND), sum, sorting
  map.js                   Leaflet + marker clusters
  ui.js                    list, venue card, dialogs
  store.js                 user contributions (localStorage)
  hours.js                 "open now" from OSM's opening_hours
  items.js                 the reference items and the estimates
scripts/menu-parse.js      price extraction from HTML (no network)
scripts/osm-lookup.mjs     how a venue is tagged on OSM (diagnosis)
scripts/stamp-version.mjs  stamps the assets to invalidate the cache
data/extra-places.json     venues to include by hand, by OSM id
data/config.json           backend URL (null = everything local)
scripts/sync-backend.mjs   brings prices and reports from the backend into the repo
backend/                   Cloudflare Worker + D1 schema + instructions
scripts/scrape-menus.mjs   menu scraper from the venues' websites
tests/                     `npm test` — hours and menu parser, items and filters
scripts/
  osm-common.js            covered area, Overpass query and normalisation
                           (shared between the Node script and the browser)
  fetch-osm.mjs            populates data/places.json
  enrich-google.mjs        adds stars and price band
  merge-contributions.mjs  merges exported contributions into the dataset
  serve.mjs                static server for development
data/places.json           the dataset
```

### Ideas for what comes next

The backend for shared prices already exists (section above). For ideas not
yet realised and proposals under consideration see
[`ROADMAP.md`](ROADMAP.md).

## Licences

Venue data comes from OpenStreetMap, licence
[ODbL](https://www.openstreetmap.org/copyright): the attribution is already on the map and must be
kept. Google data remains subject to Google's Terms of Service.
