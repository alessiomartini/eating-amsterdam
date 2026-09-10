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
const token = randomBytes(24).toString('base64url');
execFileSync(npx.command, ['--yes', 'wrangler', 'secret', 'put', 'ADMIN_TOKEN'], {
  cwd: HERE, input: `${token}\n`, encoding: 'utf8', shell: npx.shell, stdio: ['pipe', 'inherit', 'inherit'],
});
ok('generato e salvato su Cloudflare');

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
Fatto. Restano due cose che devo fare per forza tu, su GitHub
(Settings → Secrets and variables → Actions):

  Variables → New:  API_BASE      = ${url}
  Secrets   → New:  ADMIN_TOKEN   = ${token}

Poi committa data/config.json e il sito comincia a condividere i prezzi:

  git add data/config.json backend/wrangler.toml
  git commit -m "Accendi il backend"
  git push

Il token qui sopra non viene mostrato di nuovo: se lo perdi, rilancia questo
comando e ne genera uno nuovo.
`);
