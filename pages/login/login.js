const store = require('../../utils/store');
const imageUtil = require('../../utils/image');

Page({
  data: {
    avatar: '',
    nickname: '',
    submitting: false,
    redirect: ''
  },

  onLoad(options) {
    this.setData({
      redirect: (options && options.redirect) || ''
    });
  },

  onChooseAvatar(event) {
    this.setData({ avatar: event.detail.avatarUrl || '' });
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value || '' });
  },

  async submit() {
    if (this.data.submitting) return;

    const nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请先填写昵称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '登录中', mask: true });

    try {
      // 云端可用时头像会上传到云存储换成 fileID；本地模式则复制到本机用户目录
      const avatar = await imageUtil.prepareImage(this.data.avatar, 'avatars/');
      await store.login({ nickname, avatar });

      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success', duration: 600 });
      setTimeout(() => this.finish(), 600);
    } catch (err) {
      console.error('[login] 登录失败', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({
        title: (err && err.message) || '登录失败，请重试',
        icon: 'none'
      });
    }
  },

  finish() {
    if (this.data.redirect === 'create') {
      wx.redirectTo({ url: '/pages/create/create' });
      return;
    }

    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  }
});
