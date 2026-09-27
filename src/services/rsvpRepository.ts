import { requireSupabaseSession, supabase } from "../lib/supabase";

export interface RsvpResponseRow {
  id: string;
  project_id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

export async function submitRsvpResponse(publicId: string, answers: Record<string, unknown>, startedAt: number, website = "") {
  if (!supabase) throw new Error("Le service de formulaire n’est pas configuré.");
  const { data, error } = await supabase.functions.invoke("submit-rsvp", {
    body: { publicId, answers, startedAt, website },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
}

export async function loadRsvpResponses(projectId: string) {
  if (!supabase) return [];
  await requireSupabaseSession();
  const { data, error } = await supabase.from("rsvp_responses").select("id, project_id, answers, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).returns<RsvpResponseRow[]>();
  if (error) throw error;
  return data;
}
