/**
 * 登录云函数：从微信上下文获取 openid，写入 / 更新 users 集合。
 * 前端传入的昵称、头像仅作为资料，不参与身份判定。
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS = 'users';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份' };
  }

  const nickname = normalizeText(event && event.nickname);
  const avatar = normalizeText(event && event.avatar);
  const now = Date.now();

  try {
    const found = await db
      .collection(USERS)
      .where({ _openid: OPENID })
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
        _openid: OPENID,
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
