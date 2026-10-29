export function recipientFieldRole(field: { label: string; type: string }) {
  const label=field.label.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
  if (label==="nombre de personnes" && field.type==="number") return "count";
  if (label==="presence" && (field.type==="boolean"||field.type==="single_choice"||field.type==="select")) return "attendance";
  return null;
}
export function standardAttendanceAnswer(field: {type:string;options?:string[]}, attendance: string) {
  if(field.type==="boolean")return attendance==="confirmed";
  const wanted=attendance==="confirmed"?["présent","present","oui"]:["pas présent","pas present","non","absent"];
  return field.options?.find(option=>wanted.includes(option.toLowerCase().trim()));
}
