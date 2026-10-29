# dsh-copilot-accounts

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **GitHub Copilot 多账号管理**插件：保存、切换、导入、导出 Copilot 登录凭据，点一下换号，不用重新走浏览器授权。

[English](README.en.md)

## 它解决什么

DSH 内置的 `github-copilot` 路由只认识一份凭据（`llm-pi-ai/github-copilot` 记录 + `GITHUB_COPILOT_OAUTH_TOKEN`）。换号就得重新授权，旧号也没地方存。

这个插件把每个登录过的账号存成一张**可移植的账号卡片**（就是一个 JSON 文件），之后：

- **一键切换**：点「切换」，下一条消息就用新账号；
- **自动保存**：登录、刷新 token、外部改动凭据时，自动把当前账号存进账号文件，不需要你手动退出；
- **额度可见**：每个账号卡片显示 Copilot premium requests 剩余量（`已用/总量`、重置日期），可一键刷新；
- **导出**：可以导出全部账号，也可以单独导出某一个账号；
- **上传账号**：别人把已登录的 DSH Copilot 凭据发给你，粘贴或选文件即可用（实验性，见下）。

## 安装

**不依赖** `@lujianjun19/dsh-llm-github-copilot`。本插件自己完成 GitHub 设备流登录，只依赖 DSH 内置的 `llm-pi-ai` 路由（默认已挂载）。如果那个插件也装着，两者共存：它提供 `/copilot-login`，本插件负责多账号管理。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:HuiJiOnGit/dsh-copilot-accounts
```

（把 `web` 换成你实际使用的 profile，比如 `desktop`。）

### 从本地目录安装

```sh
dsh plugin --profile web add D:\path\to\dsh-copilot-accounts
```

安装后重启 `dsh web`（或桌面端），打开 **设置 → Copilot 账号**。

## 使用

设置页从上到下就是三个区域，**没有弹窗**，所有按钮和结果都在同一页：

| 区域 | 内容 |
|---|---|
| 当前使用 / 已保存的账号 | 当前账号卡片和额度；右上角「保存当前账号」「刷新额度」「导出全部」；每个账号都有「导出」，非当前账号另有「切换」「删除」 |
| 添加 / 分享登录 | 「生成授权链接」；生成后在同一区域显示设备代码、可复制的邀请文本、复制按钮和等待状态 |
| 上传账号 | 粘贴框 +「导入」「选择文件」，以及一段可展开的来源说明（**未经过实际测试**，优先用分享链接） |

账号列表里每个非当前账号都有「切换」「删除」。切换只改 DSH 的凭据，不会影响 GitHub 网页登录状态，也不会影响别人。

### 分享登录链接（推荐给别人用）

1. 在 **添加 / 分享登录** 区域点 **生成授权链接**；
2. 点 **复制邀请**，把链接和代码发给对方（也可以只复制链接）；
3. 对方在自己浏览器打开 `https://github.com/login/device`，输入代码并授权；
4. 你这边自动完成：账号加入列表并切换。**不要求对方装任何东西，也不用你退出自己的 GitHub 账号。**

「复制链接」给的是带 `?user_code=` 的直达链接，方便对方少输一次。离开设置页不会中断等待；想放弃就在同一区域点「取消这次登录」。等待期间这个区域会一直显示代码和状态。

### 斜杠命令（无图形界面时）

```
/copilot-accounts        列出已保存账号
/copilot-use <登录名|序号> 切换账号
/copilot-save            保存当前账号
```

## 上传账号：可以上传/粘贴的三样东西

> ⚠️ **未经过实际测试**。这条路径目前只在测试里验证过格式，没有在真实账号之间跑过完整流程。优先用上面的「分享登录链接」——让对方授权一次最可靠。上传失败时，让对方重新发一个分享链接即可。

| 来源 | 具体是什么 | 在哪里 |
|---|---|---|
| 本插件导出的账号卡片 | `copilot-accounts-2026-10-29.json`（或单个账号的 `copilot-account-<login>-日期.json`） | 对方点「导出全部」/ 账号卡片上的「导出」下载得到；你「选择文件」选中，或把内容粘进输入框 |
| DSH 凭据文件（对方没装插件） | 下面那段 YAML 片段，或整份 `.credentials.yaml` | Windows：`C:\Users\<用户名>\.dsh\.credentials.yaml`；macOS/Linux：`~/.dsh/.credentials.yaml`（装了多个 profile 也一样，凭据是全局一份） |
| 一个长效 token | `ghu_…`（或 `gho_`、`github_pat_`） | 对方凭据文件里 `refs.GITHUB_COPILOT_OAUTH_TOKEN` 的值；也可由对方从别处复制 |

