/**
 * 订阅消息（小程序端）配置。
 *
 * 这里只用于 wx.requestSubscribeMessage 申请授权，真正的发送在云函数
 * cloudfunctions/family 里完成。模板 ID 需要在两边都填写成同一个值。
 *
 * 使用前要在微信公众平台「功能 → 订阅消息」：
 * 1. 选用或申请一个「一次性订阅」模板；
 * 2. 模板内容包含三个字段：菜品名称（thing）、食材数量（number）、食材摘要（thing）；
 * 3. 把平台下发的模板 ID 填到 TEMPLATE_ID；
 * 4. 把同样的模板 ID 与字段名填到 cloudfunctions/family/config.js。
 *
 * 没有填写模板 ID 时，小程序不会调用 wx.requestSubscribeMessage，
 * 分享页会明确提示「模板未配置」，并允许复制食材清单手动发送。
 */

const TEMPLATE_ID = 'YOUR_SUBSCRIBE_TEMPLATE_ID';

function isConfigured() {
  return (
    typeof TEMPLATE_ID === 'string' &&
    !!TEMPLATE_ID &&
    TEMPLATE_ID.indexOf('YOUR_') !== 0
  );
}

/** 按字符截断，订阅消息 thing 类型字段上限 20 个字符 */
function truncate(text, max) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** 与云函数保持一致的摘要：前 3 样食材名 + 总样数，控制在 20 字以内 */
function buildSummary(ingredients) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  let text = list
    .slice(0, 3)
    .map((item) => item.name)
    .join('、');
  if (list.length > 3) text += ` 等 ${list.length} 样`;
  return truncate(text, 20);
}

/** 本地兜底 / 手动发送用的食材清单文本 */
function buildIngredientText(dish) {
  const name = (dish && dish.name) || '这道菜';
  const list = Array.isArray(dish && dish.ingredients) ? dish.ingredients : [];
  const lines = [`【${name}】食材清单`];
  if (!list.length) {
    lines.push('（还没有填写食材）');
  } else {
    list.forEach((item) => {
      lines.push(`· ${item.name}${item.amount ? ` ${item.amount}` : ''}`);
    });
    lines.push(`共 ${list.length} 样`);
  }
  lines.push('—— 来自「小杜里」');
  return lines.join('\n');
}

module.exports = {
  TEMPLATE_ID,
  isConfigured,
  truncate,
  buildSummary,
  buildIngredientText
};
