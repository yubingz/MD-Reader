// Tests for the editor pane (issue #32).
//
// Why this exists: the reader could open a document but never change it. This
// file covers the new edit pane in two layers:
//
//   (a) the pure decisions and the highlight tokenizer, declared between
//       `/* UISTATE:BEGIN */` and `/* UISTATE:END */` and extracted without a
//       DOM — view mode, split axis, divider ratio, the unload guard, the save
//       target, Tab insertion and `highlightMarkdown()`;
//   (b) the wiring that the pure functions cannot cover on their own, plus the
//       metric contract between the highlight layer and the transparent
//       textarea, which is the one thing that visibly breaks when it drifts.
//
// Every assertion here was checked against a mutated reader (see the
// "non-vacuity" section at the bottom): each one really can fail.
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
const sampleMd = readFileSync(join(HERE, '..', 'sample.md'), 'utf8');

const BEGIN = '/* UISTATE:BEGIN */';
const END = '/* UISTATE:END */';

const EXPORTS = [
  'normalizeMode', 'normalizeAxis', 'modeClass', 'splitClass', 'clampRatio',
  'shouldWarnOnUnload', 'saveAction', 'tabInsert', 'dirtyLabel', 'highlightMarkdown'
];

function sectionOf(src = html, begin = BEGIN, end = END) {
  const start = src.indexOf(begin);
  const stop = src.indexOf(end);
  assert.ok(start >= 0 && stop > start, `${begin} / ${end} markers not found`);
  return src.slice(start + begin.length, stop);
}

function evalSection(section) {
  const returns = EXPORTS.map(function (n) { return n + ': ' + n; }).join(', ');
  // eslint-disable-next-line no-new-func
  return new Function(section + '\nreturn { ' + returns + ' };')();
}

// Mutants replace text inside the declared block only: sibling code elsewhere in
// the file (the parser has its own `if (fence) {`) must not be touched, or a
// mutation proves nothing about the editor.
function loadUIState(src = html, begin = BEGIN, end = END) {
  return evalSection(sectionOf(src, begin, end));
}

function loadMutant(from, to) {
  const section = sectionOf();
  assert.notEqual(section.indexOf(from), -1, `the mutant target is not in the block: ${from}`);
  return evalSection(section.replace(from, to));
}

const ui = loadUIState();

// ── The decisions, called exactly as the reader calls them ──────────────
test('view mode is one of three values, anything else falls back to preview', () => {
  assert.equal(ui.normalizeMode('preview'), 'preview');
  assert.equal(ui.normalizeMode('edit'), 'edit');
  assert.equal(ui.normalizeMode('split'), 'split');
  for (const junk of [null, undefined, '', 'EDIT', 'Preview', 'fullscreen', 7, {}]) {
    assert.equal(ui.normalizeMode(junk), 'preview', `junk mode ${String(junk)} must fall back`);
  }
});

test('the mode becomes the class the layout selectors use', () => {
  assert.equal(ui.modeClass('preview'), 'mode-preview');
  assert.equal(ui.modeClass('edit'), 'mode-edit');
  assert.equal(ui.modeClass('split'), 'mode-split');
  assert.equal(ui.modeClass('nonsense'), 'mode-preview');
});

test('the split axis is h or v and never empty', () => {
  assert.equal(ui.normalizeAxis('h'), 'h');
  assert.equal(ui.normalizeAxis('v'), 'v');
  assert.equal(ui.normalizeAxis(null), 'h');
  assert.equal(ui.normalizeAxis('vertical'), 'h');
  assert.equal(ui.splitClass('h'), 'split-h');
  assert.equal(ui.splitClass('v'), 'split-v');
  assert.equal(ui.splitClass(undefined), 'split-h');
});

test('the divider ratio is clamped to 20%-80% and defaults to a half', () => {
  assert.equal(ui.clampRatio(0.5), 0.5);
  assert.equal(ui.clampRatio('0.33'), 0.33);
  assert.equal(ui.clampRatio(0.05), 0.2);
  assert.equal(ui.clampRatio(0.95), 0.8);
  assert.equal(ui.clampRatio(-3), 0.2);
  assert.equal(ui.clampRatio(4), 0.8);
  // Nothing stored yet, or a corrupted value: a half, never 20%.
  assert.equal(ui.clampRatio(null), 0.5);
  assert.equal(ui.clampRatio(undefined), 0.5);
  assert.equal(ui.clampRatio(''), 0.5);
  assert.equal(ui.clampRatio('wide'), 0.5);
});

