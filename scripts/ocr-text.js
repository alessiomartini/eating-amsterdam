// OCR di un'immagine con `tesseract` (CLI), senza dipendenze npm. Opzionale: può non esserci.
import { spawn, spawnSync } from 'node:child_process';

const langs = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' });

/** tesseract è un programma di sistema: può non esserci. */
export const hasTesseract = langs.error == null && langs.status === 0;

/** Lingue da usare: eng+nld se installate, altrimenti quelle disponibili tra le due. */
export const ocrLangs = hasTesseract
  ? ['eng', 'nld'].filter((l) => langs.stdout.split('\n').map((s) => s.trim()).includes(l)).join('+') || 'eng'
  : '';

/**
 * Ripulisce i difetti tipici dell'OCR sui prezzi: "12.5O" -> "12.50", "1O,50" -> "10,50".
 * Tocca solo O/o attaccate a cifre e separate da virgola o punto.
 */
export function normalizeOcrText(text) {
  return text
    .replace(/(\d)[Oo](?=[.,]\d|\d|\b)/g, '$1' + '0')
    .replace(/\b[Oo](?=\d[.,]\d{2}\b)/g, '0')
    .replace(/([.,]\d)[Oo]\b/g, '$10')
    .replace(/ /g, ' ');
}

/** Testo di un'immagine via `tesseract stdin stdout`; null se fallisce. */
export function imageToText(buf) {
  return new Promise((resolve) => {
    if (!hasTesseract) return resolve(null);
    let child;
    try {
      child = spawn('tesseract', ['stdin', 'stdout', '-l', ocrLangs, '--psm', '6']);
    } catch {
      return resolve(null);
    }
    const out = [];
    const timer = setTimeout(() => child.kill(), 60000);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? normalizeOcrText(Buffer.concat(out).toString('utf8')).slice(0, 500_000) : null);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buf);
  });
}
