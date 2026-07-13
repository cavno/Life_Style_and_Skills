# 访问地址：https://cavno.github.io/shenzhen/
# 深圳 · 地形—战略叠加底图

单文件、零依赖（无 CDN，可在墙内直开）。山链 / 流域·分水岭 / 口岸·港 / 二线关 / 通道·轨道 / 轴线西移 / 十字方针 / 四个面向，共 9 个可叠加图层 + 6 个预设视角。

## 部署（GitHub Pages）

1. 新建仓库（如 `sz-terrain-strategy`），把 `index.html` 放在根目录并 push。
2. Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / root，保存。
3. 约一分钟后访问 `https://<用户名>.github.io/sz-terrain-strategy/`。

本地预览：`python -m http.server` 后打开 `http://localhost:8000`（或直接双击文件亦可）。

## 数据与精度

- 行政边界：DataV 公开数据镜像（GeoMapData_CN），道格拉斯—普克简化，容差约 60 m；大鹏为功能区（行政隶属龙岗），按空间事实从龙岗多边形中拆出单列。
- 香港、东莞、惠州、中山轮廓为粗略示意；山脊、河道、分水岭、二线、通道走向均为示意精度，非测绘成果。
- 深汕合作区以右下角飞地框表示，不按实距（约 90 km）。

v1.0 · 2026-07
