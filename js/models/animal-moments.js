// Short, seekable performances on the existing rig. No geometry, locomotion or
// grounded limb changes: each species uses its own head/torso/tail silhouette.
const TAU = Math.PI * 2;
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
const pulse = (u, from, to) => Math.sin(clamp((u - from) / (to - from)) * Math.PI) ** 2;
const SPECIES = {
  chicken: { lean: .24, reach: .027, tilt: .09, sway: .012, tail: .10, pace: 3.7 },
  duck:    { lean: .15, reach: .018, tilt: .14, sway: .030, tail: .08, pace: 2.2 },
  rabbit:  { lean: .13, reach: .020, tilt: .06, sway: .009, tail: .025, pace: 5.0 },
  sheep:   { lean: .16, reach: .012, tilt: .07, sway: .023, tail: .075, pace: 1.7 },
  goat:    { lean: .19, reach: .019, tilt: .10, sway: .014, tail: .11, pace: 2.9 },
  alpaca:  { lean: .10, reach: .014, tilt: .12, sway: .010, tail: .055, pace: 1.3 },
  cow:     { lean: .20, reach: .016, tilt: .055, sway: .012, tail: .15, pace: 1.1 },
};
const PLACES = new Set(['home', 'hay', 'trough', 'flowers']);

export function sampleAnimalMoment(moment) {
  const s = SPECIES[moment?.species];
  if (!s || !PLACES.has(moment?.place) || !Number.isFinite(moment.age) || !Number.isFinite(moment.duration) || moment.duration <= 0 || moment.age < 0 || moment.age >= moment.duration) return null;
  const t = moment.age, u = t / moment.duration;
  const weight = smooth(u / .16) * (1 - smooth((u - .80) / .20));
  const energy = moment.personality === 'lively' ? 1.12 : moment.personality === 'shy' ? .78 : 1;
  const near = moment.near === true ? 1 : .30, look = pulse(u, .16, .65), react = pulse(u, .54, .83);
  const breath = Math.sin(t * s.pace * TAU), pose = {
    weight, head: [0, 0, 0], offset: [0, 0, 0], torso: [0, 0, 0], tail: [0, 0, 0], wing: .02,
  };
  if (moment.place === 'home') {
    // Settled feet and a softened neck, rather than dropping the body into an
    // unsupported sitting pose. Birds briefly tidy their existing wings.
    pose.head = [.04 + .06 * look, s.tilt * .65 * Math.sin(u * TAU), -s.tilt * .5 * look];
    pose.torso[2] = s.sway * Math.sin(u * TAU);
    pose.tail[1] = s.tail * .7 * Math.sin(u * TAU * 1.5);
    pose.wing = .02 + react * (moment.species === 'duck' ? .17 : .11);
  } else {
    const sniff = moment.place === 'flowers' || moment.place === 'hay';
    const depth = moment.place === 'trough' ? .8 : moment.place === 'hay' ? 1 : .67;
    pose.head = [s.lean * depth * near * look, s.tilt * Math.sin(u * TAU) * look, s.tilt * .45 * react];
    pose.offset[2] = s.reach * near * look;
    pose.tail[1] = s.tail * react * Math.sin(t * 5);
    if (moment.species === 'chicken') {
      // Two brief investigative dips; they never imply eating from an empty trough.
      pose.head[0] += near * .085 * look * Math.max(0, breath);
      pose.offset[2] += near * .010 * look * Math.max(0, breath);
      pose.head[2] += .09 * react;
    } else if (moment.species === 'duck') {
      pose.head[2] += .16 * look;
      pose.wing += .19 * react * (.7 + .3 * Math.sin(t * 17));
      pose.torso[2] = .025 * react * Math.sin(t * 11);
    } else if (moment.species === 'rabbit') {
      pose.head[0] += (sniff ? .026 : .013) * look * breath;
      pose.offset[1] = .006 * look * breath;
      pose.head[2] -= .07 * react;
    } else if (moment.species === 'sheep') {
      pose.head[1] += .08 * react * Math.sin(t * 8);
      pose.torso[2] = .022 * react * Math.sin(t * 7);
      pose.offset[1] = -.008 * look;
    } else if (moment.species === 'goat') {
      pose.head[1] += .12 * look * Math.sin(t * 3.6);
      pose.head[2] += .08 * react;
      pose.head[0] -= .045 * react;
    } else if (moment.species === 'alpaca') {
      pose.head[0] -= .055 * react;
      pose.head[1] += .17 * react;
      pose.head[2] += .10 * look;
    } else if (moment.species === 'cow') {
      pose.head[0] += .025 * look * Math.sin(t * 2.5);
      pose.tail[1] += .14 * react * Math.sin(t * 4);
      pose.torso[2] = .009 * look * Math.sin(t * 2);
    }
  }
  for (const key of ['head', 'offset', 'torso', 'tail']) pose[key] = pose[key].map(v => v * energy);
  return pose;
}

export function applyAnimalMoment(parts, moment) {
  const p = sampleAnimalMoment(moment);
  if (!p) return;
  const mix = (from, to) => from + (to - from) * p.weight;
  const setRotation = (node, target) => {
    if (!node) return;
    node.rotation.set(mix(node.rotation.x, target[0]), mix(node.rotation.y, target[1]), mix(node.rotation.z, target[2]));
  };
  setRotation(parts.head, p.head);
  parts.head.position.x += p.offset[0] * p.weight;
  parts.head.position.y += p.offset[1] * p.weight;
  parts.head.position.z += p.offset[2] * p.weight;
  setRotation(parts.body.children.find(o => o.isMesh), p.torso);
  setRotation(parts.tail, p.tail);
  for (const [i, wing] of parts.wings.entries()) wing.rotation.z = mix(wing.rotation.z, (i ? 1 : -1) * p.wing);
}
