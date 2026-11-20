# 小杜里 · 家常菜谱记录小程序

「小杜里」是一个用来记录家常菜谱的微信小程序：拍下成品图、写下食材和步骤，做成自己的私房菜谱集，也可以把食材清单转发给家人。

原生小程序写法 + 微信云开发（云函数 + 云数据库 + 云存储），不依赖任何第三方框架。

## 功能

- **首页瀑布流**：双列卡片、分类筛选、菜名搜索（260ms 防抖），首屏统计菜谱数与步骤总数
- **菜谱详情**：成品图、食材清单、分步做法，作者可编辑/删除
- **记一道菜**：名称、简介、分类、最多 9 张图、最多 30 项食材、最多 20 个步骤，支持编辑已有菜谱
- **微信登录**：云函数拿 openid 建用户档案，未登录可浏览、登录后才能创作
- **我的菜谱**：只看自己写过的菜，支持把旧版本存在本机的菜谱一键迁移到云端
- **家人**：6 位邀请码建家庭组、成员管理、把食材清单分享给指定成员（订阅消息能力已预留）
- **转发卡片**：详情页可直接分享给微信好友，标题为菜名、缩略图为成品首图

## 技术栈

| 层 | 说明 |
|---|---|
| 客户端 | 微信原生小程序（`Page` / `Component` / `Behavior`），基础库 3.18.0 |
| 后端 | 微信云开发：云函数 `recipes` / `family` / `login`，云数据库，云存储 |
| 数据层 | 页面 → `utils/store.js` → `services/*` → `services/request.js` → `utils/cloud.js` |
| 样式 | `app.wxss` 定义 CSS 变量令牌（暖米底 + 陶土橙），页面只用变量不硬编码颜色 |

## 目录结构

```
cooking-miniapp/
├── app.js / app.json / app.wxss      启动、页面注册、全局样式令牌
├── config/
│   ├── cloud.js                      云开发环境 ID（唯一需要改的环境配置）
│   ├── constants.js                  超时重试、分页、业务上限、通用文案
│   └── notify.js                     订阅消息模板 ID（小程序端）
├── pages/                            6 个页面：index / detail / create / login / mine / family
├── components/                       dish-card（菜谱卡）、state-view（加载/空/错误态）
├── behaviors/list-behavior.js        列表分页、下拉刷新、上拉加载、错误态
├── services/                         recipes / family / account / migrate + request 请求层
├── utils/                            store 门面、cloud 封装、normalize 归一化、categories 分类字典、errors 错误码等
├── cloudfunctions/                   recipes（菜谱 CRUD 与分页）、family（家庭组）、login（登录）
├── skills/xiaoduli-miniapp/          本项目的开发 skill：架构约定、契约、改动配方、静态检查脚本
├── seed/                             50 道种子菜谱 JSON（不进小程序包）
├── seed-images/、seed-images-c/      种子菜谱原图与压缩图（不进小程序包）
└── project.config.json               开发者工具工程配置、packOptions.ignore
```

## 快速开始

1. **导入项目**：微信开发者工具 → 导入项目 → 选择本仓库目录。AppID 用 `project.config.json` 里的，或换成你自己的。
2. **填云环境**：把 `config/cloud.js` 的 `CLOUD_ENV` 改成你的云开发环境 ID（当前为 `cloud1-d5ga1hj0qb4d21f6a`）。
3. **建集合**：云开发控制台 → 数据库，手动创建 `recipes`、`users`、`categories` 三个集合。`families` 与 `family_members` 会在 `family` 云函数首次调用时自动创建。
4. **部署云函数**：在开发者工具里右键 `cloudfunctions/recipes`、`cloudfunctions/family`、`cloudfunctions/login`，逐个「上传并部署：云端安装依赖」。
5. **编译运行**：未登录可直接浏览；点「记一道菜」会先引导登录。

可选：把 `seed/recipes.json` 里的 50 道菜通过控制台或脚本导入 `recipes` 集合，首页就有内容了。导入时给每条补 `createdAt`（递增时间戳）并把 `authorOpenid` 留空（表示公开只读）。

## 关键配置

| 位置 | 作用 | 备注 |
|---|---|---|
| `config/cloud.js` `CLOUD_ENV` | 云开发环境 ID | 换成自己的环境后无需改其他地方 |
| `config/notify.js` `TEMPLATE_ID` | 小程序端订阅消息模板 | 与 `cloudfunctions/family/config.js` 必须一致 |
| `cloudfunctions/family/config.js` | 订阅消息字段映射与跳转页 | `FIELDS` 按模板实际字段名（如 `thing1`/`number2`/`thing3`）填；发布后把 `MINIPROGRAM_STATE` 改成 `formal` |
| `project.config.json` `packOptions.ignore` | 打包忽略 `seed/`、`seed-images*/` | 别删，否则图片素材会被打进小程序包 |

订阅消息没配模板 ID 时不会报错：前端会提示模板未配置，并允许复制食材清单手动发送。

## 开发约定

改动前请先读 `skills/xiaoduli-miniapp/SKILL.md`，里面是本项目的完整约定与踩坑清单。核心几条：

- 页面只通过 `utils/store.js` 取数，不直调 `wx.cloud`、不自己拼 `action` 参数
- 云函数统一返回 `{ ok: true, data }` / `{ ok: false, code, message }`
- 用户身份只认 `cloud.getWXContext().OPENID`，不信任前端传的作者字段
- 业务上限（图片 9、食材 30、步骤 20 等）要在 `config/constants.js`、云函数校验、`utils/normalize.js` 三处保持一致
- 分类统一存英文 id（`home`/`meat`/…），新增分类要同步前端字典与云函数白名单

提交前跑一遍静态检查（要求 Node.js）：

```powershell
pwsh -File skills/xiaoduli-miniapp/scripts/check-project.ps1 -ProjectRoot .
```

会检查全部 JS 语法、JSON 可解析、`app.json` 页面四件套完整、页面是否越层直调 `wx.cloud`、详情页加载态守卫、打包忽略项。

## 已知限制

- 订阅消息为一次性授权，一次授权只收一条，收后需重新开启提醒
- 云存储图片在客户端展示前会换成临时链接（有效期 2 小时），缓存过的链接过期后需重新进入页面
- 数据库读写不支持 `tcb` CLI 的机器需走云开发控制台操作
- 本机数据只作为迁移来源，不再作为在线数据源

## License

未指定开源许可证。如需公开复用请先联系仓库所有者。
