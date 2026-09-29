# DecoTV Cloudflare 部署指南

## 先说明部署形态

DecoTV 不是纯静态 Next.js 应用，包含动态页面、API Route Handler、鉴权中间件、视频代理和服务端存储。因此不能使用 Cloudflare Pages 的纯静态模式；静态导出会丢失登录、API 和代理功能。

本项目现在同时支持 Cloudflare Workers 和 Cloudflare Pages Advanced Mode。Pages 版本通过 `_worker.js` 接管请求，静态资源仍由 Pages 托管；不要在 Pages 控制台选择“仅上传静态文件”的模式。

## 准备工作

- Node.js 20 或更高版本
- pnpm 10
- 一个 Cloudflare 账号，并在本机执行 `wrangler login`
- 一个 Cloudflare KV namespace（生产环境绑定名必须为 `DECOTV_KV`）

Cloudflare 的构建环境是 Linux。OpenNext 在 Windows 上可能遇到符号链接权限问题，建议在 WSL、CI 或 Cloudflare 构建环境中执行构建。

## 本地构建与预览

```bash
pnpm install
pnpm cf:pages:build
pnpm cf:pages:preview
```

`cf:pages:build` 会先生成站点清单和版本元数据，再运行 Next.js 和 OpenNext 构建，并准备 Pages Advanced Mode 输出。构建结果位于 `.open-next/`，该目录已加入 `.gitignore`。

## 通过 Cloudflare 控制台部署 Pages（推荐）

这是不需要在本地登录 Wrangler 的网页部署方式。每次推送到 GitHub 的 `main` 分支后，Pages 都会自动重新构建。

### 1. 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages**。
2. 点击 **Create application** → **Pages** → **Connect to Git**。
3. 选择 **GitHub**，授权 Cloudflare 访问 GitHub（只选择仓库时，建议只授权 `TV`）。
4. 选择新建的 `TV` 仓库和 `main` 分支，点击 **Begin setup**。
5. 在构建设置中填写：

   | 设置项                 | 值                                                              |
   | ---------------------- | --------------------------------------------------------------- |
   | Project name           | `tv`（也可以使用你自己的 Pages 项目名，后续命令中的名称要一致） |
   | Production branch      | `main`                                                          |
   | Framework preset       | `None` 或 `Next.js` 均可，必须手动覆盖下面两项                  |
   | Build command          | `pnpm cf:pages:build`                                           |
   | Build output directory | `.open-next/pages`                                              |
   | Root directory         | `/`                                                             |

6. 在 **Environment variables (advanced)** 中先添加：

   | 变量                       | 值        | 作用域              |
   | -------------------------- | --------- | ------------------- |
   | `NODE_VERSION`             | `20`      | Production、Preview |
   | `PNPM_VERSION`             | `10.14.0` | Production、Preview |
   | `NEXT_PUBLIC_STORAGE_TYPE` | `kv`      | Production、Preview |

   `NEXT_PUBLIC_STORAGE_TYPE` 会在构建阶段被 Next.js 内联，不能只在部署后才添加。`kv` 模式要求下一步配置 `DECOTV_KV` 绑定。

7. 点击 **Save and Deploy**。构建日志中应能看到 `Cloudflare Pages output prepared at .open-next/pages`，并且输出目录中存在 `_worker.js`。这表示已使用 Pages Advanced Mode；不要改成纯静态导出或把输出目录改为 `out`。

### 2. 配置 KV 绑定、运行时变量和 Secrets

进入 **Workers & Pages → tv → Settings → Functions → Bindings**，分别在 Production 和 Preview 环境添加 KV namespace：

| Variable name | Binding type | Namespace |
| ------------- | ------------ | --------- |
| `DECOTV_KV`   | KV namespace  | 选择要保存 DecoTV 数据的 namespace |

代码会将站点配置、用户、收藏、播放记录、搜索历史和跳过片段配置保存到这个 namespace。绑定名必须完全匹配 `DECOTV_KV`，否则 API 会返回明确的配置错误。

部署完成后进入 **Workers & Pages → tv → Settings → Variables and Secrets**，在 Production 和 Preview 环境分别添加应用配置。密码、令牌等敏感值请选择 **Encrypt**：

```text
USERNAME                 管理员用户名（可选）
PASSWORD                 管理员密码（建议设置）
AUTH_SECRET              随机长字符串，用于签名 Cookie
UPSTASH_URL              Upstash Redis REST URL
UPSTASH_TOKEN            Upstash Redis REST Token
TMDB_API_KEY             可选，TMDB 元数据
DANDANPLAY_APP_ID        可选，弹幕服务
DANDANPLAY_APP_SECRET    可选，弹幕服务
```

