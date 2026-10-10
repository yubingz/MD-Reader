// Tests for the reader's refresh path (issue #28).
//
// Why this exists: Ctrl+R / F5 used to fall through to the browser, so a
// refresh reloaded the page. The reader keeps no copy of the source text, so
// the reload wiped the document (on a launcher-generated page it re-injected
// the same stale `__PRELOAD_MD__` snapshot and lost the scroll position).
//
// Refresh is now an in-page action. This file asserts (a) the decision it
// makes — a pure function declared between `/* REFRESH:BEGIN */` and
// `/* REFRESH:END */`, extractable without a DOM — and (b) the wiring that
// reaches it, which the pure function cannot cover on its own.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, '..', 'md-reader.html');
const html = readFileSync(READER, 'utf8');

const BEGIN = '/* REFRESH:BEGIN */';
const END = '/* REFRESH:END */';

function loadRefresh(src = html, begin = BEGIN, end = END) {
  const start = src.indexOf(begin);
  const stop = src.indexOf(end);
  assert.ok(start >= 0 && stop > start, `${begin} / ${end} markers not found`);
  const section = src.slice(start + begin.length, stop);
  // eslint-disable-next-line no-new-func
  return new Function(section + '\nreturn { refreshAction: refreshAction };')();
}

const { refreshAction } = loadRefresh();

// The decision, called exactly as the reader calls it.
const action = (hasDoc, hasHandle, dirty) =>
  refreshAction({ hasDoc: hasDoc, hasHandle: hasHandle, dirty: dirty });

// ── The truth table ─────────────────────────────────────────────────────
test('no document -> noop (nothing to re-render, never reload)', () => {
  assert.equal(action(false, false, false), 'noop');
  assert.equal(action(false, true, false), 'noop');
  assert.equal(action(false, true, true), 'noop');
});

test('document without a handle -> rerender from memory', () => {
  assert.equal(action(true, false, false), 'rerender');
  // Unsaved edits with no handle still just re-render from memory (the
  // preview is rebuilt from the same `state.md`); no confirm is needed.
  assert.equal(action(true, false, true), 'rerender');
});

test('document with a handle -> re-read from disk', () => {
  assert.equal(action(true, true, false), 'reread');
});

test('document with a handle but unsaved edits -> confirm first', () => {
  assert.equal(action(true, true, true), 'confirm-then-reread');
});

test('the decision never returns a page reload', () => {
  const allowed = ['noop', 'rerender', 'reread', 'confirm-then-reread'];
  for (const hasDoc of [true, false]) {
    for (const hasHandle of [true, false]) {
      for (const dirty of [true, false]) {
        const a = action(hasDoc, hasHandle, dirty);
        assert.ok(allowed.includes(a), `unexpected refresh action: ${a}`);
      }
    }
  }
});

test('the decision discriminates all four states (non-constant)', () => {
  const results = new Set([
    action(false, false, false),
    action(true, false, false),
    action(true, true, false),
    action(true, true, true)
  ]);
  assert.equal(results.size, 4, `refreshAction must distinguish every state, got: ${[...results].join(', ')}`);
});

// ── Wiring the pure function cannot cover ───────────────────────────────
function keydownHandler(src) {
  const m = src.match(/document\.addEventListener\('keydown'[\s\S]*?\n  \}\);/);
  assert.ok(m, 'keydown handler not found');
  return m[0];
}

test('the reader intercepts F5 and Ctrl+R and cancels the reload', () => {
  const kd = keydownHandler(html);
  assert.match(kd, /'F5'/, 'F5 must be intercepted');
  assert.match(kd, /toLowerCase\(\) === 'r'/, 'Ctrl/Cmd+R must be intercepted');
  assert.match(kd, /preventDefault\(\)/, 'the browser default (reload) must be cancelled');
  assert.match(kd, /doRefresh\(\)/, 'the intercept must call the in-page refresh');
});

test('there is a refresh control in the toolbar, wired to the refresh', () => {
  assert.match(html, /id="btnRefresh"/, 'a refresh button must exist');
  assert.match(html, /\$\('btnRefresh'\)\.addEventListener\('click', doRefresh\)/, 'the button must call doRefresh');
});

