// 引擎外壳：渲染器、后期处理、视图切换、主循环
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { updateTweens, clamp } from './util.js';
import { S } from './state.js';
import { fx } from './fx.js';
import { setGeoDetail } from './kit.js';
import { performanceLog } from './performance-log.js';
import { diagnostics } from '../devtools/diagnostics.js';
import { audio } from './audio.js';
import { isMobileDevice } from './orient.js';
import { normalizeGraphicsSettings, effectiveQuality, effectiveFpsLimit, resolveAntiAlias } from './graphics-settings.js';

// 移轴 + 暗角 + 轻微提饱和：让小镇看起来像桌上的微缩模型
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    res: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.5 },
    amount: { value: 5 },
    vig: { value: 0.22 },
    sat: { value: 1.1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus, amount, vig, sat;
    varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float b = smoothstep(0.24, 0.6, d) * amount * res.y / 1080.0;
      vec4 c = texture2D(tDiffuse, vUv);
      if (b > 0.25) {
        vec4 acc = c; float w = 1.0;
        for (int i = 0; i < 14; i++) {
          float a = float(i) * 2.39996;
          float r = sqrt((float(i) + 0.5) / 14.0) * b;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r / res);
          w += 1.0;
        }
        c = acc / w;
      }
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.9);
      float v = smoothstep(0.82, 0.28, length(q));
      c.rgb *= mix(1.0 - vig, 1.0, v);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat);
      gl_FragColor = c;
    }`,
};

class App {
  constructor() {
    this.view = null;
    this.time = 0;
    this.paused = false;
    this.fpsAvg = 60;
    this.hooks = [];
    this.lowFrames = 0;
    this.shadowStates = new WeakMap();
  }

  init(canvas) {
    this.canvas = canvas;
    // Android 浏览器对高质量抗锯齿、半浮点多重采样和高性能电源策略的
    // 组合兼容性差异很大。先判断触屏设备，再选择稳定的低功耗路径；
    // 桌面端仍保留原来的高质量路径。
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.mobile = coarse || !!window.NikkiNative?.setOrientation;
    this.quality = effectiveQuality(S.settings, this.mobile);
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile && S.settings.perf?.aa !== false && normalizeGraphicsSettings(S.settings).antiAlias === 'auto',
      powerPreference: this.mobile ? 'low-power' : 'high-performance',
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    this.nativeAntialias = !!r.getContext().getContextAttributes()?.antialias;
    // 原生 Android WebView 有时把触屏报成 fine，使用已有原生接口补充识别。
    if (!S.settings.qv) S.settings.qv = 2;
    const q = this.quality;
    // 模型精细度：手机默认档和省电档用省面数的方块，电脑和手机「精致」档用标准
    setGeoDetail(this.mobile ? q === 'high' : q !== 'low');
    r.shadowMap.enabled = !(this.mobile && q === 'low');
    // 软阴影在手机上很贵；阴影类型要在材质编译前定下来，所以只在启动时决定
    r.shadowMap.type = this.mobile && q !== 'high' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.shadowSize = this.mobile && q !== 'high' ? 1024 : 2048;
    // 发热调节参数（手机均衡/省电档默认只在静止/菜单时降帧，操作中的画质和帧率上限不变；精致档保持原有节奏，可在调试里改来做对比测试）：
    //   dynFps  动静分档帧率：玩家在操作时按上限跑，站着不动或开着菜单降到对应上限
    //   shadowHz 阴影图每秒更新几次（只对手机「均衡」档生效）；scale 手机 3D 分辨率倍率
    this.perf = Object.assign({ dynFps: this.mobile && q !== 'high', idleFps: 30, uiFps: 30, idleAfter: 2.5, shadowHz: 20, scale: 1 }, S.settings.perf || {});
    this.lastInput = performance.now();
    this.capNow = 60;
    this.isUiOpen = () => false;
    const touch = () => { this.lastInput = performance.now(); };
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup', 'wheel', 'touchstart', 'touchmove', 'touchend']) window.addEventListener(ev, touch, { passive: true, capture: true });
    this.pixelRatio = 1;
    this.acc = 0;
    this.frameElapsed = 0;
    this.shadowElapsed = 0;
    this.tick = 0;

    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: this.mobile ? THREE.UnsignedByteType : THREE.HalfFloatType,
      samples: this.mobile ? 0 : 4,
    });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.7, 0.9);
    this.finish = new ShaderPass(FinishShader);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.finish);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    // FXAA 在输出色彩转换后工作，避免对线性颜色作边缘判断。
    this.composer.addPass(this.fxaa);

    this.applyQuality();
    // 旋转手机时部分 WebView 只派发 orientationchange / visualViewport.resize，
    // 不一定派发普通 resize；统一排队一次重排，避免 Three 画布和 HUD 仍沿用旧尺寸。
    this._resizeQueued = false;
    this.queueResize = () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      const run = () => { this._resizeQueued = false; this.resize(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    };
    window.addEventListener('resize', this.queueResize, { passive: true });
    window.addEventListener('orientationchange', this.queueResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.queueResize, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', this.queueResize, { passive: true });
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
    document.addEventListener('visibilitychange', () => this.setBackground(document.hidden));
  }

  setBackground(hidden) {
    this.backgroundHidden = !!hidden;
    this.syncSuspension();
  }

  setOrientationBlocked(blocked) {
    this.orientationBlocked = !!blocked;
    this.syncSuspension();
  }

  syncSuspension() {
    // 页面后台和横屏提示各自持有暂停原因，任一解除都不能越过另一原因。
    const hidden = !!this.backgroundHidden || !!this.orientationBlocked;
    if (!!this.suspended === hidden) return;
    this.suspended = hidden;
    this.acc = 0;
    this.frameElapsed = 0;
    this.shadowElapsed = 0;
    this.clock.getDelta(); // 恢复前丢弃后台经过的时间，避免一回来就跳时钟和判定。
    if (hidden) {
      performanceLog.hidden();
      this.backgroundMusic = !audio.musicPaused;
      // 音游按音频时钟判定，不能仅停渲染；保留已有的选卡/菜单暂停。
      this.backgroundView = this.view?.pause?.() ? this.view : null;
      audio.pauseMusic();
      this.view?.keys?.clear();
      if (this.view?.stick) this.view.stick.x = this.view.stick.y = 0;
    } else {
      if (this.backgroundView === this.view) this.view.resume();
      else this.view?.resumeAfterSuspension?.();
      if (this.backgroundMusic && !this.view?.paused) audio.resumeMusic();
      this.backgroundView = null; this.backgroundMusic = false;
    }
    this.renderer.setAnimationLoop(hidden ? null : () => this.frame());
  }

  // 画质档位：high 精致（后期处理全开）/ mid 均衡（直接渲染，手机默认）/ low 省电（再降分辨率、锁 30 帧）
  applyQuality() {
    const settings = normalizeGraphicsSettings(S.settings);
    const q = (this.quality = effectiveQuality(settings, this.mobile));
    const dpr = window.devicePixelRatio || 1;
    // 画质切换后同步默认动静分档；调试/热测显式传入 dynFps 时保留它。
    const configuredDynFps = S.settings.perf?.dynFps;
    if (this.perf) this.perf.dynFps = typeof configuredDynFps === 'boolean' ? configuredDynFps : this.mobile && q !== 'high';
    let pr = this.mobile ? Math.min(dpr, q === 'high' ? 1.5 : q === 'mid' ? 1.25 : 1) : Math.min(dpr, q === 'low' ? 1 : 2);
    // 手机屏分辨率很高，长边渲染像素封顶，避免为看不出的细节发热
    if (this.mobile) pr = Math.min(pr, (q === 'high' ? 1920 : 1500) / Math.max(window.innerWidth, window.innerHeight, 1));
    if (this.mobile) pr *= this.perf.scale;
    pr *= settings.renderScale;
    // 明确选择高清时放宽原有像素预算；仍限制极高分辨率设备的离屏缓冲大小。
    this.pixelRatio = Math.max(0.6, Math.min(pr, this.mobile ? 2.25 : 3, 4096 / Math.max(window.innerWidth, window.innerHeight, 1)));
    this.postEffects = q === 'high';
    this.aa = resolveAntiAlias(settings, this.mobile, q, this.renderer.capabilities?.maxSamples);
    if (this.aa.mode === 'native' && !this.nativeAntialias) this.aa = { ...this.aa, mode: 'fxaa', fallback: true };
    // 显式关闭桌面原生 MSAA 时，经无采样缓冲输出，切换不用重建 WebGL 上下文。
    this.usePost = this.postEffects || this.aa.mode === 'fxaa' || this.aa.samples > 0 || (this.aa.mode === 'off' && !!this.nativeAntialias);
    if (this.bloom) this.bloom.enabled = this.postEffects;
    if (this.finish) this.finish.enabled = this.postEffects;
    if (this.fxaa) this.fxaa.enabled = this.aa.mode === 'fxaa';
    for (const target of [this.composer?.renderTarget1, this.composer?.renderTarget2]) {
      if (target && target.samples !== this.aa.samples) { target.samples = this.aa.samples; target.dispose(); }
    }
    // 0 仅在运行时表示电脑不做额外限帧；存档用字符串，仍沿用浏览器 RAF / 垂直同步。
    const fpsLimit = effectiveFpsLimit(settings, isMobileDevice());
    this.fpsCap = fpsLimit === 'unlimited' ? 0 : fpsLimit === 'auto' ? q === 'low' ? 30 : 60 : fpsLimit;
    try { window.NikkiNative?.setFrameRatePreference?.(fpsLimit === 'auto' || fpsLimit === 'unlimited' ? 0 : fpsLimit); } catch { /* 旧安装包和网页使用浏览器帧率。 */ }
    this.acc = 0; this.frameElapsed = 0; this.shadowElapsed = 0;
    this.autoNoShadow = false;
    this.renderer.shadowMap.enabled = !(this.mobile && q === 'low');
    this.renderer.shadowMap.autoUpdate = !(this.mobile && q !== 'high');
    this.renderer.shadowMap.needsUpdate = this.renderer.shadowMap.enabled;
    this.syncShadowMaterials(this.view);
    this.lowFrames = 0;
    this.resize();
  }

  syncShadowMaterials(view) {
    if (!view) return;
    const enabled = this.renderer.shadowMap.enabled;
    if (this.shadowStates.get(view.scene) === enabled) return;
    // Three 不会仅因 enabled 改变就重选 shader；复用衣橱/小镇场景时也要同步。
    view.scene.traverse((obj) => {
      if (!obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) material.needsUpdate = true;
    });
    this.shadowStates.set(view.scene, enabled);
  }

  resize() {
    // 窗口被最小化 / 面板隐藏时尺寸会是 0，保持上一次的有效尺寸
    if (!window.innerWidth || !window.innerHeight) return;
    const w = (this.width = window.innerWidth), h = (this.height = window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.finish.uniforms.res.value.set(w * this.pixelRatio, h * this.pixelRatio);
    this.fxaa?.uniforms.resolution.value.set(1 / (w * this.pixelRatio), 1 / (h * this.pixelRatio));
    if (this.view) this.fitCamera(this.view);
  }
  fitCamera(view) {
    const cam = view.camera;
    cam.aspect = this.width / this.height;
    // 画面比参考比例更窄时加大纵向视野，保证横向内容不被裁掉
    if (view.baseFov) {
      const ref = view.refAspect ?? 1.6;
      const half = Math.tan((view.baseFov * Math.PI) / 360);
      cam.fov = cam.aspect < ref ? Math.min(view.maxFov ?? 66, (Math.atan((half * ref) / cam.aspect) * 360) / Math.PI) : view.baseFov;
    }
    cam.updateProjectionMatrix();
    view.onResize && view.onResize(this.width, this.height);
  }

  setView(view) {
    if (this.view && this.view.onExit) this.view.onExit();
    this.view = view;
    this.syncShadowMaterials(view);
    this.renderPass.scene = view.scene;
    this.renderPass.camera = view.camera;
    const p = view.post || {};
    this.finish.uniforms.amount.value = p.tilt ?? 5;
    this.finish.uniforms.focus.value = p.focus ?? 0.5;
    this.finish.uniforms.vig.value = p.vig ?? 0.22;
    this.bloom.strength = p.bloom ?? 0.22;
    this.fitCamera(view);
    view.onEnter && view.onEnter();
    // 转场动画可能在后台完成，新场景的 onEnter 不应重新播起音乐。
    if (this.suspended) {
      this.backgroundMusic = !audio.musicPaused;
      this.backgroundView = view.pause?.() ? view : null;
      audio.pauseMusic();
    }
  }

  // 动静分档：操作中按上限跑，站着不动或开着菜单时降帧，玩家几乎看不出，但 GPU 和 CPU 的活少了一半
  desiredCap() {
    const base = this.fpsCap ?? 60, p = this.perf, v = this.view;
    if (!p.dynFps || !v || !v.dynFps) return base;
    const capped = limit => base === 0 ? limit : Math.min(base, limit);
    if (this.isUiOpen()) return capped(p.uiFps);
    if (performance.now() - this.lastInput < p.idleAfter * 1000 || (v.isActive && v.isActive())) return base;
    return capped(p.idleFps);
  }
  frame() {
    if (this.suspended) return;
    let dt = this.clock.getDelta();
    // 限帧：没到下一帧的时间就整帧跳过（不更新也不渲染），省下的就是电和热
    const cap = (this.capNow = this.desiredCap());
    if (cap > 0) {
      this.acc += dt;
      this.frameElapsed += dt;
      const period = 1 / cap;
      if (this.acc + 1e-7 < period) return;
      this.acc = Math.max(0, this.acc - Math.floor((this.acc + 1e-7) / period) * period);
      dt = this.frameElapsed;
      this.frameElapsed = 0;
    } else {
      // 从静止限帧恢复操作时，把此前跳过的时间并入本帧，不留下积压或跳时。
      dt += this.frameElapsed;
      this.acc = 0; this.frameElapsed = 0;
    }
    const frameSeconds = dt, startedAt = performance.now();
    const recording = diagnostics.active;
    let stageAt = recording ? startedAt : 0;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    updateTweens(dt);
    if (recording) { const now = performance.now(); diagnostics.stage('tweens', now - stageAt); stageAt = now; }
    fx.update(dt);
    if (recording) { const now = performance.now(); diagnostics.stage('effects', now - stageAt); stageAt = now; }
    const v = this.view;
    if (!v) return;
    if (!this.width || !window.innerWidth) { if (window.innerWidth) this.resize(); return; }
    v.update && v.update(dt, this.time);
    if (recording) { const now = performance.now(); diagnostics.stage('view', now - stageAt); stageAt = now; }
    for (const f of this.hooks) f(dt, this.time);
    if (recording) { const now = performance.now(); diagnostics.stage('hooks', now - stageAt); stageAt = now; }
    // 阴影按真实经过时间限频，高刷 / 无限制 / 降帧切换都不会改变更新预算。
    if (!this.renderer.shadowMap.autoUpdate) {
      this.shadowElapsed += frameSeconds;
      const period = 1 / Math.max(1, Number(this.perf.shadowHz) || 20);
      if (this.shadowElapsed + 1e-7 >= period) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowElapsed = Math.max(0, this.shadowElapsed - Math.floor((this.shadowElapsed + 1e-7) / period) * period);
      }
    }
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (recording) stageAt = performance.now();
    const draw = () => this.usePost ? this.composer.render(dt) : this.renderer.render(v.scene, v.camera);
    if (recording) diagnostics.renderFrame(this, v, draw);
    else if (v.renderOptimizer) v.renderOptimizer.render(draw);
    else draw();
    this.renderer.info.autoReset = true;
    const finishedAt = performance.now();
    if (recording) {
      diagnostics.stage('render', finishedAt - stageAt);
      diagnostics.sampleFrame(frameSeconds, finishedAt - startedAt, this);
    }
    performanceLog.sample(frameSeconds, finishedAt - startedAt, this);
    // 自适应：持续掉帧时先降像素比，手机上再不行就锁 30 帧（稳定的 30 帧比忽高忽低更顺）
    this.fpsAvg += (1 / Math.max(frameSeconds, 0.001) - this.fpsAvg) * 0.05;
    const target = this.fpsCap ?? 60;
    // 浏览器可能仍只提供 60 Hz 回调；手动 90/120 不应因此一直降低清晰度。
    // 高刷档仍以低于常规 60 帧的持续掉帧触发保护，不把屏幕上限误判成 GPU 过载。
    const protectionTarget = target === 0 ? 60 : Math.min(target, 60);
    const idleLimited = this.capNow > 0 && (target === 0 || this.capNow < target);
    if (S.settings.adaptiveQuality === false || idleLimited) this.lowFrames = 0;
    else if (this.time > 4 && this.fpsAvg < protectionTarget * 0.8) {
      if (++this.lowFrames > 150) {
        this.lowFrames = 0;
        if (this.pixelRatio > 1) { this.pixelRatio = Math.max(1, this.pixelRatio - 0.25); this.resize(); }
        // 降到 1 倍还是很卡（多半是模拟器或没有显卡加速的设备）：先关阴影，再继续降分辨率
        else if (this.fpsAvg < protectionTarget * 0.6 && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.autoNoShadow = true; this.syncShadowMaterials(this.view); }
        else if (this.fpsAvg < protectionTarget * 0.6 && this.pixelRatio > 0.6) { this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.2); this.resize(); }
        else if (this.mobile && this.fpsCap !== 30 && effectiveFpsLimit(S.settings, isMobileDevice()) === 'auto') { this.fpsCap = 30; this.fpsAvg = 30; }
      }
    } else this.lowFrames = 0;
  }

  // 屏幕坐标 → 射线
  ray(clientX, clientY, camera) {
    this._rc = this._rc || new THREE.Raycaster();
    this._v2 = this._v2 || new THREE.Vector2();
    this._v2.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this._rc.setFromCamera(this._v2, camera || this.view.camera);
    return this._rc;
  }
  // 世界坐标 → 屏幕像素
  project(v3, camera) {
    this._p = this._p || new THREE.Vector3();
    this._p.copy(v3).project(camera || this.view.camera);
    return { x: (this._p.x * 0.5 + 0.5) * this.width, y: (-this._p.y * 0.5 + 0.5) * this.height, behind: this._p.z > 1 };
  }
}

export const app = new App();
