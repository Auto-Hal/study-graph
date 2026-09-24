import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sourceUrl(url) {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
    const candidate = new URL(url.href + suffix);
    if (existsSync(fileURLToPath(candidate)) && statSync(fileURLToPath(candidate)).isFile()) return candidate.href;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const url = new URL(`../${specifier.slice(2)}`, import.meta.url);
    const source = sourceUrl(url);
    if (source) return { url: source, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const source = sourceUrl(new URL(specifier, context.parentURL));
    if (source) return { url: source, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
