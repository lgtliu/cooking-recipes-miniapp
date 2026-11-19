---
name: xiaoduli-miniapp
description: 维护「小杜里」微信小程序（cooking-recipes-miniapp）的开发指南，覆盖原生小程序 + 微信云开发的分层约定、云函数契约、菜谱数据模型、改动流程、部署与真机调试。当用户提到小杜里、cooking-miniapp、cooking-recipes-miniapp、家常菜谱小程序，或要求在微信小程序里新增/修改页面、组件、云函数、数据字段、分类、图片上传、家人分享、订阅消息，排查「这道菜找不到了」「真机闪错误页」类问题时使用；也适用于在该仓库里做任何代码改动、评审或部署。
---

# 小杜里小程序维护指南

「小杜里」：记录家常菜谱的微信小程序，原生写法 + 微信云开发（云函数 + 云数据库 + 云存储）。

## 定位仓库

首选路径 `C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\cooking-miniapp`。该目录在 `temp_` 下，可能被清理；路径不存在时不要新建空项目，改为从 `https://github.com/lgtliu/cooking-recipes-miniapp` 拉取，或向用户确认新路径。

进入仓库后先确认三件事再动手：`git status`（是否有未提交改动）、`config/cloud.js` 的 `CLOUD_ENV`（当前 `cloud1-d5ga1hj0qb4d21f6a`）、`project.config.json` 的 `appid`（`wx3a7261008c6ae2e0`）。

## 不可违背的架构约定

1. **单向数据流**：页面/组件 → `utils/store.js` → `services/*` → `services/request.js` → `utils/cloud.js` → `wx.cloud`。页面里出现 `wx.cloud.` 或自己拼 `action` 参数就是错的，改回数据层。
2. **只有云端模式**。`store.getMode()` 恒返回 `'cloud'`，本地降级逻辑已被移除，不要在页面里重新引入 `shouldDegrade` / 本地兜底分支；`utils/store.local.js` 仅作为「本机菜谱一键迁移」的数据源。
3. **云函数返回契约**：成功 `{ ok: true, data }`，业务失败 `{ ok: false, code, message }`。`request.callAction` 会把 `ok:false` 转成带 `code` 的异常抛出，页面只做展示，不自己解析 `errMsg`。
4. **身份只认服务端**：云函数一律用 `cloud.getWXContext().OPENID`，绝不信任前端传入的 `author` / `authorOpenid` / 成员 openid 作为身份依据；前端传的成员 openid 只当作「发给谁」的目标。
5. **字段命名统一 camelCase**（`categoryId`、`createdAt`、`authorNickname`、`authorOpenid`、`images`、`steps`、`ingredients`），云数据库文档与客户端一致；只有 `categories` 集合的 `sort_order` 例外（`utils/categories.js` 同时兼容 `sort_order` / `sortOrder`）。
6. **上限值与常量集中在 `config/constants.js`**，云函数里有同名校验常量。改任何一个限制必须同时改：`config/constants.js`、对应云函数的常量/校验、`utils/normalize.js`。
7. **分类 id 只存英文 key**（`home`/`meat`/`seafood`/`veggie`/`soup`/`staple`/`dessert`/`other`），不存中文名；空 `categoryId` 合法，展示为「未分类」。新增或改名要同时改 `utils/categories.js` 兜底字典与云函数白名单 `FALLBACK_CATEGORY_IDS`。
8. **视觉只用 `app.wxss` 的 CSS 变量**（`--bg` `--surface` `--ink` `--accent` `--r-md` `--shadow-1` `--dur-base` 等），不硬编码色值；尺寸用 `rpx`。暖米底 + 单一陶土橙，层级靠留白与描边，不堆渐变。

## 改动流程

1. 先读对应层再改：页面读 `pages/<name>/`，数据行为读 `services/<domain>.js`，接口与权限读 `cloudfunctions/<fn>/index.js`。不要跨层打补丁。
2. 数据类改动通常四处一起改：云函数校验与落库、`utils/normalize.js` 归一化、`pages/create` 表单、展示页（`pages/detail` 或 `pages/index`）。
3. 改完跑静态检查 `scripts/check-project.ps1`，至少保证 `node --check` 通过、`app.json` 页面四件套齐全。
4. 云函数改完必须重新部署（云端安装依赖）；只改前端不需要部署。
5. 交付前自查真机路径：冷启动进详情页、网络慢时的加载态、未登录访问受限功能、转发卡片打开。

按场景的具体步骤见 `references/workflows.md`：加字段、加页面、加云函数动作、加组件、加分类、接订阅消息、部署与真机调试。

## 已知坑（当前代码已修复，改动时别退回去）

- **详情页「这道菜找不到了」闪现**：`pages/detail/detail.wxml` 的找不到分支必须是 `wx:elif="{{!loading}}"`，且 `data.loading` 初始为 `true`。用 `wx:else` 会在真机 0.5~2s 云函数冷启动窗口期先渲染错误页。
- **分享图不能用 `cloud://`**：`onShareAppMessage` 的 `imageUrl` 只接受 https 或本地持久路径，云存储图片必须经 `store.getShareImageUrl()` 换临时链接（`pages/detail/detail.js` 的 `prepareShareImage`）。
- **列表页不要手写分页**：`behaviors/list-behavior.js` 已封装首屏/刷新/上拉/错误态与请求令牌；页面只实现 `fetchPage({ offset, limit, reset })` 与可选的 `mapItems` / `onListReset` / `onListAppend`，用 `utils/page.js` 的 `composePage(mixin, options)` 合并（微信 Page 不支持 Behavior）。
- **`seed/`、`seed-images/`、`seed-images-c/` 已在 `packOptions.ignore` 里**，不进小程序包；别删这段配置，也别把新素材目录塞进包内。
- **`tcb` CLI 在本机被安全策略拦截**：数据库读写走 cloudbase MCP 工具或云开发控制台，不要用脚本调 tcb。
- 仓库是公开仓库：不要把真实密钥、token 写进代码；环境 id 与 appid 已是公开信息，无需脱敏。

## 验证

静态检查（PowerShell，在仓库根目录跑）：

```powershell
pwsh -File "<skill-dir>\scripts\check-project.ps1" -ProjectRoot "C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\cooking-miniapp"
```

脚本做：`node --check` 全部 `.js`、解析全部 `.json`、校验 `app.json` 每个页面四件套齐全、检查页面里是否有越层的 `wx.cloud` 直调。

模拟器/真机联调：开发者工具 CLI 在 `E:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`（自动化端口 9420），自动化脚本在 `C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\wx-automator`（`miniprogram-automator`，含 `diagnose.js` / `scenarios.js` / `verify-loading.js`，用 `ws://127.0.0.1:9420` 连接）。工具没开时先 `cli.bat auto --project <仓库路径> --auto-port 9420`。

## 参考文档

- `references/architecture.md`：目录职责、页面清单、云函数 action 清单、集合字段、错误码与常量表。
- `references/data-model.md`：菜谱字段前后端契约、校验上限三处一致表、分类字典、订阅消息模板配置、图片与云存储。
- `references/workflows.md`：各场景改动配方与部署调试步骤。
