# 层叠的中国 v3 · 一次滚动完成的论证
## 在线访问：https://cavno.github.io/cengdie/
滚动叙事（scrollytelling）地图：地图固定全屏，**你只做一个动作——滚动**。22 步，每步一句话、地图一个变化，看完即看懂中国省界与方言、族群、山川的系统性错位（「犬牙交错」）。末尾附全国 330 余市级单位的完整自由探索地图。

纯静态站点（HTML + CSS + JS），无构建步骤。

---

## 本地运行（一条命令）

在本目录下任选其一：

```bash
# Python（macOS / Linux 自带，Windows 装了 Python 也有）
python3 -m http.server 8000
# 然后浏览器打开 http://localhost:8000

# 或 Node
npx serve .

# 或 VS Code：装 Live Server 扩展，右键 index.html → Open with Live Server
```

> 直接双击 `index.html`（file:// 协议）通常也能用——边界数据源 DataV 允许跨域。但个别浏览器对 file:// 下的 fetch 有限制，遇到地图空白就用上面的本地服务器，稳。

需要联网加载三样东西：D3（jsDelivr）、字体（Google Fonts）、行政边界 GeoJSON（阿里 DataV，国内直连快）。若要彻底离线，见下方「自托管」。

## 为什么这版直观

| 之前的问题 | v3 的回应 |
|---|---|
| v1：7 个图层开关自由组合，用户要自己"发现"论点 | 没有任何开关。滚动即叙事。 |
| v2：分了七章，但每章仍一次性砸出全图（23 色、330 块、20+ 项图例、密集导语） | **一屏只讲一件事**：镜头推到江苏 → 苏州变蓝 → 徐州变黄 → 整个中原官话区亮起。结论由画面的变化直接送达，每步只配一两句话。 |
| "先读说明书再看图" | "看着图就懂了"。全国 23 色总图不再是开场轰炸，而是第 17 步的收获——那时你已经学会怎么读它。 |

每一步是**声明式的完整地图状态**（不是增量），所以上下来回滚永不失步。

技术上依然纯静态：瓶颈从来不在技术栈，在信息架构。所以本地跑是一条命令，将来推 GitHub Pages 也一个字不用改。

## 结构

```
index.html   骨架：开场 → 滚动叙事 → 自由探索 → 方法注记
style.css    宣纸/墨线/朱砂视觉；卡片浮于固定地图之上
data.js      330 余市级单位 → 方言/文化圈归类表（169 条显式 + 各省默认）、13 自然区、10 山脉、故事点
app.js       叙事引擎：MapView（故事/探索双视图）、22 步定义、IntersectionObserver 驱动、并行加载与三级备援
```

## 边界数据（运行时加载）

- 省级：DataV `100000_full.json`；市级：各省 `{adcode}_full.json` × 27 并行
- 备援链：DataV → jsDelivr → GitHub raw（longwosion/geojson-map-china）
- 任一省失败 → 用省级面补洞；全部失败 → 提示并给出自托管指引

### 自托管（彻底离线，可选）

1. 下载 `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json` 与各省 `{adcode}_full.json`，放入本目录 `geo/`
2. 把 `app.js` 里的 `DATAV` 常量改为 `"geo/"`（文件名规则不变）

## 部署到 GitHub Pages（不用改任何东西）

```bash
git init && git add . && git commit -m "china atlas v3"
git remote add origin https://github.com/<你>/<repo>.git
git push -u origin main
```

仓库 Settings → Pages → Deploy from a branch → main / (root)。

## 注记

市级归类依据《中国语言地图集》（第 2 版）大区划分，过渡地带从主；徐州、汉中、信阳、九江、上饶等争议点位在探索模式点击可见专门注释。本图为文化示意，非学术精确边界。
