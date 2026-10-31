# @lp-labs/react-diff

Package version: `1.0.0`.

Deterministic line comparison with inline and side-by-side React views,
counts, controlled unchanged-context expansion, and explicit work budgets.
React `^18.2 || ^19` is the only peer. No runtime dependencies. ESM and
CommonJS exports both include matching declarations.

## Install

```sh
npm install @lp-labs/react-diff react
```

```tsx
import { useState } from "react";
import { Diff } from "@lp-labs/react-diff";
import "@lp-labs/react-diff/styles.css";

export function CompareExample() {
  const [mode, setMode] = useState<"inline" | "side-by-side">("inline");
  const [expanded, setExpanded] = useState<string[]>([]);
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={mode === "side-by-side"}
          onChange={(event) => setMode(event.target.checked ? "side-by-side" : "inline")}
        />
        Side by side
      </label>
      <button type="button" onClick={() => setExpanded([])}>Collapse context</button>
      <Diff
        before={"Title\none\ntwo\nthree\nfour\nfive\n"}
        after={"Title\none\nchanged\nthree\nfour\nfive\n"}
        mode={mode}
        context={1}
        expandedGaps={expanded}
        onExpandedGapsChange={setExpanded}
      />
    </div>
  );
}
```

Text, mode, and expanded gaps are controlled. Callbacks propose expansion;
the component does not keep a hidden expansion set. Clear `expandedGaps` when
changing source texts if you do not want index-based gap ids carried over.
Without a callback, collapsed-gap buttons are disabled; use `showAll` for a
fully readable comparison without expansion controls.

## Exports and data shapes

- `Diff` and type `DiffProps`.
- `diffLines(before: string, after: string, options?: DiffOptions): DiffResult`.
- `splitTextLines(text: string): string[]`: LF-terminated tokens retaining
  terminators; empty text produces `[]`.
- `collapseDiff(lines: readonly DiffLine[], context = 3,
  expandedGaps: readonly string[] = []): DiffDisplayRow[]`.
- `toSideBySide(lines: readonly DiffLine[]): SideBySideRow[]`.
- Frozen `DIFF_LIMITS`: `{ textLength: 2000000, lines: 20000,
  cells: 2000000, context: 20000 }`.
- Types `DiffKind`, `DiffLine`, `DiffOptions`, `DiffResult`, `DiffGap`,
  `DiffDisplayLine`, `DiffDisplayRow`, `SideBySideRow`.

```ts
type DiffKind = "equal" | "add" | "remove";
interface DiffLine {
  kind: DiffKind;
  text: string;             // LF removed, CR preserved
  oldLine: number | null;   // 1-based; null on additions
  newLine: number | null;   // 1-based; null on removals
  hasNewline: boolean;      // Token had a terminating LF
}
interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  coarse: boolean;          // Middle section replaced after budget exhausted
}
```

`DiffOptions` has optional `maxLines` (default 10000 per source) and `maxCells`
(default 1000000). Helpers are pure for documented input shapes and do not
mutate their input arrays. Equality is exact, case-sensitive text equality,
including CR and presence/absence of LF. There is no whitespace ignoring,
normalization, syntax highlighting, intraline/character diff, or patch apply.
"Inline" means a unified sequence of changed **lines**, not character spans.

```tsx
import { diffLines, collapseDiff, toSideBySide } from "@lp-labs/react-diff";

const result = diffLines("keep\nold\n", "keep\nnew\n");
// added: 1, removed: 1, unchanged: 1, coarse: false
const contextRows = collapseDiff(result.lines, 1);
const pairs = toSideBySide(result.lines);
```

`DiffDisplayRow` is a discriminated union:

- `{ kind: "line", index: number, line: DiffLine }`: original diff index.
- `DiffGap = { kind: "gap", id: string, start: number, end: number,
  count: number }`: hidden half-open diff range, `count = end - start`,
  stable id `"gap:<start>:<end>"`.

`collapseDiff` keeps up to `context` equal lines on each side of a changed
block. Unchanged leading/trailing material outside that neighborhood becomes
gaps; a wholly unchanged document becomes a single gap. Zero context shows
only changes. Passing a gap id in `expandedGaps` restores that full range.
There is no partial expansion or internal recollapse state.

`SideBySideRow` is `{ left: DiffLine | null, right: DiffLine | null }`.
Equal lines appear on both sides. Adjacent remove/add blocks are paired
positionally and the shorter side is padded with `null`. Pairing does not
attempt semantic or character-similarity alignment.

