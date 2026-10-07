import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
const token = process.env.STUDY_GRAPH_APP_TOKEN ?? process.env.StudyGraph_APP_TOKEN;
if (!token?.trim()) {
  console.error("STUDY_GRAPH_APP_TOKEN is missing. No SQL was generated.");
  process.exit(1);
}
const hash = createHash("sha256").update(token).digest("hex");
const output = new URL("../.tools/app-token-sync.sql", import.meta.url);
mkdirSync(new URL("../.tools/", import.meta.url), { recursive: true });
writeFileSync(output, `-- Study Graph APP_TOKEN synchronization; generated from local environment.
-- Execute on the same Supabase project configured for the app.
-- Coordinate with Vercel production env + redeploy: the old app token stops
-- working immediately after COMMIT. This file contains a hash, not the token.
begin;
-- Keep this result for rollback until the redeployment is verified.
select value as previous_app_token_sha256
from private.study_graph_config
where key = 'app_token_sha256'
for update;

do $sync$
declare
  affected integer;
begin
  update private.study_graph_config
  set value = '${hash}', updated_at = now()
  where key = 'app_token_sha256';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected one existing app_token_sha256 row; no change committed';
  end if;
end;
$sync$;

select key, value = '${hash}' as matches_local_token, updated_at
from private.study_graph_config
where key = 'app_token_sha256';
commit;
`, { encoding: "utf8", mode: 0o600 });
console.log(`Prepared ${fileURLToPath(output)} (SHA-256 only). No DB or Vercel settings were changed.`);
