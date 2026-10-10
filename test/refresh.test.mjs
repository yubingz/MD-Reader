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
