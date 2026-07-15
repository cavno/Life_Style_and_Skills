# 阿里云 Windows Server 2025 部署 yezhu-web 保姆级指南（不用宝塔，官方原生）

用官方 Node.js 跑程序，用 **NSSM** 把它做成 Windows 服务（开机自启、崩溃自重启），用 **Caddy 或 IIS** 做 HTTPS 反向代理。**这条路能让微信里正常打开**——前提是按第 10、11 章做完域名备案 + HTTPS。

> 请用我最新给你的 **`yezhu-web.zip`**（已内置 `.env` 自动读取、`auto` 同源模式）。

---

## 〇、先记住整体顺序与一个现实

- 程序用「**一体化**」方式跑：Node 同时托管前端 + API，**只一个程序、一个端口（3999）**。
- 部署四步：**装 Node → 跑起来 → 做成服务 → 反代上 HTTPS**。
- **现实（务必先知道）**：阿里云**大陆**服务器 + 域名对外 = **必须 ICP 备案**，否则 80/443 被拦、微信打不开。
  - **备案前**：只能用「**公网IP + 高位端口 3999**」自测。
  - **备案通过 + HTTPS 后**：才能用「域名 + 443」，微信才稳定打开。

---

## 第 1 章 · 远程登录服务器

1. 本地电脑 `Win + R` → 输入 `mstsc` → 回车。
2. 填阿里云 ECS 的**公网 IP** → 连接 → 输入管理员账号密码（忘了就到阿里云控制台「实例 → 重置实例密码」）。
3. 进入服务器桌面（远程桌面 RDP）。

---

## 第 2 章 · 安装 Node.js（官方）

1. 服务器里打开浏览器，访问 **nodejs.org** → 下载 **Windows Installer（LTS，.msi）**（选 LTS，如 20 / 22）。
   - 服务器浏览器可能被「**IE 增强的安全配置**」拦下载：打开「服务器管理器 → 本地服务器 → IE 增强的安全配置 → 关闭（至少对 Administrators 关）」；或直接在本地电脑下好 `.msi`，用 RDP 复制粘贴到服务器。
2. 双击 `.msi`，一路「Next」安装（默认会「Add to PATH」，**不需要**勾选那个额外安装编译工具链的选项）。
3. 验证：开始菜单搜 `cmd` →「以管理员身份运行」→ 输入 `node -v` 和 `npm -v`，都显示版本号即成功。

---

## 第 3 章 · 放程序文件

1. 把 `yezhu-web.zip` 拷到服务器：RDP 窗口里**直接复制粘贴/拖拽**即可（或上传到服务器再下载）。
2. 放到 **`C:\yezhu-web`**，右键「全部解压缩」。
3. 确认 `C:\yezhu-web` 下有 **`server`** 和 **`web`** 两个文件夹（**保持这个结构别拆**，一体化靠 `server` 旁边有 `web`）。

---

## 第 4 章 · 安装依赖

1. 管理员 cmd 里：
   ```
   cd /d C:\yezhu-web\server
   npm install
   ```
2. 出现 `added xx packages` 即成功（依赖全是纯 JS，**不需要装 Python/VS 编译器**）。
3. 慢或失败就换国内镜像后重装：
   ```
   npm config set registry https://registry.npmmirror.com
   npm install
   ```

---

## 第 5 章 · 配置 `.env` 与 `config.js`

1. 进 `C:\yezhu-web\server`，把 `.env.example` 复制一份、改名为 **`.env`**，用记事本编辑成：
   ```
   ADMIN_PASSCODE=你的发起人口令
   PORT=3999
   SERVE_WEB=1
   ```
   - 记事本「另存为」时：文件名打 **`.env`**、保存类型选 **「所有文件」**、编码 **UTF-8**，避免存成 `.env.txt`。
   - `SERVE_WEB=1` 这行必须有（开启一体化，让后端带出前端页面）。
2. 进 `C:\yezhu-web\web\js`，记事本打开 **`config.js`**，把
   ```
   API_BASE_URL: '',
   ```
   改成
   ```
   API_BASE_URL: 'auto',
   ```
   保存。

---

## 第 6 章 · 先手动跑一次（自测）

1. 管理员 cmd（在 `C:\yezhu-web\server`）：
   ```
   node server.js
   ```
   看到这三行即成功：
   ```
   已加载 .env 配置
   已启用静态前端托管： C:\yezhu-web\web
   业主之家后端已启动： http://localhost:3999
   ```
