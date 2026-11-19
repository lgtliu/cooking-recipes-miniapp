# 菜谱数据模型与契约

## 字段契约（一条菜谱）

云端文档 → 云函数 `withSignedUrls` 输出 → 客户端 `normalizeDish` 输出，三者字段名一致（camelCase），只有图片 URL 形式会变。

| 字段 | 类型 | 云函数输出规则 | 客户端归一化 |
|---|---|---|---|
| `id` | string | 取 `_id` | 去空白；空串表示无效 |
| `name` | string | `doc.name` | trim |
| `intro` | string | `doc.intro` | trim |
| `images` | string[] | `cloud://` 换 https 临时链接（`getTempFileURL`，`maxAge=7200`，失败保留原值） | 过滤空值；空则用 `cover` 兜底 |
| `cover` | string | `doc.cover` 或 `images[0]` | 取 `images[0]` 优先 |
| `steps` | `[{text,image}]` | `image` 同样换临时链接 | 去空白、丢空 `text` 步骤 |
| `ingredients` | `[{name,amount}]` | 清洗，name 必填、各 ≤20 字、≤30 条 | 同上，`name` 空的行丢弃 |
| `author` | string | `authorNickname`，空则「匿名厨友」 | 空则「匿名厨友」 |
| `authorId` | string | `authorOpenid` | trim（仅展示，判权不依赖它） |
| `authorAvatar` | string | `authorAvatar`（`cloud://` 换临时链接） | trim |
| `canManage` | boolean | `authorOpenid === OPENID`（服务端算） | 布尔化 |
| `categoryId` | string | `categoryId` | trim，空合法 = 未分类 |
| `categoryName` / `categoryIcon` | string | 不返回，客户端补 | 按 `utils/categories.js` 由 `categoryId` 重算 |
| `createdAt` / `updatedAt` | number | 时间戳 `Date.now()` | 非法值归 0 |

`normalizeDish` 用 `Object.assign({}, dish, ...)`，服务端额外字段会保留，不做白名单裁剪——加字段不会丢。

## 校验上限：客户端软限制 vs 云端硬校验

| 项 | `config/constants.js` | `pages/create` 表现 | 云函数硬校验（`cloudfunctions/recipes`） |
|---|---|---|---|
| 菜名 | `MAX_NAME_LENGTH = 16` | 输入限制 + 计数 | `name.length > 40` 拒绝 |
| 简介 | `MAX_INTRO_LENGTH = 60` | 输入限制 + 计数 | `intro.length > 200` 拒绝 |
| 图片 | `MAX_PHOTOS = 9` | 最多选 9 张 | `images.slice(0, 9)` 截断 |
| 食材 | `MAX_INGREDIENTS = 30` | 最多 30 行 | >30 拒绝；单项 name/amount ≤20 字 |
| 步骤 | `MAX_STEPS = 20` | 最多 20 步 | >20 拒绝；单步 text ≤500 字 |
| 分页 | `PAGE_SIZE = 12`、`MAX_PAGE_SIZE = 50` | 上拉加载 | `limit ≤50`，默认 12 |

客户端比云端更严是有意的（前端克制、后端兜底）。改上限时三处对齐：`config/constants.js`、`utils/normalize.js` 的 `MAX_INGREDIENTS`/`MAX_TEXT`、云函数常量与校验分支。只改一边会导致「前端能填、保存被拒」或「历史数据被截断」。

## 分类字典

`utils/categories.js` 的 `FALLBACK_CATEGORIES`：`home` 家常菜 🏠 10、`meat` 肉菜硬菜 🥩 20、`seafood` 海鲜水产 🐟 30、`veggie` 清爽素菜 🥬 40、`soup` 汤羹炖品 🍲 50、`staple` 主食面点 🍚 60、`dessert` 甜品小食 🍰 70、`other` 其他 🍽️ 80。

- 云端 `categories` 集合是「可维护数据源」，空表或不可用时回落到兜底字典，页面永远有分类可选。
- `UNCATEGORIZED`（`id: ''`）只用于展示，不可写入。
- 云函数白名单 `FALLBACK_CATEGORY_IDS` 同上，用来拒绝未知分类入库；前端会把当前字典 id 集合作为 `categories` 传入，服务端取交集。
- 新增分类：`utils/categories.js` 兜底字典 + 云函数白名单 + 云端 `categories` 插入一行（`id`/`name`/`icon`/`sort_order`），三处都要。

## 图片与云存储

- 上传走 `utils/image.js` + `services/request.js` 的 `uploadFile`，目录按业务分（菜谱图与头像分开）。
- 客户端与云函数展示前都要把 `cloud://` 换 https：前端用 `store.getShareImageUrl()`，云端在 `withSignedUrls` 批量签名（每批 `SIGN_BATCH_SIZE`，有效期 7200s）。
- 种子菜谱图：`seed-images/` 原图（1024x1024，约 81.7MB）与 `seed-images-c/` 压缩版（800px/q78，约 6MB），上传到云存储 `recipes/seed/<slug>.jpg`，fileID 前缀 `cloud://cloud1-d5ga1hj0qb4d21f6a.636c-...`。这两个目录只在本地/仓库，不进小程序包。
- 云存储图片在分享卡片里不能用 `cloud://`（见 SKILL.md 已知坑）。

## 订阅消息（当前未启用）

| 位置 | 作用 |
|---|---|
| `config/notify.js` | `TEMPLATE_ID`（占位 `YOUR_SUBSCRIBE_TEMPLATE_ID`）、`isConfigured()`、`truncate()`（thing 字段 ≤20 字）、`buildSummary()`（前 3 样食材 + 总数）、`buildIngredientText()`（手动发送用清单） |
| `cloudfunctions/family/config.js` | 同 `TEMPLATE_ID`、`FIELDS`（`dishName: thing1`、`ingredientCount: number2`、`summary: thing3`）、`DETAIL_PAGE: pages/detail/detail`、`MINIPROGRAM_STATE: developer`（发布改 `formal`） |

一侧未配置时：前端不调 `wx.requestSubscribeMessage`，页面提示模板未配置并允许复制食材清单；云端返回 `NO_TEMPLATE`。启用步骤见 `workflows.md`。

## 本机菜谱迁移

`utils/store.local.js` 只作为迁移源：`store.getMigrationInfo()` 读本地旧数据（`seed-*` / `dish-*` 前缀 id），`store.migrateLocalDishes()` 逐条写入云端。不要再把本地存储当在线数据源用。
