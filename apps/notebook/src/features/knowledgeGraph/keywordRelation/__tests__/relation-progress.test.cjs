const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const { createRelationInferenceProgress } = loadTs('relationProgress.ts');

test('live progress reads fresh counts during pending inference and stops on completion or abort', (t) => {
  const timers = new Map();
  let next = 0;
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    assert.equal(delay, 2000);
    timers.set(++next, callback);
    return next;
  });
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));
  const state = {
    model: 'nli',
    phase: 'validation',
    unit: 'validation',
    total: 200,
    processed: 0,
    modelChecks: 1,
    modelFailures: 0,
    inFlightInputChars: 100,
  };
  const output = [];
  const tracker = createRelationInferenceProgress(
    () => ({ ...state }),
    (p) => output.push(p)
  );
  const tick = timers.get(1);
  now = 2000;
  state.processed = 3;
  tick();
  assert.equal(output.at(-1).processed, 3);
  assert.equal(output.at(-1).elapsedMs, 2000);
  state.phase = 'retry';
  tick();
  assert.equal(output.at(-1).phase, 'retry');
  tracker.finish('failed');
  assert.equal(output.at(-1).status, 'failed');
  assert.equal(timers.size, 0);
  const count = output.length;
  tick();
  assert.equal(output.length, count);
  const controller = new AbortController();
  const cancelled = createRelationInferenceProgress(
    () => state,
    (p) => output.push(p),
    controller.signal
  );
  const stale = timers.get(2);
  controller.abort();
  const countAfterAbort = output.length;
  stale();
  cancelled.finish();
  assert.equal(timers.size, 0);
  assert.equal(output.length, countAfterAbort);
});
