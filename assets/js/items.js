// Le voci di riferimento: invece di prezzi sciolti ("ho pagato 7,50"), ogni
// locale risponde alle stesse domande, così i locali diventano confrontabili.
//
// Ogni voce può avere tre provenienze, in ordine di fiducia decrescente:
//   measured  prezzo inserito da una persona che era lì
//   menu      prezzo letto dal sito del locale (scripts/scrape-menus.mjs)
//   estimate  stima nostra, calcolata dai segnali indiretti (vedi estimate())
// La provenienza viaggia sempre insieme al numero e viene mostrata: una stima
// spacciata per prezzo reale sarebbe peggio di nessun prezzo.

// In ordine: da bere, da spizzicare, da sedersi.
export const REFERENCE_ITEMS = [
  { id: 'coffee', label: 'Coffee', hint: 'espresso or filter', icon: '☕' },
  { id: 'beer', label: 'Beer', hint: 'small draught, 0.25–0.33 l', icon: '🍺' },
  { id: 'cocktail', label: 'Cheapest cocktail', hint: 'from the cocktail list', icon: '🍸' },
  { id: 'fries', label: 'Fries', hint: 'friet or patat, medium', icon: '🍟' },
  { id: 'doner', label: 'Döner kebab', hint: 'in pita or bread', icon: '🥙' },
  { id: 'pizza', label: 'Pizza', hint: 'margherita or cheapest', icon: '🍕' },
  { id: 'icecream', label: 'Ice cream', hint: 'one scoop or a small cone', icon: '🍦' },
  { id: 'first', label: 'Cheapest first course', hint: 'starter, soup, pasta', icon: '🥗' },
  { id: 'main', label: 'Cheapest main course', hint: 'cheapest full dish', icon: '🍽️' },
];

export const ITEM_BY_ID = Object.fromEntries(REFERENCE_ITEMS.map((i) => [i.id, i]));

const DONER_CUISINES = new Set(['kebab', 'doner', 'döner', 'turkish', 'shawarma', 'gyros']);
const PIZZA_CUISINES = new Set(['pizza', 'italian']);
const COFFEE_CUISINES = new Set(['coffee_shop', 'coffee', 'cake', 'bakery', 'sandwich', 'breakfast']);
const FRIES_CUISINES = new Set(['friture', 'chips', 'french_fries', 'fries', 'snack', 'snack_bar', 'fish_and_chips', 'burger']);
const ICECREAM_CUISINES = new Set(['ice_cream', 'gelato', 'frozen_yogurt']);

