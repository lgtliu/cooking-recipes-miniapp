/**
 * 菜谱服务：对外只暴露业务语义（列表 / 分页 / 详情 / 增删改），
 * 内部负责调用请求层、归一化数据，并在服务端尚未支持分页时自动降级。
 */

const request = require('./request');
const errors = require('../utils/errors');
const logger = require('../utils/logger');
const normalize = require('../utils/normalize');
const { PAGE_SIZE } = require('../config/constants');

const TAG = 'recipes';
const FUNCTION = 'recipes';

/**
 * 服务端是否支持 page 动作。
 * null=未知，首次调用后确定；false 时改走「一次取全量 + 客户端窗口化」。
 */
let pagingSupported = null;
let legacyCache = null;
// 有增删改时置位，列表页在 onShow 时按需刷新，避免每次切回都重新请求
let dirty = false;

function invalidateCache() {
  legacyCache = null;
  dirty = true;
}

function isDirty() {
  return dirty;
}

function clearDirty() {
  dirty = false;
}

/* ------------------------------ 查询 ------------------------------ */

function listAll() {
  return request
    .callAction(FUNCTION, 'list')
    .then((list) => {
      const dishes = normalize.normalizeDishList(list);
      legacyCache = dishes;
      return dishes;
    });
}

function getDish(id) {
  return request
    .callAction(FUNCTION, 'get', { id })
    .then((dish) => (dish ? normalize.normalizeDish(dish) : null));
}

function getMyDishes() {
  return request
    .callAction(FUNCTION, 'my')
    .then((list) => normalize.normalizeDishList(list));
}

/** 按分类 / 关键词过滤，仅在客户端降级路径中使用 */
function applyFilter(list, categoryId, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  const cat = typeof categoryId === 'string' ? categoryId.trim() : '';
  return list.filter((dish) => {
    if (cat && cat !== 'all' && dish.categoryId !== cat) return false;
    if (kw && dish.name.toLowerCase().indexOf(kw) === -1) return false;
    return true;
  });
}

function countSteps(list) {
  return list.reduce((sum, dish) => sum + (dish.steps || []).length, 0);
}

/** 服务端不支持分页时的降级：取一次全量，在本地切片 */
async function legacyPage(options) {
  if (!legacyCache) {
    await listAll();
  }
  const filtered = applyFilter(legacyCache || [], options.categoryId, options.keyword);
  const offset = options.offset || 0;
  const limit = options.limit || PAGE_SIZE;
  const items = filtered.slice(offset, offset + limit);
  return {
    items,
    hasMore: offset + items.length < filtered.length,
    total: filtered.length,
    totalSteps: countSteps(filtered),
    paged: false
  };
}

/**
 * 分页列表。
 * @param {object} options { offset, limit, categoryId, keyword }
 * @returns {Promise<{items:Array, hasMore:boolean, total:number, totalSteps:number}>}
 */
async function listPage(options) {
  const opts = Object.assign({ offset: 0, limit: PAGE_SIZE }, options || {});

  if (pagingSupported === false) {
    return legacyPage(opts);
  }

  try {
    const data = await request.callAction(FUNCTION, 'page', {
      offset: opts.offset,
      limit: opts.limit,
      categoryId: opts.categoryId || '',
      keyword: opts.keyword || ''
    });
    pagingSupported = true;

    const items = normalize.normalizeDishList((data && data.items) || []);
    const total =
      data && typeof data.total === 'number' ? data.total : opts.offset + items.length;

    return {
      items,
      hasMore: !!(data && data.hasMore),
      total,
      // 非首页不重复计算步数，沿用调用方已有的统计
      totalSteps: data && typeof data.totalSteps === 'number' ? data.totalSteps : null,
      paged: true
    };
  } catch (err) {
    if (err && err.code === errors.CODE.UNKNOWN_ACTION) {
      // 云函数还没部署新版本：降级到旧接口，功能不受影响
      pagingSupported = false;
      logger.warn(TAG, '云端未支持 page 动作，降级为全量列表');
      return legacyPage(opts);
    }
    throw err;
  }
}

/* ------------------------------ 写入 ------------------------------ */

function createDish(draft) {
  return request
    .callAction(FUNCTION, 'create', { dish: draft })
    .then((dish) => {
      invalidateCache();
      return normalize.normalizeDish(dish);
    });
}

function updateDish(id, draft) {
  return request
    .callAction(FUNCTION, 'update', { id, dish: draft })
    .then((dish) => {
      invalidateCache();
      return normalize.normalizeDish(dish);
    });
}

function removeDish(id) {
  return request.callAction(FUNCTION, 'remove', { id }).then((result) => {
    invalidateCache();
    return result;
  });
}

/* ------------------------------ 分享图 ------------------------------ */

/**
 * 转发卡片缩略图：cloud:// 文件 ID 不能直接用作 imageUrl，需要换 https 链接。
 * 其它形式（包内资源 / 远程链接）原样返回。
 */
async function getShareImageUrl(image) {
  if (!image) return '';
  if (/^https?:\/\//.test(image)) return image;
  if (image.indexOf('cloud://') !== 0) return image;
  return request.getTempFileURL(image);
}

module.exports = {
  listAll,
  listPage,
  getDish,
  getMyDishes,
  createDish,
  updateDish,
  removeDish,
  getShareImageUrl,
  invalidateCache,
  isDirty,
  clearDirty
};
