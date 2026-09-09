# 🥙 Eating Amsterdam

Mappa collaborativa dei posti dove si mangia bene spendendo poco ad Amsterdam e
dintorni: snackbar, döner, falafel, ristoranti economici. Filtri per prezzo, voto, tipo di
cucina e **opzioni vegetariane/vegane**.

L'interfaccia è in inglese; il codice e questi appunti restano in italiano.
Sito statico, senza backend e senza database: si può pubblicare gratis su GitHub Pages.

## Le sei voci di riferimento

Invece di prezzi sciolti ("ho pagato 7,50"), ogni locale risponde alle stesse sei
domande, così i locali diventano confrontabili: **caffè, birra, döner, pizza,
primo più economico, secondo più economico**. Ogni voce compare solo dove ha
senso — il döner solo dove si fa il döner, la birra non nei fast food.

Ogni prezzo porta con sé la propria provenienza, e la provenienza è sempre
visibile:

| | |
|---|---|
| **misurato** | l'ha inserito qualcuno che era lì. È il dato buono |
| **da menu** | letto dal sito del locale (`npm run scrape:menus`) |
| **stimato** | calcolato da noi, mostrato con `≈` e in corsivo |

Le stime non entrano mai nella media dei prezzi reali e si possono escludere dai
filtri con "Real prices only". Una stima spacciata per prezzo vero sarebbe
peggio di nessun prezzo.

---

## Il nodo dei prezzi (e perché non si fa scraping di Google Maps)

Serve dirlo subito, perché condiziona tutto il resto:

| Dato | Da dove arriva |
|---|---|
| Nome, posizione, indirizzo, tipo di cucina, orari | **OpenStreetMap** (Overpass API) — gratis, senza chiave |
| Tag `diet:vegetarian` / `diet:vegan` | **OpenStreetMap** |
| Stelle e numero di recensioni | **Google Places API** (facoltativo, serve una chiave) |
| Fascia di prezzo `€`…`€€€€` | **Google Places API** (`priceLevel`) |
| **Prezzi del menu** | **il sito del locale**, letto da `scripts/scrape-menus.mjs` |
| **Prezzo del singolo piatto** | **gli utenti** — è l'unica fonte davvero affidabile |

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

Quando ci sono più prezzi per la stessa voce si usa la **mediana**, non la media,
così un singolo prezzo sbagliato non falsa tutto. I marker sono colorati per fascia:
🟢 ≤ 10 € · 🟡 10–18 € · 🔴 > 18 € · ⚪ prezzo ancora ignoto.

---

## Provarlo in locale

```bash
npm run dev       # http://localhost:5173
npm test          # test unitari del parser degli orari
```

Non serve installare nulla: nessuna dipendenza npm, Leaflet arriva da CDN.

Al primo avvio `data/places.json` è vuoto, quindi **il sito interroga Overpass
direttamente dal browser** e mette in cache il risultato per una settimana. Dopo
qualche secondo compaiono i locali della zona.

**Che zona copre.** Non il confine comunale ma un rettangolo più largo
(`METRO_BBOX` in `scripts/osm-common.js`): Amsterdam più Diemen, Amstelveen,
Ouder-Amstel, Badhoevedorp e il bordo sud di Zaandam. Per chi cerca un döner un
confine amministrativo non vuole dire niente. Per cambiarla basta modificare
quelle quattro coordinate.

Per committare il dataset nel repo (così il sito carica istantaneamente e funziona
anche se Overpass è giù):

```bash
npm run fetch:osm
```

## Leggere i prezzi dai menu

```bash
npm run scrape:menus -- --limit 300 --max-age 90
```

Per ogni locale che ha un sito (2437 sui 4027 del dataset) legge la homepage e,
se non basta, un paio di pagine che sembrano il menu. Riconosce i formati di
prezzo olandesi e inglesi (`€ 3,50`, `3.50 euro`, `€12,-`), scarta i valori
implausibili — un caffè a 45 € è un numero di telefono, non un caffè — e per
primi e secondi prende il piatto più economico della sezione.

Si comporta bene: si identifica con uno User-Agent, rispetta `robots.txt`, non fa
mai due richieste insieme sullo stesso host e lascia un secondo fra una pagina e
l'altra. Registra anche i tentativi a vuoto, per non ripeterli ogni settimana.

**Non fa scraping di Google Maps**: quelle pagine sono coperte dai ToS di Google,
cambiano di continuo e bloccano gli IP dei datacenter. Il "simbolo dell'euro" di
Google si ottiene in modo lecito dalla Places API, qui sotto.

## Come nasce una stima

Quando per una voce non c'è né un prezzo misurato né uno dal menu, il sito ne
stima uno (`assets/js/items.js`) partendo da un prezzo tipico di Amsterdam e
correggendolo con i segnali disponibili:

- la **fascia di prezzo di Google** (`priceLevel`), se c'è: è il segnale migliore;
- altrimenti il **tipo di locale** (un fast food costa meno di un ristorante);
- la **zona**, come distanza dalla Dam: centro, prima cintura, periferia;
- il **voto**, con peso piccolo: i locali molto votati costano un po' di più.

Il risultato è un intervallo, non un numero secco: quando manca `priceLevel`
l'intervallo si allarga, perché è il modo onesto di dire quanto ne sappiamo poco.
I numeri di partenza sono un'ipotesi ragionevole, non un dato: esistono per
essere sostituiti dai prezzi veri man mano che arrivano.

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
  items.js                 le sei voci di riferimento e le stime
scripts/menu-parse.js      estrazione dei prezzi dall'HTML (senza rete)
scripts/scrape-menus.mjs   scraper dei menu dai siti dei locali
tests/                     `npm test` — parser degli orari e dei menu
scripts/
  osm-common.js            zona coperta, query Overpass e normalizzazione
                           (condiviso fra lo script Node e il browser)
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
