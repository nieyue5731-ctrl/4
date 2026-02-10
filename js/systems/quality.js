'use strict';

            // 下发其它频率/开关
            this.apply({ force: false, reason: 'fps' });
        }

        _updateResolutionScale(fps, auto) {
            const g = this.game;
            if (!g || !g.renderer || typeof g.renderer.setResolutionScale !== 'function') return;

            // 内部状态（用于节流与滞回，避免频繁 resize 造成“网格线闪动”）
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const st = this._dynResState || (this._dynResState = { good: 0, bad: 0, lastChange: 0 });

            if (!auto) {
                // 用户手动：还原到 1（避免“我关了自动画质但还是糊”的困惑）
                st.good = 0; st.bad = 0; st.lastChange = now;
                if (g.renderer.resolutionScale !== 1) g.renderer.setResolutionScale(1);
                return;
            }

            const level = (g._perf && g._perf.level) ? g._perf.level : this.state.level;
            const low = (level === 'low');

            let minScale = low ? 0.75 : 0.82;
            if (this.device.lowEnd) minScale -= 0.04;
            minScale = clamp(minScale, 0.6, 1);

            const t01 = clamp((fps - 28) / (50 - 28), 0, 1);
            const target = minScale + (1 - minScale) * t01;

            // 关键修复：量化到固定步进，并增加滞回/节流，避免 500ms 一次的小幅变化触发 resize
            const STEP = 0.125; // 1/8：配合 DPR_STEP=0.25（当 baseDpr≈2 时），能更稳定地落在 tile 像素网格上
            const clamp01 = (v) => clamp(v, 0.5, 1);
            const quant = (v) => clamp01(Math.round(v / STEP) * STEP);

            const curRaw = isNum(g.renderer.resolutionScale) ? g.renderer.resolutionScale : 1;
            const cur = quant(curRaw);
            const want = quant(target);

            // 已经在同一档：把实际值轻微“吸附”到档位，避免漂移
            if (Math.abs(want - cur) < (STEP * 0.5)) {
                st.good = 0; st.bad = 0;
                if (Math.abs(curRaw - cur) > 0.002) g.renderer.setResolutionScale(cur);
                return;
            }

            const dirDown = (want < cur);

            // 一次只变动一档，避免突然跳变
            const next = dirDown ? (cur - STEP) : (cur + STEP);
            const nextClamped = clamp01(next);

            if (dirDown) {
                st.bad += 1; st.good = 0;

                // 降档要快一点，但也不要抖：至少间隔 350ms
                if (st.bad >= 1 && (now - st.lastChange) > 350) {
                    g.renderer.setResolutionScale(nextClamped);
                    st.lastChange = now;
                    st.bad = 0;
                }
            } else {
                st.good += 1; st.bad = 0;

                // 升档更保守：需要连续“好帧”样本，并且更长冷却，防止上下反复
                if (st.good >= 3 && (now - st.lastChange) > 1600) {
                    g.renderer.setResolutionScale(nextClamped);
                    st.lastChange = now;
                    st.good = 0;
                }
            }
        }

        _computeEffective() {
            const g = this.game;
            const gs = (g && g.settings) ? g.settings : (window.GAME_SETTINGS || {});
            const auto = !!gs.autoQuality;
            const hidden = !!this.state.hidden;
            const level = (g && g._perf && g._perf.level) ? g._perf.level : this.state.level;

            // DPR cap：用户值为上限；autoQuality 时再叠加设备/低帧约束
            const userDpr = isNum(gs.dprCap) ? gs.dprCap : 2;
            const deviceCap = (this.device.mobile && this.device.lowEnd) ? 1.5 : 2;

            let dprCap = userDpr;
            if (hidden) dprCap = 1;
            else if (auto) {
                dprCap = Math.min(dprCap, deviceCap);
                if (level === 'low') dprCap = Math.min(dprCap, this.device.mobile ? 1.25 : 1.5);
            }

            // 粒子上限：尊重开关（particles=false => 0）
            const particlesEnabled = !!gs.particles;
            let particlesMax = particlesEnabled ? 400 : 0;
            if (hidden) particlesMax = 0;
            else if (auto) {
                if (level === 'low') particlesMax = this.device.lowEnd ? 160 : 220;
                else if (this.device.lowEnd) particlesMax = 260;
            }

            // 小地图刷新频率（重建节流）
            let minimapIntervalMs = 120;
            if (hidden) minimapIntervalMs = 400;
            else if (auto) {
                if (level === 'low') minimapIntervalMs = this.device.lowEnd ? 220 : 180;
                else if (this.device.lowEnd) minimapIntervalMs = 150;
            }

            // 光照刷新频率（合并节流）
            let lightIntervalMs = 0;
            if (hidden) lightIntervalMs = 200;
            else if (auto) {
                if (level === 'low') lightIntervalMs = this.device.lowEnd ? 90 : 60;
                else if (this.device.lowEnd) lightIntervalMs = 30;
            }

            // 后期特效：autoQuality/低端机 自动上限
            const userPostFx = isNum(gs.postFxMode) ? gs.postFxMode : 2;
            let postFxMode = userPostFx;
            if (hidden) postFxMode = 0;
            else if (auto) {
                if (level === 'low') postFxMode = Math.min(postFxMode, 1);
                else if (this.device.lowEnd) postFxMode = Math.min(postFxMode, 1);
            }

            // 背景山脉：用户开关 + autoQuality 低档/后台临时禁用
            const userMountains = (gs.bgMountains !== undefined) ? !!gs.bgMountains : true;
            let bgMountains = userMountains;
            if (hidden) bgMountains = false;
            else if (auto && level === 'low') bgMountains = false;

            // 渲染特效开关：辉光在低档/后台关闭
            const enableGlow = (!hidden) && (!auto || level !== 'low');
            const lowPower = hidden || (auto && level === 'low');

            return {
                level, hidden,
                dprCap,
                particlesMax,
                minimapIntervalMs,
                lightIntervalMs,
                postFxMode,
                bgMountains,
                enableGlow,
                lowPower,
            };
        }

        apply({ force = false, reason = '' } = {}) {
            const g = this.game;
            if (!g) return;

            const eff = this._computeEffective();
            this.effective = eff;
            if (reason) this.state.reason = reason;

            // 下发到全局 settings（非枚举，避免存盘污染）
            const gs = (window.GAME_SETTINGS || g.settings || null);
            if (gs) {
                defineRuntimeSetting(gs, '__dprCapEffective', eff.dprCap);
                defineRuntimeSetting(gs, '__postFxModeEffective', eff.postFxMode);
                defineRuntimeSetting(gs, '__bgMountainsEffective', eff.bgMountains);
                // 额外下发：方便其它模块/样式根据“低功耗”做降级（非枚举，避免存盘污染）
                defineRuntimeSetting(gs, '__lowPowerEffective', !!eff.lowPower);
                defineRuntimeSetting(gs, '__enableGlowEffective', !!eff.enableGlow);
            }

            // 同步到 DOM：低功耗（autoQuality 降档/后台）时降低 UI 特效开销
            try {
                if (typeof document !== 'undefined' && document.documentElement) {
                    document.documentElement.classList.toggle('tu-low-power', !!eff.lowPower);
                }
            } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }

            // 粒子上限
            if (g.particles && typeof g.particles.max === 'number') {
                if (force || g.particles.max !== eff.particlesMax) g.particles.max = eff.particlesMax;
            }

            // 小地图重建节流
            if (g.minimap) {
                if (force || g.minimap.buildIntervalMs !== eff.minimapIntervalMs) g.minimap.buildIntervalMs = eff.minimapIntervalMs;
            }

            // 光照刷新节流
            if (force || g._lightIntervalMs !== eff.lightIntervalMs) g._lightIntervalMs = eff.lightIntervalMs;

            // 渲染器开关
            if (g.renderer) {
                if (force || g.renderer.enableGlow !== eff.enableGlow) g.renderer.enableGlow = eff.enableGlow;
                if (force || g.renderer.lowPower !== eff.lowPower) g.renderer.lowPower = eff.lowPower;
            }

            // DPR cap 变化：触发 resize（避免每帧 resize）
            const last = this._last.__dprCapEffective;
            if (force || !isNum(last) || Math.abs(last - eff.dprCap) > 0.01) {
                this._last.__dprCapEffective = eff.dprCap;
                if (g.renderer && typeof g.renderer.resize === 'function') g.renderer.resize();
            }
        }
    }

    TU.QualityManager = QualityManager;
})();


