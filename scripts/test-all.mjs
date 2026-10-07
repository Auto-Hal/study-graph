import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? findTests(path) : /\.test\.(ts|mjs)$/.test(entry.name) ? [relative(root, path).replaceAll("\\", "/")] : [];
  });
}
const files = [...findTests(resolve(root, "src")), ...findTests(resolve(root, "scripts"))]
  .filter((file) => !/-db\.test\.mjs$/.test(file)).sort();
const adapterFiles = new Set([
  "src/lib/review/objective-runtime.test.ts", "src/lib/supabase/objective-archive.test.ts",
]);
const curriculumFiles = new Set([
  "src/lib/review/philosophy-registry.test.ts", "src/lib/review/philosophy-pilot-runtime.test.ts",
  "src/lib/review/philosophy-multi-objective.test.ts", "src/lib/review/western-art-pilot.test.ts",
  "src/lib/review/western-art-multi-objective.test.ts", "src/lib/review/western-art-lecture1.test.ts",
]);
const groups = [
  [[], files.filter((file) => !adapterFiles.has(file) && !curriculumFiles.has(file))],
  [["--import", "./scripts/objective-runtime-test-loader.mjs"], files.filter((file) => adapterFiles.has(file))],
  [["--import", "./scripts/phase5a-3b-test-loader.mjs"], files.filter((file) => curriculumFiles.has(file))],
];
for (const [loader, tests] of groups) {
  if (!tests.length) throw new Error("Empty test group");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", ...loader, "--test", ...tests], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
