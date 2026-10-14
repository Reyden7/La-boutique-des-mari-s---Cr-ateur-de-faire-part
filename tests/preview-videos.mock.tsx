// QA only. In-memory rows and local Blob URLs; no Supabase connection/credentials.
export const QA_OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const isSupabaseConfigured = true;
export const requireSupabaseSession = async () => ({ id: QA_OWNER });
export const useAuth = () => ({ isAdmin: true, user: { id: QA_OWNER, email: "demo@local.invalid" }, loading: false, signOut: async () => {} });
const tables: Record<string, Record<string, any>[]> = { projects: [], templates: [], preview_video_cleanup: [] };
const files = new Map<string, string>();
export const qaCounts = { uploads: 0, signatures: 0, removals: 0 };
export let qaSlow = false;
export function setQaSlow(value: boolean) { qaSlow = value; }
export function seedQa(rows: typeof tables) { Object.assign(tables, rows); }
export const supabase: any = {
  from(table: string) {
    if (!tables[table]) throw new Error(`QA refuses ${table}`);
    let action = "select", changes: Record<string, any> = {}, filters: Array<[string, any]> = [];
    const result = () => {
      const matched = tables[table].filter(row => filters.every(([k,v]) => (row[k] ?? null) === v));
      if (action === "update") for (const row of matched) {
        if ("preview_video_path" in changes && row.preview_video_path && row.preview_video_path !== changes.preview_video_path) tables.preview_video_cleanup.push({ storage_path: row.preview_video_path, kind: table === "projects" ? "project" : "template", owner_id: QA_OWNER });
        Object.assign(row, changes);
      }
      if (action === "delete") tables[table] = tables[table].filter(row => !matched.includes(row));
      if (action === "upsert" || action === "insert") { tables[table].push({ ...changes }); return { data: [{ ...changes }], error: null }; }
      return { data: matched.map(row => ({ ...row })), error: null };
    };
    const q: any = { select: () => q, eq: (k: string,v: any) => { filters.push([k,v]); return q; }, is: (k: string,v: any) => { filters.push([k,v]); return q; }, order: () => q, limit: () => q,
      update: (v: any) => { action = "update"; changes = v; return q; }, delete: () => { action = "delete"; return q; }, upsert: (v: any) => { action = "upsert"; changes = v; return q; }, insert: (v: any) => { action = "insert"; changes = v; return q; },
      returns: async () => result(), single: async () => { const r = result(); return { data: r.data[0], error: r.data.length ? null : new Error("QA CAS conflict") }; }, maybeSingle: async () => { const r=result(); return {data:r.data[0]??null,error:null}; }, then: (resolve: any,reject: any) => Promise.resolve(result()).then(resolve,reject) };
    return q;
  },
  storage: { from(bucket: string) {
    if (bucket !== "card-preview-videos") throw new Error(`QA refuses bucket ${bucket}`);
    return {
      async upload(path: string,file: File) { files.set(path,URL.createObjectURL(file)); qaCounts.uploads++; return {error:null}; },
      async createSignedUrl(path: string) { qaCounts.signatures++; if(qaSlow) await new Promise(resolve=>setTimeout(resolve,1800)); return files.has(path) ? {data:{signedUrl:files.get(path)},error:null} : {data:null,error:new Error("QA missing video")}; },
      async remove(paths: string[]) { for(const path of paths){const url=files.get(path); if(url)URL.revokeObjectURL(url);files.delete(path);qaCounts.removals++;} return {error:null}; },
    };
  } },
};
