/**
 * 菜谱云函数：所有读写都经过这里。
 *
 * - 查询（list/get）对所有访客开放；
 * - create / update / remove / my 按 openid 判断归属，
 *   作者身份来自 getWXContext，绝不信任前端传入的 author 字段。
 *
 * 返回约定：{ ok: true, data } 或 { ok: false, code, message }。
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const RECIPES = 'recipes';
const USERS = 'users';
const MAX_LIST = 100;
const MAX_PAGE = 50;
const DEFAULT_PAGE = 12;
const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_TEXT = 20;
const BACKFILL_TOKEN = 'xiaoduli-ingredients-2026';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function businessError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeImages(list) {
  return Array.isArray(list)
    ? list.filter((item) => typeof item === 'string' && item)
    : [];
}

function normalizeSteps(list) {
  return Array.isArray(list)
    ? list
        .map((step) => ({
          text: normalizeText(step && step.text),
          image: normalizeText(step && step.image)
        }))
        .filter((step) => step.text)
    : [];
}

/** 食材清洗：食材名必填、去掉空行、限制条数与文本长度；旧数据缺字段返回空数组 */
function normalizeIngredients(list) {
  return Array.isArray(list)
    ? list
        .map((item) => ({
          name: normalizeText(item && item.name).slice(0, MAX_INGREDIENT_TEXT),
          amount: normalizeText(item && item.amount).slice(0, MAX_INGREDIENT_TEXT)
        }))
        .filter((item) => item.name)
        .slice(0, MAX_INGREDIENTS)
    : [];
}

// 分类字典由客户端传入当前可用的 id 集合做校验；服务端用一份兜底白名单，
// 兼容历史数据（空分类合法，归入未分类）并拒绝未知分类，防止脏数据入库。
const FALLBACK_CATEGORY_IDS = [
  'home', 'meat', 'seafood', 'veggie', 'soup', 'staple', 'dessert', 'other'
];

function normalizeCategoryId(raw, allowed) {
  const id = normalizeText(raw);
  if (!id) return '';
  const list = Array.isArray(allowed) && allowed.length ? allowed : FALLBACK_CATEGORY_IDS;
  return list.indexOf(id) !== -1 ? id : '';
}

function normalizeDraft(raw) {
  const dish = raw && typeof raw === 'object' ? raw : {};
  const name = normalizeText(dish.name);
  if (!name) {
    throw businessError('INVALID', '菜名不能为空');
  }
  if (name.length > 40) {
    throw businessError('INVALID', '菜名最多 40 个字');
  }

  const intro = normalizeText(dish.intro);
  if (intro.length > 200) {
    throw businessError('INVALID', '简介最多 200 个字');
  }

  const images = normalizeImages(dish.images).slice(0, 9);
  if (!images.length) {
    throw businessError('INVALID', '至少上传一张成品图');
  }

  const steps = normalizeSteps(dish.steps);
  if (!steps.length) {
    throw businessError('INVALID', '至少写一个做法步骤');
  }
  if (steps.length > 20) {
    throw businessError('INVALID', '做法步骤最多 20 条');
  }
  if (steps.some((step) => step.text.length > 500)) {
    throw businessError('INVALID', '单条步骤最多 500 个字');
  }

  const rawIngredients = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  if (rawIngredients.length > MAX_INGREDIENTS) {
    throw businessError('INVALID', `食材最多 ${MAX_INGREDIENTS} 条`);
  }
  if (
    rawIngredients.some(
      (item) => normalizeText(item && item.amount) && !normalizeText(item && item.name)
    )
  ) {
    throw businessError('INVALID', '填写用量时请同时写食材名');
  }
  const ingredients = normalizeIngredients(rawIngredients);

  return {
    name,
    intro,
    ingredients,
    cover: images[0],
    images,
    steps,
    categoryId: normalizeCategoryId(dish.categoryId)
  };
}

