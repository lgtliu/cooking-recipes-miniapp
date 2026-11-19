/**
 * 家人云函数：家庭组、邀请码、成员管理与订阅消息推送。
 *
 * 身份与权限：
 * - 操作发起人的 openid 只认 cloud.getWXContext().OPENID；
 * - 前端只传邀请码、菜谱 id 和「要发给谁」的成员 openid，不能通过传参伪造身份；
 * - 分享前会校验发起人与目标成员属于同一个家庭。
 *
 * 返回约定：{ ok: true, data } 或 { ok: false, code, message }。
 */

const cloud = require('wx-server-sdk');
const config = require('./config');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const FAMILIES = 'families';
const MEMBERS = 'family_members';
const RECIPES = 'recipes';
const USERS = 'users';

const MAX_FAMILY_NAME = 16;
const MAX_MEMBERS = 20;
const MAX_INGREDIENTS_TEXT = 20;
const MAX_TARGETS = 20;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_LENGTH = 6;
const TEMP_URL_MAX_AGE = 7200;

const CLIENT_ERROR_CODES = [
  'INVALID',
  'NOT_FOUND',
  'FORBIDDEN',
  'ALREADY_IN_FAMILY',
  'INVALID_CODE',
  'FAMILY_FULL',
  'NO_FAMILY',
  'OWNER_CANNOT_LEAVE',
  'EMPTY_TARGETS',
  'NO_TEMPLATE',
  'NO_INGREDIENTS'
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function businessError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isCollectionMissing(err) {
  const text = `${(err && err.errMsg) || ''} ${(err && err.message) || ''} ${(err && err.code) || ''}`;
  return /not exist|not_exist|-502005|ResourceNotFound|DATABASE_COLLECTION_NOT_EXIST/i.test(text);
}

function isTemplateConfigured() {
  const id = config.TEMPLATE_ID;
  return typeof id === 'string' && !!id && id.indexOf('YOUR_') !== 0;
}

function normalizeIngredients(list) {
  return Array.isArray(list)
    ? list
        .map((item) => ({
          name: normalizeText(item && item.name),
          amount: normalizeText(item && item.amount)
        }))
        .filter((item) => item.name)
    : [];
}

function truncate(text, max) {
  const value = normalizeText(text);
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildSummary(ingredients) {
  let text = ingredients
    .slice(0, 3)
    .map((item) => item.name)
    .join('、');
  if (ingredients.length > 3) text += ` 等 ${ingredients.length} 样`;
  return truncate(text, MAX_INGREDIENTS_TEXT);
}

function randomCode() {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

async function generateInviteCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode();
    const found = await db.collection(FAMILIES).where({ inviteCode: code }).limit(1).get();
    if (!found.data.length) return code;
  }
  throw businessError('SERVER_ERROR', '邀请码生成失败，请重试');
}

/** 集合不存在时尝试创建；已存在或没有创建权限时忽略，后续写入会给出明确提示 */
async function ensureCollections() {
  if (typeof db.createCollection !== 'function') return;
  const names = [FAMILIES, MEMBERS];
  for (let i = 0; i < names.length; i += 1) {
    try {
      await db.createCollection(names[i]);
    } catch (err) {
      // 集合已存在属于正常情况
    }
  }
}

async function getUser(openid) {
  try {
    const res = await db.collection(USERS).where({ openid }).limit(1).get();
    return res.data[0] || {};
  } catch (err) {
    console.warn('[family] 读取用户资料失败', err);
    return {};
  }
}

async function getMembership(openid) {
  try {
    const res = await db.collection(MEMBERS).where({ openid }).limit(1).get();
    return res.data[0] || null;
  } catch (err) {
    if (isCollectionMissing(err)) return null;
    throw err;
  }
}

async function getFamilyById(id) {
  try {
    const res = await db.collection(FAMILIES).doc(id).get();
    return res.data;
  } catch (err) {
    return null;
  }
}

async function findRecipe(id) {
  if (!id) throw businessError('NOT_FOUND', '菜谱不存在或已被删除');
  try {
    const res = await db.collection(RECIPES).doc(id).get();
    return res.data;
  } catch (err) {
    throw businessError('NOT_FOUND', '菜谱不存在或已被删除');
  }
}

function toMember(doc, openid) {
  return {
    openid: doc.openid,
    nickname: doc.nickname || '微信用户',
    avatar: doc.avatar || '',
    role: doc.role === 'owner' ? 'owner' : 'member',
    subscribed: !!doc.subscribed,
    isSelf: doc.openid === openid,
    joinedAt: doc.joinedAt || 0
  };
}

/** 成员头像可能是私有云存储 fileID，签名成 https 临时链接后其他成员才能显示 */
async function withSignedAvatars(members) {
  const ids = members
    .map((member) => member.avatar)
    .filter((avatar) => typeof avatar === 'string' && avatar.indexOf('cloud://') === 0);
  if (!ids.length) return members;

  const signed = {};
  try {
    const res = await cloud.getTempFileURL({
      fileList: Array.from(new Set(ids)).map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE }))
    });
    (res.fileList || []).forEach((item) => {
      if (item.status === 0 && item.tempFileURL) {
        signed[item.fileID] = item.tempFileURL;
      }
    });
  } catch (err) {
    console.warn('[family] 生成头像临时链接失败', err);
    return members;
  }

  return members.map((member) =>
    signed[member.avatar] ? Object.assign({}, member, { avatar: signed[member.avatar] }) : member
  );
}

