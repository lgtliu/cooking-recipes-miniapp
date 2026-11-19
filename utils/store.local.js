/**
 * 本地存储模式的数据层实现（云开发未配置 / 不可用时的兜底）。
 * 数据仍使用 wx.setStorageSync 持久化，键名与历史版本保持一致，
 * 旧版本产生的菜谱与登录态可以继续读取。
 */

const session = require('./session');

const STORAGE_KEY = 'cooking_recipes_v1';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function buildSeedDishes() {
  const now = Date.now();

  return [
    {
      id: 'seed-tomato-egg',
      name: '番茄炒蛋',
      intro: '酸甜裹着嫩蛋，十分钟就能端上桌的下饭第一名。',
      cover: '/assets/img/dish-tomato-egg.jpg',
      images: [
        '/assets/img/dish-tomato-egg.jpg',
        '/assets/img/dish-tomato-egg-2.jpg'
      ],
      steps: [
        {
          text: '番茄去蒂切滚刀块；鸡蛋磕进碗里，加一小撮盐和两勺清水打散。',
          image: '/assets/img/step-prep.jpg'
        },
        {
          text: '热锅倒油，油温六成热时倒入蛋液，边缘凝固后迅速划散，盛出备用。',
          image: '/assets/img/step-stirfry.jpg'
        },
        {
          text: '锅里留底油，下番茄中火翻炒，用铲子压出红汁，炒到番茄变软。',
          image: ''
        },
        {
          text: '倒回鸡蛋，加半勺白糖和少许盐翻匀，撒一把葱花就可以出锅了。',
          image: ''
        }
      ],
      author: '小杜里',
      createdAt: now - 2 * HOUR
    },
    {
      id: 'seed-braised-pork',
      name: '红烧肉',
      intro: '小火慢炖出来的油亮红润，配一碗白米饭刚刚好。',
      cover: '/assets/img/dish-braised-pork.jpg',
      images: [
        '/assets/img/dish-braised-pork.jpg',
        '/assets/img/dish-braised-pork-2.jpg'
      ],
      steps: [
        {
          text: '五花肉切成 3 厘米见方的块，冷水下锅，加姜片和料酒焯水，撇去浮沫后捞出沥干。',
          image: ''
        },
        {
          text: '锅里放少许油，下冰糖小火炒到琥珀色，倒入肉块翻炒上色。',
          image: ''
        },
        {
          text: '加姜片、八角、桂皮和干辣椒炒香，淋两勺生抽、一勺老抽。',
          image: '/assets/img/step-stirfry.jpg'
        },
        {
          text: '倒入没过肉块的热水，大火烧开后转小火炖 60 分钟。',
          image: ''
        },
        {
          text: '开盖转大火收汁，汤汁浓稠地裹在肉上即可，撒葱花装盘。',
          image: ''
        }
      ],
      author: '小杜里',
      createdAt: now - 27 * HOUR
    },
    {
      id: 'seed-greens',
      name: '蒜蓉西兰花',
      intro: '清爽脆嫩、蒜香十足，配重口味的硬菜最解腻。',
      cover: '/assets/img/dish-greens.jpg',
      images: ['/assets/img/dish-greens.jpg'],
      steps: [
        {
          text: '西兰花掰成小朵，用淡盐水泡 10 分钟后冲洗干净；蒜切成末。',
          image: '/assets/img/step-prep.jpg'
        },
        {
          text: '水烧开加少许盐和几滴油，西兰花焯 40 秒，捞出过凉水沥干。',
          image: ''
        },
        {
          text: '热锅下油，小火把蒜末炒香，注意别炒糊。',
          image: ''
        },
        {
          text: '倒入西兰花大火快炒，加盐和少许蚝油翻匀，勾一层薄芡出锅。',
          image: ''
        }
      ],
      author: '小杜里',
      createdAt: now - 3 * DAY
    },
    {
      id: 'seed-noodle',
      name: '葱油拌面',
      intro: '一把小葱慢慢熬出香气，简单却让人念念不忘。',
      cover: '/assets/img/dish-noodle.jpg',
      images: ['/assets/img/dish-noodle.jpg'],
      steps: [
        {
          text: '小葱洗净沥干，切成长段；生抽、老抽、白糖提前调成料汁。',
          image: ''
        },
        {
          text: '冷油下葱段，全程小火慢熬到葱叶焦黄卷曲，捞出葱段。',
          image: '/assets/img/step-stirfry.jpg'
        },
        {
          text: '把料汁倒进葱油里，煮到微微冒泡后关火，葱油汁就做好了。',
          image: ''
        },
        {
          text: '面条煮熟捞出，淋两勺葱油汁拌匀，撒上炸香的葱段即可。',
          image: ''
        }
      ],
      author: '小杜里',
      createdAt: now - 5 * DAY
    }
  ];
}

function readAll() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[store.local] 读取本地数据失败', err);
    return [];
  }
}

function writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list);
    return true;
  } catch (err) {
    console.error('[store.local] 写入本地数据失败', err);
    return false;
  }
}

