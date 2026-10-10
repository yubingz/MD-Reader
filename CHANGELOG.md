# Changelog

## Unreleased

### Fixed
- Unclosed code fence no longer drops the rest of the document (#1)
- Link and image URLs are restricted to http/https/mailto, fragments and relative paths (#3)
- KaTeX no longer renders with a blanket `trust: true`: `\href{javascript:…}` cannot become a link and `\includegraphics` cannot fetch a remote image (#5)
- `Open-Reader.bat` and `Open-MD-File.bat` were committed with LF line endings, so cmd.exe misread them and every launch died with `'xxx' is not recognized as an internal or external command` (#9)
- Double-clicking `Open-Reader.bat` no longer stops at an empty reader: it asks for a `.md` and opens it in the same step (#10)
- Link and image titles (`[t](url "T")`) are rendered instead of being left as literal text (#7)
- The offline math fallback renders operator names (`\max`, `\min`, `\log`, …) and drops unknown commands instead of printing the raw TeX (#12)
- Nested lists nest inside their parent item, 4-backtick fences keep an inner fenced block, a setext h2 renders as a heading, and `\|` no longer splits a table cell (#14)
- The launcher anchors the preload on the unique `/* PARSER:BEGIN */` marker instead of a repeated literal, and deletes the temp reading page it creates after opening it (#16)
- `md-reader.html` ships with CRLF line endings only, so editing it no longer shows unrelated EOF/line-ending noise; `.gitattributes` pins `*.html` to CRLF and normalises every other file, and a `.gitignore` keeps local build artefacts out of the repository (#18)
- Opening a document works again: the launcher writes the reading page next to the source file as `<name>.reader.html` instead of creating and then deleting a copy in `%TEMP%`, which raced the browser and made it report "File not found. It may have been moved, edited or deleted." for every file (#20, #22)
- A `$` that does not open a formula no longer swallows the text after it. The old `$...$` detection required the span to look "math-ish", so an unmatched `$` was consumed and the rest of the line disappeared. Any closed `$...$` span is now treated as a formula, with two exceptions kept as literal text: a price (`$5.50`, `$1,200.50` — a leading digit and no TeX syntax) and a span containing a newline. A bare `$1$` therefore renders as text rather than as math
- A line holding two prices no longer loses its middle: `税费 $5.50 和 $6.00 元` used to render as `税费 <math>6.00 元` because the first `$` paired with the second

### Added
- Formulas render with no network access: the launcher inlines a bundled KaTeX 0.16.11 build (JS + CSS + fonts) into every generated reading page, so opening a document offline no longer falls back to the plain-text renderer. `node --test` treats a pruned font as an error and asserts the KaTeX script is written as its own closed tag
- Both launchers now call `open-md.ps1`, which hands the page to the browser the user has registered for `.html` (instead of probing for Edge), converts paths through `[Uri]` (spaces, non-ASCII, `#`) and shows the real error instead of a generic "failed to build reading page"
- `Open-Reader.bat` accepts a dragged file as well as a double-click (`-MdPath` alongside `-Pick`), and the file dialog opens in the current folder when it already holds Markdown documents
- The launchers switch the console to UTF-8 (`chcp 65001`) first, so their bilingual messages are readable on a GBK console instead of mojibake
- `.gitattributes` pins `*.bat`, `*.cmd` and `*.ps1` to CRLF, so a clone, download or ZIP always lands with working launchers
- Markdown containing `</script>` can no longer break the generated reading page (the injected text escapes `</`)

### Changed
- Typesetting is spread over animation frames. The project's own 140 KB paper holds 1307 formulas at ~0.9 ms each, so a single synchronous pass blocked the first paint for over a second
- Typesetting budgets each frame by elapsed time (~10 ms) rather than a fixed number of formulas, so a heavy document cannot overrun the frame and drop scroll/input responsiveness regardless of how complex its formulas are

## 1.0.0 — 2026-09-29

### Added
- Minimal offline Markdown reader (single HTML)
- GFM: headings, lists, tasks, tables, code, quotes
- LaTeX math (`$...$`, `$$...$$`) with KaTeX + offline fallback
- Dark / light theme, TOC, font size, print-to-PDF
- Windows launchers: `Open-Reader.bat`, `Open-MD-File.bat`
- Bilingual README (zh-CN / en)

### Fixed
- Math no longer broken by markdown `_italic_` rules
- Normalize escaped `\\` in TeX sources
- Blockquotes no longer show `[object Object]`
