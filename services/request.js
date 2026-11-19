/**
 * 请求层：全应用唯一的云函数 / 云存储调用出口。
 *
 * 职责：
 * - 统一超时与重试策略；
 * - 把「云函数业务错误」和「系统错误」统一成 utils/errors 里的错误码；
 * - 统一日志，页面不需要再关心 errMsg 长什么样。
 *
 * 页面与其它模块一律不要直接调用 wx.cloud。
 */

const cloud = require('../utils/cloud');
const errors = require('../utils/errors');
const logger = require('../utils/logger');
const {
  REQUEST_TIMEOUT,
  REQUEST_RETRY,
  REQUEST_RETRY_DELAY
} = require('../config/constants');

const TAG = 'request';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, action) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(errors.create(errors.CODE.TIMEOUT, '请求超时，请检查网络后重试', { action }));
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** 把底层调用异常映射成统一错误码 */
function toRequestError(err, action) {
  if (err && err.code) return err;
  const message = (err && (err.errMsg || err.message)) || '网络请求失败';
  const isTimeout = /timeout|超时/i.test(message);
  const isUnavailable = /未初始化|not initialized|cloud init/i.test(message);

  let code = errors.CODE.NETWORK;
  if (isTimeout) code = errors.CODE.TIMEOUT;
  else if (isUnavailable) code = errors.CODE.CLOUD_UNAVAILABLE;

  return errors.create(code, isTimeout ? '请求超时，请检查网络后重试' : message, {
    action,
    cause: err,
    system: true
  });
}

/**
 * 调用云函数，返回原始 result（约定为 { ok, data, code, message }）。
 * 只对系统类错误重试，业务错误立即抛出。
 */
async function callFunction(name, data, options) {
  const opts = options || {};
  const timeout = opts.timeout || REQUEST_TIMEOUT;
  const retry = opts.retry === undefined ? REQUEST_RETRY : opts.retry;
  let attempt = 0;

  while (true) {
    try {
      return await withTimeout(cloud.call(name, data), timeout, name);
    } catch (err) {
      const normalized = toRequestError(err, name);
      if (attempt < retry && errors.isRetryable(normalized)) {
        attempt += 1;
        logger.warn(TAG, `重试 ${name}（第 ${attempt} 次）`, normalized.code);
        await delay(REQUEST_RETRY_DELAY);
        continue;
      }
      logger.error(TAG, `${name} 调用失败`, normalized.code || normalized.message);
      throw normalized;
    }
  }
}

/**
 * 调用云函数业务动作：自动带上 action，{ ok:false } 转成带 code 的业务错误。
 * @returns {Promise<any>} result.data
 */
async function callAction(name, action, payload, options) {
  const result = await callFunction(
    name,
    Object.assign({ action }, payload || {}),
    options
  );

  if (!result || result.ok !== true) {
    const code = (result && result.code) || errors.CODE.SERVER;
    const message = (result && result.message) || '操作失败，请稍后重试';
    logger.warn(TAG, `${name}.${action} 返回业务错误`, { code, message });
    throw errors.create(code, message, { action });
  }

  return result.data;
}

/** 上传文件到云存储，失败按系统错误处理（可重试） */
async function uploadFile(filePath, dir, options) {
  const first = uploadFileOnce(filePath, dir);
  try {
    return await withTimeout(first, (options && options.timeout) || REQUEST_TIMEOUT, 'upload');
  } catch (err) {
    const normalized = toRequestError(err, 'upload');
    if (errors.isRetryable(normalized)) {
      logger.warn(TAG, '上传失败，重试一次', normalized.code);
      await delay(REQUEST_RETRY_DELAY);
      return withTimeout(uploadFileOnce(filePath, dir), REQUEST_TIMEOUT, 'upload').catch(
        (retryErr) => {
          throw toRequestError(retryErr, 'upload');
        }
      );
    }
    throw normalized;
  }
}

function uploadFileOnce(filePath, dir) {
  return cloud.uploadFile(filePath, dir).catch((err) => {
    throw toRequestError(err, 'upload');
  });
}

/** 云文件 ID 换 https 临时链接；失败返回空字符串，不阻塞主流程 */
function getTempFileURL(fileID) {
  return new Promise((resolve) => {
    if (!fileID || !cloud.isAvailable() || !wx.cloud) {
      resolve('');
      return;
    }
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const file = (res && res.fileList && res.fileList[0]) || {};
        resolve(file.tempFileURL || '');
      },
      fail: (err) => {
        logger.warn(TAG, '生成临时链接失败', err && err.errMsg);
        resolve('');
      }
    });
  });
}

module.exports = {
  callFunction,
  callAction,
  uploadFile,
  getTempFileURL
};
