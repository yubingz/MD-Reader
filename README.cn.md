# 极简 Markdown 阅读器

Windows 平台极简离线 Markdown 阅读器 —— 一个 HTML 文件加少量启动脚本。

[English README](./README.md)

---

## 功能

- 打开 / 拖拽 `.md` 文件
- GFM：标题、列表、任务列表、表格、代码块、引用
- LaTeX 公式（`$行内$` / `$$行间$$`），优先 KaTeX，离线自动回退
- 侧边目录
- 深色 / 浅色主题
- 字号调节
- 打印 / 导出 PDF
- 本地读取，不上传内容

### 公式说明

- 联网时使用 [KaTeX](https://katex.org/)
- 离线时使用内置回退（希腊字母、上下标、求和、分式等）
- 公式在 Markdown 解析前抽取，不会被 `_斜体_` 规则拆散
- 源码中的 `\\le` 等双反斜杠会自动归一为 `\le`

---

## 快速开始（Windows）

1. 下载并解压本目录
2. 双击 **`Open-Reader.bat`** 启动（有 Edge/Chrome 时为应用模式）
3. 把 `.md` 文件拖进窗口，或点击「打开」

打开指定文件：

```bat
Open-MD-File.bat "C:\path\to\your.md"
```

或将 `your.md` 拖到 **`Open-MD-File.bat`** 上。

### 浏览器直接打开

双击 `md-reader.html`，或使用 `file://` 地址打开。

---

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+O` | 打开文件 |
| `Ctrl+Shift+L` | 切换主题 |
| `Ctrl+=` / `Ctrl+-` | 字号增大 / 减小 |
| `Ctrl+0` | 恢复默认字号 |

---

## Markdown 与公式语法

```markdown
# 标题

**加粗**、*斜体*、`代码`、~~删除线~~

- [x] 已完成
- [ ] 待办

| 列 | 值 |
| --- | ---: |
| A | 1 |

> 引用

行内公式：$N,K$、$\sigma_{(u,k)}^2$

行间公式：

$$
F_a=\sum_{k=1}^{K} a_k F_k
$$
```

---

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `md-reader.html` | 主阅读器 |
| `Open-Reader.bat` | 启动阅读器（优先 Edge 应用模式） |
| `Open-MD-File.bat` | 通过拖拽或命令行打开 `.md` |
| `open-md.ps1` | `Open-MD-File.bat` 使用的辅助脚本 |
| `sample.md` | 示例文档 |
| `README.md` | 英文说明 |
| `README.cn.md` | 本文（中文说明） |
| `LICENSE` | MIT 许可证 |
| `CHANGELOG.md` | 更新日志 |

---

## 可选：双击打开 `.md`

Windows 10/11：

1. 右键 `.md` 文件 →「打开方式」→「选择其他应用」
2. 勾选「始终使用此应用」，浏览并选择 `Open-MD-File.bat`（或其快捷方式）
3. 若当前系统无法直接选择 `.bat`，可继续用拖到 `Open-MD-File.bat` 的方式

> 能否关联 `.bat` 与 Windows 版本有关；拖拽方式始终可用。

---

## 运行环境

- 推荐 Windows 10/11
- 可选 Microsoft Edge / Google Chrome（应用模式）
- 日常使用无需安装 Node.js / Python / 安装包
- 网络可选（联网时从 jsDelivr 加载 KaTeX；离线公式仍可用）

---

## 隐私

- 仅在本地读取文件
- 无遥测、无上传
- 联网时可能从 jsDelivr CDN 加载 KaTeX 静态资源

---

## 开发

测试文件（`test-*.js`）位于开发目录，不包含在本发布包中。

手动检查：

```bat
Open-Reader.bat
```

然后拖入 `sample.md`。

---

## 版权

MIT 许可证，详见 [LICENSE](./LICENSE)。

Copyright (c) 2026 MD Reader Contributors.

---

## 致谢

- Markdown：自研轻量解析
- 公式：[KaTeX](https://katex.org/)（可选）+ 离线回退
