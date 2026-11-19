/**
 * 数据层统一门面：页面只依赖本文件。
 *
 * 两种模式：
 * - cloud：已配置云开发环境且可用，数据与登录都走云函数 / 云数据库；
 * - local：云开发未配置或调用失败时自动降级，数据保存在本机（旧版本数据仍然可见）。
 *
 * 作者归属与权限判断都不在页面里做：
 * - 云端模式由云函数按 openid 校验；
 * - 本地模式由本文件比较 authorId。
 */

const cloud = require('./cloud');
const local = require('./store.local');
const cloudStore = require('./store.cloud');
const session = require('./session');
const imageUtil = require('./image');

const STORAGE_KEY = local.STORAGE_KEY;
const SESSION_KEY = session.SESSION_KEY;
const MIGRATED_KEY = 'cooking_migrated_ids_v1';

let mode = 'local';

function init() {
  // 本地示例数据始终初始化，保证本地模式下不空屏，也方便之后迁移
  local.init();
  const cloudReady = cloud.init();
  mode = cloudReady ? 'cloud' : 'local';
}

function getMode() {
  return mode;
}

function getModeLabel() {
  return mode === 'cloud' ? '云端模式' : '本地模式';
}

function isCloudConfigured() {
  return cloud.isConfigured();
}

function switchToLocal(err) {
  if (mode !== 'local') {
    console.warn('[store] 云端不可用，已切换到本地模式', err);
  }
  mode = 'local';
}

function readMigratedIds() {
  try {
    const ids = wx.getStorageSync(MIGRATED_KEY);
    return Array.isArray(ids) ? ids : [];
  } catch (err) {
    return [];
  }
}

function writeMigratedIds(ids) {
  try {
    wx.setStorageSync(MIGRATED_KEY, ids);
  } catch (err) {
    console.warn('[store] 记录迁移进度失败', err);
  }
}

/* ------------------------------ 登录态 ------------------------------ */

function getCurrentUser() {
  return session.read();
}

function isLoggedIn() {
  return !!session.read();
}

/**
 * 登录：云端模式由云函数返回 openid 并写入 users 集合；
 * 云端失败时自动降级为本地登录，保证小程序仍可用。
 */
function login(profile) {
  if (mode === 'local') {
    return Promise.resolve().then(() => local.login(profile));
  }
  return cloudStore.login(profile).catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      return local.login(profile);
    }
    throw err;
  });
}

function logout() {
  session.clear();
}

function canManageDish(dish) {
  const user = session.read();
  return !!(user && dish && dish.authorId && dish.authorId === user.id);
}

/* ------------------------------ 菜谱数据 ------------------------------ */

function listDishes() {
  if (mode === 'local') {
    return Promise.resolve(local.listDishes());
  }
  return cloudStore.listDishes().catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      return local.listDishes();
    }
    throw err;
  });
}

function getDish(id) {
  if (mode === 'local') {
    return Promise.resolve(local.getDish(id));
  }
  return cloudStore.getDish(id).catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      return local.getDish(id);
    }
    throw err;
  });
}

function getMyDishes() {
  if (mode === 'local') {
    return Promise.resolve(local.getMyDishes());
  }
  return cloudStore.getMyDishes().catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      return local.getMyDishes();
    }
    throw err;
  });
}

function createDish(draft) {
  if (mode === 'local') {
    return Promise.resolve().then(() => local.createDish(draft));
  }
  return cloudStore.createDish(draft).catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      throw new Error('云端暂不可用，已切换到本地模式，请重新提交');
    }
    throw err;
  });
}

function updateDish(id, draft) {
  if (mode === 'local') {
    return Promise.resolve().then(() => local.updateDish(id, draft));
  }
  return cloudStore.updateDish(id, draft).catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      throw new Error('云端暂不可用，已切换到本地模式，请重新打开菜谱再试');
    }
    throw err;
  });
}

function removeDish(id) {
  if (mode === 'local') {
    return Promise.resolve().then(() => local.removeDish(id));
  }
  return cloudStore.removeDish(id).catch((err) => {
    if (err && err.system) {
      switchToLocal(err);
      throw new Error('云端暂不可用，已切换到本地模式，请重新打开菜谱再试');
    }
    throw err;
  });
}

/* ------------------------------ 本地数据迁移 ------------------------------ */

/** 云端模式下，本机还有多少条自己创建的菜谱可以迁移 */
function getMigrationInfo() {
  if (mode !== 'cloud' || !session.read()) {
    return { canMigrate: false, count: 0 };
  }
  const migrated = readMigratedIds();
  const count = local
    .listDishes()
    .filter((dish) => dish.authorId && migrated.indexOf(dish.id) === -1).length;
  return { canMigrate: count > 0, count };
}

/**
 * 一次性迁移：把本机记录的用户菜谱（不含示例数据）上传到云端，
 * 归到当前登录的微信账号。图片会先上传到云存储换成 fileID。
 */
async function migrateLocalDishes() {
  if (mode !== 'cloud') {
    throw new Error('当前是本地模式，无需迁移');
  }
  if (!session.read()) {
    const err = new Error('请先登录');
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }

  const migrated = readMigratedIds();
  const targets = local
    .listDishes()
    .filter((dish) => dish.authorId && migrated.indexOf(dish.id) === -1);

  let done = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const dish = targets[i];
    const images = await imageUtil.prepareImages(dish.images, 'recipes/');
    const steps = [];
    for (let j = 0; j < dish.steps.length; j += 1) {
      const step = dish.steps[j];
      const stepImage = step.image ? await imageUtil.prepareImage(step.image, 'recipes/') : '';
      steps.push({ text: step.text, image: stepImage });
    }

    await cloudStore.createDish({
      name: dish.name,
      intro: dish.intro,
      images,
      steps
    });

    migrated.push(dish.id);
    writeMigratedIds(migrated);
    done += 1;
  }

  return done;
}

module.exports = {
  STORAGE_KEY,
  SESSION_KEY,
  init,
  getMode,
  getModeLabel,
  isCloudConfigured,
  listDishes,
  getDish,
  getMyDishes,
  createDish,
  updateDish,
  removeDish,
  getCurrentUser,
  isLoggedIn,
  login,
  logout,
  canManageDish,
  getMigrationInfo,
  migrateLocalDishes
};