从凭据文件里要复制的是这两段（整份文件直接粘贴也行）：

```yaml
refs:
  GITHUB_COPILOT_OAUTH_TOKEN: ghu_xxx

records:
  llm-pi-ai/github-copilot:
    kind: grant
    payload:
      type: oauth
      refresh: ghu_xxx
```

插件只提取 `ghu_` / `gho_` / `github_pat_` 开头的 token，不会碰文件里其他 provider 的密钥（`DEEPSEEK_API_KEY`、`STEP_API_KEY` 等）。

> 不需要复制 `access` / `expires` / `availableModelIds`：切换后 DSH 会用 `refresh` 自动换出短期 token 并重建模型列表。

### 账号存在哪个目录

不用手动放。导入后账号存在：

```
%USERPROFILE%\.dsh\copilot-accounts.json      # Windows
~/.dsh/copilot-accounts.json                  # macOS / Linux
```

（`DSH_HOME` 被改过时跟随 `DSH_HOME`。）这个文件只有你当前系统用户可读。设置页底部会显示本机的这两个路径。

## 切号后会发生什么

插件写两条凭据：

```yaml
refs.GITHUB_COPILOT_OAUTH_TOKEN      = 目标账号的长效 token
records["llm-pi-ai/github-copilot"]  = { type: oauth, refresh: 目标 token, access: "", expires: 0 }
```

`access` 置空、`expires` 置 0，DSH 的 Copilot 路由在下一次请求时就会用 `refresh` 重新换取短期 token，并刷新该账号的可用模型列表。**不需要重启 DSH。**

## 账号额度（premium requests）

账号卡片会显示 Copilot premium requests 的剩余量，例如 `剩余 9751.6 / 10000 · 已用 248 · 2026-11-01 重置`。右上角「刷新额度」强制重新查询；切换账号或登录新账号后，该账号的缓存会被清掉并立即重查，其余时候结果缓存 10 分钟。

数据来自 GitHub 编辑器客户端使用的同一个接口：

```
GET https://api.github.com/copilot_internal/user
Authorization: Bearer <账号的长效 token>
Copilot-Integration-Id: vscode-chat
```

返回里的 `quota_snapshots.premium_interactions` 提供 `remaining` / `entitlement` / `percent_remaining` / `credits_used`，`quota_reset_date` 是重置日期，`copilot_plan` 是套餐。这是**非公开接口**，GitHub 可能随时调整或限制；插件对失败是容错的，只会显示「额度不可用」，不影响切换和登录。

## 安全与限制

- 账号文件是**明文 token**，和 DSH 自己的 `.credentials.yaml` 同级；不要提交到 git，不要放公共网盘。
- `ghp_` 经典 PAT 会被 Copilot API 拒绝，插件直接拒绝导入。
- 首次添加一个新账号仍然需要一次浏览器授权（设备流）；之后换号都是一键。
- 登录凭据的有效性取决于 GitHub：token 被吊销后需要重新授权。
- 设置 → 模型 里手写的 `github-copilot` 模型清单（`cordis.patch.yml`）不随账号变化；切到没有这些模型的账号时，请自行调整该清单。
- 记录格式属于 `@deepseek-ai/dsh-llm-pi-ai` 的内部约定，DSH 大版本升级后若格式变化，插件会报错而不是写坏凭据。

## 工作原理

- Host 插件监听 `credentials/record-updated` 与 `credentials/reference-updated`，防抖后把当前 grant 快照进账号文件（按 `sha256(refresh)` 去重）。
- 切换通过 `credentials.modifyRecord()` + `credentials.set()` 完成，写入是原子的、跨进程加锁的；路由下一次解析凭据时自动刷新。
- 设备流使用 VS Code 的公开 OAuth client（`Iv1.b507a08c87ecfe98`，scope `read:user`），产出可与 Copilot API 交换的 `ghu_` token。
- 账号文件写入使用临时文件 + rename，权限 `0600`。

## 开发

无需构建步骤，源码即产物。

```
index.js             Host 插件（凭据、vault、设备流、HTTP 路由、斜杠命令）
client.js            Client 模块（设置页）
cordis.patch.yml     Loader patch，插入一行 copilot-accounts
locale/*.json        插件管理器显示的名称/描述
```

本地调试：把目录 `dsh plugin --profile <profile> add <目录>` 安装后重启 DSH。

## License

MIT
