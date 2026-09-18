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
