// Writes docs/content/coverage.md, the content coverage grid (R-37), from the catalog and the
// skill map. Run it with `npm --prefix web run coverage`; coverage.test.ts fails while the file
// is stale. Vite loads the TypeScript the same way the tests do, so this needs no other runner.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, createServerModuleRunner } from "vite";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await createServer({
  root: web,
  configFile: join(web, "vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
try {
  const runner = createServerModuleRunner(server.environments.ssr);
  const { coverageMarkdown } = await runner.import("/src/content/coverage.ts");
  const out = join(web, "..", "docs", "content", "coverage.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, coverageMarkdown());
  console.log(`wrote ${out}`);
} finally {
  await server.close();
}
