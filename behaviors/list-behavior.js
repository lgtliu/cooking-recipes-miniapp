/**
 * 列表页公共行为：加载态 / 空态 / 错误态、下拉刷新、上拉加载、分页游标。
 *
 * 页面只需要实现：
 * - fetchPage({ offset, limit, reset }) -> { items, hasMore, total, totalSteps }
 * - mapItems(items, { append })  可选，做展示字段加工
 * - onListReset(items, meta)     可选，首屏 / 刷新 / 筛选变化后重新渲染
 * - onListAppend(items, meta)    可选，追加下一页（应做增量 setData）
 *
 * 页面自己不用再写 onPullDownRefresh / onReachBottom，也不会重复发请求。
 */

const { PAGE_SIZE, COPY } = require('../config/constants');
const errors = require('../utils/errors');

function sumSteps(items) {
  return (items || []).reduce((sum, item) => sum + ((item.steps || []).length), 0);
}

module.exports = {
  data: {
    loading: true,
    loadingMore: false,
    hasMore: false,
    loadError: '',
    total: 0,
    totalSteps: 0,
    loadedCount: 0,
    copy: COPY
  },

  methods: {
    /** 首屏 / 刷新 / 筛选变化：从第一页重新加载 */
    async loadListFirst() {
      // 请求令牌：连续切分类时只认最后一次请求的结果
      const token = (this._listToken || 0) + 1;
      this._listToken = token;
      this._offset = 0;
      this.setData({ loading: true, loadingMore: false, loadError: '' });

      try {
        const res = await this.fetchPage({
          offset: 0,
          limit: PAGE_SIZE,
          reset: true
        });
        if (token !== this._listToken) return;

        const raw = res.items || [];
        const items = this.mapItems ? this.mapItems(raw, { append: false }) : raw;

        this._offset = raw.length;
        this.setData({
          loading: false,
          hasMore: !!res.hasMore,
          total: typeof res.total === 'number' ? res.total : raw.length,
          totalSteps:
            typeof res.totalSteps === 'number' && res.totalSteps !== null
              ? res.totalSteps
              : sumSteps(raw),
          loadedCount: this._offset
        });

        if (this.onListReset) this.onListReset(items, res);
      } catch (err) {
        if (token !== this._listToken) return;

        this._offset = 0;
        this.setData({
          loading: false,
          hasMore: false,
          total: 0,
          totalSteps: 0,
          loadedCount: 0,
          loadError: errors.toUserMessage(err, COPY.loadFailed)
        });
        if (this.onListReset) this.onListReset([], {});
        if (this.onListError) this.onListError(err);
      }
    },

    /** 上拉加载下一页 */
    async loadListMore() {
      if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
      const token = this._listToken;
      this.setData({ loadingMore: true });

      try {
        const res = await this.fetchPage({
          offset: this._offset,
          limit: PAGE_SIZE
        });
        // 期间发生过刷新/切换，丢弃这一页
        if (token !== this._listToken) return;

        const raw = res.items || [];
        const items = this.mapItems ? this.mapItems(raw, { append: true }) : raw;

        this._offset += raw.length;
        this.setData({
          loadingMore: false,
          hasMore: !!res.hasMore,
          loadedCount: this._offset,
          // 首页统计可能来自服务端，兜底用累加值
          total: Math.max(this.data.total, this._offset)
        });

        if (this.onListAppend) this.onListAppend(items, res);
      } catch (err) {
        if (token !== this._listToken) return;

        this.setData({ loadingMore: false });
        wx.showToast({
          title: errors.toUserMessage(err, COPY.loadFailed),
          icon: 'none'
        });
      }
    },

    /** 下拉刷新：清空后重新取第一页 */
    async refreshList(fromPull) {
      try {
        await this.loadListFirst();
      } finally {
        if (fromPull) wx.stopPullDownRefresh();
      }
    },

    /** 错误态的「重试」入口 */
    reloadList() {
      this.loadListFirst();
    }
  },

  onLoad() {
    this.loadListFirst();
  },

  onPullDownRefresh() {
    this.refreshList(true);
  },

  onReachBottom() {
    this.loadListMore();
  }
};
