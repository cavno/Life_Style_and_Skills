# yezhu-web 部署保姆级教程（阿里云香港轻量服务器 · Ubuntu 22.04）

本教程带你把 **yezhu-web**（业主联名网页版）从零部署到你刚买的香港服务器上，配好 **HTTPS 自动证书**，让业主可以通过 `https://你的域名` 访问。

全程**照着复制粘贴命令**即可，不需要懂 Linux。遇到任何一步卡住，把命令和报错发我。

---

## 目录

- 第 0 步：开始前的准备（要准备什么）
- 第 1 步：连接到服务器
- 第 2 步：放行防火墙端口（最容易漏，务必做）
- 第 3 步：安装基础环境（Node.js + 工具）
- 第 4 步：加一道内存保险（Swap）
- 第 5 步：上传 yezhu-web 程序到服务器
- 第 6 步：安装依赖、配置、首次启动测试
- 第 7 步：用 pm2 让程序常驻后台、开机自启
- 第 8 步：域名解析（把域名指向服务器）
- 第 9 步：安装 Caddy，一键开启 HTTPS
- 第 10 步：验证上线
- 第 11 步：日常维护（更新程序、看日志、备份）
- 附录 A：没有域名时，先用 IP 临时访问
- 附录 B：常见问题排查

---

## 第 0 步：开始前的准备

你需要准备好 3 样东西：

1. **服务器信息**（阿里云轻量应用服务器控制台里能看到）：
   - **公网 IP 地址**（形如 `47.xxx.xxx.xxx`）
   - **登录密码**（如果买的时候没设，在控制台「重置密码」里设一个，记住它）

2. **yezhu-web 程序包**：就是我给你的 `yezhu-web.zip`（最新版，含物业模块、答疑、小程序接口那一版）。先下载到你自己的电脑上。

3. **域名**（可选但强烈建议）：如 `kxtxmt.com`，且你能登录它的**域名解析后台**。
   - 如果域名还没买/没到手，**可以先跳过第 8、9 步**，用 IP 临时访问（见附录 A），等域名好了再回来配 HTTPS。

> 说明：本教程假设你在 **Windows 电脑**上操作。如果你用 Mac，连接服务器的命令一样，只是不用装 PuTTY（Mac 自带终端）。

---

## 第 1 步：连接到服务器

你要先"进入"服务器，才能敲命令。两种方式，任选其一。

### 方式一：网页版（最简单，零安装，推荐第一次用）

1. 登录阿里云 → 进入「轻量应用服务器」控制台 → 找到你的香港服务器。
2. 点实例卡片上的 **「远程连接」** 按钮（有的界面叫「Workbench 远程连接」或「终端」）。
3. 弹出一个黑色的网页终端，输入用户名 `root` 和你的密码，回车。
4. 看到类似 `root@xxxx:~#` 的提示符，就说明连上了。

> 网页终端有个小麻烦：**粘贴命令**要用它工具栏的"粘贴"按钮，或右键粘贴，不能直接 Ctrl+V。

### 方式二：用 PuTTY（Windows 桌面工具，长期用更顺手）

1. 下载 PuTTY：搜索"PuTTY 官网下载"，装 `putty.exe`。
2. 打开 PuTTY，在 **Host Name** 框里填你的**服务器公网 IP**，端口 `22`，点 **Open**。
3. 第一次连接弹出安全提示，点「接受」。
4. 提示 `login as:` 输入 `root`，回车；提示密码时输入你的密码（**注意：输密码时屏幕不显示任何字符，是正常的，输完直接回车**）。
5. 看到 `root@xxxx:~#` 即连上。

> PuTTY 里**粘贴命令**：复制好命令后，在 PuTTY 窗口里**点一下鼠标右键**就是粘贴。

**连上后，先执行一句，确认系统正常：**

```bash
cat /etc/os-release | grep PRETTY
```

看到 `Ubuntu 22.04` 字样就对了。

---

## 第 2 步：放行防火墙端口（最容易漏，务必做）

这一步在**阿里云控制台网页上操作**，不是在命令行里。**不做的话，第 9 步 HTTPS 会失败、网页也打不开**，是最常见的卡点。