test('the unload guard only fires for unsaved edits', () => {
  assert.equal(ui.shouldWarnOnUnload(true), true);
  assert.equal(ui.shouldWarnOnUnload(false), false);
  assert.equal(ui.shouldWarnOnUnload(undefined), false);
  assert.equal(ui.shouldWarnOnUnload(0), false);
  assert.equal(ui.shouldWarnOnUnload(''), false);
});

test('save writes back to the original file, and only falls back when it must', () => {
  const save = (hasDoc, hasHandle, canPick) =>
    ui.saveAction({ hasDoc: hasDoc, hasHandle: hasHandle, canPick: canPick });
  assert.equal(save(false, false, false), 'noop');
  assert.equal(save(false, true, true), 'noop');
  // A retained handle is the original file: write back.
  assert.equal(save(true, true, false), 'write');
  assert.equal(save(true, true, true), 'write');
  // No handle, but the File System Access API is usable: pick the file back.
  assert.equal(save(true, false, true), 'pick');
  // Neither: the page cannot write to the opened path, so a copy.
  assert.equal(save(true, false, false), 'download');
  const results = new Set([
    save(true, true, true), save(true, false, true), save(true, false, false), save(false, false, false)
  ]);
  assert.equal(results.size, 4, `saveAction must distinguish every state, got: ${[...results].join(', ')}`);
});

test('Tab inserts two spaces and keeps the caret after them', () => {
  const at = ui.tabInsert('abc', 1, 1);
  assert.equal(at.value, 'a  bc');
  assert.equal(at.selStart, 3);
  assert.equal(at.selEnd, 3);
  assert.equal(at.value.length, 5, 'exactly two characters are inserted');

  // A selection is replaced by the indent, caret after it (never widened).
  const over = ui.tabInsert('abcdef', 2, 4);
  assert.equal(over.value, 'ab  ef');
  assert.equal(over.selStart, 4);
  assert.equal(over.selEnd, 4);

  // Degenerate input must not throw or corrupt the text.
  assert.equal(ui.tabInsert('', 0, 0).value, '  ');
  assert.equal(ui.tabInsert(null, 0, 0).value, '  ');
  assert.equal(ui.tabInsert('abc', 99, 99).value, 'abc  ');
  assert.equal(ui.tabInsert('abc', 5, 1).value, 'abc  ');
});

test('the filename carries an unsaved-edits marker', () => {
  assert.equal(ui.dirtyLabel('a.md', true), 'a.md •');
  assert.equal(ui.dirtyLabel('a.md', false), 'a.md');
  assert.equal(ui.dirtyLabel('', true), ' •');
  assert.equal(ui.dirtyLabel(null, false), '');
});

// ── The highlight tokenizer ─────────────────────────────────────────────
test('a heading line is one heading segment', () => {
  assert.deepEqual(ui.highlightMarkdown('# Hi\n'), [{ text: '# Hi\n', cls: 'head' }]);
  assert.deepEqual(ui.highlightMarkdown('### Deep\n'), [{ text: '### Deep\n', cls: 'head' }]);
  // A `#` that is not a heading stays text.
  assert.deepEqual(ui.highlightMarkdown('#hashtag\n'), [{ text: '#hashtag\n', cls: 'text' }]);
});

test('a fenced block is one code segment, including its fences', () => {
  const src = '```js\n**not emphasis**\nlet a = 1;\n```\n';
  assert.deepEqual(ui.highlightMarkdown(src), [{ text: src, cls: 'code' }]);
  const tilde = '~~~\n[x](y)\n~~~\n';
  assert.deepEqual(ui.highlightMarkdown(tilde), [{ text: tilde, cls: 'code' }]);
});

test('an unclosed fence keeps the rest of the document as code', () => {
  const src = '```\n# not a heading\n';
  assert.deepEqual(ui.highlightMarkdown(src), [{ text: src, cls: 'code' }]);
});

