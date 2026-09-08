# 🥙 Eating Amsterdam

Mappa collaborativa dei posti dove si mangia bene spendendo poco ad Amsterdam:
snackbar, döner, falafel, ristoranti economici. Filtri per prezzo, voto, tipo di
cucina e **opzioni vegetariane/vegane**.

Sito statico, senza backend e senza database: si può pubblicare gratis su GitHub Pages.

---

## Il nodo dei prezzi (e perché non si fa scraping di Google Maps)

Serve dirlo subito, perché condiziona tutto il resto:

| Dato | Da dove arriva |
|---|---|
| Nome, posizione, indirizzo, tipo di cucina, orari | **OpenStreetMap** (Overpass API) — gratis, senza chiave |
| Tag `diet:vegetarian` / `diet:vegan` | **OpenStreetMap** |
| Stelle e numero di recensioni | **Google Places API** (facoltativo, serve una chiave) |
| Fascia di prezzo `€`…`€€€€` | **Google Places API** (`priceLevel`) |
| **Prezzo del singolo piatto** | **gli utenti** — non esiste in nessuna API |

Due precisazioni:

1. **Lo scraping delle pagine di Google Maps non è una buona strada.** Viola i
   Termini di servizio di Google, l'HTML cambia di continuo e gli IP dei server
   vengono bloccati in fretta. La Places API fa la stessa cosa in modo lecito, con
   una quota gratuita mensile che per un progetto come questo basta e avanza.
2. **Nemmeno la Places API dà i prezzi.** Restituisce solo `priceLevel`, cioè una
   fascia da `€` a `€€€€`, non "il döner costa 7,50 €". Ecco perché il sito è
   costruito attorno ai prezzi inseriti dagli utenti: è l'unico modo per avere il
   dato che serve davvero, ed è anche la cosa che rende il progetto utile rispetto
   a Google Maps.

Nel sito ogni locale ha una scheda dove chiunque aggiunge `piatto → prezzo`. La
mappa mostra la **mediana** dei prezzi inseriti (la mediana, non la media, così un
singolo prezzo sbagliato non falsa tutto), e i marker sono colorati per fascia:
🟢 ≤ 10 € · 🟡 10–18 € · 🔴 > 18 € · ⚪ prezzo ancora ignoto.

---

## Provarlo in locale

```bash
npm run dev       # http://localhost:5173
```

Non serve installare nulla: nessuna dipendenza npm, Leaflet arriva da CDN.

Al primo avvio `data/places.json` è vuoto, quindi **il sito interroga Overpass
direttamente dal browser** e mette in cache il risultato per una settimana. Dopo
qualche secondo compaiono ~2000 locali di Amsterdam.

Per committare il dataset nel repo (così il sito carica istantaneamente e funziona
anche se Overpass è giù):

```bash
npm run fetch:osm
```

## Voti e fasce di prezzo da Google (facoltativo)

```bash
export GOOGLE_MAPS_API_KEY=...          # console.cloud.google.com → abilita "Places API (New)"
npm run enrich:google -- --limit 200    # a scaglioni, per tenere d'occhio la quota
```

Lo script abbina ogni locale OSM alla scheda Google più vicina entro 200 m e salva
`rating`, `reviews` e `priceLevel` dentro `data/places.json`. Senza chiave il sito
funziona lo stesso: mancano solo le stelle.

## Raccogliere i prezzi degli utenti

I contributi (prezzi, voti, note, preferiti, locali aggiunti a mano) sono salvati
nel `localStorage` del browser di chi li scrive. Dal pannello **⚙️ Dati** si
esportano in un file JSON; per farli diventare parte del dataset condiviso:

```bash
npm run merge:contributions -- contributi-di-alessio.json
git commit -am "prezzi: contributi di alessio"
```

C'è anche un [template di issue](.github/ISSUE_TEMPLATE/nuovo-prezzo.yml) per chi
preferisce segnalare un prezzo senza toccare il sito.

> Questo è il compromesso "zero backend": funziona subito e non costa niente, ma i
> prezzi diventano pubblici solo quando qualcuno fa il merge. Se un domani i
> contributi diventano tanti, il passo successivo è un piccolo backend (Cloudflare
> D1, Supabase…) che li raccolga direttamente: la struttura dati è già quella giusta.

## Pubblicare online

`Settings → Pages → Source: GitHub Actions`, poi ogni push su `main` pubblica il
sito ([workflow](.github/workflows/deploy-pages.yml)). Un secondo
[workflow](.github/workflows/refresh-osm.yml) riscarica i dati OSM ogni lunedì
mattina e committa le differenze.

---

## Com'è fatto

```
index.html                 struttura della pagina
assets/css/style.css       tema scuro, layout mappa + lista
assets/js/
  app.js                   avvio e collegamento dei pezzi
  data.js                  caricamento dataset, campi derivati (prezzo, voto)
  filters.js               raggruppamento cucine e logica dei filtri
  map.js                   Leaflet + cluster di marker
  ui.js                    lista, scheda locale, finestre di dialogo
  store.js                 contributi dell'utente (localStorage)
  hours.js                 "aperto ora" da opening_hours di OSM
scripts/
  osm-common.js            query Overpass e normalizzazione (usato da Node e dal browser)
  fetch-osm.mjs            popola data/places.json
  enrich-google.mjs        aggiunge stelle e fascia di prezzo
  merge-contributions.mjs  unisce i contributi esportati nel dataset
  serve.mjs                server statico per lo sviluppo
data/places.json           il dataset
```

### Idee per il seguito

- backend leggero per i prezzi condivisi, al posto dell'export manuale;
- "quanto spendo davvero": filtro su un piatto specifico (döner, kapsalon, menu);
- foto del menù con estrazione dei prezzi;
- segnalazione dei prezzi vecchi (> 12 mesi) da riverificare.

## Licenze

I dati dei locali vengono da OpenStreetMap, licenza
[ODbL](https://www.openstreetmap.org/copyright): l'attribuzione è già in mappa e va
mantenuta. I dati Google restano soggetti ai Termini di servizio di Google.
