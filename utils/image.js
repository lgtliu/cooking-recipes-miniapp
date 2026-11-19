/**
 * 图片处理：
 * - 云端模式：上传到云存储，返回 cloud:// 的 fileID；
 * - 本地模式：chooseMedia 返回的是临时路径，重启后会失效，
 *   所以复制到用户目录再存起来。
 */

const cloud = require('./cloud');

const USER_DIR = `${wx.env.USER_DATA_PATH}/recipe-images`;

function ensureDir() {
  const fs = wx.getFileSystemManager();
  try {
    fs.accessSync(USER_DIR);
  } catch (err) {
    try {
      fs.mkdirSync(USER_DIR, true);
    } catch (mkdirErr) {
      console.warn('[image] 创建图片目录失败', mkdirErr);
    }
  }
}

/** 用 saveFile 兜底：部分场景（如开发者工具 http://tmp/）copyFile 会失败 */
function saveFileFallback(tempPath) {
  return new Promise((resolve) => {
    if (typeof wx.saveFile !== 'function') {
      resolve(tempPath);
      return;
    }
    wx.saveFile({
      tempFilePath: tempPath,
      success: (res) => resolve(res.savedFilePath || tempPath),
      fail: (err) => {
        console.warn('[image] 图片保存失败，暂用临时路径', err);
        resolve(tempPath);
      }
    });
  });
}

/** 把临时图片复制到本地用户目录，返回可直接展示的永久路径 */
function persistImage(tempPath) {
  return new Promise((resolve) => {
    if (!tempPath) {
      resolve('');
      return;
    }
    // 包内资源、真正的远程图片、已持久化过的图片直接复用。
    // 注意：开发者工具的临时路径形如 http://tmp/...，不能当成远程图片跳过。
    const isRemote = /^https?:\/\//.test(tempPath) && tempPath.indexOf('://tmp/') === -1;
    if (
      tempPath.indexOf('/assets/') === 0 ||
      isRemote ||
      tempPath.indexOf(wx.env.USER_DATA_PATH) === 0
    ) {
      resolve(tempPath);
      return;
    }

    ensureDir();
    const matched = /\.(\w+)(\?|$)/.exec(tempPath);
    const ext = matched ? matched[1] : 'jpg';
    const destPath = `${USER_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    wx.getFileSystemManager().copyFile({
      srcPath: tempPath,
      destPath,
      success: () => resolve(destPath),
      fail: () => saveFileFallback(tempPath)
    });
  });
}

function persistImages(paths) {
  return Promise.all((paths || []).map((path) => persistImage(path)));
}

function isCloudFileId(path) {
  return typeof path === 'string' && path.indexOf('cloud://') === 0;
}

function isRemoteFile(path) {
  return /^https?:\/\//.test(path) && path.indexOf('://tmp/') === -1;
}

/**
 * 统一的图片准备函数：
 * - 已经是云文件 / 包内资源 / 远程图片，直接复用；
 * - 云端可用时上传到云存储，返回 fileID；
 * - 否则复制到本机用户目录，返回本地持久路径。
 *
 * @param {string} path 图片路径
 * @param {string} dir 云存储目录前缀，如 'recipes/'、'avatars/'
 */
function prepareImage(path, dir) {
  return new Promise((resolve, reject) => {
    if (!path) {
      resolve('');
      return;
    }
    if (
      isCloudFileId(path) ||
      path.indexOf('/assets/') === 0 ||
      isRemoteFile(path) ||
      (path.indexOf(wx.env.USER_DATA_PATH) === 0 && !cloud.isAvailable())
    ) {
      resolve(path);
      return;
    }
    if (cloud.isAvailable()) {
      cloud.uploadFile(path, dir).then(resolve).catch(reject);
      return;
    }
    persistImage(path).then(resolve);
  });
}

function prepareImages(paths, dir) {
  return Promise.all((paths || []).map((path) => prepareImage(path, dir)));
}

module.exports = {
  persistImage,
  persistImages,
  prepareImage,
  prepareImages
};
