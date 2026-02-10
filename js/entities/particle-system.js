'use strict';

            if (p.glow) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
            }

            ctx.globalAlpha = p.life * 0.8;
            ctx.fillStyle = p.color;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.rotation);
            const s = p.size * p.life;
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();

            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                 掉落物系统

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { ParticleSystem });



// ═══════════════════════════════════════════════════════════════════════════════
class DroppedItem {
    constructor(x, y, blockId, count = 1) {
        this.x = x;
        this.y = y;
        this.w = 12;
        this.h = 12;
        this.vx = (Math.random() - 0.5) * 4; // 随机水平速度
        this.vy = -3 - Math.random() * 2; // 向上弹出
        this.blockId = blockId;
        this.count = count;
        this.age = 0;
        this.maxAge = 60000; // 60秒后消失
        this.bobOffset = Math.random() * Math.PI * 2; // 浮动动画偏移
        this.rotation = 0;
        this.grounded = false;
        this.pickupDelay = 500; // 500ms后才能拾取，防止刚挖掘就捡起
        this.magnetRange = 48; // 磁吸范围（像素）
        this.pickupRange = 20; // 拾取范围（像素）
        // 拾取动画状态（对象池复用时必须清理）
        this._pickup = null;
        this._pickupAlpha = 1;
        this._pickupScale = 1;
    }

