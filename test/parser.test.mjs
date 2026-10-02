// Parser tests for md-reader.html
//
// The reader ships as a single HTML file, so the parser lives inside it.
// `md-reader.html` therefore carries two explicit markers:
//
//     /* PARSER:BEGIN */   ... parser section ...
//     /* PARSER:END */
//
// This harness extracts that declared section and exercises it — the tests
// assert on parser *behaviour*, never on the source text of the HTML.
//
// Run:  node --test test/

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
    section +
      '\nreturn { parseMarkdown: parseMarkdown, inline: inline, escapeHtml: escapeHtml };'
  )();
}

const { parseMarkdown } = loadParser();
const render = (md) => parseMarkdown(md).html;

// ── Regression: issue #1 ────────────────────────────────────────────────
// An unclosed fence used to drop the fence and everything after it, silently.
test('unclosed fence keeps the rest of the document', () => {
  const html = render('# 标题\n```js\ncode\n# 还在代码块里');
  assert.match(html, /<h1 /, 'the heading before the fence still renders');
  assert.match(html, /<pre><code class="language-js">/, 'the unclosed fence opens a code block');
  assert.ok(html.includes('code'), 'code line inside the unclosed fence is kept');
  assert.ok(
    html.includes('# 还在代码块里'),
    'text after the unclosed fence is kept (inside the code block), not dropped'
  );
});

test('unclosed fence does not swallow following content as raw HTML', () => {
  const html = render('```\n<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'), 'code content stays escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped form is rendered instead');
});

test('unclosed fence with no body still closes cleanly', () => {
  const html = render('text\n```');
  assert.match(html, /<p>text<\/p>/);
  assert.match(html, /<pre><code>/, 'an empty code block is emitted');
});

// ── Fence basics (must keep working) ────────────────────────────────────
test('closed fence renders language class and copy button', () => {
  const html = render('```python\nprint(1)\n```');
  assert.match(html, /<pre><code class="language-python">print\(1\)<\/code>/);
  assert.match(html, /data-copy/);
});

test('text after a closed fence is rendered normally', () => {
  const html = render('```\ncode\n```\n\n# 之后');
  assert.match(html, /<h1 /);
});

test('tilde fences are supported like backtick fences', () => {
  const html = render('~~~js\nlet a = 1;\n~~~');
  assert.match(html, /<pre><code class="language-js">let a = 1;<\/code>/);
});

// ── Smoke tests so CI covers the common paths ───────────────────────────
test('headings get ids and a table of contents', () => {
  const r = parseMarkdown('# 标题一\n\n## Sub *em*');
  assert.match(r.html, /<h1 id="标题一">/);
  assert.equal(r.toc.length, 2);
  assert.equal(r.toc[1].level, 2);
});

test('table alignment and task lists render', () => {
  const table = render('| A | B |\n|:--|--:|\n| 1 | 2 |');
  assert.match(table, /<th style="text-align:left">A<\/th>/);
  assert.match(table, /<td style="text-align:right">2<\/td>/);

  const tasks = render('- [x] done\n- [ ] todo');
  assert.match(tasks, /<input type="checkbox" disabled checked>/);
  assert.match(tasks, /<input type="checkbox" disabled>/);
});

test('inline code and HTML in the document are escaped', () => {
  const html = render('`<b>` 与 <div onclick=x>hi</div>');
  assert.ok(html.includes('&lt;b&gt;'), 'inline code is escaped');
  assert.ok(html.includes('&lt;div onclick=x&gt;'), 'raw HTML is escaped');
});