1. 阿里云 → 轻量应用服务器控制台 → 点你的服务器 → 左侧或标签页找到 **「防火墙」**。
2. 确认（没有就「添加规则」）放行以下端口：

   | 应用类型 | 协议 | 端口 | 说明 |
   |---|---|---|---|
   | SSH | TCP | 22 | 远程连接用（一般默认已开） |
   | HTTP | TCP | 80 | 网站 + 证书验证必须 |
   | HTTPS | TCP | 443 | 网站 HTTPS 必须 |

3. 添加后**立即生效**，无需重启。

> 记住：**80 和 443 两个端口必须放行**，Caddy 申请 HTTPS 证书要走 80 端口验证，业主访问走 443。少开一个都会出问题。

---

## 第 3 步：安装基础环境（Node.js + 工具）

回到你连接服务器的终端，**逐条**复制粘贴执行（一次一条，等它跑完再下一条）。

**3.1 更新系统软件源：**

```bash
sudo apt update && sudo apt upgrade -y
```

（可能跑一两分钟，中间若弹出紫色的服务重启询问界面，按回车用默认选项即可。）

**3.2 安装 Node.js 20（LTS 长期支持版）：**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**3.3 安装解压工具和 pm2（进程守护，后面用）：**

```bash
sudo apt install -y unzip
sudo npm install -g pm2
```

**3.4 验证安装成功：**

```bash
node -v && npm -v && pm2 -v
```

应分别显示 Node 版本（v20.x.x）、npm 版本、pm2 版本。都有版本号就成功了。

---

## 第 4 步：加一道内存保险（Swap）

你的服务器 1G 内存，跑起来够用，但为杜绝极端情况下内存打满，加一个 2G 的 swap 兜底。**只需做一次。**

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

验证：

```bash
free -h
```

看到 **Swap** 那一行显示 `2.0Gi` 就成功了。以后内存再紧张也有兜底，不用管它。

---

## 第 5 步：上传 yezhu-web 程序到服务器

把你电脑上的 `yezhu-web.zip` 传到服务器。两种方式，**方式一最简单，推荐**。

### 方式一：直接在服务器上从阿里云 OSS/网盘下载（若你已把 zip 传到网盘）

如果 zip 还在你电脑本地，用**方式二**。

### 方式二：用 WinSCP 图形化上传（Windows 推荐）

1. 下载 WinSCP：搜"WinSCP 官网下载"，装好打开。
2. 新建站点：
   - 文件协议：**SFTP**
   - 主机名：你的**服务器公网 IP**
   - 端口号：`22`
   - 用户名：`root`，密码：你的密码
   - 点「登录」。
3. 左边是你电脑、右边是服务器。右边窗口先进入 `/root/` 目录（默认就在），把左边的 `yezhu-web.zip` **拖到右边**，等待上传完成。

### 方式三：Mac / 命令行用户，用 scp 一条命令上传

在你**自己电脑**的终端（不是服务器）里执行，把路径换成你本地 zip 的实际路径：

```bash
scp /本地路径/yezhu-web.zip root@你的服务器IP:/root/
```

输入密码后自动上传。

**上传完成后，回到服务器终端，确认文件在：**

```bash
ls -lh /root/yezhu-web.zip
```

能看到文件和大小（约 80K）就对了。

---

## 第 6 步：解压、安装依赖、配置、首次启动测试

**6.1 解压程序：**

```bash
cd /root
unzip yezhu-web.zip
```

解压后会得到 `/root/yezhu-web/` 目录。进入后端目录：

```bash
cd /root/yezhu-web/server
ls
```

应能看到 `server.js`、`package.json` 等文件。

**6.2 安装依赖：**

```bash
npm install --omit=dev
```

（跑几十秒，把 express 等依赖装好。出现 `added xx packages` 即成功；有黄色 warning 可忽略。）

**6.3 创建启动配置文件（设置端口和发起人口令）——重要**

> 说明：本程序直接读取"环境变量"来获取端口和后台口令。在 Linux 上，最省事可靠的做法是用一个 pm2 配置文件（叫 ecosystem 文件）把这些变量写好，pm2 启动时自动注入。**注意：不要用 `.env` 文件——本程序没有内置读取 `.env` 的功能，写了也不生效。**

在 server 目录下创建配置文件：

```bash
cd /root/yezhu-web/server
nano ecosystem.config.js
```

