/**
 * 家人服务：家庭组、邀请码、成员管理、订阅状态与菜谱分享。
 * 权限与归属全部由 family 云函数按 openid 校验，前端只传业务参数。
 */

const request = require('./request');

const FUNCTION = 'family';

function call(action, payload) {
  return request.callAction(FUNCTION, action, payload);
}

function getFamilyOverview() {
  return call('overview').then((data) => Object.assign({ supported: true }, data));
}

function createFamily(name) {
  return call('create', { name });
}

function joinFamily(inviteCode) {
  return call('join', { inviteCode });
}

function leaveFamily() {
  return call('leave');
}

function removeFamilyMember(targetOpenid) {
  return call('remove', { targetOpenid });
}

function setFamilySubscribed(subscribed) {
  return call('setSubscribed', { subscribed });
}

function shareRecipeWithFamily(recipeId, targetOpenids) {
  return call('share', { recipeId, targetOpenids });
}

module.exports = {
  getFamilyOverview,
  createFamily,
  joinFamily,
  leaveFamily,
  removeFamilyMember,
  setFamilySubscribed,
  shareRecipeWithFamily
};