// ═══════════════════════════════════════════════════════════════════════════════
class UIManager {
    constructor(player, textures, uiFlush) {
        this.uiFlush = uiFlush || null;
        this.player = player;
        this.textures = textures;

        // 缓存高频 DOM 引用（避免每帧 getElementById/querySelector）
        this.hotbarEl = document.getElementById('hotbar');
        this.miningBarEl = document.getElementById('mining-bar');
        this.itemHintEl = document.getElementById('item-hint');

        this.healthFillEl = document.getElementById('health-fill');
        this.manaFillEl = document.getElementById('mana-fill');
        this.healthValueEl = document.getElementById('health-value');
        this.manaValueEl = document.getElementById('mana-value');

        this.timeTextEl = document.getElementById('time-text');
        this.timeIconEl = document.getElementById('time-icon');

        this.miningFillEl = this.miningBarEl ? this.miningBarEl.querySelector('.fill') : null;

        // 新版挖掘 HUD：名称/百分比/图标（更稳 + 更好看）
        this.miningNameEl = document.getElementById('mining-name');
        this.miningPercentEl = document.getElementById('mining-percent');
        this.miningIconEl = document.getElementById('mining-icon');
        this.miningIconCtx = this.miningIconEl ? this.miningIconEl.getContext('2d', { willReadFrequently: true }) : null;
        if (this.miningIconCtx) this.miningIconCtx.imageSmoothingEnabled = false;

        // 挖掘 HUD 缓存（减少重复写 DOM）
        this._miningVisible = false;
        this._miningLastId = null;
        this._miningLastPct = -1;
        this._miningLastWidth = '';
        this._miningHideTimer = 0;
        this._miningDimW = 200;
        this._miningDimH = 56;
        this._miningDimMeasured = false;

        // 变更检测（不改变显示，只减少重复写 DOM）
        this._lastHp = -1;
        this._lastMaxHp = -1;
        this._lastMp = -1;
        this._lastMaxMp = -1;
        this._lastHpWidth = '';
        this._lastMpWidth = '';
        this._lastHpText = '';
        this._lastMpText = '';

        this._lastTimeStr = '';
        this._lastTimeIcon = '';
        this._hintTimer = 0;
        this._lastHintText = '';

        this.buildHotbar();

        // 移动端：快捷栏支持左右滑动切换（更容易单手操作）
        if (Utils && Utils.isMobile && Utils.isMobile()) {
            this._bindHotbarSwipe();
        }

        // 首次：同步一次物品提示
        this._updateItemHint(false);
    }

