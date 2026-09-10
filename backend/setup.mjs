#!/usr/bin/env node
// Mette in piedi il backend in un colpo solo: crea il database, gli applica lo
// schema, genera il token, pubblica il Worker e scrive l'URL in data/config.json.
//
//   npm run backend:setup
//
// È idempotente: se il database esiste già lo riusa, se lo schema c'è già le
// CREATE TABLE IF NOT EXISTS non fanno danno. Rilanciarlo è sicuro.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractDatabaseId, extractWorkerUrl, npxInvocation } from './parse-wrangler.js';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TOML = join(HERE, 'wrangler.toml');
const CONFIG = join(ROOT, 'data', 'config.json');
const DB_NAME = 'eating-amsterdam';

const step = (n, text) => process.stdout.write(`\n[${n}/5] ${text}\n`);
const ok = (text) => process.stdout.write(`      ✓ ${text}\n`);

const npx = npxInvocation();

function wrangler(args, { capture = true } = {}) {
  return execFileSync(npx.command, ['--yes', 'wrangler', ...args], {
    cwd: HERE,
    encoding: 'utf8',
    shell: npx.shell,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
}

let toml = readFileSync(TOML, 'utf8');
const already = toml.match(/database_id\s*=\s*"([^"]+)"/)?.[1];

/* 1 — database */
step(1, 'Database D1');
let databaseId = already && !already.startsWith('SOSTITUISCI') ? already : null;

if (databaseId) {
  ok(`già configurato (${databaseId})`);
} else {
  let output = '';
  try {
    output = wrangler(['d1', 'create', DB_NAME]);
  } catch (err) {
    // già esistente: l'id si recupera dall'elenco
    output = wrangler(['d1', 'list', '--json']);
    const found = JSON.parse(output).find((d) => d.name === DB_NAME);
    if (!found) throw err;
    output = JSON.stringify(found);
  }
  databaseId = extractDatabaseId(output);
  if (!databaseId) {
    process.stderr.write('\nNon sono riuscito a leggere il database_id dall\'output di wrangler.\n'
      + 'Incollalo a mano in backend/wrangler.toml e rilancia.\n\n' + output + '\n');
    process.exit(1);
  }
  toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${databaseId}"`);
  writeFileSync(TOML, toml);
  ok(`creato e scritto in wrangler.toml (${databaseId})`);
}

/* 2 — schema (già applicato se il database viene da lontano, ma è idempotente) */
step(2, 'Tabelle');
wrangler(['d1', 'execute', DB_NAME, '--file', 'schema.sql', '--remote', '--yes'], { capture: false });
ok('schema applicato');

/* 3 — token */
step(3, 'Token per leggere le segnalazioni');
const forceNewToken = process.argv.includes('--new-token');
let existingToken = false;
try {
  existingToken = /ADMIN_TOKEN/.test(wrangler(['secret', 'list']));
} catch { /* nessun segreto ancora, o Worker non ancora pubblicato */ }

let token = null;
if (existingToken && !forceNewToken) {
  // rigenerarlo scollegherebbe il segreto già messo su GitHub, e la
  // sincronizzazione delle segnalazioni smetterebbe di funzionare in silenzio
  ok('già presente, lasciato com\'è (--new-token per sostituirlo)');
} else {
  token = randomBytes(24).toString('base64url');
  execFileSync(npx.command, ['--yes', 'wrangler', 'secret', 'put', 'ADMIN_TOKEN'], {
    cwd: HERE, input: `${token}\n`, encoding: 'utf8', shell: npx.shell, stdio: ['pipe', 'inherit', 'inherit'],
  });
  ok('generato e salvato su Cloudflare');
}

/* 4 — deploy */
step(4, 'Pubblicazione del Worker');
const deployOutput = wrangler(['deploy']);
process.stdout.write(deployOutput);
const url = extractWorkerUrl(deployOutput);
if (!url) {
  process.stderr.write('\nWorker pubblicato ma non ho trovato l\'URL nell\'output: prendilo qui sopra '
    + 'e mettilo in data/config.json.\n');
  process.exit(1);
}
ok(url);

/* 5 — accendere il sito */
step(5, 'Collegamento del sito');
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
config.apiBase = url;
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
ok('data/config.json aggiornato');

process.stdout.write(`
Fatto. Worker pubblicato su ${url}
${token ? `
Su GitHub (Settings → Secrets and variables → Actions):

  Variables → New:  API_BASE      = ${url}
  Secrets   → New:  ADMIN_TOKEN   = ${token}

Il token non viene mostrato di nuovo. Se lo perdi:
  npm run backend:setup -- --new-token
e aggiorna il segreto su GitHub, altrimenti le segnalazioni smettono di
arrivare nel repo.
` : `
Il token esisteva già e non l'ho toccato: quello che hai su GitHub resta valido.
`}
Se data/config.json è cambiato, committalo:

  git add data/config.json backend/wrangler.toml
  git commit -m "Aggiorna il backend"
  git push
`);
