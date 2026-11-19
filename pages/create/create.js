const store = require('../../utils/store');
const imageUtil = require('../../utils/image');

const MAX_PHOTOS = 9;
let stepSeed = 0;

function createStep(text, image) {
  stepSeed += 1;
  return {
    key: `step_${Date.now()}_${stepSeed}`,
    text: text || '',
    image: image || ''
  };
}

Page({
  data: {
    isEdit: false,
    dishId: '',
    name: '',
    intro: '',
    photos: [],
    steps: [createStep()],
    submitting: false
  },

  onLoad(options) {
    if (options && options.id) {
      this.enterEditMode(options.id);
      return;
    }

    // 直接打开发布页时也要拦住游客
    if (!store.isLoggedIn()) {
      wx.redirectTo({ url: '/pages/login/login?redirect=create' });
    }
  },

  async enterEditMode(id) {
    let dish = null;
    try {
      dish = await store.getDish(id);
    } catch (err) {
      console.error('[create] 读取菜谱失败', err);
    }

    if (!dish) {
      wx.showToast({ title: '菜谱不存在或已被删除', icon: 'none' });
      setTimeout(() => this.goBack(), 900);
      return;
    }

    if (!store.canManageDish(dish)) {
      wx.showToast({ title: '只能编辑自己发布的菜谱', icon: 'none' });
      setTimeout(() => this.goBack(), 900);
      return;
    }

    const sourceSteps = dish.steps.length ? dish.steps : [{ text: '', image: '' }];
    const steps = sourceSteps.map((step) => createStep(step.text, step.image));

    this.setData({
      isEdit: true,
      dishId: dish.id,
      name: dish.name,
      intro: dish.intro,
      photos: dish.images.slice(),
      steps
    });

    wx.setNavigationBarTitle({ title: '编辑菜谱' });
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value });
  },

  onIntroInput(event) {
    this.setData({ intro: event.detail.value });
  },

  choosePhotos() {
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) {
      this.toast(`最多上传 ${MAX_PHOTOS} 张成品图`);
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const picked = res.tempFiles.map((file) => file.tempFilePath);
        this.setData({ photos: this.data.photos.concat(picked) });
      }
    });
  },

  previewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    wx.previewImage({
      current: this.data.photos[index],
      urls: this.data.photos
    });
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = this.data.photos.slice();
    photos.splice(index, 1);
    this.setData({ photos });
  },

  setCover(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (index <= 0) return;
    const photos = this.data.photos.slice();
    const picked = photos.splice(index, 1)[0];
    photos.unshift(picked);
    this.setData({ photos });
    this.toast('已设为封面');
  },

  addStep() {
    this.setData({ steps: this.data.steps.concat(createStep()) });
  },

  removeStep(event) {
    if (this.data.steps.length <= 1) return;
    const index = Number(event.currentTarget.dataset.index);
    const steps = this.data.steps.slice();
    steps.splice(index, 1);
    this.setData({ steps });
  },

  onStepInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`steps[${index}].text`]: event.detail.value
    });
  },

  chooseStepImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({
          [`steps[${index}].image`]: res.tempFiles[0].tempFilePath
        });
      }
    });
  },

  previewStepImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const src = this.data.steps[index].image;
    if (!src) return;
    wx.previewImage({
      current: src,
      urls: [src]
    });
  },

  removeStepImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`steps[${index}].image`]: ''
    });
  },

  async publish() {
    if (this.data.submitting) return;

    const name = this.data.name.trim();
    const intro = this.data.intro.trim();
    const photos = this.data.photos.slice();
    const steps = this.data.steps
      .map((step) => ({ text: step.text.trim(), image: step.image }))
      .filter((step) => step.text);

    if (!name) {
      this.toast('先给这道菜起个名字');
      return;
    }
    if (!photos.length) {
      this.toast('至少上传一张成品图');
      return;
    }
    if (!steps.length) {
      this.toast('至少写一个做法步骤');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.isEdit ? '保存中' : '上传中', mask: true });

    try {
      const savedPhotos = await imageUtil.prepareImages(photos, 'recipes/');
      const savedStepImages = await imageUtil.prepareImages(
        steps.map((step) => step.image),
        'recipes/'
      );

      const payload = {
        name,
        intro,
        images: savedPhotos,
        steps: steps.map((step, index) => ({
          text: step.text,
          image: savedStepImages[index]
        }))
      };

      if (this.data.isEdit) {
        await store.updateDish(this.data.dishId, payload);
      } else {
        await store.createDish(payload);
      }

      wx.hideLoading();
      wx.showToast({
        title: this.data.isEdit ? '已保存' : '发布成功',
        icon: 'success',
        duration: 800
      });

      setTimeout(() => {
        this.goBack();
      }, 800);
    } catch (err) {
      console.error('[create] 保存失败', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      this.toast(
        (err && err.message) ||
          (this.data.isEdit ? '保存失败，请重试' : '发布失败，请重试')
      );
    }
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' });
  }
});
