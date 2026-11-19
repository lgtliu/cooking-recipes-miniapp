# 架构与契约

## 目录职责

| 路径 | 职责 | 改动注意 |
|---|---|---|
| `app.js` / `app.json` / `app.wxss` | 启动入口、页面注册、全局样式令牌 | 新页面必须登记到 `app.json.pages` |
| `config/cloud.js` | 云环境 id（唯一环境配置点） | 换环境只改这里 |
| `config/constants.js` | 请求超时/重试、分页、业务上限、通用文案 `COPY` | 上限要同步云函数与 `utils/normalize.js` |
| `config/notify.js` | 小程序端订阅消息模板 id 与摘要/文本构造 | 要与 `cloudfunctions/family/config.js` 同值 |
| `pages/*` | 页面：只做取数调用、渲染、交互 | 不直调 `wx.cloud`、不拼 action |
| `components/dish-card` | 瀑布流菜谱卡（`dish` 对象 + `height`） | 点击 `triggerEvent('opendish', { id })` |
| `components/state-view` | 加载/空/错误态统一展示 | 复用别新写一套 |
| `behaviors/list-behavior.js` | 列表公共行为：分页游标、请求令牌、下拉/上拉、错误态 | 页面实现 `fetchPage`、`mapItems`、`onListReset`、`onListAppend` |
| `utils/page.js` | `composePage(mixin, options)` 组合页面配置与生命周期 | 微信 Page 不支持 Behavior，用这里 |
| `utils/store.js` | 数据层门面，页面唯一数据入口 | 新能力先加在这里再暴露给页面 |
| `services/` | 领域服务（recipes / family / account / migrate）+ 请求层 `request.js` | 参数拼装、归一化、缓存脏标记都在这一层 |
| `utils/cloud.js` | `wx.cloud` 初始化、可配置/可用判断、`call` / `uploadFile` | 业务错误不算云端不可用 |
| `utils/normalize.js` | 菜谱字段归一化（补齐、清洗、分类名重算） | 新增字段必须在这里兜默认值 |
| `utils/categories.js` | 分类字典、id→名称/图标、过滤；纯函数无 wx 依赖 | 兜底字典 + 云函数白名单两处一致 |
| `utils/errors.js` | 错误码 `CODE`、`create` / `normalize` / `isRetryable` / `toUserMessage` | 页面只展示，不按字符串判断类型 |
| `utils/auth.js` | 登录引导（`openLogin` / `requireLogin` / `openCreate`） | 受限操作统一走这里 |
| `utils/image.js` / `utils/format.js` / `utils/logger.js` / `utils/session.js` | 图片压缩上传、展示格式化、日志、会话 | — |
| `cloudfunctions/` | `recipes` / `family` / `login`，各自独立 `package.json`（`wx-server-sdk`） | 改完要重新部署 |
| `seed/`、`seed-images/`、`seed-images-c/` | 种子菜谱 JSON、原图、压缩图 | 已在 `packOptions.ignore`，不进包 |

## 页面清单

| 页面 | 标题 | 职责 |
|---|---|---|
| `pages/index/index` | 小杜里 | 首页瀑布流（左右两列 + 稳定卡片高度 hash）、分类筛选、搜索防抖 260ms、首屏统计（总菜谱/总步骤） |
| `pages/detail/detail` | 菜谱详情 | 菜谱展示、编辑/删除（`canManage`）、转发卡片（`onShareAppMessage`）、加载/找不到/错误三态 |
| `pages/create/create` | 记录新菜 | 记录/编辑表单：名称、简介、分类、最多 9 张图、食材（≤30）、步骤（≤20） |
| `pages/login/login` | 登录 | 微信登录，`redirect` 参数续跳（如 `create`） |
| `pages/mine/mine` | 我的菜谱 | 当前用户菜谱、本机菜谱迁移入口、家人入口 |
| `pages/family/family` | 家人 | 创建/加入家庭（6 位邀请码）、成员管理、订阅开关、向成员分享食材清单 |

无 `tabBar`，页面间用 `wx.navigateTo`；跳详情统一 `/pages/detail/detail?id=<encodeURIComponent(id)>`。

## 云函数 action 清单

`cloudfunctions/recipes/index.js`（集合 `recipes`、`users`）

| action | 入参 | 返回 data |
|---|---|---|
| `list` | — | 菜谱数组（旧接口，上限 100） |
| `page` | `offset`、`limit`(≤50，默认 12)、`categoryId`、`keyword` | `{ items, hasMore, total, totalSteps, offset, limit, paged:true }`（`total`/`totalSteps` 仅第一页返回；老 sdk 无 `db.RegExp` 时返回 `UNKNOWN_ACTION` 让前端降级） |
| `get` | `id` | 单个菜谱（含 `canManage`），查无返回 `NOT_FOUND` |
| `my` | — | 当前 openid 的菜谱 |
| `create` | 菜谱字段 | 新菜谱 |
| `update` | `id` + 字段 | 更新后的菜谱；非作者 `FORBIDDEN` |
| `remove` | `id` | 删除结果；非作者 `FORBIDDEN` |
| `backfillIngredients` | `token`（`xiaoduli-ingredients-2026`） | `{ total, updated, skipped }`，历史数据补字段用 |