/**
 * 云存储是私有读写（免费体验环境无法改成公有读），访客无法直接读取别人的
 * cloud:// 图片。这里由云函数用管理员权限把 fileID 签名成 https 临时链接
 * 返回；每次读取都会重新签名，因此访客始终能看到图片。签名失败时回退原值。
 */
const TEMP_URL_MAX_AGE = 7200; // 2 小时，读取时刷新
const SIGN_BATCH_SIZE = 50;

function collectFileIds(docs) {
  const ids = [];
  docs.forEach((doc) => {
    if (doc.authorAvatar) ids.push(doc.authorAvatar);
    if (doc.cover) ids.push(doc.cover);
    normalizeImages(doc.images).forEach((image) => ids.push(image));
    normalizeSteps(doc.steps).forEach((step) => {
      if (step.image) ids.push(step.image);
    });
  });
  return ids;
}

async function signFileIds(ids) {
  const cloudIds = Array.from(
    new Set(ids.filter((id) => typeof id === 'string' && id.indexOf('cloud://') === 0))
  );
  const signed = {};
  for (let i = 0; i < cloudIds.length; i += SIGN_BATCH_SIZE) {
    const fileList = cloudIds
      .slice(i, i + SIGN_BATCH_SIZE)
      .map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE }));
    try {
      const res = await cloud.getTempFileURL({ fileList });
      (res.fileList || []).forEach((item) => {
        if (item.status === 0 && item.tempFileURL) {
          signed[item.fileID] = item.tempFileURL;
        }
      });
    } catch (err) {
      console.warn('[recipes] 生成图片临时链接失败', err);
    }
  }
  return signed;
}

function withSignedUrls(doc, signed, openid) {
  const urlOf = (value) => (value && signed[value]) || value || '';
  const images = normalizeImages(doc.images).map(urlOf);
  return {
    id: doc._id,
    name: doc.name || '',
    intro: doc.intro || '',
    cover: urlOf(doc.cover || images[0] || ''),
    images,
    steps: normalizeSteps(doc.steps).map((step) => ({
      text: step.text,
      image: urlOf(step.image)
    })),
    ingredients: normalizeIngredients(doc.ingredients),
    author: doc.authorNickname || '匿名厨友',
    authorId: doc.authorOpenid || '',
    authorAvatar: urlOf(doc.authorAvatar),
    // 归属判断只用服务端 getWXContext 的 openid，不依赖客户端缓存的登录 id
    canManage: !!(doc.authorOpenid && doc.authorOpenid === openid),
    categoryId: normalizeText(doc.categoryId),
    createdAt: doc.createdAt || 0,
    updatedAt: doc.updatedAt || 0
  };
}

async function toClients(docs, openid) {
  const signed = await signFileIds(collectFileIds(docs));
  return docs.map((doc) => withSignedUrls(doc, signed, openid));
}

async function toClient(doc, openid) {
  const list = await toClients([doc], openid);
  return list[0];
}

async function getUser(openid) {
  try {
    const res = await db.collection(USERS).where({ openid }).limit(1).get();
    return res.data[0] || {};
  } catch (err) {
    console.warn('[recipes] 读取用户资料失败', err);
    return {};
  }
}

async function findRecipe(id) {
  if (!id) {
    throw businessError('NOT_FOUND', '菜谱不存在或已被删除');
  }
  try {
    const res = await db.collection(RECIPES).doc(id).get();
    return res.data;
  } catch (err) {
    throw businessError('NOT_FOUND', '菜谱不存在或已被删除');
  }
}

/** 只有作者本人可以操作 */
function assertOwner(doc, openid) {
  const owner = doc.authorOpenid || '';
  if (!owner || owner !== openid) {
    throw businessError('FORBIDDEN', '只能操作自己发布的菜谱');
  }
}

function collectFileIdsForDelete(doc) {
  const files = [];
  normalizeImages(doc.images).forEach((item) => files.push(item));
  normalizeSteps(doc.steps).forEach((step) => {
    if (step.image) files.push(step.image);
  });
  return files.filter((item) => item.indexOf('cloud://') === 0);
}

