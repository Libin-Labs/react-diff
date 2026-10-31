import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  collapseDiff,
  diffLines,
  toSideBySide,
  type DiffDisplayRow,
  type DiffLine,
  type DiffOptions,
} from './diff.js';

export interface DiffProps extends DiffOptions {
  before: string;
  after: string;
  mode?: 'inline' | 'side-by-side';
  context?: number;
  expandedGaps?: readonly string[];
  onExpandedGapsChange?: (ids: string[], gapId: string) => void;
  showAll?: boolean;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  renderLine?: (line: DiffLine) => ReactNode;
}

const EMPTY: readonly string[] = [];

export function Diff({
  before,
  after,
  maxLines = 10_000,
  maxCells = 1_000_000,
  mode = 'inline',
  context = 3,
  expandedGaps = EMPTY,
  onExpandedGapsChange,
  showAll = false,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
  style,
  ariaLabel = 'Text differences',
  renderLine,
}: DiffProps): ReactNode {
  const result = useMemo(
    () => diffLines(before, after, { maxLines, maxCells }),
    [before, after, maxLines, maxCells],
  );
  // Validate context even when showAll is enabled.
  const collapsed = useMemo(
    () => collapseDiff(result.lines, context, expandedGaps),
    [result, context, expandedGaps],
  );
  const display: DiffDisplayRow[] = showAll
    ? result.lines.map((line, index) => ({ kind: 'line', index, line }))
    : collapsed;
  const content = (line: DiffLine): ReactNode => (
    <span className="lp-diff__text">
      {renderLine ? renderLine(line) : line.text}
      {!line.hasNewline && <span className="lp-diff__newline"> [No newline at end]</span>}
    </span>
  );
  const gap = (row: Extract<DiffDisplayRow, { kind: 'gap' }>): ReactNode => (
    <tr key={row.id}>
      <td colSpan={mode === 'inline' ? 4 : 6} className="lp-diff__gap">
        <button
          type="button"
          disabled={!onExpandedGapsChange}
          onClick={() => onExpandedGapsChange?.([...new Set([...expandedGaps, row.id])], row.id)}
        >
          Show {row.count} unchanged lines
        </button>
      </td>
    </tr>
  );
  const rendered: ReactNode[] = [];
  let pending: DiffLine[] = [];
  let block = 0;
  const flush = (): void => {
    if (!pending.length) return;
    const rows = toSideBySide(pending);
    const blockKey = block++;
    rows.forEach((row, index) => {
      rendered.push(
        <tr key={`pair-${blockKey}-${index}`}>
          <td className="lp-diff__number">{row.left?.oldLine ?? ''}</td>
          <td className={`lp-diff__sign lp-diff--${row.left?.kind ?? 'empty'}`}>
            {row.left?.kind === 'remove' ? '-' : row.left ? '=' : ''}
          </td>
          <td className={`lp-diff--${row.left?.kind ?? 'empty'}`}>
            {row.left && content(row.left)}
          </td>
          <td className="lp-diff__number">{row.right?.newLine ?? ''}</td>
          <td className={`lp-diff__sign lp-diff--${row.right?.kind ?? 'empty'}`}>
            {row.right?.kind === 'add' ? '+' : row.right ? '=' : ''}
          </td>
          <td className={`lp-diff--${row.right?.kind ?? 'empty'}`}>
            {row.right && content(row.right)}
          </td>
        </tr>,
      );
    });
    pending = [];
  };
  for (const row of display) {
    if (row.kind === 'gap') {
      flush();
      rendered.push(gap(row));
    } else if (mode === 'side-by-side') {
      pending.push(row.line);
    } else {
      const line = row.line;
      rendered.push(
        <tr key={row.index} className={`lp-diff--${line.kind}`}>
          <td className="lp-diff__number">{line.oldLine ?? ''}</td>
          <td className="lp-diff__number">{line.newLine ?? ''}</td>
          <td className="lp-diff__sign">
            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : '='}
          </td>
          <td>{content(line)}</td>
        </tr>,
      );
    }
  }
  flush();
  return (
    <section className={`lp-diff ${className}`} style={style} aria-label={ariaLabel}>
      <p className="lp-diff__summary">
        +{result.added} added; -{result.removed} removed; {result.unchanged} unchanged
      </p>
      {result.coarse && (
        <p role="status">Comparison budget reached; middle section shown as a replacement.</p>
      )}
      <div className="lp-diff__scroll" role="region" aria-label="Diff table" tabIndex={0}>
        <table>
          <caption>
            {beforeLabel} compared with {afterLabel}; + added, - removed, = unchanged
          </caption>
          <thead>
            {mode === 'inline' ? (
              <tr>
                <th scope="col">{beforeLabel}</th>
                <th scope="col">{afterLabel}</th>
                <th scope="col">Change</th>
                <th scope="col">Text</th>
              </tr>
            ) : (
              <tr>
                <th scope="col">Old line</th>
                <th scope="col">Change</th>
                <th scope="col">{beforeLabel}</th>
                <th scope="col">New line</th>
                <th scope="col">Change</th>
                <th scope="col">{afterLabel}</th>
              </tr>
            )}
          </thead>
          <tbody>{rendered}</tbody>
        </table>
        {result.lines.length === 0 && <p>Both texts are empty</p>}
      </div>
    </section>
  );
}
