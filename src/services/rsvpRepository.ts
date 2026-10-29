import { requireSupabaseSession, supabase } from "../lib/supabase";

export interface RsvpResponseRow {
  id: string;
  project_id: string;
  answers: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  recipient_id?: string | null;
  attendance?: "confirmed" | "declined" | null;
  present_count?: number | null;
  publication_version_id?: string | null;
  questionnaire_snapshot?: { fields?: { id: string; label: string; type: string }[] } | null;
}

export async function submitRsvpResponse(publicId: string, answers: Record<string, unknown>, startedAt: number, website = "", recipient?: { token: string; attendance: string; presentCount: number }) {
  if (!supabase) throw new Error("Le service de formulaire n’est pas configuré.");
  const { data, error } = await supabase.functions.invoke("submit-rsvp", {
    body: { publicId, answers, startedAt, website, ...(recipient?{recipientToken:recipient.token,attendance:recipient.attendance,presentCount:recipient.presentCount}:{}) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
}

export async function loadRsvpResponses(projectId: string) {
  if (!supabase) return [];
  await requireSupabaseSession();
  const responses: RsvpResponseRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("rsvp_responses")
      .select("id, project_id, answers, created_at, updated_at, recipient_id, attendance, present_count, publication_version_id, questionnaire_snapshot")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1).returns<RsvpResponseRow[]>();
    if (error) throw error;
    responses.push(...(data ?? []));
    if (!data || data.length < pageSize) return responses;
  }
}

export async function loadRsvpResponseHistory(projectId: string, responseId: string) {
  await requireSupabaseSession();
  if (!supabase) return [];
  const {data,error}=await supabase.from("rsvp_response_history").select("id,answers,questionnaire_snapshot,publication_version_id,answered_at")
    .eq("project_id",projectId).eq("response_id",responseId).order("archived_at",{ascending:false});
  if(error)throw error;
  return data as {id:string;answers:Record<string,unknown>;questionnaire_snapshot:RsvpResponseRow["questionnaire_snapshot"];publication_version_id:string|null;answered_at:string}[];
}
