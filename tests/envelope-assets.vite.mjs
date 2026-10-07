// QA only. In-memory localhost uploads: no Supabase writes, Auth or secrets.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({ plugins: [react(), tailwindcss(), {
  name: "envelope-local-upload-fixture", enforce: "pre",
  resolveId(source) { if (source.endsWith("/assetRepository") || source === "./assetRepository") return fileURLToPath(new URL("./envelope-assets.mock.ts", import.meta.url)); },
  configureServer(server) {
    const files = new Map();
    server.middlewares.use("/__qa-envelope-assets", async (req, res) => {
      const key = req.url?.split("?")[0];
      if (req.method === "POST") {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 5 * 1024 * 1024) { res.statusCode = 413; res.end(); return; } chunks.push(chunk); }
        files.set(key, { bytes: Buffer.concat(chunks), mime: req.headers["content-type"] }); res.end("ok");
      } else if (req.method === "DELETE") { files.delete(key); res.end("ok"); }
      else if (files.has(key)) { const file = files.get(key); res.setHeader("Content-Type", file.mime); res.end(file.bytes); }
      else { res.statusCode = 404; res.end("Missing QA image"); }
    });
  },
}] });
