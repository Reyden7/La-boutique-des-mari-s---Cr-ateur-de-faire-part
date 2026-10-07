// Deterministic templates: exact original canvas/alpha, neutral RGB, no AI redraw.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function decodeRgba(bytes) {
  if (bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" || bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error("An 8-bit non-interlaced RGBA PNG is required.");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), chunks = [];
  for (let pos = 8; pos < bytes.length;) {
    const length = bytes.readUInt32BE(pos);
    if (bytes.toString("ascii", pos + 4, pos + 8) === "IDAT") chunks.push(bytes.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], offset = y * stride;
    if (filter > 4) throw new Error("Invalid PNG filter.");
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[offset + x - 4] : 0, b = y ? pixels[offset + x - stride] : 0, c = y && x >= 4 ? pixels[offset + x - stride - 4] : 0;
      pixels[offset + x] = (raw[y * (stride + 1) + 1 + x] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c))) & 255;
    }
  }
  return { width, height, pixels };
}

function chunk(name, data) {
  const type = Buffer.from(name), combined = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of combined) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, combined, checksum]);
}

export function neutralTemplate(bytes) {
  const { width, height, pixels } = decodeRgba(bytes), stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 4, target = y * (stride + 1) + 1 + x * 4;
    scanlines[target] = scanlines[target + 1] = scanlines[target + 2] = 160;
    scanlines[target + 3] = pixels[source + 3];
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = new URL("../public/envelope-templates/", import.meta.url);
  mkdirSync(output, { recursive: true });
  for (const [part, filename] of [["base", "base1"], ["flap", "rabat1"], ["seal", "cachet1"]]) {
    writeFileSync(new URL(`envelope-${part}-template.png`, output), neutralTemplate(readFileSync(new URL(`../public/assets/openings/envelope/${filename}.png`, import.meta.url))));
    console.log(`Generated exact-alpha ${part} template`);
  }
}
