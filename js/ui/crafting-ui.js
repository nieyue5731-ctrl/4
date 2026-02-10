'use strict';
        document.getElementById('craft-title').textContent = `${info.name} (x${recipe.count})`;
        document.getElementById('craft-desc').textContent = recipe.desc;

        // 预览图
        const preview = document.getElementById('craft-preview');
        preview.innerHTML = '';
        const tex = this.game.renderer.textures.get(recipe.out);
        if (tex) {
            const c = document.createElement('canvas');
            c.width = 48; c.height = 48;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tex, 0, 0, 48, 48);
            preview.appendChild(c);
        }

        // 原料列表
        const ingList = document.getElementById('craft-ingredients');
        ingList.innerHTML = '';
        let allHave = true;

        recipe.req.forEach(req => {
            const have = this._countItem(req.id);
            const needed = req.count;
            const isEnough = have >= needed;
            if (!isEnough) allHave = false;

            const reqInfo = BLOCK_DATA[req.id];

            const div = document.createElement('div');
            div.className = `ingredient ${isEnough ? '' : 'missing'}`;
            div.innerHTML = `
        <span class="ing-name">${reqInfo.name}</span>
        <span class="ing-count ${isEnough ? 'ok' : 'bad'}">${have}/${needed}</span>
    `;
            ingList.appendChild(div);
        });

        // 按钮状态
        this.craftBtn.disabled = !allHave;
        this.craftBtn.textContent = allHave ? "制造" : "材料不足";
    }

    craft() {
        if (!this.selectedRecipe || !this._canCraft(this.selectedRecipe)) return;

        // 扣除材料
        this.selectedRecipe.req.forEach(req => {
            this._consumeItem(req.id, req.count);
        });

        // 添加结果
        this.game._addToInventory(this.selectedRecipe.out, this.selectedRecipe.count);

        // 刷新界面
        this.refresh();
        this.selectRecipe(this.selectedRecipe);

        // 更新快捷栏
        this.game.ui.buildHotbar();
    }

    _canCraft(recipe) {
        return recipe.req.every(req => this._countItem(req.id) >= req.count);
    }

    _countItem(id) {
        let count = 0;
        for (const item of this.game.player.inventory) {
            if (item.id === id) count += item.count;
        }
        return count;
    }

    _consumeItem(id, count) {
        let remaining = count;
        for (const item of this.game.player.inventory) {
            if (item.id === id) {
                const take = Math.min(item.count, remaining);
                item.count -= take;
                remaining -= take;
                if (remaining <= 0) break;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   UI管理器 (美化版)

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { CraftingSystem });


(() => {
    'use strict';
    const TU = (window.TU = window.TU || {});
    if (TU.UIFlushScheduler) return;

    /**
     * UIFlushScheduler
     * - 只收集“DOM 写操作”（最后一次覆盖前面的）
     * - 在游戏 rAF 的统一 flush 阶段执行，避免每帧/每个子步频繁写 DOM
     */
    class UIFlushScheduler {
        constructor() {
            this._map = new Map();
            this._order = [];
            this._flushing = false;
        }

        enqueue(key, fn) {
            if (!key || typeof fn !== 'function') return;
            const k = String(key);
            if (!this._map.has(k)) this._order.push(k);
            this._map.set(k, fn);
        }

        clear() {
            this._map.clear();
            this._order.length = 0;
        }

        flush() {
            if (this._flushing) return;
            if (this._order.length === 0) return;

            this._flushing = true;
            try {
                for (let i = 0; i < this._order.length; i++) {
                    const k = this._order[i];
                    const fn = this._map.get(k);
                    if (fn) {
                        try { fn(); } catch (e) { /* 单个 UI 写入失败不影响主循环 */ }
                    }
                }
            } finally {
                this.clear();
                this._flushing = false;
            }
        }
    }

    TU.UIFlushScheduler = UIFlushScheduler;
})();

(() => {
    'use strict';
    const TU = (window.TU = window.TU || {});
    if (TU.QualityManager) return;

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const isNum = (v) => (typeof v === 'number' && isFinite(v));

    function defineRuntimeSetting(obj, key, value) {
        if (!obj) return;
        try {
            const desc = Object.getOwnPropertyDescriptor(obj, key);
            if (!desc || desc.enumerable) {
                Object.defineProperty(obj, key, { value, writable: true, configurable: true });
            } else {
                obj[key] = value;
            }
        } catch (_) {
            try { obj[key] = value; } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
        }
    }

    function detectDevice() {
        const nav = (typeof navigator !== 'undefined') ? navigator : {};
        const mem = Number(nav.deviceMemory) || 0;
        const cores = Number(nav.hardwareConcurrency) || 0;
        const ua = String(nav.userAgent || '').toLowerCase();

        let mobile = false;
        try {
            mobile = (typeof Utils !== 'undefined' && Utils.isMobile) ? Utils.isMobile() : /mobi|android|iphone|ipad|ipod/.test(ua);
        } catch (_) {
            mobile = /mobi|android|iphone|ipad|ipod/.test(ua);
        }

        const dpr = (window.devicePixelRatio || 1);
        const lowMem = mem && mem <= 4;
        const lowCores = cores && cores <= 4;

        // 粗略低端判断：移动端 + (低内存/低核/超高 DPR) 更容易掉帧
        const lowEnd = mobile ? (lowMem || lowCores || dpr >= 2.75) : (lowMem && lowCores);

        return { mobile, mem, cores, dpr, lowEnd };
    }

    class QualityManager {
        constructor(game) {
            this.game = game;
            this.device = detectDevice();

            this.state = {
                hidden: !!(typeof document !== 'undefined' && document.hidden),
                fps: 60,
                level: (game && game._perf && game._perf.level) ? game._perf.level : 'high',
                reason: 'init',
            };

            this.effective = {};
            this._last = { __dprCapEffective: null };

            // 初次下发（不依赖后续 patch）
            this.apply({ force: true, reason: 'init' });
        }

        onVisibilityChange(hidden) {
            this.state.hidden = !!hidden;
            this.apply({ force: true, reason: hidden ? 'hidden' : 'visible' });
        }

        onSettingsChanged() {
            this.apply({ force: true, reason: 'settings' });
        }

        onFpsSample(fps, spanMs = 500) {
            if (!isNum(fps)) return;

            const g = this.game;
            const gs = (g && g.settings) ? g.settings : (window.GAME_SETTINGS || {});
            const auto = !!(gs && gs.autoQuality);

            this.state.fps = fps;

            const p = (g && g._perf) ? g._perf : null;
            const span = isNum(spanMs) ? spanMs : 500;

            if (this.state.hidden) {
                this.apply({ force: false, reason: 'hidden-fps' });
                return;
            }

            if (p) {
                if (auto) {
                    if (fps < 45) { p.lowForMs = (p.lowForMs || 0) + span; p.highForMs = 0; }
                    else if (fps > 56) { p.highForMs = (p.highForMs || 0) + span; p.lowForMs = 0; }
                    else { p.lowForMs = 0; p.highForMs = 0; }

                    // 低端设备：更积极降级（避免抖动）
                    const wantLow = (p.lowForMs >= 1000) || (this.device.lowEnd && p.lowForMs >= 600);
                    const wantHigh = (p.highForMs >= 1400);

                    if (wantLow && p.level !== 'low') {
                        p.level = 'low';
                        this.state.level = 'low';
                        this.state.reason = 'fps-low';
                        if (typeof g._setQuality === 'function') g._setQuality('low');
                    } else if (wantHigh && p.level !== 'high') {
                        p.level = 'high';
                        this.state.level = 'high';
                        this.state.reason = 'fps-high';
                        if (typeof g._setQuality === 'function') g._setQuality('high');
                    }
                } else {
                    // 关闭自动画质：保持高画质（尊重用户显式选择）
                    p.lowForMs = 0; p.highForMs = 0;
                    if (p.level !== 'high') {
                        p.level = 'high';
                        this.state.level = 'high';
                        this.state.reason = 'manual';
                        if (typeof g._setQuality === 'function') g._setQuality('high');
                    }
                }
            }

            // 动态分辨率（autoQuality 才启用）
            this._updateResolutionScale(fps, auto);