打开编辑器后，粘贴下面全部内容（**把 `你的强口令` 换成你自己定的密码**，别人猜不到、你记得住）：

```javascript
module.exports = {
  apps: [{
    name: 'yezhu',
    script: 'server.js',
    cwd: '/root/yezhu-web/server',
    env: {
      PORT: 3999,
      SERVE_WEB: '1',
      ADMIN_PASSCODE: '你的强口令'
    }
  }]
}
```

- `ADMIN_PASSCODE`：发起人后台登录口令（也是小程序后台口令）。
- `SERVE_WEB: '1'`：让 Node 同时提供前端页面（一个端口搞定，无需额外 Web 服务器）。
- `PORT: 3999`：程序监听的内部端口（Caddy 会把外部 443 转发到这里）。

粘贴完，按 **Ctrl + O** 再按**回车**保存，然后 **Ctrl + X** 退出。

> 这个 `ecosystem.config.js` 文件在你更新程序时**不会被覆盖**（它不在程序 zip 里），口令一次配好长期有效。

**6.4 首次启动测试（先手动跑一下，确认程序能起来）：**

先用一条命令快速验证程序能正常启动。**注意：这条测试命令故意不带口令**（口令留到下一步由 pm2 正式设置，避免测试时把口令写死）：

```bash
PORT=3999 SERVE_WEB=1 node server.js
```

如果看到类似 `服务已启动` / `listening on 3999` 的提示、没有红色报错，就说明程序正常。

确认没问题后，按 **Ctrl + C** 停掉这个手动测试。下一步交给 pm2，它会用你在 6.3 里设置的真实口令首次初始化后台密码。

> 为什么测试不带口令：本程序在**第一次拿到口令时**会把它记进数据库，之后就固定了。所以要确保"第一次带口令启动"是由 pm2 用你的真实口令来做（第 7 步），而不是用测试口令。这条测试命令不带口令，就不会占用你的密码。

---

## 第 7 步：用 pm2 让程序常驻后台、开机自启

手动 `node server.js` 一关窗口就停了。用 pm2 让它**在后台长期运行、崩溃自动重启、服务器重启后自动拉起**。

**7.1 用 pm2 启动程序（读取你在 6.3 配好的口令和端口）：**

```bash
cd /root/yezhu-web/server
pm2 start ecosystem.config.js
```

看到 yezhu 状态为 `online` 就成功了。（pm2 会自动把 6.3 里设置的 `ADMIN_PASSCODE`、`PORT` 等注入程序。）

**7.2 设置开机自启：**

```bash
pm2 startup
```

它会输出一行以 `sudo env PATH=...` 开头的命令，**把那一整行复制下来再粘贴执行一次**（这是 pm2 要求的授权步骤）。然后保存当前进程列表：

```bash
pm2 save
```

**7.3 常用 pm2 命令（记一下，日常会用）：**

```bash
pm2 status          # 查看运行状态
pm2 logs yezhu      # 查看实时日志（Ctrl+C 退出查看）
pm2 restart yezhu   # 重启程序（更新代码后用）
pm2 stop yezhu      # 停止程序
```

现在程序已经在后台稳定运行了。接下来配域名和 HTTPS。

> **没有域名的话**：到这里网页版其实已经能用了，先看**附录 A** 用 IP 临时访问，等域名到手再回来做第 8、9 步。

---

## 第 8 步：域名解析（把域名指向服务器）

让 `kxtxmt.com` 指向你的服务器 IP。**在你域名的解析后台操作**（阿里云域名、Cloudflare、Namecheap 等，界面大同小异）。

1. 登录域名解析后台，找到 `kxtxmt.com` 的 **DNS 解析 / 记录管理**。
2. 添加两条 **A 记录**：

   | 记录类型 | 主机记录 | 记录值 | 说明 |
   |---|---|---|---|
   | A | `@` | 你的服务器公网 IP | 让 `kxtxmt.com` 生效 |
   | A | `www` | 你的服务器公网 IP | 让 `www.kxtxmt.com` 也生效 |

3. 保存。解析一般几分钟内生效，最长等 10–30 分钟。

**验证解析是否生效**（在服务器终端执行）：

```bash
ping -c 2 kxtxmt.com
```