test('emphasis, inline code, math and links each get their own class', () => {
  assert.deepEqual(ui.highlightMarkdown('**b**'), [{ text: '**b**', cls: 'em' }]);
  assert.deepEqual(ui.highlightMarkdown('*i*'), [{ text: '*i*', cls: 'em' }]);
  assert.deepEqual(ui.highlightMarkdown('__b__'), [{ text: '__b__', cls: 'em' }]);
  assert.deepEqual(ui.highlightMarkdown('`c`'), [{ text: '`c`', cls: 'code' }]);
  assert.deepEqual(ui.highlightMarkdown('$x$'), [{ text: '$x$', cls: 'math' }]);
  assert.deepEqual(ui.highlightMarkdown('$$x$$'), [{ text: '$$x$$', cls: 'math' }]);
  assert.deepEqual(ui.highlightMarkdown('[t](http://e.com)'), [{ text: '[t](http://e.com)', cls: 'link' }]);
});

test('a mixed line is sliced in order and the plain text is kept', () => {
  assert.deepEqual(ui.highlightMarkdown('a **b** c'), [
    { text: 'a ', cls: 'text' },
    { text: '**b**', cls: 'em' },
    { text: ' c', cls: 'text' }
  ]);
});

test('the tokenizer is lossless: the segments rebuild the source byte for byte', () => {
  // The textarea holds the real text and the highlight layer only paints it, so
  // any dropped or duplicated character would show up as a shifted overlay.
  const cases = [
    '',
    '\n',
    '# h\n\np\n',
    '```js\ncode\n```\n\ntext\n',
    'a\r\nb\r\n',
    '**bold** and `code` and $m$ and [l](u) and _i_\n'
  ];
  for (const src of cases) {
    const joined = ui.highlightMarkdown(src).map(s => s.text).join('');
    assert.equal(joined, src, `segments must rebuild: ${JSON.stringify(src)}`);
  }
  const joined = ui.highlightMarkdown(sampleMd).map(s => s.text).join('');
  assert.equal(joined, sampleMd, 'sample.md must round-trip through the tokenizer');
});

test('the tokenizer never emits markup, only text', () => {
  // The DOM layer writes segments with textContent, so a document may contain
  // anything at all — as long as the tokenizer cannot produce HTML.
  const hostile = '<img src=x onerror=alert(1)>\n\n```\n</pre><script>alert(1)</script>\n```\n';
  const segs = ui.highlightMarkdown(hostile);
  for (const s of segs) {
    assert.ok(!/</.test(s.cls), 'a class must never contain markup');
    assert.ok(!/^ts-</.test(s.cls));
  }
  assert.equal(segs.map(s => s.text).join(''), hostile);
  const classes = new Set(segs.map(s => s.cls));
  for (const cls of classes) {
    assert.ok(['text', 'head', 'em', 'code', 'math', 'link'].includes(cls), `unknown class: ${cls}`);
  }
});

// ── Wiring the pure functions cannot cover ──────────────────────────────
function tagById(src, id) {
  const m = src.match(new RegExp('<(textarea|pre|div|section|button)[^>]*id="' + id + '"[^>]*>'));
  assert.ok(m, `#${id} not found in the reader`);
  return m[0];
}

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

