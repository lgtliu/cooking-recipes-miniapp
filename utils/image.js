/**
 * 图片处理：
 * - 云端可用：把临时图片上传到云存储，返回 fileID（cloud://...），页面可直接展示；
 * - 云端不可用：chooseMedia 返回的是临时路径，重启后会失效，
 *   所以复制到用户目录再存起来作为兜底。
 */

const cloud = require('./cloud');
const request = require('../services/request');

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
    const isRemote = /^https?:\/\//.test(tempPath) && tempPath.indexOf('://tmp/') === -1;
    if (
      tempPath.indexOf('/assets/') === 0 ||
      isRemote ||
      isCloudFileId(tempPath) ||
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

function isRemoteFile(path) {
  return /^https?:\/\//.test(path) && path.indexOf('://tmp/') === -1;
}

/** 云存储文件 ID（基础库 2.2.3+ 可直接用于 image / previewImage） */
function isCloudFileId(path) {
  return typeof path === 'string' && path.indexOf('cloud://') === 0;
}

/**
 * 统一的图片准备函数：
 * - 已是云文件 ID / 包内资源 / 远程链接，直接复用；
 * - 云端可用：上传到云存储，返回 fileID；
 * - 云端不可用：复制到本机用户目录，返回本地持久路径。
 *
 * @param {string} path 图片路径
 * @param {string} dir 云存储目录前缀，如 'recipes/'、'avatars/'
 */
async function prepareImage(path, dir) {
  if (!path) return '';
  if (isCloudFileId(path) || path.indexOf('/assets/') === 0 || isRemoteFile(path)) {
    return path;
  }

  if (cloud.isAvailable()) {
    try {
      // 走请求层：带超时与一次重试
      return await request.uploadFile(path, dir);
    } catch (err) {
      console.warn('[image] 云端上传失败，改用本地保存', err);
    }
  }

  // 已在用户目录里的本地文件无需重复复制
  if (path.indexOf(wx.env.USER_DATA_PATH) === 0) return path;
  return persistImage(path);
}

function prepareImages(paths, dir) {
  return Promise.all((paths || []).map((path) => prepareImage(path, dir)));
}

module.exports = {
  persistImage,
  persistImages,
  prepareImage,
  prepareImages,
  isCloudFileId
};
