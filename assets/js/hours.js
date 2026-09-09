// Parser "abbastanza buono" per il tag opening_hours di OSM.
// Copre le forme comuni ("Mo-Sa 11:00-22:00; Su 12:00-20:00", "24/7", "off"),
// non la sintassi completa (festivi, settimane pari, "sunset"...). In caso di
// dubbio restituisce null e la UI non mostra nulla, invece di mentire.

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_INDEX = Object.fromEntries(DAYS.map((d, i) => [d.toLowerCase(), i]));

function parseDayRange(token) {
  const days = new Set();
  for (const part of token.split(',')) {
    const [from, to] = part.trim().split('-').map((d) => DAY_INDEX[d.trim().toLowerCase()]);
    if (from === undefined) return null;
    if (to === undefined) {
      days.add(from);
      continue;
    }
    for (let i = from; ; i = (i + 1) % 7) {
      days.add(i);
      if (i === to) break;
    }
  }
  return days;
}

function parseTimeRanges(token) {
  const ranges = [];
  for (const part of token.split(',')) {
    const match = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) end += 24 * 60; // chiude dopo mezzanotte
    ranges.push([start, end]);
  }
  return ranges;
}

/** @returns {boolean|null} true aperto, false chiuso, null se non interpretabile. */
export function isOpenNow(openingHours, now = new Date()) {
  if (!openingHours) return null;
  // Alcuni locali separano le regole con la virgola invece che col punto e
  // virgola ("Su-Th 11:00-03:00, Fr,Sa 11:00-24:00"). Normalizziamo solo le
  // virgole che seguono un orario e precedono un giorno: quelle dentro una
  // lista di giorni ("Fr,Sa") o di orari ("09:00-12:00,14:00-18:00") restano.
  const spec = openingHours.trim().replace(/(\d{1,2}:\d{2})\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/g, '$1; ');
  if (/^24\/7$/i.test(spec)) return true;
  if (/^(off|closed)$/i.test(spec)) return false;
  if (/(PH|SH|sunset|sunrise|week|easter|\[)/i.test(spec)) return null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  let understood = false;
  let open = false;

  for (const rule of spec.split(';')) {
    const text = rule.trim();
    if (!text) continue;

    const match = text.match(/^([A-Za-z,\-]+)?\s*(.*)$/);
    if (!match) continue;
    const [, dayToken, timeToken] = match;

    const days = dayToken ? parseDayRange(dayToken) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) continue;

    if (/^off$/i.test(timeToken.trim())) {
      understood = true;
      if (days.has(today)) open = false;
      continue;
    }

    const ranges = parseTimeRanges(timeToken);
    if (!ranges) continue;
    understood = true;

    for (const [start, end] of ranges) {
      if (days.has(today) && minutesNow >= start && minutesNow < end) open = true;
      // orari che sconfinano oltre la mezzanotte valgono anche per il giorno dopo
      if (end > 1440 && days.has((today + 6) % 7) && minutesNow + 1440 < end && minutesNow + 1440 >= start) open = true;
    }
  }

  return understood ? open : null;
}

/** Versione leggibile: "Mo-Sa 11:00-22:00" → "Lun-Sab 11:00-22:00". */
export function humanize(openingHours) {
  if (!openingHours) return null;
  const it = { Mo: 'Lun', Tu: 'Mar', We: 'Mer', Th: 'Gio', Fr: 'Ven', Sa: 'Sab', Su: 'Dom' };
  return openingHours.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => it[d]).replace(/;\s*/g, ' · ');
}
