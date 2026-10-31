import {
  Diff,
  diffLines,
  splitTextLines,
  collapseDiff,
  toSideBySide,
  DIFF_LIMITS,
  type DiffProps,
  type DiffKind,
  type DiffLine,
  type DiffOptions,
  type DiffResult,
  type DiffGap,
  type DiffDisplayLine,
  type DiffDisplayRow,
  type SideBySideRow,
} from '@lp-labs/react-diff';

const options: DiffOptions = { maxCells: 100 };
const result: DiffResult = diffLines('a', 'b', options);
const rows: DiffDisplayRow[] = collapseDiff(result.lines);
const pairs: SideBySideRow[] = toSideBySide(result.lines);
const kind: DiffKind = 'equal';
const line: DiffLine = { kind, text: 'a', oldLine: 1, newLine: 1, hasNewline: false };
const display: DiffDisplayLine = { kind: 'line', line, index: 0 };
const gap: DiffGap = { kind: 'gap', id: 'gap:0:1', start: 0, end: 1, count: 1 };
const props: DiffProps = { before: 'a', after: 'b' };
void [Diff, props, rows, pairs, display, gap, splitTextLines('a'), DIFF_LIMITS];