    // 对象池复用：避免频繁 new/GC（掉落物密集时明显提升流畅度）
    reset(x, y, blockId, count = 1) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = -3 - Math.random() * 2;
        this.blockId = blockId;
        this.count = count;
        this.age = 0;
        // maxAge / w / h 保持不变
        this.bobOffset = Math.random() * Math.PI * 2;
        this.rotation = 0;
        this.grounded = false;
        this.pickupDelay = 500;
        this.magnetRange = 48;
        this.pickupRange = 20;
        // 清理拾取动画残留状态（避免对象池复用导致后续掉落物瞬间消失/无法拾取）
        this._pickup = null;
        this._pickupAlpha = 1;
        this._pickupScale = 1;
        return this;
    }

    update(world, player, dt) {
        this.age += dt;

        // 超时消失
        if (this.age >= this.maxAge) {
            return false; // 返回false表示应该移除
        }

        // 重力
        this.vy += CONFIG.GRAVITY * 0.5;
        this.vy = Math.min(this.vy, CONFIG.MAX_FALL_SPEED * 0.5);

        // 摩擦力
        if (this.grounded) {
            this.vx *= 0.85;
        } else {
            this.vx *= 0.98;
        }

        // 移动和碰撞
        this._moveCollide(world, this.vx, 0);
        this.grounded = false;
        this._moveCollide(world, 0, this.vy);

        // 旋转（只在空中旋转）
        if (!this.grounded) {
            this.rotation += this.vx * 0.05;
        }

        // 磁吸效果：当玩家靠近时，掉落物被吸引
        if (this.age > this.pickupDelay) {
            const dx = player.cx() - (this.x + this.w / 2);
            const dy = player.cy() - (this.y + this.h / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            // dist 可能为 0（玩家与掉落物中心重合），避免除以 0 导致 NaN 速度
            if (dist > 1e-6 && dist < this.magnetRange) {
                // 越近吸引力越强
                const force = (1 - dist / this.magnetRange) * 0.5;
                const inv = 1 / dist;
                this.vx += dx * inv * force * 3;
                this.vy += dy * inv * force * 3;
                this.grounded = false; // 被吸引时可以飞起来
            }
        }

        return true; // 返回true表示继续存在
    }

    _moveCollide(world, dx, dy) {
        const ts = CONFIG.TILE_SIZE;

        // 水平移动
        if (dx !== 0) {
            this.x += dx;
            if (this._collides(world)) {
                this.x -= dx;
                this.vx = -this.vx * 0.3; // 反弹
            }
        }

        // 垂直移动
        if (dy !== 0) {
            this.y += dy;
            if (this._collides(world)) {
                this.y -= dy;
                if (dy > 0) {
                    this.grounded = true;
                    this.vy = 0;
                } else {
                    this.vy = 0;
                }
            }
        }

        // 防止掉出世界边界
        this.x = Utils.clamp(this.x, 0, world.w * ts - this.w);
        this.y = Utils.clamp(this.y, 0, world.h * ts - this.h);
    }

    _collides(world) {
        const ts = CONFIG.TILE_SIZE;
        const l = Math.floor(this.x / ts);
        const r = Math.floor((this.x + this.w - 0.001) / ts);
        const t = Math.floor(this.y / ts);
        const b = Math.floor((this.y + this.h - 0.001) / ts);

        for (let tx = l; tx <= r; tx++) {
            if (tx < 0 || tx >= world.w) continue;
            const col = world.tiles[tx];
            for (let ty = t; ty <= b; ty++) {
                if (ty < 0 || ty >= world.h) continue;
                if (BLOCK_SOLID[col[ty]]) return true;
            }
        }
        return false;
    }

    canPickup(player) {
        if (this.age < this.pickupDelay) return false;

        const dx = player.cx() - (this.x + this.w / 2);
        const dy = player.cy() - (this.y + this.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist < this.pickupRange;
    }

    cx() { return this.x + this.w / 2; }
    cy() { return this.y + this.h / 2; }
}

class DroppedItemManager {
    constructor() {
        // 使用“头指针 + 空洞”来避免 shift/splice 的高频 O(n) 开销
        this.items = [];
        this.maxItems = 200; // 最大掉落物数量
        this._start = 0;
        this._holes = 0;

        // 对象池：减少密集掉落时的 GC 抖动
        this._pool = [];
        this._poolCap = 256;

        // Spatial hash (no allocations per-frame)
        this._shBucketCount = 1024; // power-of-two
        this._shMask = this._shBucketCount - 1;
        this._shHead = new Int32Array(this._shBucketCount);
        this._shNext = new Int32Array(this.maxItems);
        this._shCellSize = CONFIG.TILE_SIZE * 6; // px
        this._shLastCap = this.maxItems;
    }

    _acquire(x, y, blockId, count) {
        const it = this._pool.pop();
        if (it) return it.reset(x, y, blockId, count);
        return new DroppedItem(x, y, blockId, count);
    }

    _release(it) {
        if (!it) return;
        // 清理拾取动画残留（与对象池复用配合，避免下一次 spawn 直接“秒消失”）
        it._pickup = null;
        it._pickupAlpha = 1;
        it._pickupScale = 1;
        if (this._pool.length < this._poolCap) this._pool.push(it);
    }

    _maybeCompact(force = false) {
        if (!force) {
            // 空洞很多 or 头指针推进太多时才压缩，避免每帧分配新数组
            if (this._holes < 96 && (this._start < 256 || this._start <= (this.items.length >> 1))) return;
        }
        const next = [];
        for (let i = this._start; i < this.items.length; i++) {
            const it = this.items[i];
            if (it) next.push(it);
        }
        this.items = next;
        this._start = 0;
        this._holes = 0;
    }

    spawn(x, y, blockId, count = 1) {
        if (count <= 0) return;

        // 如果掉落物太多，淘汰最老的（O(1) 摊还）
        while ((this.items.length - this._start) >= this.maxItems) {
            const old = this.items[this._start];
            if (old) this._release(old);
            this.items[this._start] = null;
            this._start++;
            this._holes++;
        }

        this.items.push(this._acquire(x, y, blockId, count));

        // 防止 items 无限增长：定期压缩
        if (this._start > 128 && this._start > (this.items.length >> 1)) {
            this._maybeCompact(true);
        }
    }

    update(world, player, dt, addToInventoryCallback) {
        // Rebuild spatial hash each frame (O(N), but bucketed query reduces pickup cost)
        // IMPORTANT: no allocations here.
        const head = this._shHead;
        head.fill(-1);

        // IMPORTANT: items 数组会因“头指针+空洞”策略而出现 length > maxItems 的情况，
        // 这会导致使用 items 索引写入/读取 _shNext 越界，从而在哈希链遍历时出现 undefined -> 死循环。
        // 这里确保 _shNext 的容量始终覆盖 items.length。
        let next = this._shNext;
        const need = this.items.length;
        if (!next || next.length < need) {
            let cap = (next && next.length) ? next.length : 16;
            while (cap < need) cap <<= 1;
            next = this._shNext = new Int32Array(cap);
            this._shLastCap = cap;
        }

        const cs = this._shCellSize;
        const mask = this._shMask;

        // Update physics for all items + build hash for alive items
        for (let i = this.items.length - 1; i >= this._start; i--) {
            const item = this.items[i];
            if (!item) continue;

            const alive = item.update(world, player, dt);
            if (!alive) {
                this._release(item);
                this.items[i] = null;
                this._holes++;
                continue;
            }

            // Hash insert (bucket-only, collisions tolerated; distance check later)
            const cx = (item.x / cs) | 0;
            const cy = (item.y / cs) | 0;
            const h = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) & mask;
            next[i] = head[h];
            head[h] = i;
        }

        // Fast pickup query: only cells near player
        const px = player.cx ? player.cx() : (player.x || 0);
        const py = player.cy ? player.cy() : (player.y || 0);
        const pr = CONFIG.TILE_SIZE * 3; // pickup reach approx
        const minCx = ((px - pr) / cs) | 0, maxCx = ((px + pr) / cs) | 0;
        const minCy = ((py - pr) / cs) | 0, maxCy = ((py + pr) / cs) | 0;

        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const h = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) & mask;
                let idx = head[h];
                while (idx !== -1) {
                    const it = this.items[idx];
                    const nxt = next[idx];
                    if (it) {
                        // precise check
                        if (it.canPickup(player)) {
                            const picked = addToInventoryCallback(it.blockId, it.count);
                            if (picked) {
                                this._release(it);
                                this.items[idx] = null;
                                this._holes++;
                            }
                        }
                    }
                    idx = nxt;
                }
            }
        }

        // Advance head pointer (skip holes)
        while (this._start < this.items.length && !this.items[this._start]) {
            this._start++;
            this._holes = Math.max(0, this._holes - 1);
        }

        this._maybeCompact(false);
    }

    render(ctx, cam, textures, timeOfDay) {
        const ts = CONFIG.TILE_SIZE;
        const now = performance.now();
        const blinkPhase = Math.floor(now / 200) % 2;

        for (let i = this._start; i < this.items.length; i++) {
            const item = this.items[i];
            if (!item) continue;
            const sx = item.x - cam.x;
            const sy = item.y - cam.y;

            // 浮动效果
            const bob = Math.sin(now * 0.005 + item.bobOffset) * 3;

            // 闪烁效果（快消失时）
            const timeLeft = item.maxAge - item.age;
            if (timeLeft < 5000 && blinkPhase === 0) {
                continue; // 跳过渲染实现闪烁
            }

            ctx.save();
            ctx.translate(sx + item.w / 2, sy + item.h / 2 + bob);
            ctx.rotate(item.rotation);

            // 发光效果（用查表避免每帧对象查找）
            const lightLv = BLOCK_LIGHT[item.blockId];
            if (lightLv > 0) {
                ctx.shadowColor = BLOCK_COLOR[item.blockId] || '#fff';
                ctx.shadowBlur = 15;
            } else {
                // 普通物品也有轻微发光
                ctx.shadowColor = '#ffeaa7';
                ctx.shadowBlur = 8;
            }

            // 绘制物品
            const tex = textures.get(item.blockId);
            if (tex) {
                ctx.drawImage(tex, -item.w / 2, -item.h / 2, item.w, item.h);
            } else {
                // 后备渲染 (fixed: bd was undefined, use BLOCK_COLOR lookup)
                ctx.fillStyle = BLOCK_COLOR[item.blockId] || '#fff';
                ctx.fillRect(-item.w / 2, -item.h / 2, item.w, item.h);
            }

            ctx.shadowBlur = 0;

            // 显示数量（如果大于1）
            if (item.count > 1) {
                ctx.fillStyle = '#ffeaa7';
                ctx.font = 'bold 8px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(item.count.toString(), item.w / 2, item.h / 2);
            }

            ctx.restore();
        }
    }

    clear() {
        for (let i = this._start; i < this.items.length; i++) {
            const it = this.items[i];
            if (it) this._release(it);
        }
        this.items = [];
        this._start = 0;
        this._holes = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                 环境粒子系统

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { DroppedItem, DroppedItemManager });



