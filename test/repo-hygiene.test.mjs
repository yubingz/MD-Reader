// Repository hygiene tests: line endings of the shipped HTML, the attribute rules that keep
// them stable, and the ignore file.
//
// `md-editor.html` is shipped as CRLF and is the one file the reader actually runs. Three of its
// 1881 line terminators were bare LF (the `AI生成` marker lines), so any incidental edit showed a
// three-line unrelated diff and the checked-out artefact depended on the cloner's `core.autocrlf`.
// These tests fail if the HTML drifts back to mixed endings, or if the attribute/ignore files that
// keep it stable go missing.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const readRaw = (name) => readFileSync(join(ROOT, name), 'latin1');

test('md-editor.html is committed with CRLF line endings only', () => {
  const html = readRaw('md-editor.html');

  assert.ok(html.includes('\r\n'), 'md-editor.html has no CRLF line ending at all');

  const bareLf = html.split('\r\n').join('').match(/\n/g) ?? [];
  assert.equal(
    bareLf.length,
    0,
    `md-editor.html has ${bareLf.length} LF-only line ending(s); the shipped file must be CRLF`
  );
});

test('md-editor.html keeps its content when normalised: the AI生成 marker survives', () => {
  const html = readRaw('md-editor.html');
  const marker = Buffer.from('AI生成', 'utf8').toString('latin1');

  assert.ok(html.includes(marker), 'the 生成 marker is gone from md-editor.html');
  assert.ok(
    html.includes('data-aigc-mark'),
    'the aigc marker attribute is gone from md-editor.html'
  );
});

test('.gitattributes applies a text rule to everything and pins the HTML to CRLF', () => {
  const attributes = readFileSync(join(ROOT, '.gitattributes'), 'utf8');

  assert.match(
    attributes,
    /^\*\s+text=auto\s*$/m,
    '.gitattributes must widen the text rule to every file (`* text=auto`)'
  );
  assert.match(
    attributes,
    /^\*\.html\s+text\s+eol=crlf\s*$/m,
    '.gitattributes must pin *.html to CRLF'
  );
});

test('.gitignore exists and ignores local build and editor artefacts', () => {
  assert.ok(existsSync(join(ROOT, '.gitignore')), '.gitignore is missing');

  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const entry of ['node_modules/', '*.log', '*.zip', '.DS_Store']) {
    assert.ok(
      ignore.split(/\r?\n/).includes(entry),
      `.gitignore should list ${entry}`
    );
  }
});