保存变量后，在 **Deployments** 页面点击 **Retry deployment**，或向 `main` 分支推送一个新的提交，让变量在新的构建中生效。修改任何 `NEXT_PUBLIC_*` 变量都必须重新构建。

### 3. 配置域名和首次使用

在 Pages 项目的 **Custom domains** 中添加域名并按提示完成 DNS。首次打开站点后访问 `/admin`，配置影视源、直播源和其他站点设置；项目不会内置可直接播放的源。

如果登录页面一直跳转或 API 返回 `401`，优先检查 `PASSWORD`、`AUTH_SECRET` 和 `NEXT_PUBLIC_STORAGE_TYPE` 是否同时配置在当前环境（Production/Preview），然后重新部署。

## 使用命令行部署 Cloudflare Pages

```bash
pnpm install
wrangler login
pnpm cf:pages:deploy
```

如果使用 Pages 的 Git 部署设置：

- Build command：`pnpm cf:pages:build`
- Build output directory：`.open-next/pages`

`cf:pages:build` 会先运行 OpenNext，再通过 Wrangler 将运行时模块打包为 `.open-next/pages/_worker.js`，并复制静态资源。这样 Pages 上传目录不会包含 pnpm 的符号链接；`_worker.js` 是 Advanced Mode 所需的入口。

## 部署到 Cloudflare Workers

```bash
pnpm install
wrangler login
pnpm cf:build
pnpm cf:deploy
```

也可以在 Cloudflare Workers 的 Git 部署设置中使用：

- Build command：`pnpm cf:build`
- Deploy command：`pnpm exec wrangler deploy`
- Root directory：仓库根目录

仓库中的 `wrangler.worker.jsonc` 已指定 `.open-next/worker.js` 为 Worker 入口，并将 `.open-next/assets` 作为静态资源目录；默认的 `wrangler.jsonc` 是 Pages 项目配置。

## 环境变量和 Secrets

`NEXT_PUBLIC_STORAGE_TYPE` 会被 Next.js 在构建时读取，必须在 `pnpm cf:pages:build` 之前设置。Cloudflare 部署使用 KV：

```powershell
$env:NEXT_PUBLIC_STORAGE_TYPE = "kv"
pnpm cf:pages:build
```

在 WSL 或 Linux shell 中使用：

```bash
export NEXT_PUBLIC_STORAGE_TYPE=kv
pnpm cf:pages:build
```

在 Pages 项目的 Settings → Environment variables 中配置，或使用以下命令写入 Pages Secrets（不要提交到 Git）：

```bash
wrangler pages secret put USERNAME --project-name tv
wrangler pages secret put PASSWORD --project-name tv
wrangler pages secret put AUTH_SECRET --project-name tv
```

以 `NEXT_PUBLIC_` 开头的变量会在构建时内联；修改后必须重新执行 `pnpm cf:pages:build` 并部署。其他运行时配置可以放在 Pages Variables 中，例如 `PUBLIC_ALLOW_ADMIN`、`SITE_BASE`、`TMDB_API_KEY`、`DANDANPLAY_APP_ID` 和 `DANDANPLAY_APP_SECRET`。敏感值优先使用 `wrangler pages secret put`；如果部署 Workers，则对应使用 `wrangler secret put`。

完成部署后，访问 `/admin` 配置播放源、直播源和其他站点设置。项目默认不内置可播放资源。

## Cloudflare 平台限制

- FFmpeg 下载依赖 Node.js 的 `child_process`、本地文件系统和长时间运行的进程，Cloudflare Workers 不支持这些能力。浏览器分片下载可继续使用，FFmpeg 下载会返回不支持提示；需要 FFmpeg 时请使用 Docker/VPS 部署。
- Worker 本地文件系统不是持久化磁盘，私人影库的本地目录扫描和本地媒体文件存储不适合 Workers。请使用可通过网络访问的 OpenList、Emby 或 Jellyfin。
- 生产环境不要使用 `localstorage` 存储。Worker 实例之间不共享内存，用户数据和后台配置应使用 Cloudflare KV，并确保 `DECOTV_KV` 已绑定。
- Cloudflare Workers 有请求时长、CPU、响应体和外部请求限制。大型媒体转码、长时间扫描和大文件下载应放到专用服务器。

## 常用命令

```bash
pnpm cf:build      # 构建 Next.js + OpenNext Worker
pnpm cf:preview    # Wrangler 本地预览
pnpm cf:deploy     # 构建并部署到 Cloudflare Workers
pnpm cf:pages:build # 构建 Pages Advanced Mode 输出
pnpm cf:pages:preview
pnpm cf:pages:deploy
```