async function handleOverview(openid) {
  const templateConfigured = isTemplateConfigured();
  const member = await getMembership(openid);
  if (!member) {
    return { family: null, isOwner: false, members: [], templateConfigured };
  }

  const family = await getFamilyById(member.familyId);
  if (!family) {
    return { family: null, isOwner: false, members: [], templateConfigured };
  }

  let docs = [];
  try {
    const res = await db
      .collection(MEMBERS)
      .where({ familyId: member.familyId })
      .orderBy('joinedAt', 'asc')
      .limit(MAX_MEMBERS)
      .get();
    docs = res.data;
  } catch (err) {
    if (!isCollectionMissing(err)) throw err;
  }

  const members = await withSignedAvatars(docs.map((doc) => toMember(doc, openid)));

  return {
    family: {
      id: family._id,
      name: family.name || '我的家庭',
      inviteCode: family.inviteCode || '',
      createdAt: family.createdAt || 0
    },
    isOwner: family.ownerOpenid === openid,
    members,
    templateConfigured
  };
}

async function handleCreate(event, openid) {
  await ensureCollections();

  const existing = await getMembership(openid);
  if (existing) {
    throw businessError('ALREADY_IN_FAMILY', '你已经在一个家庭里了，先退出才能创建新家庭');
  }

  const user = await getUser(openid);
  const rawName = normalizeText(event && event.name);
  const name = (rawName || `${user.nickname || '我'}的家`).slice(0, MAX_FAMILY_NAME);
  const inviteCode = await generateInviteCode();
  const now = Date.now();

  const added = await db.collection(FAMILIES).add({
    data: {
      ownerOpenid: openid,
      name,
      inviteCode,
      createdAt: now,
      updatedAt: now
    }
  });

  try {
    await db.collection(MEMBERS).add({
      data: {
        familyId: added._id,
        openid,
        nickname: user.nickname || '微信用户',
        avatar: user.avatar || '',
        role: 'owner',
        subscribed: false,
        subscribedAt: 0,
        joinedAt: now,
        updatedAt: now
      }
    });
  } catch (err) {
    // 成员写入失败时回滚，避免留下没有创建者的空家庭
    try {
      await db.collection(FAMILIES).doc(added._id).remove();
    } catch (cleanupErr) {
      console.warn('[family] 回滚家庭失败', cleanupErr);
    }
    throw err;
  }

  return handleOverview(openid);
}

