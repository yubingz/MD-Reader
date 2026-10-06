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

### Changed
- Both launchers now call `open-md.ps1`, which finds Edge itself, converts paths through `[Uri]` (spaces, non-ASCII, `#`) and shows the real error instead of a generic "failed to build reading page"
- The launchers switch the console to UTF-8 (`chcp 65001`) first, so their bilingual messages are readable on a GBK console instead of mojibake
- `.gitattributes` pins `*.bat`, `*.cmd` and `*.ps1` to CRLF, so a clone, download or ZIP always lands with working launchers
- Markdown containing `</script>` can no longer break the generated reading page (the injected text escapes `</`)

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
