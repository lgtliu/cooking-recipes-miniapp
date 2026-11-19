const store = require('../../utils/store');
const format = require('../../utils/format');
const auth = require('../../utils/auth');
const { composePage } = require('../../utils/page');
const listBehavior = require('../../behaviors/list-behavior');

const CARD_HEIGHTS = [330, 370, 410];
const SEARCH_DEBOUNCE = 260;

/** 用 id 生成稳定的卡片高度，避免每次刷新瀑布流跳动 */
function cardHeight(id) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return CARD_HEIGHTS[hash % CARD_HEIGHTS.length];
}

Page(
  composePage(listBehavior, {
    data: {
      keyword: '',
      categories: [],
      activeCategory: 'all',
      switching: false,
      user: null,
      mode: 'local',
      leftColumn: [],
      rightColumn: []
    },

    onLoad() {
      this._firstShow = true;
      this.loadCategories();
    },

    onShow() {
      this.setData({
        user: store.getCurrentUser(),
        mode: store.getMode()
      });

      // 首屏由 list-behavior 的 onLoad 负责；之后只在数据被改过时刷新
      if (this._firstShow) {
        this._firstShow = false;
        return;
      }
      if (store.isDataDirty()) {
        store.clearDataDirty();
        this.loadListFirst();
      }
    },

    onUnload() {
      clearTimeout(this._searchTimer);
    },

    async loadCategories() {
      const list = await store.listCategories();
      this.setData({ categories: list });
    },

    /** 供 list-behavior 调用：分类与关键词都交给服务端分页查询 */
    fetchPage({ offset, limit }) {
      return store.listDishPage({
        offset,
        limit,
        categoryId: this.data.activeCategory,
        keyword: this.data.keyword
      });
    },

    mapItems(items) {
      return items.map((dish) =>
        Object.assign({}, dish, {
          timeText: format.formatTimeAgo(dish.createdAt),
          cardHeight: cardHeight(dish.id)
        })
      );
    },

    /** 首屏 / 筛选变化：整列重建，按列内序号做错峰入场 */
    onListReset(items) {
      const left = [];
      const right = [];
      items.forEach((dish, index) => {
        if (index % 2 === 0) {
          left.push(Object.assign({}, dish, { delay: 60 + left.length * 45 }));
        } else {
          right.push(Object.assign({}, dish, { delay: 80 + right.length * 45 }));
        }
      });
      this.setData({
        leftColumn: left,
        rightColumn: right,
        switching: false
      });
    },

    /** 上拉加载：只把新卡片按路径写进两列，不重发已有列表 */
    onListAppend(items) {
      let leftLength = this.data.leftColumn.length;
      let rightLength = this.data.rightColumn.length;
      const start = leftLength + rightLength;
      const patch = {};

      items.forEach((dish, index) => {
        const item = Object.assign({}, dish, { delay: 0 });
        if ((start + index) % 2 === 0) {
          patch[`leftColumn[${leftLength}]`] = item;
          leftLength += 1;
        } else {
          patch[`rightColumn[${rightLength}]`] = item;
          rightLength += 1;
        }
      });

      this.setData(patch);
    },

    onSearchInput(event) {
      const keyword = event.detail.value || '';
      this.setData({ keyword });
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.loadListFirst(), SEARCH_DEBOUNCE);
    },

    onSearchConfirm() {
      wx.hideKeyboard();
    },

    clearSearch() {
      clearTimeout(this._searchTimer);
      this.setData({ keyword: '' });
      this.loadListFirst();
    },

    /** 点击分类筛选条；重复点当前分类回到「全部」。 */
    onCategoryTap(event) {
      const id = event.currentTarget.dataset.id || 'all';
      const activeCategory = id === this.data.activeCategory ? 'all' : id;
      if (activeCategory === this.data.activeCategory) return;

      this.setData({ activeCategory, switching: true });
      this.loadListFirst();
    },

    /** 空状态里的主按钮：按当前筛选条件给出下一步动作 */
    onEmptyAction() {
      if (this.data.keyword) {
        this.clearSearch();
        return;
      }
      if (this.data.activeCategory !== 'all') {
        this.setData({ activeCategory: 'all', switching: true });
        this.loadListFirst();
        return;
      }
      this.goCreate();
    },

    openDish(event) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${event.detail.id}`
      });
    },

    goCreate() {
      auth.openCreate();
    },

    goUser() {
      if (store.isLoggedIn()) {
        wx.navigateTo({ url: '/pages/mine/mine' });
      } else {
        auth.openLogin();
      }
    }
  })
);
