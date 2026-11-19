const store = require('../../utils/store');
const format = require('../../utils/format');
const auth = require('../../utils/auth');
const catUtil = require('../../utils/categories');

Page({
  data: {
    dish: null,
    current: 0,
    timeText: '',
    canManage: false,
    canShare: false,
    failReason: '',
    // 首次进入数据尚未返回时为 true：加载中不渲染「找不到」分支，
    // 避免真机上每次跳转先闪现「这道菜找不到了」再变成菜谱内容
    loading: true
  },

  onLoad(options) {
    this.dishId = (options && options.id) || '';
    this._firstShow = true;
    this.loadDish();
  },

  onShow() {
    // 从编辑页返回时刷新数据与权限状态；首次进入由 onLoad 负责加载，避免重复请求
    if (this._firstShow) {
      this._firstShow = false;
      return;
    }
    if (this.dishId) {
      this.loadDish();
    }
  },

  async loadDish() {
    // 处于「找不到」页时重试，先切回加载态，避免停留在错误页上等待
    if (!this.data.dish && !this.data.loading) {
      this.setData({ loading: true, failReason: '' });
    }

    let dish = null;
    let failReason = '';

    try {
      dish = await store.getDish(this.dishId);
      if (!dish) {
        failReason = `没有取到菜谱数据（当前${store.getModeLabel()}，id：${this.dishId || '空'}）`;
      }
    } catch (err) {
      console.error('[detail] 加载菜谱失败', err);
      failReason = `加载失败：${(err && err.code) ? `[${err.code}] ` : ''}${
        (err && err.message) || err
      }（当前${store.getModeLabel()}）`;
    }

    if (!dish) {
      this.setData({
        dish: null,
        canManage: false,
        canShare: false,
        timeText: '',
        loading: false,
        failReason
      });
      return;
    }

    const steps = dish.steps.map((step, index) =>
      Object.assign({}, step, {
        no: index + 1 < 10 ? `0${index + 1}` : `${index + 1}`
      })
    );

    // 食材补 key，避免同名食材在列表里重复时渲染异常；旧数据没有食材时为空数组
    const ingredients = (dish.ingredients || []).map((item, index) => ({
      key: `ing_${index}`,
      name: item.name,
      amount: item.amount
    }));

    // 分类展示兜底：数据层已带出 categoryName/Icon，这里再补一次防止旧缓存缺字段
    const category = catUtil.getCategory(dish.categoryId);
    this.setData({
      loading: false,
      dish: Object.assign({}, dish, {
        steps,
        ingredients,
        categoryId: dish.categoryId || '',
        categoryName: dish.categoryName || category.name,
        categoryIcon: dish.categoryIcon || category.icon
      }),
      timeText: format.formatTimeAgo(dish.createdAt),
      canManage: store.canManageDish(dish),
      // 分享给微信好友不需要登录，只要菜谱能打开就能转发
      canShare: true,
      current: Math.min(this.data.current, Math.max(dish.images.length - 1, 0))
    });

    this.prepareShareImage(dish.images);

    if (dish.name) {
      wx.setNavigationBarTitle({ title: dish.name });
    }
    this.setData({ failReason: '' });
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

  /**
   * 解析转发卡片的缩略图地址。
   * onShareAppMessage 的 imageUrl 不支持 cloud:// 文件 ID，
   * 云存储图片要换成 https 临时链接；本地持久路径和远程链接可直接使用。
   */
  prepareShareImage(images) {
    this.shareImageUrl = '';
    const first = (images || [])[0];
    if (!first) return;

    // 统一走数据层：cloud:// 换 https 临时链接，其余形式原样使用
    store.getShareImageUrl(first).then((url) => {
      if (url) this.shareImageUrl = url;
    });
  },

  /** 转发给微信好友的卡片：标题用菜名，缩略图用这道菜的首图 */
  onShareAppMessage() {
    const dish = this.data.dish;
    if (!dish) {
      return {
        title: '小杜里 · 家常菜谱记录',
        path: '/pages/index/index'
      };
    }
    return {
      title: dish.name,
      path: `/pages/detail/detail?id=${encodeURIComponent(dish.id)}`,
      imageUrl: this.shareImageUrl || ''
    };
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
  },

  /** 「找不到」页的重试：网络恢复或云端恢复后可直接重新拉取 */
  reloadDish() {
    if (this.reloading) return;
    this.reloading = true;
    this.loadDish().finally(() => {
      this.reloading = false;
    });
  }
});
