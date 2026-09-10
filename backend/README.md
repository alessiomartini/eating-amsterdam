# Backend

API dei prezzi condivisi e delle segnalazioni: un Cloudflare Worker davanti a un
database D1 (SQLite gestito). Niente server da amministrare, e il piano gratuito
copre ampiamente un progetto come questo.

## Metterlo in piedi

Dalla cartella `backend/`, una volta sola:

```bash
npx wrangler login                       # apre il browser
npx wrangler d1 create eating-amsterdam  # stampa un database_id
```

Incolla il `database_id` in `wrangler.toml`, poi:

```bash
npx wrangler d1 execute eating-amsterdam --file schema.sql --remote
npx wrangler secret put ADMIN_TOKEN      # inventane uno lungo a caso
npx wrangler deploy
```

L'ultimo comando stampa l'URL del Worker, del tipo
`https://eating-amsterdam-api.<tuo-nome>.workers.dev`.

## Accenderlo

Tre posti, tutti obbligatori:

1. **`data/config.json`** nella radice del repo: metti quell'URL in `apiBase` e
   committa. Da quel momento il sito condivide i prezzi invece di tenerli nel
   browser.
2. **Variabile del repo** su GitHub (*Settings → Secrets and variables → Actions
   → Variables*): `API_BASE` con lo stesso URL.
3. **Segreto del repo** (stessa pagina, tab *Secrets*): `ADMIN_TOKEN`, uguale a
   quello messo con `wrangler secret put`.

Le ultime due servono al workflow settimanale, che porta prezzi e segnalazioni
dentro il repo.

Se `ALLOWED_ORIGINS` in `wrangler.toml` non contiene il dominio da cui apri il
sito, il browser rifiuta le chiamate: è la protezione che impedisce a un altro
sito di scrivere nel tuo database.

## L'API

| | | |
|---|---|---|
| `POST` | `/api/prices` | segnala un prezzo |
| `GET` | `/api/prices/<placeId>` | storico di un locale |
| `GET` | `/api/prices?since=&limit=` | tutto, per la sincronizzazione |
| `POST` | `/api/feedback` | manda una segnalazione |
| `GET` | `/api/feedback` | leggile — richiede `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/api/health` | sono vivo |

Le segnalazioni si scrivono senza token e si leggono col token: chiunque può
dire che qualcosa non va, non chiunque può leggere quello che scrivono gli altri.

## Scelte, e perché

**Nessun account.** Chiedere una registrazione per dire "il döner costa 7,50"
significa non ricevere nessun prezzo. Al posto dell'identità c'è un
identificativo casuale del browser, che serve solo al rate limit (40 invii
l'ora) e non identifica nessuno.

**I prezzi si aggiungono, non si aggiornano.** Lo storico *è* il dato: serve a
mostrare l'ultimo prezzo e a capire se è credibile. Una tabella che tiene solo
l'ultimo valore butterebbe via proprio l'informazione che rende il sito utile.

**La moderazione nasconde, non cancella** (`hidden = 1`), così un errore di
moderazione si ripara.

**Un prezzo fuori scala viene rifiutato subito**, con gli stessi limiti che usa
lo scraper dei menu — definiti in un posto solo, così non possono divergere.
Un caffè a 45 € è quasi sempre un dito scivolato sulla tastiera.

## Guardare dentro

```bash
npx wrangler d1 execute eating-amsterdam --remote \
  --command "SELECT place_id, item, amount, created_at FROM prices ORDER BY id DESC LIMIT 20"

npx wrangler d1 execute eating-amsterdam --remote \
  --command "SELECT created_at, text FROM feedback ORDER BY id DESC LIMIT 20"
```

Per nascondere un prezzo sbagliato: `UPDATE prices SET hidden = 1 WHERE id = ...`.

## Provarlo senza deploy

`npm test` nella radice esegue l'API per davvero, SQL compreso, sostituendo D1
con SQLite in memoria (`node:sqlite`). Rate limit, validazione, CORS e
autorizzazione delle segnalazioni sono tutti coperti.
