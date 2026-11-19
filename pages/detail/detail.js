const store = require('../../utils/store');
const format = require('../../utils/format');
const auth = require('../../utils/auth');

Page({
  data: {
    dish: null,
    current: 0,
    timeText: '',
    canManage: false
  },

  onLoad(options) {
    this.dishId = (options && options.id) || '';
    this.loadDish();
  },

  onShow() {
    // 从编辑页返回时刷新数据与权限状态
    if (this.dishId) {
      this.loadDish();
    }
  },

  async loadDish() {
    let dish = null;
    try {
      dish = await store.getDish(this.dishId);
    } catch (err) {
      console.error('[detail] 加载菜谱失败', err);
    }

    if (!dish) {
      this.setData({ dish: null, canManage: false, timeText: '' });
      return;
    }

    const steps = dish.steps.map((step, index) =>
      Object.assign({}, step, {
        no: index + 1 < 10 ? `0${index + 1}` : `${index + 1}`
      })
    );

    this.setData({
      dish: Object.assign({}, dish, { steps }),
      timeText: format.formatTimeAgo(dish.createdAt),
      canManage: store.canManageDish(dish),
      current: Math.min(this.data.current, Math.max(dish.images.length - 1, 0))
    });

    if (dish.name) {
      wx.setNavigationBarTitle({ title: dish.name });
    }
  },

  onSwiperChange(event) {
    this.setData({ current: event.detail.current });
  },

  previewHero(event) {
    const dish = this.data.dish;
    if (!dish) return;
    const index = Number(event.currentTarget.dataset.index) || 0;
    wx.previewImage({
      current: dish.images[index],
      urls: dish.images
    });
  },

  previewStep(event) {
    const src = event.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({
      current: src,
      urls: [src]
    });
  },

  goCreate() {
    auth.openCreate();
  },

  editDish() {
    const dish = this.data.dish;
    if (!dish) return;
    wx.navigateTo({
      url: `/pages/create/create?id=${encodeURIComponent(dish.id)}`
    });
  },

  deleteDish() {
    const dish = this.data.dish;
    if (!dish) return;

    wx.showModal({
      title: '删除菜谱',
      content: `删除后无法恢复，确定删除「${dish.name}」吗？`,
      confirmText: '删除',
      confirmColor: '#e0562a',
      success: (res) => {
        if (!res.confirm) return;
        store
          .removeDish(dish.id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success', duration: 600 });
            setTimeout(() => this.goHome(), 600);
          })
          .catch((err) => {
            wx.showToast({
              title: (err && err.message) || '删除失败，请重试',
              icon: 'none'
            });
          });
      }
    });
  },

  goHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  }
});
