export const sanitizeExternalUrl = (value: string) => {
  const trimmed = value.trim();
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const directionsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