/** Un döner da un ristorante francese non ha senso: chiediamo solo il pertinente. */
export function itemApplies(itemId, place) {
  const cuisines = new Set(place.cuisines ?? []);
  const isRestaurant = place.category === 'restaurant' || place.category === 'food_court';
  const isBar = place.category === 'bar' || place.category === 'pub' || place.category === 'biergarten';
  const servesMeals = isRestaurant || place.category === 'fast_food' || isBar;

  switch (itemId) {
    // gli snackbar olandesi il caffè lo fanno quasi sempre
    case 'coffee':
      return place.category === 'cafe' || servesMeals || [...cuisines].some((c) => COFFEE_CUISINES.has(c));
    // la birra invece raramente: chiederla a un fast food produrrebbe solo rumore
    case 'beer':
    case 'cocktail':
      return place.category === 'cafe' || isRestaurant || isBar;
    // la friggitoria è roba da snackbar e da pub, non da ristorante
    case 'fries':
      return place.category === 'fast_food' || place.category === 'food_court'
        || place.category === 'pub' || [...cuisines].some((c) => FRIES_CUISINES.has(c));
    case 'icecream':
      return place.category === 'ice_cream' || place.category === 'cafe'
        || [...cuisines].some((c) => ICECREAM_CUISINES.has(c));
    case 'doner':
      return [...cuisines].some((c) => DONER_CUISINES.has(c));
    case 'pizza':
      return [...cuisines].some((c) => PIZZA_CUISINES.has(c));
    // l'antipasto è un concetto da ristorante; il "piatto più economico" no:
    // in un posto da falafel è la voce che conta di più
    case 'first':
      return isRestaurant;
    case 'main':
      return servesMeals;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ stima */

// Prezzi tipici ad Amsterdam per un locale di fascia media (priceLevel 2), in euro.
// Sono il punto di partenza di una stima, non un dato: esistono per essere
// corretti dai prezzi veri man mano che arrivano.
const BASE_EUR = {
  coffee: 3.2, beer: 5.2, cocktail: 12.0, fries: 3.6,
  doner: 8.0, pizza: 12.0, icecream: 2.6, first: 9.0, main: 19.0,
};

const PRICE_LEVEL_FACTOR = { 1: 0.78, 2: 1, 3: 1.28, 4: 1.7 };

const DAM_SQUARE = { lat: 52.3731, lon: 4.8926 };

function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Il centro costa più della periferia: distanza dalla Dam come proxy della zona. */
function zoneFactor(place) {
  const d = km(DAM_SQUARE, place);
  if (d < 1) return { factor: 1.12, label: 'city centre' };
  if (d < 2.5) return { factor: 1.04, label: 'inner ring' };
  if (d < 6) return { factor: 1, label: 'outer city' };
  return { factor: 0.92, label: 'suburbs' };
}

/** Senza priceLevel di Google ricadiamo sul tipo di locale, che è un proxy grezzo. */
function tierFactor(place) {
  const level = place.google?.priceLevel;
  if (level && PRICE_LEVEL_FACTOR[level]) {
    return { factor: PRICE_LEVEL_FACTOR[level], label: `Google price level ${'€'.repeat(level)}`, confident: true };
  }
  if (place.category === 'fast_food') return { factor: 0.8, label: 'fast food', confident: false };
  if (place.category === 'cafe') return { factor: 0.9, label: 'café', confident: false };
  if (place.category === 'bar' || place.category === 'pub') return { factor: 0.9, label: 'bar', confident: false };
  return { factor: 1, label: 'no price signal', confident: false };
}

/**
 * Stima il prezzo di una voce. Restituisce un intervallo, non un numero secco:
 * la larghezza dell'intervallo è il modo onesto di dire quanto ne sappiamo poco.
 */
export function estimate(itemId, place) {
  if (!itemApplies(itemId, place)) return null;
  const base = BASE_EUR[itemId];
  if (!base) return null;

  const tier = tierFactor(place);
  const zone = zoneFactor(place);
  const basis = [tier.label, zone.label];

  let factor = tier.factor * zone.factor;

  // un voto molto alto si accompagna spesso a prezzi un po' più alti: segnale
  // debole, peso piccolo, e lo diciamo solo quando c'è
  if (place.google?.rating >= 4.5) {
    factor *= 1.04;
    basis.push('highly rated');
  }

  const mid = base * factor;
  const spread = tier.confident ? 0.16 : 0.28;
  const round = (n) => Math.round(n * 20) / 20; // al multiplo di 5 centesimi

  return {
    amount: round(mid),
    low: round(mid * (1 - spread)),
    high: round(mid * (1 + spread)),
    confidence: tier.confident ? 'medium' : 'low',
    basis,
  };
}

/* ------------------------------------------------------- aggregazione */

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Quanto l'ultimo prezzo può discostarsi dai precedenti prima di essere sospetto.
// I prezzi salgono, quindi tolleriamo di più verso l'alto che verso il basso.
const SUSPICIOUS_ABOVE = 1.6;
const SUSPICIOUS_BELOW = 0.6;

/**
 * Come nelle app dei prezzi dei carburanti: vale l'ultimo prezzo inserito, non
 * la media, perché i prezzi cambiano e la media invecchia. Ma un prezzo molto
 * diverso dai precedenti può essere un errore di battitura o un piatto diverso,
 * quindi lo si mostra segnalando che non ne siamo sicuri, senza nasconderlo.
 */
export function summarisePrices(prices) {
  const sorted = [...prices]
    .filter((p) => Number.isFinite(p.amount))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  if (!sorted.length) return null;

  const latest = sorted[sorted.length - 1];
  const previous = sorted.slice(0, -1).map((p) => p.amount);
  const reference = previous.length >= 2 ? median(previous) : null;

  const uncertain = reference !== null
    && (latest.amount > reference * SUSPICIOUS_ABOVE || latest.amount < reference * SUSPICIOUS_BELOW);

  return {
    amount: latest.amount,
    date: latest.date ?? null,
    by: latest.by ?? null,
    samples: sorted.length,
    history: sorted,
    uncertain,
    reference: uncertain ? reference : null,
  };
}

/**
 * Costruisce la tabella delle voci per un locale, scegliendo per ognuna la
 * fonte migliore disponibile. `prices` sono i prezzi misurati (miei + community).
 */
export function buildItems(place, prices) {
  const table = {};

  for (const { id } of REFERENCE_ITEMS) {
    // Un prezzo vero vale più della nostra regola: se il menu di un caffè elenca
    // dei primi, quel caffè i primi li fa, e la regola è solo un'euristica.
    // L'euristica decide invece cosa ha senso stimare e cosa chiedere all'utente.
    const measured = summarisePrices(prices.filter((p) => p.item === id));
    if (measured) {
      table[id] = { ...measured, source: 'measured' };
      continue;
    }

    const fromMenu = place.menu?.items?.[id];
    if (Number.isFinite(fromMenu)) {
      table[id] = { amount: fromMenu, source: 'menu', sourceUrl: place.menu.url ?? null, date: place.menu.scrapedAt?.slice(0, 10) ?? null };
      continue;
    }

    if (!itemApplies(id, place)) continue;
    const guess = estimate(id, place);
    if (guess) table[id] = { ...guess, source: 'estimate' };
  }

  return table;
}
