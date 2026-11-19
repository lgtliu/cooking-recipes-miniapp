/**
 * 订阅消息配置（云函数侧，需与小程序端 config/notify.js 保持一致）。
 *
 * 使用前需要在微信公众平台「功能 → 订阅消息」里：
 * 1. 选用或申请一个「一次性订阅」模板；
 * 2. 模板内容包含三个字段：菜品名称（thing）、食材数量（number）、食材摘要（thing）；
 * 3. 把平台下发的模板 ID 填到 TEMPLATE_ID；
 * 4. 把同样的模板 ID 填到小程序端 config/notify.js。
 *
 * FIELDS 的键是代码里的用途，值必须替换成模板里实际的字段名
 * （平台通常下发形如 thing1 / number2 / thing3 的字段名）。
 * 字段名与模板不一致时，微信会返回 47003，云函数会把它翻译成
 * 「模板字段不匹配，请检查订阅消息模板配置」。
 */

module.exports = {
  TEMPLATE_ID: 'YOUR_SUBSCRIBE_TEMPLATE_ID',
  FIELDS: {
    dishName: 'thing1',
    ingredientCount: 'number2',
    summary: 'thing3'
  },
  // 点击消息跳转的页面（不能带前导 /）
  DETAIL_PAGE: 'pages/detail/detail',
  // 开发/体验阶段用 developer，正式发布后改成 formal
  MINIPROGRAM_STATE: 'developer'
};
