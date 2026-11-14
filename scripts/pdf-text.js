// Estrazione del testo da un PDF con `pdftotext` (poppler), senza dipendenze npm.
import { spawn, spawnSync } from 'node:child_process';

/** pdftotext è un programma di sistema: può non esserci. */
export const hasPdftotext = spawnSync('pdftotext', ['-v']).error == null;

/** Testo di un PDF via `pdftotext -layout` (stdin -> stdout); null se fallisce. */
export function pdfToText(buf) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('pdftotext', ['-layout', '-q', '-', '-']);
    } catch {
      return resolve(null);
    }
    const out = [];
    const timer = setTimeout(() => child.kill(), 30000);
    child.stdout.on('data', (d) => out.push(d));
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? Buffer.concat(out).toString('utf8').slice(0, 2_000_000) : null);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buf);
  });
}
