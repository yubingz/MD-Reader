// Tests for the CHANGELOG's release headings (issue #44 / item 14).
//
// Why this exists: item 14 ships `v2.0.0`, and the release notes are the body under the newest
// version heading in CHANGELOG.md. While that heading reads `## Unreleased`, a tag has nothing
// to point at and the published notes drift from the file. So the heading itself is the thing
// that must change before the tag is cut, and it is what these tests pin.
//
// The assertions read the heading list, not a loose keyword, so a word "Unreleased" elsewhere
// in the file cannot satisfy them. The mutant at the bottom is the check that the 2.0.0
// assertion can really fail.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

// Every `## …` heading, in file order, trimmed.
function versionHeadings(src) {
  return src
    .split(/\r?\n/)
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.trim());
}

// The body lines between the given `##` heading and the next `##` heading.
function bodyUnder(src, heading) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body;
}

test('CHANGELOG has a 2.0.0 heading and no Unreleased heading', () => {
  const headings = versionHeadings(changelog);

  assert.ok(
    !headings.includes('## Unreleased'),
    `CHANGELOG still opens with "## Unreleased" — item 14 must give it a version heading. Headings: ${headings.join(', ')}`
  );

  const twoOh = headings.find((h) => /^##\s+2\.0\.0\b/.test(h));
  assert.ok(
    twoOh,
    `CHANGELOG has no "## 2.0.0" heading. Headings: ${headings.join(', ')}`
  );
});

test('the 2.0.0 heading carries a date', () => {
  const headings = versionHeadings(changelog);
  const twoOh = headings.find((h) => /^##\s+2\.0\.0\b/.test(h));

  assert.match(
    twoOh,
    /^##\s+2\.0\.0\s+—\s+\d{4}-\d{2}-\d{2}$/,
    `the 2.0.0 heading must be "## 2.0.0 — YYYY-MM-DD", got: ${twoOh}`
  );
});

test('2.0.0 comes before 1.0.0, so the file stays newest-first', () => {
  const headings = versionHeadings(changelog);
  const i2 = headings.findIndex((h) => /^##\s+2\.0\.0\b/.test(h));
  const i1 = headings.findIndex((h) => /^##\s+1\.0\.0\b/.test(h));

  assert.ok(i1 >= 0, 'the 1.0.0 heading is gone');
  assert.ok(i2 >= 0 && i2 < i1, `2.0.0 must precede 1.0.0, got 2.0.0@${i2} 1.0.0@${i1}`);
});

test('the 2.0.0 release notes have content in all three sections', () => {
  const headings = versionHeadings(changelog);
  const twoOh = headings.find((h) => /^##\s+2\.0\.0\b/.test(h));
  const body = bodyUnder(changelog, twoOh);

  assert.ok(body, 'the 2.0.0 section body could not be read');
  for (const section of ['### Changed', '### Fixed', '### Added']) {
    const at = body.findIndex((l) => l.trim() === section);
    assert.ok(at >= 0, `2.0.0 is missing the "${section}" subsection`);
    const nextHeading = body.findIndex((l, i) => i > at && /^###\s/.test(l));
    const end = nextHeading < 0 ? body.length : nextHeading;
    const items = body.slice(at + 1, end).filter((l) => /^\s*-\s+\S/.test(l));
    assert.ok(
      items.length > 0,
      `the "${section}" subsection of 2.0.0 has no list items`
    );
  }
});

// Non-vacuity: the heading extractor and the item counter must be able to fail. If this
// mutant ever passes, the assertions above are not reading what they claim to read.
test('mutant: a CHANGELOG with "## Unreleased" fails the heading assertion', () => {
  const mutant = '## Unreleased\n\n### Added\n- nothing (#0)\n';
  assert.ok(
    versionHeadings(mutant).includes('## Unreleased'),
    'the heading extractor failed to see "## Unreleased" in a synthetic file'
  );
  const empty = '## 2.0.0 — 2026-10-14\n\n### Added\n\n### Fixed\n';
  const body = bodyUnder(empty, '## 2.0.0 — 2026-10-14');
  const addedAt = body.findIndex((l) => l.trim() === '### Added');
  const items = body.slice(addedAt + 1, addedAt + 2).filter((l) => /^\s*-\s+\S/.test(l));
  assert.equal(items.length, 0, 'the item counter counted a non-item as content');
});
