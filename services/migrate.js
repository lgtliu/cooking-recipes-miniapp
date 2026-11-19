/**
 * 旧数据迁移：把上一版本存在本机的菜谱一次性上传到云端。
 * 本地存储如今只承担这一个用途，示例数据仍由 store.local 初始化。
 */

const local = require('../utils/store.local');
const imageUtil = require('../utils/image');
const recipes = require('./recipes');
const account = require('./account');
const errors = require('../utils/errors');
const logger = require('../utils/logger');

const TAG = 'migrate';
const MIGRATED_KEY = 'cooking_migrated_ids_v1';

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
    logger.warn(TAG, '记录迁移进度失败', err);
  }
}

/** 本机还有多少条自己创建的菜谱可以迁移到云端 */
function getMigrationInfo() {
  if (!account.isLoggedIn()) {
    return { canMigrate: false, count: 0 };
  }
  const migrated = readMigratedIds();
  const count = local
    .listDishes()
    .filter((dish) => dish.authorId && migrated.indexOf(dish.id) === -1).length;
  return { canMigrate: count > 0, count };
}

/**
 * 一次性迁移，返回成功条数。
 * 图片先换成云存储 fileID；中途失败时已完成的条目不会重复上传。
 */
async function migrateLocalDishes() {
  if (!account.isLoggedIn()) {
    throw errors.create(errors.CODE.NOT_LOGGED_IN, '请先登录');
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

    await recipes.createDish({
      name: dish.name,
      intro: dish.intro,
      categoryId: dish.categoryId || '',
      images,
      steps
    });

    migrated.push(dish.id);
    writeMigratedIds(migrated);
    done += 1;
  }

  logger.info(TAG, `迁移完成 ${done} 道`);
  return done;
}

module.exports = {
  getMigrationInfo,
  migrateLocalDishes
};
