export type TourRect = { left: number; top: number; width: number; height: number };
export function clipTourRect(rect: TourRect, viewport: { width: number; height: number }): TourRect | null {
  const left = Math.max(4, rect.left - 5), top = Math.max(4, rect.top - 5);
  const right = Math.min(viewport.width - 4, rect.left + rect.width + 5), bottom = Math.min(viewport.height - 4, rect.top + rect.height + 5);
  return rect.width > 0 && rect.height > 0 && right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}
export function placeTourCard(target: TourRect | null, viewport: { width: number; height: number }, card: { width: number; height: number }) {
  const width = Math.min(card.width, Math.max(1, viewport.width - 24)), height = Math.min(card.height, Math.max(1, viewport.height - 24));
  const clamp = (n: number, max: number) => Math.max(12, Math.min(n, Math.max(12, max)));
  const candidates = target ? [
    { left: target.left + target.width + 16, top: target.top },
    { left: target.left - width - 16, top: target.top },
    { left: target.left, top: target.top + target.height + 16 },
    { left: target.left, top: target.top - height - 16 },
  ] : [{ left: (viewport.width - width) / 2, top: (viewport.height - height) / 2 }];
  const positions = candidates.map((position) => ({ left: clamp(position.left, viewport.width - width - 12), top: clamp(position.top, viewport.height - height - 12) }));
  const overlap = (p: typeof positions[number]) => target ? Math.max(0, Math.min(p.left + width, target.left + target.width) - Math.max(p.left, target.left)) * Math.max(0, Math.min(p.top + height, target.top + target.height) - Math.max(p.top, target.top)) : 0;
  positions.sort((a, b) => overlap(a) - overlap(b));
  return { ...positions[0], width };
}
