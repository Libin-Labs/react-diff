import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  diffLines,
  splitTextLines,
  collapseDiff,
  toSideBySide,
  DIFF_LIMITS,
} from '../dist/esm/index.js';

const reconstruct = (lines, excluded) =>
  lines
    .filter((line) => line.kind !== excluded)
    .map((line) => line.text + (line.hasNewline ? '\n' : ''))
    .join('');

test('tokenization preserves LF, CRLF, empty lines and missing final newline', () => {
  assert.deepEqual(splitTextLines(''), []);
  assert.deepEqual(splitTextLines('a\r\n\nb'), ['a\r\n', '\n', 'b']);
  assert.deepEqual(splitTextLines('\n'), ['\n']);
});

test('empty, insertion and deletion results have exact counts and line numbers', () => {
  assert.deepEqual(diffLines('', ''), {
    lines: [],
    added: 0,
    removed: 0,
    unchanged: 0,
    coarse: false,
  });
  const added = diffLines('', 'a\nb');
  assert.equal(added.added, 2);
  assert.deepEqual(
    added.lines.map((l) => [l.oldLine, l.newLine]),
    [
      [null, 1],
      [null, 2],
    ],
  );
  assert.equal(diffLines('a\nb', '').removed, 2);
});

test('replacement preserves equal prefix/suffix and has deterministic remove-first ties', () => {
  const result = diffLines('a\nb\n', 'b\na\n');
  assert.deepEqual(
    result.lines.map((l) => [l.kind, l.text]),
    [
      ['remove', 'a'],
      ['equal', 'b'],
      ['add', 'a'],
    ],
  );
  const trimmed = diffLines('start\nold\nend\n', 'start\nnew\nend\n');
  assert.deepEqual([trimmed.added, trimmed.removed, trimmed.unchanged], [1, 1, 2]);
});

test('final newline and line-ending changes are not silently ignored', () => {
  const result = diffLines('a\n', 'a');
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.equal(diffLines('a\r\n', 'a\n').unchanged, 0);
});

test('comparison budget falls back before allocating a large matrix', () => {
  const result = diffLines('p\na\nb\ns\n', 'p\nb\na\ns\n', { maxCells: 1 });
  assert.equal(result.coarse, true);
  assert.deepEqual([result.added, result.removed, result.unchanged], [2, 2, 2]);
  assert.equal(reconstruct(result.lines, 'add'), 'p\na\nb\ns\n');
  assert.equal(reconstruct(result.lines, 'remove'), 'p\nb\na\ns\n');
  assert.equal(diffLines('same', 'same', { maxCells: 1 }).coarse, false);
});

test('many unrelated lines use bounded coarse fallback rather than quadratic work', () => {
  const before = Array.from({ length: 5000 }, (_, i) => `old-${i}\n`).join('');
  const after = Array.from({ length: 5000 }, (_, i) => `new-${i}\n`).join('');
  const result = diffLines(before, after);
  assert.equal(result.coarse, true);
  assert.equal(result.lines.length, 10000);
});

test('seeded randomized small diffs reconstruct both sources and attain LCS counts', () => {
  let seed = 41;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 200; trial++) {
    const a = Array.from({ length: random() % 9 }, () => String(random() % 4) + '\n');
    const b = Array.from({ length: random() % 9 }, () => String(random() % 4) + '\n');
    const result = diffLines(a.join(''), b.join(''));
    assert.equal(reconstruct(result.lines, 'add'), a.join(''));
    assert.equal(reconstruct(result.lines, 'remove'), b.join(''));
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    assert.equal(result.unchanged, dp[a.length][b.length]);
    assert.deepEqual(diffLines(a.join(''), b.join('')), result);
  }
});

test('context gaps use stable half-open ids and expand back to original rows', () => {
  const text = 'a\nb\nc\nd\ne\n';
  const lines = diffLines(text, text).lines;
  const collapsed = collapseDiff(lines, 1);
  assert.deepEqual(collapsed, [{ kind: 'gap', id: 'gap:0:5', start: 0, end: 5, count: 5 }]);
  assert.deepEqual(
    collapseDiff(lines, 1, ['gap:0:5']).map((r) => r.line),
    lines,
  );
});

test('context retains neighbors around changes without duplicates', () => {
  const result = diffLines('a\nb\nc\nd\ne\n', 'a\nb\nX\nd\ne\n');
  const rows = collapseDiff(result.lines, 1);
  assert.deepEqual(
    rows.map((r) => (r.kind === 'gap' ? r.id : r.line.text)),
    ['gap:0:1', 'b', 'c', 'X', 'd', 'gap:5:6'],
  );
  assert.equal(collapseDiff(result.lines, 0).filter((r) => r.kind === 'line').length, 2);
});

test('side-by-side pairs change blocks positionally and pads missing partners', () => {
  const result = toSideBySide(diffLines('old\n', 'new\nextra\n').lines);
  assert.deepEqual(
    result.map((r) => [r.left?.text ?? null, r.right?.text ?? null]),
    [
      ['old', 'new'],
      [null, 'extra'],
    ],
  );
});

test('all numeric and input caps validate consistently', () => {
  for (const options of [
    { maxLines: 0 },
    { maxLines: 20001 },
    { maxLines: NaN },
    { maxCells: 0 },
    { maxCells: 2000001 },
    { maxCells: 1.5 },
  ]) {
    assert.throws(() => diffLines('', '', options), RangeError);
  }
  assert.throws(() => diffLines('a\nb\n', '', { maxLines: 1 }), RangeError);
  assert.throws(() => splitTextLines('x'.repeat(2000001)), RangeError);
  assert.throws(() => splitTextLines('\n'.repeat(20001)), RangeError);
  assert.throws(() => collapseDiff([], -1), RangeError);
  assert.throws(() => collapseDiff([], Infinity), RangeError);
  assert.throws(() => toSideBySide(Array(40001).fill({ kind: 'equal' })), RangeError);
  assert.equal(Object.isFrozen(DIFF_LIMITS), true);
});

test('CommonJS and ESM expose matching helpers and component', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(typeof cjs.Diff, 'function');
  assert.deepEqual(cjs.diffLines('a', 'b'), diffLines('a', 'b'));
});
