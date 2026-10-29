export interface InvitationRecipient {
  id: string;
  display_name: string;
  guest_count: number;
  is_active: boolean;
  public_token?: string | null;
  allocated_guest_count?: number;
}
export const recipientTotals = (rows: InvitationRecipient[]) => rows.reduce((total, row) => row.is_active ? { households: total.households + 1, guests: total.guests + row.guest_count } : total, { households: 0, guests: 0 });
export const recipientNameKey = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
export function validateRecipientRows(rows: unknown[][], existing: InvitationRecipient[] = []) {
  const key = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const header = rows.findIndex(row => row.some(cell => String(cell ?? "").trim()));
  const columns = (rows[header] ?? []).map(key);
  const nameColumn = columns.findIndex(value => ["destinataire", "nomdudestinataire", "famille", "nom"].includes(value));
  const countColumn = columns.findIndex(value => ["nombredinvites", "nombredinvitespersonnes", "nombredepersonnes", "personnes", "invites"].includes(value));
  const errors: string[] = [], duplicates: string[] = [], recipients: InvitationRecipient[] = [];
  const seen = new Set(existing.filter(row => row.is_active).map(row => recipientNameKey(row.display_name)));
  if (nameColumn < 0 || countColumn < 0) return { recipients, duplicates, errors: ["Colonnes attendues : Destinataire et Nombre d’invités."] };
  if (rows.length > 10001) return { recipients, duplicates, errors: ["Maximum 10 000 lignes par import."] };
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(cell => String(cell ?? "").trim())) return;
    const name = String(row[nameColumn] ?? "").trim(), raw = row[countColumn], count = Number(raw);
    if (!name || name.length > 200 || (typeof raw!=="number"&&typeof raw!=="string") || String(raw).trim() === "" || !Number.isInteger(count) || count < 1 || count > 100000) { errors.push(`Ligne ${header + index + 2} : nom requis (200 caractères maximum) et nombre entier positif requis.`); return; }
    const normalized = recipientNameKey(name);
    if (seen.has(normalized)) duplicates.push(`Ligne ${header + index + 2} : ${name}`);
    seen.add(normalized);
    recipients.push({ id: crypto.randomUUID(), display_name: name, guest_count: count, is_active: true });
  });
  if (recipientTotals(recipients).guests > 100000) errors.push("Le total ne peut pas dépasser 100 000 personnes.");
  if (!recipients.length && !errors.length) errors.push("Le fichier ne contient aucun destinataire.");
  return { recipients, duplicates, errors };
}

/** RFC 4180 quotes/newlines, French semicolon, CRLF and UTF-8 BOM. */
export function parseRecipientCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === delimiter || char === "\n" || char === "\r")) {
      row.push(value); value = "";
      if (char !== delimiter) { rows.push(row); row = []; if (char === "\r" && text[i + 1] === "\n") i++; }
    } else value += char;
  }
  if (quoted) throw new Error("CSV invalide : guillemets non fermés.");
  row.push(value); if (row.some(Boolean)) rows.push(row); return rows;
}
export const csvCell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
export const recipientUrl = (origin: string, publicId: string, token: string) => `${origin}/i/${encodeURIComponent(publicId)}/${encodeURIComponent(token)}`;
export const recipientGreeting = (name: string) => `Pour ${name.replace(/^famille\s+/i,"la famille ")}`;