// Pull a function body out by brace balance, so an assertion cannot be
// satisfied by an unrelated function elsewhere in the file.
function functionBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, `${name} not found in the reader`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body is not brace-balanced`);
}

test('the source text is kept and the open path can retain a file handle', () => {
  // Scoped to loadMarkdown: the assignment must carry the source text through,
  // not merely touch state.md somewhere in the file.
  assert.match(
    functionBody(html, 'loadMarkdown'),
    /state\.md\s*=\s*[^;]*\btext\b/,
    'loadMarkdown must keep its source text in state.md'
  );
  assert.match(html, /showOpenFilePicker/, 'the open path must be able to retain a file handle');
  assert.match(html, /state\.handle\s*=\s*handles\[0\]/, 'the picked handle must be stored');
  assert.match(html, /function render\(/, 'loadMarkdown must be split so open and refresh share one render path');
  assert.match(
    functionBody(html, 'doRefresh'),
    /render\(state\.md,\s*true\)/,
    'the no-handle refresh must re-render from the kept source'
  );
});

// ── Non-vacuity: the wiring assertions must really be able to fail ──────
test('the keydown assertions are non-vacuous', () => {
  const mutated = html.replace(/'F5'/g, "'F6'");
  const kd = keydownHandler(mutated);
  let threw = false;
  try {
    assert.match(kd, /'F5'/, 'F5 must be intercepted');
  } catch {
    threw = true;
  }
  assert.ok(threw, 'the F5 assertion must fail on a reader that does not intercept F5');
});

test('the markers are load-bearing', () => {
  const withoutMarkers = html.replace(BEGIN, '/* gone */').replace(END, '/* gone */');
  assert.throws(() => loadRefresh(withoutMarkers), /markers not found/);
});

// ── The two behaviours below were only asserted by source-shape regex, so a ──
// ── mutation could break them while the suite stayed green. They are driven ──
// ── here for real: `render` and `doRefresh` are extracted and run against ────
// ── stubs, so the assertions observe behaviour, not the presence of a line. ──

const REFRESH_BLOCK_END = '\n  function readFile(';

// Pull `render` + `doRefresh` out of the reader and run them with stubs for
// everything that needs a DOM. Returns the recorder the stubs write into.
function runRefresh({ md = '', handle = null, dirty = false, confirmAnswer = true } = {}) {
  // Start right after REFRESH:BEGIN so `refreshAction` comes along with `render`
  // and `doRefresh`; stop before readFile(), which needs a real FileReader.
  const start = html.indexOf(BEGIN) + BEGIN.length;
  assert.ok(start >= BEGIN.length, 'REFRESH:BEGIN not found');
  const stop = html.indexOf(REFRESH_BLOCK_END, start);
  assert.ok(stop > start, 'the render/doRefresh block has no end');
  const section = html.slice(start, stop);

  const calls = { scrollTo: [], toast: [], confirm: 0, rendered: [] };
  const contentEl = {};
  const state = { md, handle, dirty, hasDoc: true, fileName: 'x.md', filePath: '' };

  const sandbox = {
    state,
    contentEl,
    protectMath: t => ({ text: t, store: [] }),
    parseMarkdown: () => ({ html: '<p>x</p>', toc: [] }),
    restoreMathHtml: () => '<p>x</p>',
    cleanTocText: t => t,
    renderMath: () => {},
    loadKatex: () => Promise.resolve(false),
    upgradeMathWithKatex: () => {},
    renderToc: () => {},
    applyTocVisibility: () => {},
    bindCopyButtons: () => {},
    toast: m => calls.toast.push(m),
    window: {
      scrollY: 4242,
      scrollTo: o => calls.scrollTo.push(o),
      confirm: () => { calls.confirm++; return confirmAnswer; },
    },
    location: { hash: '' },
    document: { getElementById: () => null },
    decodeURIComponent,
    Promise
  };
  sandbox.globalThis = sandbox;

  const fn = new Function(...Object.keys(sandbox),
    section + '\nreturn { render, doRefresh };');
  return { api: fn(...Object.values(sandbox)), calls, state };
}

test('a refresh that keeps the scroll position does not jump to the top', () => {
  // The bug: refresh reloaded the page, which reset scroll to 0. `render(text, true)`
  // must restore the previous offset; only a fresh open (`keepScroll` false) goes to top.
  const a = runRefresh();
  a.api.render('hello', true);
  assert.deepEqual(a.calls.scrollTo, [{ top: 4242 }],
    'keepScroll=true must scroll back to the previous offset, not to the top');

  const b = runRefresh();
  b.api.render('hello', false);
  assert.deepEqual(b.calls.scrollTo, [{ top: 0 }],
    'opening a document must start at the top');
});

test('refresh with a retained handle re-reads from disk, not from memory', () => {
  // The behaviour the source-shape test could not reach: with a handle present,
  // doRefresh must call handle.getFile(), take the fresh text, and render THAT.
  const disk = 'FRESH FROM DISK';
  let getFileCalls = 0;
  const a = runRefresh({ md: 'STALE IN MEMORY', handle: {
    getFile: () => { getFileCalls++; return Promise.resolve({ text: () => Promise.resolve(disk) }); }
  } });

  a.api.doRefresh();
  assert.equal(getFileCalls, 1, 'a retained handle must be used to re-read the file');

  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.equal(a.state.md, disk,
      'the freshly read text must replace the stale in-memory copy');
    assert.ok(a.calls.toast.some(m => /Re-read from disk/.test(m)),
      'a successful disk re-read must be reported to the user');
  });
});

test('refresh without a handle falls back to memory and says so', () => {
  const a = runRefresh({ md: 'IN MEMORY', handle: null });
  a.api.doRefresh();
  assert.deepEqual(a.calls.scrollTo, [{ top: 4242 }],
    'the in-memory fallback must also keep the scroll position');
  assert.ok(a.calls.toast.some(m => /Re-rendered from memory/.test(m)),
    'the user must be told why the document came from memory');
});

test('an unsaved-edit refresh asks before discarding, and honours "no"', () => {
  const no = runRefresh({ dirty: true, handle: null, confirmAnswer: false });
  no.api.doRefresh();
  // No handle: the decision is `rerender`, not a confirm path — it must not prompt.
  assert.equal(no.calls.confirm, 0, 'the no-handle path must not prompt');

  const yes = runRefresh({ dirty: true, handle: { getFile: () => Promise.resolve({ text: () => Promise.resolve('x') }) } });
  yes.api.doRefresh();
  assert.equal(yes.calls.confirm, 1, 'unsaved edits with a handle must ask first');

  const refused = runRefresh({ dirty: true, confirmAnswer: false, handle: { getFile: () => Promise.resolve({ text: () => Promise.resolve('x') }) } });
  refused.api.doRefresh();
  assert.equal(refused.calls.scrollTo.length, 0,
    'declining the confirm must leave the reader untouched');
});
