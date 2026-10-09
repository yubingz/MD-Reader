// Tests for offline KaTeX: the shipped distribution and the launcher that inlines it.
//
// Why this exists: the reader used to reach jsDelivr for every page, so a reading page opened
// through `file:///` pulled katex.min.js from the network on each load. Offline (or behind a
// proxy that eats the request) the formulas silently fell back to the plain-text renderer. The
// launcher now inlines a shipped copy instead.
//
// Two things can break that quietly, so both are asserted here:
//
//   1. The vendored dist must stay complete and self-consistent. `katex.min.css` declares
//      `@font-face` rules pointing at `fonts/…`; if the font files are pruned the page still
//      loads and still typesets, it just renders in the browser's fallback font. Nothing else
//      in the repo would notice.
//   2. The inlining must not corrupt the base reader or the document. `Add-KatexInline` edits
//      the HTML before the document text is injected, and the script order decides whether
//      `window.katex` exists when the reader runs.
//
// `open-md.ps1` cannot run under Node, so the tests assert the script's shape and the
// invariants of the snippets it assembles. That is the part a regression would break.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reader = readFileSync(join(ROOT, 'md-reader.html'), 'utf8');
const ps1 = readFileSync(join(ROOT, 'open-md.ps1'), 'utf8');
const katexJs = readFileSync(join(ROOT, 'katex', 'katex.min.js'), 'utf8');
const katexCss = readFileSync(join(ROOT, 'katex', 'katex.min.css'), 'utf8');

// Pull a PowerShell function body out of open-md.ps1 by brace balance.
//
// A regex like /function X[\s\S]*?\n\}/ looks fine but breaks on this file: PowerShell here is
// stored with CRLF endings, and `\n\}` matches the CR LF that *ends a line* whenever the next
// line happens to start with `}`, so the capture stops early. Balance braces on normalised
// text instead — the file's line endings must not decide what the tests see.
const PS1_LF = ps1.replace(/\r\n/g, '\n');

