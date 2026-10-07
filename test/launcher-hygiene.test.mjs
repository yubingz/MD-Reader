// Hygiene tests for the Windows launcher payload (open-md.ps1).
//
// open-md.ps1 injects the document text into a copy of the reader. Two properties of that
// step are asserted here because both fail silently in production and neither can be checked
// by running the script under Node:
//
//   1. The injection point must be the *unique* `/* PARSER:BEGIN */` marker, not a literal
//      that occurs many times in md-reader.html. Anchoring on the first `(function () {` hit
//      keeps working only as long as nothing else moves ahead of it; when it drifts the
//      payload lands in the wrong block and the reader opens empty with no error.
//   2. The launcher writes a copy of the reader into %TEMP% on every open. That copy must be
//      removed after the browser is launched, otherwise one orphaned copy accumulates per
//      opened document — but a caller-supplied -Out path must be left alone.
//
// These tests read the files as text. They cannot execute PowerShell, so they assert the
// script *shape* (the marker is present and unique, the script anchors on it, and the cleanup
// is guarded), which is the part a regression would break.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reader = readFileSync(join(ROOT, 'md-reader.html'), 'utf8');
const ps1 = readFileSync(join(ROOT, 'open-md.ps1'), 'utf8');
const bat = readFileSync(join(ROOT, 'Open-MD-File.bat'), 'utf8');

const PARSER_MARKER = '/* PARSER:BEGIN */';

test('md-reader.html carries exactly one PARSER:BEGIN marker to anchor on', () => {
  const hits = reader.split(PARSER_MARKER).length - 1;
  assert.equal(hits, 1, `expected 1 '${PARSER_MARKER}' in md-reader.html, found ${hits}`);
});

test('the old ambiguous anchor is not used as the injection point', () => {
  // The literal is fine to *mention* in a comment; what must not happen is indexing the file
  // by it. Assert the IndexOf call targets the marker instead.
  assert.ok(
    reader.split('(function () {').length - 1 > 1,
    'precondition: the literal must still be ambiguous for this guard to mean anything'
  );
  assert.doesNotMatch(
    ps1,
    /IndexOf\(\s*['"]\(function \(\) \{/,
    'open-md.ps1 anchors on the ambiguous "(function () {" literal instead of the marker'
  );
});

test('open-md.ps1 anchors on the PARSER:BEGIN marker and fails loudly when absent', () => {
  assert.ok(
    ps1.includes(PARSER_MARKER),
    `open-md.ps1 does not reference '${PARSER_MARKER}'`
  );
  // The anchor must be the marker *value*, not merely stored in a variable named $marker.
  const assignment = ps1.match(/\$marker\s*=\s*(['"])(.*?)\1/);
  assert.ok(assignment, 'open-md.ps1 never assigns $marker a string literal');
  assert.equal(
    assignment[2],
    PARSER_MARKER,
    `$marker is ${JSON.stringify(assignment[2])}, not the PARSER:BEGIN marker`
  );
  const anchor = ps1.match(/\$idx\s*=\s*\$html\.IndexOf\(([^\n]*)/);
  assert.ok(anchor, 'open-md.ps1 has no $idx assignment from $html.IndexOf(...)');
  assert.match(
    anchor[1],
    /\$marker/,
    'the $idx anchor does not use the $marker variable'
  );
  assert.ok(
    ps1.includes('Reader script marker not found'),
    'open-md.ps1 does not throw when the marker is missing'
  );
});

test('open-md.ps1 removes the temp page it created, and only that one', () => {
  assert.match(
    ps1,
    /Remove-Item/,
    'open-md.ps1 never deletes the generated temp page'
  );
  assert.match(
    ps1,
    /\$createdOut/,
    'the cleanup is not gated on a flag that tracks whether this script created the path'
  );
  // The guard must be set only in the branch that builds the path itself.
  assert.match(
    ps1,
    /if\s*\(\s*-not\s+\$Out\s*\)\s*\{[\s\S]*?\$createdOut\s*=\s*\$true/,
    '$createdOut is not set inside the "-not $Out" branch that generates the temp path'
  );
  // ...and the delete must be conditional on it.
  assert.match(
    ps1,
    /if\s*\(\s*\$createdOut\s*\)\s*\{[\s\S]*?Remove-Item/,
    'Remove-Item is not guarded by $createdOut'
  );
});

test('the temp file is removed only after the browser has been launched', () => {
  const launch = ps1.lastIndexOf('Open-InReader $Out');
  const cleanup = ps1.lastIndexOf('Remove-Item');
  assert.ok(launch !== -1, 'open-md.ps1 does not launch the generated page');
  assert.ok(cleanup !== -1, 'open-md.ps1 has no cleanup');
  assert.ok(
    cleanup > launch,
    'Remove-Item runs before the browser launches, so the page may vanish mid-open'
  );
});

test('the caller-supplied -Out path is not deleted', () => {
  // The only cleanup call must sit inside the $createdOut guard; a second, unconditional
  // Remove-Item touching $Out would break "-Out is the caller's file".
  const unconditional = ps1.match(/(^|\n)\s*Remove-Item\s+\$Out\b/g) ?? [];
  assert.equal(
    unconditional.length,
    0,
    'Remove-Item $Out runs unconditionally, deleting a caller-supplied -Out file'
  );
});

test('Open-MD-File.bat does not leak its own temp files', () => {
  // The .bat delegates to the .ps1; assert it did not grow a second temp-file scheme that
  // the cleanup above does not cover.
  assert.doesNotMatch(
    bat,
    /%TEMP%/i,
    'Open-MD-File.bat references %TEMP% outside the .ps1 cleanup path'
  );
});
