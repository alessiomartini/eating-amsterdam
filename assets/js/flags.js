// Fatti booleani su un locale che nessuna fonte pubblica conosce.
//
// Lo sconto studenti non ha un tag standard su OpenStreetMap e non compare in
// nessuna API: lo sa solo chi c'è stato. Quindi vale la stessa regola dei
// prezzi — conta l'ultima segnalazione, e se le segnalazioni si contraddicono
// la contraddizione si mostra invece di far vincere in silenzio la più recente.

export const FLAGS = [
  {
    id: 'student_discount',
    label: 'Student discount',
    icon: '🎓',
    question: 'Do they give a student discount?',
    notePlaceholder: '10% with student card, cheaper menu before 6pm…',
  },
];

export const FLAG_BY_ID = Object.fromEntries(FLAGS.map((f) => [f.id, f]));

/**
 * @param {Array} reports segnalazioni di un locale, in qualunque ordine
 * @returns tabella per id: valore corrente, quante persone lo dicono, se è conteso
 */
export function summariseFlags(reports = []) {
  const table = {};

  for (const { id } of FLAGS) {
    const mine = reports
      .filter((r) => r.flag === id)
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    if (!mine.length) continue;

    const latest = mine[mine.length - 1];
    const yes = mine.filter((r) => r.value).length;
    const no = mine.length - yes;

    table[id] = {
      value: Boolean(latest.value),
      note: latest.note ?? null,
      by: latest.by ?? null,
      date: latest.date ?? null,
      reports: mine.length,
      yes,
      no,
      // due persone che dicono il contrario: nessuna delle due va nascosta
      disputed: yes > 0 && no > 0,
      history: mine,
    };
  }

  return table;
}
