// Compila cada tests/*.test.ts con esbuild y los ejecuta con el corredor de pruebas de Node.
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("tests").filter((f) => f.endsWith(".test.ts"));
rmSync(".test-out", { recursive: true, force: true });
await build({
  entryPoints: files.map((f) => `tests/${f}`), outdir: ".test-out", bundle: true,
  platform: "node", format: "esm", outExtension: { ".js": ".mjs" }, logLevel: "error",
});
const r = spawnSync(process.execPath, ["--test", ...files.map((f) => `.test-out/${f.replace(/\.ts$/, ".mjs")}`)], { stdio: "inherit" });
process.exit(r.status ?? 1);
