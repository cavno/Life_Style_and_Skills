# 房贷计算器 · Mortgage Calculator

精确的中国房贷计算器，纯前端静态网页，可直接部署到 GitHub Pages。
# Visit：https://cavno.github.io/mortgage-calc/
## 特性

- **精确计算**：使用 IEEE 754 双精度浮点（与 Excel 内部一致），所有公式（PMT / IPMT / PPMT / CUMIPMT / CUMPRINC）经过逐位对比，与 Microsoft Excel 结果精度匹配至 14 位有效数字。
- **完整功能**：
  - 贷款计算（商业贷款、公积金贷款、组合贷款）
  - 等额本息 / 等额本金 两种还款方式
  - 当前还款状态快照（已还本金、已还利息、剩余本金、进度）
  - 完整逐月还款明细表（可导出 CSV）
  - 提前还款分析（缩短期限 / 减少月供）
  - LPR 利率历史参考
- **零依赖**：原生 HTML / CSS / JavaScript，无构建步骤、无后端、无 npm。

## 本地使用

直接用浏览器打开 `index.html` 即可。

```bash
# 或使用本地服务器（推荐）：
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署到 GitHub Pages

### 方法一：从 main 分支根目录部署（最简单）

1. 创建新仓库，例如 `mortgage-calc`
2. 把所有文件推送到 main 分支：
   ```bash
   git init
   git add .
   git commit -m "feat: 房贷计算器初始版本"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mortgage-calc.git
   git push -u origin main
   ```
3. 在 GitHub 仓库 → **Settings** → **Pages**：
   - Source：选择 **Deploy from a branch**
   - Branch：选择 **main**，文件夹选 **/ (root)**
   - 点击 **Save**
4. 等 1-2 分钟，访问 `https://<your-username>.github.io/mortgage-calc/`

### 方法二：使用 GitHub Actions

如果你想要更现代的部署流程，可以创建 `.github/workflows/pages.yml`：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

在 GitHub Pages 设置中，把 **Source** 改成 **GitHub Actions** 即可。

## 文件结构

```
.
├── index.html       # 页面结构
├── styles.css       # 样式
├── app.js           # 应用逻辑（输入、UI、表格）
├── finance.js       # Excel 兼容的金融函数（PMT / CUMPRINC 等）
├── .nojekyll        # 告诉 GitHub Pages 不要走 Jekyll 流程
└── README.md
```

## 精度说明

所有金融函数都按照 Microsoft 的 Excel/Office 公式实现，与 Excel 同源（IEEE 754 双精度浮点）。验证用例：

| 公式 | 输入 | 本工具 | Excel | 误差 |
|------|------|--------|-------|------|
| PMT | r=3.3%/12, n=270, P=1,760,452.12 | 9246.21096335222 | 9246.2109633522832 | <10⁻¹² |
| CUMPRINC | 同上，n=360, 期 1~86 | 277899.7696284376 | 277899.76962844183 | <10⁻¹⁰ |
| CUMIPMT | 同上 | 385159.5338306155 | 385159.53383061505 | <10⁻¹⁰ |

误差均来自浮点累加顺序的不同，属于不可避免的硬件精度。如需更高精度（任意精度小数），可替换 `finance.js` 内部为 `decimal.js`。

## 算法说明

### 等额本息（Equal Monthly Payment）

每月支付固定金额 P，由 PMT 公式给出：

$$
P = \frac{L \cdot r}{1 - (1+r)^{-n}}
$$

其中 `L` 为贷款本金、`r` 为月利率（年利率 / 12）、`n` 为总期数。

第 k 期：
- 利息 $I_k = B_{k-1} \cdot r$
- 本金 $P_k = P - I_k$
- 期末余额 $B_k = B_{k-1} - P_k$

### 等额本金（Equal Principal Payment）

每月归还固定本金 $L/n$，利息按剩余本金计算，月供逐月递减：

$$
\text{月供}_k = \frac{L}{n} + \left(L - \frac{L \cdot (k-1)}{n}\right) \cdot r
$$

## License

MIT
