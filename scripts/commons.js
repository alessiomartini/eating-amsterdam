// Foto dei locali da Wikimedia Commons: parsing delle risposte API, senza rete.
// Solo Commons perché ogni file ha autore e licenza esplicite, e si può
// mostrare in hotlink con attribuzione; nessuna chiave API.

const COMMONS_HOST = /^https?:\/\/(commons\.wikimedia\.org|upload\.wikimedia\.org)\//i;

/** "File:Foo bar.jpg" da un tag wikimedia_commons o da un URL immagine; null se non è un file. */
export function fileTitleFromRef(ref) {
  if (!ref) return null;
  const value = String(ref).trim();
  if (/^file:/i.test(value)) return `File:${value.slice(5).trim().replace(/_/g, ' ')}`;
  if (!COMMONS_HOST.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const fromTitle = url.searchParams.get('title');
  let name = null;
  if (/^File:/i.test(fromTitle ?? '')) name = fromTitle.slice(5);
  else {
    const m = /\/wiki\/(?:Special:FilePath\/|File:)(.+)$/i.exec(url.pathname);
    if (m) name = decodeURIComponent(m[1]);
  }
  if (!name && url.hostname === 'upload.wikimedia.org') {
    const parts = url.pathname.split('/').filter(Boolean);
    const thumb = parts.indexOf('thumb');
    name = decodeURIComponent(thumb >= 0 ? parts[thumb + 3] ?? '' : parts.at(-1) ?? '');
  }
  return name ? `File:${name.trim().replace(/_/g, ' ')}` : null;
}

export function categoryFromRef(ref) {
  return /^category:/i.test(ref ?? '') ? `Category:${ref.slice(9).trim().replace(/_/g, ' ')}` : null;
}

/** Prima immagine (P18) di ogni entità Wikidata: { Q123: "File:..." }. */
export function parseWikidataImages(json) {
  const out = {};
  for (const [id, entity] of Object.entries(json?.entities ?? {})) {
    const claims = entity?.claims?.P18 ?? [];
    // preferiti > normali; i claim deprecati si ignorano
    const usable = claims.filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value);
    const best = usable.find((c) => c.rank === 'preferred') ?? usable[0];
    if (best) out[id] = `File:${String(best.mainsnak.datavalue.value).replace(/_/g, ' ')}`;
  }
  return out;
}

/** Primo file di una categoria Commons (risposta di list=categorymembers). */
export function parseCategoryFirstFile(json) {
  const member = (json?.query?.categorymembers ?? []).find((m) => m.ns === 6 && /^File:/.test(m.title ?? ''));
  return member?.title ?? null;
}

const decodeEntities = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0*39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Testo semplice da un frammento HTML di extmetadata (Artist è spesso un link). */
export function stripHtml(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Toglie i parametri utm_* che l'API aggiunge: l'URL funziona anche senza. */
function withoutTracking(url) {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if (key.startsWith('utm_')) u.searchParams.delete(key);
  return u.toString();
}

const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/;

/**
 * Risposta di prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=640 per un file.
 * Restituisce { thumb, author, license, licenseUrl, page, title } oppure null se manca
 * qualcosa che serve a un'attribuzione corretta (miniatura, pagina, licenza).
 */
export function parseImageInfo(json) {
  const pages = Object.values(json?.query?.pages ?? {});
  const page = pages.find((p) => !('missing' in p) && p.imageinfo?.length);
  if (!page) return null;
  const info = page.imageinfo[0];
  if (info.mime && !IMAGE_MIME.test(info.mime)) return null;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  const thumb = info.thumburl ?? null;
  const filePage = info.descriptionurl ?? null;
  if (!license || !thumb || !filePage) return null;
  // l'API oggi restituisce thumb.wikimedia.org, in passato upload.wikimedia.org
  if (!/^https:\/\/(thumb|upload)\.wikimedia\.org\//.test(thumb)) return null;
  if (!/^https:\/\/commons\.wikimedia\.org\//.test(filePage)) return null;
  const author = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'Unknown author';
  const licenseUrl = /^https?:\/\//.test(meta.LicenseUrl?.value ?? '') ? meta.LicenseUrl.value : null;
  return { title: page.title, thumb: withoutTracking(thumb), author, license, licenseUrl, page: filePage };
}

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Una categoria Commons può raccogliere tutt'altro (per esempio l'edificio che ospita
 * il locale): il primo file della categoria vale come foto solo se il nome della
 * categoria contiene il nome del locale (senza articoli/«café» iniziali).
 */
export function categoryMatchesName(category, name) {
  const core = normalize(name).replace(/^(the|de|het|een|t|cafe|restaurant|brouwerij)\s+/, '');
  return core.length >= 3 && ` ${normalize(category)} `.includes(` ${core} `);
}