如果显示的 IP 是你的服务器 IP，就说明解析成功了。**解析没生效前，不要做第 9 步**（证书会申请失败）。

> 如果你用 **Cloudflare** 管理 DNS：先把那朵"橙色云朵"（代理）**临时设为灰色（DNS only）**，等 Caddy 把证书签好、网站能访问后，再决定是否开回橙色 CDN。一上来就开橙云，Caddy 的证书验证可能失败。

---

## 第 9 步：安装 Caddy，一键开启 HTTPS

Caddy 是一个 Web 服务器，最大的好处是**自动申请和续期 Let's Encrypt 免费证书**，你几乎不用管证书。

**9.1 安装 Caddy：**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

（这几条是 Caddy 官方安装源，逐条粘贴执行即可。）

**9.2 配置 Caddy 反向代理到你的程序：**

编辑 Caddy 配置文件：

```bash
sudo nano /etc/caddy/Caddyfile
```

把里面**原有内容全部删掉**（在 nano 里可按住 Ctrl+K 逐行删，或全选删除），换成下面这几行（**把 `kxtxmt.com` 换成你的真实域名**）：

```
kxtxmt.com, www.kxtxmt.com {
    reverse_proxy localhost:3999
}
```

意思是：把访问 `kxtxmt.com` 的请求，转发给本机 3999 端口上运行的 yezhu-web。

按 **Ctrl + O** 回车保存，**Ctrl + X** 退出。

**9.3 重启 Caddy 让配置生效：**

```bash
sudo systemctl restart caddy
```

Caddy 启动时会**自动去申请 HTTPS 证书**（需要几秒到一分钟，要求第 8 步解析已生效、第 2 步 80/443 已放行）。

**查看 Caddy 是否正常：**

```bash
sudo systemctl status caddy
```

看到绿色的 `active (running)` 就对了（按 `q` 退出查看）。如果报错，看**附录 B**。

---

## 第 10 步：验证上线 🎉

用手机（用流量，别用可能有缓存的 WiFi）或电脑浏览器访问：

```
https://kxtxmt.com
```

应该能看到：
- 地址栏是 **https**、有把小锁（证书已生效）；
- 页面正常显示"成立业委会进展"等内容。

再验证后台：进入网页 →「我的」或对应入口 → 用你在第 6.3 步设的 `ADMIN_PASSCODE` 登录发起人后台 → 能进「小区参数」把小区名称、总户数、栋座房选项等配置好。

**到这里，网页版就正式上线了。** 把 `https://kxtxmt.com` 生成二维码，就能贴到电梯海报、发到业主群了。

---

## 第 11 步：日常维护

### 更新程序（我给你新版 zip 时）

假设新版是 `yezhu-web.zip`，用 WinSCP 传到 `/root/` 覆盖，然后：

```bash
cd /root
# 先备份数据（重要！）
cp -r /root/yezhu-web/server/data /root/data-backup-$(date +%Y%m%d)
cp -r /root/yezhu-web/server/uploads /root/uploads-backup-$(date +%Y%m%d)

# 解压新版覆盖代码
unzip -o yezhu-web.zip

# 装可能的新依赖并重启
cd /root/yezhu-web/server
npm install --omit=dev
pm2 restart yezhu
```

> 为什么数据不会丢：业主登记（`server/data/`）、证件图片（`server/uploads/`）、以及你的启动配置（`ecosystem.config.js`）**都不在程序 zip 包里**，所以 `unzip -o` 覆盖代码时根本碰不到它们，登记数据、图片和口令全部原样保留，放心更新。

### 查看运行状态和日志

```bash
pm2 status          # 程序是否在跑
pm2 logs yezhu      # 实时日志，排查问题用（Ctrl+C 退出）
free -h             # 看内存
df -h               # 看磁盘
```

### 数据备份（建议每隔一段时间做一次）

业主的登记数据全在 `server/data/db.json`，证件图片在 `server/uploads/`。定期把这两样下载到你电脑备份：

- 用 WinSCP 连上服务器，把 `/root/yezhu-web/server/data/` 和 `/root/yezhu-web/server/uploads/` 两个文件夹整个拖到本地保存即可。

### 证书续期

**不用管**。Caddy 会在证书到期前自动续期。你什么都不用做。

---

