import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const environment = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const url = environment.VITE_SUPABASE_URL;
const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Configuration Supabase incomplète");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

if (authError) {
  console.log(JSON.stringify({ connection: "ok", anonymousAuth: "error", reason: authError.message }));
  process.exit(2);
}

const { error: tableError } = await supabase.from("projects").select("id").limit(1);

if (tableError) {
  console.log(JSON.stringify({ connection: "ok", anonymousAuth: "ok", projectsTable: "error", reason: tableError.message }));
  process.exit(3);
}

const user = authData.user;
if (!user) throw new Error("Session de test absente");

const projectId = crypto.randomUUID();
const storagePath = `${user.id}/${projectId}/images/verification.png`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let projectWritten = false;
let storageWritten = false;

try {
  const { error: insertError } = await supabase.from("projects").insert({
    id: projectId,
    owner_id: user.id,
    name: "Vérification automatique",
    status: "draft",
    project_data: { id: projectId, name: "Vérification automatique", status: "draft", pages: [], opening: { type: "none", duration: 0 }, audio: { enabled: false, source: null, volume: 0.7, loop: true, startMode: "manual" } },
  });
  if (insertError) throw insertError;
  projectWritten = true;

  const { data: readProject, error: readError } = await supabase.from("projects").select("id,name").eq("id", projectId).single();
  if (readError || readProject?.id !== projectId) throw readError ?? new Error("Relecture du projet impossible");

  const { error: uploadError } = await supabase.storage.from("wedding-assets").upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;
  storageWritten = true;
  const publicUrl = supabase.storage.from("wedding-assets").getPublicUrl(storagePath).data.publicUrl;

  const { data: asset, error: assetError } = await supabase.from("assets").insert({
    project_id: projectId,
    owner_id: user.id,
    kind: "image",
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: "image/png",
    size_bytes: png.byteLength,
  }).select("id").single();
  if (assetError || !asset?.id) throw assetError ?? new Error("Écriture de l’asset impossible");

  console.log(JSON.stringify({ connection: "ok", anonymousAuth: "ok", projectsTable: "ok", projectWriteRead: "ok", storageUpload: "ok", assetsTable: "ok", cleanup: "pending" }));
} catch (error) {
  console.log(JSON.stringify({ connection: "ok", anonymousAuth: "ok", projectsTable: "ok", integration: "error", reason: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 4;
} finally {
  if (projectWritten) await supabase.from("assets").delete().eq("project_id", projectId);
  if (storageWritten) await supabase.storage.from("wedding-assets").remove([storagePath]);
  if (projectWritten) await supabase.from("projects").delete().eq("id", projectId);
  await supabase.auth.signOut();
}
