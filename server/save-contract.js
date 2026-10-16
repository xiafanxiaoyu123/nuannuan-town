// Node 24 的同步 ESM 加载复用游戏的纯数据校验，避免服务端维护另一套宽松规则。
// 该依赖闭包不含 DOM、存储、网络或游戏运行时；工作台交接工具同步打包整个闭包。
const { createHash } = require('node:crypto');
const { validateSaveData, MAX_SAVE_BYTES } = require('../js/core/save-format.js');

function validateCloudSave(data) {
  let checked;
  try {
    // 外部旧档和已经产生的兼容字段由同一入口处理，楼层等游戏迁移仍由客户端执行。
    checked = validateSaveData(data, { allowLegacyBuilding: true });
  } catch (cause) {
    throw Object.assign(new Error(cause.message || '存档格式不正确'), { status: 400, code: 'SAVE_INVALID' });
  }
  const text = JSON.stringify(checked);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_SAVE_BYTES) throw Object.assign(new Error('单个存档不能超过 2 MB'), { status: 413, code: 'SAVE_TOO_LARGE' });
  return { data: checked, text, bytes, checksum: createHash('sha256').update(text).digest('hex') };
}

module.exports = { validateCloudSave };
