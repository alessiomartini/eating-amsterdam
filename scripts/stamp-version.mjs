#!/usr/bin/env node
// Aggiunge ?v=<hash> a fogli di stile, script e import fra moduli, così un
// browser che ha già visitato il sito riceve la versione nuova invece di
// quella in cache. Gira nel workflow di deploy, sui file del runner: non
// tocca il repo.

import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function jsFiles() {
  const dir = join(ROOT, 'assets', 'js');
  return (await readdir(dir)).filter((f) => f.endsWith('.js')).map((f) => join(dir, f));
}

const sources = [
  join(ROOT, 'index.html'),
  join(ROOT, 'assets', 'css', 'style.css'),
  join(ROOT, 'scripts', 'osm-common.js'),
  ...(await jsFiles()),
];

const hash = createHash('sha256');
for (const file of sources.sort()) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 8);

// index.html: il foglio di stile e il modulo d'ingresso
let html = await readFile(join(ROOT, 'index.html'), 'utf8');
html = html
  .replace('href="assets/css/style.css"', `href="assets/css/style.css?v=${version}"`)
  .replace('src="assets/js/app.js"', `src="assets/js/app.js?v=${version}"`);
await writeFile(join(ROOT, 'index.html'), html);

// i moduli si importano fra loro: senza questo il browser servirebbe dalla
// cache tutto ciò che app.js importa, cioè quasi tutto il sito
for (const file of await jsFiles()) {
  const code = await readFile(file, 'utf8');
  await writeFile(
    file,
    code.replace(/from '(\.[^']+\.js)'/g, (_, path) => `from '${path}?v=${version}'`),
  );
}

process.stdout.write(`Versione ${version} applicata a ${sources.length} file.\n`);
