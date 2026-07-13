## 访问地址：https://cavno.github.io/baodan/
# 报单管理系统 · P0 演示原型

单文件零构建静态应用(`index.html`),按《报单管理系统 PRD v1.0》实现 P0 全闭环:用户端报单(截图自动拼图、示例弹层、自检清单、订单号全局查重)、11 态状态机与素材闸门补传、订单查询与批量单号解析(Excel 整列粘贴)、「我的」四模块(通知/收益/待办/改密)、管理端活动配置、跟单与丢单申诉、审核工作台(校验提示、单笔/批量通过、驳回)、打款批次(CSV 导出)、活动财务核算(净收益 = 渠道结算收入 −(已返款 − 追回))、违规判定与追回台账、操作日志。已通过 24 项 jsdom 冒烟测试(状态机全链路、财务口径、批量解析、双端路由渲染)。

## 演示账号

| 端 | 账号 | 密码 |
|---|---|---|
| 用户端(移动 H5) | 13800000001 | 123456 |
| 管理端(桌面) | admin | admin123 |

注册页短信验证码为演示码 `123456`。内置 2 个用户、3 个活动、12 笔覆盖全部 11 个状态的报单,入口页可一键重置演示数据。

## 部署到 GitHub Pages(推荐)

1. GitHub 新建仓库(如 `baodan-p0`),把本目录的 `index.html` 上传到仓库根目录(网页端 Add file → Upload files 即可,无需构建)。
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch`,Branch 选 `main` / `(root)`,保存。
3. 约一分钟后访问 `https://<你的用户名>.github.io/baodan-p0/`。也可直接放进你现有 GitHub Pages 仓库的子目录,路径同理。

活动分享链接即页面 URL + 哈希路由(如 `.../#/u/act/a1`),微信群内点开直达活动详情。

## 本地运行

双击 `index.html` 即可(纯 file:// 可用,无任何网络依赖);或 `python3 -m http.server` 后访问 `http://localhost:8000`。

## 数据与边界(重要)

- 数据保存在**当前浏览器 localStorage**(键 `bd_p0_v1`),换浏览器/清缓存即消失;入口页提供导出/导入 JSON 备份。
- 截图以 dataURL 存储,localStorage 总量约 5MB:拼图已自动压缩(宽 640/480、JPEG),演示够用,不适合真实批量图片。
- 这是**单机演示**:没有真实多用户共享、没有服务端鉴权,密码为明文存储,请勿填写真实支付宝与常用密码。

## 生产化路径(对应 PRD §8)

数据层已隔离在 `DB / load() / save()` 与领域函数(`setStatus / advanceAfterFollow / submitMaterial / approve / reject / finOf` 等)中,生产化时将其替换为 REST API 调用即可,页面结构可整体复用。建议栈:Node.js + MySQL(与 yezhu-web 同栈)、图片签名直传 OSS、支付宝账号 AES 加密落库、JWT 登录态;用户端保持微信内 H5(返利报单类小程序类目过审风险高,不建议)。
