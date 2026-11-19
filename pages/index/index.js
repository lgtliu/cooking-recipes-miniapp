const store = require('../../utils/store');
const format = require('../../utils/format');
const auth = require('../../utils/auth');

const CARD_HEIGHTS = [380, 430, 470];

function cardHeight(id) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return CARD_HEIGHTS[hash % CARD_HEIGHTS.length];
}

Page({
  data: {
    leftColumn: [],
    rightColumn: [],
    total: 0,
    totalSteps: 0,
    user: null,
    mode: 'local'
  },

  onShow() {
    this.setData({
      user: store.getCurrentUser(),
      mode: store.getMode()
    });
    this.loadDishes();
  },

  onPullDownRefresh() {
    this.loadDishes(true);
  },

  async loadDishes(fromPull) {
    try {
      const dishes = (await store.listDishes()).map((dish) =>
        Object.assign({}, dish, {
          timeText: format.formatTimeAgo(dish.createdAt),
          cardHeight: cardHeight(dish.id)
        })
      );

      const leftColumn = [];
      const rightColumn = [];
      let totalSteps = 0;

      dishes.forEach((dish, index) => {
        totalSteps += (dish.steps || []).length;
        if (index % 2 === 0) {
          leftColumn.push(dish);
        } else {
          rightColumn.push(dish);
        }
      });

      this.setData({
        leftColumn,
        rightColumn,
        total: dishes.length,
        totalSteps,
        mode: store.getMode()
      });
    } catch (err) {
      console.error('[index] 加载菜谱失败', err);
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' });
    } finally {
      if (fromPull) {
        wx.stopPullDownRefresh();
      }
    }
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
});
