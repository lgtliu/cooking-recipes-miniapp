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

function normalizeDraft(raw) {
  const dish = raw && typeof raw === 'object' ? raw : {};
  const name = normalizeText(dish.name);
  if (!name) {
    throw businessError('INVALID', '菜名不能为空');
  }

  const images = normalizeImages(dish.images);
  if (!images.length) {
    throw businessError('INVALID', '至少上传一张成品图');
  }

  const steps = normalizeSteps(dish.steps);
  if (!steps.length) {
    throw businessError('INVALID', '至少写一个做法步骤');
  }

  return {
    name,
    intro: normalizeText(dish.intro),
    cover: images[0],
    images,
    steps
  };
}

/** 数据库文档转成前端使用的结构 */
function toClient(doc) {
  const images = normalizeImages(doc.images);
  return {
    id: doc._id,
    name: doc.name || '',
    intro: doc.intro || '',
    cover: doc.cover || images[0] || '',
    images,
    steps: normalizeSteps(doc.steps),
    author: doc.authorNickname || '匿名厨友',
    authorId: doc.authorOpenid || doc._openid || '',
    authorAvatar: doc.authorAvatar || '',
    createdAt: doc.createdAt || 0,
    updatedAt: doc.updatedAt || 0
  };
}

async function getUser(openid) {
  try {
    const res = await db.collection(USERS).where({ _openid: openid }).limit(1).get();
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
  const owner = doc.authorOpenid || doc._openid || '';
  if (!owner || owner !== openid) {
    throw businessError('FORBIDDEN', '只能操作自己发布的菜谱');
  }
}

function collectFileIds(doc) {
  const files = [];
  normalizeImages(doc.images).forEach((item) => files.push(item));
  normalizeSteps(doc.steps).forEach((step) => {
    if (step.image) files.push(step.image);
  });
  return files.filter((item) => item.indexOf('cloud://') === 0);
}

async function handleList() {
  const res = await db
    .collection(RECIPES)
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST)
    .get();
  return res.data.map(toClient);
}

async function handleGet(event) {
  try {
    const doc = await findRecipe(normalizeText(event && event.id));
    return toClient(doc);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

async function handleMy(openid) {
  const res = await db
    .collection(RECIPES)
    .where({ authorOpenid: openid })
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST)
    .get();
  return res.data.map(toClient);
}

async function handleCreate(event, openid) {
  const draft = normalizeDraft(event && event.dish);
  const user = await getUser(openid);
  const now = Date.now();

  const doc = {
    _openid: openid,
    authorOpenid: openid,
    authorNickname: user.nickname || '微信用户',
    authorAvatar: user.avatar || '',
    name: draft.name,
    intro: draft.intro,
    cover: draft.cover,
    images: draft.images,
    steps: draft.steps,
    createdAt: now,
    updatedAt: now
  };

  const added = await db.collection(RECIPES).add({ data: doc });
  return toClient(Object.assign({ _id: added._id }, doc));
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
    steps: draft.steps,
    updatedAt: Date.now()
  };

  await db.collection(RECIPES).doc(id).update({ data: patch });
  return toClient(Object.assign({}, doc, patch));
}

async function handleRemove(event, openid) {
  const id = normalizeText(event && event.id);
  const doc = await findRecipe(id);
  assertOwner(doc, openid);

  await db.collection(RECIPES).doc(id).remove();

  // 尽力清理云存储里的图片，失败不影响删除结果
  const fileList = collectFileIds(doc);
  if (fileList.length) {
    try {
      await cloud.deleteFile({ fileList });
    } catch (err) {
      console.warn('[recipes] 清理图片失败', err);
    }
  }

  return true;
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
        return { ok: true, data: await handleList() };
      case 'get':
        return { ok: true, data: await handleGet(event) };
      case 'my':
        return { ok: true, data: await handleMy(OPENID) };
      case 'create':
        return { ok: true, data: await handleCreate(event, OPENID) };
      case 'update':
        return { ok: true, data: await handleUpdate(event, OPENID) };
      case 'remove':
        return { ok: true, data: await handleRemove(event, OPENID) };
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
