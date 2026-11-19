/**
 * 全局常量与文案：所有「魔法数字」和会重复出现的提示语集中在这里。
 * 页面与数据层只引用常量，不在各处硬编码，改一处即可全局生效。
 */

// ── 网络 ──────────────────────────────────────────
const REQUEST_TIMEOUT = 12000; // 单次云函数调用超时
const REQUEST_RETRY = 1; // 系统类错误（超时/网络）重试次数
const REQUEST_RETRY_DELAY = 400; // 重试间隔

// ── 列表分页 ──────────────────────────────────────
const PAGE_SIZE = 12; // 首屏与每次上拉加载的条数
const MAX_PAGE_SIZE = 50; // 服务端允许的单页上限

// ── 业务限制（与云函数校验保持一致）──────────────
const MAX_PHOTOS = 9;
const MAX_INGREDIENTS = 30;
const MAX_STEPS = 20;
const MAX_NAME_LENGTH = 16;
const MAX_INTRO_LENGTH = 60;

// ── 动效（与 app.wxss 中的令牌对应，供 JS 侧延时使用）──
const CATEGORY_SWITCH_DELAY = 120;
const REMOVE_ANIMATION_DELAY = 150;

// ── 通用文案 ──────────────────────────────────────
const COPY = {
  loadFailed: '加载失败，请稍后重试',
  networkFailed: '网络不太稳定，请重试',
  retry: '重试',
  loadMore: '上拉加载更多',
  loadingMore: '正在加载…',
  noMore: '已经到底啦',
  loading: '正在加载…'
};

module.exports = {
  REQUEST_TIMEOUT,
  REQUEST_RETRY,
  REQUEST_RETRY_DELAY,
  PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PHOTOS,
  MAX_INGREDIENTS,
  MAX_STEPS,
  MAX_NAME_LENGTH,
  MAX_INTRO_LENGTH,
  CATEGORY_SWITCH_DELAY,
  REMOVE_ANIMATION_DELAY,
  COPY
};
