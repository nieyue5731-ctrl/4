'use strict';

class Game {
    constructor() {
        this.canvas = document.getElementById('game');
        this.renderer = new Renderer(this.canvas);
        this.particles = new ParticleSystem();
        this.ambientParticles = new AmbientParticles();
        this.droppedItems = new DroppedItemManager(); // 掉落物管理器

        // RAF 主循环：复用回调，避免每帧闭包分配；切后台可自动停帧省电
        this._rafCb = this.loop.bind(this);
        this._rafRunning = false;
        this._rafStoppedForHidden = false;

        // 自适应性能：低帧率自动降级（不改玩法，只改特效/辉光）
        this._perf = {
            level: 'high', // 'high' | 'low'
            fps: 60,
            t0: 0,
            frames: 0,
            lowForMs: 0,
            highForMs: 0
        };

        this.world = null;
        this.player = null;
        this.camera = { x: 0, y: 0 };

        // Camera shake (subtle, for landing feedback)
        this._shakeMs = 0;
        this._shakeTotalMs = 0;
        this._shakeAmp = 0;
        this._shakeX = 0;
        this._shakeY = 0;

        this.input = { left: false, right: false, jump: false, sprint: false, mouseX: 0, mouseY: 0, mouseLeft: false, mouseRight: false };
        this.isMobile = Utils.isMobile();

        // UX+：加载设置并立即应用到文档（影响摇杆/按钮尺寸、小地图显示、减少动态等）
        this.settings = GameSettings.applyToDocument(GameSettings.load());

        // UI Flush：集中 DOM 写入（避免每帧/每子步直接写 DOM）
        try {
            const UFS = (window.TU && window.TU.UIFlushScheduler) ? window.TU.UIFlushScheduler : null;
            this.uiFlush = UFS ? new UFS() : null;
        } catch (_) { this.uiFlush = null; }

        // Quality/Performance Manager：统一下发 dprCap/粒子上限/光照&小地图刷新频率/渲染特效开关
        try {
            const QM = (window.TU && window.TU.QualityManager) ? window.TU.QualityManager : null;
            this.quality = QM ? new QM(this) : null;
        } catch (_) { this.quality = null; }

        this.fpsEl = document.getElementById('fps');
        this.audio = new AudioManager(this.settings);
        this.audio.arm();
        this.saveSystem = new SaveSystem(this);
        this.paused = false;
        this._inputBlocked = false;
        this.seed = null;
        this._lastManualSaveAt = 0;
        // 系统分层：集中管理各子系统，降低 Game 的“上帝对象”体积
        this.services = Object.freeze({
            input: new InputManager(this),
            inventory: new InventorySystem(this),
        });

        this.timeOfDay = 0.35;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 60;
        this.lastFpsUpdate = 0;

        // 传奇史诗级手感优化：固定时间步长 + 插值渲染（更稳、更跟手、更不飘）
        this._fixedStep = 1000 / 60;      // 16.6667ms
        this._accumulator = 0;
        this._maxSubSteps = 5;            // 防止极端帧卡导致“物理螺旋”
        this._camPrevX = 0;
        this._camPrevY = 0;
        this._renderCamera = { x: 0, y: 0 };
        this._lookAheadX = 0;

        this.ui = null;
        this.minimap = null;
        this.touchController = null;

        this.miningProgress = 0;
        this.miningTarget = null;

        // 光照扩散：复用队列与 visited 标记，避免 Set+shift 带来的卡顿
        this._lightVisited = null;
        this._lightVisitMark = 1;
        this._lightQx = [];
        this._lightQy = [];
        this._lightQl = [];
        this._lightSrcX = [];
        this._lightSrcY = [];
        this._lightSrcL = [];
        this._latestTouchInput = null;

        // 连续放置保护：固定时间步长下，移动端长按可能在同一帧内触发多次放置，导致卡顿/卡死
        // 方案：放置动作节流 + 将昂贵的光照/小地图/UI 更新合并为“每帧最多一次”
        this._nextPlaceAt = 0;
        this._placeIntervalMs = (this.settings && this.settings.placeIntervalMs) ? this.settings.placeIntervalMs : 80; // 默认约 12.5 次/秒
        this._deferred = { light: [], hotbar: false, minimap: false };

        // Quality/Performance Manager 下发：昂贵系统的刷新频率
        this._lightIntervalMs = 0;        // 光照刷新节流（0=不节流）
        this._lastLightUpdateAt = 0;

        // 切换标签页/锁屏：重置计时器，避免回到页面时“瞬移/掉帧抖动”
        this._wasHidden = false;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._wasHidden = true;
                this._stopRafForHidden();
                if (this.quality && typeof this.quality.onVisibilityChange === 'function') this.quality.onVisibilityChange(true);
            } else {
                if (this.quality && typeof this.quality.onVisibilityChange === 'function') this.quality.onVisibilityChange(false);
                // 回到前台：重置计时器，避免超大 dt；如之前停帧则恢复
                this.lastTime = performance.now();
                this._accumulator = 0;
                this._wasHidden = false;
                this._resumeRafIfNeeded();
            }
        }, { passive: true });

        this._bindEvents();
    }

    addCameraShake(amp = 1.5, ms = 100) {
        // Respect reduced motion; also keep it subtle
        try {
            if (this.settings && this.settings.reducedMotion) return;
        } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
        const a = Math.max(0, +amp || 0);
        const d = Math.max(0, +ms || 0);
        if (d <= 0 || a <= 0) return;

        // Stack by taking the stronger/longer
        this._shakeAmp = Math.max(this._shakeAmp || 0, a);
        this._shakeMs = Math.max(this._shakeMs || 0, d);
        this._shakeTotalMs = Math.max(this._shakeTotalMs || 0, this._shakeMs);
    }

    _tickCameraShake(dtClamped) {
        if (!this._shakeMs || this._shakeMs <= 0) {
            this._shakeMs = 0;
            this._shakeTotalMs = 0;
            this._shakeAmp = 0;
            this._shakeX = 0;
            this._shakeY = 0;
            return;
        }

        this._shakeMs = Math.max(0, this._shakeMs - dtClamped);
        const total = Math.max(1, this._shakeTotalMs || 1);
        const t = this._shakeMs / total; // 1 -> 0
        const strength = (this._shakeAmp || 0) * t;

        // Light, slightly vertical-biased shake
        this._shakeX = (Math.random() * 2 - 1) * strength;
        this._shakeY = (Math.random() * 2 - 1) * strength * 0.65;
    }

    async init() {
        const loadProgress = DOM.byId(UI_IDS.loadProgress);
        const loadStatus = DOM.byId(UI_IDS.loadStatus);

        // UX+：存档选择（若存在则允许继续）
        const start = await SaveSystem.promptStartIfNeeded();
        const save = (start && start.mode === 'continue') ? start.save : null;
        if (start && start.mode === 'new') {
            // 新世界会覆盖旧进度
            SaveSystem.clear();
        }

        const seed = (save && Number.isFinite(save.seed)) ? save.seed : Date.now();
        this.seed = seed;
        this.saveSystem.seed = seed;

        const gen = new WorldGenerator(CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT, seed);
        const data = await gen.generate((s, p) => {
            loadStatus.textContent = s;
            loadProgress.style.width = p + '%';
        });

        this.world = data;

        // 如果有存档：应用世界差异与玩家状态
        if (save) {
            this.saveSystem.importLoaded(save);
            this.saveSystem.applyToWorld(this.world, save);
            // 轻量刷新光照/小地图（避免全量重算）
            try {
                let c = 0;
                for (const k of (save._diffMap ? save._diffMap.keys() : [])) {
                    const [x, y] = k.split(',').map(n => parseInt(n, 10));
                    if (Number.isFinite(x) && Number.isFinite(y)) this._updateLight(x, y);
                    if (++c > 4000) break; // 防止极端情况下卡顿
                }
                this.minimap && this.minimap.invalidate();
            } catch { }

            if (typeof save.timeOfDay === 'number' && isFinite(save.timeOfDay)) {
                this.timeOfDay = save.timeOfDay;
            }
            Toast.show('🗂 已读取存档', 1400);
        }

        const spawnX = Math.floor(CONFIG.WORLD_WIDTH / 2);
        let spawnY = 0;
        for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
            if (this.world.tiles[spawnX][y] !== BLOCK.AIR) { spawnY = y - 3; break; }
        }

        this.player = new Player(spawnX * CONFIG.TILE_SIZE, spawnY * CONFIG.TILE_SIZE);
        this.ui = new UIManager(this.player, this.renderer.textures, this.uiFlush);
        this.crafting = new CraftingSystem(this);
        this.inventoryUI = new InventoryUI(this);
        this.minimap = new Minimap(this.world);
        if (this.quality && typeof this.quality.onSettingsChanged === 'function') this.quality.onSettingsChanged();

        // 存档：恢复玩家属性与背包
        if (save) {
            this.saveSystem.applyToPlayer(this.player, this.ui, save);
        }

        // 设备提示文案
        applyInfoHintText(this.isMobile);

        // 绑定 UX+ 按钮（暂停/设置/保存等）
        wireUXUI(this);

        if (this.isMobile) {
            this.touchController = new TouchController(this);
        }

        // 资源预热：强制生成常用纹理/辉光，避免开局瞬间卡顿或闪烁
        try {
            const warmTex = this.renderer && this.renderer.textures;
            if (warmTex && warmTex.get) {
                const ids = Object.keys(BLOCK_DATA).map(Number).filter(n => Number.isFinite(n));
                const total = ids.length || 1;

                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    warmTex.get(id);
                    if (this.renderer.enableGlow && warmTex.getGlow && BLOCK_LIGHT[id] > 5) warmTex.getGlow(id);

                    // 让出主线程：避免卡死 loading 动画
                    if ((i % 18) === 0) {
                        const p = Math.round((i / total) * 100);
                        loadProgress.style.width = p + '%';
                        loadStatus.textContent = '🎨 预热纹理 ' + p + '%';
                        await new Promise(r => setTimeout(r, 0));
                    }
                }

                loadProgress.style.width = '100%';
                loadStatus.textContent = '✅ 纹理就绪';
            }

            // 强制初始化玩家缓存（避免首帧闪烁）
            if (Player && Player._initSpriteCache) Player._initSpriteCache();
        } catch (e) {
            console.warn('prewarm failed', e);
        }

        // 淡出加载界面
        const loading = DOM.byId(UI_IDS.loading);
        loading.style.transition = 'opacity 0.5s';
        loading.style.opacity = '0';
        setTimeout(() => loading.style.display = 'none', 500);

        this._startRaf();
    }

    _bindEvents() {
        // 分层：输入绑定委托给 InputManager（行为不变）
        this.services.input.bind();
    }

    // ───────────────────────── 性能自适应（体验优化） ─────────────────────────
    _setQuality(level) {
        if (this._perf.level === level) return;
        this._perf.level = level;

        // 低档时同步给 CSS（UI 也可降级特效）：与 QualityManager.apply 的 tu-low-power 互补
        try {
            if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.toggle('tu-quality-low', level === 'low');
            }
        } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
        // 粒子数量：低档减少上限，显著降低 GC 与 draw calls
        if (this.particles) this.particles.max = (level === 'low') ? 220 : 400;

        // 发光方块阴影辉光：低档关闭 shadowBlur（通常是最吃性能的 2D 特效之一）
        if (this.renderer) this.renderer.enableGlow = (level !== 'low');

        // 动态分辨率：低档略降渲染分辨率，能显著提升帧率且视觉几乎无损
        if (this.renderer && this.renderer.setResolutionScale) {
            this.renderer.lowPower = (level === 'low');
            this.renderer.setResolutionScale(level === 'low' ? 0.85 : 1);
        }

        // 夜间萤火虫：低档降低数量（不彻底关闭，保留氛围）
        if (this.ambientParticles && this.ambientParticles.container) {
            this.ambientParticles.container.style.opacity = (level === 'low') ? '0.7' : '1';
        }

        // 反馈提示（不打扰，1 秒消失）
        try { Toast.show(level === 'low' ? '⚡ 已自动降低特效以保持流畅' : '✨ 已恢复高特效', 1000); } catch { }
    }

    _haptic(ms) {
        if (!this.isMobile) return;
        if (!this.settings || this.settings.vibration === false) return;
        try { if (navigator.vibrate) navigator.vibrate(ms); } catch { }
    }

    _perfTick(dtClamped) {
        // 每帧统计，0.5 秒刷新一次 fps
        const p = this._perf;
        p.frames++;

        const now = this.lastTime; // loop 内已更新 lastTime
        if (!p.t0) p.t0 = now;

        const span = now - p.t0;
        if (span < 500) return;

        const fps = (p.frames * 1000) / span;
        p.fps = fps;
        p.frames = 0;
        p.t0 = now;

        // 连续低于阈值 2 秒：降级；连续高于阈值 3 秒：恢复
        if (fps < 45) {
            p.lowForMs += span;
            p.highForMs = 0;
        } else if (fps > 56) {
            p.highForMs += span;
            p.lowForMs = 0;
        } else {
            // 中间区间：不累计
            p.lowForMs = Math.max(0, p.lowForMs - span * 0.5);
            p.highForMs = Math.max(0, p.highForMs - span * 0.5);
        }

        const autoQ = (!this.settings) || (this.settings.autoQuality !== false);
        // 动态分辨率微调（AutoQuality 下启用）：用“更平滑”的方式稳住帧率，避免一刀切抖动
        // 注意：只在 0.5s 的统计窗口内调整一次，不会造成频繁 resize
        if (autoQ && this.renderer && this.renderer.setResolutionScale) {
            const f = fps;
            let target = 1;
            if (f < 35) target = 0.72;
            else if (f < 45) target = 0.72 + (f - 35) * (0.13 / 10); // 0.72 -> 0.85
            else if (f < 58) target = 0.85 + (f - 45) * (0.15 / 13); // 0.85 -> 1.00
            else target = 1;

            // 已处于 low 档时，略降低上限以进一步省电（不影响玩法）
            if (p.level === 'low') target = Math.min(target, 0.90);

            const cur = (typeof this.renderer.resolutionScale === 'number') ? this.renderer.resolutionScale : 1;
            const next = cur + (target - cur) * 0.35;
            this.renderer.setResolutionScale(next);
        }

        if (autoQ) {
            if (p.level === 'high' && p.lowForMs >= 2000) this._setQuality('low');
            if (p.level === 'low' && p.highForMs >= 3000) this._setQuality('high');
        } else {
            // 手动模式：不做自动切换，避免来回抖动
            p.lowForMs = 0;
            p.highForMs = 0;
        }
    }

    _startRaf() {
        if (this._rafRunning) return;
        this._rafRunning = true;
        if (this._rafRunning) requestAnimationFrame(this._rafCb);
    }

    _stopRafForHidden() {
        this._rafRunning = false;
        this._rafStoppedForHidden = true;
    }

    _resumeRafIfNeeded() {
        if (this._rafRunning) return;
        if (!this._rafStoppedForHidden) return;
        if (document.hidden) return;
        this._rafStoppedForHidden = false;
        // 避免切回前台产生超大 dt
        this.lastTime = 0;
        this._accumulator = 0;
        this._startRaf();
    }

    loop(timestamp) {
        // 允许外部显式停帧（例如错误兜底层/手动暂停渲染）
        if (!this._rafRunning) return;

        // 切后台：停帧省电（不再继续排队 RAF）
        if (document.hidden) {
            this._stopRafForHidden();
            return;
        }

        // 固定时间步长：物理/手感不再随 FPS 浮动；渲染用插值保证顺滑
        if (!this.lastTime) this.lastTime = timestamp;

        let dtRaw = timestamp - this.lastTime;
        if (dtRaw < 0) dtRaw = 0;
        // 防止切回标签页/卡顿造成“物理螺旋”
        if (dtRaw > 250) dtRaw = 250;
        this.lastTime = timestamp;

        this.frameCount++;
        if (timestamp - this.lastFpsUpdate > 500) {
            const span = (timestamp - this.lastFpsUpdate) || 1;
            this.fps = Math.round(this.frameCount * 1000 / span);
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
            if (this.fpsEl && this.settings && this.settings.showFps) {
                const el = this.fpsEl;
                const v = this.fps + ' FPS';
                if (this.uiFlush && typeof this.uiFlush.enqueue === 'function') {
                    this.uiFlush.enqueue('hud:fps', () => { if (el) el.textContent = v; });
                } else {
                    el.textContent = v;
                }
            }
            if (this.quality) this.quality.onFpsSample(this.fps, span);
        }

        const step = this._fixedStep || 16.6667;
        this._accumulator = (this._accumulator || 0) + dtRaw;

        let subSteps = 0;
        if (!this.paused) {
            while (this._accumulator >= step && subSteps < (this._maxSubSteps || 5)) {
                this._camPrevX = this.camera.x;
                this._camPrevY = this.camera.y;
                this.update(step);
                this._accumulator -= step;
                subSteps++;
            }
            if (subSteps === 0) { // 没有推进逻辑帧时，插值基准=当前相机
                this._camPrevX = this.camera.x;
                this._camPrevY = this.camera.y;
            }
            // 仍未追上：丢弃余量，避免越积越多
            if (subSteps === (this._maxSubSteps || 5)) this._accumulator = 0;
        } else {
            // 暂停时保持渲染（画面不黑屏），但不推进物理/时间
            this._accumulator = 0;
            if (this.ui) { this.ui.updateStats(); this.ui.updateTime(this.timeOfDay); }
            this._camPrevX = this.camera.x;
            this._camPrevY = this.camera.y;
        }

        // 合并处理交互引起的昂贵更新（光照/小地图/快捷栏），每帧最多一次
        this._flushDeferredWork();

        // 插值相机（避免低帧/抖动时画面“跳格”）
        const alpha = step > 0 ? (this._accumulator / step) : 0;
        const rc = this._renderCamera || (this._renderCamera = { x: this.camera.x, y: this.camera.y });
        rc.x = this._camPrevX + (this.camera.x - this._camPrevX) * alpha;
        rc.y = this._camPrevY + (this.camera.y - this._camPrevY) * alpha;

        // Apply subtle camera shake (render-time interpolation + shake offset)
        if (this._shakeMs > 0) {
            rc.x += this._shakeX || 0;
            rc.y += this._shakeY || 0;
        }

        this.render();

        // UI flush 阶段：统一写入 HUD/Overlay DOM
        if (this.uiFlush) this.uiFlush.flush();

        if (this._rafRunning) requestAnimationFrame(this._rafCb);
    }

    update(dt) {
        const dtClamped = Math.min(dt, 50);
        const dtScale = dtClamped / 16.6667;

        // camera shake (updated in fixed-step)
        this._tickCameraShake(dtClamped);

        // Keyboard: compute hold-to-sprint in fixed-step (stable, no jitter)
        const _im = (this.services && this.services.input) ? this.services.input : null;
        if (_im && typeof _im.tick === 'function') _im.tick(dtClamped);

        let input = this.input;

        // 移动端：TouchController.getInput() 已改为复用对象，这里再复用 mergedInput，避免每帧分配新对象
        if (this.isMobile && this.touchController) {
            const ti = this.touchController.getInput();
            this._latestTouchInput = ti;

            const mi = this._mergedInput || (this._mergedInput = {
                left: false, right: false, jump: false, sprint: false,
                mouseX: 0, mouseY: 0, mouseLeft: false, mouseRight: false
            });

            mi.left = ti.left;
            mi.right = ti.right;
            mi.jump = ti.jump;
            mi.sprint = ti.sprint;
            mi.mouseLeft = ti.mine;
            mi.mouseRight = ti.place;

            if (ti.hasTarget) {
                mi.mouseX = ti.targetX;
                mi.mouseY = ti.targetY;
            } else {
                // 无目标时：默认瞄准玩家（转换为屏幕坐标）
                mi.mouseX = this.player.cx() - this.camera.x;
                mi.mouseY = this.player.cy() - this.camera.y;
            }

            input = mi;
        } else {
            this._latestTouchInput = null;

            // Desktop: merge shift-sprint + hold-to-sprint (A/D hold) into a stable input object
            const ki = this._kbInput || (this._kbInput = {
                left: false, right: false, jump: false, sprint: false,
                mouseX: 0, mouseY: 0, mouseLeft: false, mouseRight: false
            });

            ki.left = this.input.left;
            ki.right = this.input.right;
            ki.jump = this.input.jump;
            ki.mouseX = this.input.mouseX;
            ki.mouseY = this.input.mouseY;
            ki.mouseLeft = this.input.mouseLeft;
            ki.mouseRight = this.input.mouseRight;

            ki.sprint = !!(this.input.sprint || (_im && _im._holdSprint));

            input = ki;
        }

        this.player.update(input, this.world, dtClamped);

        // Sprint speed feel: drive a subtle motion-blur intensity for PostFX
        try {
            const r = this.renderer;
            if (r) {
                const base = CONFIG.PLAYER_SPEED;
                const max = CONFIG.PLAYER_SPEED * CONFIG.SPRINT_MULT;
                const vx = Math.abs(this.player.vx || 0);

                let target = 0;
                if (this.player && this.player._sprintActive) {
                    const denom = Math.max(0.001, (max - base * 0.8));
                    target = Utils.clamp((vx - base * 0.8) / denom, 0, 1);

                    // Extra punch right after sprint starts
                    if (this.player && this.player._sprintVfxMs > 0) target = Math.max(target, 0.85);
                }

                const cur = (typeof r._speedBlurAmt === 'number') ? r._speedBlurAmt : 0;
                const smooth = 1 - Math.pow(1 - 0.22, dtScale); // fast response, still smooth
                r._speedBlurAmt = cur + (target - cur) * smooth;
                r._speedBlurDirX = (this.player.vx >= 0) ? 1 : -1;
            }
        } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }

        // 镜头前瞻：奔跑方向更“看得见前方”，打怪/挖掘更舒服（带平滑，不卡顿）
        const lookStrength = (this.settings && typeof this.settings.lookAhead === 'number') ? this.settings.lookAhead : 1.0;
        const desiredLook = Utils.clamp(this.player.vx * 22 * lookStrength, -220 * lookStrength, 220 * lookStrength);
        const lookSmooth = 1 - Math.pow(1 - 0.12, dtScale);
        this._lookAheadX = (this._lookAheadX || 0) + (desiredLook - (this._lookAheadX || 0)) * lookSmooth;

        const targetX = this.player.cx() - this.renderer.w / 2 + this._lookAheadX;
        const targetY = this.player.cy() - this.renderer.h / 2;
        const maxX = this.world.w * CONFIG.TILE_SIZE - this.renderer.w;
        const maxY = this.world.h * CONFIG.TILE_SIZE - this.renderer.h;

        const baseCam = (this.settings && typeof this.settings.cameraSmooth === 'number') ? this.settings.cameraSmooth : 0.08;
        const camSmooth = 1 - Math.pow(1 - baseCam, dtScale);
        this.camera.x += (Utils.clamp(targetX, 0, maxX) - this.camera.x) * camSmooth;
        this.camera.y += (Utils.clamp(targetY, 0, maxY) - this.camera.y) * camSmooth;

        this._handleInteraction(input, dtScale);
        if (this.settings.particles) this.particles.update(dtScale);
        if (this._updateWeather) this._updateWeather(dtClamped);
        if (this.settings.ambient) this.ambientParticles.update(this.timeOfDay, this.weather);
        // 更新掉落物
        this.droppedItems.update(this.world, this.player, dt, (blockId, count) => {
            const success = this._addToInventory(blockId, count);
            if (success) {
                // 拾取成功
                this.audio && this.audio.play('pickup');
                // 发射粒子效果（查表避免对象查找）
                const col = BLOCK_COLOR[blockId] || '#ffeaa7';
                this.particles.emit(this.player.cx(), this.player.cy() - 10, {
                    color: col,
                    count: 8,
                    speed: 2,
                    size: 3,
                    up: true,
                    gravity: 0.05,
                    glow: true
                });
            }
            return success;
        });

        this.timeOfDay += dtClamped / CONFIG.DAY_LENGTH;
        if (this.timeOfDay >= 1) this.timeOfDay = 0;
        this.saveSystem.tickAutosave(dtClamped);

        this.ui.updateStats();
        this.ui.updateTime(this.timeOfDay);
    }

    _handleInteraction(input, dtScale = 1) {
        if (this._inputBlocked) {
            this.miningProgress = 0;
            this.miningTarget = null;
            this.ui.hideMining();
            return;
        }
        const worldX = input.mouseX + this.camera.x;
        const worldY = input.mouseY + this.camera.y;

        const ts = CONFIG.TILE_SIZE;
        let tileX = Math.floor(worldX / ts);
        let tileY = Math.floor(worldY / ts);
        if (this.isMobile && this.settings && this.settings.aimAssist) {
            tileX = Math.floor((worldX + ts * 0.5) / ts);
            tileY = Math.floor((worldY + ts * 0.5) / ts);
        }

        const dx = worldX - this.player.cx();
        const dy = worldY - this.player.cy();
        const reachPx = CONFIG.REACH_DISTANCE * CONFIG.TILE_SIZE;
        const inRange = (dx * dx + dy * dy) <= (reachPx * reachPx);

        if (tileX < 0 || tileX >= this.world.w || tileY < 0 || tileY >= this.world.h) { this.miningProgress = 0; this.miningTarget = null; this.ui && this.ui.hideMining && this.ui.hideMining(); return; }

        const item = this.player.getItem();
        const block = this.world.tiles[tileX][tileY];

        if (input.mouseLeft && inRange) {
            if (block !== BLOCK.AIR && block !== BLOCK.BEDROCK) {
                const hardness = BLOCK_HARDNESS[block];
                const color = BLOCK_COLOR[block] || '#fff';
                const glow = BLOCK_LIGHT[block] > 0;
                const speed = (item && item.id === 'pickaxe' && typeof item.speed === 'number') ? item.speed : 0.4;

                if (!this.miningTarget || this.miningTarget.x !== tileX || this.miningTarget.y !== tileY) {
                    this.miningTarget = { x: tileX, y: tileY };
                    this.miningProgress = 0;
                }

                this.miningProgress += speed * 0.02 * dtScale;

                if (Math.random() < Math.min(1, 0.3 * dtScale)) {
                    this.particles.emit(tileX * CONFIG.TILE_SIZE + 8, tileY * CONFIG.TILE_SIZE + 8, {
                        color: color, count: 3, speed: 2.5, glow: glow
                    });
                }

                this.ui.showMining(
                    tileX * CONFIG.TILE_SIZE - this.camera.x + CONFIG.TILE_SIZE / 2,
                    tileY * CONFIG.TILE_SIZE - this.camera.y,
                    Math.min(1, this.miningProgress / hardness),
                    block
                );

                if (this.miningProgress >= hardness) {
                    // 挖掘成功，生成掉落物
                    const dropX = tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2 - 6;
                    const dropY = tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2 - 6;
                    if (block === BLOCK.TREASURE_CHEST && this._spawnTreasureChestLoot) {
                        this._spawnTreasureChestLoot(tileX, tileY, dropX, dropY);
                    } else {
                        this.droppedItems.spawn(dropX, dropY, block, 1);
                    }

                    this.world.tiles[tileX][tileY] = BLOCK.AIR;
                    this.saveSystem && this.saveSystem.markTile(tileX, tileY, BLOCK.AIR);
                    const hd = (BLOCK_DATA[block] && BLOCK_DATA[block].hardness) ? BLOCK_DATA[block].hardness : 1;
                    const vib = (hd <= 1) ? 5 : (hd <= 2) ? 12 : (hd <= 3) ? 20 : Math.min(35, Math.round(20 + (hd - 3) * 4));
                    this._haptic(vib);
                    this.audio && this.audio.play('mine');
                    this.particles.emit(tileX * CONFIG.TILE_SIZE + 8, tileY * CONFIG.TILE_SIZE + 8, {
                        color: color, count: 10, speed: 4, glow: glow
                    });
                    this.miningProgress = 0;
                    this.miningTarget = null;
                    this.ui.hideMining();
                    this._deferLightUpdate(tileX, tileY);
                    this._deferMinimapUpdate();
                }
            }
        } else {
            this.miningProgress = 0;
            this.miningTarget = null;
            this.ui.hideMining();
        }

        if (input.mouseRight && inRange && !input.mouseLeft) {
            const nowMs = performance.now();
            const placeInterval = (this._perf && this._perf.level === 'low') ? (this._placeIntervalMs + 30) : this._placeIntervalMs;
            if (nowMs >= (this._nextPlaceAt || 0) && item && typeof item.id === 'number' && typeof item.count === 'number' && item.count > 0 && item.id !== BLOCK.AIR) {
                if (block === BLOCK.AIR || BLOCK_LIQUID[block]) {
                    const ts = CONFIG.TILE_SIZE;
                    const br = { x: tileX * ts, y: tileY * ts, w: ts, h: ts };
                    const pr = { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h };

                    const collides = !(br.x + br.w < pr.x || br.x > pr.x + pr.w || br.y + br.h < pr.y || br.y > pr.y + pr.h);

                    if (!collides || item.id === BLOCK.TORCH) {
                        this.world.tiles[tileX][tileY] = item.id;
                        this._nextPlaceAt = nowMs + placeInterval;
                        this.saveSystem && this.saveSystem.markTile(tileX, tileY, item.id);
                        this._haptic(6);
                        this.audio && this.audio.play('place');

                        // 消耗物品
                        item.count--;
                        if (item.count <= 0) {
                            // 物品用完，从库存中移除或设为空
                            item.count = 0;
                        }

                        this.particles.emit(tileX * ts + 8, tileY * ts + 8, {
                            color: BLOCK_COLOR[item.id] || '#fff', count: 5, speed: 2, up: true
                        });
                        this._deferLightUpdate(tileX, tileY);
                        this._deferMinimapUpdate();

                        // 更新快捷栏UI显示（合并到每帧最多一次）
                        this._deferHotbarUpdate();
                    }
                }
            }
        }
    }

    // ───────────────────────── 交互更新合并（修复连续放置卡死） ─────────────────────────
    _deferLightUpdate(x, y) {
        const d = this._deferred;
        if (!d) return;
        d.light.push({x, y});
    }
    _deferHotbarUpdate() {
        const d = this._deferred;
        if (!d) return;
        d.hotbar = true;
    }
    _deferMinimapUpdate() {
        const d = this._deferred;
        if (!d) return;
        d.minimap = true;
    }
    _flushDeferredWork() {
        const d = this._deferred;
        if (!d) return;

        // 光照最重：优先合并，且每帧最多一次
        if (d.light.length > 0) {
            const interval = (typeof this._lightIntervalMs === 'number' && isFinite(this._lightIntervalMs)) ? this._lightIntervalMs : 0;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

            if (!interval || !this._lastLightUpdateAt || (now - this._lastLightUpdateAt) >= interval) {
                const targets = d.light;
                d.light = [];
                this._lastLightUpdateAt = now;
                // 合并更新：如果更新点很近，其实可以优化，这里简单遍历
                for(const target of targets) {
                    this._updateLight(target.x, target.y);
                }
            }
        }
        if (d.minimap) {
            d.minimap = false;
            this.minimap && this.minimap.invalidate();
        }
        if (d.hotbar) {
            d.hotbar = false;
            this.ui && this.ui.buildHotbar();
        }
    }

    _updateLight(x, y) {
        const r = 14;
        const w = this.world.w, h = this.world.h;
        const tiles = this.world.tiles;
        const light = this.world.light;

        let startX = x - r, endX = x + r;
        let startY = y - r, endY = y + r;

        if (startX < 0) startX = 0;
        if (startY < 0) startY = 0;
        if (endX >= w) endX = w - 1;
        if (endY >= h) endY = h - 1;

        // 收集光源（保持原扫描顺序：x 外层、y 内层递增）
        const srcX = this._lightSrcX;
        const srcY = this._lightSrcY;
        const srcL = this._lightSrcL;
        srcX.length = 0;
        srcY.length = 0;
        srcL.length = 0;

        // 太阳光：对每列只扫一次（原实现为每格从顶部重扫，复杂度高）
        const maxScanY = endY;
        const maxSun = CONFIG.LIGHT_LEVELS;

        for (let tx = startX; tx <= endX; tx++) {
            let sun = maxSun;
            const colTiles = tiles[tx];
            const colLight = light[tx];

            // 需要先把 startY 之上的衰减累积出来
            for (let ty = 0; ty <= maxScanY; ty++) {
                const id = colTiles[ty];

                const decay = SUN_DECAY[id];
                if (decay) sun = Math.max(0, sun - decay);

                if (ty >= startY) {
                    const bl = BLOCK_LIGHT[id];
                    const v = sun > bl ? sun : bl;
                    colLight[ty] = v;

                    if (bl > 0) {
                        srcX.push(tx);
                        srcY.push(ty);
                        srcL.push(bl);
                    }
                }
            }
        }

        // 从光源扩散（顺序与原实现一致）
        for (let i = 0; i < srcX.length; i++) {
            this._spreadLight(srcX[i], srcY[i], srcL[i]);
        }
    }

    _spreadLight(sx, sy, level) {
        const w = this.world.w, h = this.world.h;
        const tiles = this.world.tiles;
        const light = this.world.light;

        // 延迟初始化（world 创建后才有尺寸）
        if (!this._lightVisited || this._lightVisited.length !== w * h) {
            this._lightVisited = new Uint32Array(w * h);
            this._lightVisitMark = 1;
        }

        // 每次扩散使用新的 mark，避免 visited.fill(0)
        let mark = (this._lightVisitMark + 1) >>> 0;
        if (mark === 0) { // 溢出回绕
            this._lightVisited.fill(0);
            mark = 1;
        }
        this._lightVisitMark = mark;

        const visited = this._lightVisited;
        const qx = this._lightQx;
        const qy = this._lightQy;
        const ql = this._lightQl;

        qx.length = 0;
        qy.length = 0;
        ql.length = 0;

        let head = 0;
        qx.push(sx);
        qy.push(sy);
        ql.push(level);

        while (head < qx.length) {
            const x = qx[head];
            const y = qy[head];
            const l = ql[head];
            head++;

            if (l <= 0 || x < 0 || x >= w || y < 0 || y >= h) continue;

            const idx = x + y * w;
            if (visited[idx] === mark) continue;
            visited[idx] = mark;

            const colLight = light[x];
            if (l > colLight[y]) colLight[y] = l;

            const nl = l - (BLOCK_SOLID[tiles[x][y]] ? 2 : 1);
            if (nl > 0) {
                // push 顺序与原实现一致：left, right, up, down
                qx.push(x - 1, x + 1, x, x);
                qy.push(y, y, y - 1, y + 1);
                ql.push(nl, nl, nl, nl);
            }
        }
    }

    // 将掉落物添加到库存，返回是否成功

    _addToInventory(blockId, count = 1) {
        // 分层：入包逻辑委托给 InventorySystem（行为不变）
        return this.services.inventory.add(blockId, count);
    }

    render() {
        const cam = this._renderCamera || this.camera;
        this.renderer.clear();
        if (this.renderer.renderBackgroundCached) {
            this.renderer.renderBackgroundCached(cam, this.timeOfDay, false);
        } else {
            this.renderer.renderSky(cam, this.timeOfDay);
        }

        // ── Mountain Rendering Patch v2 (original render fallback) ──
        {
            const gs = window.GAME_SETTINGS || this.settings || {};
            const mtEnabled = (gs.bgMountains !== false) && (gs.__bgMountainsEffective !== false);
            if (mtEnabled && typeof renderParallaxMountains === 'function') {
                renderParallaxMountains(this.renderer, cam, this.timeOfDay);
            }
        }

        this.renderer.renderWorld(this.world, cam, this.timeOfDay);

        // 渲染掉落物
        this.droppedItems.render(this.renderer.ctx, cam, this.renderer.textures, this.timeOfDay);
        if (this.settings.particles) this.particles.render(this.renderer.ctx, cam);
        this.player.render(this.renderer.ctx, cam);

        const p = this.player;
        const ts = CONFIG.TILE_SIZE;

        const input = (this.isMobile && this.touchController && this._latestTouchInput) ? this._latestTouchInput : this.input;
        const sx = (typeof input.targetX === 'number') ? input.targetX : input.mouseX;
        const sy = (typeof input.targetY === 'number') ? input.targetY : input.mouseY;

        const safeSX = Number.isFinite(sx) ? sx : (p.cx() - cam.x);
        const safeSY = Number.isFinite(sy) ? sy : (p.cy() - cam.y);

        const worldX = safeSX + cam.x;
        const worldY = safeSY + cam.y;

        let tileX = Math.floor(worldX / ts);
        let tileY = Math.floor(worldY / ts);
        if (this.isMobile && this.settings && this.settings.aimAssist) {
            tileX = Math.floor((worldX + ts * 0.5) / ts);
            tileY = Math.floor((worldY + ts * 0.5) / ts);
        }
        const dx = worldX - this.player.cx();
        const dy = worldY - this.player.cy();
        const reachPx = CONFIG.REACH_DISTANCE * CONFIG.TILE_SIZE;
        const inRange = (dx * dx + dy * dy) <= (reachPx * reachPx);

        if (tileX >= 0 && tileX < this.world.w && tileY >= 0 && tileY < this.world.h) {
            this.renderer.renderHighlight(tileX, tileY, cam, inRange);
        }
        // 后期增强（在所有主体绘制完成后执行）
        if (this.renderer && this.renderer.postProcess) this.renderer.postProcess(this.timeOfDay);
        const minimapVisible = !(window.TU && window.TU.MINIMAP_VISIBLE === false);
        if (this.settings.minimap && minimapVisible) {
            this.minimap.update();
            if (this.minimap && typeof this.minimap.render === 'function') this.minimap.render(p.x, p.y);
            else if (this.minimap && typeof this.minimap.renderPlayer === 'function') this.minimap.renderPlayer(p.x, p.y);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                     启动
// ═══════════════════════════════════════════════════════════════════════════════

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { Game });




                        (() => {
                            const TU = window.TU || {};
                            (function () {
                                const __p = ({
                                    id: 'experience_optimized_v2',
                                    order: 10,
                                    description: "交互/渲染体验优化（v2）",
                                    apply: () => {
                                        const TU = window.TU || {};
                                        const Game = TU.Game;
                                        const Renderer = TU.Renderer;
                                        const TouchController = TU.TouchController;

                                        // ───────────────────── Crosshair UX (移动端默认显示时避免左上角“悬空”) ─────────────────────
                                        try {
                                            const style = document.createElement('style');
                                            style.id = 'patch-crosshair-style';
                                            style.textContent = `
    /* 默认隐藏（用 opacity 控制，不影响布局；兼容原有 display:block 的媒体查询） */
    #crosshair {
      opacity: 0;
      transform: scale(0.9);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    #crosshair.crosshair-active { opacity: 1; transform: scale(1); }
    #crosshair.crosshair-idle { opacity: 0.55; transform: scale(0.95); }
  `;
                                            document.head.appendChild(style);
                                        } catch { }

                                        // ───────────────────────── Patch TouchController：多指更稳 + 自适应摇杆半径 ─────────────────────────
                                        if (TouchController && TouchController.prototype) {
                                            TouchController.prototype._init = function () {
                                                const joystickEl = document.getElementById('joystick');
                                                const thumbEl = document.getElementById('joystick-thumb');
                                                const crosshairEl = document.getElementById('crosshair');

                                                const canvas = this.game && this.game.canvas;

                                                // 兼容：缺少关键节点则直接返回
                                                if (!joystickEl || !thumbEl || !canvas) return;

                                                // 让浏览器知道这里不会滚动（减少一些浏览器的触控延迟）
                                                try { canvas.style.touchAction = 'none'; } catch { }
                                                try { joystickEl.style.touchAction = 'none'; } catch { }

                                                // 十字准星：默认透明，第一次设定目标后才显示
                                                if (crosshairEl) {
                                                    crosshairEl.classList.remove('crosshair-active', 'crosshair-idle');
                                                }

                                                // 安全区（防误触）：根据 UI 实际位置动态计算
                                                const safeRects = [];
                                                const expandRect = (r, m) => ({ left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m });
                                                const hitRect = (r, x, y) => (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

                                                const refreshSafeZones = () => {
                                                    safeRects.length = 0;

                                                    // joystick 安全区
                                                    try {
                                                        const jr = joystickEl.getBoundingClientRect();
                                                        const m = Math.max(18, jr.width * 0.18);
                                                        safeRects.push(expandRect(jr, m));

                                                        // 同步摇杆最大位移：跟随 joystick 尺寸
                                                        this._joyMaxDist = Math.max(30, Math.min(90, jr.width * 0.35));
                                                    } catch {
                                                        this._joyMaxDist = 50;
                                                    }

                                                    // action buttons 安全区
                                                    try {
                                                        const act = document.querySelector('.action-buttons');
                                                        if (act) {
                                                            const ar = act.getBoundingClientRect();
                                                            safeRects.push(expandRect(ar, 18));
                                                        }
                                                    } catch { }

                                                    // jump button 安全区
                                                    try {
                                                        const jc = document.querySelector('.jump-container');
                                                        if (jc) {
                                                            const r = jc.getBoundingClientRect();
                                                            safeRects.push(expandRect(r, 18));
                                                        }
                                                    } catch { }

                                                    // minimap 安全区（防止在边缘误触到画布瞄准）
                                                    try {
                                                        const mm = document.getElementById('minimap');
                                                        if (mm && mm.offsetParent !== null) {
                                                            const r = mm.getBoundingClientRect();
                                                            safeRects.push(expandRect(r, 14));
                                                        }
                                                    } catch { }
                                                };

                                                this._refreshSafeZones = refreshSafeZones;
                                                refreshSafeZones();
                                                window.addEventListener('resize', refreshSafeZones, { passive: true });
                                                window.addEventListener('orientationchange', refreshSafeZones, { passive: true });

                                                const findTouch = (touchList, id) => {
                                                    if (!touchList) return null;
                                                    for (let i = 0; i < touchList.length; i++) {
                                                        const t = touchList[i];
                                                        if (t && t.identifier === id) return t;
                                                    }
                                                    return null;
                                                };

                                                const inSafeZone = (x, y) => {
                                                    for (let i = 0; i < safeRects.length; i++) {
                                                        if (hitRect(safeRects[i], x, y)) return true;
                                                    }
                                                    return false;
                                                };

                                                // ── Joystick：绑定自己的 touchId，避免与准星/按钮互相抢
                                                this.joystick.touchId = null;

                                                joystickEl.addEventListener('touchstart', (e) => {
                                                    // 防止页面滑动/缩放
                                                    e.preventDefault();

                                                    // 已经有 joystick touch 在控制时，不抢占
                                                    if (this.joystick.touchId !== null) return;

                                                    const t = e.changedTouches && e.changedTouches[0];
                                                    if (!t) return;

                                                    this.joystick.touchId = t.identifier;
                                                    this.joystick.active = true;

                                                    // joystick 基准点：固定在底座中心
                                                    const rect = joystickEl.getBoundingClientRect();
                                                    this.joystick.startX = rect.left + rect.width / 2;
                                                    this.joystick.startY = rect.top + rect.height / 2;

                                                    this._updateJoystick(t.clientX, t.clientY, thumbEl);
                                                }, { passive: false });

                                                joystickEl.addEventListener('touchmove', (e) => {
                                                    e.preventDefault();
                                                    if (!this.joystick.active || this.joystick.touchId === null) return;

                                                    const t = findTouch(e.touches, this.joystick.touchId) || findTouch(e.changedTouches, this.joystick.touchId);
                                                    if (!t) return;

                                                    this._updateJoystick(t.clientX, t.clientY, thumbEl);
                                                }, { passive: false });

                                                const endJoy = (e) => {
                                                    e.preventDefault();
                                                    if (this.joystick.touchId === null) return;

                                                    // 只有结束了 joystick 自己的 touch 才归零
                                                    const ended = findTouch(e.changedTouches, this.joystick.touchId);
                                                    if (!ended) return;

                                                    this.joystick.active = false;
                                                    this.joystick.touchId = null;
                                                    this.joystick.dx = 0;
                                                    this.joystick.dy = 0;
                                                    thumbEl.style.transform = 'translate(-50%, -50%)';
                                                };

                                                joystickEl.addEventListener('touchend', endJoy, { passive: false });
                                                joystickEl.addEventListener('touchcancel', endJoy, { passive: false });

                                                // ── Buttons：沿用原有逻辑
                                                this._setupButton('btn-jump', 'jump');
                                                this._setupButton('btn-mine', 'mine');
                                                this._setupButton('btn-place', 'place');

                                                // ── Crosshair：允许“设定一次目标后松手继续挖/放”
                                                const setCrosshairState = (state) => {
                                                    if (!crosshairEl) return;
                                                    crosshairEl.classList.toggle('crosshair-active', state === 'active');
                                                    crosshairEl.classList.toggle('crosshair-idle', state === 'idle');
                                                    if (state === 'hidden') crosshairEl.classList.remove('crosshair-active', 'crosshair-idle');
                                                };

                                                canvas.addEventListener('touchstart', (e) => {
                                                    // 阻止双指缩放/滚动（尤其 iOS）
                                                    e.preventDefault();

                                                    if (!e.changedTouches) return;

                                                    // 如果当前没有正在拖动的准星，就从新 touch 中挑一个合适的
                                                    if (this.targetTouchId === null) {
                                                        for (let i = 0; i < e.changedTouches.length; i++) {
                                                            const t = e.changedTouches[i];
                                                            if (!t) continue;

                                                            // 过滤掉靠近摇杆/按钮/小地图的触点，防误触
                                                            if (inSafeZone(t.clientX, t.clientY)) continue;

                                                            this.targetTouchId = t.identifier;
                                                            if (crosshairEl) {
                                                                this._updateCrosshair(t.clientX, t.clientY, crosshairEl);
                                                                // 第一次设定目标：开启 hasTarget
                                                                this.crosshair.visible = true;
                                                                setCrosshairState('active');
                                                            }
                                                            break;
                                                        }
                                                    } else {
                                                        // 已在拖动：不抢占
                                                    }
                                                }, { passive: false });

                                                canvas.addEventListener('touchmove', (e) => {
                                                    e.preventDefault();
                                                    if (this.targetTouchId === null) return;

                                                    const t = findTouch(e.touches, this.targetTouchId) || findTouch(e.changedTouches, this.targetTouchId);
                                                    if (!t || !crosshairEl) return;

                                                    this._updateCrosshair(t.clientX, t.clientY, crosshairEl);
                                                    // 正在拖动时保持 active
                                                    if (this.crosshair.visible) setCrosshairState('active');
                                                }, { passive: false });

                                                const endCross = (e) => {
                                                    e.preventDefault();
                                                    if (this.targetTouchId === null) return;

                                                    const ended = findTouch(e.changedTouches, this.targetTouchId);
                                                    if (!ended) return;

                                                    this.targetTouchId = null;
                                                    // 松手后：保留目标点，但变为 idle（更不遮挡）
                                                    if (this.crosshair.visible) setCrosshairState('idle');
                                                };

                                                canvas.addEventListener('touchend', endCross, { passive: false });
                                                canvas.addEventListener('touchcancel', endCross, { passive: false });
                                            };

                                            // 自适应摇杆半径（maxDist 与 UI 尺寸匹配）
                                            TouchController.prototype._updateJoystick = function (tx, ty, thumbEl) {
                                                let dx = tx - this.joystick.startX;
                                                let dy = ty - this.joystick.startY;

                                                const maxDist = (typeof this._joyMaxDist === 'number' && isFinite(this._joyMaxDist)) ? this._joyMaxDist : 50;
                                                const dist = Math.sqrt(dx * dx + dy * dy);

                                                if (dist > maxDist) {
                                                    dx = dx / dist * maxDist;
                                                    dy = dy / dist * maxDist;
                                                }

                                                this.joystick.dx = dx / maxDist;
                                                this.joystick.dy = dy / maxDist;

                                                thumbEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                                            };

                                            // Crosshair：只做坐标更新（与原逻辑兼容）
                                            TouchController.prototype._updateCrosshair = function (x, y, el) {
                                                this.crosshair.x = x;
                                                this.crosshair.y = y;
                                                // 40x40
                                                el.style.left = (x - 20) + 'px';
                                                el.style.top = (y - 20) + 'px';
                                            };
                                        }

                                        // ───────────────────────── Patch Renderer：缓存天空渐变 + 星星更省 + 视差降采样 ─────────────────────────
                                        if (Renderer && Renderer.prototype) {
                                            const origResize = Renderer.prototype.resize;
                                            Renderer.prototype.resize = function () {
                                                origResize.call(this);
                                                // 尺寸变化时清空缓存
                                                this._skyGrad = null;
                                                this._skyBucket = -1;
                                                this._skyGradH = 0;

                                                this._stars = null;
                                                this._starsW = 0;
                                                this._starsH = 0;
                                                this._starsCount = 0;

                                                this._parallaxGrad = null;
                                                this._parallaxGradH = 0;
                                            };

                                            Renderer.prototype._ensureStars = function () {
                                                const want = (this.lowPower ? 40 : 80);
                                                if (this._stars && this._starsCount === want && this._starsW === this.w && this._starsH === this.h) return;

                                                const stars = new Array(want);
                                                const w = Math.max(1, this.w);
                                                const h = Math.max(1, this.h * 0.5);

                                                // 保持“看起来随机但稳定”的分布：沿用原有的取模方案
                                                for (let i = 0; i < want; i++) {
                                                    const sx = (12345 * i * 17) % w;
                                                    const sy = (12345 * i * 31) % h;
                                                    const size = (i % 3) + 1;
                                                    const phase = i * 1.73;
                                                    const baseA = 0.55 + (i % 7) * 0.05; // 0.55~0.85
                                                    stars[i] = { x: sx, y: sy, s: size, p: phase, a: baseA };
                                                }

                                                this._stars = stars;
                                                this._starsW = this.w;
                                                this._starsH = this.h;
                                                this._starsCount = want;
                                            };

                                            Renderer.prototype._getSkyBucket = function (time) {
                                                if (time < 0.2) return 0;      // night
                                                if (time < 0.3) return 1;      // dawn
                                                if (time < 0.7) return 2;      // day
                                                if (time < 0.8) return 3;      // dusk
                                                return 0;                      // night
                                            };

                                            Renderer.prototype._ensureSkyGradient = function (bucket) {
                                                if (this._skyGrad && this._skyBucket === bucket && this._skyGradH === this.h) return;

                                                const ctx = this.ctx;
                                                let colors;
                                                if (bucket === 0) colors = ['#0c0c1e', '#1a1a2e', '#16213e'];
                                                else if (bucket === 1) colors = ['#1a1a2e', '#4a1942', '#ff6b6b'];
                                                else if (bucket === 2) colors = ['#74b9ff', '#81ecec', '#dfe6e9'];
                                                else colors = ['#6c5ce7', '#fd79a8', '#ffeaa7'];

                                                const grad = ctx.createLinearGradient(0, 0, 0, this.h * 0.7);
                                                grad.addColorStop(0, colors[0]);
                                                grad.addColorStop(0.5, colors[1]);
                                                grad.addColorStop(1, colors[2]);

                                                this._skyGrad = grad;
                                                this._skyBucket = bucket;
                                                this._skyGradH = this.h;
                                            };

                                            // 覆写天空渲染：同视觉，少分配/少字符串/少 arc
                                            Renderer.prototype.renderSky = function (cam, time) {
                                                const ctx = this.ctx;

                                                // —— 平滑天空过渡：在关键时间点附近，用两套渐变叠加做 smoothstep 淡入淡出 ——
                                                const transitions = this._skyTransitions || (this._skyTransitions = [
                                                    { at: 0.2, from: 0, to: 1, w: 0.04 }, // night -> dawn
                                                    { at: 0.3, from: 1, to: 2, w: 0.04 }, // dawn -> day
                                                    { at: 0.7, from: 2, to: 3, w: 0.04 }, // day -> dusk
                                                    { at: 0.8, from: 3, to: 0, w: 0.04 }  // dusk -> night
                                                ]);

                                                let bucketA = this._getSkyBucket(time);
                                                let bucketB = bucketA;
                                                let blend = 0;

                                                for (let i = 0; i < transitions.length; i++) {
                                                    const tr = transitions[i];
                                                    const a = tr.at - tr.w, b = tr.at + tr.w;
                                                    if (time >= a && time <= b) {
                                                        bucketA = tr.from;
                                                        bucketB = tr.to;
                                                        blend = Utils.smoothstep(a, b, time);
                                                        break;
                                                    }
                                                }

                                                // 底层渐变
                                                this._ensureSkyGradient(bucketA);
                                                const gradA = this._skyGrad;
                                                ctx.fillStyle = gradA;
                                                ctx.fillRect(0, 0, this.w, this.h);

                                                // 叠加渐变（仅在过渡期）
                                                if (blend > 0.001 && bucketB !== bucketA) {
                                                    this._ensureSkyGradient(bucketB);
                                                    const gradB = this._skyGrad;
                                                    ctx.save();
                                                    ctx.globalAlpha = blend;
                                                    ctx.fillStyle = gradB;
                                                    ctx.fillRect(0, 0, this.w, this.h);
                                                    ctx.restore();
                                                }

                                                const night = Utils.nightFactor(time);

                                                // 星星：夜晚按 nightFactor 平滑淡入淡出（避免“瞬间出现/消失”）
                                                if (night > 0.01) {
                                                    const baseAlpha = night * 0.8;
                                                    this._ensureStars();
                                                    const stars = this._stars;
                                                    const now = Date.now() * 0.003;

                                                    ctx.save();
                                                    for (let i = 0; i < stars.length; i++) {
                                                        const s = stars[i];
                                                        const twinkle = Math.sin(now + i) * 0.3 + 0.7;
                                                        ctx.globalAlpha = baseAlpha * twinkle;
                                                        ctx.fillStyle = '#fff';
                                                        // fillRect 比 arc 省
                                                        ctx.fillRect(s.x, s.y, s.size, s.size);
                                                    }
                                                    ctx.restore();
                                                }

                                                // 太阳/月亮：使用透明度做平滑交接
                                                const cx = this.w * ((time + 0.25) % 1);
                                                const cy = 80 + Math.sin(((time + 0.25) % 1) * Math.PI) * -60;

                                                const sunAlpha = Utils.smoothstep(0.18, 0.26, time) * (1 - Utils.smoothstep(0.74, 0.82, time));
                                                const moonAlpha = night;

                                                if (sunAlpha > 0.001) {
                                                    ctx.save();
                                                    ctx.globalAlpha = sunAlpha;

                                                    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
                                                    sunGlow.addColorStop(0, 'rgba(255, 255, 200, 1)');
                                                    sunGlow.addColorStop(0.2, 'rgba(255, 220, 100, 0.8)');
                                                    sunGlow.addColorStop(0.5, 'rgba(255, 180, 50, 0.3)');
                                                    sunGlow.addColorStop(1, 'rgba(255, 150, 0, 0)');
                                                    ctx.fillStyle = sunGlow;
                                                    ctx.beginPath();
                                                    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
                                                    ctx.fill();

                                                    ctx.fillStyle = '#FFF';
                                                    ctx.beginPath();
                                                    ctx.arc(cx, cy, 25, 0, Math.PI * 2);
                                                    ctx.fill();

                                                    ctx.restore();
                                                }

                                                if (moonAlpha > 0.001) {
                                                    ctx.save();
                                                    ctx.globalAlpha = moonAlpha;

                                                    const moonGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
                                                    moonGlow.addColorStop(0, 'rgba(230, 230, 255, 1)');
                                                    moonGlow.addColorStop(0.5, 'rgba(200, 200, 255, 0.3)');
                                                    moonGlow.addColorStop(1, 'rgba(150, 150, 255, 0)');
                                                    ctx.fillStyle = moonGlow;
                                                    ctx.beginPath();
                                                    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
                                                    ctx.fill();

                                                    ctx.fillStyle = '#E8E8F0';
                                                    ctx.beginPath();
                                                    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
                                                    ctx.fill();

                                                    ctx.fillStyle = 'rgba(200, 200, 210, 0.5)';
                                                    ctx.beginPath();
                                                    ctx.arc(cx - 5, cy - 3, 4, 0, Math.PI * 2);
                                                    ctx.arc(cx + 6, cy + 5, 3, 0, Math.PI * 2);
                                                    ctx.fill();

                                                    ctx.restore();
                                                }
                                            };

                                            // 覆写视差：低功耗时减少采样点/层数（更省）
                                            Renderer.prototype.renderParallax = function (cam, time) {
                                                renderParallaxMountains(this, cam, time);
                                            };

                                            // 覆写世界渲染：暗角 LUT 只在 levels 变化时构建（每帧少 256 次循环）
                                            const buildDarkLUT = (levels, nightBonus) => {
                                                const lut = new Float32Array(256);
                                                for (let i = 0; i < 256; i++) {
                                                    const darkness = 1 - (i / levels);
                                                    let totalDark = darkness * 0.6 + nightBonus;
                                                    if (totalDark > 0.88) totalDark = 0.88;
                                                    lut[i] = (totalDark > 0.05) ? totalDark : 0;
                                                }
                                                return lut;
                                            };

                                            Renderer.prototype.renderWorld = function (world, cam, time) {
                                                const ctx = this.ctx;
                                                const ts = CONFIG.TILE_SIZE;

                                                let startX = Math.floor(cam.x / ts) - 1;
                                                let startY = Math.floor(cam.y / ts) - 1;
                                                let endX = startX + Math.ceil(this.w / ts) + 2;
                                                let endY = startY + Math.ceil(this.h / ts) + 2;

                                                if (startX < 0) startX = 0;
                                                if (startY < 0) startY = 0;
                                                if (endX >= world.w) endX = world.w - 1;
                                                if (endY >= world.h) endY = world.h - 1;

                                                const tiles = world.tiles;
                                                const light = world.light;

                                                const camCeilX = Math.ceil(cam.x);
                                                const camCeilY = Math.ceil(cam.y);

                                                const night = Utils.nightFactor(time);
                                                const qNight = Math.round(night * 100) / 100;
                                                const levels = CONFIG.LIGHT_LEVELS;

                                                if (!this._darkAlphaLUTDay || this._darkAlphaLUTLevels !== levels) {
                                                    this._darkAlphaLUTLevels = levels;
                                                    this._darkAlphaLUTDay = buildDarkLUT(levels, 0);
                                                    this._darkAlphaLUTNight = buildDarkLUT(levels, 0.2);
                                                }
                                                let lut = this._darkAlphaLUTBlend;
                                                if (!lut || this._darkAlphaLUTBlendNight !== qNight || this._darkAlphaLUTBlendLevels !== levels) {
                                                    lut = this._darkAlphaLUTBlend || (this._darkAlphaLUTBlend = new Float32Array(256));
                                                    for (let i = 0; i < 256; i++) {
                                                        lut[i] = this._darkAlphaLUTDay[i] + (this._darkAlphaLUTNight[i] - this._darkAlphaLUTDay[i]) * qNight;
                                                    }
                                                    this._darkAlphaLUTBlendNight = qNight;
                                                    this._darkAlphaLUTBlendLevels = levels;
                                                }

                                                ctx.globalAlpha = 1;
                                                ctx.fillStyle = 'rgb(10,5,20)';

                                                for (let x = startX; x <= endX; x++) {
                                                    const colTiles = tiles[x];
                                                    const colLight = light[x];
                                                    for (let y = startY; y <= endY; y++) {
                                                        const block = colTiles[y];
                                                        if (block === BLOCK.AIR) continue;

                                                        const tex = this.textures.get(block);
                                                        const px = x * ts - camCeilX;
                                                        const py = y * ts - camCeilY;

                                                        const bl = BLOCK_LIGHT[block];
                                                        if (this.enableGlow && bl > 5 && tex) {
                                                            ctx.save();
                                                            ctx.shadowColor = BLOCK_COLOR[block];
                                                            ctx.shadowBlur = bl * 2;
                                                            ctx.drawImage(tex, px, py);
                                                            ctx.restore();
                                                        } else if (tex) {
                                                            ctx.drawImage(tex, px, py);
                                                        }

                                                        const a = lut[colLight[y]];
                                                        if (a) {
                                                            ctx.globalAlpha = a;
                                                            ctx.fillRect(px, py, ts, ts);
                                                            ctx.globalAlpha = 1;
                                                        }
                                                    }
                                                }

                                                ctx.globalAlpha = 1;
                                            };
                                            // ───────────────────────── PostFX：色彩分级 / 氛围雾化 / 暗角 / 电影颗粒 ─────────────────────────
                                            // 目标：在不引入昂贵像素级后处理（getImageData）的前提下，显著提升“质感”和层次
                                            Renderer.prototype._ensureGrain = function () {
                                                const size = 128; // 小纹理 + repeat，成本低
                                                if (!this._grainCanvas) {
                                                    this._grainCanvas = document.createElement('canvas');
                                                    this._grainCanvas.width = size;
                                                    this._grainCanvas.height = size;
                                                    this._grainCtx = this._grainCanvas.getContext('2d', { alpha: true });
                                                    this._grainFrame = 0;
                                                    this._grainPattern = null;
                                                }
                                                // 每隔若干帧刷新一次噪声，避免每帧随机成本
                                                const step = this.lowPower ? 18 : 10;
                                                this._grainFrame = (this._grainFrame || 0) + 1;
                                                if (!this._grainPattern || (this._grainFrame % step) === 0) {
                                                    const g = this._grainCtx;
                                                    const img = g.createImageData(size, size);
                                                    const d = img.data;
                                                    // LCG 伪随机（比 Math.random 更稳定更快）
                                                    let seed = (this._grainSeed = ((this._grainSeed || 1234567) * 1664525 + 1013904223) >>> 0);
                                                    for (let i = 0; i < d.length; i += 4) {
                                                        seed = (seed * 1664525 + 1013904223) >>> 0;
                                                        const v = (seed >>> 24); // 0..255
                                                        d[i] = v; d[i + 1] = v; d[i + 2] = v;
                                                        // 噪声 alpha：偏低，避免“脏屏”
                                                        d[i + 3] = 24 + (v & 15); // 24..39
                                                    }
                                                    g.putImageData(img, 0, 0);
                                                    this._grainPattern = this.ctx.createPattern(this._grainCanvas, 'repeat');
                                                }
                                            };

                                            Renderer.prototype.applyPostFX = function (time, depth01, reducedMotion) {
                                                const ctx = this.ctx;
                                                if (!ctx || reducedMotion) return;
                                                const w = this.w, h = this.h;
                                                const lowFx = !!this.lowPower;

                                                // Precompute vignette once per resize
                                                if (!this._vignetteFx || this._vignetteFx.w !== w || this._vignetteFx.h !== h) {
                                                    const vc = document.createElement('canvas');
                                                    vc.width = Math.max(1, w);
                                                    vc.height = Math.max(1, h);
                                                    const vctx = vc.getContext('2d', { alpha: true });
                                                    const r = Math.max(w, h) * 0.75;
                                                    const g = vctx.createRadialGradient(w * 0.5, h * 0.5, r * 0.15, w * 0.5, h * 0.5, r);
                                                    g.addColorStop(0, 'rgba(0,0,0,0)');
                                                    g.addColorStop(1, 'rgba(0,0,0,1)');
                                                    vctx.fillStyle = g;
                                                    vctx.fillRect(0, 0, w, h);
                                                    this._vignetteFx = { c: vc, w, h };
                                                }

                                                // Ensure grain pattern exists (generated once)
                                                if (!this._grainPattern && this._ensureGrain) this._ensureGrain();

                                                const night = Utils.nightFactor(time);
                                                const dusk = Math.max(0, 1 - Math.abs(time - 0.72) / 0.08);
                                                const dawn = Math.max(0, 1 - Math.abs(time - 0.34) / 0.08);

                                                // Cheap “grading” using only a few translucent overlays (no ctx.filter)
                                                const warmA = Utils.clamp(dawn * 0.22 + dusk * 0.30, 0, 0.35);
                                                const coolA = Utils.clamp(night * 0.28, 0, 0.35);
                                                const fogA = Utils.clamp((depth01 * 0.10) + (night * 0.06), 0, 0.20);

                                                ctx.save();

                                                if (warmA > 0.001) {
                                                    ctx.globalAlpha = warmA;
                                                    ctx.fillStyle = 'rgba(255,180,90,1)';
                                                    ctx.fillRect(0, 0, w, h);
                                                }
                                                if (coolA > 0.001) {
                                                    ctx.globalAlpha = coolA;
                                                    ctx.fillStyle = 'rgba(90,150,255,1)';
                                                    ctx.fillRect(0, 0, w, h);
                                                }
                                                if (fogA > 0.001) {
                                                    ctx.globalAlpha = fogA;
                                                    ctx.fillStyle = 'rgba(24,28,36,1)';
                                                    ctx.fillRect(0, 0, w, h);
                                                }

                                                // Vignette
                                                ctx.globalAlpha = (lowFx ? 0.16 : 0.24) + night * (lowFx ? 0.08 : 0.12);
                                                ctx.drawImage(this._vignetteFx.c, 0, 0);

                                                // Subtle grain (skip on low power)
                                                if (this._grainPattern && !lowFx) {
                                                    ctx.globalAlpha = 0.045;
                                                    ctx.fillStyle = this._grainPattern;
                                                    ctx.fillRect(0, 0, w, h);
                                                }

                                                ctx.restore();
                                            };

                                        }

                                        // ───────────────────────── Patch Game.render：修复未定义变量 + 减少重复取值 ─────────────────────────
                                        if (Game && Game.prototype) {
                                            Game.prototype.render = function () {
                                                // 防御性空值检查
                                                if (!this.renderer) {
                                                    console.warn('[Renderer.render] Renderer not initialized');
                                                    return;
                                                }
                                                if (!this.world) {
                                                    console.warn('[Renderer.render] World not available');
                                                    return;
                                                }

                                                const cam = this._renderCamera || this.camera;
                                                const renderer = this.renderer;
                                                const settings = this.settings || {};
                                                const p = this.player;
                                                const ts = CONFIG.TILE_SIZE;

                                                // 防御性相机检查
                                                if (!cam || typeof cam.x !== 'number' || typeof cam.y !== 'number') {
                                                    console.warn('[Renderer.render] Invalid camera');
                                                    return;
                                                }

                                                renderer.clear();
                                                renderer.renderSky(cam, this.timeOfDay);

                                                // ── Mountain Rendering Patch v2 ──
                                                // Single authoritative call site for mountains.
                                                // Respects the user bgMountains toggle and autoQuality
                                                // effective flag, but no longer skipped by
                                                // reducedMotion / low-perf — those only affected the
                                                // old parallax *scrolling* which is not relevant to
                                                // the static mountain backdrop.
                                                {
                                                    const gs = window.GAME_SETTINGS || settings;
                                                    const mtEnabled = (gs.bgMountains !== false) && (gs.__bgMountainsEffective !== false);
                                                    if (mtEnabled && typeof renderParallaxMountains === 'function') {
                                                        renderParallaxMountains(renderer, cam, this.timeOfDay);
                                                    }
                                                }

                                                renderer.renderWorld(this.world, cam, this.timeOfDay);

                                                // 掉落物 / 粒子 / 玩家
                                                this.droppedItems.render(renderer.ctx, cam, renderer.textures, this.timeOfDay);
                                                if (settings.particles) this.particles.render(renderer.ctx, cam);
                                                p.render(renderer.ctx, cam);

                                                // 高亮：取当前输入（移动端优先 touch 输入）
                                                const input = (this.isMobile && this.touchController && this._latestTouchInput) ? this._latestTouchInput : this.input;

                                                const sx = (typeof input.targetX === 'number') ? input.targetX : input.mouseX;
                                                const sy = (typeof input.targetY === 'number') ? input.targetY : input.mouseY;

                                                const safeSX = Number.isFinite(sx) ? sx : (p.cx() - cam.x);
                                                const safeSY = Number.isFinite(sy) ? sy : (p.cy() - cam.y);

                                                const worldX = safeSX + cam.x;
                                                const worldY = safeSY + cam.y;

                                                let tileX = Math.floor(worldX / ts);
                                                let tileY = Math.floor(worldY / ts);
                                                if (this.isMobile && settings.aimAssist) {
                                                    tileX = Math.floor((worldX + ts * 0.5) / ts);
                                                    tileY = Math.floor((worldY + ts * 0.5) / ts);
                                                }

                                                const dx = worldX - p.cx();
                                                const dy = worldY - p.cy();
                                                const reachPx = CONFIG.REACH_DISTANCE * ts;
                                                const inRange = (dx * dx + dy * dy) <= (reachPx * reachPx);

                                                if (tileX >= 0 && tileX < this.world.w && tileY >= 0 && tileY < this.world.h) {
                                                    renderer.renderHighlight(tileX, tileY, cam, inRange);
                                                }

                                                // PostFX：提升整体质感（色彩分级/雾化/暗角/颗粒），默认开启
                                                if (renderer.applyPostFX) {
                                                    const depth01 = Utils.clamp((p.y + p.h * 0.5) / (this.world.h * ts), 0, 1);
                                                    renderer.applyPostFX(this.timeOfDay, depth01, !!settings.reducedMotion);
                                                }

                                                // 小地图（折叠时完全跳过）
                                                const minimapVisible = !(window.TU && window.TU.MINIMAP_VISIBLE === false);
                                                if (settings.minimap && minimapVisible && this.minimap) {
                                                    this.minimap.update();
                                                    this.minimap.render(p.x, p.y);
                                                }
                                            };
                                        }
                                    }
                                }); try { __p && __p.apply && __p.apply(); } catch (e) { console.warn('[TU merge] patch apply failed', __p && __p.id, e); }
                            })();
                        })();

                        (() => {
                            'use strict';
                            const TU = window.TU || {};

                            // ───────────────────────── Game: simple dynamic weather (rain/snow) + tone
                            const Game = TU.Game;
                            if (Game && Game.prototype && !Game.prototype._updateWeather) {
                                function mulberry32(a) {
                                    return function () {
                                        a |= 0;
                                        a = (a + 0x6D2B79F5) | 0;
                                        let t = Math.imul(a ^ (a >>> 15), 1 | a);
                                        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                                        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                                    };
                                }

                                Game.prototype._updateWeather = function (dtMs) {
                                    const settings = this.settings || {};
                                    const reducedMotion = !!settings.reducedMotion;

                                    // 统一 dt（ms），做上限保护
                                    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() :
                                        Date.now();
                                    const dt = Math.min(1000, Math.max(0, dtMs || 0));

                                    // 初始化 weather 对象（支持：clear / rain / snow / thunder / bloodmoon）
                                    if (!this.weather) {
                                        this.weather = {
                                            type: 'clear',
                                            intensity: 0,
                                            targetIntensity: 0,
                                            nextType: 'clear',
                                            nextIntensity: 0,
                                            lightning: 0
                                        };
                                    }
                                    const w = this.weather;

                                    if (!Number.isFinite(w.intensity)) w.intensity = 0;
                                    if (!Number.isFinite(w.targetIntensity)) w.targetIntensity = 0;
                                    if (!Number.isFinite(w.nextIntensity)) w.nextIntensity = 0;
                                    if (!Number.isFinite(w.lightning)) w.lightning = 0;
                                    if (!w.type) w.type = 'clear';
                                    if (!w.nextType) w.nextType = w.type;

                                    // 若关闭环境粒子或减少动画：直接清空天气（并同步关闭音效/后期参数）
                                    if (reducedMotion || !settings.ambient) {
                                        w.type = 'clear';
                                        w.intensity = 0;
                                        w.targetIntensity = 0;
                                        w.nextType = 'clear';
                                        w.nextIntensity = 0;
                                        w.lightning = 0;

                                        if (document && document.body) {
                                            document.body.classList.remove('weather-on', 'weather-rain', 'weather-snow',
                                                'weather-thunder', 'weather-bloodmoon');
                                        }
                                        if (document && document.documentElement && document.documentElement.style) {
                                            const st = document.documentElement.style;
                                            st.setProperty('--weather-hue', '0deg');
                                            st.setProperty('--weather-sat', '1');
                                            st.setProperty('--weather-bright', '1');
                                            st.setProperty('--weather-contrast', '1');
                                        }

                                        // 全局天气后期参数：回到默认
                                        const fx0 = window.TU_WEATHER_FX || (window.TU_WEATHER_FX = {});
                                        fx0.type = 'clear';
                                        fx0.intensity = 0;
                                        fx0.gloom = 0;
                                        fx0.lightning = 0;
                                        fx0.shadowColor = 'rgb(10,5,20)';
                                        fx0.postMode = 'source-over';
                                        fx0.postR = 0; fx0.postG = 0; fx0.postB = 0; fx0.postA = 0;

                                        // 音频（合成雨声）停用
                                        if (this.audio && typeof this.audio.updateWeatherAmbience === 'function') {
                                            this.audio.updateWeatherAmbience(dt, w);
                                        }
                                        return;
                                    }

                                    // RNG（与 seed 绑定，保持可复现）
                                    if (!this._weatherRng) {
                                        const seed = (Number.isFinite(this.seed) ? this.seed : ((Math.random() * 1e9) | 0)) >>> 0;
                                        this._weatherRng = mulberry32(seed ^ 0x9E3779B9);
                                    }
                                    const rng = this._weatherRng;

                                    if (!this._weatherNextAt) this._weatherNextAt = now + 8000 + rng() * 12000;

                                    const t = this.timeOfDay || 0;
                                    const night = (typeof Utils !== 'undefined' && Utils.nightFactor) ? Utils.nightFactor(t) :
                                        0;

                                    // 血月：只在夜晚触发，触发后尽量持续到天亮
                                    if (w.type === 'bloodmoon') {
                                        w.nextType = 'bloodmoon';
                                        w.nextIntensity = 1;
                                        w.targetIntensity = 1;

                                        // 天亮后开始淡出到 clear
                                        if (night < 0.18) {
                                            w.nextType = 'clear'; w.nextIntensity = 0; w.targetIntensity = 0; //
                        // 允许后续重新滚天气
 if (!this._weatherNextAt || this._weatherNextAt - now > 15000) {
                                                this._weatherNextAt = now + 8000 + rng() * 12000;
                                            }
                                        } else {
                                            // 血月期间，不频繁重新决策
                                            if (this._weatherNextAt < now) this._weatherNextAt = now + 60000;
                                        }
                                    } // 决策新的天气目标（非血月时）
 if
                                    (w.type !== 'bloodmoon' && now >= this._weatherNextAt) {
                                        // dawn/dusk 略提高下雨概率；夜晚略提高下雪概率；深夜少量概率触发血月
                                        const dawn = Math.max(0, 1 - Math.abs(t - 0.28) / 0.14);
                                        const dusk = Math.max(0, 1 - Math.abs(t - 0.72) / 0.14);

                                        let pRain = 0.10 + (dawn + dusk) * 0.10;
                                        let pSnow = 0.05 + night * 0.05;

                                        // 血月概率：只在较深夜晚才可能出现
                                        let pBlood = 0;
                                        if (night > 0.55) pBlood = Math.min(0.03, 0.022 * night);

                                        pRain = Math.min(0.28, Math.max(0, pRain));
                                        pSnow = Math.min(0.16, Math.max(0, pSnow));

                                        // 选择类型（血月优先级最高）
                                        const r = rng();
                                        let nextType = 'clear';
                                        if (pBlood > 0 && r < pBlood) { nextType = 'bloodmoon'; } else {
                                            const rr = r - pBlood;
                                            if (rr < pSnow) nextType = 'snow'; else if (rr < pSnow + pRain) { // 雷雨：rain
                                                // 的一个更“压抑”的分支
 const pThunder = 0.38 + night * 0.22; nextType = (rng() < pThunder)
                                                    ? 'thunder' : 'rain';
                                            }
                                        } const nextIntensity = (nextType === 'clear') ? 0 :
                                            (nextType === 'bloodmoon') ? 1 : (0.25 + rng() * 0.75); w.nextType = nextType;
                                        w.nextIntensity = nextIntensity; // 换天气：先淡出，再切换类型，再淡入 if (w.type !==nextType)
                                        if (w.type !== nextType) w.targetIntensity = 0; else w.targetIntensity = nextIntensity; // 下一次变更：18~45 秒
                                        this._weatherNextAt = now + 18000 + rng() * 27000;
                                    }
                                    // 当强度足够低时允许切换类型
                                    if (w.type
                                !== w.nextType && w.intensity < 0.04 && w.targetIntensity === 0) {
                                        w.type = w.nextType; w.targetIntensity = w.nextIntensity;
                                    }
                                    // 平滑插值强度（指数趋近，防止 dt 抖动导致跳变）
                                    const tau = 650; // ms
                                    const k = 1 - Math.exp(-dt / tau);
                                    w.intensity += (w.targetIntensity - w.intensity) * k;
                                    if (Math.abs(w.intensity) < 0.001) w.intensity = 0;
                                    // 雷雨闪电：使用极短的闪光衰减（配合后期 / 光照 LUT）
                                    if (w.type === 'thunder' && w.intensity > 0.12) {
                                        if (!w._lightningNextAt) w._lightningNextAt = now + 1200 + rng() * 2800;
                                        if (now >= w._lightningNextAt) {
                                            w.lightning = 1;
                                            w._lightningNextAt = now + 1800 + rng() * 6500;
                                        }
                                    }
                                    if (w.lightning > 0) {
                                        w.lightning -= dt / 220;
                                        if (w.lightning < 0) w.lightning = 0;
                                    } // 应用 UI / CSS 色调（仅 rain/snow 使用轻量 CSS
                                    // filter；血月 / 雷雨交给 Renderer 的 LUT + postFX）
 const key = w.type + ':' +
                                        Math.round(w.intensity * 100) + ':' + Math.round(w.lightning * 100); if (key
                                            !== this._weatherAppliedKey) {
                                                this._weatherAppliedKey = key; const
                                                    cssOn = w.intensity > 0.06 && (w.type === 'rain' || w.type === 'snow');

                                        if (document && document.body) {
                                            document.body.classList.toggle('weather-on', cssOn);
                                            document.body.classList.toggle('weather-rain', cssOn && w.type === 'rain');
                                            document.body.classList.toggle('weather-snow', cssOn && w.type === 'snow');

                                            // 新增类型：用于 DOM 粒子/状态展示（不驱动 CSS filter）
                                            document.body.classList.toggle('weather-thunder', w.type === 'thunder' &&
                                                w.intensity > 0.06);
                                            document.body.classList.toggle('weather-bloodmoon', w.type === 'bloodmoon'
                                                && w.intensity > 0.06);
                                        }

                                        if (document && document.documentElement && document.documentElement.style) {
                                            const st = document.documentElement.style;

                                            if (!cssOn) {
                                                st.setProperty('--weather-hue', '0deg');
                                                st.setProperty('--weather-sat', '1');
                                                st.setProperty('--weather-bright', '1');
                                                st.setProperty('--weather-contrast', '1');
                                            } else if (w.type === 'rain') {
                                                st.setProperty('--weather-hue', (-6 * w.intensity).toFixed(1) + 'deg');
                                                st.setProperty('--weather-sat', (1 - 0.10 * w.intensity).toFixed(3));
                                                st.setProperty('--weather-bright', (1 - 0.10 * w.intensity).toFixed(3));
                                                st.setProperty('--weather-contrast', (1 + 0.10 * w.intensity).toFixed(3));
                                            } else if (w.type === 'snow') {
                                                st.setProperty('--weather-hue', (4 * w.intensity).toFixed(1) + 'deg');
                                                st.setProperty('--weather-sat', (1 - 0.06 * w.intensity).toFixed(3));
                                                st.setProperty('--weather-bright', (1 + 0.08 * w.intensity).toFixed(3));
                                                st.setProperty('--weather-contrast', (1 + 0.06 * w.intensity).toFixed(3));
                                            }
                                        }
                                    }

                                    // ───────────────────────── Renderer 联动参数：BLOCK_LIGHT_LUT + postProcess
                                    // 色偏（供渲染阶段读取）
                                    const fx = window.TU_WEATHER_FX || (window.TU_WEATHER_FX = {});
                                    fx.type = w.type;
                                    fx.intensity = w.intensity;
                                    fx.lightning = w.lightning;

                                    // gloom：驱动光照 LUT（越大越压抑）
                                    let gloom = 0;
                                    if (w.type === 'thunder') {
                                        gloom = 0.18 + w.intensity * 0.45;
                                    } else if (w.type === 'bloodmoon') {
                                        gloom = w.intensity * (0.25 + 0.38 * night);
                                    }
                                    // clamp 0..0.75
                                    if (gloom < 0) gloom = 0; if (gloom > 0.75) gloom = 0.75;
                                    fx.gloom = gloom;

                                    // 阴影底色（暗角遮罩用）
                                    fx.shadowColor = (w.type === 'bloodmoon') ? 'rgb(30,0,6)'
                                        : (w.type === 'thunder') ? 'rgb(6,10,22)'
                                            : 'rgb(10,5,20)';

                                    // postFX 色偏参数（在 applyPostFX 末尾叠加）
                                    if (w.type === 'thunder') {
                                        fx.postMode = 'multiply';
                                        fx.postR = 70; fx.postG = 90; fx.postB = 125;
                                        fx.postA = Math.min(0.26, 0.08 + 0.16 * w.intensity);
                                    } else if (w.type === 'bloodmoon') {
                                        fx.postMode = 'source-over';
                                        fx.postR = 160; fx.postG = 24; fx.postB = 34;
                                        fx.postA = Math.min(0.30, 0.06 + 0.22 * w.intensity);
                                    } else {
                                        fx.postMode = 'source-over';
                                        fx.postR = 0; fx.postG = 0; fx.postB = 0; fx.postA = 0;
                                    }

                                    // 音频：合成雨声（与 rain/thunder 粒子强度同步）
                                    if (this.audio && typeof this.audio.updateWeatherAmbience ===
                                        'function') {
                                        this.audio.updateWeatherAmbience(dt, w);
                                    }
                                };
                            }

                            // ───────────────────────── Inventory: PointerEvents drag & drop swap
                            (mobile - friendly)
                            const InventoryUI = TU.InventoryUI || window.InventoryUI;
                            if (InventoryUI && InventoryUI.prototype &&
                                !InventoryUI.prototype.__dragDropPatched) {
                                const proto = InventoryUI.prototype;
                                proto.__dragDropPatched = true;

                                proto._slotIndexFromPoint = function (clientX, clientY) {
                                    const el = document.elementFromPoint(clientX, clientY);
                                    if (!el) return -1;
                                    const slot = el.closest ? el.closest('.inv-slot') : null;
                                    if (!slot) return -1;
                                    const idx = parseInt(slot.dataset.idx, 10);
                                    return Number.isFinite(idx) ? idx : -1;
                                };

                                proto._dragSetSource = function (idx) {
                                    if (this._dragSourceIdx === idx) return;
                                    if (Number.isFinite(this._dragSourceIdx) && this._slotEls &&
                                        this._slotEls[this._dragSourceIdx]) {
                                        this._slotEls[this._dragSourceIdx].classList.remove('drag-source');
                                    }
                                    this._dragSourceIdx = idx;
                                    if (Number.isFinite(idx) && this._slotEls && this._slotEls[idx]) {
                                        this._slotEls[idx].classList.add('drag-source');
                                    }
                                };

                                proto._dragSetTarget = function (idx) {
                                    if (this._dragTargetIdx === idx) return;
                                    if (Number.isFinite(this._dragTargetIdx) && this._slotEls &&
                                        this._slotEls[this._dragTargetIdx]) {
                                        this._slotEls[this._dragTargetIdx].classList.remove('drag-target');
                                    }
                                    this._dragTargetIdx = idx;
                                    if (Number.isFinite(idx) && idx >= 0 && this._slotEls &&
                                        this._slotEls[idx]) {
                                        this._slotEls[idx].classList.add('drag-target');
                                    }
                                };

                                proto._dragClear = function () {
                                    this._dragPointerId = null;
                                    this._dragMoved = false;
                                    this._dragStartX = 0;
                                    this._dragStartY = 0;
                                    this._dragStartIdx = -1;

                                    this._dragSetTarget(-1);
                                    this._dragSetSource(-1);
                                };

                                // Close 时清理状态
                                if (typeof proto.close === 'function') {
                                    const _oldClose = proto.close;
                                    proto.close = function () {
                                        this._dragClear && this._dragClear();
                                        return _oldClose.call(this);
                                    };
                                }

                                // 绑定额外的 pointermove/up 来完成拖拽交换
                                if (typeof proto._bind === 'function') {
                                    const _oldBind = proto._bind;
                                    proto._bind = function () {
                                        _oldBind.call(this);
                                        if (this.__dragListenersAdded) return;
                                        this.__dragListenersAdded = true;

                                        const onMove = (e) => {
                                            if (this._dragPointerId !== e.pointerId) return;
                                            const dx = e.clientX - this._dragStartX;
                                            const dy = e.clientY - this._dragStartY;
                                            if (!this._dragMoved && (dx * dx + dy * dy) > 64) this._dragMoved =
                                                true;

                                            const idx = this._slotIndexFromPoint(e.clientX, e.clientY);
                                            this._dragSetTarget(idx);

                                            if (this._dragMoved) e.preventDefault();
                                        };

                                        const onUp = (e) => {
                                            if (this._dragPointerId !== e.pointerId) return;

                                            const moved = !!this._dragMoved;
                                            const targetIdx = Number.isFinite(this._dragTargetIdx) ?
                                                this._dragTargetIdx : -1;
                                            const startIdx = Number.isFinite(this._dragStartIdx) ?
                                                this._dragStartIdx : -1;

                                            this._dragClear();

                                            // 只有“真正拖动”才触发自动落下；点击不动则沿用原逻辑（继续拿在手上）
                                            if (moved && this._cursorItem && targetIdx >= 0 && targetIdx !==
                                                startIdx) {
                                                this._leftClick(targetIdx);
                                                this._changed();
                                            }
                                        };

                                        // 这些监听不会替换原逻辑，只补全拖拽体验
                                        this.overlay.addEventListener('pointermove', onMove, {
                                            passive: false
                                        });
                                        this.overlay.addEventListener('pointerup', onUp, { passive: true });
                                        this.overlay.addEventListener('pointercancel', onUp, { passive: true });

                                        // 兜底：防止 pointerup 在极端情况下丢失
                                        window.addEventListener('pointerup', onUp, { passive: true });
                                        window.addEventListener('pointercancel', onUp, { passive: true });
                                    };
                                }

                                // Slot pointerdown：开始拖拽状态
                                if (typeof proto._onSlotPointerDown === 'function') {
                                    const _oldDown = proto._onSlotPointerDown;
                                    proto._onSlotPointerDown = function (e) {
                                        const idx = parseInt(e.currentTarget.dataset.idx, 10);
                                        const isLeft = (e.button === 0);

                                        _oldDown.call(this, e);

                                        if (!isLeft) return;
                                        if (!this._cursorItem) return;

                                        this._dragPointerId = e.pointerId;
                                        this._dragStartX = e.clientX;
                                        this._dragStartY = e.clientY;
                                        this._dragStartIdx = idx;
                                        this._dragMoved = false;

                                        this._dragSetSource(idx);
                                        this._dragSetTarget(idx);

                                        // 尝试捕获 pointer，确保移动/抬起事件稳定
                                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /*
                                        silently ignore */ }
                                    };
                                }
                            }
                        }
)();

                        (() => {
                            const TU = window.TU || {};
                            (function () {
                                const __p = ({
                                    id: 'batching_idb_pickup_safe_v2',
                                    order: 40,
                                    description: "拾取/存档批处理与安全优化（v2）",
                                    apply: () => {
                                        (function () {
                                            'use strict';

                                            var TU = window.TU || {};
                                            var Renderer = TU.Renderer;
                                            var SaveSystem = TU.SaveSystem;
                                            var DroppedItem = TU.DroppedItem;
                                            var DroppedItemManager = TU.DroppedItemManager;

                                            var CONFIG = TU.CONFIG || window.CONFIG;
                                            var Utils = TU.Utils || window.Utils;
                                            var BLOCK = TU.BLOCK || window.BLOCK;

                                            // 兼容：BLOCK_LIGHT / BLOCK_COLOR 多为 script 顶层 const（不挂在 window），用 typeof 取更稳
                                            var BL = null;
                                            try { BL = (typeof BLOCK_LIGHT !== 'undefined') ? BLOCK_LIGHT : (window.BLOCK_LIGHT || TU.BLOCK_LIGHT); } catch (e) { BL = window.BLOCK_LIGHT || TU.BLOCK_LIGHT; }
                                            var BC = null;
                                            try { BC = (typeof BLOCK_COLOR !== 'undefined') ? BLOCK_COLOR : (window.BLOCK_COLOR || TU.BLOCK_COLOR); } catch (e2) { BC = window.BLOCK_COLOR || TU.BLOCK_COLOR; }

                                            // Toast 兼容（同样可能是顶层 const）
                                            var ToastRef = null;
                                            try { ToastRef = (typeof Toast !== 'undefined') ? Toast : (TU.Toast || window.Toast); } catch (e3) { ToastRef = TU.Toast || window.Toast; }

                                            // ───────────────────────── Patch Flags ─────────────────────────
                                            var FLAGS = window.__TU_PATCH_FLAGS__ = window.__TU_PATCH_FLAGS__ || {};
                                            try {
                                                if (FLAGS.disableChunkBatching == null) FLAGS.disableChunkBatching = (localStorage.getItem('TU_DISABLE_CHUNK_BATCHING') === '1');
                                                if (FLAGS.disableIDBSave == null) FLAGS.disableIDBSave = (localStorage.getItem('TU_DISABLE_IDB_SAVE') === '1');
                                                if (FLAGS.disablePickupAnim == null) FLAGS.disablePickupAnim = (localStorage.getItem('TU_DISABLE_PICKUP_ANIM') === '1');
                                            } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }

                                            // ───────────────────────── IndexedDB Save (robust, async, fallback) ─────────────────────────
                                            var idb = (function () {
                                                var DB_NAME = 'tu_terraria_ultra_save_db_v1';
                                                var STORE = 'kv';
                                                var dbPromise = null;

                                                function open() {
                                                    if (FLAGS.disableIDBSave) return Promise.resolve(null);
                                                    if (!('indexedDB' in window)) return Promise.resolve(null);
                                                    if (dbPromise) return dbPromise;

                                                    dbPromise = new Promise(function (resolve) {
                                                        try {
                                                            var req = indexedDB.open(DB_NAME, 1);
                                                            req.onupgradeneeded = function () {
                                                                try {
                                                                    var db = req.result;
                                                                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                                                                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            };
                                                            req.onsuccess = function () { resolve(req.result); };
                                                            req.onerror = function () { resolve(null); };
                                                        } catch (e) {
                                                            resolve(null);
                                                        }
                                                    });

                                                    return dbPromise;
                                                }

                                                function _tx(db, mode) {
                                                    try { return db.transaction(STORE, mode).objectStore(STORE); } catch (_) { return null; }
                                                }

                                                function get(key) {
                                                    return open().then(function (db) {
                                                        if (!db) return null;
                                                        return new Promise(function (resolve) {
                                                            try {
                                                                var store = _tx(db, 'readonly');
                                                                if (!store) return resolve(null);
                                                                var req = store.get(key);
                                                                req.onsuccess = function () { resolve(req.result || null); };
                                                                req.onerror = function () { resolve(null); };
                                                            } catch (e) {
                                                                resolve(null);
                                                            }
                                                        });
                                                    });
                                                }

                                                function set(key, value) {
                                                    return open().then(function (db) {
                                                        if (!db) return false;
                                                        return new Promise(function (resolve) {
                                                            try {
                                                                var store = _tx(db, 'readwrite');
                                                                if (!store) return resolve(false);
                                                                var req = store.put(value, key);
                                                                req.onsuccess = function () { resolve(true); };
                                                                req.onerror = function () { resolve(false); };
                                                            } catch (e) {
                                                                resolve(false);
                                                            }
                                                        });
                                                    });
                                                }

                                                function del(key) {
                                                    return open().then(function (db) {
                                                        if (!db) return false;
                                                        return new Promise(function (resolve) {
                                                            try {
                                                                var store = _tx(db, 'readwrite');
                                                                if (!store) return resolve(false);
                                                                var req = store.delete(key);
                                                                req.onsuccess = function () { resolve(true); };
                                                                req.onerror = function () { resolve(false); };
                                                            } catch (e) {
                                                                resolve(false);
                                                            }
                                                        });
                                                    });
                                                }

                                                return { open: open, get: get, set: set, del: del };
                                            })();

                                            function decodeSaveDataLikeLocalStorage(data) {
                                                try {
                                                    if (!data) return null;
                                                    var obj = data;
                                                    if (typeof obj === 'string') {
                                                        obj = JSON.parse(obj);
                                                    }
                                                    if (!obj || obj.v !== 1) return null;

                                                    // 解码 diffs（支持旧版数组 & 新版 RLE）
                                                    var diff = new Map();
                                                    var diffs = obj.diffs;

                                                    // 旧版：["x_y_id", ...]
                                                    if (Array.isArray(diffs)) {
                                                        for (var i = 0; i < diffs.length; i++) {
                                                            var s = diffs[i];
                                                            if (typeof s !== 'string') continue;
                                                            var parts = s.split('_');
                                                            if (parts.length !== 3) continue;
                                                            var x = parseInt(parts[0], 36);
                                                            var y = parseInt(parts[1], 36);
                                                            var id = parseInt(parts[2], 36);
                                                            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(id)) continue;
                                                            diff.set(x + ',' + y, id);
                                                        }
                                                    }
                                                    // 新版：{ fmt:'rle1', w, data:[ 'r<start>_<len>_<id>', ... ] }
                                                    else if (diffs && typeof diffs === 'object' && diffs.fmt === 'rle1' && Array.isArray(diffs.data)) {
                                                        var w = Number.isFinite(diffs.w) ? (diffs.w | 0) : (Number.isFinite(obj.w) ? (obj.w | 0) : (CONFIG && CONFIG.WORLD_WIDTH ? CONFIG.WORLD_WIDTH : 2400));
                                                        for (var j = 0; j < diffs.data.length; j++) {
                                                            var token = diffs.data[j];
                                                            if (typeof token !== 'string') continue;
                                                            var t = token.charAt(0) === 'r' ? token.slice(1) : token;
                                                            var ps = t.split('_');
                                                            if (ps.length !== 3) continue;
                                                            var start = parseInt(ps[0], 36);
                                                            var len = parseInt(ps[1], 36);
                                                            var bid = parseInt(ps[2], 36);
                                                            if (!Number.isFinite(start) || !Number.isFinite(len) || !Number.isFinite(bid)) continue;
                                                            if (len <= 0) continue;

                                                            var maxLen = len;
                                                            // 粗略防护：避免极端 token 导致卡死
                                                            if (maxLen > 500000) maxLen = 500000;

                                                            for (var k = 0; k < maxLen; k++) {
                                                                var idx = start + k;
                                                                var xx = idx % w;
                                                                var yy = (idx / w) | 0;
                                                                diff.set(xx + ',' + yy, bid);
                                                            }
                                                        }
                                                    }

                                                    obj._diffMap = diff;
                                                    return obj;
                                                } catch (e) {
                                                    return null;
                                                }
                                            }

                                            if (SaveSystem && !SaveSystem.__idbPatchV2Installed) {
                                                SaveSystem.__idbPatchV2Installed = true;

                                                // 1) clear：同时清理 localStorage + IndexedDB
                                                var _oldClear = SaveSystem.clear;
                                                SaveSystem.clear = function () {
                                                    try { _oldClear && _oldClear.call(SaveSystem); } catch (_) {
                                                        try { localStorage.removeItem(SaveSystem.KEY); } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                    }
                                                    try { idb.del(SaveSystem.KEY); } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                };

                                                // 2) promptStartIfNeeded：如果 localStorage 没有但 IDB 有，也能提示继续
                                                var _oldPrompt = SaveSystem.promptStartIfNeeded;
                                                SaveSystem.promptStartIfNeeded = async function () {
                                                    try {
                                                        var hasLS = false;
                                                        try { hasLS = !!localStorage.getItem(SaveSystem.KEY); } catch (_) { hasLS = false; }

                                                        var hasIDB = false;
                                                        if (!hasLS && !FLAGS.disableIDBSave) {
                                                            try { hasIDB = !!(await idb.get(SaveSystem.KEY)); } catch (_) { hasIDB = false; }
                                                        }

                                                        if (!hasLS && !hasIDB) return { mode: 'new', save: null };

                                                        var overlay = document.getElementById('save-prompt-overlay');
                                                        var btnC = document.getElementById('save-prompt-continue');
                                                        var btnN = document.getElementById('save-prompt-new');
                                                        var btnX = document.getElementById('save-prompt-close');

                                                        if (!overlay || !btnC || !btnN) return { mode: 'new', save: null };

                                                        return await new Promise(function (resolve) {
                                                            var resolved = false;

                                                            var cleanup = function () {
                                                                overlay.classList.remove('show');
                                                                overlay.setAttribute('aria-hidden', 'true');
                                                                btnC.removeEventListener('click', onC);
                                                                btnN.removeEventListener('click', onN);
                                                                if (btnX) btnX.removeEventListener('click', onX);
                                                            };

                                                            var done = function (mode) {
                                                                if (resolved) return;
                                                                resolved = true;
                                                                cleanup();

                                                                if (mode !== 'continue') {
                                                                    resolve({ mode: mode, save: null });
                                                                    return;
                                                                }

                                                                // 继续：优先 localStorage，失败再读 IDB
                                                                (async function () {
                                                                    var save = null;
                                                                    try { save = SaveSystem.load ? SaveSystem.load() : null; } catch (_) { save = null; }
                                                                    if (!save && !FLAGS.disableIDBSave) {
                                                                        try {
                                                                            var raw = await idb.get(SaveSystem.KEY);
                                                                            save = decodeSaveDataLikeLocalStorage(raw);
                                                                        } catch (_) { save = null; }
                                                                    }
                                                                    resolve({ mode: 'continue', save: save });
                                                                })();
                                                            };

                                                            var onC = function () { done('continue'); };
                                                            var onN = function () { done('new'); };
                                                            var onX = function () { done('new'); };

                                                            overlay.classList.add('show');
                                                            overlay.setAttribute('aria-hidden', 'false');
                                                            btnC.addEventListener('click', onC);
                                                            btnN.addEventListener('click', onN);
                                                            if (btnX) btnX.addEventListener('click', onX);
                                                        });
                                                    } catch (e) {
                                                        // 兜底：回退到旧实现
                                                        try {
                                                            return _oldPrompt ? await _oldPrompt.call(SaveSystem) : { mode: 'new', save: null };
                                                        } catch (_) {
                                                            return { mode: 'new', save: null };
                                                        }
                                                    }
                                                };

                                                // 3) save：localStorage 写入 + IDB 备份；localStorage 爆 quota 时自动切到 IDB 不影响继续玩
                                                if (SaveSystem.prototype && typeof SaveSystem.prototype.save === 'function') {
                                                    var _oldSave = SaveSystem.prototype.save;

                                                    SaveSystem.prototype.save = function (reason) {
                                                        // 尽量复用原逻辑；但为了拿到 payload，这里做一次“轻度复制”以保证 IDB 一定能写到
                                                        if (reason === undefined) reason = 'manual';
                                                        if (this._disabled) return;

                                                        var g = this.game;
                                                        if (!g || !g.world || !g.player) return;

                                                        // diff 太大时：停用自动保存，但允许手动保存（尤其是 IDB）
                                                        if (this.diff && this.diff.size > 50000) {
                                                            if (reason === 'autosave') {
                                                                if (!this._autosaveDisabled) {
                                                                    this._autosaveDisabled = true;
                                                                    if (ToastRef && ToastRef.show) ToastRef.show('⚠️ 改动过多：自动保存已停用（可手动保存/清理存档）', 2800);
                                                                }
                                                                return;
                                                            }
                                                        }

                                                        var payload = {
                                                            v: 1,
                                                            ts: Date.now(),
                                                            seed: g.seed || this.seed || Date.now(),
                                                            timeOfDay: g.timeOfDay || 0.35,
                                                            player: {
                                                                x: g.player.x, y: g.player.y,
                                                                health: g.player.health, mana: g.player.mana,
                                                                inventory: g.player.inventory,
                                                                selectedSlot: g.player.selectedSlot
                                                            },
                                                            w: g.world.w, h: g.world.h,
                                                            diffs: SaveSystem._encodeDiff ? SaveSystem._encodeDiff(this.diff, g.world.w) : { fmt: 'rle1', w: g.world.w, data: [] }
                                                        };

                                                        var lsOk = false;
                                                        // localStorage 写入（如果此前已确认 quota 不够，可跳过避免每次 throw）
                                                        if (!this._lsFailed) {
                                                            try {
                                                                localStorage.setItem(SaveSystem.KEY, JSON.stringify(payload));
                                                                lsOk = true;
                                                            } catch (e) {
                                                                this._lsFailed = true;
                                                                lsOk = false;
                                                            }
                                                        }

                                                        // IDB 备份（异步，不阻塞帧）
                                                        if (!FLAGS.disableIDBSave) {
                                                            try {
                                                                idb.set(SaveSystem.KEY, payload).then(function (ok) {
                                                                    if (!ok) return;
                                                                    // 若 localStorage 失败，则提示“已保存(IDB)”，避免用户以为没存上
                                                                    if (!lsOk && ToastRef && ToastRef.show) {
