// QA only: replaces Auth + Supabase solely in envelope-global.vite.mjs.
// In-memory library/uploads. No network backend, credentials or persistent data.
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
let isAdmin = true;
const listeners = new Set<() => void>();
export function setQaAdmin(value: boolean) { isAdmin = value; listeners.forEach((listener) => listener()); }
export function useAuth() { const admin = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => isAdmin); return { isAdmin: admin, user: { id: "qa-user" }, loading: false }; }
export function AuthProvider({ children }: { children: ReactNode }) { return children; }
export const isSupabaseConfigured = true;
export const requireSupabaseSession = async () => ({ id: "qa-user" });
const rows: Record<string, any>[] = [];
export const qaRows = rows;
const blobs = new Map<string, string>();
export const supabase: any = {
  from(table: string) {
    if (table !== "global_assets") throw new Error(`QA refuses table ${table}`);
    let values: Record<string, any> | null = null;
    const filters: Array<[string, any]> = [];
    const result = () => {
      const matched = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      if (values && !isAdmin) return { data: null, error: new Error("Admin access required") };
      if (values) matched.forEach((row) => Object.assign(row, values));
      return { data: matched.map((row) => ({ ...row })), error: null };
    };
    const query: any = { select: () => query, order: () => query, eq: (key: string, value: any) => { filters.push([key, value]); return query; }, update: (value: any) => { values = value; return query; }, returns: async () => result(), single: async () => { const value = result(); return { data: value.data?.[0], error: value.error }; } };
    return query;
  },
  functions: { async invoke(_name: string, { body }: { body: FormData | Record<string, any> }) {
    if (!isAdmin) return { data: null, error: new Error("Admin access required") };
    if (body instanceof FormData) {
      const file = body.get("file") as File; const type = body.get("type") as string;
      const id = crypto.randomUUID(); const blob = URL.createObjectURL(file); blobs.set(id, blob);
      const folder = type === "envelope_base" ? "bases" : type === "envelope_flap" ? "flaps" : "seals";
      const url = `${location.origin}/__qa-envelope-global/${folder}/${id}.png`;
      // The isolated Vite fixture serves bytes from memory, never Supabase.
      await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const row = { id, type, name: body.get("name"), slug: id, url, storage_path: `envelope/${folder}/${id}.png`, thumbnail_url: url, metadata: {}, category: null, is_published: true, is_featured: false, sort_order: 0, source_asset_id: null, created_by: "qa-user", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      rows.push(row); return { data: { asset: { ...row } }, error: null };
    }
    if (body.action === "usage") return { data: { projects: JSON.stringify((window as any).__qaEnvelopeProject).includes(body.assetId) ? 1 : 0, templates: 0 }, error: null };
    if (body.action === "delete") {
      if (JSON.stringify((window as any).__qaEnvelopeProject).includes(body.assetId)) return { data: null, error: new Error("Used by one project. Depublish instead.") };
      const index = rows.findIndex((row) => row.id === body.assetId); const row = rows[index];
      if (row) { await fetch(row.url, { method: "DELETE" }); rows.splice(index, 1); const blob = blobs.get(body.assetId); if (blob) URL.revokeObjectURL(blob); blobs.delete(body.assetId); }
      return { data: { deleted: true }, error: null };
    }
    throw new Error("Unsupported QA request");
  } },
};