## 附录 A：没有域名时，先用 IP 临时访问

如果域名还没到手，想先让程序跑起来自测：

1. 确保第 7 步 pm2 已启动程序。
2. 在第 2 步防火墙里**临时放行 3999 端口**（TCP）。
3. 浏览器访问 `http://你的服务器IP:3999` 即可看到网页。

> 局限：这是 **http 明文**、且带端口号，**不能用于微信分享（会被拦截）、也不安全**。仅供你自己临时验证程序是否正常。**正式对业主发布前，一定要买域名 + 做第 8、9 步的 HTTPS。** 域名到手后，把临时放行的 3999 端口关掉。

---

## 附录 B：常见问题排查

**Q1：`https://域名` 打不开 / 证书申请失败**

按顺序检查：
1. 第 2 步防火墙里 **80 和 443 是否都放行了**（最常见原因）。
2. 第 8 步域名解析是否生效：`ping -c 2 你的域名`，返回的 IP 是不是你的服务器 IP。
3. 如果用 Cloudflare，橙色云朵是否**临时改成了灰色**。
4. 看 Caddy 日志找原因：`sudo journalctl -u caddy --no-pager | tail -30`
5. 改完配置记得 `sudo systemctl restart caddy`。

**Q2：网页能开但显示"本地预览模式"或数据不对**

这是前端没连上后端。确认第 6.3 步 `ecosystem.config.js` 里有 `SERVE_WEB: '1'`，然后 `pm2 restart yezhu` 重启。

**Q3：`pm2 status` 里 yezhu 是 `errored` 或一直重启**

看日志：`pm2 logs yezhu --lines 50`，把报错发我。常见是 `ecosystem.config.js` 里格式写错（比如引号写成了中文引号）、或依赖没装全（重跑 `npm install --omit=dev`）。

**Q4：忘了发起人口令 / 想改口令**

本程序的口令在**第一次设置后会记进数据库**，之后单纯改 `ecosystem.config.js` 不会生效——必须先清除数据库里的旧口令记录，再让它用新口令重新初始化。三步：

```bash
# 1) 改 ecosystem.config.js 里的 ADMIN_PASSCODE 为新口令
nano /root/yezhu-web/server/ecosystem.config.js
# （改好 ADMIN_PASSCODE 的值，保存退出）

# 2) 清除数据库里记录的旧口令（这条命令只删口令，不动业主数据）
node -e "const f='/root/yezhu-web/server/data/db.json';const fs=require('fs');const d=JSON.parse(fs.readFileSync(f));delete d.adminHash;fs.writeFileSync(f,JSON.stringify(d,null,2));console.log('旧口令已清除');"

# 3) 重启，程序会用新口令重新初始化
pm2 restart yezhu --update-env
```

完成后用新口令登录即可。业主的登记数据、证件、反馈都不受影响。

**Q5：更新程序后业主数据没了**

只要你按第 11 步的更新命令（带 `-x` 排除 data/uploads），数据不会丢。若手滑覆盖了，用第 11 步开头备份的 `data-backup-日期` 文件夹恢复：把它复制回 `server/data`。

**Q6：想同时上微信小程序**

香港服务器免备案，但**微信小程序要求合法域名必须已备案**——所以香港方案下小程序用不了，只能用网页版（H5）。业主群里发网页链接、点开填表，完全够用。如果一定要小程序，需要把服务器换到国内 + 域名备案。

---

## 一页速查（老手直接照这个）

```bash
# 1. 环境
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs unzip
sudo npm install -g pm2

# 2. Swap
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. 程序（zip 已传到 /root）
cd /root && unzip yezhu-web.zip && cd yezhu-web/server && npm install --omit=dev
cat > ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'yezhu',
    script: 'server.js',
    cwd: '/root/yezhu-web/server',
    env: { PORT: 3999, SERVE_WEB: '1', ADMIN_PASSCODE: '你的口令' }
  }]
}
EOF
# ↑ 记得把 你的口令 改掉
pm2 start ecosystem.config.js && pm2 startup && pm2 save

# 4. Caddy（域名解析已生效后）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
echo 'kxtxmt.com, www.kxtxmt.com {
    reverse_proxy localhost:3999
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

**别忘了：阿里云控制台放行 80 / 443 / 22 端口。**
