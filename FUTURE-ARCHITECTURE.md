# Idee per il seguito

Note su cosa manca, cosa è lasciato a metà, e proposte non ancora decise.
Per come è fatto il progetto oggi vedi `README.md` (sito) e
`backend/README.md` (Worker + D1).

## Lasciato a metà

- **Foto del locale nella scheda**: servirebbe una fonte di immagini
  affidabile (es. Google Places Photos) e non è ancora collegata.
- **Foto del menù con estrazione dei prezzi**: oggi `scripts/scrape-menus.mjs`
  legge solo pagine HTML; una foto del menu scattata da un utente richiederebbe
  OCR, non ancora affrontato.
- **Segnalazione dei prezzi vecchi** (> 12 mesi) da riverificare: lo storico
  c'è già (tabella `prices`), manca solo il filtro/badge in UI.
- **`data/feedback.json` e `npm run sync:backend`**: il workflow settimanale
  che porta prezzi e segnalazioni dal Worker nel repo esiste, ma non c'è
  ancora nessuna interfaccia per marcare una segnalazione come "letta/risolta"
  a parte modificare `status` a mano via SQL (vedi `backend/README.md` →
  "Guardare dentro").

## Feedback centralizzato (idea, non ancora decisa)

Oggi questo repo ha un proprio database Cloudflare D1 dedicato
(`eating-amsterdam`, vedi `backend/README.md`) con Worker proprio, e lo stesso
vale per altri due siti di Alessio (`ear-training`, `geopolitics-atlas`), ognuno
con il proprio D1 + Worker per raccogliere note/feedback.

Idea allo studio, **non presa**: consolidare in un unico database D1
condiviso fra tutti i siti di Alessio, con una tabella tipo

```sql
notes(id, site, page, text, created_at, ...)
```

dove `site` distingue la provenienza, dietro un unico Worker con una allowlist
CORS per dominio (come oggi fa `ALLOWED_ORIGINS` in `backend/wrangler.toml`,
ma con più domini invece di uno).

**Pro:**
- meno account/infrastruttura Cloudflare da mantenere (un D1 + un Worker
  invece di uno per sito);
- un solo posto dove leggere tutte le note di tutti i siti.

**Contro:**
- un bug nel Worker condiviso romperebbe la raccolta note ovunque, mentre
  oggi ogni sito è isolato: un problema in uno non tocca gli altri;
- andrebbe migrato lo storico già presente nei D1 esistenti (qui: tabelle
  `prices`, `flags`, `feedback` del database `eating-amsterdam`).

Priorità bassa: il sistema attuale (Worker + D1 dedicato, vedi
`backend/src/worker.js`) funziona bene così com'è.