// ═══════════════════════════════════════════════════════════════════════════════
class AmbientParticles {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.particles = [];
        this.mode = 'none';
        this._night = 0;
        this._lastOpacity = -1;
    }

    update(timeOfDay, weather) {
        if (!this.container) return;

        const reducedMotion = !!(window.GAME_SETTINGS && window.GAME_SETTINGS.reducedMotion);
        if (reducedMotion) {
            if (this.mode !== 'none' || this.particles.length) this._clearAll();
            this.mode = 'none';
            return;
        }

        const nightFactor = Utils.nightFactor(timeOfDay);

        const wType = (weather && weather.type) ? weather.type : 'clear';
        const wInt = (weather && Number.isFinite(weather.intensity)) ? weather.intensity : 0;

        let mode = 'none';
        let target = 0;

        // 天气优先：雨/雪会替代夜晚萤火虫
        if ((wType === 'rain' || wType === 'thunder') && wInt > 0.06) {
            mode = 'rain';
            target = Math.round(35 + wInt * 95);   // 35 ~ 130
        } else if (wType === 'snow' && wInt > 0.06) {
            mode = 'snow';
            target = Math.round(20 + wInt * 70);   // 20 ~ 90
        } else if (nightFactor > 0.25) {
            mode = 'firefly';
            target = Math.round(10 + nightFactor * 18); // 10 ~ 28
        }

        // 低画质：适当减量（DOM 粒子更省）
        try {
            const gs = window.GAME_SETTINGS || {};
            const cap = (typeof gs.__dprCapEffective === 'number') ? gs.__dprCapEffective : gs.dprCap;
            if (cap && cap <= 1.25) target = Math.floor(target * 0.75);
        } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }

        // 切换模式：重建粒子（避免同时存在多种粒子造成冗余开销）
        if (mode !== this.mode) {
            this._clearAll();
            this.mode = mode;
        }

        // 容器透明度：只在变化明显时写入，减少 layout/style 抖动
        let opacity = 0;
        if (mode === 'firefly') opacity = 0.25 + nightFactor * 0.75;
        else if (mode === 'rain') opacity = 0.35 + wInt * 0.65;
        else if (mode === 'snow') opacity = 0.25 + wInt * 0.75;
        opacity = Math.min(1, Math.max(0, opacity));
        if (this._lastOpacity < 0 || Math.abs(opacity - this._lastOpacity) > 0.03) {
            this.container.style.opacity = opacity.toFixed(3);
            this._lastOpacity = opacity;
        }

        // 数量调整（上限保护）
        target = Math.max(0, Math.min(target, mode === 'rain' ? 140 : 110));
        if (this.particles.length < target) this._spawn(target - this.particles.length, mode, wInt, nightFactor);
        else if (this.particles.length > target) {
            for (let i = this.particles.length - 1; i >= target; i--) {
                const p = this.particles.pop();
                if (p && p.parentNode) p.parentNode.removeChild(p);
            }
        }

        // 萤火虫：夜晚因子变化时，才更新每个粒子 opacity
        if (mode === 'firefly') {
            if (Math.abs(nightFactor - this._night) > 0.03) {
                this._night = nightFactor;
                for (const p of this.particles) {
                    const o = (p._baseOpacity || 1) * nightFactor;
                    p.style.opacity = o.toFixed(3);
                }
            }
        }
    }

    _spawn(n, mode, intensity, nightFactor) {
        const frag = document.createDocumentFragment();

        for (let i = 0; i < n; i++) {
            const p = document.createElement('div');

            if (mode === 'firefly') {
                p.className = 'firefly';
                p.style.left = (Math.random() * 100).toFixed(2) + '%';
                p.style.top = (30 + Math.random() * 40).toFixed(2) + '%';
                p.style.animationDelay = (-Math.random() * 8).toFixed(2) + 's';
                p.style.animationDuration = (6 + Math.random() * 4).toFixed(2) + 's';
                const base = 0.2 + Math.random() * 0.8;
                p._baseOpacity = base;
                p.style.opacity = (base * nightFactor).toFixed(3);
            }
            else if (mode === 'rain') {
                p.className = 'raindrop';
                p.style.left = (Math.random() * 100).toFixed(2) + '%';
                p.style.top = (-20 - Math.random() * 35).toFixed(2) + '%';
                const len = 10 + Math.random() * 18;
                p.style.height = len.toFixed(1) + 'px';
                p.style.opacity = (0.25 + Math.random() * 0.55).toFixed(3);
                const baseDur = 1.05 - 0.45 * intensity;
                const dur = Math.max(0.45, baseDur + (Math.random() * 0.35));
                p.style.animationDuration = dur.toFixed(2) + 's';
                p.style.animationDelay = (-Math.random() * 1.5).toFixed(2) + 's';
            }
            else if (mode === 'snow') {
                p.className = 'snowflake';
                p.style.left = (Math.random() * 100).toFixed(2) + '%';
                p.style.top = (-10 - Math.random() * 25).toFixed(2) + '%';
                const size = 2 + Math.random() * 3.5;
                p.style.width = size.toFixed(1) + 'px';
                p.style.height = size.toFixed(1) + 'px';
                p.style.opacity = (0.35 + Math.random() * 0.55).toFixed(3);
                const drift = (Math.random() * 80 - 40).toFixed(0) + 'px';
                p.style.setProperty('--drift', drift);
                const baseDur = 6.5 - 2.2 * intensity;
                const dur = Math.max(3.0, baseDur + (Math.random() * 3.0));
                p.style.animationDuration = dur.toFixed(2) + 's';
                p.style.animationDelay = (-Math.random() * 3.5).toFixed(2) + 's';
            }
            else {
                continue;
            }

            frag.appendChild(p);
            this.particles.push(p);
        }

        this.container.appendChild(frag);
    }

    _clearAll() {
        for (const p of this.particles) {
            if (p && p.parentNode) p.parentNode.removeChild(p);
        }
        this.particles.length = 0;
        this._night = 0;
        this._lastOpacity = -1;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                      玩家

// ───────────────────────── Exports ─────────────────────────
window.TU = window.TU || {};
Object.assign(window.TU, { AmbientParticles });



// ═══════════════════════════════════════════════════════════════════════════════
class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 16; this.h = 40;
        this.vx = 0; this.vy = 0;
        this.grounded = false;
        this.facingRight = true;
        this.health = 100; this.maxHealth = 100;
        this.mana = 50; this.maxMana = 50;
        this.animFrame = 0; this.animTimer = 0;
        // Sprint state
        // - _sprinting: raw "wants sprint" from input (hold/shift)
        // - _sprintActive: sprint is actually active (ground-only, with perfect-landing resume)
        this._sprinting = false;
        this._sprintActive = false;
        this._sprintBoostMs = 0;
        this._sprintVfxMs = 0;
        this._sprintLeanMs = 0;
        this._sprintCarryArmed = false;
        this._perfectLandMs = 0;
        this.inventory = [
            { id: 'pickaxe', name: '铜镐', count: 1, power: 40, speed: 2, icon: '⛏️' },
            { id: BLOCK.DIRT, name: '土块', count: 50 },
            { id: BLOCK.STONE, name: '石块', count: 50 },
            { id: BLOCK.PLANKS, name: '木板', count: 30 },
            { id: BLOCK.TORCH, name: '火把', count: 50 },
            { id: BLOCK.GLASS, name: '玻璃', count: 20 }
            // 快捷栏预留3个空位给新挖掘的物品
        ];
        this.selectedSlot = 0;
        // 预生成玩家像素 Sprite（头+身体），避免每帧逐像素 fillRect（性能大幅提升）
        if (!Player._spriteCanvases) Player._initSpriteCache();

        // 跳跃手感：土狼时间 + 跳跃缓冲 + 防按住连跳
        this._jumpHeld = false;
        this._coyoteMs = 0;
        this._jumpBufferMs = 0;
    }

    static _initSpriteCache() {
        // 颜色表与原 render() 内定义保持一致
        const colors = {
            '#': '#ffcc80', // 皮肤
            'X': '#7e57c2', // 紫色上衣
            'Y': '#5e35b1', // 衣服阴影
            'L': '#455a64', // 裤子
            'H': '#3e2723', // 头发深色
            'h': '#5d4037', // 头发亮色
            'E': '#ffffff', // 眼白
            'e': '#333333', // 瞳孔
            'S': '#212121', // 鞋子
            'G': '#ffd700', // 皮带扣
            'B': '#3e2723'  // 皮带
        };

        const headSprite = [
            '..HHHHHH..',
            '.HHhHHHhH.',
            'HHHhHHHHHH',
            'HH######HH',
            'HH#E#E##HH',
            'H##e#e###H',
            '.########.',
            '.########.',
            '..######..',
            '..........'
        ];
        const bodyBase = [
            '.XXXXXX.',
            'XXXXXXXX',
            'XXXXXXXX',
            'XYXXXXYX',
            'XYXXXXYX',
            'XYXXXXYX',
            'BBGBBBBB',
            'LL....LL',
            'LL....LL',
