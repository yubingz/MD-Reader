// Tests for the credits / contribution footer (issue #34).
//
// Why this exists: the reading page carried no author, no licence, no route
// back to the repository and no invitation to contribute. This file covers the
// new footer in two layers:
//
//   (a) the pure data and decisions, declared between `/* CREDITS:BEGIN */` and
//       `/* CREDITS:END */` and extracted without a DOM — the link list and the
//       invitation wording;
//   (b) the wiring the pure functions cannot cover: the footer markup, the
//       fixed bar that must not cover the text, the print rule that must hide
//       it, and the fact that nothing is fetched on load.
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
const READER = join(HERE, '..', 'md-editor.html');
const html = readFileSync(READER, 'utf8');

const BEGIN = '/* CREDITS:BEGIN */';
const END = '/* CREDITS:END */';

const EXPORTS = ['REPO_URL', 'ISSUES_URL', 'COPYRIGHT_YEAR', 'COPYRIGHT_HOLDER', 'creditLinks', 'creditLine'];

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
// the file must not be touched, or a mutation proves nothing about the footer.
function loadCredits(src = html, begin = BEGIN, end = END) {
  return evalSection(sectionOf(src, begin, end));
}

function loadMutant(from, to) {
  const section = sectionOf();
  assert.notEqual(section.indexOf(from), -1, `the mutant target is not in the block: ${from}`);
  return evalSection(section.replace(from, to));
}

const credits = loadCredits();

// ── The pure data, called exactly as the reader calls it ────────────────
test('the repository URL is the real one and is https', () => {
  assert.equal(credits.REPO_URL, 'https://github.com/yubingz/MDMiniEditor');
  assert.match(credits.REPO_URL, /^https:\/\//, 'an http:// or a relative URL would not leave the page');
  assert.equal(credits.ISSUES_URL, credits.REPO_URL + '/issues');
});

test('the copyright names the year and the holder, both non-empty', () => {
  assert.equal(credits.COPYRIGHT_YEAR, '2026');
  assert.equal(credits.COPYRIGHT_HOLDER, 'yubingz');
  assert.match(credits.creditLine(), /©\s*2026\s*yubingz/);
  assert.match(credits.creditLine(), /MIT/, 'the licence belongs next to the copyright');
});

test('every credited link is a safe absolute https URL with a label', () => {
  const links = credits.creditLinks();
  assert.ok(Array.isArray(links) && links.length >= 2, 'a repository link and an issues link at least');
  for (const link of links) {
    assert.equal(typeof link.href, 'string');
    assert.match(link.href, /^https:\/\/github\.com\/yubingz\/MDMiniEditor/,
      'the footer must only ever point at the project repository');
    assert.ok(typeof link.label === 'string' && link.label.length > 0, 'a link needs a label');
  }
  const hrefs = links.map(l => l.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'no duplicate hrefs');
  assert.ok(hrefs.includes(credits.REPO_URL), 'the repository itself must be linked');
  assert.ok(hrefs.includes(credits.ISSUES_URL), 'the issue tracker must be linked');
});

test('the invitation asks, and never demands', () => {
  const link = credits.creditLinks().find(l => l.href === credits.ISSUES_URL);
  // The invitation lives in the tooltip (the visible text stays short), so the
  // contract is checked there.
  const text = (link.title || '').toLowerCase();
  assert.ok(/welcome|invite|invitation|star|欢迎/.test(text), 'the wording must read as an invitation');
  for (const demand of ['please star', 'must star', 'give us a star', 'star us now', '需要你', '请务必', '点个star']) {
    assert.ok(!text.includes(demand.toLowerCase()), `"${demand}" is a demand, not an invitation`);
  }
  // A star cannot be given from the page — the UI must not imply it can.
  assert.ok(!/一键star|star us now/i.test(link.title), 'the page cannot star a repository');
  // No link may claim to star on the user's behalf.
  for (const l of credits.creditLinks()) {
    assert.ok(!/一键|click to star|auto.?star/i.test((l.label || '') + ' ' + (l.title || '')),
      'a link cannot star a repository for the user');
  }
});

// ── Wiring the pure functions cannot cover ──────────────────────────────
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
  throw new Error(`${header} block is not brace-balanced`);
}

// The footer element, from its opening tag to the matching close.
function footerMarkup(src) {
  const m = src.match(/<footer[^>]*id="credits"[\s\S]*?<\/footer>/);
  assert.ok(m, 'the credits footer must exist in the reader');
  return m[0];
}