2. 服务器自己的浏览器打开 **`http://localhost:3999`** → 看到「业主之家」首页 → 试「发起人登录 → 小区参数 → 联名 → 审核 → 导出」走一圈。
3. 测完回 cmd 按 `Ctrl + C` 停掉。下一步把它做成开机自启的服务。

---

## 第 7 章 · 做成 Windows 服务（NSSM，开机自启 + 崩溃自重启）

1. 服务器浏览器打开 **nssm.cc** → 下载 `nssm-2.24.zip` → 解压，进 `win64` 拿到 **`nssm.exe`**。
2. 把 `nssm.exe` 放到 **`C:\nssm\`**。
3. 管理员 cmd：
   ```
   cd /d C:\nssm
   nssm install yezhu
   ```
   弹出图形窗口，填：
   - **Application → Path**：`C:\Program Files\nodejs\node.exe`
   - **Startup directory**：`C:\yezhu-web\server`
   - **Arguments**：`server.js`
   - （可选）**I/O 选项卡** 填日志：Output `C:\yezhu-web\logs\out.log`、Error `C:\yezhu-web\logs\err.log`（先手动建好 `C:\yezhu-web\logs` 文件夹）
   - 点 **Install service**。
4. 启动并设为自动：
   ```
   nssm start yezhu
   ```
   - 查状态：`nssm status yezhu`（显示 `SERVICE_RUNNING`），或 `services.msc` 里看到「yezhu」为「正在运行 / 自动」。
5. 以后**改了 `.env` 或代码**，执行：`nssm restart yezhu` 生效。
6. （不想用第三方的纯 Windows 替代）「任务计划程序」建一个「启动时」运行 `node server.js` 的任务也行，但崩溃自恢复不如 NSSM，**推荐 NSSM**。

---

## 第 8 章 · 放行端口（阿里云安全组 + Windows 防火墙）

**两道防火墙都要放行**，少一道都连不上。

1. **阿里云安全组**：控制台 → 该 ECS 实例 → 安全组 → 配置规则 → **入方向 → 手动添加**：协议 TCP、端口 `3999`、授权对象 `0.0.0.0/0`、允许。（正式上线再加 `80`、`443`。）
2. **Windows 防火墙**：服务器里「高级安全 Windows Defender 防火墙 → 入站规则 → 新建规则 → 端口 → TCP → 特定端口 `3999` → 允许连接 → 完成」。

---

## 第 9 章 · 用公网 IP 测试

1. 本地电脑浏览器打开 **`http://<你的公网IP>:3999`** → 应能看到首页并正常用。
2. 这是「HTTP + IP」，适合**测试 / 内部用**。要发微信群、给全小区用，请继续做第 10、11 章（域名 + 备案 + HTTPS）——否则微信里多半打不开。

---

## 第 10 章 · 绑域名 + 备案（大陆必须）

1. **域名解析**：阿里云「域名 → 解析设置」→ 添加记录：类型 `A`、主机记录 `@`（和一条 `www`）、记录值填你的**公网 IP**。
2. **ICP 备案**：阿里云「备案」控制台（beian.aliyun.com 或阿里云 App）→ 按引导提交（主体实名、域名、这台 ECS 实例）。**免费，约 7–20 天。**
3. **备案前**：大陆访问该域名的 80/443 会被拦，只能用 `IP:3999` 测；**备案通过后**才能正式用 `80/443 + 域名 + 微信`。

---

## 第 11 章 · 上 HTTPS（二选一）

微信、手机相机、安全都需要 HTTPS。**务必先：备案通过 + 在安全组和 Windows 防火墙放行 80、443。**

### 方式 A（最简单，推荐）：Caddy 自动 HTTPS
1. 服务器浏览器到 **caddyserver.com** 下载 **Windows amd64** 的 `caddy.exe`，放 `C:\caddy\`。
2. 同目录新建文件 **`Caddyfile`**（无扩展名），内容：
   ```
   你的域名 {
       reverse_proxy 127.0.0.1:3999
   }
   ```
3. 放行 80、443（安全组 + 防火墙）。
4. 测试跑：管理员 cmd `cd /d C:\caddy` → `caddy run`。Caddy 会**自动申请 Let's Encrypt 证书**。用浏览器 / 微信打开 `https://你的域名`。
5. 设为常驻：再用 NSSM 注册一个服务——`nssm install caddy`，Path `C:\caddy\caddy.exe`、Arguments `run`、Startup directory `C:\caddy`，安装并 `nssm start caddy`。

