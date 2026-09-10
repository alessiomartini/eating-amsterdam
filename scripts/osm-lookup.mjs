#!/usr/bin/env node
// Chiede a OSM come è taggato un locale, per capire perché non compare in mappa.
//   node scripts/osm-lookup.mjs "Kriterion"
// Serve a rispondere a "manca X" senza tirare a indovinare.

import { OVERPASS_ENDPOINTS, METRO_BBOX } from './osm-common.js';

const name = process.argv.slice(2).join(' ');
if (!name) {
  process.stderr.write('Uso: node scripts/osm-lookup.mjs "<nome del locale>"\n');
  process.exit(1);
}

const query = `
[out:json][timeout:60];
nwr["name"~"${name}",i](${METRO_BBOX.join(',')});
out center tags;
`.trim();

let json = null;
for (const endpoint of OVERPASS_ENDPOINTS) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'eating-amsterdam/0.1 (+https://github.com/alessiomartini/eating-amsterdam)',
      },
      body: new URLSearchParams({ data: query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
    break;
  } catch (err) {
    process.stderr.write(`${endpoint}: ${err.message}\n`);
  }
}

if (!json) {
  process.stderr.write('Nessun endpoint Overpass raggiungibile.\n');
  process.exit(1);
}

const elements = json.elements ?? [];
process.stdout.write(`\n"${name}": ${elements.length} risultati in zona\n`);

for (const el of elements) {
  const t = el.tags ?? {};
  process.stdout.write(`\n  ${el.type}/${el.id}  ${t.name ?? '(senza nome)'}\n`);
  for (const key of ['amenity', 'shop', 'leisure', 'tourism', 'cuisine', 'diet:vegetarian', 'diet:vegan', 'addr:street', 'website', 'opening_hours']) {
    if (t[key]) process.stdout.write(`      ${key.padEnd(18)} ${t[key]}\n`);
  }
}
process.stdout.write('\n');
