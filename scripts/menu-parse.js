// Estrazione dei prezzi dal testo di una pagina di menu.
// Funzioni pure, senza rete: è la parte che va davvero testata.
// I menu di Amsterdam sono in olandese o in inglese, spesso mescolati.

/** Parole che identificano una voce, in ordine: la più specifica per prima. */
export const ITEM_KEYWORDS = {
  coffee: ['espresso', 'koffie', 'coffee', 'americano', 'filterkoffie', 'lungo'],
  beer: ['pils', 'biertje', 'bier ', 'bier\t', 'draught', 'draft beer', 'beer ', 'tap bier'],
  doner: ['döner', 'doner', 'kebab', 'shoarma', 'shawarma', 'gyros'],
  pizza: ['margherita', 'margarita', 'pizza'],
};

/** Sezioni di menu da cui prendere il piatto più economico. */
export const SECTION_KEYWORDS = {
  first: ['voorgerecht', 'voorgerechten', 'starter', 'starters', 'antipasti', 'soep', 'soup', 'small plates'],
  main: ['hoofdgerecht', 'hoofdgerechten', 'main course', 'main courses', 'mains', 'secondi', 'from the grill'],
};

// Ci sono prezzi che, se estratti, sarebbero palesemente sbagliati: un caffè a
// 45 € è un numero di telefono o un anno, non un prezzo. Ogni voce ha i suoi limiti.
export const PLAUSIBLE = {
  coffee: [1, 8],
  beer: [2, 14],
  doner: [3, 22],
  pizza: [5, 30],
  // sotto queste soglie non è un piatto, è una bevanda finita nella sezione sbagliata
  first: [3.5, 30],
  main: [7, 60],
};

/** Altre intestazioni di menu: servono a capire dove finisce una sezione. */
const OTHER_HEADINGS = [
  'drank', 'dranken', 'drinks', 'beverage', 'bier', 'wijn', 'wine', 'cocktail', 'koffie', 'thee',
  'dessert', 'nagerecht', 'toetje', 'sweet', 'ijs',
  'bijgerecht', 'side', 'sides', 'salade', 'saus', 'sauzen',
  'kinder', 'kids', 'lunch', 'ontbijt', 'breakfast', 'borrel', 'snack', 'bites',
  'pizza', 'pasta', 'sushi', 'wok', 'menu van', 'specials', 'extra',
];

// Una sezione lunghissima è il sintomo di un'intestazione di fine mai trovata:
// meglio fermarsi che raccogliere mezzo menu.
const MAX_SECTION_LINES = 40;

// Nei menu gli accenti sono spesso scritti come entità ("D&ouml;ner"): sostituirle
// con uno spazio spezzerebbe la parola e la parola chiave non corrisponderebbe più.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', deg: '°',
  ouml: 'ö', uuml: 'ü', auml: 'ä', Ouml: 'Ö', Uuml: 'Ü', Auml: 'Ä', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', aacute: 'á', acirc: 'â',
  ccedil: 'ç', ntilde: 'ñ', iuml: 'ï', icirc: 'î', ocirc: 'ô', oacute: 'ó', uacute: 'ú',
  ugrave: 'ù', ucirc: 'û', oslash: 'ø', aring: 'å', aelig: 'æ',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', ndash: '–', mdash: '—',
  hellip: '…', middot: '·', bull: '·', times: '×', frac12: '½',
};

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+\d*);/gi, (whole, name) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? '');
}

/** Converte l'HTML in testo riga per riga, che è come i menu vanno letti. */
export function htmlToLines(html) {
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean);
}

// "€ 3,50" · "3.50" · "€3,-" (forma olandese per "3 euro tondi") · "12,50 euro"
const PRICE_RE = /(?:€|eur\b)?\s*(\d{1,3})(?:[.,](\d{2})|[.,](-))(?:\s*(?:€|euro\b))?/gi;

