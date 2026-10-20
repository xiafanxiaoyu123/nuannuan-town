// Scene-only reactions to successful care. Never attach this state to a save.
const DURATION = Object.freeze({ pet: 2.2, feed: 3.8 });

export function createAnimalResponse() {
  return { active: null, pending: [] };
}

export function queueAnimalResponse(state, type) {
  if (typeof type !== 'string' || !Object.hasOwn(DURATION, type)) return false;
  if (state.active?.type === type) state.active.remaining = DURATION[type];
  else if (!state.pending.includes(type)) state.pending.push(type);
  return true;
}

export function stepAnimalResponse(state, dt, eligible) {
  // Keep queued and active responses intact while the player cannot see them.
  if (!eligible) return null;
  if (!state.active && state.pending.length) {
    const type = state.pending.shift();
    state.active = { type, remaining: DURATION[type] };
  }
  if (!state.active) return null;
  const type = state.active.type;
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  state.active.remaining = Math.max(0, state.active.remaining - elapsed);
  // Return the response shown during this frame; the next one starts next frame.
  if (state.active.remaining < 1e-9) state.active = null;
  return type;
}

export function clearAnimalResponse(state) {
  state.active = null;
  state.pending.length = 0;
}