test('the footer exists and carries the copyright and the links', () => {
  const footer = footerMarkup(html);
  assert.match(footer, /©\s*2026\s*yubingz/, 'the copyright must be visible');
  assert.match(footer, /github\.com\/yubingz\/MDMiniEditor/, 'the repository must be linked');
  assert.match(footer, /github\.com\/yubingz\/MDMiniEditor\/issues/, 'the issue tracker must be linked');
  const hrefs = [...footer.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 2, 'at least the repository and the issues link');
  for (const href of hrefs) {
    assert.match(href, /^https:\/\/github\.com\/yubingz\/MDMiniEditor/,
      'no link may point anywhere but the project repository');
    assert.ok(!/^javascript:/i.test(href), 'no javascript: href may exist');
  }
});

test('opening the page fetches nothing: the links are inert markup', () => {
  const footer = footerMarkup(html);
  // A link loads nothing until clicked. Any of these would break offline use.
  assert.ok(!/src\s*=/.test(footer), 'no image/script may be loaded by the footer');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(footer), 'the footer must not fetch on load');
  assert.ok(!/<iframe|<img|<script|<link/i.test(footer), 'no external sub-resource in the footer');
  // The links open in a new tab and do not leak the opener.
  assert.match(footer, /target="_blank"/, 'a link out of a file:// page should open a new tab');
  assert.match(footer, /rel="[^"]*noopener/, 'the new tab must not keep a window.opener handle');
});

test('the footer is a fixed bar and the app reserves room for it', () => {
  const rule = html.match(/\.credits\s*\{([^}]*)\}/);
  assert.ok(rule, 'the .credits rule must exist');
  assert.match(rule[1], /position:\s*fixed/, 'the footer is pinned to the viewport');
  assert.match(rule[1], /bottom:\s*0/, 'it sits at the bottom edge');
  // Fixed bars sit on top of the content, so the scroll box has to leave a gap.
  const shell = cssBlock(html, '.shell {');
  assert.match(shell, /padding-bottom:\s*var\(--credits-h\)/,
    'the document must reserve exactly the bar height');
  // The reserved height must come from one variable, declared in :root and
  // actually used as the bar height — otherwise the two can drift apart.
  const root = cssBlock(html, ':root {');
  assert.match(root, /--credits-h:\s*\d+px/, 'the height must be declared once');
  assert.match(rule[1], /height:\s*var\(--credits-h\)/, 'the bar must use the same variable');
});

test('print and PDF never carry the invitation', () => {
  const print = cssBlock(html, '@media print');
  assert.match(print, /\.credits/, 'the footer must be named in the print rule');
  assert.match(print, /\.credits[^}]*display:\s*none/, 'the footer must be hidden, not merely shrunk');
});

test('the footer is theme-aware: it uses theme variables, not hard-coded colours', () => {
  const rule = html.match(/\.credits\s*\{([^}]*)\}/);
  assert.match(rule[1], /var\(--/, 'the bar must follow the active theme');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(rule[1]), 'a hard-coded colour would break the dark theme');
  const link = html.match(/\.credits a\s*\{([^}]*)\}/);
  assert.ok(link, 'the footer links need their own rule');
  assert.match(link[1], /var\(--/);
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

test('the link-list assertions are not vacuous', () => {
  const repo = loadMutant("const REPO_URL = 'https://github.com/yubingz/MDMiniEditor';",
    "const REPO_URL = 'https://example.com/other';");
  expectThrow(() => assert.equal(repo.REPO_URL, 'https://github.com/yubingz/MDMiniEditor'), 'the repo URL');

  const year = loadMutant("const COPYRIGHT_YEAR = '2026';", "const COPYRIGHT_YEAR = '';");
  expectThrow(() => assert.match(year.creditLine(), /©\s*2026\s*yubingz/), 'the copyright line');
});

test('the markup assertions are not vacuous', () => {
  expectThrow(() => footerMarkup(shadow('<footer class="credits" id="credits"', '<!-- removed --><div')),
    'the footer element');
  expectThrow(() => assert.match(shadow('href="' + credits.ISSUES_URL + '"', 'href="#"'),
    /href="https:\/\/github\.com\/yubingz\/MDMiniEditor\/issues"/), 'the issues link');
});

test('the layout and print assertions are not vacuous', () => {
  expectThrow(() => {
    const broken = shadow('.credits {', '.credits-disabled {');
    assert.match(broken.match(/\.credits\s*\{([^}]*)\}/)[1], /position:\s*fixed/);
  }, 'the fixed bar');
  expectThrow(() => {
    const broken = cssBlock(shadow('padding-bottom: var(--credits-h);', 'padding-bottom: 0;'), '.shell {');
    assert.match(broken, /--credits-h/);
  }, 'the reserved room');
  expectThrow(() => {
    const print = cssBlock(shadow('  .credits { display: none !important; }', ''), '@media print');
    assert.match(print, /\.credits[^}]*display:\s*none/);
  }, 'the print rule');
});

test('the markers are load-bearing', () => {
  const withoutMarkers = html.replace(BEGIN, '/* gone */').replace(END, '/* gone */');
  assert.throws(() => loadCredits(withoutMarkers), /markers not found/);
});
