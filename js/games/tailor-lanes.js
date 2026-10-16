// 四轨只改变呈现分配；原谱面的时刻、长按时长、顺序和总数保持不变。
export const TAILOR_LANES = [
  { key: 'D', code: 'KeyD', arrow: 'ArrowLeft', name: '粉色', color: '#f38eb3' },
  { key: 'F', code: 'KeyF', arrow: 'ArrowDown', name: '蓝色', color: '#79bde8' },
  { key: 'J', code: 'KeyJ', arrow: 'ArrowUp', name: '薄荷', color: '#7bc9ac' },
  { key: 'K', code: 'KeyK', arrow: 'ArrowRight', name: '紫色', color: '#b69ae5' },
];

export function tailorKeyLane(code) {
  return TAILOR_LANES.findIndex(lane => lane.code === code || lane.arrow === code);
}

export function fourLaneChart(chart, mirror = false) {
  const next = [0, 0];
  return chart.map(note => {
    const side = note.lane;
    const lane = side * 2 + next[side];
    next[side] = 1 - next[side];
    return { ...note, lane: mirror ? 3 - lane : lane };
  });
}
