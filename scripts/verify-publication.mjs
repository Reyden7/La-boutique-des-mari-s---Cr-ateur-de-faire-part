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

const owner = createClient(url, key, { auth: { persistSession: false } });
const visitor = createClient(url, key, { auth: { persistSession: false } });
const { data: authData, error: authError } = await owner.auth.signInAnonymously();
if (authError || !authData.user) throw authError ?? new Error("Session propriétaire absente");

const projectId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
const timestamp = new Date().toISOString();
const invitation = {
  id: projectId,
  name: "Emma & Lucas",
  status: "published",
  publicId,
  createdAt: timestamp,
  updatedAt: timestamp,
  publishedAt: timestamp,
  pages: [{ id: crypto.randomUUID(), name: "Couverture", background: { type: "color", color: "#fffdf9" }, elements: [] }],
  opening: { type: "envelope", duration: 1.8 },
  audio: { enabled: false, source: null, volume: 0.7, loop: true, startMode: "opening-interaction" },
};

let written = false;
try {
  const { error: insertError } = await owner.from("projects").insert({
    id: projectId,
    owner_id: authData.user.id,
    name: invitation.name,
    project_data: invitation,
    status: "published",
    public_id: publicId,
    published_at: timestamp,
  });
  if (insertError) throw insertError;
  written = true;

  const { data: publicProject, error: publicError } = await visitor
    .from("projects")
    .select("project_data,public_id,status")
    .eq("public_id", publicId)
    .eq("status", "published")
    .single();
  if (publicError || publicProject?.project_data?.name !== invitation.name) throw publicError ?? new Error("Lecture publique impossible");

  const updatedAt = new Date(Date.now() + 1000).toISOString();
  const { error: updateError } = await owner.from("projects").update({
    name: "Emma & Lucas — mise à jour",
    project_data: { ...invitation, name: "Emma & Lucas — mise à jour", updatedAt },
    updated_at: updatedAt,
  }).eq("id", projectId);
  if (updateError) throw updateError;

  const { data: updatedProject, error: rereadError } = await visitor
    .from("projects")
    .select("project_data,public_id")
    .eq("public_id", publicId)
    .single();
  if (rereadError || updatedProject?.project_data?.name !== "Emma & Lucas — mise à jour" || updatedProject.public_id !== publicId) {
    throw rereadError ?? new Error("La mise à jour publique n’a pas conservé le lien");
  }

  console.log(JSON.stringify({ rendererData: "ok", dynamicPublicRouteData: "ok", publishedProjectUpdate: "ok", publicIdStable: "ok" }));
} catch (error) {
  console.log(JSON.stringify({ publicationIntegration: "error", reason: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 4;
} finally {
  if (written) await owner.from("projects").delete().eq("id", projectId);
  await owner.auth.signOut();
}
