# dsh-copilot-accounts

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **GitHub Copilot 多账号管理**插件：保存、切换、导入、导出 Copilot 登录凭据，点一下换号，不用重新走浏览器授权。

[English](README.en.md)

## 它解决什么

DSH 内置的 `github-copilot` 路由只认识一份凭据（`llm-pi-ai/github-copilot` 记录 + `GITHUB_COPILOT_OAUTH_TOKEN`）。换号就得重新授权，旧号也没地方存。

这个插件把每个登录过的账号存成一张**可移植的账号卡片**（就是一个 JSON 文件），之后：

- **一键切换**：点「切换」，下一条消息就用新账号；
- **自动保存**：登录、刷新 token、外部改动凭据时，自动把当前账号存进账号文件，不需要你手动退出；
- **上传账号**：别人把已登录的 DSH Copilot 凭据发给你，粘贴或选文件即可用；
- **导出全部**：换电脑时把账号文件拷过去，导入即用。

## 安装

要求 DSH 已经装好并带 `@lujianjun19/dsh-llm-github-copilot`（负责登录 UI / `/copilot-login`），本插件负责多账号管理。二者配合使用，互不冲突。

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

设置页有四个按钮：

| 按钮 | 作用 |
|---|---|
| **保存当前账号** | 把当前登录的账号存进账号文件（通常不需要点，登录后会自动存） |
| **添加账号** | 走 GitHub 设备流登录一个新号；**当前账号会先自动保存**，不会被退出 |
| **上传账号** | 粘贴 token / 账号卡片 / 凭据片段，或选择文件 |
| **导出全部** | 下载包含所有账号的 JSON，用于备份或换电脑 |

账号列表里每个非当前账号都有「切换」「删除」。切换只改 DSH 的凭据，不会影响 GitHub 网页登录状态，也不会影响别人。

斜杠命令（无图形界面时可用）：

```
/copilot-accounts        列出已保存账号
/copilot-use <登录名|序号> 切换账号
/copilot-save            保存当前账号
```

## 分享 / 搬运账号：到底复制什么

### 方式 A：用插件导出（推荐，最简单）

1. 在**已有登录的机器**上打开 设置 → Copilot 账号 → **导出全部**，得到一个 `copilot-accounts-*.json`；
2. 把这个文件发给对方（或拷到家里电脑）；
3. 对方打开 设置 → Copilot 账号 → **上传账号** → 选择文件 / 直接粘贴内容。

文件里是明文 token，传输时请注意渠道。

### 方式 B：只给 token

对方只需要一个长效 GitHub token（`ghu_` 开头，或 `gho_`、`github_pat_`）。把它粘贴到「上传账号」即可，插件会自动补全成凭据记录。

### 方式 C：手工从 DSH 凭据文件复制

如果对方不用这个插件，也可以手工复制 `~/.dsh/.credentials.yaml` 里的两段：

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

复制整段（或整个文件）粘贴到「上传账号」都能识别。插件只提取 `ghu_` / `gho_` / `github_pat_` 开头的 token，不会碰文件里其他 provider 的密钥。

> 不需要复制 `access` / `expires` / `availableModelIds`：切换后 DSH 会用 `refresh` 自动换出短期 token 并重建模型列表。

### 放在哪个目录

不用手动放。导入后账号存在：

```
%USERPROFILE%\.dsh\copilot-accounts.json      # Windows
~/.dsh/copilot-accounts.json                  # macOS / Linux
```

（`DSH_HOME` 被改过时跟随 `DSH_HOME`。）这个文件只有你当前系统用户可读。

## 切号后会发生什么

插件写两条凭据：

```yaml
refs.GITHUB_COPILOT_OAUTH_TOKEN      = 目标账号的长效 token
records["llm-pi-ai/github-copilot"]  = { type: oauth, refresh: 目标 token, access: "", expires: 0 }
```

`access` 置空、`expires` 置 0，DSH 的 Copilot 路由在下一次请求时就会用 `refresh` 重新换取短期 token，并刷新该账号的可用模型列表。**不需要重启 DSH。**

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
