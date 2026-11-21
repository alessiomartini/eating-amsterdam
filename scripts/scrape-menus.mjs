#!/usr/bin/env node
// Legge i prezzi dai siti dei locali e li scrive in data/places.json.
//
//   npm run scrape:menus -- --limit 300 --max-age 90
//
// Perché i siti dei locali e non Google Maps: le pagine di Maps sono coperte dai
// ToS di Google, cambiano di continuo e bloccano gli IP dei datacenter. Il menu
// che un locale pubblica sul proprio sito è invece materiale pubblico, e lì i
// prezzi ci sono davvero. Rispettiamo robots.txt, ci identifichiamo, andiamo piano.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hasPdftotext, pdfToText } from './pdf-text.js';
import { hasTesseract, imageToText } from './ocr-text.js';
import { extractItems, extractItemsFromText, findMenuLinks, findPdfMenuLinks, findImageMenuLinks, isAllowedByRobots } from './menu-parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'places.json');

const USER_AGENT = 'eating-amsterdam/0.1 (+https://github.com/alessiomartini/eating-amsterdam)';
const TIMEOUT_MS = 12000;
const MAX_BYTES = 1_500_000;
const MAX_PDF_BYTES = 10_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const PER_HOST_DELAY_MS = 1200;
const CONCURRENCY = 6;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const limit = Number(arg('limit', 200));
const maxAgeDays = Number(arg('max-age', 90));

const log = (line) => process.stderr.write(`${line}\n`);

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('text/plain')) return null;
    if (Number(res.headers.get('content-length')) > MAX_BYTES) return null;
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// pdftotext (poppler) è un programma di sistema: se manca, i PDF si saltano.
if (!hasPdftotext) log('pdftotext non trovato: i menu in PDF vengono saltati.');

async function getPdf(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('pdf') && !type.includes('octet-stream')) return null;
    if (Number(res.headers.get('content-length')) > MAX_PDF_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES || buf.subarray(0, 5).toString() !== '%PDF-') return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// tesseract è opzionale: se manca, le immagini dei menu si saltano.
if (!hasTesseract) log('tesseract non trovato: i menu come immagine vengono saltati.');

async function getImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/png,image/webp' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_IMAGE_BYTES ? null : buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const robotsCache = new Map();
async function allowed(url) {
  const { origin, pathname } = new URL(url);
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, getText(`${origin}/robots.txt`).catch(() => null));
  }
  return isAllowedByRobots(await robotsCache.get(origin), pathname, USER_AGENT);
}

/** Homepage più, se serve ancora qualcosa, un paio di pagine che sembrano il menu. */
async function scrapePlace(place) {
  const home = place.website.startsWith('http') ? place.website : `https://${place.website}`;
  if (!(await allowed(home))) return { url: home, skipped: 'robots.txt', items: {} };

  const html = await getText(home);
  if (!html) return { url: home, skipped: 'unreachable', items: {} };

  let items = extractItems(html);
  let sourceUrl = home;

  const enough = () => Object.keys(items).length >= 3;
  if (!enough()) {
    for (const link of findMenuLinks(html, home)) {
      await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS));
      if (!(await allowed(link))) continue;
      const page = await getText(link);
      if (!page) continue;
      const more = extractItems(page);
      // il prezzo più basso vince: le pagine di menu sono più affidabili della homepage
      for (const [id, price] of Object.entries(more)) {
        if (items[id] == null || price < items[id]) {
          items[id] = price;
          sourceUrl = link;
        }
      }
      if (enough()) break;
    }
  }

  // ancora poco: molti siti pubblicano il menu solo come PDF
  let menuSource;
  if (hasPdftotext && !enough()) {
    const pdfLinks = findPdfMenuLinks(html, home);
    for (const link of pdfLinks) {
      await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS));
      if (!(await allowed(link))) continue;
      const buf = await getPdf(link);
      if (!buf) continue;
      const text = await pdfToText(buf);
      if (!text) continue;
      for (const [id, price] of Object.entries(extractItemsFromText(text))) {
        if (items[id] == null || price < items[id]) {
          items[id] = price;
          sourceUrl = link;
          menuSource = 'pdf';
        }
      }
      if (enough()) break;
    }
  }

  // ancora poco: menu fotografato, letto con l'OCR (se tesseract c'è)
  if (hasTesseract && !enough()) {
    for (const link of findImageMenuLinks(html, home)) {
      await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS));
      if (!(await allowed(link))) continue;
      const buf = await getImage(link);
      if (!buf) continue;
      const text = await imageToText(buf);
      if (!text) continue;
      for (const [id, price] of Object.entries(extractItemsFromText(text))) {
        if (items[id] == null || price < items[id]) {
          items[id] = price;
          sourceUrl = link;
          menuSource = 'ocr';
        }
      }
      if (enough()) break;
    }
  }

  return { url: sourceUrl, items, ...(menuSource && { menuSource }) };
}

/** Esegue i lavori a gruppi, senza mai due richieste in parallelo sullo stesso host. */
async function runPool(jobs, worker) {
  const queue = [...jobs];
  const busyHosts = new Set();
  const deferred = [];

  const next = async () => {
    while (queue.length) {
      const job = queue.shift();
      let host;
      try {
        host = new URL(job.website.startsWith('http') ? job.website : `https://${job.website}`).hostname;
      } catch {
        continue; // website malformato nei dati OSM
      }
      if (busyHosts.has(host)) {
        deferred.push(job);
        continue;
      }
      busyHosts.add(host);
      try {
        await worker(job);
      } finally {
        busyHosts.delete(host);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  if (deferred.length) {
    queue.push(...deferred);
    await next();
  }
}

const doc = JSON.parse(await readFile(FILE, 'utf8'));
const cutoff = Date.now() - maxAgeDays * 864e5;

const todo = doc.places
  .filter((p) => p.website)
  .filter((p) => !p.menu?.scrapedAt || Date.parse(p.menu.scrapedAt) < cutoff)
  .slice(0, limit);

log(`${todo.length} locali con sito da leggere (su ${doc.places.filter((p) => p.website).length} che ne hanno uno).`);

let withPrices = 0;
let done = 0;

await runPool(todo, async (place) => {
  const result = await scrapePlace(place).catch(() => ({ url: place.website, items: {} }));
  const count = Object.keys(result.items).length;
  if (count) {
    withPrices += 1;
    log(`  ✓ ${place.name}: ${Object.entries(result.items).map(([k, v]) => `${k} €${v}`).join(', ')}`);
  }
  // registriamo anche i tentativi a vuoto, così non li ripetiamo ogni settimana
  place.menu = {
    url: result.url,
    scrapedAt: new Date().toISOString(),
    items: result.items,
    ...(result.menuSource && { menuSource: result.menuSource }),
  };
  done += 1;
  if (done % 50 === 0) log(`  …${done}/${todo.length}`);
});

doc.updatedAt = new Date().toISOString().slice(0, 10);
await writeFile(FILE, `${JSON.stringify(doc, null, 2)}\n`);

const total = doc.places.filter((p) => p.menu && Object.keys(p.menu.items).length).length;
process.stdout.write(`Letti prezzi da ${withPrices}/${todo.length} siti in questo giro. Locali con almeno un prezzo da menu: ${total}.\n`);
