/**
 * 统一日志 / 埋点出口。
 *
 * 页面与数据层不再各自 console.log，而是走这里：
 * - 统一加上模块标签，便于在控制台过滤；
 * - 保留一个环形缓冲区，真机出问题时可在调试页 dump 出来；
 * - track() 是埋点入口，将来接第三方统计只需改这一个函数。
 */

const MAX_BUFFER = 60;

const buffer = [];

function push(level, tag, message, detail) {
  const entry = {
    t: Date.now(),
    level,
    tag,
    message,
    detail: detail === undefined ? '' : detail
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  const prefix = `[${tag}]`;
  if (level === 'error') {
    console.error(prefix, message, detail === undefined ? '' : detail);
  } else if (level === 'warn') {
    console.warn(prefix, message, detail === undefined ? '' : detail);
  } else {
    console.log(prefix, message, detail === undefined ? '' : detail);
  }
}

function info(tag, message, detail) {
  push('info', tag, message, detail);
}

function warn(tag, message, detail) {
  push('warn', tag, message, detail);
}

function error(tag, message, detail) {
  push('error', tag, message, detail);
}

/** 埋点：当前只落本地缓冲与控制台，接入统计平台时改这里 */
function track(event, payload) {
  push('info', 'track', event, payload);
}

/** 取出最近的日志，供调试使用 */
function dump() {
  return buffer.slice();
}

module.exports = {
  info,
  warn,
  error,
  track,
  dump
};
