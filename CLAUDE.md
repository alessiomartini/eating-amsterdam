# Claude Code instructions

## Project

Amsterdam places data site with Node scripts, tests, and backend/data
integration. Keep source data, enrichment, and generated content distinct.

## Verification

- Install with `npm ci` when needed.
- Run `npm test` after changing application or data-processing code.
- Run the smallest affected `npm run ...` script after changing a pipeline.
- Preview with `npm run dev` for browser-facing changes.

## Workflow

- Read `README.md` and the relevant scripts/tests before editing.
- Treat API keys, `.env` values, and personal data as secrets; use fixtures or
  fake data in tests.
- Do not overwrite source data with generated output unless the workflow requires it.
- Inspect `git diff` and report tests and data-validation results before committing.

## Roadmap e progressi

Questo progetto è tracciato in https://alessiomartini.github.io/projects-overview/ tramite il file `ROADMAP.md`
nella root del repo. Mantienilo aggiornato:

- Alla fine di ogni sessione di lavoro (prima del commit finale), aggiorna `ROADMAP.md`:
  - spunta (`- [x]`) i punti completati in questa sessione;
  - aggiungi come `- [ ]` i nuovi compiti emersi, nella fase giusta (titoli `##`);
  - aggiungi in cima alla sezione `## Log` una riga `- AAAA-MM-GG: <cosa è stato fatto, in una frase>`
    (se esiste già una riga con la data di oggi, estendila invece di crearne un'altra).
- Non riscrivere né riordinare le voci esistenti senza motivo; non cancellare le voci completate.
- Se `ROADMAP.md` non esiste, crealo con le fasi `## ...`, le checkbox e una sezione `## Log`.
- Includi l'aggiornamento di `ROADMAP.md` nello stesso commit del lavoro.
