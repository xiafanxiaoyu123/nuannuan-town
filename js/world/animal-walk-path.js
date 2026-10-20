// Runtime breadcrumbs only. The world confirms every segment against its current obstacles.
const point = p => ({ x: p.x, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Same open rectangle/circle boundaries as town.blocked, swept over the whole
// segment so a short diagonal cannot skip a thin corner between sample points.
export function animalSegmentClear(from, to, rects = [], circles = [], margin = .28) {
  const dx = to.x - from.x, dz = to.z - from.z;
  for (const r of rects) {
    let enter = 0, leave = 1, overlaps = true;
    for (const [p, delta, low, high] of [[from.x, dx, r.x0 - margin, r.x1 + margin], [from.z, dz, r.z0 - margin, r.z1 + margin]]) {
      if (!delta) { if (p <= low || p >= high) overlaps = false; }
      else {
        const a = (low - p) / delta, b = (high - p) / delta;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (overlaps && enter < leave) return false;
  }
  const length2 = dx * dx + dz * dz;
  for (const c of circles) {
    const t = length2 ? Math.max(0, Math.min(1, ((c.x - from.x) * dx + (c.z - from.z) * dz) / length2)) : 0;
    if (Math.hypot(from.x + dx * t - c.x, from.z + dz * t - c.z) < c.r + margin) return false;
  }
  return true;
}

// A nearby clipped corner may need one extra bend. Both complete legs must be
// clear; farther obstacles still ask the player to return and choose a path.
function nearbyBend(from, to, clear) {
  if (distance(from, to) > .8) return null;
  for (const bend of [{ x: to.x, z: from.z }, { x: from.x, z: to.z }]) {
    if (distance(from, bend) > .001 && distance(bend, to) > .001 && clear(from, bend.x, bend.z) && clear(bend, to.x, to.z)) return bend;
  }
  return null;
}

export function createAnimalWalkPath(animal, player) {
  return { points: [point(player)], lastPlayer: point(player), paused: false };
}

export function recordAnimalWalkPath(path, player, dt, eligible, clear) {
  const moved = distance(path.lastPlayer, player);
  path.lastPlayer = point(player);
  if (!eligible) { path.paused = true; return { ok: true, paused: true }; }
  if (moved > Math.max(1, Math.max(0, dt) * 12)) return { ok: false, invalid: true, reason: '位置发生变化，散步已经结束' };
  const tail = path.points.at(-1);
  // Never invent the path walked while a menu, camera or background hid the scene.
  if (path.paused && tail && distance(tail, player) > 1) return { ok: false, reason: '回到伙伴走过的小路旁，再慢慢出发' };
  path.paused = false;
  if (tail && distance(tail, player) < .12) return { ok: true };
  if (path.points.length >= 160) return { ok: false, reason: '走得有点远了，回头等一等伙伴' };
  if (tail && !clear(tail, player.x, player.z)) {
    const bend = nearbyBend(tail, player, clear);
    if (!bend || path.points.length >= 159) return { ok: false, reason: '这段路有些拥挤，回头带伙伴换条路吧' };
    path.points.push(bend);
  }
  path.points.push(point(player));
  return { ok: true };
}

export function nextAnimalWalkPoint(path, animal, followDistance, clear) {
  while (path.points.length > 1 && distance(animal, path.points[0]) < .12 && clear(animal,path.points[1].x,path.points[1].z)) path.points.shift();
  let total = 0, from = animal;
  for (const p of path.points) { total += distance(from, p); from = p; }
  const allowed = total - followDistance;
  if (allowed <= .035) return { target: null, blocked: false, remaining: total };
  const first=path.points[0],segment=distance(animal,first),t=Math.min(1,allowed/(segment||1));
  const target={x:animal.x+(first.x-animal.x)*t,z:animal.z+(first.z-animal.z)*t};
  if (clear(animal, target.x, target.z)) return { target, blocked: false, remaining: total };
  const bend = nearbyBend(animal, first, clear);
  if (bend) {
    const scale = Math.min(1, allowed / distance(animal, bend));
    return { target: { x: animal.x + (bend.x - animal.x) * scale, z: animal.z + (bend.z - animal.z) * scale }, blocked: false, remaining: total };
  }
  // Keep every actual corner until it is reached; do not pull across a fence.
  return { target: null, blocked: true, remaining: total };
}
