import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("src/components/editor/EditorWorkspace.tsx");
const styles = read("src/styles.css");

test("device toolbar is editor chrome, outside the scrolling canvas host", () => {
  assert.match(workspace, /<main className="editor-workspace">/);
  assert.match(workspace, /<\/div>\s*<div className="editor-main">\{children\}<\/div>/);
  assert.match(read("src/pages/EditorPage.tsx"), /<EditorWorkspace[\s\S]*?<EditorCanvas \/>/);
});

test("toolbar is anchored to the central cell, below topbar, independently of scroll", () => {
  assert.match(styles, /\.editor-workspace \{[^}]*position: relative[^}]*isolation: isolate/);
  assert.match(styles, /\.editor-main \{[^}]*overflow: auto/);
  assert.match(styles, /\.editor-preview-toolbar \{[^}]*position: absolute[^}]*top: var\(--editor-toolbar-gap\)[^}]*left: 50%/);
  assert.doesNotMatch(styles, /\.editor-preview-toolbar \{[^}]*position: fixed/);
});

test("public/preview do not render editor workspace or its device switcher", () => {
  for (const path of ["src/components/preview/PreviewMode.tsx", "src/components/renderer/WeddingRenderer.tsx", "src/features/music/InvitationExperience.tsx", "src/pages/PublicInvitePage.tsx"]) {
    const source = read(path);
    assert.doesNotMatch(source, /EditorWorkspace|PreviewDeviceSwitcher|editor-preview-toolbar/);
  }
});
