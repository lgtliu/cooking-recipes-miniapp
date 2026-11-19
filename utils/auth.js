/**
 * 登录相关的页面跳转封装，避免各页面重复写同一段引导逻辑。
 * 是否登录、是否能管理菜谱等判断统一由 utils/store.js 提供。
 */

const store = require('./store');

function openLogin(redirect) {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
  wx.navigateTo({
    url: `/pages/login/login${query}`
  });
}

/** 已登录返回 true；未登录则跳转登录页并返回 false */
function requireLogin(redirect) {
  if (store.isLoggedIn()) return true;
  openLogin(redirect);
  return false;
}

/** 统一的「记一道菜」入口：游客先登录，登录成功后由登录页续跳到发布页 */
function openCreate() {
  if (!requireLogin('create')) return false;
  wx.navigateTo({
    url: '/pages/create/create'
  });
  return true;
}

module.exports = {
  openLogin,
  requireLogin,
  openCreate
};
