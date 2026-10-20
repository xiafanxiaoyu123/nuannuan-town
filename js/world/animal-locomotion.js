// 只计算本帧移动；不接触存档、产出或场景。模型步相位由确认后的实际距离推进。
const MOTION = Object.freeze({
  chicken: { speed: .32, turn: 5.5, approach: 1.7 },
  cow: { speed: .28, turn: 2.1, approach: 1.1 },
  sheep: { speed: .31, turn: 3.4, approach: 1.4 },
  duck: { speed: .24, turn: 3.1, approach: 1.2 },
  goat: { speed: .38, turn: 4.3, approach: 1.6 },
  rabbit: { speed: .36, turn: 5, approach: 1.6 },
  alpaca: { speed: .33, turn: 2.6, approach: 1.2 },
});

export function turnAnimalToward(yaw, target, limit) {
  const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + Math.max(-limit, Math.min(limit, delta));
}

export function planAnimalStep(species, position, yaw, target, dt, pace = 1) {
  const frame = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  const motion = MOTION[species] || MOTION.chicken;
  const dx = target.x - position.x, dz = target.z - position.z;
  const remaining = Math.hypot(dx, dz);
  if (!frame || remaining < .035) return { x: position.x, z: position.z, yaw, dt: frame };
  const desired = Math.atan2(dx, dz);
  const heading = turnAnimalToward(yaw, desired, motion.turn * frame);
  // 先转向再迈步；目标在背后时不横滑或倒着滑走。
  const facing = Math.max(0, Math.cos(desired - heading));
  // 只有主动散步请求更快地跟上；普通闲逛保持原速度和转向。
  const rate = Number.isFinite(pace) ? Math.max(1, Math.min(3, pace)) : 1;
  const distance = Math.min(motion.speed * rate, remaining * motion.approach * rate) * frame * facing;
  return {
    x: position.x + Math.sin(heading) * distance,
    z: position.z + Math.cos(heading) * distance,
    yaw: heading,
    dt: frame,
  };
}

export function recordAnimalStep(record, beforeX, beforeZ, dt) {
  const frame = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  const distance = Math.hypot(record.model.position.x - beforeX, record.model.position.z - beforeZ);
  // 只在真正走动时累加；碰撞、照顾、睡眠、装修与住房迁移都不伪造步数。
  const speed = frame > 0 ? distance / frame : 0;
  record.walkDistance = (record.walkDistance || 0) + distance;
  return { distance: record.walkDistance, speed, dt: frame };
}
