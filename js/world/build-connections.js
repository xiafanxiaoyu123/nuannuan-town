import { buildEdges, isBuildEdge, isBuildRoof, yardFootprint, yardLevel } from './yard-building.js';
import { BUILD_SLOPED_ROOF_IDS, roofProfileHeight } from './build-roof-profiles.js';

// Compare the whole shared edge, not just one touching corner. Rotation stays
// under the player's control; only genuinely matching slopes advertise a join.
function roofSharedEdge(a, b, defs) {
  const af = yardFootprint(a, defs), bf = yardFootprint(b, defs);
  if (!af || !bf) return null;
  let p0, p1;
  if (af.x1 === bf.x0 || bf.x1 === af.x0) {
    const x = af.x1 === bf.x0 ? af.x1 : af.x0, lo = Math.max(af.z0,bf.z0), hi = Math.min(af.z1,bf.z1);
    if (hi <= lo) return null;
    p0 = [x,lo]; p1 = [x,hi];
  } else if (af.z1 === bf.z0 || bf.z1 === af.z0) {
    const z = af.z1 === bf.z0 ? af.z1 : af.z0, lo = Math.max(af.x0,bf.x0), hi = Math.min(af.x1,bf.x1);
    if (hi <= lo) return null;
    p0 = [lo,z]; p1 = [hi,z];
  } else return null;
  return {af,bf,p0,p1};
}
export function buildRoofSeamMatches(a, b, defs) {
  if (!BUILD_SLOPED_ROOF_IDS.includes(a.id) || !BUILD_SLOPED_ROOF_IDS.includes(b.id) || yardLevel(a) !== yardLevel(b)) return false;
  const edge=roofSharedEdge(a,b,defs);if(!edge)return false;
  const {af,bf,p0,p1}=edge;
  const height = (e, f, x, z) => {
    const angle = (e.rot || 0) * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle), dx = x-f.x0-f.w/2, dz = z-f.z0-f.d/2;
    return roofProfileHeight(e.id,dx*c-dz*s,dx*s+dz*c);
  };
  for (const k of [0,.25,.5,.75,1]) {
    const x=p0[0]+(p1[0]-p0[0])*k, z=p0[1]+(p1[1]-p0[1])*k;
    if (Math.abs(height(a,af,x,z)-height(b,bf,x,z))>1e-6) return false;
  }
  return true;
}

// Candidate anchors stay on the integer grid and retain the player's rotation.
// Prefer adjoining edges over a half-overlap, while keeping manual positioning.
export function buildSnapCandidates(records, defs, id, rot, fx, fz, level) {
  const f = yardFootprint({ id, gx: 0, gz: 0, rot }, defs), out = new Map();
  if (!f) return [];
  const occupied = new Set(records.filter(e => isBuildEdge(e.id) && yardLevel(e) === level).flatMap(buildEdges));
  const offer = (gx, gz, joined = true) => {
    const distance = Math.hypot(fx - (gx + f.w / 2), fz - (gz + f.d / 2));
    if (joined && distance > 1.18) return;
    const e = { id, gx, gz, rot, level };
    if (joined && BUILD_SLOPED_ROOF_IDS.includes(id) && records.some(neighbor =>
      BUILD_SLOPED_ROOF_IDS.includes(neighbor.id) && yardLevel(neighbor) === level && roofSharedEdge(e,neighbor,defs) && !buildRoofSeamMatches(e,neighbor,defs))) return;
    if (isBuildEdge(id) && buildEdges(e).some(k => occupied.has(k))) return;
    const key = `${gx},${gz}`;
    if (!out.has(key) || joined) out.set(key, { gx, gz, rot, w: f.w, d: f.d, joined, distance });
  };
  const atEdge = (x, z, endpoint = 0) => {
    const vertical = rot % 2;
    offer(x - (vertical ? rot === 3 ? 1 : 0 : endpoint * 2), z - (vertical ? endpoint * 2 : rot === 2 ? 1 : 0));
  };
  for (const e of records) {
    const ef = yardFootprint(e, defs); if (!ef) continue;
    if (isBuildEdge(id) && yardLevel(e) === level) {
      if (isBuildEdge(e.id)) {
        const keys = buildEdges(e), [axis, x0, z0] = keys[0].split(','), x = +x0, z = +z0;
        for (const [px, pz] of [[x, z], [x + (axis === 'h' ? 2 : 0), z + (axis === 'v' ? 2 : 0)]]) {
          atEdge(px, pz, 0); atEdge(px, pz, 1);
        }
      } else if (['yard_slab', 'yard_foundation'].includes(e.id)) {
        if (rot % 2) { atEdge(ef.x0, ef.z0); atEdge(ef.x1, ef.z0); }
        else { atEdge(ef.x0, ef.z0); atEdge(ef.x0, ef.z1); }
      }
    }
    if (id === 'yard_stairs' && ['yard_slab','yard_roof_flat'].includes(e.id) && yardLevel(e) === level + 1) {
      if (rot === 0) offer(ef.x0, ef.z0 - 3);
      if (rot === 1) offer(ef.x0 - 3, ef.z0);
      if (rot === 2) offer(ef.x0, ef.z1);
      if (rot === 3) offer(ef.x1, ef.z0);
    }
    if (['yard_slab','yard_foundation'].includes(id) || isBuildRoof(id)) {
      if (yardLevel(e) !== level || !(e.id === id || isBuildRoof(id) && isBuildRoof(e.id) || ['yard_slab','yard_foundation'].includes(id) && ['yard_slab','yard_foundation'].includes(e.id))) continue;
      for (const [gx,gz] of [[ef.x0-f.w,ef.z0],[ef.x1,ef.z0],[ef.x0,ef.z0-f.d],[ef.x0,ef.z1]]) {
        if (BUILD_SLOPED_ROOF_IDS.includes(id) && BUILD_SLOPED_ROOF_IDS.includes(e.id) && !buildRoofSeamMatches({id,gx,gz,rot,level},e,defs)) continue;
        offer(gx,gz);
      }
      if (e.id !== id && !isBuildRoof(id)) offer(ef.x0, ef.z0);
    }
  }
  return [...out.values()].sort((a, b) => a.distance - b.distance);
}
