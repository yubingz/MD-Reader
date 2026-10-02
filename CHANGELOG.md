# Changelog

## Unreleased

### Fixed
- Unclosed code fence no longer drops the rest of the document (#1)
- Link and image URLs are restricted to http/https/mailto, fragments and relative paths (#3)
- KaTeX no longer renders with a blanket `trust: true`: `\href{javascript:…}` cannot become a link and `\includegraphics` cannot fetch a remote image (#5)

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
