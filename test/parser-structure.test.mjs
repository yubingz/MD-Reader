// Block-structure tests for md-reader.html
//
// Four block-level constructs used to render incorrectly:
//
//   1. a nested list put the inner <ul> as a *sibling* of <li>, not a child;
//   2. a 4-backtick fence was not recognised, so a block that shows a fenced
//      block inside a fence fell apart into paragraphs;
//   3. a setext h2 (`Title` + `-----`) was eaten by the <hr> branch;
//   4. `\|` inside a table cell split the cell.
//
// These tests exercise the real parser, extracted from the reader the same way
// the app runs it, and assert on the HTML it produces.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, '..', 'md-reader.html');

const BEGIN = '/* PARSER:BEGIN */';
const END = '/* PARSER:END */';

function loadParser(htmlPath = READER) {
  const html = readFileSync(htmlPath, 'utf8');
  const start = html.indexOf(BEGIN);
  const stop = html.indexOf(END);
  assert.ok(start >= 0 && stop > start, `${BEGIN} / ${END} markers not found in ${htmlPath}`);
  const section = html.slice(start + BEGIN.length, stop);
  // eslint-disable-next-line no-new-func
  return new Function(
    section + '\nreturn { parseMarkdown: parseMarkdown };'
  )();
}

const { parseMarkdown } = loadParser();
const render = (md) => parseMarkdown(md).html;
// Strip the whitespace the parser emits between tags, so the assertions see
// only the tag structure (they must not depend on the newline layout).
const compact = (html) =>
  html
    .replace(/\s+/g, ' ')
    .replace(/\s+</g, '<')
    .replace(/>\s+/g, '>')
    .trim();

// ── Regression: issue #14 · nested lists ────────────────────────────────
// The inner list used to be emitted as a sibling of the outer <li>, which is
// invalid HTML and renders at the wrong indent.

test('a nested list opens inside the current <li>', () => {
  assert.equal(compact(render('- a\n  - b\n- c')), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
});

test('three levels of nesting close in order', () => {
  assert.equal(
    compact(render('- a\n  - b\n    - c\n- d')),
    '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>'
  );
});

test('a flat list is unchanged by the nesting fix', () => {
  assert.equal(compact(render('- a\n- b\n- c')), '<ul><li>a</li><li>b</li><li>c</li></ul>');
});

test('an ordered list nested in a bullet list nests too', () => {
  assert.equal(compact(render('- a\n  1. b\n- c')), '<ul><li>a<ol><li>b</li></ol></li><li>c</li></ul>');
});

// ── Regression: issue #14 · 4-backtick / 4-tilde fences ─────────────────
// The opening fence used to require exactly three backticks, so the outer
// fence leaked out as a paragraph and the inner block was destroyed.

test('a 4-backtick fence keeps the inner 3-backtick block', () => {
  const html = render('````\n```\ninner\n```\n````');
  assert.match(html, /<pre><code[^>]*>/, 'a code block is opened');
  assert.ok(html.includes('```'), 'the literal inner fence stays in the code body');
  assert.ok(html.includes('inner'), 'the inner content stays');
  assert.ok(!/<p>````<\/p>/.test(html), 'the outer fence must not leak as a paragraph');
});

test('a 4-tilde fence is recognised and closed by 4 tildes', () => {
  const html = render('~~~~\ncode\n~~~~');
  assert.match(html, /<pre><code[^>]*>/, 'a code block is opened');
  assert.ok(html.includes('code'), 'the body is kept');
  assert.ok(!html.includes('~~~~'), 'the fence markers must not appear in the output');
});

test('a longer fence is only closed by a fence at least as long', () => {
  const html = render('`````\n```\n````\ncode\n`````');
  assert.ok(html.includes('````'), 'a shorter fence inside stays literal');
  assert.ok(!/<p>`````<\/p>/.test(html), 'the outer fence must not leak');
});

test('a plain 3-backtick fence still renders as before', () => {
  assert.equal(compact(render('```\ncode\n```')), '<pre><code>code</code><button class="copy-btn" type="button" data-copy>复制 / Copy</button></pre>');
});

// ── Regression: issue #14 · setext h2 ───────────────────────────────────
// `Title` + `-----` used to hit the <hr> branch first and render as a
// paragraph followed by a horizontal rule.

test('a setext h2 is rendered as a heading', () => {
  const html = render('Title\n-----');
  assert.match(html, /<h2 id="title">/, 'a setext h2 must become <h2>');
  assert.ok(!html.includes('<hr>'), 'no stray <hr> for a setext h2');
});

test('a setext h1 still renders as a heading', () => {
  assert.match(render('Title\n====='), /<h1 id="title">/);
});

test('a `---` after a blank line is still an <hr>', () => {
  const html = render('text\n\n---\n\nmore');
  assert.ok(html.includes('<hr>'), 'a standalone rule must stay an <hr>');
  assert.ok(!/<h2/.test(html), 'a standalone rule is not a heading');
});

test('a `---` at the start of the document is still an <hr>', () => {
  const html = render('---\n\nmore');
  assert.ok(html.includes('<hr>'), 'a leading rule must stay an <hr>');
});

// ── Regression: issue #14 · escaped pipe in tables ──────────────────────
// `\|` is the documented way to put a literal pipe in a cell; it used to
// split the cell in two.

test('an escaped pipe does not split a header cell', () => {
  const html = render('| a\\|b | c |\n| --- | --- |\n| d | e |');
  const ths = html.match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
  assert.equal(ths.length, 2, 'the header must have exactly two cells');
  assert.ok(ths[0].includes('a|b'), `first header cell must be "a|b", got: ${ths[0]}`);
});

test('an escaped pipe does not split a body cell', () => {
  const html = render('| h1 | h2 |\n| --- | --- |\n| a\\|b | c |');
  const tds = html.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
  assert.equal(tds.length, 2, 'the row must have exactly two cells');
  assert.ok(tds[0].includes('a|b'), `first body cell must be "a|b", got: ${tds[0]}`);
});

test('a plain table is unchanged by the escaped-pipe fix', () => {
  assert.equal(
    compact(render('| h1 | h2 |\n| --- | --- |\n| a | b |')),
    '<table><thead><tr><th style="text-align:left">h1</th><th style="text-align:left">h2</th></tr></thead>' +
      '<tbody><tr><td style="text-align:left">a</td><td style="text-align:left">b</td></tr></tbody></table>'
  );
});
