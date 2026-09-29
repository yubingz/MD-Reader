# Sample / 示例文档
# Minimal MD Reader demo / 极简 Markdown 阅读器演示

This is a **Markdown** sample with LaTeX math.  
这是一份含 LaTeX 公式的 **Markdown** 示例。

## Notation / 记号

| Symbol 符号 | Meaning 含义 |
| --- | --- |
| $N,K$ | Number of clients / clients per round; $d$ model dim. / 终端总数、每轮参与数；$d$ 模型维度 |
| $\tau,\eta$ | Local steps / learning rate. / 本地步数、学习率 |
| $F_k,F_a$ | Local objective / weighted objective $F_a=\sum_k a_k F_k$ / 本地目标、加权目标 |
| $\sigma_{(u,k)}^2,\sigma_{(d,k)}^2$ | Uplink/downlink noise variance per dim. / 上行、下行噪声每维方差 |
| $\rho_k$ | Directional asymmetry $\rho_k=\sigma_{(u,k)}^2/\sigma_{(d,k)}^2$ / 方向不对称比 |
| $\Psi$ | Directional hazard ratio. / 方向危害比 |

## Inline & display math / 行内与行间公式

Inline / 行内: $F_a=\sum_{k=1}^{K} a_k F_k$ and $\sigma_{(u,k)}^2$.

With escaped backslashes (as in many exports) / 含 `\\` 转义（常见于导出）:

且 $\\C_{\tau,k}\\|2\\le c\tau^{+}:=\max\Big\{1-\eta\lambda_{\max}\}^\tau,\; \big(1+\eta\max\{-\lambda_{\min},0\}\big)^{\tau-1}\Big\}$。

Display / 行间:

$$
\Psi=\dfrac{\text{下行噪声贡献}}{\text{上行噪声贡献}}
$$

$$
\min_{w}\; \frac{1}{N}\sum_{i=1}^{N}\ell(f(x_i;w),y_i)+\lambda\|w\|_2^2
$$

## Checklist / 功能清单

- [x] Drag & drop `.md` / 拖拽打开
- [x] GFM tables & tasks / 表格与任务列表
- [x] LaTeX math `$...$` / `$$...$$`
- [x] Dark / light theme / 深浅色主题

## Code / 代码

```python
def hello(name: str) -> str:
    return f"Hello, {name}! / 你好，{name}！"
```

> Tip / 提示: `$` inside code blocks is not treated as math.  
> 代码块中的 `$` 不会被当作公式。
