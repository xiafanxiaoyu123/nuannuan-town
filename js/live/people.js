// 常住居民的稳定身份边界。未核验的原作角色不注册、不挤占旧居民。
import { NPCS } from '../data.js';

export const RESIDENT_IDS = Object.freeze(['man', 'he', 'xu', 'shi', 'nuo', 'qi']);
export const RESIDENTS = RESIDENT_IDS.map((id) => NPCS.find((n) => n.id === id)).filter(Boolean);
export const RESIDENT_LAYOUT = {
  man: { node: 'L3', look: 0 },
  he: { node: 'L2', look: 1 },
  xu: { node: 'W', look: 2 },
  shi: { node: 'W2', look: 3 },
  nuo: { node: 'W1', look: 4 },
  qi: { node: 'P3', look: 5 },
};
export const residentById = (id) => RESIDENTS.find((n) => n.id === id) || null;