async function handleList(openid) {
  const res = await db
    .collection(RECIPES)
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST)
    .get();
  return toClients(res.data, openid);
}

async function handleGet(event, openid) {
  try {
    const doc = await findRecipe(normalizeText(event && event.id));
    return await toClient(doc, openid);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 统计筛选结果里的步骤总数；聚合失败时返回 null，由前端用已加载条数兜底 */
async function countSteps(where) {
  try {
    const aggCmd = db.command.aggregate;
    let pipeline = db.collection(RECIPES).aggregate();
    if (where && Object.keys(where).length) pipeline = pipeline.match(where);
    const res = await pipeline
      .group({ _id: null, steps: aggCmd.sum(aggCmd.size('$steps')) })
      .end();
    const row = res.list && res.list[0];
    return row ? row.steps : 0;
  } catch (err) {
    console.warn('[recipes] 统计步骤数失败', err);
    return null;
  }
}

/**
 * 分页列表：按分类 / 菜名筛选后切片返回。
 * 额外多取一条用来判断 hasMore，避免再发一次请求。
 */
async function handlePage(event, openid) {
  const offset = Math.max(0, Number(event && event.offset) || 0);
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, Number(event && event.limit) || DEFAULT_PAGE)
  );
  const categoryId = normalizeText(event && event.categoryId);
  const keyword = normalizeText(event && event.keyword);

  const where = {};
  if (categoryId && categoryId !== 'all') where.categoryId = categoryId;
  if (keyword) {
    // 老版本 wx-server-sdk 可能没有 db.RegExp，直接让前端走降级路径
    if (typeof db.RegExp !== 'function') {
      return { ok: false, code: 'UNKNOWN_ACTION', message: '当前环境不支持分页搜索' };
    }
    where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' });
  }

  let query = db.collection(RECIPES);
  if (Object.keys(where).length) query = query.where(where);

  const res = await query
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(limit + 1)
    .get();

  const hasMore = res.data.length > limit;
  const docs = hasMore ? res.data.slice(0, limit) : res.data;

  // 只有第一页才需要总量与步骤总数（用于首屏统计）
  let total = null;
  let totalSteps = null;
  if (offset === 0) {
    try {
      const countRes = await query.count();
      total = countRes.total;
    } catch (err) {
      console.warn('[recipes] 统计菜谱总数失败', err);
    }
    totalSteps = await countSteps(where);
  }

  return {
    items: await toClients(docs, openid),
    hasMore,
    total,
    totalSteps,
    offset,
    limit,
    paged: true
  };
}

async function handleMy(openid) {
  const res = await db
    .collection(RECIPES)
    .where({ authorOpenid: openid })
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST)
    .get();
  return toClients(res.data, openid);
}

async function handleCreate(event, openid) {
  const draft = normalizeDraft(event && event.dish);
  const user = await getUser(openid);
  const now = Date.now();

  const doc = {
    authorOpenid: openid,
    authorNickname: user.nickname || '微信用户',
    authorAvatar: user.avatar || '',
    name: draft.name,
    intro: draft.intro,
    cover: draft.cover,
    images: draft.images,
    ingredients: draft.ingredients,
    steps: draft.steps,
    categoryId: draft.categoryId,
    createdAt: now,
    updatedAt: now
  };

  const added = await db.collection(RECIPES).add({ data: doc });
  return await toClient(Object.assign({ _id: added._id }, doc), openid);
}

async function handleUpdate(event, openid) {
  const id = normalizeText(event && event.id);
  const doc = await findRecipe(id);
  assertOwner(doc, openid);

  const draft = normalizeDraft(event && event.dish);
  const patch = {
    name: draft.name,
    intro: draft.intro,
    cover: draft.cover,
    images: draft.images,
    ingredients: draft.ingredients,
    steps: draft.steps,
    categoryId: draft.categoryId,
    updatedAt: Date.now()
  };

  await db.collection(RECIPES).doc(id).update({ data: patch });
  return await toClient(Object.assign({}, doc, patch), openid);
}