    buildHotbar() {
        const HOTBAR_SIZE = 9; // 快捷栏固定9格

        // 首次构建：创建 DOM，并缓存引用；后续只做“增量更新”，避免频繁 innerHTML/创建 canvas
        if (!this._hotbarSlots) {
            this._hotbarSlots = new Array(HOTBAR_SIZE);
            this._hotbarCanvases = new Array(HOTBAR_SIZE);
            this._hotbarCtx = new Array(HOTBAR_SIZE);
            this._hotbarCountEls = new Array(HOTBAR_SIZE);
            this._hotbarLastId = new Array(HOTBAR_SIZE).fill(null);

            this.hotbarEl.innerHTML = '';

            for (let i = 0; i < HOTBAR_SIZE; i++) {
                const slot = document.createElement('div');
                slot.className = 'slot';

                if (!Utils.isMobile()) {
                    const key = document.createElement('span');
                    key.className = 'key';
                    key.textContent = String(i + 1);
                    slot.appendChild(key);
                }

                // pickaxe icon（复用，不用每次创建）
                const pickaxeIcon = document.createElement('span');
                pickaxeIcon.className = 'item-icon';
                pickaxeIcon.textContent = '⛏️';
                pickaxeIcon.style.display = 'none';
                slot.appendChild(pickaxeIcon);
                slot._pickaxeIcon = pickaxeIcon;

                // 物品贴图 canvas（复用）
                const c = document.createElement('canvas');
                c.width = c.height = 32;
                c.style.display = 'none';
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.imageSmoothingEnabled = false;
                slot.appendChild(c);

                // 数量标签（复用）
                const count = document.createElement('span');
                count.className = 'count';
                count.style.display = 'none';
                slot.appendChild(count);

                // 事件绑定一次即可
                slot.addEventListener('click', () => this.selectSlot(i));
                slot.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.selectSlot(i);
                }, { passive: false });

                this.hotbarEl.appendChild(slot);

                this._hotbarSlots[i] = slot;
                this._hotbarCanvases[i] = c;
                this._hotbarCtx[i] = cx;
                this._hotbarCountEls[i] = count;
            }
        }

        for (let i = 0; i < HOTBAR_SIZE; i++) {
            const item = this.player.inventory[i]; // 可能为 undefined
            const slot = this._hotbarSlots[i];
            const canvas = this._hotbarCanvases[i];
            const cx = this._hotbarCtx[i];
            const countEl = this._hotbarCountEls[i];
            const pickaxeIcon = slot._pickaxeIcon;

            slot.classList.toggle('active', i === this.player.selectedSlot);

            // 如果没有物品或数量为0，添加empty样式
            const empty = (!item || (item.count === 0 && item.id !== 'pickaxe'));
            slot.classList.toggle('empty', empty);

            if (!item || item.count === 0) {
                pickaxeIcon.style.display = 'none';
                canvas.style.display = 'none';
                countEl.style.display = 'none';
                this._hotbarLastId[i] = null;
                continue;
            }

            if (item.id === 'pickaxe') {
                pickaxeIcon.style.display = '';
                canvas.style.display = 'none';
                countEl.style.display = 'none';
                this._hotbarLastId[i] = 'pickaxe';
                continue;
            }

            // 普通方块/物品
            pickaxeIcon.style.display = 'none';
            canvas.style.display = '';

            // 仅在物品类型变化时重绘 icon（count 变化只更新文字）
            if (this._hotbarLastId[i] !== item.id) {
                cx.clearRect(0, 0, 32, 32);
                const tex = this.textures.get(item.id);
                if (tex) cx.drawImage(tex, 0, 0, 32, 32);
                this._hotbarLastId[i] = item.id;
            }

            if (item.count >= 1) {
                countEl.textContent = String(item.count);
                countEl.style.display = '';
            } else {
                countEl.style.display = 'none';
            }
        }

        // 同步选中物品提示（计数变化也会更新，但不强制显示）
        this._updateItemHint(false);

        // 通知背包/其它 UI 刷新（避免直接耦合 Game 实例）
        try {
            document.dispatchEvent(new CustomEvent('tu:inventoryChanged'));
        } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
    }

    selectSlot(i) {
        this.player.selectedSlot = i;

        // 走缓存引用，避免每次 querySelectorAll
        if (this._hotbarSlots) {
            for (let j = 0; j < this._hotbarSlots.length; j++) {
                this._hotbarSlots[j].classList.toggle('active', i === j);
            }
        } else {
            this.hotbarEl.querySelectorAll('.slot').forEach((el, j) => el.classList.toggle('active', i === j));
        }
        this._updateItemHint(true);
    }

    _updateItemHint(forceShow) {
        if (!this.itemHintEl) return;

        const item = this.player.getItem();
        let text = '';
        if (!item) {
            text = '空手';
        } else if (item.id === 'pickaxe') {
            text = '⛏️ 镐子';
        } else {
            const meta = (typeof BLOCK_DATA === 'object' && BLOCK_DATA[item.id]) ? BLOCK_DATA[item.id] : null;
            const name = (meta && meta.name) ? meta.name : ('方块 #' + item.id);
            const count = (typeof item.count === 'number') ? item.count : 0;
            text = name + (count >= 1 ? (' ×' + count) : '');
        }

        // 仅当内容变化时写 DOM
        if (text !== this._lastHintText) {
            this.itemHintEl.textContent = text;
            this._lastHintText = text;
        }

        // 选中/切换物品时短暂显示一下，避免长期占位
        if (forceShow) {
            this.itemHintEl.classList.add('show');
            clearTimeout(this._hintTimer);
            this._hintTimer = setTimeout(() => {
                try { this.itemHintEl.classList.remove('show'); } catch { }
            }, 1400);
        }
    }

    _bindHotbarSwipe() {
        if (!this.hotbarEl) return;

        let active = false;
        let startX = 0;
        let startY = 0;
        const threshold = 22; // px：越小越敏感

        const onStart = (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            active = true;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
        };
        const onMove = (e) => {
            if (!active || !e.touches || e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;

            // 明显纵向滑动：放行（避免与页面/面板滚动冲突）
            if (Math.abs(dy) > Math.abs(dx) * 1.2) return;

            if (Math.abs(dx) >= threshold) {
                e.preventDefault();
                const dir = dx < 0 ? 1 : -1; // 左滑=下一个，右滑=上一个
                const size = 9;
                const next = (this.player.selectedSlot + dir + size) % size;
                this.selectSlot(next);

                // 轻微震动反馈（可选）
                try {
                    if (window.GAME_SETTINGS && window.GAME_SETTINGS.vibration && navigator.vibrate) navigator.vibrate(4);
                } catch { }

                startX = t.clientX;
                startY = t.clientY;
            }
        };
        const onEnd = () => { active = false; };

        this.hotbarEl.addEventListener('touchstart', onStart, { passive: true });
        this.hotbarEl.addEventListener('touchmove', onMove, { passive: false });
        this.hotbarEl.addEventListener('touchend', onEnd, { passive: true });
        this.hotbarEl.addEventListener('touchcancel', onEnd, { passive: true });
    }

    updateStats() {
        const p = this.player;
        const hp = p.health, maxHp = p.maxHealth;
        const mp = p.mana, maxMp = p.maxMana;

        const flush = this.uiFlush;
        const enqueue = (key, fn) => {
            if (flush && typeof flush.enqueue === 'function') flush.enqueue(key, fn);
            else fn();
        };

        if (hp !== this._lastHp || maxHp !== this._lastMaxHp) {
            const w = (hp / maxHp * 100) + '%';
            if (w !== this._lastHpWidth) {
                const el = this.healthFillEl;
                const v = w;
                enqueue('hud:hp:fill', () => { if (el) el.style.width = v; });
                this._lastHpWidth = w;
            }
            const t = `${hp}/${maxHp}`;
            if (t !== this._lastHpText) {
                const el = this.healthValueEl;
                const v = t;
                enqueue('hud:hp:text', () => { if (el) el.textContent = v; });
                this._lastHpText = t;
            }
            this._lastHp = hp;
            this._lastMaxHp = maxHp;
        }

        if (mp !== this._lastMp || maxMp !== this._lastMaxMp) {
            const w = (mp / maxMp * 100) + '%';
            if (w !== this._lastMpWidth) {
                const el = this.manaFillEl;
                const v = w;
                enqueue('hud:mp:fill', () => { if (el) el.style.width = v; });
                this._lastMpWidth = w;
            }
            const t = `${mp}/${maxMp}`;
            if (t !== this._lastMpText) {
                const el = this.manaValueEl;
                const v = t;
                enqueue('hud:mp:text', () => { if (el) el.textContent = v; });
                this._lastMpText = t;
            }
            this._lastMp = mp;
            this._lastMaxMp = maxMp;
        }
    }

    updateTime(timeOfDay) {
        const hours = Math.floor(timeOfDay * 24);
        const minutes = Math.floor((timeOfDay * 24 - hours) * 60);
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        const flush = this.uiFlush;
        const enqueue = (key, fn) => {
            if (flush && typeof flush.enqueue === 'function') flush.enqueue(key, fn);
            else fn();
        };

        if (timeStr !== this._lastTimeStr) {
            const el = this.timeTextEl;
            const v = timeStr;
            enqueue('hud:time:text', () => { if (el) el.textContent = v; });
            this._lastTimeStr = timeStr;
        }

        const icon = timeOfDay > 0.25 && timeOfDay < 0.75 ? '☀️' : '🌙';
        if (icon !== this._lastTimeIcon) {
            const el = this.timeIconEl;
            const v = icon;
            enqueue('hud:time:icon', () => { if (el) el.textContent = v; });
            this._lastTimeIcon = icon;
        }
    }

    showMining(x, y, progress, blockId) {
        if (!this.miningBarEl || !this.miningFillEl) return;

        // Clamp progress
        let p = Number(progress);
        if (!Number.isFinite(p)) p = 0;
        if (p < 0) p = 0;
        if (p > 1) p = 1;

        // Show (fade-in)
        if (!this._miningVisible) {
            this._miningVisible = true;
            clearTimeout(this._miningHideTimer);
            this.miningBarEl.style.display = 'block';
            try { void this.miningBarEl.offsetWidth; } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
            this.miningBarEl.classList.add('show');

            // Measure once for smarter clamping
            if (!this._miningDimMeasured) {
                try {
                    const r = this.miningBarEl.getBoundingClientRect();
                    if (r && r.width) {
                        this._miningDimW = r.width;
                        this._miningDimH = r.height;
                        this._miningDimMeasured = true;
                    }
                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
            }
        }

        // Update label/icon only when target changes
        if (typeof blockId === 'number' && blockId !== this._miningLastId) {
            this._miningLastId = blockId;

            // Name
            let name = '';
            try {
                const meta = (typeof BLOCK_DATA === 'object' && BLOCK_DATA && BLOCK_DATA[blockId]) ? BLOCK_DATA[blockId] : null;
                name = (meta && meta.name) ? meta.name : ('方块 #' + blockId);
            } catch (_) {
                name = '方块 #' + blockId;
            }
            if (this.miningNameEl) this.miningNameEl.textContent = name;

            // Accent color based on block
            try {
                const col = (typeof BLOCK_COLOR === 'object' && BLOCK_COLOR && BLOCK_COLOR[blockId]) ? BLOCK_COLOR[blockId] : '#ffeaa7';
                this.miningBarEl.style.setProperty('--mb-accent', col);
            } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }

            // Icon
            if (this.miningIconCtx && this.miningIconEl) {
                try {
                    const w = this.miningIconEl.width || 18;
                    const h = this.miningIconEl.height || 18;
                    this.miningIconCtx.clearRect(0, 0, w, h);

                    const tex = (this.textures && this.textures.get) ? this.textures.get(blockId) : null;
                    if (tex) {
                        this.miningIconCtx.drawImage(tex, 0, 0, w, h);
                    } else {
                        const col = (typeof BLOCK_COLOR === 'object' && BLOCK_COLOR && BLOCK_COLOR[blockId]) ? BLOCK_COLOR[blockId] : '#ffeaa7';
                        this.miningIconCtx.fillStyle = col;
                        this.miningIconCtx.fillRect(0, 0, w, h);
                    }
                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
            }
        }

        // Percent text
        const pct = Math.round(p * 100);
        if (this.miningPercentEl && pct !== this._miningLastPct) {
            this.miningPercentEl.textContent = pct + '%';
            this._miningLastPct = pct;
        }

        // Fill width (cache to reduce writes)
        const wStr = (p * 100).toFixed(1) + '%';
        if (wStr !== this._miningLastWidth) {
            this.miningFillEl.style.width = wStr;
            this._miningLastWidth = wStr;
        }

        // Position (anchor at bottom-center)
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;
        const mw = this._miningDimW || 200;
        const mh = this._miningDimH || 56;
        const margin = 10;

        let sx = Number(x);
        let sy = Number(y);
        if (!Number.isFinite(sx)) sx = vw * 0.5;
        if (!Number.isFinite(sy)) sy = vh * 0.5;

        // Slight gap above target tile/cursor
        sy = sy - 8;

        const cx = Math.max(margin + mw * 0.5, Math.min(vw - margin - mw * 0.5, sx));
        const cy = Math.max(margin + mh, Math.min(vh - margin, sy));

        this.miningBarEl.style.left = cx + 'px';
        this.miningBarEl.style.top = cy + 'px';
    }

    hideMining() {
        if (!this.miningBarEl) return;

        if (!this._miningVisible) {
            this.miningBarEl.style.display = 'none';
            return;
        }

        this._miningVisible = false;
        this.miningBarEl.classList.remove('show');

        clearTimeout(this._miningHideTimer);
        this._miningHideTimer = setTimeout(() => {
            if (!this._miningVisible) {
                try { this.miningBarEl.style.display = 'none'; } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
            }
        }, 160);
    }

}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   小地图 (美化版)

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { UIManager });


