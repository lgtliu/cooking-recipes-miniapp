/**
 * 登录态本地缓存：云端登录成功后在本地留一份用户信息，
 * 让重开小程序时能立刻判断「已登录」，不用等云函数返回。
 * 真正的身份校验始终在云函数里按 openid 完成。
 */

const SESSION_KEY = 'cooking_user_v1';

function read() {
  try {
    const user = wx.getStorageSync(SESSION_KEY);
    if (user && typeof user === 'object' && user.id && user.nickname) {
      return {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar || '',
        loginAt: user.loginAt || 0
      };
    }
    return null;
  } catch (err) {
    console.error('[session] 读取登录状态失败', err);
    return null;
  }
}

function write(user) {
  try {
    wx.setStorageSync(SESSION_KEY, user);
    return true;
  } catch (err) {
    console.error('[session] 保存登录状态失败', err);
    return false;
  }
}

function clear() {
  try {
    wx.removeStorageSync(SESSION_KEY);
  } catch (err) {
    console.error('[session] 清除登录状态失败', err);
  }
}

module.exports = {
  SESSION_KEY,
  read,
  write,
  clear
};