async function handleJoin(event, openid) {
  await ensureCollections();

  const code = normalizeText(event && event.inviteCode).toUpperCase();
  if (!code) throw businessError('INVALID_CODE', '请输入邀请码');

  const existing = await getMembership(openid);
  if (existing) {
    throw businessError('ALREADY_IN_FAMILY', '你已经在一个家庭里了，先退出再加入新的家庭');
  }

  const found = await db.collection(FAMILIES).where({ inviteCode: code }).limit(1).get();
  const family = found.data[0];
  if (!family) throw businessError('INVALID_CODE', '邀请码不存在或已失效');
  if (family.ownerOpenid === openid) {
    throw businessError('ALREADY_IN_FAMILY', '这是你自己创建的家庭');
  }

  const countRes = await db.collection(MEMBERS).where({ familyId: family._id }).count();
  if (countRes.total >= MAX_MEMBERS) {
    throw businessError('FAMILY_FULL', `一个家庭最多 ${MAX_MEMBERS} 位成员`);
  }

  const user = await getUser(openid);
  const now = Date.now();
  await db.collection(MEMBERS).add({
    data: {
      familyId: family._id,
      openid,
      nickname: user.nickname || '微信用户',
      avatar: user.avatar || '',
      role: 'member',
      subscribed: false,
      subscribedAt: 0,
      joinedAt: now,
      updatedAt: now
    }
  });

  return { familyId: family._id, name: family.name || '我的家庭' };
}

async function handleLeave(openid) {
  const member = await getMembership(openid);
  if (!member) throw businessError('NO_FAMILY', '你还没有加入家庭');

  const family = await getFamilyById(member.familyId);
  if (family && family.ownerOpenid === openid) {
    throw businessError('OWNER_CANNOT_LEAVE', '创建者不能退出家庭，可以先移除所有成员');
  }

  await db.collection(MEMBERS).doc(member._id).remove();
  return true;
}

async function handleRemove(event, openid) {
  const target = normalizeText(event && event.targetOpenid);
  if (!target) throw businessError('INVALID', '缺少要移除的成员');
  if (target === openid) throw businessError('INVALID', '不能移除自己');

  const member = await getMembership(openid);
  if (!member || member.role !== 'owner') {
    throw businessError('FORBIDDEN', '只有创建者可以移除成员');
  }

  const found = await db
    .collection(MEMBERS)
    .where({ familyId: member.familyId, openid: target })
    .limit(1)
    .get();
  const targetDoc = found.data[0];
  if (!targetDoc) throw businessError('NOT_FOUND', '这位家人不在你的家庭里');
  if (targetDoc.role === 'owner') throw businessError('FORBIDDEN', '不能移除创建者');

  await db.collection(MEMBERS).doc(targetDoc._id).remove();
  return true;
}

async function handleSetSubscribed(event, openid) {
  const member = await getMembership(openid);
  if (!member) throw businessError('NO_FAMILY', '你还没有加入家庭');

  const subscribed = !!(event && event.subscribed);
  await db
    .collection(MEMBERS)
    .doc(member._id)
    .update({
      data: {
        subscribed,
        subscribedAt: subscribed ? Date.now() : 0,
        updatedAt: Date.now()
      }
    });

  return { subscribed };
}

function mapSendError(err) {
  const errCode = Number((err && (err.errCode || err.code)) || 0);
  switch (errCode) {
    case 43101:
      return { code: 'NOT_SUBSCRIBED', message: '对方没有开启提醒（或授权已用完）' };
    case 40003:
      return { code: 'INVALID_OPENID', message: '用户身份无效' };
    case 47003:
      return { code: 'TEMPLATE_MISMATCH', message: '模板字段不匹配，请检查订阅消息模板配置' };
    case 41030:
      return { code: 'PAGE_INVALID', message: '跳转页面不存在，请检查详情页路径' };
    case 45009:
      return { code: 'RATE_LIMITED', message: '发送太频繁，请稍后再试' };
    default:
      return { code: 'SEND_FAILED', message: '发送失败，请稍后重试' };
  }
}

