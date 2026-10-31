import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Diff } = await import('../dist/esm/index.js');

function mount(t, element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  t.after(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, render: (node) => act(() => root.render(node)) };
}

test('inline mode shows counts, line numbers and escaped source with no HTML injection', (t) => {
  const { host } = mount(t, h(Diff, { before: 'a\n', after: '<img src=x>\n', showAll: true }));
  assert.match(
    host.querySelector('.lp-diff__summary').textContent,
    /\+1 added; -1 removed; 0 unchanged/,
  );
  assert.equal(host.querySelector('img'), null);
  assert.equal(host.querySelectorAll('tbody tr').length, 2);
  assert.equal(host.querySelectorAll('thead th').length, 4);
  assert.match(host.querySelector('caption').textContent, /Before compared with After/);
});

test('gap expansion uses controlled callback and an application can reset it', (t) => {
  const events = [];
  function Demo() {
    const [gaps, setGaps] = useState([]);
    return h(
      'div',
      null,
      h('button', { onClick: () => setGaps([]) }, 'Reset'),
      h(Diff, {
        before: 'a\nb\nc\n',
        after: 'a\nb\nc\n',
        context: 0,
        expandedGaps: gaps,
        onExpandedGapsChange: (next, id) => {
          events.push(id);
          setGaps(next);
        },
      }),
    );
  }
  const { host } = mount(t, h(Demo));
  assert.equal(host.querySelectorAll('tbody tr').length, 1);
  act(() => host.querySelector('.lp-diff__gap button').click());
  assert.equal(host.querySelectorAll('tbody tr').length, 3);
  assert.deepEqual(events, ['gap:0:3']);
  act(() => host.querySelector('button').click());
  assert.ok(host.querySelector('.lp-diff__gap'));
});

test('side-by-side mode switches on props, pairs rows and supports custom content', (t) => {
  const props = { before: 'old\n', after: 'new\nextra', showAll: true };
  const { host, render } = mount(t, h(Diff, props));
  render(
    h(Diff, {
      ...props,
      mode: 'side-by-side',
      beforeLabel: 'Saved',
      afterLabel: 'Edited',
      renderLine: (line) => h('strong', null, line.text.toUpperCase()),
    }),
  );
  assert.equal(host.querySelectorAll('thead th').length, 6);
  assert.equal(host.querySelectorAll('tbody tr').length, 2);
  assert.match(host.textContent, /Saved compared with Edited/);
  assert.equal(host.querySelector('strong').textContent, 'OLD');
  assert.match(host.textContent, /No newline at end/);
});

test('coarse fallback and read-only collapse are announced; empty comparison is clear', (t) => {
  const { host, render } = mount(
    t,
    h(Diff, {
      before: 'a\nb\n',
      after: 'b\na\n',
      maxCells: 1,
    }),
  );
  assert.match(host.querySelector('[role="status"]').textContent, /budget reached/);
  render(h(Diff, { before: 'same\n', after: 'same\n' }));
  assert.equal(host.querySelector('button').disabled, true);
  render(h(Diff, { before: '', after: '' }));
  assert.match(host.textContent, /Both texts are empty/);
});
