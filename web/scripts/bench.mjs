// Prints the simulated-student bench (R-01) to stdout: `npm --prefix web run bench`. Nothing is
// written to disk (the students are synthetic, and the rule stays simple). Vite loads the
// TypeScript the same way the tests do, so this needs no other runner.
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
  const { benchText } = await runner.import("/src/bench/report.ts");
  process.stdout.write(await benchText());
} finally {
  await server.close();
}
