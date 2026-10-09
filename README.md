# Minimal Markdown Reader

A tiny, offline Markdown reader for Windows — one HTML file plus small launchers.

![Offline](https://img.shields.io/badge/offline-yes-blue) ![License](https://img.shields.io/badge/license-MIT-green)

[中文文档 / Chinese README](./README.cn.md)

---

## Features

- Open and drag-and-drop `.md` files
- GFM: headings, lists, task lists, tables, code blocks, quotes
- LaTeX math (`$inline$` / `$$display$$`) via KaTeX, with offline fallback
- Table of contents
- Dark / light theme
- Font size controls
- Print / export PDF
- Fully offline for file reading — nothing is uploaded

### Math notes

- Uses [KaTeX](https://katex.org/) when network is available.
- Without network, a built-in fallback covers Greek letters, sub/superscripts, sums, and fractions.
- Math is extracted before Markdown parsing, so `_italic_` rules will not break formulas.
- Escaped backslashes in sources (e.g. `\\le`) are normalized to `\le`.

---

## Quick start (Windows)

1. Download and unzip this folder.
2. Double-click **`Open-Reader.bat`** — a file dialog appears; pick a `.md` and it opens in the
   app-mode window (Edge/Chrome if available). Cancel the dialog for an empty reader.
3. Drag a `.md` file into the window, or click **Open**, to switch documents.

Open a specific file:

```bat
Open-MD-File.bat "C:\path\to\your.md"
```

Or drag `your.md` onto **`Open-MD-File.bat`**.

### Any browser

Open `md-reader.html` directly (double-click or `file://` URL).

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open file |
| `Ctrl+Shift+L` | Toggle theme |
| `Ctrl+=` / `Ctrl+-` | Increase / decrease font size |
| `Ctrl+0` | Reset font size |

---

## Markdown & math syntax

```markdown
# Heading

**Bold**, *italic*, `code`, ~~strike~~

- [x] Task
- [ ] Todo

| Col | Value |
| --- | ---: |
| A | 1 |

> Quote

Inline math: $N,K$, $\sigma_{(u,k)}^2$

Display math:

$$
F_a=\sum_{k=1}^{K} a_k F_k
$$
```

---

## Files

| File | Purpose |
| --- | --- |
| `md-reader.html` | Main reader |
| `Open-Reader.bat` | Launch the reader; asks for a `.md` when double-clicked |
| `Open-MD-File.bat` | Open a `.md` file via drag-and-drop, command line or file association |
| `open-md.ps1` | Builds the reading page and launches the browser; used by both launchers |
| `katex/` | Bundled KaTeX 0.16.11 (JS, CSS, fonts) that the launcher inlines so formulas render offline. MIT-licensed; not needed for editing the reader |
| `.gitattributes` | Pins `*.html` and the launcher scripts to CRLF and normalises every other file |
| `.gitignore` | Keeps local build, log and editor artefacts out of the repository |
| `sample.md` | Demo document |
| `README.md` | This document (English) |
| `README.cn.md` | Chinese documentation |
| `LICENSE` | MIT License |
| `CHANGELOG.md` | Release notes |

---

## Optional: open `.md` by double-click

Windows 10/11:

1. Right-click a `.md` file → **Open with** → **Choose another app**.
2. Enable **Always use this app**, then browse and select `Open-MD-File.bat` (or a shortcut to it).
3. If `.bat` cannot be selected on your build, keep using drag-and-drop onto `Open-MD-File.bat`.

> Association support depends on Windows version; drag-and-drop always works.

---

## Requirements

- Windows 10/11 recommended
- Microsoft Edge or Google Chrome optional (for app mode)
- No Node.js / Python / installer required for normal use
- Network optional: the launcher inlines the bundled KaTeX into every reading page, so formulas render offline. `md-reader.html` opened on its own still prefers a sibling `katex/` folder, then jsDelivr

---

## Privacy

- Files are opened locally only
- No telemetry, no upload
- Formulas are typeset from the bundled `katex/` folder, so no request leaves the machine when you open a document through a launcher
- Opening `md-reader.html` directly (without the launcher) falls back to the jsDelivr CDN if the bundled copy is not reachable

---

## Development

```bash
node --test        # parser and launcher-packaging tests (test/*.test.mjs, no dependencies)
```

Manual check:

```bat
Open-Reader.bat
```

Then pick or drop `sample.md`.

The launcher scripts must keep CRLF line endings. cmd.exe misreads LF-only batch files and
fails on every line with `'xxx' is not recognized as an internal or external command`.
`.gitattributes` handles this on checkout, and `node --test` fails loudly if it regresses.

---

## License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 MD Reader Contributors.

---

## Credits

- Markdown: lightweight custom parser
- Math: [KaTeX](https://katex.org/) 0.16.11, bundled under `katex/` (MIT) + offline fallback
