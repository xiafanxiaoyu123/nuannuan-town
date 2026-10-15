// 自愿开启的本机性能记录。只记录本游戏的帧、画面设置和资源计数，不上传数据。
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
const round = (n) => Math.round(n * 100) / 100;
export const performanceLog = {
  active: null,
  last: null,
  start(seconds = 60) {
    this.stop();
    const duration = [60, 180, 300].includes(seconds) ? seconds : 60;
    this.active = { version: 1, startedAt: new Date().toISOString(), duration, samples: [], pauses: 0, visibleSeconds: 0,
      note: '帧率为实际渲染间隔；CPU耗时是主线程提交一帧的时间，不是GPU耗时。资源是对象数量，不是显存字节。后台时段不计入帧率。',
      _start: performance.now(), _dt: [], _cpu: [], _sum: 0 };
    this.timer = setTimeout(() => this.stop(), duration * 1000);
    return this.active;
  },
  sample(dt, cpuMs, app) {
    const r = this.active;
    if (!r || !(dt > 0) || !Number.isFinite(dt)) return;
    this.engine = app;
    r._dt.push(dt * 1000); r._cpu.push(cpuMs); r._sum += dt; r.visibleSeconds += dt;
    if (r._sum < 1) return;
    this.flush(app);
  },
  flush(app = this.engine) {
    const r = this.active;
    if (!r || !r._dt.length || !app) return;
    this.engine = app;
    const v = app.view, info = app.renderer.info;
    r.samples.push({ atSeconds: round((performance.now() - r._start) / 1000), scene: v?.id || v?.zone || v?.constructor?.name || 'unknown',
      fps: round(r._dt.length / r._sum), frameP95Ms: round(percentile(r._dt, 0.95)), cpuP95Ms: round(percentile(r._cpu, 0.95)),
      slowFrames: r._dt.filter(t => t > 50).length, frames: r._dt.length, seconds: round(r._sum),
      pixelRatio: round(app.pixelRatio), viewport: [app.width, app.height], renderPixels: [app.canvas.width, app.canvas.height],
      targetFps: app.fpsCap === 0 ? 'unlimited' : app.fpsCap ?? 60,
      activeFrameLimit: app.capNow === 0 ? 'unlimited' : app.capNow ?? app.fpsCap ?? 60,
      postProcessing: app.usePost, drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, touchDevice: app.mobile });
    r._dt = []; r._cpu = []; r._sum = 0;
  },
  hidden() {
    if (this.active) { this.flush(); this.active.pauses++; }
  },
  stop() {
    clearTimeout(this.timer);
    if (!this.active) return this.last;
    this.flush();
    const { _start, _dt, _cpu, _sum, ...report } = this.active;
    report.finishedAt = new Date().toISOString(); report.visibleSeconds = round(report.visibleSeconds);
    const frames = report.samples.reduce((n, r) => n + r.frames, 0), seconds = report.samples.reduce((n, r) => n + r.seconds, 0);
    report.summary = { averageFps: seconds ? round(frames / seconds) : 0, samples: report.samples.length,
      slowFrames: report.samples.reduce((n, r) => n + r.slowFrames, 0) };
    this.last = report; this.active = null;
    return report;
  },
};
