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
2. Double-click **`Open-Reader.bat`** to start the app-mode window (Edge/Chrome if available).
3. Drop a `.md` file into the window, or click **Open**.

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
| `Open-Reader.bat` | Launch reader (Edge app mode if available) |
| `Open-MD-File.bat` | Open a `.md` file via drag-and-drop or CLI |
| `open-md.ps1` | Helper used by `Open-MD-File.bat` |
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
- Network optional (loads KaTeX from jsDelivr when online; offline math still works)

---

## Privacy

- Files are opened locally only
- No telemetry, no upload
- When online, KaTeX static assets may be loaded from the jsDelivr CDN

---

## Development

Tests (`test-*.js`) live in the workspace and are not shipped in this folder.

Manual check:

```bat
Open-Reader.bat
```

Then drop `sample.md`.

---

## License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 MD Reader Contributors.

---

## Credits

- Markdown: lightweight custom parser
- Math: [KaTeX](https://katex.org/) (optional) + offline fallback
