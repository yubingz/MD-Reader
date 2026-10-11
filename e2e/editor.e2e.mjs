// Real-browser end-to-end test for the edit pane (issue #32).
//
// Why this file exists: `node --test` (the zero-dependency suite) covers the pure
// decisions and the highlight tokenizer, and it checks that the highlight layer
// and the textarea *declare* the same CSS metrics. It cannot do two things:
//
//   1. execute the write path. `saveAction()` returns a branch name ('write' /
//      'pick' / 'download'); the code that moves bytes — requestPermission,
//      createWritable, write, close — never runs under Node.
//   2. see layout. Two elements can declare identical metrics and still not line
//      up on screen.
//
// This file drives a real Chromium and checks both, against files on disk.
//
// Facts that shape the design (measured 2026-10-11):
//   * The File System Access API needs a secure context. Served over
//     http://127.0.0.1:<port> the page is secure and showOpenFilePicker /
//     showSaveFilePicker / navigator.storage.getDirectory all exist. Loaded via
//     file:// or setContent() they are all undefined, so a green run there would
//     prove nothing about the write path.
//   * A native picker is an OS dialog; no automation can drive it. Where a test
//     needs a handle, the two pickers are replaced. Everything downstream of the
//     handle (FileReader, Blob, createWritable, write, close) is the real code.
//   * `renderHighlight()` appends exactly one newline on purpose ("keeps the last
//     line of a document that does not end with one from being clipped"), so the
//     layer's text is the source plus one '\n' — not the source verbatim.
//
// This file deliberately lives outside `test/`: `node --test` treats that
// directory as its own and would try to import playwright-core in CI, where no
// dependencies are installed. Keep `node --test` zero-dependency.
//
// Run: npm run test:browser   (override the binary with MDR_CHROME=<path>)
//
// Non-vacuity: to check these assertions can fail, mutate md-reader.html — but
// read and write it in BINARY mode. `.gitattributes` pins `*.html text eol=crlf`,
// so a text-mode read/write pair in Python flattens every CRLF to LF, and
// `git diff` then reports nothing while `git status` calls the file modified.
// That is how a restore check passes on a file you have just damaged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm, copyFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ── locate a Chromium ───────────────────────────────────────────────────
export function findChrome() {
  if (process.env.MDR_CHROME) return process.env.MDR_CHROME;
  const cache = join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort();
  for (const d of dirs.reverse()) {
    for (const sub of ['chrome-linux64', 'chrome-linux']) {
      const exe = join(cache, d, sub, 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

const CHROME = findChrome();
const MISSING = CHROME
  ? null
  : 'no Chromium found — set MDR_CHROME=<path to chrome>, or run: npx playwright install chromium';
// A falsy `skip` still marks a test SKIP in some Node versions, so only pass the
// option when the browser is genuinely missing.
const OPTS = MISSING ? { skip: MISSING } : {};

// ── a static server, so the page is a secure context ────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

async function serve(dir) {
  const srv = createServer(async (req, res) => {
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, rel === '/' ? 'md-reader.html' : rel.replace(/^\//, ''));
    let body;
    try {
      body = await readFile(file); // read before any header is written
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    const dot = file.lastIndexOf('.');
    res.writeHead(200, { 'content-type': MIME[dot >= 0 ? file.slice(dot) : ''] || 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

// ── fixture ─────────────────────────────────────────────────────────────
const SAMPLE = `# E2E sample

First paragraph, long enough to wrap over more than one line inside the editor
pane, so the two layers have to agree about where the line breaks fall.

- one
- two

\`\`\`js
const a = 1;
\`\`\`
`;

let work, siteDir, origin, srv, ctx;
// Every context ever launched, so the run can always exit: a leaked browser
// keeps the Node test runner alive forever (no summary line, no exit).
const contexts = [];

test.before(async () => {
  if (MISSING) return;
  work = await mkdtemp(join(tmpdir(), 'mdr-e2e-'));
  siteDir = join(work, 'site');
  await mkdir(siteDir, { recursive: true });
  await copyFile(join(ROOT, 'md-reader.html'), join(siteDir, 'md-reader.html'));
  await writeFile(join(siteDir, 'sample.md'), SAMPLE, 'utf8');
  const s = await serve(siteDir);
  origin = s.origin;
  srv = s.close;
});

test.after(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  if (srv) await srv();
  if (work) await rm(work, { recursive: true, force: true });
});

async function launch(profile) {
  const c = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    acceptDownloads: true,
  });
  contexts.push(c);
  return c;
}

// Read one file's text out of the browser's persistent storage.
const readStored = (page, name) => page.evaluate(async (n) => {
  const dir = await navigator.storage.getDirectory();
  const h = await dir.getFileHandle(n);
  return (await h.getFile()).text();
}, name);

// ════════════════════════════════════════════════════════════════════════
// 1. Open → edit → Ctrl+S → a real file on disk, read back with fs.
// ════════════════════════════════════════════════════════════════════════
test('Ctrl+S writes the edited text to a real file on disk', OPTS, async () => {
  ctx = await launch(join(work, 'profile-1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`));

  // The native save picker is an OS dialog. Removing it puts doSave() on the
  // documented 'download' branch; the download and the bytes are real.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });

  await page.goto(`${origin}/md-reader.html`);
  // The hidden <input type="file"> is the app's own fallback entry point.
  await page.setInputFiles('#fileInput', join(siteDir, 'sample.md'));
  await page.waitForFunction(() => document.querySelector('#editor').value.length > 40);
  assert.equal(await page.inputValue('#editor'), SAMPLE, 'the editor must hold exactly what was opened');

  await page.click('#btnModeEdit');
  assert.match(await page.getAttribute('#shell', 'class'), /mode-edit/, 'the shell must switch to edit mode');
  assert.equal(await page.isVisible('#editor'), true, 'the textarea must be on screen in edit mode');

  const edited = SAMPLE.replace('# E2E sample', '# E2E sample EDITED') + 'trailing line added by the e2e test\n';
  await page.fill('#editor', edited);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.keyboard.press('Control+s'),
  ]);
  assert.equal(download.suggestedFilename(), 'sample.md', 'the copy must keep the document name');

  const out = join(work, 'saved-by-e2e.md');
  await download.saveAs(out);

  // The point of the whole file: read the bytes the browser produced, with fs,
  // and compare them to what the editor showed.
  const onDisk = await readFile(out, 'utf8');
  assert.equal(onDisk, edited, 'the file on disk must equal the editor content');
  assert.ok(onDisk.includes('EDITED'), 'sanity: the edit is really in there');
});

// ════════════════════════════════════════════════════════════════════════
// 2. The 'write' branch: a retained handle, written back in place.
//    The handle comes from OPFS, so requestPermission / createWritable / write /
//    close are the real implementation, and persistence is checked after a
//    browser restart — that is what separates "it wrote" from "it held it in RAM".
// ════════════════════════════════════════════════════════════════════════
test('Ctrl+S writes back through a handle, and it survives a browser restart', OPTS, async () => {
  const profile = join(work, 'profile-2');
  ctx = await launch(profile);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`));

  // Only the pickers are replaced; the handle they return is a real
  // FileSystemFileHandle, so createWritable() below is the browser's own.
  await page.addInitScript(() => {
    const grab = async () => {
      const dir = await navigator.storage.getDirectory();
      return dir.getFileHandle('doc.md', { create: true });
    };
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await grab()] });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => await grab() });
  });

  await page.goto(`${origin}/md-reader.html`);
  assert.equal(await page.evaluate(() => window.isSecureContext), true,
    'the File System Access API needs a secure context');

  // Seed the file the reader will open.
  await page.evaluate(async (text) => {
    const dir = await navigator.storage.getDirectory();
    const h = await dir.getFileHandle('doc.md', { create: true });
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  }, SAMPLE);

  await page.click('#btnOpen');
  await page.waitForFunction(() => document.querySelector('#editor').value.length > 40);
  assert.equal(await page.inputValue('#editor'), SAMPLE, 'opened through the picker stub');
  assert.equal(await readStored(page, 'doc.md'), SAMPLE, 'before saving, the target still holds the opened text');

  await page.click('#btnModeEdit');
  const edited = SAMPLE.replace('First paragraph', 'First paragraph, EDITED BY E2E,');
  await page.fill('#editor', edited);

  await page.keyboard.press('Control+s');
  // waitForFunction polls, so the callback must be async-safe: await the text().
  await page.waitForFunction(async () => {
    const dir = await navigator.storage.getDirectory();
    const h = await dir.getFileHandle('doc.md');
    const text = await (await h.getFile()).text();
    return text.includes('EDITED BY E2E');
  }, null, { timeout: 20000 });

  assert.equal(await readStored(page, 'doc.md'), edited, 'the handle was written in place');

  // Persistence: a fresh browser on the same profile must still see it.
  await ctx.close();
  ctx = await launch(profile);
  const page2 = await ctx.newPage();
  await page2.goto(`${origin}/md-reader.html`);
  assert.equal(await readStored(page2, 'doc.md'), edited, 'the saved text survived a browser restart');
});

// ════════════════════════════════════════════════════════════════════════
// 3. Layout: the highlight layer and the textarea agree in a real renderer.
//    The Node suite can only compare the metrics they declare.
// ════════════════════════════════════════════════════════════════════════
test('highlight layer and textarea agree in the real layout', OPTS, async () => {
  ctx = await launch(join(work, 'profile-3'));
  const page = await ctx.newPage();
  await page.goto(`${origin}/md-reader.html`);
  await page.setInputFiles('#fileInput', join(siteDir, 'sample.md'));
  await page.waitForFunction(() => document.querySelector('#editor').value.length > 40);
  await page.click('#btnModeSplit');
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const ta = document.querySelector('#editor');
    const hl = document.querySelector('#editorHl');
    const a = getComputedStyle(ta);
    const b = getComputedStyle(hl);
    const keys = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
      'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingRight', 'paddingBottom',
      'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'whiteSpace', 'wordWrap',
      'overflowWrap', 'tabSize', 'boxSizing', 'textIndent'];
    const drifted = {};
    for (const k of keys) if (a[k] !== b[k]) drifted[k] = [a[k], b[k]];
    const lh = parseFloat(a.lineHeight);
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, width: r.width, top: r.top }; };
    return {
      drifted,
      // renderHighlight() appends exactly one newline on purpose — assert the
      // documented contract, not an equality the layer never promised.
      layerIsSourcePlusNewline: hl.textContent === ta.value + '\n',
      hlLen: hl.textContent.length,
      taLen: ta.value.length,
      taLines: Math.round(ta.scrollHeight / lh),
      hlLines: Math.round(hl.scrollHeight / parseFloat(b.lineHeight)),
      taBox: box(ta),
      hlBox: box(hl),
    };
  });

  // (a) nothing that can move a glyph may differ between the layers
  assert.deepEqual(m.drifted, {}, 'a metric that moves glyphs drifted between the two layers');
  // (b) the overlay mirrors the source, plus the one deliberate trailing newline
  assert.equal(m.layerIsSourcePlusNewline, true,
    `highlight layer must be source + '\\n' (layer ${m.hlLen} chars, source ${m.taLen})`);
  // (c) same box, so both layers wrap at the same width
  assert.ok(Math.abs(m.taBox.left - m.hlBox.left) <= 1, `left differs: ${m.taBox.left} vs ${m.hlBox.left}`);
  assert.ok(Math.abs(m.taBox.width - m.hlBox.width) <= 1, `width differs: ${m.taBox.width} vs ${m.hlBox.width}`);
  assert.ok(Math.abs(m.taBox.top - m.hlBox.top) <= 1, `top differs: ${m.taBox.top} vs ${m.hlBox.top}`);
  // (d) same number of rendered lines — the check that comparing declared CSS cannot make
  assert.ok(Math.abs(m.taLines - m.hlLines) <= 1,
    `rendered line count differs: textarea ${m.taLines} vs highlight ${m.hlLines}`);
});

// ════════════════════════════════════════════════════════════════════════
// 4. Negative control: with no document, Ctrl+S must do nothing. Without this,
//    test 1 could pass on a reader that saves on every keypress.
// ════════════════════════════════════════════════════════════════════════
test('Ctrl+S with no document downloads nothing', OPTS, async () => {
  ctx = await launch(join(work, 'profile-4'));
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.goto(`${origin}/md-reader.html`);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  assert.deepEqual(downloads, [], 'no document ⇒ no save at all');
});