/** 兼容旧数据：缺失字段补默认值，避免历史示例菜谱报错 */
function normalizeDish(raw) {
  const dish = raw && typeof raw === 'object' ? raw : {};
  let images = Array.isArray(dish.images) ? dish.images.filter(Boolean) : [];
  if (!images.length && dish.cover) {
    images = [dish.cover];
  }
  const steps = Array.isArray(dish.steps)
    ? dish.steps.map((step) => ({
        text: (step && step.text) || '',
        image: (step && step.image) || ''
      }))
    : [];

  return Object.assign(
    {
      id: '',
      name: '',
      intro: '',
      cover: '',
      images: [],
      steps: [],
      author: '匿名厨友',
      authorId: '',
      authorAvatar: '',
      createdAt: 0,
      updatedAt: 0
    },
    dish,
    {
      intro: dish.intro || '',
      cover: images[0] || dish.cover || '',
      images,
      steps,
      author: dish.author || '匿名厨友',
      authorId: dish.authorId || '',
      authorAvatar: dish.authorAvatar || ''
    }
  );
}

/** 首次启动时写入示例菜谱，方便直接体验浏览流程 */
function init() {
  const data = wx.getStorageSync(STORAGE_KEY);
  if (!Array.isArray(data) || data.length === 0) {
    writeAll(buildSeedDishes());
  }
}

function listDishes() {
  return readAll()
    .map(normalizeDish)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getDish(id) {
  if (!id) return null;
  const found = readAll().filter((dish) => dish && dish.id === id);
  return found.length ? normalizeDish(found[0]) : null;
}

function getMyDishes() {
  const user = session.read();
  if (!user) return [];
  return listDishes().filter((dish) => dish.authorId === user.id);
}

function normalizeDraft(draft) {
  const name = ((draft && draft.name) || '').trim();
  if (!name) {
    throw new Error('菜名不能为空');
  }
  const images = Array.isArray(draft.images) ? draft.images.filter(Boolean) : [];
  const steps = Array.isArray(draft.steps)
    ? draft.steps
        .map((step) => ({
          text: ((step && step.text) || '').trim(),
          image: (step && step.image) || ''
        }))
        .filter((step) => step.text)
    : [];

  return {
    name,
    intro: ((draft && draft.intro) || '').trim(),
    images,
    steps
  };
}

function requireUser() {
  const user = session.read();
  if (!user) {
    const err = new Error('请先登录');
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }
  return user;
}

function buildLocalUserId(nickname) {
  const text = String(nickname || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `local-${hash.toString(36)}`;
}

/** 本地兜底登录：仅在本机区分用户，不是微信 openid */
function login(profile) {
  const nickname = ((profile && profile.nickname) || '').trim();
  if (!nickname) {
    throw new Error('昵称不能为空');
  }

  const user = {
    id: buildLocalUserId(nickname),
    nickname,
    avatar: (profile && profile.avatar) || '',
    loginAt: Date.now()
  };

  if (!session.write(user)) {
    throw new Error('登录状态保存失败，请重试');
  }
  return user;
}

function logout() {
  session.clear();
}

function canManageDish(dish) {
  const user = session.read();
  return !!(user && dish && dish.authorId && dish.authorId === user.id);
}

function createDish(draft) {
  const user = requireUser();
  const data = normalizeDraft(draft);

  const dish = {
    id: `dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: data.name,
    intro: data.intro,
    cover: data.images[0] || '',
    images: data.images,
    steps: data.steps,
    author: user.nickname,
    authorId: user.id,
    authorAvatar: user.avatar,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const list = readAll();
  list.push(dish);
  if (!writeAll(list)) {
    throw new Error('菜谱保存失败');
  }
  return normalizeDish(dish);
}

function updateDish(id, draft) {
  const list = readAll();
  const index = list.findIndex((item) => item && item.id === id);
  if (index === -1) {
    throw new Error('菜谱不存在或已被删除');
  }

  const existing = normalizeDish(list[index]);
  if (!canManageDish(existing)) {
    throw new Error('只能编辑自己发布的菜谱');
  }

  const data = normalizeDraft(draft);
  const updated = Object.assign({}, existing, {
    name: data.name,
    intro: data.intro,
    cover: data.images[0] || '',
    images: data.images,
    steps: data.steps,
    updatedAt: Date.now()
  });

  list[index] = updated;
  if (!writeAll(list)) {
    throw new Error('菜谱保存失败');
  }
  return normalizeDish(updated);
}

function removeDish(id) {
  const list = readAll();
  const index = list.findIndex((item) => item && item.id === id);
  if (index === -1) {
    throw new Error('菜谱不存在或已被删除');
  }
  if (!canManageDish(list[index])) {
    throw new Error('只能删除自己发布的菜谱');
  }

  list.splice(index, 1);
  if (!writeAll(list)) {
    throw new Error('删除失败，请重试');
  }
  return true;
}

module.exports = {
  STORAGE_KEY,
  init,
  listDishes,
  getDish,
  getMyDishes,
  createDish,
  updateDish,
  removeDish,
  login,
  logout,
  canManageDish,
  buildLocalUserId
};