// ═══════════════════════════════════════════════════════════════════════════════
class Minimap {
    constructor(world) {
        this.canvas = document.getElementById('minimap-canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.ctx.imageSmoothingEnabled = false;
        this._lastBuildAt = 0;
        this.buildIntervalMs = 120; // 可由 QualityManager 动态下发

        this.world = world;
        this.canvas.width = 160;
        this.canvas.height = 100;

        // 静态底图：OffscreenCanvas（支持时）/ 内存 canvas（回退）
        const off = (typeof OffscreenCanvas !== 'undefined')
            ? new OffscreenCanvas(160, 100)
            : document.createElement('canvas');
        off.width = 160;
        off.height = 100;
        this._mapCanvas = off;
        this._mapCtx = off.getContext('2d', { willReadFrequently: true });
        this._mapCtx.imageSmoothingEnabled = false;

        this.imageData = this._mapCtx.createImageData(160, 100);
        this.dirty = true;
    }

    update() {
        if (!this.dirty) return;

        // 史诗级优化：小地图重建节流（挖掘/放置连发时避免频繁 putImageData）
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const interval = (typeof this.buildIntervalMs === 'number' && isFinite(this.buildIntervalMs))
            ? Math.max(30, this.buildIntervalMs)
            : 120;
        if (this._lastBuildAt && (now - this._lastBuildAt) < interval) return;
        this._lastBuildAt = now;

        const tiles = this.world.tiles;
        const w = this.world.w;
        const h = this.world.h;

        const sx = w / 160;
        const sy = h / 100;
        const surfaceY = h * CONFIG.SURFACE_LEVEL;

        const data = this.imageData.data;
        let idx = 0;

        // 改为 y 外层 / x 内层，按内存顺序写入 ImageData，更快且不改变效果
        for (let y = 0; y < 100; y++) {
            const wy = Math.floor(y * sy);
            const isSky = wy < surfaceY;

            for (let x = 0; x < 160; x++) {
                const wx = Math.floor(x * sx);
                const b = tiles[wx][wy];

                let r, g, bl;
                if (b === BLOCK.AIR) {
                    if (isSky) { r = 116; g = 185; bl = 255; }
                    else { r = 30; g = 25; bl = 40; }
                } else {
                    const packed = BLOCK_COLOR_PACKED[b];
                    r = (packed >> 16) & 255;
                    g = (packed >> 8) & 255;
                    bl = packed & 255;
                }

                data[idx++] = r;
                data[idx++] = g;
                data[idx++] = bl;
                data[idx++] = 255;
            }
        }

        // 写入离屏底图（静态）
        this._mapCtx.putImageData(this.imageData, 0, 0);
