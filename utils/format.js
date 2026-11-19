function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;

  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;

  const date = new Date(timestamp);
  const pad = (value) => (value < 10 ? `0${value}` : `${value}`);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

module.exports = {
  formatTimeAgo
};
