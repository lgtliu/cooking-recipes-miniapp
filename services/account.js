/**
 * 账号服务：登录态读取、登录 / 退出、菜谱归属判断。
 * 身份校验始终由云函数按 openid 完成，这里只负责本地缓存与调用编排。
 */

const request = require('./request');
const errors = require('../utils/errors');
const logger = require('../utils/logger');
const session = require('../utils/session');

const TAG = 'account';

function getCurrentUser() {
  return session.read();
}

function isLoggedIn() {
  return !!session.read();
}

/**
 * 登录：openid 由云函数从上下文获取，资料写入 users 集合。
 * @param {{nickname:string, avatar:string}} profile
 */
function login(profile) {
  const payload = {
    nickname: ((profile && profile.nickname) || '').trim(),
    avatar: (profile && profile.avatar) || ''
  };

  return request.callFunction('login', payload, { retry: 0 }).then((result) => {
    if (!result || result.ok !== true) {
      throw errors.create(
        (result && result.code) || 'LOGIN_FAILED',
        (result && result.message) || '登录失败'
      );
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
      throw errors.create('LOGIN_FAILED', '登录失败：未获取到用户身份');
    }
    if (!session.write(user)) {
      throw errors.create('LOGIN_FAILED', '登录状态保存失败，请重试');
    }
    logger.info(TAG, '登录成功');
    return user;
  });
}

function logout() {
  session.clear();
}

/** 只有作者本人可以编辑 / 删除；云端还会再校验一次 openid */
function canManageDish(dish) {
  const user = session.read();
  return !!(user && dish && dish.authorId && dish.authorId === user.id);
}

module.exports = {
  getCurrentUser,
  isLoggedIn,
  login,
  logout,
  canManageDish
};
