import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.env.STUDY_GRAPH_ISOLATED_DB !== "1") throw new Error("Set STUDY_GRAPH_ISOLATED_DB=1 for a disposable local PostgreSQL only.");
const url = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres");
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/postgres" || url.search) {
  throw new Error("Only a disposable localhost PostgreSQL administrative database is allowed.");
}
for (const file of ["phase5a-2a-db.test.mjs", "phase5a-archive-conflict-target-db.test.mjs", "phase5a-3a-generic-objective-archive-db.test.mjs", "phase5a-4a-offline-v2-db.test.mjs", "review-schedule-read-db.test.mjs", "learning-backup-db.test.mjs", "learning-history-db.test.mjs"]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", `scripts/${file}`], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
