const cloud = require('./utils/cloud');
const store = require('./utils/store');

App({
  onLaunch() {
    // 启动时初始化一次 wx.cloud，traceUser 便于在云开发控制台关联微信用户
    cloud.init();
    // 数据层初始化：写入本地示例数据、确定云端 / 本地模式
    store.init();
  }
});
