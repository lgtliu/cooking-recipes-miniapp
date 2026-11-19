/**
 * 云开发调用封装：初始化、可用性判断、云函数与云存储调用。
 *
 * 约定：
 * - 云函数业务错误通过 { ok: false, code, message } 返回，不算「云端不可用」；
 * - callFunction / uploadFile 自身失败（环境未开通、网络异常等）会标记为 system 错误，
 *   上层据此降级到本地模式。
 */

const { CLOUD_ENV } = require('../config/cloud');

const PLACEHOLDER = 'YOUR_CLOUD_ENV_ID';

let initialized = false;
let available = false;

function isSupported() {
  return typeof wx !== 'undefined' && !!wx.cloud;
}

/** 是否已经填了真实环境 id（仍是占位符则视为未配置） */
function isConfigured() {
  return (
    typeof CLOUD_ENV === 'string' &&
    !!CLOUD_ENV &&
    CLOUD_ENV !== PLACEHOLDER &&
    CLOUD_ENV.indexOf('YOUR_') !== 0
  );
}

function init() {
  if (!isSupported() || !isConfigured()) {
    available = false;
    return false;
  }
  if (initialized) {
    return available;
  }
  try {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true
    });
    initialized = true;
    available = true;
  } catch (err) {
    console.warn('[cloud] 初始化失败，使用本地模式', err);
    available = false;
  }
  return available;
}

function isAvailable() {
  return available;
}

function systemError(message, cause) {
  const err = new Error(message || '云端暂不可用');
  err.system = true;
  err.cause = cause;
  return err;
}

/** 调用云函数，resolve 云函数返回值（约定为 { ok, data, code, message }） */
function call(name, data) {
  return new Promise((resolve, reject) => {
    if (!available) {
      reject(systemError('云端未初始化'));
      return;
    }
    wx.cloud.callFunction({
      name,
      data: data || {},
      success: (res) => resolve(res && res.result),
      fail: (cause) => {
        // 环境不存在、未部署、网络异常等，统一标记为云端不可用
        available = false;
        console.warn(`[cloud] 云函数 ${name} 调用失败`, cause);
        reject(systemError((cause && cause.errMsg) || '云函数调用失败', cause));
      }
    });
  });
}

/** 上传文件到云存储，resolve fileID */
function uploadFile(filePath, dir) {
  return new Promise((resolve, reject) => {
    if (!available) {
      reject(systemError('云端未初始化'));
      return;
    }
    const matched = /\.(\w+)(\?|$)/.exec(filePath);
    const ext = matched ? matched[1] : 'jpg';
    const prefix = dir || 'uploads/';
    const cloudPath = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: (cause) => {
        console.warn('[cloud] 文件上传失败', cause);
        reject(systemError((cause && cause.errMsg) || '图片上传失败', cause));
      }
    });
  });
}

module.exports = {
  CLOUD_ENV,
  isSupported,
  isConfigured,
  init,
  isAvailable,
  call,
  uploadFile
};
