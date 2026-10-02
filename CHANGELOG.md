# Changelog / 更新日志

## Unreleased

### Fixed
- Unclosed code fence no longer drops the rest of the document (#1)

## 1.0.0 — 2026-09-29

### Added / 新增
- Minimal offline Markdown reader (single HTML) / 极简离线 Markdown 阅读器（单 HTML）
- GFM: headings, lists, tasks, tables, code, quotes / GFM 语法支持
- LaTeX math (`$...$`, `$$...$$`) with KaTeX + offline fallback / 公式渲染（KaTeX + 离线回退）
- Dark / light theme, TOC, font size, print-to-PDF / 主题、目录、字号、打印
- Windows launchers: `Open-Reader.bat`, `Open-MD-File.bat` / Windows 启动脚本
- Bilingual README (zh-CN / en) / 中英对照说明

### Fixed / 修复
- Math no longer broken by markdown `_italic_` rules / 公式不再被下划线斜体拆散
- Normalize escaped `\\` in TeX sources / 归一化公式中的 `\\` 转义
- Blockquotes no longer show `[object Object]` / 引用块不再显示 `[object Object]`
