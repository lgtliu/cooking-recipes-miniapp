# 改动配方

所有配方都以「先读同层现有实现」为前提：`pages/mine` 是「列表 + 登录态」最简样例，`services/recipes.js` 是服务层样例，`cloudfunctions/family/index.js` 是多 action + 权限样例。

## 加一个数据字段（如菜谱加 `difficulty`）

1. 云函数 `cloudfunctions/recipes/index.js`：在 `normalizeDraft`（create/update 共用的清洗处）加清洗与截断，字段名 camelCase；需要拒绝非法值时用 `businessError('INVALID', '...')`。
2. `utils/normalize.js` 的 `normalizeDish` 里补默认值（`Object.assign({}, dish, {...})` 的返回对象）。
3. `README` 之外的三处展示：`pages/create` 表单（`data`、`onInput`、保存 payload）+ 校验提示，`pages/detail` 展示，`pages/index` 或 `dish-card` 需要时展示。
4. 若有上限：`config/constants.js` 加常量，云函数加同名硬校验，`utils/normalize.js` 加 `slice`。
5. `project.config.json` 无需改；历史数据缺字段由 `normalizeDish` 兜底，不必写迁移脚本（确需回填时仿 `backfillIngredients` 加一个带 token 的 action）。

## 加一个页面

1. 建目录 `pages/<name>/`，四个文件：`index.js`（本项目用 `<name>.js` 命名，与现有页面一致）、`.json`、`.wxml`、`.wxss`，`.json` 至少写 `{"navigationBarTitleText": "标题"}`，可带 `"usingComponents"`。
2. 在 `app.json.pages` 追加 `"pages/<name>/<name>"`（顺序决定默认首屏，首项保持 `pages/index/index`）。
3. 页面取数只走 `utils/store.js`；受限操作先 `auth.requireLogin('回跳标识')`。
4. 列表型页面用 `composePage`：

```js
const { composePage } = require('../../utils/page');
const listBehavior = require('../../behaviors/list-behavior');
const store = require('../../utils/store');

Page(composePage(listBehavior, {
  data: { items: [] },
  async fetchPage({ offset, limit, reset }) {
    const page = await store.listDishPage({ offset, limit });
    return { items: this.mapItems(page.items, { append: !reset }), hasMore: page.hasMore, total: page.total, totalSteps: page.totalSteps };
  },
  mapItems(items) { return items.map((d) => Object.assign({}, d, { /* 展示字段 */ })); },
  onListReset(items) { this.setData({ items }); },
  onListAppend(items) { this.setData({ items: this.data.items.concat(items) }); }
}));
```

不要自己写 `onPullDownRefresh` / `onReachBottom`，`list-behavior` 已接管并带请求令牌防竞态。

5. 详情类页面照抄 `pages/detail` 的三态模式：`loading` 初始 `true`，`wx:if="{{dish}}"` / `wx:elif="{{loading}}"` / `wx:elif="{{failReason}}"` / `wx:else`。

## 加一个云函数 action

1. 在 `cloudfunctions/<fn>/index.js` 的 `switch` 里加 `case '<action>': return { ok: true, data: await handleXxx(event, OPENID) };`。
2. 处理函数内：入参 `normalizeText` 清洗 + 上限校验（越界 `businessError('INVALID', ...)`）；身份只用 `OPENID`；查无数据 `NOT_FOUND`；越权 `FORBIDDEN`。
3. 客户端：`services/<domain>.js` 里 `request.callAction('<fn>', '<action>', payload)` 并做 `normalize.*`；`utils/store.js` 暴露同名门面；需要联动缓存的调用 `invalidateCache()`。
   菜谱写入的 payload 形状固定：新建 `{ dish: draft }`，更新 `{ id, dish: draft }`，删除 `{ id }`；`handleUpdate` 里改动字段要同时写进 `patch` 对象。
4. 新集合先确认在云开发控制台已创建（`families` / `family_members` 缺失时 `family` 云函数会按 `isCollectionMissing` 自动建）。

