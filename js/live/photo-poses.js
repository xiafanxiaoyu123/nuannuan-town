// 拍照姿势目录：纯数据，可被存档白名单与界面共同读取。
export const PHOTO_POSES = Object.freeze([
  { id: 'stand', name: '站好', motion: 'photo_stand', period: 3.2, price: 0, desc: '随着呼吸轻轻起伏，自然地看向镜头。' },
  { id: 'happy', name: '开心', motion: 'photo_happy', period: 1.6, price: 0, desc: '双手举高，一次次开心地轻轻跳跃。' },
  { id: 'twirl', name: '转圈', motion: 'photo_twirl', period: 3.6, price: 0, desc: '展开手臂，一圈接着一圈轻盈旋转。' },
  { id: 'greeting', name: '镜头招手', motion: 'photo_greeting', period: 2.8, price: 540, desc: '抬手来回挥动，歪头向镜头反复打招呼。' },
  { id: 'heart', name: '双手捧心', motion: 'photo_heart', period: 3.6, price: 780, desc: '把心意捧到胸前、轻轻送出，再收回来。' },
  { id: 'shy', name: '害羞侧脸', motion: 'photo_shy', period: 4, price: 960, desc: '双手轻遮脸颊，左顾右盼后回到镜头前。' },
  { id: 'salute', name: '元气敬礼', motion: 'photo_salute', period: 3.2, price: 1080, desc: '抬手敬礼、从容放下，接着再向镜头致意。' },
  { id: 'star', name: '闪亮大字', motion: 'photo_star', period: 3.2, price: 1320, desc: '双手双脚慢慢张开又合拢，像闪亮的小星星。' },
  { id: 'balance', name: '轻盈燕式', motion: 'photo_balance', period: 4.4, price: 1560, desc: '展开双臂、抬起后脚保持平衡，再轻轻落下。' },
  { id: 'curtsy', name: '优雅谢幕', motion: 'photo_curtsy', period: 4, price: 1800, desc: '一脚收在身后，轻轻俯身行礼，再优雅起身。' },
].map(p => Object.freeze(p)));
export const PAID_PHOTO_POSE_IDS = Object.freeze(PHOTO_POSES.filter(p => p.price > 0).map(p => p.id));
export const PHOTO_MOTION_PERIODS = Object.freeze(Object.fromEntries(PHOTO_POSES.map(p => [p.motion, p.period])));
export const photoPose = id => PHOTO_POSES.find(p => p.id === id) || null;
