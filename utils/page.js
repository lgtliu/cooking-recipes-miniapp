/**
 * 极简页面工厂：把「公共行为」和「页面自己的配置」合并成一个 Page 配置。
 *
 * 微信的 Page 不支持 Behavior，所以用组合函数实现同一目标：
 * - mixin.data / mixin.methods 会被合并进页面；
 * - 生命周期按 mixin → 页面 的顺序依次执行；
 * - 页面里同名的数据和方法优先，便于局部覆盖。
 */

const LIFECYCLES = [
  'onLoad',
  'onShow',
  'onReady',
  'onHide',
  'onUnload',
  'onPullDownRefresh',
  'onReachBottom',
  'onShareAppMessage'
];

/**
 * @param {object} mixin { data, methods, onLoad, ... }
 * @param {object} options 页面自己的 Page 配置
 * @returns {object} 可直接传给 Page()
 */
function composePage(mixin, options) {
  const source = mixin || {};
  const page = Object.assign({}, source.methods || {}, options || {});

  page.data = Object.assign({}, source.data || {}, (options && options.data) || {});

  LIFECYCLES.forEach((name) => {
    const before = source[name];
    const after = options && options[name];
    if (!before && !after) return;

    if (before && after) {
      page[name] = function runLifecycle(...args) {
        const first = before.apply(this, args);
        const second = after.apply(this, args);
        // 有返回值（如 onShareAppMessage）时以页面自己的为准
        return second === undefined ? first : second;
      };
      return;
    }

    page[name] = before || after;
  });

  return page;
}

module.exports = {
  composePage
};
