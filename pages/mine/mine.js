const store = require('../../utils/store');
const format = require('../../utils/format');
const auth = require('../../utils/auth');
const errors = require('../../utils/errors');
const logger = require('../../utils/logger');
const { COPY } = require('../../config/constants');

Page({
  data: {
    user: null,
    dishes: [],
    total: 0,
    mode: 'local',
    migration: { canMigrate: false, count: 0 },
    migrating: false,
    loading: true,
    loadError: '',
    copy: COPY
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const mode = store.getMode();
    const user = store.getCurrentUser();

    if (!user) {
      this.setData({
        user: null,
        dishes: [],
        total: 0,
        mode,
        loading: false,
        loadError: '',
        migration: { canMigrate: false, count: 0 }
      });
      return;
    }

    this.setData({ user, mode, loading: true, loadError: '' });

    try {
      const dishes = (await store.getMyDishes()).map((dish) =>
        Object.assign({}, dish, {
          timeText: format.formatTimeAgo(dish.createdAt)
        })
      );

      this.setData({
        dishes,
        total: dishes.length,
        loading: false,
        migration: store.getMigrationInfo()
      });
    } catch (err) {
      logger.error('mine', '加载我的菜谱失败', err && err.code);
      this.setData({
        loading: false,
        loadError: errors.toUserMessage(err, COPY.loadFailed)
      });
    }
  },

  reloadList() {
    this.refresh();
  },

  goLogin() {
    auth.openLogin();
  },

  goCreate() {
    auth.openCreate();
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/family' });
  },

  openDish(event) {
    wx.navigateTo({
      url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}`
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将回到游客状态，已发布的菜谱仍会保留。',
      confirmText: '退出',
      confirmColor: '#e0562a',
      success: (res) => {
        if (!res.confirm) return;
        store.logout();
        this.refresh();
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  },

  migrate() {
    const migration = this.data.migration;
    if (!migration.canMigrate || this.data.migrating) return;

    wx.showModal({
      title: '迁移本机菜谱',
      content: `把本机 ${migration.count} 道菜谱上传到云端，归到当前微信账号。示例菜谱不会上传。`,
      confirmText: '开始迁移',
      success: (res) => {
        if (!res.confirm) return;
        this.runMigration();
      }
    });
  },

  async runMigration() {
    this.setData({ migrating: true });
    wx.showLoading({ title: '迁移中', mask: true });

    try {
      const count = await store.migrateLocalDishes();
      wx.hideLoading();
      this.setData({ migrating: false });
      wx.showToast({
        title: count ? `已迁移 ${count} 道` : '没有可迁移的菜谱',
        icon: 'none'
      });
      this.refresh();
    } catch (err) {
      logger.error('mine', '迁移失败', err && err.code);
      wx.hideLoading();
      this.setData({ migrating: false });
      wx.showToast({
        title: errors.toUserMessage(err, '迁移失败，请重试'),
        icon: 'none'
      });
    }
  }
});
