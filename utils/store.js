/**
 * 数据层门面（页面唯一的数据入口）。
 *
 * 页面只依赖本文件，不直接调用 wx.cloud，也不拼接云函数参数。
 * 真正的实现已拆到 services/：
 * - services/request.js  请求层（超时 / 重试 / 错误码）
 * - services/recipes.js  菜谱
 * - services/family.js   家人
 * - services/account.js  账号
 * - services/migrate.js  旧数据迁移
 *
 * 保留这一层是为了让现有页面无需一次性改造，同时统一 API 形态。
 */

const cloud = require('./cloud');
const local = require('./store.local');
const recipes = require('../services/recipes');
const family = require('../services/family');
const account = require('../services/account');
const migrate = require('../services/migrate');
const catUtil = require('./categories');
const logger = require('./logger');

function init() {
  // 本地示例 / 历史数据仍会初始化，但只作为「迁移来源」，不参与在线读写
  local.init();
  logger.info('store', '数据层初始化完成');
}

function getMode() {
  return 'cloud';
}

function getModeLabel() {
  return '云端模式';
}

function isCloudConfigured() {
  return cloud.isConfigured();
}

/* ------------------------------ 分类 ------------------------------ */

/** 分类字典是前后端共享的固定契约（utils/categories.js） */
function listCategories() {
  return local.listCategories();
}

function getCategory(id) {
  return catUtil.getCategory(id);
}

/* ------------------------------ 菜谱 ------------------------------ */

/** 全量列表（旧接口；分页请用 listDishPage） */
function listDishes() {
  return recipes.listAll();
}

/**
 * 分页列表
 * @param {{offset:number, limit:number, categoryId:string, keyword:string}} options
 */
function listDishPage(options) {
  return recipes.listPage(options);
}

function getDish(id) {
  return recipes.getDish(id);
}

function getMyDishes() {
  return recipes.getMyDishes();
}

function createDish(draft) {
  return recipes.createDish(draft);
}

function updateDish(id, draft) {
  return recipes.updateDish(id, draft);
}

function removeDish(id) {
  return recipes.removeDish(id);
}

function getShareImageUrl(image) {
  return recipes.getShareImageUrl(image);
}

/** 菜谱是否有增删改，列表页据此决定 onShow 时是否需要刷新 */
function isDataDirty() {
  return recipes.isDirty();
}

function clearDataDirty() {
  recipes.clearDirty();
}

/* ------------------------------ 账号 ------------------------------ */

function getCurrentUser() {
  return account.getCurrentUser();
}

function isLoggedIn() {
  return account.isLoggedIn();
}

function login(profile) {
  return account.login(profile);
}

function logout() {
  account.logout();
}

function canManageDish(dish) {
  return account.canManageDish(dish);
}

/* ------------------------------ 迁移 ------------------------------ */

function getMigrationInfo() {
  return migrate.getMigrationInfo();
}

function migrateLocalDishes() {
  return migrate.migrateLocalDishes();
}

/* ------------------------------ 家人 ------------------------------ */

const getFamilyOverview = family.getFamilyOverview;
const createFamily = family.createFamily;
const joinFamily = family.joinFamily;
const leaveFamily = family.leaveFamily;
const removeFamilyMember = family.removeFamilyMember;
const setFamilySubscribed = family.setFamilySubscribed;
const shareRecipeWithFamily = family.shareRecipeWithFamily;

module.exports = {
  init,
  getMode,
  getModeLabel,
  isCloudConfigured,
  listCategories,
  getCategory,
  listDishes,
  listDishPage,
  getDish,
  getMyDishes,
  createDish,
  updateDish,
  removeDish,
  getShareImageUrl,
  isDataDirty,
  clearDataDirty,
  getCurrentUser,
  isLoggedIn,
  login,
  logout,
  canManageDish,
  getMigrationInfo,
  migrateLocalDishes,
  getFamilyOverview,
  createFamily,
  joinFamily,
  leaveFamily,
  removeFamilyMember,
  setFamilySubscribed,
  shareRecipeWithFamily
};
