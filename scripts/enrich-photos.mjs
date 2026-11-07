#!/usr/bin/env node
// Aggiunge a data/places.json una foto del locale da Wikimedia Commons.
//   npm run enrich:photos [-- --limit N] [-- --refresh]
// Nessuna API key. Parte dai riferimenti Wikimedia presenti nei tag OSM
// (place.photoRef: wikidata, wikimedia_commons, image); ordine di preferenza:
// file indicato in OSM > immagine P18 di Wikidata > primo file della categoria Commons.
// Salva solo URL della miniatura + autore + licenza + pagina del file: nessuna
// immagine nel repo. Un errore su un locale non ferma il giro.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  fileTitleFromRef, categoryFromRef, categoryMatchesName, parseWikidataImages, parseCategoryFirstFile, parseImageInfo,
} from './commons.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'places.json');
const USER_AGENT = 'eating-amsterdam/0.1 (+https://github.com/alessiomartini/eating-amsterdam)';
const DELAY_MS = 1000;
const TIMEOUT_MS = 20000;
const THUMB_WIDTH = 640;

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity;
const refresh = args.includes('--refresh');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => process.stderr.write(`${line}\n`);

async function api(host, params, attempt = 1) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '1', ...params })}`;
  await sleep(DELAY_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(attempt * 5000);
      return api(host, params, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'TimeoutError' && attempt < 3) return api(host, params, attempt + 1);
    throw err;
  }
}

const commons = (params) => api('commons.wikimedia.org', params);
const imageInfo = async (title) => parseImageInfo(await commons({
  action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: String(THUMB_WIDTH), redirects: '1', titles: title,
}));

const doc = JSON.parse(await readFile(FILE, 'utf8'));
const candidates = doc.places.filter((p) => p.photoRef && (refresh || !p.photo));
log(`${doc.places.filter((p) => p.photoRef).length} locali con riferimenti Wikimedia, ${candidates.length} da risolvere`);

// P18 per tutti i Q-id in blocchi da 50 (una richiesta ogni 50 locali)
const p18 = {};
const qids = [...new Set(candidates.map((p) => p.photoRef.wikidata).filter(Boolean))];
for (let i = 0; i < qids.length; i += 50) {
  try {
    Object.assign(p18, parseWikidataImages(await api('www.wikidata.org', {
      action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'claims',
    })));
  } catch (err) {
    log(`  wikidata fallito: ${err.message}`);
  }
}

let done = 0;
let withPhoto = 0;
for (const place of candidates) {
  if (done >= limit) break;
  done += 1;
  const { wikidata, commons: commonsRef, image } = place.photoRef;
  try {
    const titles = [fileTitleFromRef(commonsRef), fileTitleFromRef(image), p18[wikidata]];
    const category = categoryFromRef(commonsRef);
    if (category && categoryMatchesName(category, place.name)) {
      titles.push(parseCategoryFirstFile(await commons({
        action: 'query', list: 'categorymembers', cmtitle: category, cmtype: 'file', cmlimit: '1',
      })));
    }
    let photo = null;
    for (const title of titles.filter(Boolean)) {
      photo = await imageInfo(title);
      if (photo) break;
    }
    if (photo) {
      place.photo = photo;
      withPhoto += 1;
      log(`  ✓ ${place.name}: ${photo.title}`);
    } else {
      delete place.photo; // con --refresh una foto non più valida sparisce
      log(`  – ${place.name}: nessuna foto utilizzabile`);
    }
  } catch (err) {
    log(`  ! ${place.name}: ${err.message}`);
  }
}

await writeFile(FILE, `${JSON.stringify(doc, null, 2)}\n`);
const total = doc.places.filter((p) => p.photo).length;
process.stdout.write(`Foto: ${withPhoto} nuove, ${total}/${doc.places.length} locali in totale (${((100 * total) / doc.places.length).toFixed(1)}%).\n`);
