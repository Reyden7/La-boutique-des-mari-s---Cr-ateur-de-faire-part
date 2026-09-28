export type ColorWithAlpha = {
  hex: string;
  alpha: number;
};

const byte = (value: number) => Math.round(Math.min(255, Math.max(0, value)));
const hexByte = (value: number) => byte(value).toString(16).padStart(2, "0");

export const parseColorWithAlpha = (value?: string): ColorWithAlpha => {
  const color = (value || "#000000").trim();
  if (color.toLowerCase() === "transparent") return { hex: "#000000", alpha: 0 };
  const shortHex = color.match(/^#([\da-f]{3})([\da-f])?$/i);
  if (shortHex) {
    const rgb = shortHex[1].split("").map((part) => part + part).join("");
    const alpha = shortHex[2] ? parseInt(shortHex[2] + shortHex[2], 16) / 255 : 1;
    return { hex: `#${rgb}`, alpha };
  }

  const longHex = color.match(/^#([\da-f]{6})([\da-f]{2})?$/i);
  if (longHex) {
    return {
      hex: `#${longHex[1]}`,
      alpha: longHex[2] ? parseInt(longHex[2], 16) / 255 : 1,
    };
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return {
      hex: `#${hexByte(Number(rgb[1]))}${hexByte(Number(rgb[2]))}${hexByte(Number(rgb[3]))}`,
      alpha: rgb[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgb[4]))),
    };
  }

  return { hex: "#000000", alpha: 1 };
};

export const toHex8 = (hex: string, alpha: number) => {
  const normalized = parseColorWithAlpha(hex).hex;
  return `${normalized}${hexByte(alpha * 255)}`;
};
