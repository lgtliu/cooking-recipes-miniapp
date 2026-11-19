/**
 * 菜谱分类字典与映射工具（纯函数，无 wx / 云依赖）。
 *
 * 分类的「可维护数据源」是云端 categories 表，客户端通过 store.listCategories()
 * 拉取。本文件提供一份兜底分类（云端不可用时使用），以及把分类 id 映射成
 * 展示用的名称 / 图标、按分类过滤菜谱等纯函数，供各数据层和页面共用。
 *
 * 设计要点：
 * - 老菜谱没有 category_id（空字符串 / null / 未命中字典）：统一归入「未分类」，
 *   保证历史数据在列表、筛选、详情页都不报错，也能被正常浏览。
 * - 分类 id 用稳定的英文 key（home / meat / ...），不存中文名；改名不影响数据。
 */

// 云端不可用或分类表为空时的兜底字典；结构与 categories 表字段一致。
const FALLBACK_CATEGORIES = [
  { id: 'home', name: '家常菜', icon: '🏠', sortOrder: 10 },
  { id: 'meat', name: '肉菜硬菜', icon: '🥩', sortOrder: 20 },
  { id: 'seafood', name: '海鲜水产', icon: '🐟', sortOrder: 30 },
  { id: 'veggie', name: '清爽素菜', icon: '🥬', sortOrder: 40 },
  { id: 'soup', name: '汤羹炖品', icon: '🍲', sortOrder: 50 },
  { id: 'staple', name: '主食面点', icon: '🍚', sortOrder: 60 },
  { id: 'dessert', name: '甜品小食', icon: '🍰', sortOrder: 70 },
  { id: 'other', name: '其他', icon: '🍽️', sortOrder: 80 }
];

// 「未分类」不是一个可写入的分类，只是历史数据 / 空值的展示归组。
const UNCATEGORIZED = { id: '', name: '未分类', icon: '🍳', sortOrder: 9999 };

/** 把云端行 / 任意来源标准化为 { id, name, icon, sortOrder } */
function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  const icon = typeof raw.icon === 'string' ? raw.icon.trim() : '';
  const sortOrder = Number(raw.sort_order !== undefined ? raw.sort_order : raw.sortOrder);
  return {
    id,
    name,
    icon: icon || '🍽️',
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 9999
  };
}

/**
 * 归一化分类列表：去重、过滤无效项、按 sortOrder 排序。
 * 传入空数组 / null 时返回兜底字典，保证页面永远有分类可选。
 */
function normalizeCategoryList(list) {
  const seen = Object.create(null);
  const items = [];
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const item = normalizeCategory(raw);
    if (!item || seen[item.id]) return;
    seen[item.id] = true;
    items.push(item);
  });
  if (!items.length) return FALLBACK_CATEGORIES.map((item) => Object.assign({}, item));
  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 校验分类 id 是否在当前字典内；空 id 视为「未分类」，合法。 */
function isValidCategoryId(id, categories) {
  if (!id) return true;
  const list = Array.isArray(categories) && categories.length ? categories : FALLBACK_CATEGORIES;
  return list.some((item) => item.id === id);
}

/** 分类 id -> { id, name, icon }；未命中一律返回「未分类」。 */
function getCategory(id, categories) {
  const list = Array.isArray(categories) && categories.length ? categories : FALLBACK_CATEGORIES;
  const key = typeof id === 'string' ? id.trim() : '';
  if (key) {
    const found = list.find((item) => item.id === key);
    if (found) return found;
  }
  return UNCATEGORIZED;
}

/** 分类 id -> 展示名 */
function categoryName(id, categories) {
  return getCategory(id, categories).name;
}

/** 分类 id -> 展示图标 */
function categoryIcon(id, categories) {
  return getCategory(id, categories).icon;
}

/**
 * 判断菜谱是否命中分类筛选。
 * filterId 为空 / 'all' 表示「全部」，命中所有；未分类菜谱只会被「全部」命中。
 */
function dishMatchesCategory(dish, filterId) {
  const key = typeof filterId === 'string' ? filterId.trim() : '';
  if (!key || key === 'all') return true;
  const categoryId = dish && typeof dish.categoryId === 'string' ? dish.categoryId.trim() : '';
  return categoryId === key;
}

module.exports = {
  FALLBACK_CATEGORIES,
  UNCATEGORIZED,
  normalizeCategory,
  normalizeCategoryList,
  isValidCategoryId,
  getCategory,
  categoryName,
  categoryIcon,
  dishMatchesCategory
};
