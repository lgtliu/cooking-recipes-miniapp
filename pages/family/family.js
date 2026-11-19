const store = require('../../utils/store');
const auth = require('../../utils/auth');
const notify = require('../../config/notify');

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

Page({
  data: {
    user: null,
    loading: true,
    supported: false,
    family: null,
    members: [],
    isOwner: false,
    templateConfigured: false,
    inviteInput: '',
    joining: false,
    creating: false
  },

  onLoad(options) {
    // 从邀请卡片进入时带 ?invite=CODE，登录后再提示加入
    this.pendingInvite = normalizeCode(options && options.invite);
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const user = store.getCurrentUser();
    this.setData({ user, loading: !!user });

    if (!user) {
      this.setData({
        supported: false,
        family: null,
        members: [],
        isOwner: false
      });
      return;
    }

    let overview = null;
    try {
      overview = await store.getFamilyOverview();
    } catch (err) {
      console.error('[family] 加载家庭信息失败', err);
      this.setData({
        loading: false,
        supported: store.getMode() === 'cloud',
        family: null,
        members: [],
        isOwner: false
      });
      wx.showToast({
        title: (err && err.message) || '加载失败，请稍后重试',
        icon: 'none'
      });
      return;
    }

    const members = (overview.members || []).map((member) =>
      Object.assign({}, member, {
        initial: (member.nickname || '家').slice(0, 1)
      })
    );

    this.setData({
      loading: false,
      supported: !!overview.supported,
      family: overview.family || null,
      members,
      isOwner: !!overview.isOwner,
      templateConfigured: !!overview.templateConfigured
    });

    const invite = this.pendingInvite;
    if (!invite || !overview.supported) return;

    this.pendingInvite = '';
    if (overview.family) {
      wx.showToast({ title: '你已经在一个家庭里了', icon: 'none' });
      return;
    }
    this.confirmJoin(invite);
  },

  goLogin() {
    auth.openLogin();
  },

  onInviteInput(event) {
    this.setData({ inviteInput: normalizeCode(event.detail.value || '') });
  },

  joinByCode() {
    const code = this.data.inviteInput.trim();
    if (code.length < 4) {
      wx.showToast({ title: '请输入完整的邀请码', icon: 'none' });
      return;
    }
    this.confirmJoin(code);
  },

  confirmJoin(code) {
    wx.showModal({
      title: '加入家庭',
      content: `使用邀请码 ${code} 加入家人的家庭？加入后家人可以给你推送菜谱食材清单。`,
      confirmText: '确认加入',
      success: (res) => {
        if (res.confirm) this.join(code);
      }
    });
  },

  async join(code) {
    if (this.data.joining) return;
    this.setData({ joining: true });
    wx.showLoading({ title: '加入中', mask: true });

    try {
      const data = await store.joinFamily(code);
      wx.hideLoading();
      this.setData({ joining: false, inviteInput: '' });
      await this.refresh();
      wx.showToast({ title: '已加入家庭', icon: 'success' });
      this.promptSubscribe(data && data.name);
    } catch (err) {
      console.error('[family] 加入家庭失败', err);
      wx.hideLoading();
      this.setData({ joining: false });
      wx.showToast({
        title: (err && err.message) || '加入失败，请重试',
        icon: 'none'
      });
    }
  },

  /** 加入后引导开启订阅提醒；模板未配置时明确说明，不静默跳过 */
  promptSubscribe(familyName) {
    if (!notify.isConfigured()) {
      wx.showModal({
        title: '家庭已加入',
        content: `已加入「${familyName || '家庭'}」。订阅消息模板还没有配置，暂时无法接收家人推送；配置后可在成员列表点「开启提醒」。`,
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '开启家人提醒',
      content: '开启后家人分享菜谱会给你发一条订阅消息。一次授权只能接收一条，收到后可再次点「重新授权」。',
      confirmText: '开启提醒',
      success: (res) => {
        if (res.confirm) this.enableNotify();
      }
    });
  },

  createFamily() {
    if (this.data.creating) return;

    wx.showModal({
      title: '创建家庭',
      editable: true,
      placeholderText: '给家庭起个名字，如「小杜里的一家」',
      confirmText: '创建',
      success: async (res) => {
        if (!res.confirm) return;

        const name = (res.content || '').trim();
        this.setData({ creating: true });
        wx.showLoading({ title: '创建中', mask: true });

        try {
          await store.createFamily(name);
          wx.hideLoading();
          this.setData({ creating: false });
          await this.refresh();
          wx.showToast({ title: '家庭已创建', icon: 'success' });
        } catch (err) {
          console.error('[family] 创建家庭失败', err);
          wx.hideLoading();
          this.setData({ creating: false });
          wx.showToast({
            title: (err && err.message) || '创建失败，请重试',
            icon: 'none'
          });
        }
      }
    });
  },

  /** 订阅授权必须由用户点击触发，这里直接作为按钮的处理函数 */
  enableNotify() {
    if (!notify.isConfigured()) {
      wx.showModal({
        title: '订阅消息模板未配置',
        content: '需要先在微信公众平台申请订阅消息模板，并把模板 ID 填到 config/notify.js 与云函数 family/config.js。',
        showCancel: false
      });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [notify.TEMPLATE_ID],
      success: async (res) => {
        const status = res[notify.TEMPLATE_ID];

        if (status === 'accept') {
          try {
            await store.setFamilySubscribed(true);
            await this.refresh();
            wx.showToast({ title: '已开启提醒', icon: 'success' });
          } catch (err) {
            console.error('[family] 记录订阅状态失败', err);
            wx.showToast({
              title: (err && err.message) || '记录订阅状态失败',
              icon: 'none'
            });
          }
          return;
        }

        if (status === 'reject') {
          wx.showModal({
            title: '未开启提醒',
            content: '你拒绝了订阅授权，家人分享的食材清单不会推送给你。可以稍后再点「开启提醒」重新授权。',
            showCancel: false
          });
          return;
        }

        wx.showModal({
          title: '未完成授权',
          content: '订阅授权没有完成，可以稍后再试。',
          showCancel: false
        });
      },
      fail: (err) => {
        console.error('[family] 打开订阅授权失败', err);
        wx.showModal({
          title: '无法打开订阅授权',
          content: `${(err && err.errMsg) || '请稍后重试'}。如果模板 ID 无效，请到微信公众平台确认模板状态。`,
          showCancel: false
        });
      }
    });
  },

  copyInviteCode() {
    const family = this.data.family;
    if (!family || !family.inviteCode) return;
    wx.setClipboardData({
      data: family.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' })
    });
  },

  removeMember(event) {
    const openid = event.currentTarget.dataset.openid;
    const name = event.currentTarget.dataset.name;
    if (!openid) return;

    wx.showModal({
      title: '移除家人',
      content: `确定把「${name || '这位家人'}」移出家庭吗？移出后不再接收家庭分享。`,
      confirmText: '移除',
      confirmColor: '#e0562a',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中', mask: true });
        try {
          await store.removeFamilyMember(openid);
          wx.hideLoading();
          await this.refresh();
          wx.showToast({ title: '已移除', icon: 'none' });
        } catch (err) {
          console.error('[family] 移除成员失败', err);
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '移除失败，请重试',
            icon: 'none'
          });
        }
      }
    });
  },

  leaveFamily() {
    wx.showModal({
      title: '退出家庭',
      content: '退出后不再接收这个家庭分享的菜谱，之后可以重新加入。',
      confirmText: '退出',
      confirmColor: '#e0562a',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中', mask: true });
        try {
          await store.leaveFamily();
          wx.hideLoading();
          await this.refresh();
          wx.showToast({ title: '已退出家庭', icon: 'none' });
        } catch (err) {
          console.error('[family] 退出家庭失败', err);
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '退出失败，请重试',
            icon: 'none'
          });
        }
      }
    });
  },

  onShareAppMessage() {
    const family = this.data.family;
    if (!family) {
      return {
        title: '一起用「小杜里」记录家常菜',
        path: '/pages/index/index'
      };
    }
    return {
      title: `邀请你加入「${family.name}」`,
      path: `/pages/family/family?invite=${encodeURIComponent(family.inviteCode)}`
    };
  }
});