## 加/改分类

- 改名称或图标：只改 `utils/categories.js` 兜底字典 + 云端 `categories` 行（`name`/`icon`）。`categoryId` 不动，历史数据不受影响。
- 加分类：兜底字典 + 云函数 `FALLBACK_CATEGORY_IDS` + `categories` 集合插入 `{id,name,icon,sort_order}`。`id` 用稳定英文 key，`sort_order` 决定顺序。
- 删分类：从三处移除；已有菜谱的 `categoryId` 变成未知值会被云函数拒绝写入，需先批量把这些菜谱改成合法 id 或置空。

## 改视觉

- 颜色/圆角/阴影/动效只用 `app.wxss` 变量，页面 wxss 里 `var(--accent)` 这种写法；确需新令牌加到 `page` 选择器下，命名沿用现有规律。
- 间距用 `rpx`；卡片圆角 `--r-md`，大面板 `--r-lg`。
- 动效只做一次性进入，不循环；JS 侧延时用 `config/constants.js` 的时间常量而不是魔法数字。

## 启用订阅消息

1. 微信公众平台「功能 → 订阅消息」申请/选用一个一次性订阅模板，字段为 菜品名称(thing)、食材数量(number)、食材摘要(thing)。
2. 模板 id 填到 `config/notify.js` 的 `TEMPLATE_ID` 与 `cloudfunctions/family/config.js` 的 `TEMPLATE_ID`，两处必须一致。
3. `cloudfunctions/family/config.js` 的 `FIELDS` 改成模板实际字段名（通常 `thing1` / `number2` / `thing3`）；正式发布把 `MINIPROGRAM_STATE` 改 `formal`。
4. 重新部署 `family` 云函数，`config.json` 已声明 `subscribeMessage.send` 权限。
5. 已知限制：一次性订阅一次授权只收一条，收到后要让用户重新点「开启提醒」。

## 部署云函数

云函数改动只有在部署后才生效：

1. 开发者工具里右键 `cloudfunctions/<fn>` → 「上传并部署：云端安装依赖」。
2. 或 CLI：`& "E:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" cloud functions deploy --project <仓库路径> --name <fn> --env cloud1-d5ga1hj0qb4d21f6a`（先 `cli.bat login` / `cli.bat islogin` 确认登录态）。
3. 不要用 `tcb` CLI（本机安全策略拦截）；数据库与云存储操作走 cloudbase MCP 或控制台。
4. 部署后验证：控制台看调用日志，或跑一次自动化脚本确认 `recipes.list` 返回 `ok:true`。

## 调试与自动化

```powershell
# 1. 打开自动化实例（9420 端口）
& "E:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" auto --project "C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\cooking-miniapp" --auto-port 9420

# 2. 复用现成脚本（在 wx-automator 目录）
cd "C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\wx-automator"
node diagnose.js        # 首页 → 详情链路 + 云函数对照
node scenarios.js       # 多场景回归
node verify-loading.js  # 加载态/找不到态
```

新脚本写法：`automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })`，`miniProgram.reLaunch('/pages/index/index')`，`page.data()` 取页面状态，`miniProgram.callWxMethod` 或云函数对照定位前后端责任边界。模拟器延迟小，真机才有的问题（冷启动窗口、图片加载）用真机预览复现。

## 数据运维

- 批量导入：`seed/recipes.json` 结构即云端文档（`name`/`slug`/`categoryId`/`intro`/`ingredients`/`steps`），插入时补 `createdAt` 递增避免排序并列、`authorOpenid` 留空即公开只读、`authorNickname` 写展示名。
- 配图：生成 1024x1024 → 压缩到 800px/q78 放 `seed-images-c/` → 上传云存储 `recipes/seed/<slug>.jpg` → 文档 `images` 写 `cloud://` fileID。
- 改数据前先 `count` 或取一条样本核对字段名，云端文档字段名错一个字就会被 `normalize` 静默丢弃。
