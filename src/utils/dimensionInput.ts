/** Empty/incomplete input is an editing state, never a document dimension. */
export function resolveDimensionDraft(draft: string, currentValue: number, min: number, max?: number) {
  if (!draft.trim()) return currentValue;
  const parsed = Number(draft);
  if (!Number.isFinite(parsed)) return currentValue;
  return Math.min(max ?? Infinity, Math.max(min, parsed));
}
