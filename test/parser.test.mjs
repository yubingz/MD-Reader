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
    section +
      '\nreturn { parseMarkdown: parseMarkdown, inline: inline, escapeHtml: escapeHtml, katexOptions: katexOptions };'
  )();
}

const { parseMarkdown, katexOptions } = loadParser();
const render = (md) => parseMarkdown(md).html;

// ── Regression: issue #1 ────────────────────────────────────────────────
// An unclosed fence used to drop the fence and everything after it, silently.
test('unclosed fence keeps the rest of the document', () => {
  const html = render('# Title\n```js\ncode\n# still inside the code block');
  assert.match(html, /<h1 /, 'the heading before the fence still renders');
  assert.match(html, /<pre><code class="language-js">/, 'the unclosed fence opens a code block');
  assert.ok(html.includes('code'), 'code line inside the unclosed fence is kept');
  assert.ok(
    html.includes('# still inside the code block'),
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

// ── Regression: issue #3 ────────────────────────────────────────────────
// Links and images used to take whatever scheme the document supplied, so a
// crafted `.md` could render `href="javascript:…"` and execute script in the
// file:// origin (or pull in a `data:` document).
const DANGEROUS_URLS = [
  'javascript:alert(1)',
  'javascript:alert%28document.domain%29',
  'JavaScript:alert(1)',
  'JAVASCRIPT:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
];

test('dangerous URL schemes never reach an href', () => {
  for (const url of DANGEROUS_URLS) {
    const html = render(`[x](${url})`);
    assert.ok(!/href=/i.test(html), `[x](${url}) produced an href: ${html}`);
    assert.ok(!html.includes('<a '), `[x](${url}) should not render an anchor: ${html}`);
    assert.match(html, /\[x\]/, 'the raw markdown stays visible as plain text');
  }
});

test('dangerous URL schemes never reach a src', () => {
  for (const url of DANGEROUS_URLS) {
    const html = render(`![alt](${url})`);
    assert.ok(!html.includes('<img'), `![alt](${url}) should not render an image: ${html}`);
  }
});

test('safe URLs still render as real links and images', () => {
  const https = render('[ok](https://example.com/a?b=1)');
  assert.match(https, /<a href="https:\/\/example\.com\/a\?b=1" target="_blank" rel="noopener noreferrer">ok<\/a>/);

  const http = render('[ok](http://example.com/)');
  assert.match(http, /<a href="http:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">ok<\/a>/);

  const mail = render('[mail](mailto:a@b.com)');
  assert.match(mail, /<a href="mailto:a@b\.com">mail<\/a>/);

  const frag = render('[frag](#section-one)');
  assert.match(frag, /<a href="#section-one">frag<\/a>/);

  const rel = render('[rel](./docs/readme.md)');
  assert.match(rel, /<a href="\.\/docs\/readme\.md">rel<\/a>/);

  const img = render('![pic](pic.png)');
  assert.match(img, /<img src="pic\.png" alt="pic" loading="lazy">/);
});

// ── Fence basics (must keep working) ────────────────────────────────────
test('closed fence renders language class and copy button', () => {
  const html = render('```python\nprint(1)\n```');
  assert.match(html, /<pre><code class="language-python">print\(1\)<\/code>/);
  assert.match(html, /data-copy/);
});

test('text after a closed fence is rendered normally', () => {
  const html = render('```\ncode\n```\n\n# After');
  assert.match(html, /<h1 /);
});

test('tilde fences are supported like backtick fences', () => {
  const html = render('~~~js\nlet a = 1;\n~~~');
  assert.match(html, /<pre><code class="language-js">let a = 1;<\/code>/);
});

// ── Smoke tests so CI covers the common paths ───────────────────────────
test('headings get ids and a table of contents', () => {
  const r = parseMarkdown('# Heading one\n\n## Sub *em*');
  assert.match(r.html, /<h1 id="heading-one">/);
  assert.equal(r.toc.length, 2);
  assert.equal(r.toc[1].level, 2);
});

// Non-ASCII headings are a first-class case for this reader (it is used with
// Chinese documents), so the slug/id path is asserted explicitly.
test('non-ASCII headings still get a usable id', () => {
  const html = render('# 中文标题');
  assert.match(html, /<h1 id="中文标题">/);
  assert.match(html, /href="#中文标题"/);
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
  const html = render('`<b>` and <div onclick=x>hi</div>');
  assert.ok(html.includes('&lt;b&gt;'), 'inline code is escaped');
  assert.ok(html.includes('&lt;div onclick=x&gt;'), 'raw HTML is escaped');
});

// ── Regression: issue #5 ────────────────────────────────────────────────
// KaTeX used to be configured with a blanket `trust: true` at both render
// call sites, so `\href{javascript:…}` became a live link and
// `\includegraphics{http://…}` issued a remote fetch just by opening a
// document — the same click-to-execute / phone-home surface as #3, through
// the math path, and it contradicts the "fully offline" claim.
//
// The options now live in one named object inside the PARSER section so the
// security-relevant fields can be asserted here and cannot silently regress.
test('KaTeX options carry no blanket trust', () => {
  const opts = katexOptions;
  assert.ok(opts && typeof opts === 'object', 'katexOptions must be exported from the parser section');
  assert.equal(opts.trust !== true, true, 'blanket trust:true must not be set');
  assert.notEqual(opts.trust, undefined, 'trust must be an explicit policy, not left implicit');
});

test('KaTeX trust policy blocks javascript/data/vbscript links', () => {
  const trust = katexOptions.trust;
  assert.equal(typeof trust, 'function', 'trust must be a callback, not a boolean');
  const deny = [
    { command: '\\href', url: 'javascript:alert(1)', protocol: 'javascript' },
    { command: '\\href', url: ' JavaScript:alert(1)', protocol: 'javascript' },
    { command: '\\href', url: 'data:text/html;base64,PHN2Zz4=', protocol: 'data' },
    { command: '\\url', url: 'vbscript:msgbox(1)', protocol: 'vbscript' },
    { command: '\\includegraphics', url: 'http://evil/x.png', protocol: 'http' },
    { command: '\\includegraphics', url: 'https://evil/x.png', protocol: 'https' }
  ];
  for (const ctx of deny) {
    assert.equal(trust(ctx), false, `${ctx.command}{${ctx.url}} must be refused (no remote fetches, no script URLs)`);
  }
  const allow = [
    { command: '\\href', url: 'https://example.com/', protocol: 'https' },
    { command: '\\href', url: 'http://example.com/', protocol: 'http' },
    { command: '\\href', url: 'mailto:a@b.com', protocol: 'mailto' },
    { command: '\\href', url: './docs/a.md', protocol: '_relative' },
    { command: '\\href', url: '#section', protocol: '_relative' }
  ];
  for (const ctx of allow) {
    assert.equal(trust(ctx), true, `${ctx.command}{${ctx.url}} should still be allowed`);
  }
});

// The KaTeX options object must be the exact one handed to renderToString at
// every call site — assert the source wires it through, so a re-introduced
// inline `trust: true` cannot slip past the assertions above.
test('every katex.renderToString call uses the shared options object', () => {
  const html = readFileSync(READER, 'utf8');
  const calls = html.match(/katex\.renderToString\([^)]*\)/g) || [];
  assert.ok(calls.length >= 2, 'expected the two render call sites');
  for (const call of calls) {
    assert.ok(call.includes('katexOptions'), `render call must pass katexOptions, got: ${call}`);
  }
  // No render call may contain an inline options literal with trust: true.
  // (Comments mentioning `trust: true` are fine — only live code matters.)
  const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.ok(!/trust\s*:\s*true/.test(code), 'no live `trust: true` may remain in the reader');
});
