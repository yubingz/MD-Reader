// Hygiene tests for the Windows launcher payload (open-md.ps1).
//
// open-md.ps1 injects the document text into a copy of the reader. The properties asserted
// here fail silently in production and cannot be checked by running the script under Node:
//
//   1. The injection point must be the *unique* `/* PARSER:BEGIN */` marker, not a literal
//      that occurs many times in md-reader.html. Anchoring on the first `(function () {` hit
//      keeps working only as long as nothing else moves ahead of it; when it drifts the
//      payload lands in the wrong block and the reader opens empty with no error.
//   2. The generated page must be written *next to the source document*, not into %TEMP%.
//      A temp file has to be deleted, and that delete races the browser's read — #17 shipped
//      a one-shot delete and broke every launch, #21 made the race survivable with a retry
//      loop. Writing beside the document removes the race instead of surviving it, and is
//      idempotent (the same document overwrites the same path).
//
// These tests read the files as text. They cannot execute PowerShell, so they assert the
// script *shape*, which is the part a regression would break.
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

test('the generated page defaults to a path beside the source document', () => {
  // The default output path must be derived from the .md path, not from %TEMP%.
  assert.doesNotMatch(
    ps1,
    /md-reader-/,
    'open-md.ps1 still produces a md-reader-* name (the %TEMP% scheme)'
  );
  assert.match(
    ps1,
    /GetFileNameWithoutExtension\(\$MdPath\)/,
    'the default output name is not derived from the source document name'
  );
  // Get-OutDir must try the document's own directory first.
  const outDir = ps1.match(/function\s+Get-OutDir[\s\S]*?\n\}/);
  assert.ok(outDir, 'open-md.ps1 has no Get-OutDir function');
  assert.match(
    outDir[0],
    /GetDirectoryName\(\$ForMdPath\)/,
    'Get-OutDir does not derive the directory from the markdown path'
  );
});

test('the launcher does not delete the generated page', () => {
  // Deleting is what raced the browser in #17/#21. With the page beside the document there is
  // nothing to delete; a Remove-Item on $Out would destroy the user's generated file.
  const deletes = ps1.match(/(^|\n)\s*Remove-Item\s+\$Out\b/g) ?? [];
  assert.equal(
    deletes.length,
    0,
    'open-md.ps1 deletes $Out — the generated page is a document artefact, not a temp file'
  );
});

test('the launcher does not hardcode a browser', () => {
  // Probing for msedge.exe finds Edge on any machine that merely *has* it installed, then
  // opens nothing when Edge is not the browser handling the request. Start-Process on the
  // path goes through the shell association — the browser the user actually registered.
  assert.doesNotMatch(
    ps1,
    /msedge\.exe/i,
    'open-md.ps1 hardcodes msedge.exe instead of using the registered handler'
  );
  assert.match(
    ps1,
    /Start-Process\s+\$Out/,
    'open-md.ps1 does not launch the generated page via Start-Process'
  );
});

test('Open-MD-File.bat does not reference %TEMP%', () => {
  // The .bat delegates to the .ps1; assert it did not grow a second temp-file scheme.
  assert.doesNotMatch(
    bat,
    /%TEMP%/i,
    'Open-MD-File.bat references %TEMP% outside the .ps1 path'
  );
});
