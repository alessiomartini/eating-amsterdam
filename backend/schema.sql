-- Schema del database condiviso (Cloudflare D1).
-- Applicalo con:  npx wrangler d1 execute eating-amsterdam --file backend/schema.sql --remote

-- Ogni segnalazione di prezzo è una riga: non si aggiorna mai, si aggiunge.
-- Lo storico è il dato, non un sottoprodotto — come nelle app dei carburanti.
CREATE TABLE IF NOT EXISTS prices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id    TEXT    NOT NULL,
  item        TEXT,               -- una delle sei voci, oppure NULL per un piatto libero
  dish        TEXT,
  amount      REAL    NOT NULL,
  currency    TEXT    NOT NULL DEFAULT 'EUR',
  reporter    TEXT,               -- nome scelto da chi segnala, facoltativo
  client_id   TEXT,               -- identificativo casuale del browser, per il rate limit
  created_at  TEXT    NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0   -- moderazione: si nasconde, non si cancella
);

CREATE INDEX IF NOT EXISTS prices_place  ON prices (place_id, item, created_at);
CREATE INDEX IF NOT EXISTS prices_recent ON prices (created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  context     TEXT,               -- JSON: filtri attivi, risultati, locale selezionato
  reporter    TEXT,
  client_id   TEXT,
  created_at  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS feedback_recent ON feedback (created_at);

-- Fatti booleani su un locale che nessuna fonte pubblica conosce: lo sconto
-- studenti non ha un tag OSM standard, quindi può dirlo solo chi ci è stato.
-- Stessa logica dei prezzi: si aggiunge, vale l'ultima, e se le segnalazioni si
-- contraddicono la contraddizione si mostra invece di nasconderla.
CREATE TABLE IF NOT EXISTS flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id    TEXT    NOT NULL,
  flag        TEXT    NOT NULL,   -- per ora solo 'student_discount'
  value       INTEGER NOT NULL,   -- 1 sì, 0 no
  note        TEXT,               -- "10% con tessera"
  reporter    TEXT,
  client_id   TEXT,
  created_at  TEXT    NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS flags_place  ON flags (place_id, flag, created_at);
CREATE INDEX IF NOT EXISTS flags_recent ON flags (created_at);

-- Rate limit a finestra fissa: non serve niente di raffinato per fermare
-- l'invio ripetuto per sbaglio o per noia.
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
