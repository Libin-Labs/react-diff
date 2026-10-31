export type DiffKind = 'equal' | 'add' | 'remove';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
  hasNewline: boolean;
}

export interface DiffOptions {
  maxLines?: number;
  maxCells?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  coarse: boolean;
}

export interface DiffGap {
  kind: 'gap';
  id: string;
  start: number;
  end: number;
  count: number;
}

export interface DiffDisplayLine {
  kind: 'line';
  index: number;
  line: DiffLine;
}

export type DiffDisplayRow = DiffGap | DiffDisplayLine;

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export const DIFF_LIMITS = Object.freeze({
  textLength: 2_000_000,
  lines: 20_000,
  cells: 2_000_000,
  context: 20_000,
});

function integer(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

/** Tokens retain LF terminators, so a missing final newline is a real change. */
export function splitTextLines(text: string): string[] {
  if (text.length > DIFF_LIMITS.textLength)
    throw new RangeError('Text exceeds DIFF_LIMITS.textLength');
  if (!text) return [];
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (lines.length === DIFF_LIMITS.lines) throw new RangeError('Text exceeds DIFF_LIMITS.lines');
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline + 1;
    lines.push(text.slice(start, end));
    start = end;
  }
  return lines;
}

/** Prefix/suffix trimming plus strictly budgeted LCS; ties remove before adding. */
export function diffLines(before: string, after: string, options: DiffOptions = {}): DiffResult {
  const maxLines = options.maxLines ?? 10_000;
  const maxCells = options.maxCells ?? 1_000_000;
  integer('maxLines', maxLines, 1, DIFF_LIMITS.lines);
  integer('maxCells', maxCells, 1, DIFF_LIMITS.cells);
  const left = splitTextLines(before);
  const right = splitTextLines(after);
  if (left.length > maxLines || right.length > maxLines) {
    throw new RangeError('Input exceeds maxLines');
  }
  const tokens = new Map<string, number>();
  const intern = (token: string): number => {
    let id = tokens.get(token);
    if (id === undefined) {
      id = tokens.size;
      tokens.set(token, id);
    }
    return id;
  };
  const leftIds = left.map(intern);
  const rightIds = right.map(intern);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && leftIds[prefix] === rightIds[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    leftIds[left.length - suffix - 1] === rightIds[right.length - suffix - 1]
  )
    suffix++;
  const n = left.length - prefix - suffix;
  const m = right.length - prefix - suffix;
  const cells = (n + 1) * (m + 1);
  const coarse = n > 0 && m > 0 && cells > maxCells;
  const lines: DiffLine[] = [];
  let oldNumber = 1;
  let newNumber = 1;
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  const emit = (kind: DiffKind, token: string): void => {
    const hasNewline = token.endsWith('\n');
    lines.push({
      kind,
      text: hasNewline ? token.slice(0, -1) : token,
      oldLine: kind === 'add' ? null : oldNumber++,
      newLine: kind === 'remove' ? null : newNumber++,
      hasNewline,
    });
    if (kind === 'add') added++;
    else if (kind === 'remove') removed++;
    else unchanged++;
  };
  for (let index = 0; index < prefix; index++) emit('equal', left[index]!);
  if (!n || !m || coarse) {
    for (let index = 0; index < n; index++) emit('remove', left[prefix + index]!);
    for (let index = 0; index < m; index++) emit('add', right[prefix + index]!);
  } else {
    const width = m + 1;
    const table = new Uint32Array(cells);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          leftIds[prefix + i] === rightIds[prefix + j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && leftIds[prefix + i] === rightIds[prefix + j]) {
        emit('equal', left[prefix + i]!);
        i++;
        j++;
      } else if (i < n && (j === m || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) {
        emit('remove', left[prefix + i++]!);
      } else {
        emit('add', right[prefix + j++]!);
      }
    }
  }
  for (let index = left.length - suffix; index < left.length; index++) emit('equal', left[index]!);
  return { lines, added, removed, unchanged, coarse };
}

function validateRows(lines: readonly DiffLine[]): void {
  if (lines.length > DIFF_LIMITS.lines * 2) throw new RangeError('Too many diff rows');
}

/** Stable gap ids use half-open indexes into the original diff rows. */
export function collapseDiff(
  lines: readonly DiffLine[],
  context = 3,
  expandedGaps: readonly string[] = [],
): DiffDisplayRow[] {
  validateRows(lines);
  integer('context', context, 0, DIFF_LIMITS.context);
  const expanded = new Set(expandedGaps);
  const rows: DiffDisplayRow[] = [];
  let index = 0;
  const emitLine = (position: number): void => {
    rows.push({ kind: 'line', index: position, line: lines[position]! });
  };
  while (index < lines.length) {
    if (lines[index]!.kind !== 'equal') {
      emitLine(index++);
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index]!.kind === 'equal') index++;
    const end = index;
    const visibleBefore = start > 0 ? Math.min(context, end - start) : 0;
    const visibleAfter = end < lines.length ? Math.min(context, end - start - visibleBefore) : 0;
    const hiddenStart = start + visibleBefore;
    const hiddenEnd = end - visibleAfter;
    for (let position = start; position < hiddenStart; position++) emitLine(position);
    if (hiddenEnd > hiddenStart) {
      const id = `gap:${hiddenStart}:${hiddenEnd}`;
      if (expanded.has(id)) {
        for (let position = hiddenStart; position < hiddenEnd; position++) emitLine(position);
      } else {
        rows.push({
          kind: 'gap',
          id,
          start: hiddenStart,
          end: hiddenEnd,
          count: hiddenEnd - hiddenStart,
        });
      }
    }
    for (let position = hiddenEnd; position < end; position++) emitLine(position);
  }
  return rows;
}

/** Pairs adjacent change blocks by position, not by character similarity. */
export function toSideBySide(lines: readonly DiffLine[]): SideBySideRow[] {
  validateRows(lines);
  const result: SideBySideRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.kind === 'equal') {
      result.push({ left: line, right: line });
      index++;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && lines[index]!.kind !== 'equal') {
      const change = lines[index++]!;
      (change.kind === 'remove' ? removed : added).push(change);
    }
    for (let row = 0; row < Math.max(removed.length, added.length); row++) {
      result.push({ left: removed[row] ?? null, right: added[row] ?? null });
    }
  }
  return result;
}