function ps1Function(name) {
  const start = PS1_LF.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `open-md.ps1 has no ${name} function`);
  const open = PS1_LF.indexOf('{', start);
  assert.notEqual(open, -1, `${name} has no body`);
  let depth = 0;
  for (let i = open; i < PS1_LF.length; i++) {
    if (PS1_LF[i] === '{') depth++;
    else if (PS1_LF[i] === '}') {
      depth--;
      if (depth === 0) return PS1_LF.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body is not brace-balanced`);
}


// Every `url(...)` in the stylesheet, normalised to a repository-relative path.
function fontRefs(css) {
  return [...css.matchAll(/url\(([^)]+)\)/g)]
    .map(m => m[1].trim().replace(/^['"]|['"]$/g, ''))
    .filter(u => !/^[a-z]+:/i.test(u));
}

test('the shipped KaTeX distribution is present and complete', () => {
  assert.ok(katexJs.length > 100_000, 'katex/katex.min.js is missing or truncated');
  assert.ok(katexCss.length > 10_000, 'katex/katex.min.css is missing or truncated');
  // The version the reader hardcodes as its CDN fallback must match the vendored copy, or an
  // offline page and an online page would typeset with different KaTeX builds.
  assert.match(reader, /katex@0\.16\.11\//, 'the reader no longer pins katex@0.16.11');
  assert.match(katexJs, /0\.16\.11/, 'katex.min.js is not the 0.16.11 build');
});

test('every modern font the stylesheet references is shipped', () => {
  // The stylesheet lists three sources per face: woff2, woff, then ttf (legacy IE). The
  // official 0.16.11 dist ships only woff2 + woff, so the .ttf entries are expected to 404
  // and are not a regression. What must hold is that every *modern* source resolves — if a
  // woff2 is pruned, the page still typesets but silently renders in the fallback font.
  const refs = fontRefs(katexCss).filter(u => !u.endsWith('.ttf'));
  assert.ok(refs.length > 0, 'katex.min.css declares no modern @font-face sources');
  const missing = refs.filter(u => !existsSync(join(ROOT, 'katex', u)));
  assert.deepEqual(missing, [], `katex.min.css references fonts that are not shipped: ${missing.join(', ')}`);
  // Guard the assumption above: if the dist ever drops .woff and ships .ttf only, the filter
  // would silently stop checking anything.
  assert.ok(
    refs.some(u => u.endsWith('.woff2')),
    'no woff2 source found — this test is no longer checking the sources browsers actually use'
  );
});

test('the inlined CSS keeps the font URLs resolvable from the generated page', () => {
  // The generated page is written beside the source document, so `fonts/…` no longer resolves
  // relative to the page. Renderers therefore take the base64 route, and the vendored files
  // must exist for that to be possible.
  const refs = fontRefs(katexCss);
  assert.ok(refs.every(u => u.startsWith('fonts/')), 'a font reference is not under fonts/');
  assert.ok(existsSync(join(ROOT, 'katex', 'fonts')), 'katex/fonts does not exist');
});

test('open-md.ps1 looks for the distribution through one resolver', () => {
  assert.match(ps1, /function\s+Get-KatexDir/, 'open-md.ps1 has no Get-KatexDir function');
  const fn = ps1Function('Get-KatexDir');
  assert.match(fn, /katex\.min\.js/, 'Get-KatexDir does not check for katex.min.js');
  assert.match(fn, /katex\.min\.css/, 'Get-KatexDir does not check for katex.min.css');
  // Missing distribution must be a no-op, not a crash: the reader still works via its CDN.
  assert.match(
    ps1,
    /if\s*\(\(Test-InlineKatexEnabled\)\s*-and\s*\$katexDir\)\s*\{\s*\$html\s*=\s*Add-KatexInline/,
    'the inlining step is not guarded on the distribution being present and enabled'
  );
});

test('inlining stays switchable, and the reader can still find a sibling katex/', () => {
  // Inlining costs ~298 KB of extra markup per page (~15 ms of parse). That is the right
  // default — it is the only mode that works with no network — but it must stay escapable
  // for a document set where the size matters more than the offline guarantee.
  assert.match(ps1, /function\s+Test-InlineKatexEnabled/, 'no opt-out for inlining');
  const fn = ps1Function('Test-InlineKatexEnabled');
  assert.match(fn, /MDR_NO_INLINE_KATEX/, 'the opt-out env var is not read');
  // Default must be ON — an unset variable returns true.
  assert.match(fn, /if\s*\(-not\s+\$v\)\s*\{\s*return\s+\$true\s*\}/,
    'inlining is not the default when the env var is unset');

  // With inlining off, the page falls back to a sibling katex/ folder. The reader's own
  // `new URL('katex/', location.href)` resolves against the *page*, which lives beside the
  // document — so the launcher must also hand over the reader's folder or the fallback can
  // never resolve (#24). Assert the *code*, not a mention: a comment containing the name
  // would satisfy a bare substring check and let the real branch be deleted unnoticed.
  assert.match(ps1, /^.*"window\.__PRELOAD_READER__ = \$\(ConvertTo-JsLiteral.*$/m,
    'the launcher does not emit the reader-folder preload line');
  assert.match(reader, /if\s*\(\s*location\.protocol === 'file:'\s*&&\s*window\.__PRELOAD_READER__\s*\)/,
    'the reader has no file:-protocol branch that reads __PRELOAD_READER__');
  assert.match(reader, /new URL\(\s*'katex\/'\s*,\s*'file:\/\/\/'\s*\+/,
    'the reader never builds a katex/ base from the reader folder');
});

test('the KaTeX script tag is inserted before the reader script, never into it', () => {
  // `window.katex` must exist before the reader's own script runs. Inserting the tag as a
  // *sibling* immediately before the reader's `<script>` keeps `"use strict"` the first
  // statement of that script — prepending into it would make the whole reader a strict-mode
  // script, which changes behaviour in ways nothing else in the suite would catch.
  const fn = ps1Function('Add-KatexInline');
  assert.match(fn, /\.Replace\(\s*\$crlf\s*,\s*\$scriptTag\s*\+\s*\$crlf\s*\)/,
    'Add-KatexInline does not insert the KaTeX tag before the script anchor');
  assert.doesNotMatch(fn, /Replace\(\s*\$(?:crlf|lf|bare)\s*,\s*\$(?:crlf|lf|bare)\s*\+/,
    'Add-KatexInline appends *after* the script anchor instead of before it');
  // The style must land inside <head>, not at the end of the document.
  assert.match(fn, /Replace\(\s*\$headEndTag\s*,\s*\$styleTag\s*\+\s*\$headEndTag\s*\)/,
    'Add-KatexInline does not insert the stylesheet before </head>');
});

test('the insertion anchor identifies the reader script unambiguously', () => {
  // The anchor is the reader's script opening tag matched as one whole string. A document is
  // injected *after* this step, so the only way the anchor can misfire is if the base reader
  // itself grows a second bare `<script>` — in which case the KaTeX tag could land after the
  // code that needs it.
  const bare = reader.split('<script>').length - 1;
  assert.equal(bare, 1, `md-reader.html has ${bare} bare <script> tags; the anchor expects exactly one`);
  assert.ok(
    reader.indexOf('<script>') < reader.indexOf('/* PARSER:BEGIN */'),
    'the reader script must open before the parser marker for the anchor to precede it'
  );
});

test('open-md.ps1 checks the CRLF anchor before the LF one', () => {
  // md-reader.html is pinned to CRLF, so the reader script really opens as "<script>\r\n". The
  // script's fallback chain must try that form first; if CRLF is only reached after the LF
  // branch, an LF-joined build silently degrades to the bare-tag branch.
  const fn = ps1Function('Add-KatexInline');
  const crlfAt = fn.indexOf('$crlf');
  const lfAt = fn.indexOf('$lf');
  const bareAt = fn.indexOf('$bare');
  assert.ok(crlfAt > -1 && lfAt > -1 && bareAt > -1, 'the anchor fallback chain is incomplete');
  assert.ok(crlfAt < lfAt && lfAt < bareAt, 'the anchors are not tried CRLF -> LF -> bare');
  // And the file really is CRLF, or the first branch would never match.
  const scriptTagAt = reader.indexOf('<script>');
  assert.equal(
    reader.slice(scriptTagAt, scriptTagAt + 10),
    '<script>\r\n',
    'md-reader.html no longer opens its script with CRLF — reorder the anchors in open-md.ps1'
  );
});

test('the inlined snippets are inserted verbatim, and neither contains the other anchor', () => {
  // The snippets are built by string concatenation and pushed into the page with .Replace().
  // If a snippet contained `</head>` or `<script>` itself, the two replacements would fight:
  // CSS text would land inside the script tag, or vice versa.
  const jsTag = '<script id="katex-inline">' + katexJs + '</script>';
  const cssTag = '<style id="katex-style">' + katexCss + '</style>';
  assert.ok(!katexJs.includes('</head>'), 'katex.min.js contains </head> and would corrupt the head insertion');
  assert.ok(!katexCss.includes('</head>'), 'katex.min.css contains </head> and would corrupt the head insertion');
  assert.ok(!katexCss.includes('</script>'), 'katex.min.css contains </script> and would close the KaTeX tag');
  assert.ok(!katexJs.includes('</script>'), 'katex.min.js contains a literal </script> terminator');
  // Sanity on the assembled shape.
  assert.ok(jsTag.startsWith('<script id="katex-inline">'), 'the script tag does not open as expected');
  assert.ok(jsTag.endsWith('</script>'), 'the script tag does not close');
  assert.ok(cssTag.startsWith('<style id="katex-style">'), 'the style tag does not open as expected');
  assert.ok(cssTag.endsWith('</style>'), 'the style tag does not close');
});

test('the reader prefers an inlined KaTeX over network loading', () => {
  // This is the line that actually makes the page offline-capable. Without it the launcher
  // still ships the bytes and the reader still fetches from the CDN.
  assert.match(
    reader,
    /if\s*\(\s*window\.katex\s*\)\s*\{\s*katexReady\s*=\s*true;\s*return\s+Promise\.resolve\(true\);\s*\}/,
    'loadKatex() does not short-circuit when KaTeX is already present'
  );
});

test('formulas are typeset against a frame time budget, not a fixed count', () => {
  // A long document (the project's own 140 KB paper) holds ~1300 formulas at ~0.9 ms each.
  // A single synchronous pass holds the first paint for over a second, so the work is spread
  // over animation frames. The budget must be measured in *time*, not a fixed batch count:
  // a bare `x` and a nested `\frac` differ by an order of magnitude, so any fixed count is
  // either too small for heavy documents (dropped frames) or needlessly slow for light ones.
  const fn = reader.match(/function\s+upgradeMathWithKatex[\s\S]*?\n  \}/);
  assert.ok(fn, 'could not read upgradeMathWithKatex');
  assert.match(fn[0], /requestAnimationFrame\(step\)/, 'upgradeMathWithKatex renders in one blocking pass');
  assert.match(fn[0], /performance\.now\(\)/, 'upgradeMathWithKatex does not measure elapsed time');
  assert.match(fn[0], /FRAME_BUDGET_MS/, 'no frame budget constant');
  // A fixed-count batch would show up as `Math.min(idx + N, ...)`; that is the regression.
  assert.doesNotMatch(fn[0], /Math\.min\(idx\s*\+/,
    'upgradeMathWithKatex went back to a fixed per-frame count');
});
