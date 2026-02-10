'use strict';
                                                                        if (!lsOk && ToastRef && ToastRef.show) {
                                                                            if (reason === 'manual') ToastRef.show('💾 已保存（IndexedDB）');
                                                                            if (reason === 'autosave') ToastRef.show('✅ 自动保存（IndexedDB）', 1100);
                                                                        }
                                                                    }).catch(_ => { /* silently ignore */ });
                                                                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            }

                                                            // Toast：保持原体验（localStorage 成功时才显示，避免重复）
                                                            if (lsOk) {
                                                                try {
                                                                    if (ToastRef && ToastRef.show) {
                                                                        if (reason === 'manual') ToastRef.show('💾 已保存');
                                                                        if (reason === 'autosave') ToastRef.show('✅ 自动保存', 1100);
                                                                    }
                                                                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            } else {
                                                                // 两种存储都不可用时，才彻底禁用
                                                                if (FLAGS.disableIDBSave) {
                                                                    this._disabled = true;
                                                                    if (ToastRef && ToastRef.show) ToastRef.show('⚠️ 存档失败：空间不足，已停用自动保存', 2600);
                                                                }
                                                            }
                                                        };

                                                        // tickAutosave：尊重 _autosaveDisabled
                                                        if (typeof SaveSystem.prototype.tickAutosave === 'function') {
                                                            var _oldTick = SaveSystem.prototype.tickAutosave;
                                                            SaveSystem.prototype.tickAutosave = function (dt) {
                                                                if (this._autosaveDisabled) return;
                                                                return _oldTick.call(this, dt);
                                                            };
                                                        }
                                                    }
                                                }

                                                // ───────────────────────── Chunk Batching (safe v2) ─────────────────────────
                                                if (Renderer && CONFIG && Utils && BLOCK && BL && !Renderer.prototype.__chunkBatchSafeV2Installed) {
                                                    Renderer.prototype.__chunkBatchSafeV2Installed = true;
                                                    // 配置
                                                    Renderer.prototype.__cb2_cfg = Renderer.prototype.__cb2_cfg || { tiles: 16, maxHigh: 180, maxLow: 90 };

                                                    function _cb2_key(cx, cy) { return cx + ',' + cy; }

                                                    function _cb2_buildDarkLUT(levels, nightBonus) {
                                                        var lut = new Float32Array(256);
                                                        for (var i = 0; i < 256; i++) {
                                                            var darkness = 1 - (i / levels);
                                                            var totalDark = darkness * 0.6 + nightBonus;
                                                            if (totalDark > 0.88) totalDark = 0.88;
                                                            lut[i] = (totalDark > 0.05) ? totalDark : 0;
                                                        }
                                                        return lut;
                                                    }

                                                    Renderer.prototype.__cb2_ensureCache = function (world) {
                                                        if (!this.__cb2_chunkMap || this.__cb2_chunkWorld !== world) {
                                                            this.__cb2_chunkWorld = world;
                                                            this.__cb2_chunkMap = new Map();
                                                            this.__cb2_chunkFrame = 0;
                                                        }
                                                        if (!this.__cb2_chunkFrame) this.__cb2_chunkFrame = 0;
                                                    };

                                                    Renderer.prototype.invalidateAllChunks = function () {
                                                        if (!this.__cb2_chunkMap) return;
                                                        this.__cb2_chunkMap.forEach(function (e) { e.dirty = true; });
                                                    };

                                                    Renderer.prototype.invalidateTile = function (tx, ty) {
                                                        if (!this.__cb2_chunkMap) return;
                                                        var cfg = this.__cb2_cfg || { tiles: 16 };
                                                        var cts = (cfg.tiles | 0) || 16;
                                                        var cx = (tx / cts) | 0;
                                                        var cy = (ty / cts) | 0;
                                                        var key = _cb2_key(cx, cy);
                                                        var e = this.__cb2_chunkMap.get(key);
                                                        if (e) e.dirty = true;
                                                    };

                                                    Renderer.prototype.__cb2_evictIfNeeded = function () {
                                                        var map = this.__cb2_chunkMap;
                                                        if (!map) return;

                                                        var cfg = this.__cb2_cfg || {};
                                                        var max = (this.lowPower ? (cfg.maxLow || 90) : (cfg.maxHigh || 180)) | 0;
                                                        if (map.size <= max) return;

                                                        // 简单 LRU：移除 lastUsed 最小的若干个
                                                        var arr = Array.from(map.values());
                                                        arr.sort(function (a, b) { return (a.lastUsed || 0) - (b.lastUsed || 0); });
                                                        var removeN = Math.min(arr.length, map.size - max);
                                                        for (var i = 0; i < removeN; i++) {
                                                            map.delete(arr[i].key);
                                                        }
                                                    };

                                                    Renderer.prototype.__cb2_rebuildChunk = function (entry, world) {
                                                        var cfg = this.__cb2_cfg || {};
                                                        var cts = (cfg.tiles | 0) || 16;
                                                        var ts = CONFIG.TILE_SIZE;

                                                        var startX = entry.cx * cts;
                                                        var startY = entry.cy * cts;
                                                        var endX = Math.min(world.w, startX + cts);
                                                        var endY = Math.min(world.h, startY + cts);

                                                        var ctx = entry.ctx;
                                                        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
                                                        ctx.imageSmoothingEnabled = false;

                                                        var tiles = world.tiles;
                                                        var texGen = this.textures;

                                                        for (var x = startX; x < endX; x++) {
                                                            var colTiles = tiles[x];
                                                            var dx = (x - startX) * ts;
                                                            for (var y = startY; y < endY; y++) {
                                                                var id = colTiles[y];
                                                                if (id === BLOCK.AIR) continue;

                                                                // 为了保证“发光方块”外观 100% 与原实现一致：glow 块不烘焙进 chunk，交给后续逐 tile 绘制
                                                                if (BL && BL[id] > 5) continue;

                                                                var tex = texGen.get(id);
                                                                if (tex) ctx.drawImage(tex, dx, (y - startY) * ts);
                                                            }
                                                        }

                                                        entry.dirty = false;
                                                    };

                                                    Renderer.prototype.__cb2_getEntry = function (world, cx, cy) {
                                                        this.__cb2_ensureCache(world);

                                                        var cfg = this.__cb2_cfg || {};
                                                        var cts = (cfg.tiles | 0) || 16;

                                                        // 世界边界外不建条目
                                                        if (cx < 0 || cy < 0) return null;
                                                        if (cx * cts >= world.w || cy * cts >= world.h) return null;

                                                        var map = this.__cb2_chunkMap;
                                                        var key = _cb2_key(cx, cy);
                                                        var entry = map.get(key);
                                                        if (!entry) {
                                                            var size = cts * CONFIG.TILE_SIZE;

                                                            var canvas = document.createElement('canvas');
                                                            canvas.width = size;
                                                            canvas.height = size;

                                                            var cctx = canvas.getContext('2d', { alpha: true });
                                                            if (!cctx) return null;

                                                            cctx.imageSmoothingEnabled = false;

                                                            entry = {
                                                                key: key,
                                                                cx: cx,
                                                                cy: cy,
                                                                canvas: canvas,
                                                                ctx: cctx,
                                                                dirty: true,
                                                                lastUsed: 0
                                                            };
                                                            map.set(key, entry);

                                                            this.__cb2_evictIfNeeded();
                                                        }

                                                        this.__cb2_chunkFrame = (this.__cb2_chunkFrame + 1) | 0;
                                                        entry.lastUsed = this.__cb2_chunkFrame;

                                                        if (entry.dirty) this.__cb2_rebuildChunk(entry, world);
                                                        return entry;
                                                    };

                                                    // 用 chunk batching 包装 renderWorld：保持原视觉（暗角/发光/遮罩）完全一致
                                                    Renderer.prototype.renderWorld = function (world, cam, time) {
                                                        // Chunk batching only: no legacy fallback path.
                                                        if (!world || !world.tiles || !world.light || !this.textures || !BL || !Utils || !CONFIG) return;

                                                        try {
                                                            var ctx = this.ctx;
                                                            var ts = CONFIG.TILE_SIZE;

                                                            var startX = Math.floor(cam.x / ts) - 1;
                                                            var startY = Math.floor(cam.y / ts) - 1;
                                                            var endX = startX + Math.ceil(this.w / ts) + 2;
                                                            var endY = startY + Math.ceil(this.h / ts) + 2;

                                                            if (startX < 0) startX = 0;
                                                            if (startY < 0) startY = 0;
                                                            if (endX >= world.w) endX = world.w - 1;
                                                            if (endY >= world.h) endY = world.h - 1;

                                                            var tiles = world.tiles;
                                                            var light = world.light;

                                                            var camCeilX = Math.ceil(cam.x);
                                                            var camCeilY = Math.ceil(cam.y);

                                                            // 复用/重建 LUT（与原 renderWorld 公式一致） + 天气联动（BLOCK_LIGHT_LUT）
                                                            var night = Utils.nightFactor(time);
                                                            var qNight = Math.round(night * 100) / 100;
                                                            var levels = CONFIG.LIGHT_LEVELS;

                                                            // 天气联动参数（由 Game._updateWeather 写入）
                                                            var wf = window.TU_WEATHER_FX || null;
                                                            var wType = (wf && wf.type) ? wf.type : 'clear';
                                                            var wGloom = (wf && typeof wf.gloom === 'number') ? wf.gloom : 0;
                                                            var wFlash = (wf && typeof wf.lightning === 'number') ? wf.lightning : 0;
                                                            if (wGloom < 0) wGloom = 0;
                                                            if (wGloom > 1) wGloom = 1;
                                                            if (wFlash < 0) wFlash = 0;
                                                            if (wFlash > 1) wFlash = 1;
                                                            var wKey = wType + ':' + ((wGloom * 100) | 0) + ':' + ((wFlash * 100) | 0) + ':' + qNight + ':' + levels;

                                                            if (!this._darkAlphaLUTDay || this._darkAlphaLUTLevels !== levels) {
                                                                this._darkAlphaLUTLevels = levels;
                                                                this._darkAlphaLUTDay = _cb2_buildDarkLUT(levels, 0);
                                                                this._darkAlphaLUTNight = _cb2_buildDarkLUT(levels, 0.2);
                                                            }
                                                            var lut = this._darkAlphaLUTBlend;
                                                            if (!lut || this._darkAlphaLUTBlendWeatherKey !== wKey || this._darkAlphaLUTBlendNight !== qNight || this._darkAlphaLUTBlendLevels !== levels) {
                                                                lut = this._darkAlphaLUTBlend || (this._darkAlphaLUTBlend = new Float32Array(256));
                                                                var dayL = this._darkAlphaLUTDay;
                                                                var nightL = this._darkAlphaLUTNight;
                                                                var lv = levels || 1;
                                                                var gloom = wGloom;
                                                                var flash = wFlash;
                                                                var th = 0.05 - gloom * 0.02;
                                                                if (th < 0.02) th = 0.02;

                                                                for (var i = 0; i < 256; i++) {
                                                                    var v = dayL[i] + (nightL[i] - dayL[i]) * qNight;

                                                                    // gloom：让暗部更“压抑”，并在强天气下略微压亮部
                                                                    if (gloom > 0.001) {
                                                                        var light01 = i / lv;
                                                                        if (light01 < 0) light01 = 0;
                                                                        if (light01 > 1) light01 = 1;
                                                                        var sh = 1 - light01;
                                                                        v += gloom * (0.08 + 0.22 * sh);
                                                                        v *= (1 + gloom * 0.18);
                                                                    }

                                                                    // lightning flash：短促减弱暗角（模拟闪电照亮）
                                                                    if (flash > 0.001) {
                                                                        v *= (1 - flash * 0.75);
                                                                        v -= flash * 0.08;
                                                                    }

                                                                    if (v > 0.92) v = 0.92;
                                                                    if (v < th) v = 0;
                                                                    lut[i] = v;
                                                                }
                                                                this._darkAlphaLUTBlendNight = qNight;
                                                                this._darkAlphaLUTBlendLevels = levels;
                                                                this._darkAlphaLUTBlendWeatherKey = wKey;
                                                            }

                                                            // 暴露到全局：便于在 Renderer 之外做联动/调试
                                                            window.BLOCK_LIGHT_LUT = lut;

                                                            // 重置关键状态（避免其它渲染残留影响 chunk draw）
                                                            ctx.globalCompositeOperation = 'source-over';
                                                            ctx.globalAlpha = 1;
                                                            ctx.shadowBlur = 0;

                                                            // 1) 画 chunk（非发光方块）
                                                            var cfg = this.__cb2_cfg || { tiles: 16 };
                                                            var cts = (cfg.tiles | 0) || 16;

                                                            var cStartX = (startX / cts) | 0;
                                                            var cStartY = (startY / cts) | 0;
                                                            var cEndX = (endX / cts) | 0;
                                                            var cEndY = (endY / cts) | 0;

                                                            for (var cy = cStartY; cy <= cEndY; cy++) {
                                                                for (var cx = cStartX; cx <= cEndX; cx++) {
                                                                    var e = this.__cb2_getEntry(world, cx, cy);
                                                                    if (!e) continue;
                                                                    ctx.drawImage(e.canvas, cx * cts * ts - camCeilX, cy * cts * ts - camCeilY);
                                                                }
                                                            }

                                                            // 2) 逐 tile：只补画“发光方块” + 画暗角遮罩（保持和原 renderWorld 一样）
                                                            ctx.globalAlpha = 1;
                                                            ctx.fillStyle = (wf && wf.shadowColor) ? wf.shadowColor : 'rgb(10,5,20)';

                                                            for (var x = startX; x <= endX; x++) {
                                                                var colTiles = tiles[x];
                                                                var colLight = light[x];
                                                                for (var y = startY; y <= endY; y++) {
                                                                    var block = colTiles[y];
                                                                    if (block === BLOCK.AIR) continue;

                                                                    var px = x * ts - camCeilX;
                                                                    var py = y * ts - camCeilY;

                                                                    // 发光方块：按原逻辑绘制（shadowBlur）
                                                                    var bl = BL[block] | 0;
                                                                    if (bl > 5) {
                                                                        var tex = this.textures.get(block);
                                                                        if (this.enableGlow && tex) {
                                                                            ctx.save();
                                                                            ctx.shadowColor = (BC && BC[block]) ? BC[block] : '#fff';
                                                                            ctx.shadowBlur = bl * 2;
                                                                            ctx.drawImage(tex, px, py);
                                                                            ctx.restore();
                                                                        } else if (tex) {
                                                                            ctx.drawImage(tex, px, py);
                                                                        }
                                                                    }

                                                                    var a = lut[colLight[y]];
                                                                    if (a) {
                                                                        ctx.globalAlpha = a;
                                                                        ctx.fillRect(px, py, ts, ts);
                                                                        ctx.globalAlpha = 1;
                                                                    }
                                                                }
                                                            }

                                                            ctx.globalAlpha = 1;
                                                        } catch (e) {
                                                            // 一旦异常：永久降级回原 renderWorld，避免“渲染出问题但还能玩”的体验
                                                            this.__disableChunkBatching = true;
                                                            try { console.warn('[chunkBatchSafeV2] disabled:', e); } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            return orig && orig.call(this, world, cam, time);
                                                        }
                                                    };

                                                    // 与 tile 改动联动：markTile 时让 chunk 失效（更稳）
                                                    if (SaveSystem && SaveSystem.prototype && typeof SaveSystem.prototype.markTile === 'function') {
                                                        if (!SaveSystem.prototype.__cb2_markTileWrapped) {
                                                            SaveSystem.prototype.__cb2_markTileWrapped = true;
                                                            var _oldMarkTile = SaveSystem.prototype.markTile;
                                                            SaveSystem.prototype.markTile = function (x, y, newId) {
                                                                _oldMarkTile.call(this, x, y, newId);
                                                                try {
                                                                    var r = this.game && this.game.renderer;
                                                                    if (r && typeof r.invalidateTile === 'function') r.invalidateTile(x, y);
                                                                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            };
                                                        }
                                                    }

                                                    // 读档后：整体失效一次（避免 chunk 里残留旧世界）
                                                    if (SaveSystem && SaveSystem.prototype && typeof SaveSystem.prototype.importLoaded === 'function') {
                                                        if (!SaveSystem.prototype.__cb2_importWrapped) {
                                                            SaveSystem.prototype.__cb2_importWrapped = true;
                                                            var _oldImportLoaded = SaveSystem.prototype.importLoaded;
                                                            SaveSystem.prototype.importLoaded = function (save) {
                                                                _oldImportLoaded.call(this, save);
                                                                try {
                                                                    var r = this.game && this.game.renderer;
                                                                    if (r && typeof r.invalidateAllChunks === 'function') r.invalidateAllChunks();
                                                                } catch (e) { if (typeof console !== 'undefined' && console.debug) console.debug('[Debug] Silently caught:', e); }
                                                            };
                                                        }
                                                    }
                                                }

                                                // ───────────────────────── Pickup Animation (safe v2) ─────────────────────────
                                                if (!FLAGS.disablePickupAnim && DroppedItem && DroppedItem.prototype && DroppedItemManager && DroppedItemManager.prototype) {
                                                    if (!DroppedItem.prototype.__pickupAnimSafeV2Installed) {
                                                        DroppedItem.prototype.__pickupAnimSafeV2Installed = true;

                                                        // 开始拾取动画
                                                        DroppedItem.prototype.startPickup = function (player) {
                                                            if (this._pickup) return;
                                                            this._pickup = {
                                                                t: 0,
                                                                dur: 240, // ms
                                                                sx: this.x,
                                                                sy: this.y,
                                                                phase: Math.random() * Math.PI * 2
                                                            };
                                                            // 动画期间不受物理/磁吸干扰
                                                            this.vx = 0;
                                                            this.vy = 0;
                                                            this.rotation = 0;
                                                            this.grounded = false;
                                                        };

                                                        // 拾取动画期间不再重复触发拾取
                                                        if (typeof DroppedItem.prototype.canPickup === 'function') {
                                                            var _oldCanPickup = DroppedItem.prototype.canPickup;
                                                            DroppedItem.prototype.canPickup = function (player) {
                                                                if (this._pickup) return false;
                                                                return _oldCanPickup.call(this, player);
                                                            };
                                                        }

                                                        // easeOutBack
                                                        function easeOutBack(x) {
                                                            var c1 = 1.70158;
                                                            var c3 = c1 + 1;
                                                            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
                                                        }

                                                        // update：优先处理 pickup 动画
                                                        if (typeof DroppedItem.prototype.update === 'function') {
                                                            var _oldUpdate = DroppedItem.prototype.update;
                                                            DroppedItem.prototype.update = function (world, player, dt) {
                                                                if (this._pickup && player) {
                                                                    var p = this._pickup;
                                                                    p.t += dt;

                                                                    var tt = p.t / p.dur;
                                                                    if (tt < 0) tt = 0;
                                                                    if (tt > 1) tt = 1;

                                                                    var e = easeOutBack(tt);

                                                                    var tx = (typeof player.cx === 'function') ? (player.cx() - this.w / 2) : (player.x - this.w / 2);
                                                                    var ty = (typeof player.cy === 'function') ? (player.cy() - this.h / 2) : (player.y - this.h / 2);

                                                                    var r = (1 - tt) * 18;
                                                                    var ang = p.phase + tt * Math.PI * 2.4;
                                                                    var ox = Math.cos(ang) * r;
                                                                    var oy = Math.sin(ang) * r * 0.6;

                                                                    this.x = p.sx + (tx - p.sx) * e + ox;
                                                                    this.y = p.sy + (ty - p.sy) * e + oy;

                                                                    this.rotation = tt * 0.6;

                                                                    this._pickupAlpha = 1 - tt;
                                                                    this._pickupScale = 1 - tt * 0.55;

                                                                    if (tt >= 1) return false;
                                                                    return true;
                                                                }

                                                                return _oldUpdate.call(this, world, player, dt);
                                                            };
                                                        }
                                                    }

                                                    if (!DroppedItemManager.prototype.__pickupAnimSafeV2MgrInstalled) {
                                                        DroppedItemManager.prototype.__pickupAnimSafeV2MgrInstalled = true;

                                                        // update：拾取时先触发 callback，再播放动画，动画结束后自然回收
                                                        if (typeof DroppedItemManager.prototype.update === 'function') {
                                                            var _oldMgrUpdate = DroppedItemManager.prototype.update;
                                                            DroppedItemManager.prototype.update = function (world, player, dt, addToInventoryCallback) {
                                                                // 反向遍历，删除只做“置空”，保持原来的 _start/_holes 压缩策略
                                                                for (var i = this.items.length - 1; i >= this._start; i--) {
                                                                    var item = this.items[i];
                                                                    if (!item) continue;

                                                                    var alive = item.update(world, player, dt);
                                                                    if (!alive) {
                                                                        this._release(item);
                                                                        this.items[i] = null;
                                                                        this._holes++;
                                                                        continue;
                                                                    }

                                                                    // 检测拾取（动画期间 canPickup 会返回 false）
                                                                    if (item.canPickup && item.canPickup(player)) {
                                                                        var picked = true;
                                                                        try { picked = addToInventoryCallback ? addToInventoryCallback(item.blockId, item.count) : true; } catch (_) { picked = true; }
                                                                        if (picked) {
                                                                            if (typeof item.startPickup === 'function') {
                                                                                item.startPickup(player);
                                                                            } else {
                                                                                // 兜底：没有动画函数就直接移除
                                                                                this._release(item);
                                                                                this.items[i] = null;
                                                                                this._holes++;
                                                                            }
                                                                        }
                                                                    }
                                                                }

                                                                // 推进头指针（跳过前面的空洞）
                                                                while (this._start < this.items.length && !this.items[this._start]) {
                                                                    this._start++;
                                                                    this._holes = Math.max(0, this._holes - 1);
                                                                }

                                                                // 需要时压缩，避免空洞过多导致遍历成本上升
                                                                this._maybeCompact(false);
                                                            };
                                                        }

                                                        // render：拾取动画期间应用缩放/透明度，同时保留原“快消失闪烁 + 数量显示 + 发光”
                                                        if (typeof DroppedItemManager.prototype.render === 'function') {
                                                            var _oldMgrRender = DroppedItemManager.prototype.render;
                                                            DroppedItemManager.prototype.render = function (ctx, cam, textures, timeOfDay) {
                                                                // 复制原渲染主干，增加 _pickupAlpha/_pickupScale
                                                                var ts = CONFIG.TILE_SIZE;
                                                                var now = (performance && performance.now) ? performance.now() : Date.now();
                                                                var blinkPhase = Math.floor(now / 200) % 2;

                                                                for (var i = this._start; i < this.items.length; i++) {
                                                                    var item = this.items[i];
                                                                    if (!item) continue;

                                                                    var sx = item.x - cam.x;
                                                                    var sy = item.y - cam.y;

                                                                    // 浮动效果（拾取动画中关闭 bob）
                                                                    var bob = item._pickup ? 0 : (Math.sin(now * 0.005 + item.bobOffset) * 3);

                                                                    // 闪烁效果（快消失时）
                                                                    if (!item._pickup && item.age > item.maxAge - 5000 && blinkPhase === 0) {
                                                                        continue;
                                                                    }

                                                                    var alpha = (typeof item._pickupAlpha === 'number') ? item._pickupAlpha : 1;
                                                                    var scale = (typeof item._pickupScale === 'number') ? item._pickupScale : 1;

                                                                    ctx.save();
                                                                    ctx.globalAlpha *= alpha;
                                                                    ctx.translate(sx + item.w / 2, sy + item.h / 2 + bob);
                                                                    ctx.rotate(item.rotation || 0);
                                                                    ctx.scale(scale, scale);

                                                                    // 发光效果（用查表避免每帧对象查找）
                                                                    var lightLv = BL ? (BL[item.blockId] | 0) : 0;
                                                                    if (lightLv > 0) {
                                                                        ctx.shadowColor = (BC && BC[item.blockId]) ? BC[item.blockId] : '#fff';
                                                                        ctx.shadowBlur = 15;
                                                                    } else {
                                                                        ctx.shadowColor = '#ffeaa7';
                                                                        ctx.shadowBlur = 8;
                                                                    }

                                                                    // 绘制物品
                                                                    var tex = textures && textures.get ? textures.get(item.blockId) : null;
                                                                    if (tex) {
                                                                        ctx.drawImage(tex, -item.w / 2, -item.h / 2, item.w, item.h);
                                                                    } else {
                                                                        // 后备渲染
                                                                        ctx.fillStyle = (BC && BC[item.blockId]) ? BC[item.blockId] : '#fff';
                                                                        ctx.fillRect(-item.w / 2, -item.h / 2, item.w, item.h);
                                                                    }

                                                                    ctx.shadowBlur = 0;

                                                                    // 显示数量（如果大于1）
                                                                    if (item.count > 1) {
                                                                        ctx.fillStyle = '#ffeaa7';
                                                                        ctx.font = 'bold 8px Arial';
                                                                        ctx.textAlign = 'right';
                                                                        ctx.fillText(String(item.count), item.w / 2, item.h / 2);
                                                                    }

                                                                    ctx.restore();
                                                                }
                                                            };
                                                        }
                                                    }
                                                }
                                            })();
                                        }
                                    }); try { __p && __p.apply && __p.apply(); } catch (e) { console.warn('[TU merge] patch apply failed', __p && __p.id, e); }
                                })();
                            })();

                            /* =====================================================================
                               v12: TileLogic Refactor (UpdateTick observer pattern) + Fluids + Logic
                               - Water "pressure-ish" flow (down + side equalization)
                               - Redstone-like power propagation (wire/switch/lamp)
                               - Logic runs in Web Worker; main thread applies diffs in requestIdleCallback
                               - If Worker is unavailable/blocked, falls back to requestIdleCallback simulation
                            ===================================================================== */
                            (() => {
                                const TU = window.TU || (window.TU = {});
                                if (TU.__tileLogicV12) return;
                                TU.__tileLogicV12 = true;

                                const CFG = (typeof CONFIG !== 'undefined') ? CONFIG : (TU.CONFIG || { TILE_SIZE: 16, REACH_DISTANCE: 6 });
                                const B = (typeof BLOCK !== 'undefined') ? BLOCK : (TU.BLOCK || {});
                                const BD = (typeof BLOCK_DATA !== 'undefined') ? BLOCK_DATA : (TU.BLOCK_DATA || {});
                                const SOLID = (typeof BLOCK_SOLID !== 'undefined') ? BLOCK_SOLID : (TU.BLOCK_SOLID || new Uint8Array(256));
                                const LIQ = (typeof BLOCK_LIQUID !== 'undefined') ? BLOCK_LIQUID : (TU.BLOCK_LIQUID || new Uint8Array(256));
                                const TRANSP = (typeof BLOCK_TRANSPARENT !== 'undefined') ? BLOCK_TRANSPARENT : (TU.BLOCK_TRANSPARENT || new Uint8Array(256));
                                const WALK = (typeof BLOCK_WALKABLE !== 'undefined') ? BLOCK_WALKABLE : (TU.BLOCK_WALKABLE || new Uint8Array(256));
                                const BL = (typeof BLOCK_LIGHT !== 'undefined') ? BLOCK_LIGHT : null;
                                const BH = (typeof BLOCK_HARDNESS !== 'undefined') ? BLOCK_HARDNESS : null;
                                const BC = (typeof BLOCK_COLOR !== 'undefined') ? BLOCK_COLOR : null;
                                const BCP = (typeof BLOCK_COLOR_PACKED !== 'undefined') ? BLOCK_COLOR_PACKED : null;
                                const SD = (typeof SUN_DECAY !== 'undefined') ? SUN_DECAY : null;

                                const IDS = {
                                    WIRE_OFF: 200,
                                    WIRE_ON: 201,
                                    SWITCH_OFF: 202,
                                    SWITCH_ON: 203,
                                    LAMP_OFF: 204,
                                    LAMP_ON: 205
                                };
                                TU.LOGIC_BLOCKS = IDS;

                                // ─────────────────────────────────────────────────────────────
                                // 1) Register new blocks into BLOCK_DATA + lookup tables
                                // ─────────────────────────────────────────────────────────────
                                function _hexToPacked(c) {
                                    try {
                                        if (typeof c === 'string' && c.length === 7 && c[0] === '#') {
                                            const r = parseInt(c.slice(1, 3), 16) | 0;
                                            const g = parseInt(c.slice(3, 5), 16) | 0;
                                            const b = parseInt(c.slice(5, 7), 16) | 0;
                                            return ((r << 16) | (g << 8) | b) >>> 0;
                                        }
                                    } catch { }
                                    return ((240 << 16) | (15 << 8) | 0) >>> 0;
                                }

                                function addBlock(id, def) {
                                    BD[id] = def;
                                    try { SOLID[id] = def.solid ? 1 : 0; } catch { }
                                    try { TRANSP[id] = def.transparent ? 1 : 0; } catch { }
                                    try { LIQ[id] = def.liquid ? 1 : 0; } catch { }
                                    try { if (BL) BL[id] = def.light ? (def.light | 0) : 0; } catch { }
                                    try { if (BH) BH[id] = def.hardness ? +def.hardness : 0; } catch { }
                                    try { if (BC) BC[id] = def.color; } catch { }
                                    try {
                                        if (SD) {
                                            const AIR = (B && B.AIR !== undefined) ? B.AIR : 0;
                                            let v = 0;
                                            if (def.solid && !def.transparent) v = 3;
                                            else if (def.transparent && id !== AIR) v = 1;
                                            SD[id] = v;
                                        }
                                    } catch { }
                                    try { if (BCP) BCP[id] = _hexToPacked(def.color); } catch { }
                                    try { if (WALK) WALK[id] = def.solid ? 0 : 1; } catch { }
                                }

                                function ensureBlocks() {
                                    if (BD[IDS.WIRE_OFF]) return; // already added
                                    addBlock(IDS.WIRE_OFF, { name: '逻辑线', solid: false, transparent: true, liquid: false, light: 0, hardness: 0.2, color: '#7f1d1d' });
                                    addBlock(IDS.WIRE_ON, { name: '逻辑线(通电)', solid: false, transparent: true, liquid: false, light: 0, hardness: 0.2, color: '#ff4d4d' });
                                    addBlock(IDS.SWITCH_OFF, { name: '开关', solid: false, transparent: true, liquid: false, light: 0, hardness: 0.4, color: '#8b5e3c' });
                                    addBlock(IDS.SWITCH_ON, { name: '开关(开启)', solid: false, transparent: true, liquid: false, light: 0, hardness: 0.4, color: '#d4a373' });

                                    // LAMP_ON: light>5 会进入 glow 绘制路径；数量通常不大。想更省就把 light <= 5。
                                    addBlock(IDS.LAMP_OFF, { name: '逻辑灯', solid: true, transparent: false, liquid: false, light: 0, hardness: 1.0, color: '#444444' });
                                    addBlock(IDS.LAMP_ON, { name: '逻辑灯(亮)', solid: true, transparent: false, liquid: false, light: 10, hardness: 1.0, color: '#ffe8a3' });
                                }
                                try { ensureBlocks(); } catch (e) { console.warn('ensureBlocks failed', e); }

                                // ─────────────────────────────────────────────────────────────
                                // 2) TextureGenerator: custom pixel art for logic blocks
                                // ─────────────────────────────────────────────────────────────
                                try {
                                    if (typeof TextureGenerator !== 'undefined' && TextureGenerator.prototype && !TextureGenerator.prototype.__logicV12Patched) {
                                        TextureGenerator.prototype.__logicV12Patched = true;
                                        const _old = TextureGenerator.prototype._drawPixelArt;

                                        TextureGenerator.prototype._drawPixelArt = function (ctx, id, data) {
                                            const s = (CFG && CFG.TILE_SIZE) ? CFG.TILE_SIZE : 16;

                                            if (id === IDS.WIRE_OFF || id === IDS.WIRE_ON) {
                                                ctx.clearRect(0, 0, s, s);
                                                const col = (id === IDS.WIRE_ON) ? '#ff4d4d' : '#7f1d1d';
                                                ctx.fillStyle = col;
                                                ctx.fillRect(0, (s / 2) | 0, s, 2);
                                                ctx.fillRect((s / 2) | 0, 0, 2, s);
                                                ctx.fillStyle = (id === IDS.WIRE_ON) ? '#ffd6d6' : '#3b0a0a';
                                                ctx.fillRect(((s / 2) | 0) - 1, ((s / 2) | 0) - 1, 4, 4);
                                                return;
                                            }

                                            if (id === IDS.SWITCH_OFF || id === IDS.SWITCH_ON) {
                                                ctx.clearRect(0, 0, s, s);
                                                ctx.fillStyle = '#5b3a29';
                                                ctx.fillRect(3, 10, s - 6, 4);
                                                ctx.fillStyle = '#2b1a12';
                                                ctx.fillRect(3, 14, s - 6, 1);

                                                const on = (id === IDS.SWITCH_ON);
                                                ctx.fillStyle = '#c9a227';
                                                if (on) {
                                                    ctx.fillRect(9, 4, 2, 8);
                                                    ctx.fillRect(8, 4, 4, 2);
                                                } else {
                                                    ctx.fillRect(5, 6, 8, 2);
                                                    ctx.fillRect(11, 4, 2, 8);
                                                }
                                                ctx.fillStyle = on ? '#ffe08a' : '#d8c9a8';
                                                ctx.fillRect(on ? 8 : 11, on ? 2 : 11, 4, 4);
                                                return;
                                            }

                                            if (id === IDS.LAMP_OFF || id === IDS.LAMP_ON) {
                                                const on = (id === IDS.LAMP_ON);
                                                ctx.fillStyle = '#2f2f2f';
                                                ctx.fillRect(0, 0, s, s);
                                                ctx.fillStyle = '#3a3a3a';
                                                ctx.fillRect(1, 1, s - 2, s - 2);
                                                ctx.fillStyle = on ? '#ffe8a3' : '#555555';
                                                ctx.fillRect(3, 3, s - 6, s - 6);
                                                ctx.fillStyle = on ? '#fff6d6' : '#777777';
                                                ctx.fillRect(4, 4, 3, 3);
                                                ctx.fillStyle = on ? '#d8b54a' : '#333333';
                                                ctx.fillRect(3, (s / 2) | 0, s - 6, 1);
                                                ctx.fillRect((s / 2) | 0, 3, 1, s - 6);
                                                return;
                                            }

                                            return _old.call(this, ctx, id, data);
                                        };
                                    }
                                } catch (e) {
                                    console.warn('logic textures patch failed', e);
                                }

                                // ─────────────────────────────────────────────────────────────
                                // 3) Recipes + starter items (idempotent)
                                // ─────────────────────────────────────────────────────────────
                                try {
                                    if (typeof RECIPES !== 'undefined' && RECIPES && !RECIPES.__logicV12Added) {
                                        RECIPES.__logicV12Added = true;
                                        RECIPES.push(
                                            { out: IDS.WIRE_OFF, count: 12, req: [{ id: B.IRON_ORE, count: 1 }], desc: '基础逻辑导线（传导电力）。' },
                                            { out: IDS.SWITCH_OFF, count: 1, req: [{ id: B.WOOD, count: 1 }, { id: IDS.WIRE_OFF, count: 2 }], desc: '开关：对准并“右键 + 镐”切换开/关。' },
                                            { out: IDS.LAMP_OFF, count: 1, req: [{ id: B.GLASS, count: 1 }, { id: IDS.WIRE_OFF, count: 2 }], desc: '逻辑灯：与通电导线相邻时点亮。' }
                                        );
                                    }
                                } catch { }

                                // ─────────────────────────────────────────────────────────────
                                // 4) Drop remap: ON-state drops OFF-state
                                // ─────────────────────────────────────────────────────────────
                                try {
                                    if (typeof DroppedItemManager !== 'undefined' && DroppedItemManager.prototype && !DroppedItemManager.prototype.__logicV12DropPatch) {
                                        DroppedItemManager.prototype.__logicV12DropPatch = true;
                                        const _spawn = DroppedItemManager.prototype.spawn;
                                        DroppedItemManager.prototype.spawn = function (x, y, blockId, count) {
                                            if (blockId === IDS.WIRE_ON) blockId = IDS.WIRE_OFF;
                                            else if (blockId === IDS.SWITCH_ON) blockId = IDS.SWITCH_OFF;
                                            else if (blockId === IDS.LAMP_ON) blockId = IDS.LAMP_OFF;
                                            return _spawn.call(this, x, y, blockId, count);
                                        };
                                    }
                                } catch { }

                                // ─────────────────────────────────────────────────────────────
                                // 5) TileLogicEngine: Worker-driven + idle apply
                                // ─────────────────────────────────────────────────────────────
                                const ric = (typeof requestIdleCallback !== 'undefined')
                                    ? requestIdleCallback.bind(window)
                                    : (cb, opts) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), (opts && opts.timeout) ? opts.timeout : 0);

                                class TileLogicEngine {
                                    constructor(game) {
                                        this.game = game;
                                        this.world = game.world;
                                        this.w = this.world.w | 0;
                                        this.h = this.world.h | 0;

                                        this.worker = null;
                                        this.pending = []; // { arr:Int32Array, pos:number }
                                        this._applyScheduled = false;

                                        this._lastRegionSent = 0;
                                        this._lastPerfSent = '';
                                        this._minimapDirty = false;
                                        this._lastMinimapFlush = 0;
                                        this._enabled = true;

                                        this._idle = null; // fallback state
                                        this._initWorker();
                                    }

                                    _flattenTiles() {
                                        const out = new Uint8Array(this.w * this.h);
                                        for (let x = 0; x < this.w; x++) out.set(this.world.tiles[x], x * this.h);
                                        return out;
                                    }

                                    _initWorker() {
                                        if (typeof Worker === 'undefined') {
                                            console.warn('Worker not available; TileLogicEngine uses idle fallback');
                                            this._initIdleFallback();
                                            return;
                                        }

                                        const code = TileLogicEngine._workerSource();
                                        const blob = new Blob([code], { type: 'text/javascript' });
                                        const url = URL.createObjectURL(blob);

                                        let worker;
                                        try {
                                            worker = new Worker(url);
                                        } catch (e) {
                                            console.warn('Worker blocked; fallback to idle', e);
                                            try { URL.revokeObjectURL(url); } catch { }
                                            this._initIdleFallback();
                                            return;
                                        }

                                        try { URL.revokeObjectURL(url); } catch { }

                                        this.worker = worker;

                                        worker.onmessage = (e) => {
                                            const msg = e.data;
                                            if (!msg || !msg.type) return;
                                            if (msg.type === 'changes' && msg.buf) {
                                                try {
                                                    const arr = new Int32Array(msg.buf);
                                                    this.pending.push({ arr, pos: 0 });
                                                    this._scheduleApply();
                                                } catch { }
                                            }
                                        };

                                        worker.onerror = (e) => {
                                            console.warn('TileLogic worker error', e);
                                            try { worker.terminate(); } catch { }
                                            this.worker = null;
                                            this._initIdleFallback();
                                        };

                                        try {
                                            const tilesFlat = this._flattenTiles();
                                            const solidCopy = new Uint8Array(256);
                                            try { solidCopy.set(SOLID); } catch { }
                                            worker.postMessage({
                                                type: 'init',
                                                w: this.w,
                                                h: this.h,
                                                tiles: tilesFlat.buffer,
                                                solid: solidCopy.buffer,
                                                ids: IDS,
                                                blocks: { AIR: (B && B.AIR !== undefined) ? B.AIR : 0, WATER: (B && B.WATER !== undefined) ? B.WATER : 27 }
                                            }, [tilesFlat.buffer, solidCopy.buffer]);
                                        } catch (e) {
                                            console.warn('TileLogic worker init failed', e);
                                        }
                                    }

                                    _initIdleFallback() {
                                        // Full idle fallback: water + logic, both processed during requestIdleCallback.
                                        const tiles = this._flattenTiles();
                                        const N = tiles.length;

                                        const WATER = (B && B.WATER !== undefined) ? B.WATER : 27;
                                        const AIR = (B && B.AIR !== undefined) ? B.AIR : 0;
                                        const MAX = 8;

                                        const water = new Uint8Array(N);
                                        for (let i = 0; i < N; i++) if (tiles[i] === WATER) water[i] = MAX;

                                        const waterMark = new Uint8Array(N);
                                        const waterQ = [];
                                        const logicMark = new Uint8Array(N);
                                        const logicQ = [];

                                        // Region limiter for main-thread fallback (protect FPS)
                                        const region = { x0: 0, y0: 0, x1: -1, y1: -1, set: false, key: '' };

                                        const inRegionIndex = (i) => {
                                            if (!region.set) return false;
                                            const x = (i / this.h) | 0;
                                            const y = i - x * this.h;
                                            return (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1);
                                        };

                                        const idx = (x, y) => x * this.h + y;

                                        const scheduleWater = (i) => {
                                            if (!inRegionIndex(i)) return;
                                            if (waterMark[i]) return;
                                            waterMark[i] = 1;
                                            waterQ.push(i);
                                        };
                                        const scheduleWaterAround = (x, y) => {
                                            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
                                            scheduleWater(idx(x, y));
                                            if (x > 0) scheduleWater(idx(x - 1, y));
                                            if (x + 1 < this.w) scheduleWater(idx(x + 1, y));
                                            if (y > 0) scheduleWater(idx(x, y - 1));
                                            if (y + 1 < this.h) scheduleWater(idx(x, y + 1));
                                        };

                                        const scheduleLogic = (i) => {
                                            if (!inRegionIndex(i)) return;
                                            if (logicMark[i]) return;
                                            logicMark[i] = 1;
                                            logicQ.push(i);
                                        };
                                        const scheduleLogicAround = (x, y) => {
                                            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
                                            scheduleLogic(idx(x, y));
                                            if (x > 0) scheduleLogic(idx(x - 1, y));
                                            if (x + 1 < this.w) scheduleLogic(idx(x + 1, y));
                                            if (y > 0) scheduleLogic(idx(x, y - 1));
                                            if (y + 1 < this.h) scheduleLogic(idx(x, y + 1));
                                        };

                                        const isWire = (id) => id === IDS.WIRE_OFF || id === IDS.WIRE_ON;
                                        const isSwitch = (id) => id === IDS.SWITCH_OFF || id === IDS.SWITCH_ON;
                                        const isSource = (id) => id === IDS.SWITCH_ON;
                                        const isLamp = (id) => id === IDS.LAMP_OFF || id === IDS.LAMP_ON;
                                        const isConductor = (id) => isWire(id) || isSwitch(id);

                                        const canWaterEnterTile = (id) => (id === AIR || id === WATER);

                                        const setTile = (i, newId, changes) => {
                                            const old = tiles[i];
                                            if (old === newId) return false;
                                            tiles[i] = newId;
                                            changes.push(i, old, newId);
                                            const x = (i / this.h) | 0;
                                            const y = i - x * this.h;
                                            scheduleWaterAround(x, y);
                                            scheduleLogicAround(x, y);
                                            return true;
                                        };

                                        const ensureWaterTile = (i, changes) => {
                                            if (water[i] > 0) {
                                                if (tiles[i] !== WATER) setTile(i, WATER, changes);
                                            } else {
                                                if (tiles[i] === WATER) setTile(i, AIR, changes);
                                            }
                                        };

                                        const waterTick = (i, changes) => {
                                            waterMark[i] = 0;
                                            if (!inRegionIndex(i)) return;

                                            let a = water[i] | 0;
                                            if (a <= 0) return;

                                            const tid = tiles[i];
                                            if (tid !== WATER && tid !== AIR) { water[i] = 0; return; }

                                            const x = (i / this.h) | 0;
                                            const y = i - x * this.h;

                                            if (y + 1 < this.h) {
                                                const d = i + 1;
                                                const dt = tiles[d];
                                                if (canWaterEnterTile(dt)) {
                                                    const b = water[d] | 0;
                                                    const space = MAX - b;
                                                    if (space > 0) {
                                                        const mv = a < space ? a : space;
                                                        water[i] = a - mv;
                                                        water[d] = b + mv;
                                                        a = water[i] | 0;

                                                        ensureWaterTile(i, changes);
                                                        ensureWaterTile(d, changes);

                                                        scheduleWater(d);
                                                        scheduleWater(i);
                                                        scheduleWaterAround(x, y);
                                                        scheduleWaterAround(x, y + 1);
                                                    }
                                                }
                                            }

                                            if (a <= 0) return;

                                            const flowSide = (n) => {
                                                const nt = tiles[n];
                                                if (!canWaterEnterTile(nt)) return;
                                                const nb = water[n] | 0;
                                                const diff = a - nb;
                                                if (diff <= 1) return;
                                                let mv = diff >> 1;
                                                if (mv < 1) mv = 1;
                                                const space = MAX - nb;
                                                if (mv > space) mv = space;
                                                if (mv <= 0) return;

                                                water[i] = (water[i] | 0) - mv;
                                                water[n] = nb + mv;
                                                a = water[i] | 0;

                                                ensureWaterTile(i, changes);
                                                ensureWaterTile(n, changes);

                                                scheduleWater(n);
                                                scheduleWater(i);
                                            };

                                            if (x > 0) flowSide(i - this.h);
                                            if (x + 1 < this.w) flowSide(i + this.h);
                                        };

                                        // logic BFS bookkeeping
                                        let vis = new Uint32Array(N);
                                        let stamp = 1;

                                        const lampShouldOn = (iLamp) => {
                                            const x = (iLamp / this.h) | 0;
                                            const y = iLamp - x * this.h;
                                            if (x > 0) { const t = tiles[iLamp - this.h]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
                                            if (x + 1 < this.w) { const t = tiles[iLamp + this.h]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
                                            if (y > 0) { const t = tiles[iLamp - 1]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
                                            if (y + 1 < this.h) { const t = tiles[iLamp + 1]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
                                            return false;
                                        };

                                        const updateLampAt = (iLamp, changes) => {
                                            const t = tiles[iLamp];
                                            if (!isLamp(t)) return;
                                            const want = lampShouldOn(iLamp) ? IDS.LAMP_ON : IDS.LAMP_OFF;
                                            if (t !== want) setTile(iLamp, want, changes);
                                        };

                                        const logicRecomputeFromSeed = (seed, changes) => {
                                            logicMark[seed] = 0;

                                            stamp = (stamp + 1) >>> 0;
                                            if (stamp === 0) { stamp = 1; vis.fill(0); }

                                            const starts = [];
                                            const sid = tiles[seed];
                                            if (isConductor(sid)) starts.push(seed);
                                            else {
                                                const x = (seed / this.h) | 0;
                                                const y = seed - x * this.h;
                                                if (x > 0) { const n = seed - this.h; if (isConductor(tiles[n])) starts.push(n); }
                                                if (x + 1 < this.w) { const n = seed + this.h; if (isConductor(tiles[n])) starts.push(n); }
                                                if (y > 0) { const n = seed - 1; if (isConductor(tiles[n])) starts.push(n); }
                                                if (y + 1 < this.h) { const n = seed + 1; if (isConductor(tiles[n])) starts.push(n); }
                                                if (isLamp(sid)) updateLampAt(seed, changes);
                                            }
                                            if (!starts.length) return;

                                            const q = [];
                                            const comp = [];
                                            let powered = false;

                                            for (let si = 0; si < starts.length; si++) {
                                                const s = starts[si];
                                                if (vis[s] === stamp) continue;
                                                vis[s] = stamp;
                                                q.push(s);

                                                while (q.length) {
                                                    const i = q.pop();
                                                    const t = tiles[i];
                                                    if (!isConductor(t)) continue;

                                                    comp.push(i);
                                                    if (isSource(t)) powered = true;

                                                    const x = (i / this.h) | 0;
                                                    const y = i - x * this.h;

                                                    if (x > 0) { const n = i - this.h; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
                                                    if (x + 1 < this.w) { const n = i + this.h; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
                                                    if (y > 0) { const n = i - 1; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
                                                    if (y + 1 < this.h) { const n = i + 1; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }

                                                    if (comp.length > 12000) break;
                                                }
                                                if (comp.length > 12000) break;
                                            }

                                            const wantWire = powered ? IDS.WIRE_ON : IDS.WIRE_OFF;

                                            for (let i = 0; i < comp.length; i++) {
                                                const p = comp[i];
                                                const t = tiles[p];
                                                if (isWire(t) && t !== wantWire) setTile(p, wantWire, changes);
                                            }

                                            for (let i = 0; i < comp.length; i++) {
                                                const p = comp[i];
                                                const x = (p / this.h) | 0;
                                                const y = p - x * this.h;
                                                if (x > 0) updateLampAt(p - this.h, changes);
                                                if (x + 1 < this.w) updateLampAt(p + this.h, changes);
                                                if (y > 0) updateLampAt(p - 1, changes);
                                                if (y + 1 < this.h) updateLampAt(p + 1, changes);
                                            }
                                        };

                                        const primeRegion = () => {
                                            if (!region.set) return;
                                            for (let x = region.x0; x <= region.x1; x++) {
                                                const base = x * this.h;
                                                for (let y = region.y0; y <= region.y1; y++) {
                                                    const i = base + y;
                                                    if (water[i] > 0) scheduleWater(i);
                                                    const t = tiles[i];
                                                    if (t === IDS.SWITCH_ON || isWire(t) || isLamp(t)) scheduleLogic(i);
                                                }
                                            }
                                        };

                                        // store fallback state
                                        this._idle = {
                                            tiles, water, waterMark, waterQ,
                                            logicMark, logicQ,
                                            region,
                                            idx, scheduleWaterAround, scheduleLogicAround,
                                            setTile, primeRegion,
                                            waterTick, logicRecomputeFromSeed,
                                            perfLevel: 'high',
                                            WATER, AIR
                                        };

                                        const step = (deadline) => {
                                            if (!this._enabled || !this._idle) return;

                                            const st = this._idle;
                                            const changes = [];

                                            const waterBudget = (st.perfLevel === 'low') ? 220 : 520;
                                            const logicBudget = 1;

                                            let ops = 0;
                                            while (ops < waterBudget && st.waterQ.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
                                                const i = st.waterQ.pop();
                                                st.waterTick(i, changes);
                                                ops++;
                                            }

                                            let lops = 0;
                                            while (lops < logicBudget && st.logicQ.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
                                                const i = st.logicQ.pop();
                                                st.logicRecomputeFromSeed(i, changes);
                                                lops++;
                                            }

                                            if (changes.length) {
                                                this.pending.push({ arr: new Int32Array(changes), pos: 0 });
                                                this._scheduleApply();
                                            }

                                            ric(step, { timeout: 50 });
                                        };

                                        ric(step, { timeout: 50 });
                                    }

                                    notifyTileWrite(x, y, newId) {
                                        if (!this._enabled) return;

                                        if (this.worker) {
                                            try { this.worker.postMessage({ type: 'tileWrite', x: x | 0, y: y | 0, id: newId | 0 }); } catch { }
                                            return;
                                        }

                                        if (!this._idle) return;
                                        const st = this._idle;

                                        const idx = (x | 0) * this.h + (y | 0);
                                        const old = st.tiles[idx];
                                        st.tiles[idx] = newId | 0;

                                        if (newId === st.WATER) st.water[idx] = 8;
                                        if (old === st.WATER && newId !== st.WATER) st.water[idx] = 0;

                                        st.scheduleWaterAround(x, y);
                                        st.scheduleLogicAround(x, y);
                                    }

                                    onFrame(dt) {
                                        // 防御性参数检查
                                        if (typeof dt !== 'number' || dt < 0) {
                                            console.warn(`[TileLogicEngine.onFrame] Invalid dt: ${dt}`);
                                            dt = 16.67;
                                        }

                                        if (!this._enabled) return;

                                        // 防御性：检查game和world
                                        if (!this.game || !this.game.world) {
                                            console.warn('[TileLogicEngine.onFrame] Game/World not available');
                                            return;
                                        }

                                        const now = performance.now();

                                        if (this.worker) {
                                            if (now - this._lastRegionSent > 250) {
                                                this._lastRegionSent = now;
                                                try {
                                                    const px = (this.game.player.x / CFG.TILE_SIZE) | 0;
                                                    const py = (this.game.player.y / CFG.TILE_SIZE) | 0;
                                                    this.worker.postMessage({ type: 'region', cx: px, cy: py, rx: 60, ry: 45 });
                                                } catch { }
                                            }

                                            const lvl = (this.game._perf && this.game._perf.level) ? this.game._perf.level : 'high';
                                            if (lvl !== this._lastPerfSent) {
                                                this._lastPerfSent = lvl;
                                                try { this.worker.postMessage({ type: 'perf', level: lvl }); } catch { }
                                            }
                                            return;
                                        }

                                        // idle fallback: update region & perf
                                        if (this._idle && (now - this._lastRegionSent > 350)) {
                                            this._lastRegionSent = now;
                                            const st = this._idle;

                                            const px = (this.game.player.x / CFG.TILE_SIZE) | 0;
                                            const py = (this.game.player.y / CFG.TILE_SIZE) | 0;
                                            const rx = 60, ry = 45;

                                            const x0 = Math.max(0, px - rx);
                                            const x1 = Math.min(this.w - 1, px + rx);
                                            const y0 = Math.max(0, py - ry);
                                            const y1 = Math.min(this.h - 1, py + ry);

                                            const key = x0 + ',' + y0 + ',' + x1 + ',' + y1;
                                            if (key !== st.region.key) {
                                                st.region.key = key;
                                                st.region.x0 = x0; st.region.x1 = x1; st.region.y0 = y0; st.region.y1 = y1; st.region.set = true;
                                                st.primeRegion();
                                            } else {
                                                st.region.set = true;
                                            }

                                            const lvl = (this.game._perf && this.game._perf.level) ? this.game._perf.level : 'high';
                                            st.perfLevel = lvl;
                                        }
                                    }

                                    _scheduleApply() {
                                        if (this._applyScheduled) return;
                                        this._applyScheduled = true;
                                        ric((deadline) => this._applyPending(deadline), { timeout: 50 });
                                    }

                                    _applyPending(deadline) {
                                        // 防御性参数检查
                                        if (!deadline) {
                                            console.warn('[TileLogicEngine._applyPending] No deadline provided');
                                            deadline = { timeRemaining: () => 16, didTimeout: false };
                                        }

                                        this._applyScheduled = false;
                                        if (!this.pending || !this.pending.length) return;

                                        // 防御性：检查game和world
                                        if (!this.game || !this.game.world) {
                                            console.warn('[TileLogicEngine._applyPending] Game/World not available');
                                            return;
                                        }

                                        const game = this.game;
                                        const world = this.world;
                                        const renderer = game && game.renderer;

                                        let any = false;
                                        let lightSeeds = [];
                                        const maxLightSeeds = 16;

                                        const maxOps = 1600;
                                        let ops = 0;

                                        while (this.pending.length && (deadline.timeRemaining() > 2 || deadline.didTimeout) && ops < maxOps) {
                                            const cur = this.pending[0];
                                            const arr = cur.arr;

                                            while (cur.pos < arr.length && ops < maxOps) {
                                                const idx = arr[cur.pos++];
                                                const expectOld = arr[cur.pos++];
                                                const newId = arr[cur.pos++];

                                                const x = (idx / this.h) | 0;
                                                const y = idx - x * this.h;
                                                if (x < 0 || y < 0 || x >= this.w || y >= this.h) { ops++; continue; }

                                                const col = world.tiles[x];
                                                const oldMain = col[y];
                                                if (oldMain !== expectOld) { ops++; continue; } // stale -> ignore

                                                col[y] = newId;
                                                any = true;

                                                try { renderer && renderer.invalidateTile && renderer.invalidateTile(x, y); } catch { }

                                                if (BL) {
                                                    const blOld = BL[expectOld] | 0;
                                                    const blNew = BL[newId] | 0;
                                                    if (blOld !== blNew && lightSeeds.length < maxLightSeeds) lightSeeds.push([x, y]);
                                                }

                                                this._minimapDirty = true;

                                                ops++;
                                            }

                                            if (cur.pos >= arr.length) this.pending.shift();
                                            else break;
                                        }

                                        if (any) {
                                            if (lightSeeds.length && game && game._deferLightUpdate) {
                                                for (let i = 0; i < lightSeeds.length; i++) {
                                                    const p = lightSeeds[i];
                                                    try { game._deferLightUpdate(p[0], p[1]); } catch { }
                                                }
                                            }

                                            const now = performance.now();
                                            if (this._minimapDirty && (now - this._lastMinimapFlush > 600)) {
                                                this._minimapDirty = false;
                                                this._lastMinimapFlush = now;
                                                try { game._deferMinimapUpdate && game._deferMinimapUpdate(); } catch { }
                                            }
                                        }

                                        if (this.pending.length) this._scheduleApply();
                                    }

                                    static _workerSource() {
                                        return `/* TileLogic Worker v12 */
(() => {
  let W = 0, H = 0;
  let tiles = null;
  let water = null;
  let solid = null;

  let AIR = 0, WATER = 27;
  let IDS = null;

  const region = { x0: 0, y0: 0, x1: -1, y1: -1, set: false };
  let lastRegionKey = '';
  let perfLevel = 'high';
  const MAX = 8;

  const waterQ = [];
  let waterMark = null;
  const logicQ = [];
  let logicMark = null;
function scheduleLogic(i) {
if (!logicMark) return;
if (!inRegionIndex(i)) return;
if (logicMark[i]) return;
logicMark[i] = 1;
logicQ.push(i);
  }

  function scheduleLogicAround(x, y) {
if (x < 0 || y < 0 || x >= W || y >= H) return;
scheduleLogic(idx(x, y));
if (x > 0) scheduleLogic(idx(x - 1, y));
if (x + 1 < W) scheduleLogic(idx(x + 1, y));
if (y > 0) scheduleLogic(idx(x, y - 1));
if (y + 1 < H) scheduleLogic(idx(x, y + 1));
  }

  function setTile(i, newId, changes) {
const old = tiles[i];
if (old === newId) return false;
tiles[i] = newId;
changes.push(i, old, newId);
const x = (i / H) | 0;
const y = i - x * H;
scheduleWaterAround(x, y);
scheduleLogicAround(x, y);
return true;
  }

  function ensureWaterTile(i, changes) {
if (water[i] > 0) {
  if (tiles[i] !== WATER) setTile(i, WATER, changes);
} else {
  if (tiles[i] === WATER) setTile(i, AIR, changes);
}
  }

  function waterTick(i, changes) {
waterMark[i] = 0;
if (!inRegionIndex(i)) return;

let a = water[i] | 0;
if (a <= 0) return;

const tid = tiles[i];
if (tid !== WATER && tid !== AIR) { water[i] = 0; return; }

const x = (i / H) | 0;
const y = i - x * H;

if (y + 1 < H) {
  const d = i + 1;
  const dt = tiles[d];
  if (canWaterEnterTile(dt)) {
    const b = water[d] | 0;
    const space = MAX - b;
    if (space > 0) {
      const mv = a < space ? a : space;
      water[i] = a - mv;
      water[d] = b + mv;
      a = water[i] | 0;

      ensureWaterTile(i, changes);
      ensureWaterTile(d, changes);

      scheduleWater(d);
      scheduleWater(i);
      scheduleWaterAround(x, y);
      scheduleWaterAround(x, y + 1);
    }
  }
}

if (a <= 0) return;

function flowSide(n) {
  const nt = tiles[n];
  if (!canWaterEnterTile(nt)) return;
  const nb = water[n] | 0;
  const diff = a - nb;
  if (diff <= 1) return;
  let mv = diff >> 1;
  if (mv < 1) mv = 1;
  const space = MAX - nb;
  if (mv > space) mv = space;
  if (mv <= 0) return;

  water[i] = (water[i] | 0) - mv;
  water[n] = nb + mv;
  a = water[i] | 0;

  ensureWaterTile(i, changes);
  ensureWaterTile(n, changes);

  scheduleWater(n);
  scheduleWater(i);
}

if (x > 0) flowSide(i - H);
if (x + 1 < W) flowSide(i + H);
  }

  let vis = null;
  let stamp = 1;
  function ensureVis() {
const N = W * H;
if (!vis || vis.length !== N) vis = new Uint32Array(N);
  }

  function lampShouldOn(iLamp) {
const x = (iLamp / H) | 0;
const y = iLamp - x * H;
if (x > 0) { const t = tiles[iLamp - H]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
if (x + 1 < W) { const t = tiles[iLamp + H]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
if (y > 0) { const t = tiles[iLamp - 1]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
if (y + 1 < H) { const t = tiles[iLamp + 1]; if (t === IDS.WIRE_ON || t === IDS.SWITCH_ON) return true; }
return false;
  }

  function updateLampAt(iLamp, changes) {
const t = tiles[iLamp];
if (!(t === IDS.LAMP_OFF || t === IDS.LAMP_ON)) return;
const want = lampShouldOn(iLamp) ? IDS.LAMP_ON : IDS.LAMP_OFF;
if (t !== want) setTile(iLamp, want, changes);
  }

  function logicRecomputeFromSeed(seed, changes) {
logicMark[seed] = 0;

ensureVis();
stamp = (stamp + 1) >>> 0;
if (stamp === 0) { stamp = 1; vis.fill(0); }

const starts = [];
const sid = tiles[seed];
if (isConductor(sid)) starts.push(seed);
else {
  const x = (seed / H) | 0;
  const y = seed - x * H;
  if (x > 0) { const n = seed - H; if (isConductor(tiles[n])) starts.push(n); }
  if (x + 1 < W) { const n = seed + H; if (isConductor(tiles[n])) starts.push(n); }
  if (y > 0) { const n = seed - 1; if (isConductor(tiles[n])) starts.push(n); }
  if (y + 1 < H) { const n = seed + 1; if (isConductor(tiles[n])) starts.push(n); }
  if (isLamp(sid)) updateLampAt(seed, changes);
}
if (!starts.length) return;

const q = [];
const comp = [];
let powered = false;

for (let si = 0; si < starts.length; si++) {
  const s = starts[si];
  if (vis[s] === stamp) continue;
  vis[s] = stamp;
  q.push(s);

  while (q.length) {
    const i = q.pop();
    const t = tiles[i];
    if (!isConductor(t)) continue;

    comp.push(i);
    if (isSource(t)) powered = true;

    const x = (i / H) | 0;
    const y = i - x * H;

    if (x > 0) { const n = i - H; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
    if (x + 1 < W) { const n = i + H; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
    if (y > 0) { const n = i - 1; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }
    if (y + 1 < H) { const n = i + 1; if (vis[n] !== stamp && isConductor(tiles[n])) { vis[n] = stamp; q.push(n); } }

    if (comp.length > 12000) break;
  }
  if (comp.length > 12000) break;
}

const wantWire = powered ? IDS.WIRE_ON : IDS.WIRE_OFF;
for (let i = 0; i < comp.length; i++) {
  const p = comp[i];
  const t = tiles[p];
  if (isWire(t) && t !== wantWire) setTile(p, wantWire, changes);
}

for (let i = 0; i < comp.length; i++) {
  const p = comp[i];
  const x = (p / H) | 0;
  const y = p - x * H;
  if (x > 0) updateLampAt(p - H, changes);
  if (x + 1 < W) updateLampAt(p + H, changes);
  if (y > 0) updateLampAt(p - 1, changes);
  if (y + 1 < H) updateLampAt(p + 1, changes);
}
  }

  function primeRegionWork() {
if (!region.set) return;
for (let x = region.x0; x <= region.x1; x++) {
  const base = x * H;
  for (let y = region.y0; y <= region.y1; y++) {
    const i = base + y;
    if (water[i] > 0) scheduleWater(i);
    const t = tiles[i];
    if (t === IDS.SWITCH_ON || isWire(t) || isLamp(t)) scheduleLogic(i);
  }
}
  }

  function step() {
const changes = [];

const waterBudget = (perfLevel === 'low') ? 350 : 900;
for (let ops = 0; ops < waterBudget && waterQ.length; ops++) {
  waterTick(waterQ.pop(), changes);
}

const logicBudget = 1;
for (let ops = 0; ops < logicBudget && logicQ.length; ops++) {
  logicRecomputeFromSeed(logicQ.pop(), changes);
}

if (changes.length) {
  const buf = new Int32Array(changes);
  postMessage({ type: 'changes', buf: buf.buffer }, [buf.buffer]);
}

const tickMs = (perfLevel === 'low') ? 55 : 35;
setTimeout(step, tickMs);
  }

  onmessage = (e) => {
const m = e.data;
if (!m || !m.type) return;

switch (m.type) {
  case 'init': {
    W = m.w | 0;
    H = m.h | 0;
    IDS = m.ids;
    AIR = (m.blocks && (m.blocks.AIR | 0) >= 0) ? (m.blocks.AIR | 0) : 0;
    WATER = (m.blocks && (m.blocks.WATER | 0) >= 0) ? (m.blocks.WATER | 0) : 27;

    tiles = new Uint8Array(m.tiles);
    solid = new Uint8Array(m.solid);

    const N = W * H;
    water = new Uint8Array(N);
    waterMark = new Uint8Array(N);
    logicMark = new Uint8Array(N);
    ensureVis();

    for (let i = 0; i < N; i++) if (tiles[i] === WATER) water[i] = MAX;

    step();
    break;
  }

  case 'tileWrite': {
    if (!tiles) return;
    const x = m.x | 0;
    const y = m.y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;

    const i = idx(x, y);
    const newId = m.id | 0;
    const oldId = tiles[i];
    tiles[i] = newId;

    if (newId === WATER) {
      water[i] = MAX;
      scheduleWaterAround(x, y);
    } else if (oldId === WATER && newId !== WATER) {
      water[i] = 0;
      scheduleWaterAround(x, y);
    }

    scheduleLogicAround(x, y);
    break;
  }

  case 'region': {
    const cx = m.cx | 0, cy = m.cy | 0;
    const rx = m.rx | 0, ry = m.ry | 0;

    const x0 = Math.max(0, cx - rx);
    const x1 = Math.min(W - 1, cx + rx);
    const y0 = Math.max(0, cy - ry);
    const y1 = Math.min(H - 1, cy + ry);

    const key = x0 + ',' + y0 + ',' + x1 + ',' + y1;
    if (key !== lastRegionKey) {
      lastRegionKey = key;
      region.x0 = x0; region.x1 = x1; region.y0 = y0; region.y1 = y1; region.set = true;
      primeRegionWork();
    } else {
      region.set = true;
    }
    break;
  }

  case 'perf': {
    perfLevel = m.level || 'high';
    break;
  }
  default: {
    console.warn('[Worker] Unknown message type: ' + m.type);
    break;
  }
}
  };
})();`;
                                    }
                                }

                                TU.TileLogicEngine = TileLogicEngine;

                                // ─────────────────────────────────────────────────────────────
                                // 6) Hook into game lifecycle + markTile
                                // ─────────────────────────────────────────────────────────────
                                function attachToGame(game) {
                                    if (!game || !game.world || !game.player) return;
                                    if (game.tileLogic) return;

                                    try {
                                        game.tileLogic = new TileLogicEngine(game);
                                    } catch (e) {
                                        console.warn('TileLogicEngine attach failed', e);
                                        return;
                                    }

                                    // starter items (idempotent)
                                    try {
                                        const inv = game.player.inventory;
                                        if (!inv || !inv.push) return;
                                        const has = (id) => inv.some(it => it && it.id === id);
                                        if (!has(IDS.WIRE_OFF)) inv.push({ id: IDS.WIRE_OFF, name: '逻辑线', count: 48 });
                                        if (!has(IDS.SWITCH_OFF)) inv.push({ id: IDS.SWITCH_OFF, name: '开关', count: 6 });
                                        if (!has(IDS.LAMP_OFF)) inv.push({ id: IDS.LAMP_OFF, name: '逻辑灯', count: 12 });
                                        game._deferHotbarUpdate && game._deferHotbarUpdate();
                                    } catch { }
                                }

                                // Patch Game.init + Game.update
                                try {
                                    const GameClass = (typeof Game !== 'undefined') ? Game : (TU.Game || null);
                                    if (GameClass && GameClass.prototype && !GameClass.prototype.__logicV12InitPatched) {
                                        GameClass.prototype.__logicV12InitPatched = true;

                                        const _init = GameClass.prototype.init;
                                        GameClass.prototype.init = async function () {
                                            await _init.call(this);
                                            try { attachToGame(this); } catch { }
                                        };

                                        const _update = GameClass.prototype.update;
                                        GameClass.prototype.update = function (dt) {
                                            const r = _update.call(this, dt);
                                            try { this.tileLogic && this.tileLogic.onFrame && this.tileLogic.onFrame(dt); } catch { }
                                            return r;
