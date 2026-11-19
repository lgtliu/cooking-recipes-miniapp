/**
 * 登录云函数：从微信上下文获取 openid，写入 / 更新 users 集合。
 *
 * 按 CloudBase 推荐：
 * - 用户身份只认 cloud.getWXContext().OPENID，前端传参只作为资料；
 * - 云函数属于管理端，创建记录不会自动带 _openid，
 *   因此用自定义字段 openid 标识用户（_openid 由系统管理，不手动写入）。
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS = 'users';
const MAX_NICKNAME = 24;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 头像只接受云存储 fileID 或 https 地址，避免写入任意字符串 */
function normalizeAvatar(value) {
  const avatar = normalizeText(value);
  if (/^cloud:\/\//.test(avatar) || /^https:\/\//.test(avatar)) {
    return avatar;
  }
  return '';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份' };
  }

  const nickname = normalizeText(event && event.nickname).slice(0, MAX_NICKNAME);
  const avatar = normalizeAvatar(event && event.avatar);
  const now = Date.now();

  try {
    const found = await db
      .collection(USERS)
      .where({ openid: OPENID })
      .limit(1)
      .get();

    let user;

    if (found.data.length) {
      user = found.data[0];
      const patch = { updatedAt: now };
      if (nickname) patch.nickname = nickname;
      if (avatar) patch.avatar = avatar;

      await db.collection(USERS).doc(user._id).update({ data: patch });
      user = Object.assign({}, user, patch);
    } else {
      user = {
        openid: OPENID,
        nickname: nickname || '微信用户',
        avatar,
        createdAt: now,
        updatedAt: now
      };
      const added = await db.collection(USERS).add({ data: user });
      user._id = added._id;
    }

    return {
      ok: true,
      data: {
        openid: OPENID,
        user: {
          id: OPENID,
          nickname: user.nickname || '微信用户',
          avatar: user.avatar || ''
        }
      }
    };
  } catch (err) {
    console.error('[login] 登录失败', err);
    return { ok: false, code: 'SERVER_ERROR', message: '登录失败，请稍后重试' };
  }
};