async function handleShare(event, openid) {
  const recipeId = normalizeText(event && event.recipeId);
  const rawTargets = Array.isArray(event && event.targetOpenids) ? event.targetOpenids : [];
  const targets = Array.from(new Set(rawTargets.map(normalizeText).filter(Boolean))).slice(
    0,
    MAX_TARGETS
  );
  if (!targets.length) throw businessError('EMPTY_TARGETS', '请先选择要分享的家人');

  const member = await getMembership(openid);
  if (!member) throw businessError('NO_FAMILY', '先创建或加入家庭才能分享给家人');

  const found = await db
    .collection(MEMBERS)
    .where({ familyId: member.familyId, openid: _.in(targets) })
    .limit(MAX_TARGETS)
    .get();
  const allowed = found.data.filter((doc) => doc.openid !== openid);
  if (!allowed.length) throw businessError('FORBIDDEN', '只能分享给同一个家庭的成员');

  const recipe = await findRecipe(recipeId);
  const ingredients = normalizeIngredients(recipe.ingredients);
  if (!ingredients.length) {
    throw businessError('NO_INGREDIENTS', '这道菜还没有食材清单，先补充食材再分享');
  }
  if (!isTemplateConfigured()) {
    throw businessError('NO_TEMPLATE', '订阅消息模板还没配置，无法推送');
  }

  const dishName = truncate(recipe.name || '一道家常菜', MAX_INGREDIENTS_TEXT);
  const summary = buildSummary(ingredients);
  const page = `${config.DETAIL_PAGE}?id=${encodeURIComponent(recipeId)}`;

  const messageData = {};
  messageData[config.FIELDS.dishName] = { value: dishName };
  messageData[config.FIELDS.ingredientCount] = { value: String(ingredients.length) };
  messageData[config.FIELDS.summary] = { value: summary };

  const results = [];
  for (let i = 0; i < allowed.length; i += 1) {
    const target = allowed[i];
    const item = {
      openid: target.openid,
      nickname: target.nickname || '家人',
      ok: false,
      code: '',
      message: ''
    };

    try {
      await cloud.openapi.subscribeMessage.send({
        touser: target.openid,
        templateId: config.TEMPLATE_ID,
        page,
        miniprogramState: config.MINIPROGRAM_STATE || 'developer',
        lang: 'zh_CN',
        data: messageData
      });
      item.ok = true;
      item.message = '已发送';
      await db
        .collection(MEMBERS)
        .doc(target._id)
        .update({ data: { lastNotifiedAt: Date.now() } });
    } catch (err) {
      const mapped = mapSendError(err);
      item.code = mapped.code;
      item.message = mapped.message;
      console.warn('[family] 订阅消息发送失败', target.openid, err && err.errCode, err && err.errMsg);

      // 43101 表示用户没有授权或授权已用完，回写状态，界面上能看到谁需要重新授权
      if (mapped.code === 'NOT_SUBSCRIBED') {
        try {
          await db
            .collection(MEMBERS)
            .doc(target._id)
            .update({ data: { subscribed: false, subscribedAt: 0, updatedAt: Date.now() } });
        } catch (updateErr) {
          console.warn('[family] 回写订阅状态失败', updateErr);
        }
      }
    }

    results.push(item);
  }

  return {
    dishName,
    ingredientCount: ingredients.length,
    summary,
    results
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = normalizeText(event && event.action);

  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份' };
  }

  try {
    switch (action) {
      case 'overview':
        return { ok: true, data: await handleOverview(OPENID) };
      case 'create':
        return { ok: true, data: await handleCreate(event, OPENID) };
      case 'join':
        return { ok: true, data: await handleJoin(event, OPENID) };
      case 'leave':
        return { ok: true, data: await handleLeave(OPENID) };
      case 'remove':
        return { ok: true, data: await handleRemove(event, OPENID) };
      case 'setSubscribed':
        return { ok: true, data: await handleSetSubscribed(event, OPENID) };
      case 'share':
        return { ok: true, data: await handleShare(event, OPENID) };
      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: '未知操作' };
    }
  } catch (err) {
    if (err && CLIENT_ERROR_CODES.indexOf(err.code) !== -1) {
      return { ok: false, code: err.code, message: err.message };
    }
    if (isCollectionMissing(err)) {
      return {
        ok: false,
        code: 'NO_COLLECTION',
        message: '数据库集合还没创建，请在云开发控制台创建 families 与 family_members 集合'
      };
    }
    console.error('[family] 处理失败', action, err);
    return { ok: false, code: 'SERVER_ERROR', message: '云端处理失败，请稍后重试' };
  }
};
