import diff = require('@lp-labs/react-diff');

const options: diff.DiffOptions = { maxCells: 100 };
const result: diff.DiffResult = diff.diffLines('a', 'b', options);
const props: diff.DiffProps = { before: 'a', after: 'b' };
const rows: diff.DiffDisplayRow[] = diff.collapseDiff(result.lines);
void [
  props,
  rows,
  diff.Diff,
  diff.splitTextLines('a'),
  diff.toSideBySide(result.lines),
  diff.DIFF_LIMITS,
];
