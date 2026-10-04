// Empacota a função do job das cotações (spec 053) num único index.mjs para o
// Neon, com o cliente do Prisma dentro. O `require` criado no topo atende os
// pacotes CommonJS (como o pg) dentro do módulo ESM. `neon.ts` publica a pasta
// dist como está (bundler "none").
import { build } from "esbuild";

await build({
  entryPoints: [new URL("./quote-sync.ts", import.meta.url).pathname],
  outfile: new URL("./dist/index.mjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
