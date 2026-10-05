import test from "node:test";
import assert from "node:assert/strict";
import { FONT_FILE_ACCEPT, FONT_MIME_TYPES, getFontFileFormat, getFontFaceFormat, getFontMimeType, getGlobalFontMetadata, normalizeFontFileFormat, UNSUPPORTED_FONT_MESSAGE } from "../supabase/functions/_shared/fontFormats.ts";
import { getFontFileInfo } from "../src/features/fonts/fontFile.ts";

test("TTF uses font/ttf even when the browser sends an empty or generic MIME", () => {
  for (const type of ["", "application/octet-stream", "application/x-font-ttf", "font/ttf"]) {
    assert.deepEqual(getFontFileInfo({ name: "STARWARS.ttf", size: 1234, type }), {
      format: "ttf", family: "STARWARS", mimeType: "font/ttf",
    });
  }
});

test("all four supported extensions use their canonical MIME and FontFace format", () => {
  assert.equal(FONT_FILE_ACCEPT, ".ttf,.otf,.woff,.woff2");
  for (const [format, mimeType] of Object.entries(FONT_MIME_TYPES)) {
    const info = getFontFileInfo({ name: `Police.${format.toUpperCase()}`, size: 100 });
    assert.equal(info.format, format);
    assert.equal(info.mimeType, mimeType);
    assert.equal(getFontFaceFormat(format), format === "ttf" ? "truetype" : format === "otf" ? "opentype" : format);
    assert.equal(getFontFileFormat(`owner/project/fonts/uuid-police.${format}`), format);
  }
});

test("unsupported extensions fail before upload with the requested error", () => {
  for (const name of ["image.png", "police.exe", "police.ttf.exe", "ttf", "font.", "font.__proto__"]) {
    assert.throws(() => getFontFileInfo({ name, size: 100 }), { message: UNSUPPORTED_FONT_MESSAGE });
  }
});

test("font size limits and existing project alias convention are preserved", () => {
  assert.equal(getFontFileInfo({ name: "Ma-police_custom.ttf", size: 8 * 1024 * 1024 }).family, "Ma police custom");
  for (const size of [0, 8 * 1024 * 1024 + 1]) assert.throws(() => getFontFileInfo({ name: "font.ttf", size }));
});

test("legacy truetype/opentype projects retain their rendering and canonical global metadata", () => {
  assert.equal(getFontFaceFormat("truetype"), "truetype");
  assert.equal(getFontFaceFormat("opentype"), "opentype");
  assert.equal(normalizeFontFileFormat("truetype"), "ttf");
  assert.equal(getFontMimeType("truetype"), "font/ttf");
  assert.equal(getFontMimeType("opentype"), "font/otf");
  assert.throws(() => normalizeFontFileFormat("invalid.ttf"));
});

test("global publication metadata derives canonical TTF format and MIME from the source asset", () => {
  const expected = { family: "STARWARS", format: "ttf", mimeType: "font/ttf" };
  assert.deepEqual(getGlobalFontMetadata({ family: "STARWARS", format: "ttf", mimeType: "application/octet-stream" }, "owner/project/fonts/uuid-STARWARS.ttf"), expected);
  assert.deepEqual(getGlobalFontMetadata({ family: "STARWARS", format: "truetype" }, "fonts/font.ttf"), expected);
  assert.throws(() => getGlobalFontMetadata({ family: "STARWARS", format: "woff2" }, "fonts/font.ttf"), /Invalid font metadata/);
  assert.throws(() => getGlobalFontMetadata({ family: "" }, "fonts/font.ttf"), /Invalid font metadata/);
});
