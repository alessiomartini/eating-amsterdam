// Lettura dell'output di wrangler. Sta a parte perché è il punto fragile della
// procedura automatica: il formato di `d1 create` è cambiato fra le versioni e
// può essere JSON, TOML suggerito, o testo colorato per il terminale.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractDatabaseId(output) {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.uuid) return parsed.uuid;
    if (parsed?.d1_databases?.[0]?.database_id) return parsed.d1_databases[0].database_id;
  } catch { /* non era JSON: si cerca nel testo */ }
  return output.match(UUID)?.[0] ?? null;
}

export function extractWorkerUrl(output) {
  return output.match(/https:\/\/[^\s"']+\.workers\.dev/)?.[0] ?? null;
}

/**
 * Come invocare npx. Su Windows npx è uno script .cmd, e da Node 18.20 e 20.12
 * execFile si rifiuta di eseguire .cmd senza passare dalla shell (fu una
 * correzione di sicurezza). Senza questo, su Windows lo script muore con ENOENT.
 */
export function npxInvocation(platform = process.platform) {
  return platform === 'win32'
    ? { command: 'npx.cmd', shell: true }
    : { command: 'npx', shell: false };
}
