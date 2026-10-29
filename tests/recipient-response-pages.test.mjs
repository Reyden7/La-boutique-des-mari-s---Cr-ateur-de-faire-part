import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let rows = [], calls = [], pageError = null;
globalThis.responsePagesMock = {
  requireSupabaseSession: async () => {},
  supabase: { from(table) {
    assert.equal(table, 'rsvp_responses');
    const query = {
      select: () => query,
      eq: (key, value) => { assert.equal(key, 'project_id'); assert.equal(value, 'owned-project'); return query; },
      order: () => query,
      range: (first, last) => {
        calls.push([first, last]);
        query.returns = async () => ({ data: rows.slice(first, last + 1), error: first > 0 ? pageError : null });
        return query;
      },
    };
    return query;
  } },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('/lib/supabase') && context.parentURL?.endsWith('/services/rsvpRepository.ts')) {
    return { url: 'data:text/javascript,export const {requireSupabaseSession,supabase}=globalThis.responsePagesMock', shortCircuit: true };
  }
  return next(specifier, context);
} });
const { loadRsvpResponses } = await import('../src/services/rsvpRepository.ts');

test('response dashboard loads every page, beyond the REST default limit', async () => {
  rows = Array.from({ length: 1203 }, (_, id) => ({ id: String(id) })); calls = [];
  const result = await loadRsvpResponses('owned-project');
  assert.equal(result.length, 1203);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(new Set(result.map(row => row.id)).size, 1203);
});

test('a failed subsequent page never becomes a silently truncated dashboard', async () => {
  pageError = new Error('Disconnected'); calls = [];
  await assert.rejects(loadRsvpResponses('owned-project'), /Disconnected/);
  pageError = null;
});
