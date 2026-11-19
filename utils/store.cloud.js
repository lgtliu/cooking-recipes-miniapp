/**
 * 云端模式的数据层实现：所有读写都走云函数，
 * 作者归属与权限校验由云函数根据 openid 完成，前端不参与身份校验。
 */

const cloud = require('./cloud');
const session = require('./session');

/** 调用 recipes 云函数，把 { ok:false } 转成业务错误 */
function call(action, payload) {
  return cloud.call('recipes', Object.assign({ action }, payload || {})).then((result) => {
    if (!result || result.ok !== true) {
      const err = new Error((result && result.message) || '云端操作失败');
      err.code = (result && result.code) || 'CLOUD_ERROR';
      throw err;
    }
    return result.data;
  });
}

/** 云端登录：openid 由云函数从上下文获取，资料写入 users 集合 */
function login(profile) {
  const payload = {
    nickname: ((profile && profile.nickname) || '').trim(),
    avatar: (profile && profile.avatar) || ''
  };

  return cloud.call('login', payload).then((result) => {
    if (!result || result.ok !== true) {
      const err = new Error((result && result.message) || '登录失败');
      err.code = (result && result.code) || 'LOGIN_FAILED';
      throw err;
    }

    const data = result.data || {};
    const info = data.user || {};
    const user = {
      id: info.id || data.openid || '',
      nickname: info.nickname || payload.nickname || '微信用户',
      avatar: info.avatar || payload.avatar || '',
      loginAt: Date.now()
    };

    if (!user.id) {
      throw new Error('登录失败：未获取到用户身份');
    }
    if (!session.write(user)) {
      throw new Error('登录状态保存失败，请重试');
    }
    return user;
  });
}

function listDishes() {
  return call('list');
}

function getDish(id) {
  return call('get', { id });
}

function getMyDishes() {
  return call('my');
}

function createDish(draft) {
  return call('create', { dish: draft });
}

function updateDish(id, draft) {
  return call('update', { id, dish: draft });
}

function removeDish(id) {
  return call('remove', { id });
}

module.exports = {
  login,
  listDishes,
  getDish,
  getMyDishes,
  createDish,
  updateDish,
  removeDish
};
