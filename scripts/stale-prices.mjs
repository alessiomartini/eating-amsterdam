// Elenca i locali con prezzi da menu più vecchi di 12 mesi (da riverificare).
// I prezzi della community stanno nel Worker, non nel repo: quelli li segnala la UI.
// Uso: npm run check:stale
import { readFileSync } from 'node:fs';
import { isStale } from '../assets/js/items.js';

const places = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8')).places;
const list = Array.isArray(places) ? places : Object.values(places);
const stale = list.filter((p) => p.menu?.items && Object.keys(p.menu.items).length && isStale(p.menu.scrapedAt));
for (const p of stale) console.log(`${p.id ?? ''}\t${p.name ?? ''}\tmenu del ${p.menu.scrapedAt.slice(0, 10)}`);
console.log(`${stale.length} locali con prezzi da menu più vecchi di 12 mesi su ${list.length}.`);