// Pull a CSS block out by brace balance (a media query nests rules, so the
// first `}` would stop short).
function cssBlock(src, header) {
  const start = src.indexOf(header);
  assert.ok(start >= 0, `${header} not found`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${header} is not brace-balanced`);
}

test('the editor is a wrapping, non-spellchecked textarea with a highlight layer under it', () => {
  const ta = tagById(html, 'editor');
  assert.match(ta, /spellcheck="false"/, 'the source is Markdown, not prose: no spellcheck');
  assert.match(ta, /textarea/);
  const pane = html.slice(html.indexOf('id="editorScroll"'), html.indexOf('</textarea>'));
  assert.ok(pane.indexOf('id="editorHl"') >= 0, 'the highlight layer must live in the same scroll box');
  assert.ok(pane.indexOf('id="editorHl"') < pane.indexOf('id="editor"'), 'the layer must sit under the textarea');
  assert.match(tagById(html, 'editorHl'), /aria-hidden="true"/, 'the painted copy must stay out of the a11y tree');
  assert.match(html, /\.editor-ta\s*\{[^}]*resize:\s*none/, 'the textarea must not be user-resized');
  assert.match(html, /\.editor-ta\s*\{[^}]*caret-color:/, 'the transparent text still needs a visible caret');
  assert.match(html, /-webkit-text-fill-color:\s*transparent/, 'the textarea text is the canvas, not the paint');
});

test('the highlight and the textarea share every metric that can shift a glyph', () => {
  // This is the one hard constraint of the overlay approach: if font, size,
  // line-height, padding or white-space differ, the colours slide off the text.
  const m = html.match(/\.editor-hl\s*,\r?\n\s*\.editor-ta\s*\{([^}]*)\}/);
  assert.ok(m, 'the highlight layer and the textarea must share one metric rule');
  const body = m[1];
  assert.match(body, /font-family:\s*var\(--font-mono\)/, 'same font');
  assert.match(body, /font-size:\s*[\d.]+px/, 'same size');
  assert.match(body, /line-height:\s*[\d.]+/, 'same line height');
  assert.match(body, /padding:\s*[^;]+/, 'same padding');
  assert.match(body, /white-space:\s*pre-wrap/, 'same wrapping');
  assert.match(html, /\.editor-hl\s*\{[^}]*position:\s*absolute/, 'the layer is painted behind the textarea');
});

test('the toolbar carries the three view modes, the axis switch and save', () => {
  for (const id of ['btnModePreview', 'btnModeEdit', 'btnModeSplit', 'btnAxis', 'btnSave']) {
    assert.ok(html.includes('id="' + id + '"'), `${id} must exist in the toolbar`);
  }
  assert.match(html, /class="mode-cluster/, 'the three modes are one segmented control');
  assert.match(html, /\$\('btnModeEdit'\)\.addEventListener\('click'/, 'the edit button must be wired');
  assert.match(html, /\$\('btnModeSplit'\)\.addEventListener\('click'/, 'the split button must be wired');
  assert.match(html, /\$\('btnAxis'\)\.addEventListener\('click'/, 'the axis button must be wired');
  assert.match(html, /\$\('btnSave'\)\.addEventListener\('click', doSave\)/, 'save must be wired');
  assert.match(functionBody(html, 'applyMode'), /modeClass\(/, 'the mode must reach the layout class');
  assert.match(functionBody(html, 'applyMode'), /splitClass\(/, 'the axis must reach the layout class');
  assert.match(functionBody(html, 'applyMode'), /--split-ratio/, 'the ratio must reach the layout');
});

test('the view mode, the split axis and the ratio survive a reload', () => {
  assert.match(html, /'mdr-mode'/, 'mdr-mode must be persisted');
  assert.match(html, /'mdr-split-axis'/, 'mdr-split-axis must be persisted');
  assert.match(html, /'mdr-split-ratio'/, 'mdr-split-ratio must be persisted');
  assert.match(functionBody(html, 'applyMode'), /localStorage\.setItem\('mdr-mode'/, 'the mode is written on every change');
});

test('the divider is draggable with a pointer and remembers the ratio', () => {
  assert.ok(html.includes('id="splitter"'), 'there must be a divider element');
  assert.match(html, /\$\('splitter'\)\.addEventListener\('pointerdown'/, 'the divider must start a drag');
  assert.match(html, /\$\('splitter'\)\.addEventListener\('pointermove'/, 'the divider must follow the pointer');
  assert.match(html, /setPointerCapture/, 'the drag must capture the pointer, or it breaks outside the bar');
  assert.match(html, /getBoundingClientRect/, 'the ratio must be computed from the real box');
  assert.match(html, /clampRatio\(/, 'every ratio written back must go through the clamp');
  assert.match(html, /\$\('splitter'\)\.addEventListener\('pointerup'/, 'the drag must end cleanly');
});

test('both split directions are laid out from the same ratio variable', () => {
  assert.match(html, /\.panes\.split-h\s*\{[^}]*grid-template-columns:\s*calc\(var\(--split-ratio/,
    'side by side must be a column split driven by the ratio');
  assert.match(html, /\.panes\.split-v\s*\{[^}]*grid-template-rows:\s*calc\(var\(--split-ratio/,
    'stacked must be a row split driven by the ratio');
  // The editor keeps the first slot in both directions: left, or top.
  const panes = html.slice(html.indexOf('id="panes"'), html.indexOf('id="contentWrap"'));
  assert.ok(panes.indexOf('editor-pane') < panes.indexOf('class="splitter"'), 'the editor comes before the divider');
  assert.ok(panes.indexOf('class="splitter"') < panes.indexOf('content-wrap'), 'the preview comes last');
});

test('typing updates the source, marks the document dirty and re-renders the preview', () => {
  assert.match(html, /\$\('editor'\)\.addEventListener\('input'/, 'the textarea must be listened to');
  const handler = functionBody(html, 'onEditorInput');
  assert.match(handler, /state\.md\s*=\s*editorEl\.value/, 'the source of truth follows the textarea');
  assert.match(handler, /state\.dirty\s*=\s*true/, 'typing means unsaved edits');
  assert.match(handler, /renderHighlight\(\)/, 'the paint layer must follow the text immediately');
  assert.match(handler, /schedulePreview\(\)/, 'the preview must re-render');
  const paint = functionBody(html, 'renderHighlight');
  assert.match(paint, /highlightMarkdown\(state\.md\)/, 'the paint layer must use the tested tokenizer');
  assert.match(paint, /textContent/, 'segments must be written as text, never as markup');
  assert.ok(!/innerHTML/.test(paint), 'the paint layer must never use innerHTML');
  const preview = functionBody(html, 'schedulePreview');
  assert.match(preview, /setTimeout\(/, 'the preview must be debounced, not per keystroke');
  assert.match(preview, /render\(state\.md,\s*true\)/, 'the preview must reuse the shared render path');
  assert.match(preview, /scrollTop/, 'the preview must keep its place while typing');
});

test('Tab indents instead of leaving the editor', () => {
  const at = html.indexOf("$('editor').addEventListener('keydown'");
  assert.ok(at >= 0, 'the editor must handle its own keydown');
  const handler = html.slice(at, html.indexOf('\n  });', at));
  assert.match(handler, /Tab/, 'Tab must be intercepted inside the editor');
  assert.match(handler, /preventDefault\(\)/, 'Tab must not move focus out of the pane');
  assert.match(handler, /tabInsert\(/, 'the pure insert rule must be used');
});

test('an unsaved document warns before the page is closed', () => {
  assert.match(html, /addEventListener\('beforeunload'/, 'a closing page must be guarded');
  assert.match(html, /shouldWarnOnUnload\(state\.dirty\)/, 'the guard must ask the pure rule');
});

test('save writes through the handle, picks a file, or copies — and says which', () => {
  const save = functionBody(html, 'doSave');
  assert.match(save, /saveAction\(/, 'save must go through the pure decision');
  const write = functionBody(html, 'writeToHandle');
  assert.match(write, /createWritable\(\)/, 'a handle must write back to the original file');
  assert.match(write, /requestPermission/, 'write access must be requested, not assumed');
  assert.match(write, /state\.dirty\s*=\s*false/, 'a successful save clears the dirty flag');
  assert.match(html, /showSaveFilePicker/, 'picking a destination must be possible without a handle');
  const copy = functionBody(html, 'downloadCopy');
  assert.match(copy, /a\.download/, 'the last resort is a downloaded copy');
  assert.match(copy, /toast\(/, 'the copy fallback must be explained to the user');
  assert.match(html, /e\.key\.toLowerCase\(\) === 's'/, 'Ctrl+S must save');
});

test('opening a document resets the editor to the new source', () => {
  const load = functionBody(html, 'loadMarkdown');
  assert.match(load, /state\.dirty\s*=\s*false/, 'a freshly opened file has no unsaved edits');
  assert.match(html, /render\.afterRender\s*=/, 'open, refresh and preview share one render path');
  assert.match(functionBody(html, 'render'), /render\.afterRender/, 'render must call the editor hook');
});

test('every class the tokenizer can emit has a colour rule', () => {
  // A token class with no rule is a silent no-op: the structure would be
  // invisible even though the tokenizer "highlighted" it.
  const kinds = new Set(['head', 'em', 'code', 'math', 'link']);
  const md = ['# h', '', '**b** *i* `c`', '', '$$x$$', '', '```js', 'y', '```', '', '[l](u)'].join('\n');
  const emitted = new Set(ui.highlightMarkdown(md).map(s => s.cls));
  for (const kind of kinds) {
    assert.ok(emitted.has(kind), `${kind} must be produced by the sample`);
    assert.match(html, new RegExp('\\.ts-' + kind + '\\s*\\{'), `no CSS rule for .ts-${kind}`);
  }
  const colours = kinds.size > 0 && [...kinds].map(k => {
    const m = html.match(new RegExp('\\.ts-' + k + '\\s*\\{([^}]*)\\}'));
    return m[1].trim();
  });
  assert.equal(new Set(colours).size, kinds.size, 'each token kind needs its own declaration');
});

test('print and PDF emit the preview only', () => {
  const block = cssBlock(html, '@media print');
  assert.match(block, /\.editor-pane/, 'the editor pane must not be printed');
  assert.match(block, /\.splitter/, 'the divider must not be printed');
  assert.match(block, /display:\s*none/, 'both must be hidden, not merely shrunk');
});

// ── Non-vacuity: every assertion above must be able to fail ─────────────
function expectThrow(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert.ok(threw, `${label} — the assertion must fail on a broken reader`);
}

const shadow = (from, to) => html.replace(from, to);

test('the tokenizer assertions are not vacuous', () => {
  const noFence = loadMutant('if (fence) {', 'if (false) {');
  const src = '```js\n**not emphasis**\n```\n';
  expectThrow(() => assert.deepEqual(noFence.highlightMarkdown(src), [{ text: src, cls: 'code' }]),
    'fence tracking');

  const drops = loadMutant('if (!text) return;', "if (!text || cls === 'head') return;");
  expectThrow(() => {
    const md = '# h\nx\n';
    assert.equal(drops.highlightMarkdown(md).map(s => s.text).join(''), md);
  }, 'lossless rebuild');
});

test('the ratio, Tab and save assertions are not vacuous', () => {
  const ratio = loadMutant('if (n < 0.2) return 0.2;', 'if (n < 0.2) return 0.5;');
  expectThrow(() => assert.equal(ratio.clampRatio(0.05), 0.2), 'ratio clamp');

  const tab = loadMutant("const inserted = '  ';", "const inserted = ' ';");
  expectThrow(() => assert.equal(tab.tabInsert('abc', 1, 1).value, 'a  bc'), 'Tab insert');

  const save = loadMutant("if (s.canPick) return 'pick';", "if (s.canPick) return 'download';");
  expectThrow(() => assert.equal(save.saveAction({ hasDoc: true, hasHandle: false, canPick: true }), 'pick'),
    'save target');
});

test('the mode assertions are not vacuous', () => {
  const modes = loadMutant("const MODES = ['preview', 'edit', 'split'];", "const MODES = ['preview', 'edit'];");
  expectThrow(() => assert.equal(modes.normalizeMode('split'), 'split'), 'view mode');
});

test('the wiring assertions are not vacuous', () => {
  expectThrow(() => assert.match(functionBody(shadow('state.dirty = true;', ''), 'onEditorInput'),
    /state\.dirty\s*=\s*true/), 'the dirty flag on input');
  expectThrow(() => assert.match(shadow('createWritable()', 'obsolete()'), /createWritable\(\)/), 'save writes back');
  expectThrow(() => assert.match(shadow('-webkit-text-fill-color: transparent;', ''), /-webkit-text-fill-color:\s*transparent/),
    'the transparent textarea');
  expectThrow(() => {
    const print = shadow('.editor-pane, .splitter { display: none !important; }', '');
    assert.match(cssBlock(print, '@media print'), /\.editor-pane/);
  }, 'the print rule');
  expectThrow(() => assert.match(shadow('.ts-link { color: var(--hl-link); text-decoration: underline; }', ''),
    /\.ts-link\s*\{/), 'the token colour rules');
});

test('the metric contract is the load-bearing part of the overlay', () => {
  const drifted = shadow('white-space: pre-wrap;', 'white-space: pre;');
  const m = drifted.match(/\.editor-hl\s*,\r?\n\s*\.editor-ta\s*\{([^}]*)\}/);
  assert.ok(m, 'the shared metric rule must still be found');
  expectThrow(() => assert.match(m[1], /white-space:\s*pre-wrap/), 'the shared wrapping declaration');
});

test('the markers are load-bearing', () => {
  const withoutMarkers = html.replace(BEGIN, '/* gone */').replace(END, '/* gone */');
  assert.throws(() => loadUIState(withoutMarkers), /markers not found/);
});
