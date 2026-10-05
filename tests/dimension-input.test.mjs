import test from "node:test";
import assert from "node:assert/strict";
import { resolveDimensionDraft } from "../src/utils/dimensionInput.ts";

test("empty and incomplete drafts restore the last dimension rather than shrinking it", () => {
  for (const draft of ["", " ", "-", "1e", "NaN", "Infinity"]) assert.equal(resolveDimensionDraft(draft, 202, 12), 202);
});

test("a completed dimension is accepted, including decimal precision", () => {
  assert.equal(resolveDimensionDraft("117", 202, 12), 117);
  assert.equal(resolveDimensionDraft("117.5", 202, 12), 117.5);
});

test("minimum and maximum checks apply only when resolving the completed draft", () => {
  assert.equal(resolveDimensionDraft("1", 202, 12), 12);
  assert.equal(resolveDimensionDraft("0", 202, 12), 12);
  assert.equal(resolveDimensionDraft("-50", 202, 12), 12);
  assert.equal(resolveDimensionDraft("1200", 202, 120, 768), 768);
  assert.equal(resolveDimensionDraft("", 202, 120, 768), 202);
});
