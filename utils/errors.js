/**
 * 统一错误模型：错误码集中定义，数据层抛出的错误都带 code / message，
 * 页面只负责展示，不再各自拼错误文案、也不再靠字符串判断错误类型。
 */

const CODE = {
  // 客户端
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK_ERROR',
  CLOUD_UNAVAILABLE: 'CLOUD_UNAVAILABLE',
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  // 业务（云函数返回）
  INVALID: 'INVALID',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  NO_OPENID: 'NO_OPENID',
  // 兜底
  SERVER: 'SERVER_ERROR'
};

/** 可重试的错误：网络抖动、超时、云端暂不可用 */
const RETRYABLE = {
  TIMEOUT: true,
  NETWORK_ERROR: true,
  CLOUD_UNAVAILABLE: true
};

/** 构造带错误码的错误对象 */
function create(code, message, extra) {
  const err = new Error(message || '操作失败');
  err.code = code || CODE.SERVER;
  if (extra) Object.assign(err, extra);
  return err;
}

/** 把任意异常补成统一结构，避免上层拿到没有 code 的裸错误 */
function normalize(err, fallbackCode) {
  if (err && err.code && err.message) return err;
  const message = (err && (err.message || err.errMsg)) || '操作失败';
  return create((err && err.code) || fallbackCode || CODE.SERVER, message, { cause: err });
}

/** 判断是否值得自动重试 */
function isRetryable(err) {
  if (!err) return false;
  if (err.system) return true;
  return !!RETRYABLE[err.code];
}

/** 面向用户的兜底文案：业务错误直接用服务端 message，系统错误用统一提示 */
function toUserMessage(err, fallback) {
  const message = (err && err.message) || '';
  if (err && RETRYABLE[err.code]) return fallback || '网络不太稳定，请重试';
  return message || fallback || '操作失败，请重试';
}

module.exports = {
  CODE,
  create,
  normalize,
  isRetryable,
  toUserMessage
};
