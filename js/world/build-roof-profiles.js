// Local model coordinates: x,z in [-1,1], matching a 2 x 2 construction tile.
// Keep this module free of rendering dependencies so save/rule checks can share it.
export const BUILD_SLOPED_ROOF_IDS = Object.freeze([
  'yard_roof_slope', 'yard_roof_corner_outer', 'yard_roof_corner_inner',
]);
export const BUILD_SLOPED_ROOF_BASE = .08;
export const BUILD_SLOPED_ROOF_RISE = 1;
export const BUILD_SLOPED_ROOF_MAX_HEIGHT = BUILD_SLOPED_ROOF_BASE + BUILD_SLOPED_ROOF_RISE;

export function roofProfileHeight(id, x, z) {
  if (!BUILD_SLOPED_ROOF_IDS.includes(id)) return null;
  const u = Math.max(0, Math.min(1, (x + 1) / 2));
  const v = Math.max(0, Math.min(1, (z + 1) / 2));
  const rise = id === 'yard_roof_slope' ? v : id === 'yard_roof_corner_outer' ? Math.min(u, v) : Math.max(u, v);
  return BUILD_SLOPED_ROOF_BASE + BUILD_SLOPED_ROOF_RISE * rise;
}
