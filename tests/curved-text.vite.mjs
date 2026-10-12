// QA only: no remote writes, Auth or cloud fonts. Local system font served only
// by this localhost fixture; no font file copied into the repository.
import globals from "./envelope-global.vite.mjs";
import { readFileSync } from "node:fs";
export default { ...globals, plugins: [...globals.plugins, {
  name: "curve-local-font-fixture",
  configureServer(server) {
    server.middlewares.use("/__qa-curve-font.ttf", (_req,res) => {
      res.setHeader("Content-Type","font/ttf");
      res.end(readFileSync("C:/Windows/Fonts/segoesc.ttf"));
    });
  },
}] };