### 方式 B（官方 Windows）：IIS + ARR 反向代理 + 阿里云免费证书
1. 「服务器管理器 → 添加角色和功能 → Web 服务器(IIS)」安装。
2. 装两个 IIS 扩展（微软官网直接下 MSI，Web 平台安装器已停用）：**URL Rewrite 2.1** 和 **Application Request Routing 3.0 (ARR)**。
3. 「IIS 管理器 → 点服务器名 → Application Request Routing Cache → 右侧 Server Proxy Settings → 勾 Enable proxy → 应用」。
4. 阿里云「SSL 证书（数字证书管理服务）→ 免费证书 → 创建并申请（DNS 验证）→ 下载 **IIS 格式**（得到 `.pfx` 和密码）」。
5. IIS 新建网站（绑你的域名）→ 导入该证书 → 添加 `443` 的 https 绑定。
6. 选中该网站 → 「URL 重写 → 添加规则 → 空白入站规则」：匹配 `(.*)` → 操作 Rewrite/重写到 `http://127.0.0.1:3999/{R:1}` → 勾「停止处理后续规则」。
7. 放行 80、443，打开 `https://你的域名` 测试。

---

## 第 12 章 · 微信里打开（目标达成）

1. 备案通过 + HTTPS 生效后，把 **`https://你的域名`** 发到微信群，用微信自带浏览器打开，应正常显示与使用。
2. 可生成二维码贴在楼栋单元口。

---

## 第 13 章 · 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `node`/`npm` 不是命令 | 没进 PATH | 重开 cmd；或重装 Node 勾「Add to PATH」 |
| `npm install` 慢/失败 | 源在国外 | `npm config set registry https://registry.npmmirror.com` 再装 |
| `公网IP:3999` 打不开 | 安全组/防火墙没放行，或服务没起 | 第 8 章两道都放行；`nssm status yezhu` 看是否运行 |
| 服务起不动 | node 路径/目录填错 | 先手动 `node server.js` 看报错；核对 NSSM 的 Path 与 Startup directory |
| 改了 `.env` 不生效 | 没重启服务 | `nssm restart yezhu` |
| 域名打不开但 `IP:3999` 能开 | 没备案 / 解析没生效 / 80 没放行 | 完成备案；查 A 记录；放行 80/443 |
| **微信打不开但浏览器能开** | 没 HTTPS 或没备案 | 微信对「未备案 / 纯 HTTP / 裸 IP」很严——按第 10、11 章做完域名备案 + HTTPS |
| Caddy 证书申请失败 | 80 没放行 / 域名没解析到本机 / 没备案致 80 被拦 | 先备案 + 解析 + 放行 80，再 `caddy run` |
| 上传证件看不到 | 设计如此 | 证件/手机号仅发起人审核端可见 |

---

## 第 14 章 · 维护与安全

- **数据**：`C:\yezhu-web\server\data\db.json`；**图片**：`C:\yezhu-web\server\uploads\`。定期把这两样复制备份。
- **改代码/配置后**：`nssm restart yezhu`（动了 Caddy 配置则 `nssm restart caddy`）。
- **看状态**：`services.msc` 或 `nssm status yezhu`。阿里云 ECS 默认一直在线，服务设了自动启动，重启服务器也会自动拉起。
- **安全**：改 RDP 默认端口、用强密码、及时打系统补丁；只放行需要的端口（3999 仅测试用，正式用 80/443，测完可在安全组关掉 3999 外部访问）；发起人口令设复杂些。

---

## 附 · 你要做的事，总清单

1. ✅ RDP 登录服务器（第 1 章）。
2. ✅ 装官方 Node.js LTS（第 2 章）。
3. ✅ 解压 `yezhu-web` 到 `C:\yezhu-web`，保持 `server`/`web` 同级（第 3 章）。
4. ✅ `server` 目录 `npm install`（第 4 章）。
5. ✅ 配 `.env`（口令 / `PORT=3999` / `SERVE_WEB=1`）+ `config.js` 填 `auto`（第 5 章）。
6. ✅ `node server.js` 自测 `http://localhost:3999`（第 6 章）。
7. ✅ NSSM 注册成服务并启动（第 7 章）。
8. ✅ 安全组 + Windows 防火墙放行 3999（第 8 章）。
9. ✅ `http://公网IP:3999` 测试（第 9 章）。
10. ✅ 域名解析 + 阿里云备案（第 10 章）。
11. ✅ Caddy 或 IIS 上 HTTPS（第 11 章）。
12. ✅ 微信打开 `https://你的域名`（第 12 章）。

> 法规与流程内容依据《龙岗区业主大会及业主委员会工作指导手册》及《深圳经济特区物业管理条例》。各环节具体材料、时限、公示与表决比例，以手册原文及所属街道办要求为准。