## Props and defaults

`before` and `after` are required strings. All other props are optional.

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `before`, `after` | `string` | Required old/new text |
| `mode` | `"inline" \| "side-by-side"` | `"inline"` |
| `context` | `number` | `3`; integer 0-20000 |
| `expandedGaps` | `readonly string[]` | `[]` |
| `onExpandedGapsChange` | `(ids: string[], gapId: string) => void` | Full proposed set plus opened gap id |
| `showAll` | `boolean` | `false`; bypass collapsing, still validates context |
| `maxLines` | `number` | `10000`; integer 1-20000 per source |
| `maxCells` | `number` | `1000000`; integer 1-2000000 |
| `beforeLabel`, `afterLabel` | `string` | `"Before"`, `"After"` |
| `renderLine` | `(line: DiffLine) => ReactNode` | Original line text, LF removed |
| `className`, `style` | `string`, `CSSProperties` | `""`, no inline root style |
| `ariaLabel` | `string` | `"Text differences"` |

`renderLine` replaces line content, not numbering, signs, or final-newline
indicators. In side-by-side mode it may be invoked twice for an equal line.
No on-change callback for edits exists: this is a read-only comparison view.

## Algorithm, caps, and honest performance

1. Split into LF-preserving tokens, bounded to 20000 lines and 2000000 UTF-16
   code units per source. A final newline matters; CRLF and LF differ.
2. Intern line tokens to numeric ids for constant-time matrix comparisons,
   then remove exact common prefix/suffix from the comparison problem.
3. If both middle sections are nonempty and
   `(oldMiddleLines + 1) * (newMiddleLines + 1) <= maxCells`, use a typed
   longest-common-subsequence table. Ties remove before adding.
4. Otherwise emit the whole middle as removals followed by additions and
   return `coarse: true`. Prefix/suffix equality is still preserved.

The matrix is never allocated over the configured cap. Maximum table storage
is 2000000 32-bit cells (8 MB decimal), plus input tokens and output rows.
Expected time, including string-map interning, is O(input characters + line
count + budgeted matrix cells), not
unbounded O(oldLines * newLines). Output is at most 40000 rows under the hard
caps. Comparison is synchronous; allowed large inputs can still stall the
main thread. Budgets are not frame-time guarantees.

Under budget the LCS result is a minimal line insertion/deletion script, not
necessarily the human-preferred alignment. Over budget the result remains a
valid reconstruction of both texts but is deliberately **not minimal**.
The component announces coarse replacement visibly. It does not pretend a
fallback replacement is a precise comparison.

Invalid numeric caps/context, oversized source text, excessive source lines,
or more than 40000 rows passed to display helpers throw `RangeError`.
`splitTextLines` enforces hard limits; `diffLines` additionally enforces
`maxLines`. Display helpers expect genuine `DiffLine` arrays; they do not
validate arbitrary unknown row objects. Component errors propagate to your
React error boundary.

There is no worker, virtualization, streaming algorithm, binary/file-format
support, or patch generation. Collapsing reduces DOM only, not comparison
work. `showAll` or expanded gaps can mount every allowed row, and side-by-side
mode can double rendered text. Choose smaller application-specific budgets
and/or compute helpers outside interactive renders when needed.

## Customization and accessibility

```tsx
<Diff
  before="old"
  after="new"
  mode="side-by-side"
  showAll
  className="review-diff"
  beforeLabel="Saved"
  afterLabel="Draft"
  renderLine={(line) => <code>{line.text}</code>}
/>
```

Override `--lp-diff-add`, `--lp-diff-remove`, and `--lp-diff-ink` on `.lp-diff`.
Classes `lp-diff--add`, `lp-diff--remove`, and `lp-diff--equal` identify rows
or cells. Whitespace is preserved; long text wraps. Source text is escaped by
React; custom renderers must not inject untrusted HTML.

A real table has a caption, column headers, line numbers and explicit
`+`, `-`, `=` signs, so changes do not depend on color. Gap buttons use
native keyboard behavior and describe their hidden count. The table region
is labeled and keyboard-scrollable. Final-newline differences have visible
text labels. No custom grid/tree arrow-key behavior or automatic focus
relocation is claimed. Choose sufficient contrast when overriding colors.

## Provenance

Independently authored for this project using a standard
bounded LCS technique, not copied from another diff package. This provenance
statement is not a legal guarantee or substitute for license review.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
