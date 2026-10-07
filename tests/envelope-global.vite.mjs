import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({ plugins: [react(), tailwindcss(), {
  name: "isolated-global-envelope-fixture", enforce: "pre",
  resolveId(source) {
    if (source.endsWith("/lib/supabase") || source.endsWith("/contexts/AuthContext")) return fileURLToPath(new URL("./envelope-global.mock.tsx", import.meta.url));
  },
  configureServer(server) {
    const files = new Map();
    server.middlewares.use("/__qa-envelope-global", async (req, res) => {
      const path = req.url?.split("?")[0];
      if (req.method === "POST") { const chunks = []; for await (const chunk of req) chunks.push(chunk); files.set(path, { bytes: Buffer.concat(chunks), mime: req.headers["content-type"] }); res.end("ok"); }
      else if (req.method === "DELETE") { files.delete(path); res.end("ok"); }
      else if (files.has(path)) { const file = files.get(path); res.setHeader("Content-Type", file.mime); res.end(file.bytes); }
      else { res.statusCode = 404; res.end("Missing QA image"); }
    });
  },
}] });
