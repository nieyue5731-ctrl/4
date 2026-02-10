'use strict';
        renderParallaxMountains(this, cam, time);
    }

    renderWorld(world, cam, time) {
        if (!world || !world.tiles || !world.light) return;

        const ctx = this.ctx;
        const ts = CONFIG.TILE_SIZE;
        const startX = Math.max(0, ((cam.x / ts) | 0) - 1);
        const startY = Math.max(0, ((cam.y / ts) | 0) - 1);
        const endX = Math.min(world.w - 1, startX + ((this.w / ts) | 0) + 3);
        const endY = Math.min(world.h - 1, startY + ((this.h / ts) | 0) + 3);
        const camCeilX = Math.ceil(cam.x);
        const camCeilY = Math.ceil(cam.y);
        const lut = window.BLOCK_LIGHT_LUT;
        if (!lut) return;

        // Prepare Bucket
        const bucket = this._getBucketState();
        bucket.reset();
        const texArr = this._ensureTexArray();

        const tiles = world.tiles;
        const light = world.light;
        const BL = window.BLOCK_LIGHT;
        const AIR = (window.BLOCK && window.BLOCK.AIR) || 0;

        // Fill buckets
        // Check for flatified world (optimization)
        if (world.tilesFlat && world.lightFlat && world.tilesFlat.length === world.w * world.h) {
            const H = world.h | 0;
            const tf = world.tilesFlat;
            const lf = world.lightFlat;
            for (let x = startX; x <= endX; x++) {
                const base = x * H;
                for (let y = startY; y <= endY; y++) {
                    const idx = base + y;
                    const block = tf[idx] | 0;
                    if (block === AIR) continue;

                    const px = x * ts - camCeilX;
                    const py = y * ts - camCeilY;
                    const pp = ((px & 0xffff) << 16) | (py & 0xffff);

                    const bl = BL[block] | 0;
                    if (bl > 5) {
                        if (bucket.glowLists[block].length === 0) bucket.glowKeys.push(block);
                        bucket.glowLists[block].push(pp);
                    }

                    const lv = lf[idx] & 255;
                    const a = lut[lv];
                    if (a) {
                        if (bucket.darkLists[lv].length === 0) bucket.darkKeys.push(lv);
                        bucket.darkLists[lv].push(pp);
                    }
                }
            }
        } else {
            // Legacy array of arrays
            for (let x = startX; x <= endX; x++) {
                const colT = tiles[x];
                const colL = light[x];
                for (let y = startY; y <= endY; y++) {
                    const block = colT[y] | 0;
                    if (block === AIR) continue;

                    const px = x * ts - camCeilX;
                    const py = y * ts - camCeilY;
                    const pp = ((px & 0xffff) << 16) | (py & 0xffff);

                    const bl = BL[block] | 0;
                    if (bl > 5) {
                        if (bucket.glowLists[block].length === 0) bucket.glowKeys.push(block);
                        bucket.glowLists[block].push(pp);
                    }
                    const lv = colL[y] & 255;
                    const a = lut[lv];
                    if (a) {
                        if (bucket.darkLists[lv].length === 0) bucket.darkKeys.push(lv);
                        bucket.darkLists[lv].push(pp);
                    }
                }
            }
        }

        // Render Glow Tiles
        if (this.enableGlow) {
            ctx.shadowBlur = 0; // optimized handling inside loop? no, batch shadow change
            // Group by block to share shadow color
            for (let i = 0; i < bucket.glowKeys.length; i++) {
                const bid = bucket.glowKeys[i];
                const list = bucket.glowLists[bid];
                const tex = texArr ? texArr[bid] : this.textures.get(bid);
                if (!tex) continue;

                const color = BLOCK_COLOR[bid] || '#fff';
                const bl = BL[bid];
                ctx.shadowColor = color;
                ctx.shadowBlur = bl * 2;

                for (let j = 0; j < list.length; j++) {
                    const p = list[j];
                    ctx.drawImage(tex, (p >> 16) & 0xffff, p & 0xffff);
                }
            }
            ctx.shadowBlur = 0;
        } else {
            // No glow, just draw
            for (let i = 0; i < bucket.glowKeys.length; i++) {
                const bid = bucket.glowKeys[i];
                const list = bucket.glowLists[bid];
                const tex = texArr ? texArr[bid] : this.textures.get(bid);
                if (!tex) continue;
                for (let j = 0; j < list.length; j++) {
                    const p = list[j];
                    ctx.drawImage(tex, (p >> 16) & 0xffff, p & 0xffff);
                }
            }
        }

        // Render Dark Mask
        ctx.fillStyle = '#000';
        bucket.darkKeys.sort((a, b) => a - b);
        for (let i = 0; i < bucket.darkKeys.length; i++) {
            const lv = bucket.darkKeys[i];
            const list = bucket.darkLists[lv];
            ctx.globalAlpha = lut[lv];
            ctx.beginPath();
            for (let j = 0; j < list.length; j++) {
                const p = list[j];
                ctx.rect((p >> 16) & 0xffff, p & 0xffff, ts, ts);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    renderHighlight(tx, ty, cam, inRange) {
        const ctx = this.ctx;
        const ts = CONFIG.TILE_SIZE;
        const sx = tx * ts - Math.ceil(cam.x);
        const sy = ty * ts - Math.ceil(cam.y);

        if (inRange) {
            // 发光选框
            ctx.shadowColor = '#ffeaa7';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = 'rgba(255, 234, 167, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, ts, ts);
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255, 234, 167, 0.15)';
            ctx.fillRect(sx, sy, ts, ts);
        } else {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, ts, ts);
        }
    }

    // Unified Post Process (incorporating Sprint Blur and Ultra Visuals)
    applyPostFX(time, depth01, reducedMotion) {
        // 1. Sprint Blur (Speed Lines)
        const amtRaw = (typeof this._speedBlurAmt === 'number') ? this._speedBlurAmt : 0;
        const amt = Math.max(0, Math.min(1, amtRaw));

        if (!reducedMotion && amt > 0.04) {
            try {
                const canvas = this.canvas;
                const wPx = canvas.width | 0;
                const hPx = canvas.height | 0;

                let buf = this._speedBlurBuf;
                if (!buf) {
                    const c = document.createElement('canvas');
                    const ctx = c.getContext('2d', { alpha: false });
                    buf = this._speedBlurBuf = { c, ctx };
                }
                if (buf.c.width !== wPx || buf.c.height !== hPx) {
                    buf.c.width = wPx;
                    buf.c.height = hPx;
                }

                const bctx = buf.ctx;
                bctx.setTransform(1, 0, 0, 1, 0, 0);
                bctx.globalCompositeOperation = 'copy';
                bctx.globalAlpha = 1;

                // Directional blur simulation
                const blurPx = Math.min(2.6, 0.7 + amt * 1.4);
                bctx.filter = `blur(${blurPx.toFixed(2)}px)`;
                bctx.drawImage(canvas, 0, 0);
                bctx.filter = 'none';

                const ctx = this.ctx;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);

                const dir = (this._speedBlurDirX === -1) ? -1 : 1;
                const off = (-dir) * Math.min(18, (4 + amt * 11));

                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = Math.min(0.22, 0.06 + amt * 0.14);
                ctx.drawImage(buf.c, off, 0);

                ctx.globalAlpha = Math.min(0.18, 0.04 + amt * 0.10);
                ctx.drawImage(buf.c, off * 0.5, 0);
                ctx.restore();
            } catch (_) { }
        }

        // 2. Ultra Visual FX Logic
        const gs = (window.GAME_SETTINGS || {});
        let mode = (typeof gs.__postFxModeEffective === 'number') ? gs.__postFxModeEffective : Number(gs.postFxMode);
        if (!Number.isFinite(mode)) mode = 2;
        if (mode <= 0) return;
        if (this.lowPower && mode > 1) mode = 1;

        const ctx = this.ctx;
        const canvas = this.canvas;
        const dpr = this.dpr || 1;
        const wPx = canvas.width;
        const hPx = canvas.height;

        const night = Utils.nightFactor(time);
        const dusk = Math.max(0, 1 - Math.abs(time - 0.72) / 0.08);
        const dawn = Math.max(0, 1 - Math.abs(time - 0.34) / 0.08);
        const warm = Utils.clamp(dawn * 0.9 + dusk * 1.1, 0, 1);
        const cool = Utils.clamp(night * 0.9, 0, 1);

        const d = Utils.clamp(depth01 || 0, 0, 1);
        const underground = Utils.smoothstep(0.22, 0.62, d);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // A) Mode 2: Bloom
        if (mode >= 2) {
            const pp = this._pp;
            if (pp && pp.canvas && pp.ctx) {
                const bctx = pp.ctx;
                bctx.setTransform(1, 0, 0, 1, 0, 0);
                bctx.globalCompositeOperation = 'copy';
                bctx.filter = 'none';
                bctx.globalAlpha = 1;
                bctx.drawImage(canvas, 0, 0);

                // Grading
                const contrast = 1.05 + warm * 0.03 + night * 0.06 + underground * 0.03;
                const saturate = 1.07 + warm * 0.05 + cool * 0.03 - underground * 0.05;
                const brightness = 1.01 + warm * 0.015 - cool * 0.008 - underground * 0.015;

                ctx.globalCompositeOperation = 'copy';
                ctx.filter = `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
                ctx.drawImage(pp.canvas, 0, 0);
                ctx.filter = 'none';

                // Bloom
                // (simplified for conciseness, assuming similar logic to v3)
                const bloomBase = 0.33 + night * 0.10 + underground * 0.06;
                const blur1 = Math.max(1, Math.round(2.5 * dpr));

                ctx.globalCompositeOperation = 'screen';
                ctx.filter = `blur(${blur1}px) brightness(1.2)`;
                ctx.globalAlpha = bloomBase;
                ctx.drawImage(pp.canvas, 0, 0);

                ctx.filter = 'none';
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }
        }

        // B) Fog, Vignette, Grain (simplified)
        const fogAmt = Utils.smoothstep(0.18, 0.62, d) * (0.60 + night * 0.25);
        if (fogAmt > 0) {
            const fog = ctx.createLinearGradient(0, hPx * 0.4, 0, hPx);
            fog.addColorStop(0, 'rgba(30,20,50,0)');
            fog.addColorStop(1, `rgba(30,20,50,${(0.25 * fogAmt).toFixed(2)})`);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = fog;
            ctx.fillRect(0, 0, wPx, hPx);
        }

        const vig = (0.2 + night * 0.2) * (mode === 1 ? 0.9 : 1);
        if (vig > 0.01) {
            // simplified vignette
            const vg = ctx.createRadialGradient(wPx / 2, hPx / 2, wPx * 0.3, wPx / 2, hPx / 2, wPx * 0.8);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, `rgba(0,0,0,${vig.toFixed(2)})`);
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, wPx, hPx);
        }

        ctx.restore();
    }

    postProcess(time = 0.5) {
        this.applyPostFX(time, 0, false);
    }

    // --- Helper Methods (Consolidated from patches) ---

    renderBackgroundCached(cam, time, drawParallax = true) {
        // ── Mountain Rendering Patch v2 ──
        // This method now ONLY caches the sky gradient + celestial bodies.
        // Mountains are drawn exclusively by Game.prototype.render after
        // this method returns, eliminating double-draw and cache-desync bugs.
        this._ensureBgCache();
        const bg = this._bgCache;
        if (!bg || !bg.canvas || !bg.ctx) {
            this.renderSky(cam, time);
            // Mountains intentionally NOT drawn here; Game.render handles them.
            return;
        }

        this._resizeBgCache();

        const now = performance.now();
        const dt = now - (bg.lastAt || 0);
        const refreshInterval = this.lowPower ? 4600 : 750;
        const t = (typeof time === 'number' && isFinite(time)) ? time : (bg.lastTime || 0);

        // Check triggers
        const bucket = this._getSkyBucket(t);
        const bucketChanged = (bucket !== bg.lastBucket);
        const skyKey = this._getSkyKey(t, bucket);
        const skyKeyChanged = (skyKey != null && skyKey !== bg.lastSkyKey);
        const timeChanged = Math.abs(t - (bg.lastTime || 0)) > (this.lowPower ? 0.018 : 0.01);
        const needUpdate = !!bg.dirty || bucketChanged || skyKeyChanged || (dt >= refreshInterval && timeChanged);

        if (needUpdate) {
            bg.dirty = false;
            bg.lastAt = now;
            bg.lastTime = t;
            bg.lastBucket = bucket;
            bg.lastSkyKey = skyKey;

            const origCtx = this.ctx;
            this.ctx = bg.ctx;
            this._bgCacheDrawing = true;
            try {
                bg.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
                bg.ctx.imageSmoothingEnabled = false;
                bg.ctx.clearRect(0, 0, this.w, this.h);
                this.renderSky(cam, t); // Only sky, not parallax
            } finally {
                this._bgCacheDrawing = false;
                this.ctx = origCtx;
            }
        }

        this.ctx.drawImage(bg.canvas, 0, 0, this.w, this.h);
        // Mountains intentionally NOT drawn here; Game.render handles them.
    }

    _ensureBgCache() {
        if (this._bgCache) return;
        const c = document.createElement('canvas');
        c.width = this.canvas.width;
        c.height = this.canvas.height;
        this._bgCache = {
            canvas: c,
            ctx: c.getContext('2d', { alpha: false }),
            wPx: c.width,
            hPx: c.height,
            dirty: true
        };
    }

    _resizeBgCache() {
        const bg = this._bgCache;
        if (!bg) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (bg.wPx !== w || bg.hPx !== h) {
            bg.canvas.width = w;
            bg.canvas.height = h;
            bg.wPx = w;
            bg.hPx = h;
            bg.dirty = true;
        }
    }

    _getSkyBucket(t) {
        // Simple bucket to avoid thrashing
        return (t * 100) | 0;
    }

    _getSkyKey(t, bucket) {
        // Simplified signature for sky color
        return bucket;
    }

    _ensureTexArray() {
        if (!this.textures || typeof this.textures.get !== 'function') return null;
        if (this._texArr && this._texArrMap === this.textures) return this._texArr;
        this._texArr = new Array(256).fill(null);
        try { this.textures.forEach((v, k) => { this._texArr[k & 255] = v; }); } catch (_) { }
        this._texArrMap = this.textures;
        return this._texArr;
    }

    _getBucketState() {
        if (this._tileBuckets) return this._tileBuckets;
        this._tileBuckets = {
            glowKeys: [],
            glowLists: new Array(256),
            darkKeys: [],
            darkLists: new Array(256),
            reset() {
                for (let i = 0; i < this.glowKeys.length; i++) this.glowLists[this.glowKeys[i]].length = 0;
                for (let i = 0; i < this.darkKeys.length; i++) this.darkLists[this.darkKeys[i]].length = 0;
                this.glowKeys.length = 0;
                this.darkKeys.length = 0;
            }
        };
        for (let i = 0; i < 256; i++) {
            this._tileBuckets.glowLists[i] = [];
            this._tileBuckets.darkLists[i] = [];
        }
        return this._tileBuckets;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   配方数据
// ═══════════════════════════════════════════════════════════════════════════════
const RECIPES = [
    { out: BLOCK.PLANKS, count: 4, req: [{ id: BLOCK.LOG, count: 1 }], desc: "基础建筑材料，由原木加工而成。" },
    { out: BLOCK.TORCH, count: 4, req: [{ id: BLOCK.WOOD, count: 1 }], desc: "照亮黑暗的必需品。" },
    { out: BLOCK.BRICK, count: 4, req: [{ id: BLOCK.CLAY, count: 2 }], desc: "坚固的红色砖块。" },
    { out: BLOCK.GLASS, count: 2, req: [{ id: BLOCK.SAND, count: 2 }], desc: "透明的装饰方块。" },
    { out: BLOCK.TREASURE_CHEST, count: 1, req: [{ id: BLOCK.WOOD, count: 8 }], desc: "用于储存物品的箱子。" },
    { out: BLOCK.LANTERN, count: 1, req: [{ id: BLOCK.TORCH, count: 1 }, { id: BLOCK.IRON_ORE, count: 1 }], desc: "比火把更优雅的照明工具。" },
    { out: BLOCK.FROZEN_STONE, count: 4, req: [{ id: BLOCK.ICE, count: 2 }, { id: BLOCK.STONE, count: 2 }], desc: "寒冷的建筑石材。" },
    { out: BLOCK.GLOWSTONE, count: 1, req: [{ id: BLOCK.GLASS, count: 1 }, { id: BLOCK.TORCH, count: 2 }], desc: "人造发光石块。" },
    { out: BLOCK.METEORITE_BRICK, count: 4, req: [{ id: BLOCK.METEORITE, count: 1 }, { id: BLOCK.STONE, count: 1 }], desc: "来自外太空的建筑材料。" },
    { out: BLOCK.RAINBOW_BRICK, count: 10, req: [{ id: BLOCK.CRYSTAL, count: 1 }, { id: BLOCK.BRICK, count: 10 }], desc: "散发着彩虹光芒的砖块。" },
    { out: BLOCK.PARTY_BLOCK, count: 5, req: [{ id: BLOCK.PINK_FLOWER, count: 1 }, { id: BLOCK.DIRT, count: 5 }], desc: "让每一天都变成派对！" },
    { out: BLOCK.WOOD, count: 1, req: [{ id: BLOCK.PLANKS, count: 2 }], desc: "将木板还原为木材。" },
    { out: BLOCK.BONE, count: 2, req: [{ id: BLOCK.STONE, count: 1 }], desc: "由石头雕刻而成的骨头形状。" },
    { out: BLOCK.HAY, count: 4, req: [{ id: BLOCK.TALL_GRASS, count: 8 }], desc: "干草堆，适合建造农场。" }
];

// ═══════════════════════════════════════════════════════════════════════════════
//                                  合成系统

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { Renderer });



// ═══════════════════════════════════════════════════════════════════════════════
class CraftingSystem {
    constructor(game) {
        this.game = game;
        this.isOpen = false;
        this.selectedRecipe = null;

        this.overlay = document.getElementById('crafting-overlay');
        this.grid = document.getElementById('craft-grid');
        this.closeBtn = document.getElementById('craft-close');
        this.craftBtn = document.getElementById('craft-action-btn');
        this.toggleBtn = document.getElementById('btn-craft-toggle');

        this._init();
    }

    _init() {
        this.closeBtn.addEventListener('click', () => this.close());
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.craftBtn.addEventListener('click', () => this.craft());

        // 点击遮罩关闭
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        this.isOpen = true;
        if (Utils && Utils.resetGameInput) Utils.resetGameInput(this.game);
        this.overlay.classList.add('open');
        this.refresh();
        this.selectRecipe(this.selectedRecipe || RECIPES[0]);
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('open');
    }

    refresh() {
        this.grid.innerHTML = '';

        RECIPES.forEach(recipe => {
            const canCraft = this._canCraft(recipe);
            const slot = document.createElement('div');
            slot.className = `craft-slot ${canCraft ? 'can-craft' : ''}`;
            if (this.selectedRecipe === recipe) slot.classList.add('selected');

            // 绘制图标
            const tex = this.game.renderer.textures.get(recipe.out);
            if (tex) {
                const c = document.createElement('canvas');
                c.width = 32; c.height = 32;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(tex, 0, 0, 32, 32);
                slot.appendChild(c);
            }

            slot.addEventListener('click', () => this.selectRecipe(recipe));
            this.grid.appendChild(slot);
        });
    }

    selectRecipe(recipe) {
        this.selectedRecipe = recipe;

        // 更新网格选中状态
        const slots = this.grid.children;
        RECIPES.forEach((r, i) => {
            if (slots[i]) slots[i].classList.toggle('selected', r === recipe);
        });

        // 更新详情
        const info = BLOCK_DATA[recipe.out];
