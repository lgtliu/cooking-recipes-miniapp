/**
 * 数据结构归一化：无论数据来自云函数、本地存储还是旧缓存，
 * 页面拿到的菜谱字段都保证齐全且类型一致，避免各页面重复写兜底逻辑。
 */

const catUtil = require('./categories');

const MAX_INGREDIENTS = 30;
const MAX_TEXT = 20;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIngredient(item) {
  return {
    name: normalizeText(item && item.name).slice(0, MAX_TEXT),
    amount: normalizeText(item && item.amount).slice(0, MAX_TEXT)
  };
}

function normalizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeIngredient)
    .filter((item) => item.name)
    .slice(0, MAX_INGREDIENTS);
}

function normalizeStep(item) {
  return {
    text: normalizeText(item && item.text),
    image: normalizeText(item && item.image)
  };
}

function normalizeSteps(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeStep).filter((step) => step.text);
}

/**
 * 菜谱归一化：补齐缺省字段、清洗食材/步骤、按分类字典重算展示名。
 * 保留服务端额外字段（canManage 等），不做白名单裁剪。
 */
function normalizeDish(raw) {
  const dish = raw && typeof raw === 'object' ? raw : {};
  let images = Array.isArray(dish.images) ? dish.images.filter(Boolean) : [];
  if (!images.length && dish.cover) images = [dish.cover];

  const categoryId = normalizeText(dish.categoryId);

  return Object.assign({}, dish, {
    id: normalizeText(dish.id),
    name: normalizeText(dish.name),
    intro: normalizeText(dish.intro),
    cover: images[0] || normalizeText(dish.cover),
    images,
    steps: normalizeSteps(dish.steps),
    ingredients: normalizeIngredients(dish.ingredients),
    author: normalizeText(dish.author) || '匿名厨友',
    authorId: normalizeText(dish.authorId),
    authorAvatar: normalizeText(dish.authorAvatar),
    categoryId,
    categoryName: normalizeText(dish.categoryName) || catUtil.categoryName(categoryId),
    categoryIcon: normalizeText(dish.categoryIcon) || catUtil.categoryIcon(categoryId),
    createdAt: Number(dish.createdAt) || 0,
    updatedAt: Number(dish.updatedAt) || 0,
    canManage: !!dish.canManage
  });
}

function normalizeDishList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeDish);
}

module.exports = {
  normalizeText,
  normalizeIngredient,
  normalizeIngredients,
  normalizeStep,
  normalizeSteps,
  normalizeDish,
  normalizeDishList
};