/** Tutti i prezzi plausibili presenti in una riga. */
export function pricesIn(line) {
  const found = [];
  for (const match of line.matchAll(PRICE_RE)) {
    const [whole, euros, cents, dash] = match;
    // senza simbolo dell'euro accettiamo solo il formato con i centesimi,
    // altrimenti "pizza 4,-" e "tel 020 123" diventano indistinguibili
    const hasCurrency = /€|eur/i.test(whole);
    if (dash && !hasCurrency) continue;
    const amount = Number(euros) + (dash ? 0 : Number(cents) / 100);
    if (amount > 0) found.push(amount);
  }
  return found;
}

const inRange = (amount, itemId) => {
  const [min, max] = PLAUSIBLE[itemId];
  return amount >= min && amount <= max;
};

/** Il prezzo di una voce: il più basso fra quelli su righe che la nominano. */
export function findItemPrice(lines, itemId) {
  const keywords = ITEM_KEYWORDS[itemId];
  if (!keywords) return null;
  let best = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) continue;
    for (const amount of pricesIn(line)) {
      if (inRange(amount, itemId) && (best === null || amount < best)) best = amount;
    }
  }
  return best;
}

/**
 * Il piatto più economico di una sezione: si parte dall'intestazione e si legge
 * finché non ne comincia un'altra. Le intestazioni sono righe corte senza prezzo.
 */
export function findSectionPrice(lines, sectionId) {
  const keywords = SECTION_KEYWORDS[sectionId];
  const otherKeywords = [
    ...Object.entries(SECTION_KEYWORDS).filter(([id]) => id !== sectionId).flatMap(([, w]) => w),
    ...OTHER_HEADINGS,
  ];

  let best = null;
  let inSection = false;
  let linesInSection = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeading = line.length < 40 && pricesIn(line).length === 0;

    if (isHeading && keywords.some((k) => lower.includes(k))) {
      inSection = true;
      linesInSection = 0;
      continue;
    }
    if (!inSection) continue;

    if (isHeading && otherKeywords.some((k) => lower.includes(k))) {
      inSection = false;
      continue;
    }
    if (++linesInSection > MAX_SECTION_LINES) {
      inSection = false;
      continue;
    }

    for (const amount of pricesIn(line)) {
      if (inRange(amount, sectionId) && (best === null || amount < best)) best = amount;
    }
  }
  return best;
}

/** Tutte le voci ricavabili da una pagina. */
export function extractItems(html) {
  const lines = htmlToLines(html);
  const items = {};
  for (const itemId of Object.keys(ITEM_KEYWORDS)) {
    const price = findItemPrice(lines, itemId);
    if (price !== null) items[itemId] = price;
  }
  for (const sectionId of Object.keys(SECTION_KEYWORDS)) {
    const price = findSectionPrice(lines, sectionId);
    if (price !== null) items[sectionId] = price;
  }

  // un secondo che costa meno di un primo vuol dire che abbiamo sbagliato
  // sezione: non sapendo quale delle due, si buttano entrambe
  if (items.first != null && items.main != null && items.main < items.first) {
    delete items.first;
    delete items.main;
  }
  return items;
}

/** Link che promettono di essere la pagina del menu. */
export function findMenuLinks(html, baseUrl) {
  const wanted = /menu|menukaart|kaart|prijzen|prices|eten|drinken|gerechten/i;
  const links = new Set();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const [, href, label] = match;
    if (!wanted.test(href) && !wanted.test(label.replace(/<[^>]+>/g, ''))) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      if (url.hostname !== new URL(baseUrl).hostname) continue; // niente giri su altri siti
      url.hash = '';
      links.add(url.toString());
    } catch { /* href malformato */ }
  }
  return [...links].slice(0, 3);
}

/** Parser minimo di robots.txt per il gruppo User-agent che ci riguarda. */
export function isAllowedByRobots(robotsTxt, path, userAgent = 'eating-amsterdam') {
  if (!robotsTxt) return true;
  const groups = [];
  let current = null;

  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }

  const agent = userAgent.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => agent.includes(a) && a !== '*'))
    ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  // vince la regola col percorso più lungo, come da convenzione
  let decision = true;
  let longest = -1;
  for (const rule of group.rules) {
    if (rule.path === '') continue;
    if (!path.startsWith(rule.path)) continue;
    if (rule.path.length > longest) {
      longest = rule.path.length;
      decision = rule.allow;
    }
  }
  return decision;
}