`cloudfunctions/family/index.js`（集合 `families`、`family_members`）

| action | 入参 | 返回 data |
|---|---|---|
| `overview` | — | `{ family:{id,name,inviteCode}, isOwner, members:[{openid,nickname,avatar,role,joinedAt}], templateConfigured }`；无家庭时 `family:null` |
| `create` | `name`(≤16) | 家庭信息与邀请码 |
| `join` | `inviteCode`(6 位) | 加入结果；错误码 `INVALID_CODE` / `ALREADY_IN_FAMILY` / `FAMILY_FULL`(≤20) |
| `leave` | — | 退出；群主退出返回 `OWNER_CANNOT_LEAVE` |
| `remove` | `openid` | 移出成员；非群主 `FORBIDDEN` |
| `setSubscribed` | `subscribed` | 订阅状态 |
| `share` | `recipeId`、`targets`(openid 数组，≤20) | 发送订阅消息；未配置模板 `NO_TEMPLATE`，无食材 `NO_INGREDIENTS`；47003 翻译为「模板字段不匹配」 |

`cloudfunctions/login/index.js`：无 action，直接读 `getWXContext().OPENID`，写入/更新 `users`（`nickname` ≤24、`avatar` 只接受 `cloud://` 或 `https://`），无 openid 返回 `NO_OPENID`。

## 集合与字段

| 集合 | 关键字段 |
|---|---|
| `recipes` | `_id`、`name`、`intro`、`images[]`、`cover`、`steps[{text,image}]`、`ingredients[{name,amount}]`、`categoryId`、`authorNickname`、`authorOpenid`、`authorAvatar`、`createdAt`、`updatedAt` |
| `users` | `openid`（自定义字段，不用 `_openid`）、`nickname`、`avatar`、`createdAt`、`updatedAt` |
| `families` | `_id`、`name`、`inviteCode`、`ownerOpenid`、`createdAt` |
| `family_members` | `familyId`、`openid`、`nickname`、`avatar`、`role`(`owner`/`member`)、`joinedAt`、`subscribed` |
| `categories` | `id`、`name`、`icon`、`sort_order` |

云函数以 `authorOpenid === OPENID` 判归属，客户端拿到的只是 `canManage` 布尔；`_openid` 由系统管理，不要手写。

## 错误码（`utils/errors.js`）

客户端：`TIMEOUT`、`NETWORK_ERROR`、`CLOUD_UNAVAILABLE`、`NOT_LOGGED_IN`、`UNKNOWN_ACTION`；业务：`INVALID`、`NOT_FOUND`、`FORBIDDEN`、`NO_OPENID`；兜底 `SERVER_ERROR`。
可重试：`TIMEOUT`、`NETWORK_ERROR`、`CLOUD_UNAVAILABLE`（以及带 `err.system` 的错误）。新增错误码加到 `CODE`，不要直接抛裸字符串。

## 常量（`config/constants.js`）

`REQUEST_TIMEOUT=12000`、`REQUEST_RETRY=1`、`REQUEST_RETRY_DELAY=400`、`PAGE_SIZE=12`、`MAX_PAGE_SIZE=50`、`MAX_PHOTOS=9`、`MAX_INGREDIENTS=30`、`MAX_STEPS=20`、`MAX_NAME_LENGTH=16`、`MAX_INTRO_LENGTH=60`、`CATEGORY_SWITCH_DELAY=120`、`REMOVE_ANIMATION_DELAY=150`、`COPY`。

## 视觉令牌（`app.wxss`）

底色 `--bg #fff8f0`、卡面 `--surface #ffffff`、次级面 `--surface-2 #fbf5ee`；文字 `--ink #2e2621` / `--ink-2 #574a41` / `--ink-3 #8b7c71` / `--muted #a99a8d`；描边 `--line #efe3d7` / `--line-soft #f6eee5`；主色 `--accent #c4562c`（深 `--accent-deep`、浅 `--accent-soft` / `--accent-wash`）；成功 `--success #5c8f6c`；圆角 `--r-lg 24rpx` / `--r-md 20rpx` / `--r-sm 14rpx`；阴影 `--shadow-1` / `--shadow-2`；动效 `--dur-fast 120ms` / `--dur-base 240ms` / `--dur-slow 420ms` / `--ease-out`。