async function handleRemove(event, openid) {
  const id = normalizeText(event && event.id);
  const doc = await findRecipe(id);
  assertOwner(doc, openid);

  await db.collection(RECIPES).doc(id).remove();

  // 尽力清理云存储里的图片，失败不影响删除结果
  const fileList = collectFileIdsForDelete(doc);
  if (fileList.length) {
    try {
      await cloud.deleteFile({ fileList });
    } catch (err) {
      console.warn('[recipes] 清理图片失败', err);
    }
  }

  return true;
}

/** 一次性补数据：按菜名给没有食材的历史菜谱补上与做法相符的清单 */
const SEED_INGREDIENTS = {
  番茄炒蛋: [
    { name: '番茄', amount: '2 个' },
    { name: '鸡蛋', amount: '3 个' },
    { name: '小葱', amount: '1 根' },
    { name: '白糖', amount: '半勺' },
    { name: '盐', amount: '适量' },
    { name: '食用油', amount: '2 勺' }
  ],
  红烧肉: [
    { name: '五花肉', amount: '500g' },
    { name: '冰糖', amount: '30g' },
    { name: '姜', amount: '4 片' },
    { name: '八角', amount: '2 颗' },
    { name: '桂皮', amount: '1 小段' },
    { name: '干辣椒', amount: '2 个' },
    { name: '生抽', amount: '2 勺' },
    { name: '老抽', amount: '1 勺' },
    { name: '料酒', amount: '1 勺' }
  ],
  蒜蓉西兰花: [
    { name: '西兰花', amount: '1 颗' },
    { name: '大蒜', amount: '5 瓣' },
    { name: '蚝油', amount: '1 勺' },
    { name: '盐', amount: '适量' },
    { name: '食用油', amount: '1 勺' },
    { name: '水淀粉', amount: '少许' }
  ],
  葱油拌面: [
    { name: '小葱', amount: '100g' },
    { name: '面条', amount: '200g' },
    { name: '生抽', amount: '3 勺' },
    { name: '老抽', amount: '1 勺' },
    { name: '白糖', amount: '1 勺' },
    { name: '食用油', amount: '100ml' }
  ]
};

async function handleBackfill(event) {
  if (normalizeText(event && event.token) !== BACKFILL_TOKEN) {
    throw businessError('FORBIDDEN', '缺少补数据口令');
  }

  const res = await db.collection(RECIPES).limit(MAX_LIST).get();
  const skipped = [];
  let updated = 0;

  for (let i = 0; i < res.data.length; i += 1) {
    const doc = res.data[i];
    if (normalizeIngredients(doc.ingredients).length) continue;
    const ingredients = SEED_INGREDIENTS[doc.name];
    if (!ingredients) {
      skipped.push(doc.name || doc._id);
      continue;
    }
    await db
      .collection(RECIPES)
      .doc(doc._id)
      .update({ data: { ingredients, updatedAt: Date.now() } });
    updated += 1;
  }

  return { total: res.data.length, updated, skipped };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = normalizeText(event && event.action);

  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份' };
  }

  try {
    switch (action) {
      case 'list':
        return { ok: true, data: await handleList(OPENID) };
      case 'page':
        return { ok: true, data: await handlePage(event, OPENID) };
      case 'get':
        return { ok: true, data: await handleGet(event, OPENID) };
      case 'my':
        return { ok: true, data: await handleMy(OPENID) };
      case 'create':
        return { ok: true, data: await handleCreate(event, OPENID) };
      case 'update':
        return { ok: true, data: await handleUpdate(event, OPENID) };
      case 'remove':
        return { ok: true, data: await handleRemove(event, OPENID) };
      case 'backfillIngredients':
        return { ok: true, data: await handleBackfill(event) };
      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: '未知操作' };
    }
  } catch (err) {
    if (err.code === 'INVALID' || err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN') {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error('[recipes] 处理失败', action, err);
    return { ok: false, code: 'SERVER_ERROR', message: '云端处理失败，请稍后重试' };
  }
};
