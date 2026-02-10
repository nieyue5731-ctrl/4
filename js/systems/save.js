/**
 * @file save.js - Unified SaveSystem (merged from 3 layer wrappers)
 * @description Single class with IDB-compatible localStorage, RLE diff encoding
 */
'use strict';

class SaveSystem {
    static KEY = 'terraria_ultra_save_v1';

    constructor(game) {
        this.game = game;
        this.seed = null;
        this.diff = new Map();
        this._autosaveAcc = 0;
        this._disabled = false;
    }

    static hasSave() {
        try { return !!localStorage.getItem(SaveSystem.KEY); } catch { return false; }
    }

    static clear() {
        try { localStorage.removeItem(SaveSystem.KEY); } catch {}
    }

    static load() {
        try {
            const raw = localStorage.getItem(SaveSystem.KEY);
            if (!raw || raw.length > 10 * 1024 * 1024) return null;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || data.v !== 1) return null;

            const requiredFields = ['ts', 'seed', 'player', 'w', 'h'];
            for (const field of requiredFields) {
                if (!(field in data)) return null;
            }

            const diff = new Map();
            const diffs = data.diffs;

            if (Array.isArray(diffs)) {
                for (const s of diffs) {
                    if (typeof s !== 'string') continue;
                    const parts = s.split('_');
                    if (parts.length !== 3) continue;
                    const x = parseInt(parts[0], 36);
                    const y = parseInt(parts[1], 36);
                    const id = parseInt(parts[2], 36);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(id)) continue;
                    diff.set(x + ',' + y, id);
                }
            } else if (diffs && typeof diffs === 'object' && diffs.fmt === 'rle1' && Array.isArray(diffs.data)) {
                const w = Number.isFinite(diffs.w) ? (diffs.w | 0) : (Number.isFinite(data.w) ? (data.w | 0) : 0);
                if (w <= 0) return null;
                let totalEntries = 0;
                for (const token of diffs.data) {
                    if (typeof token !== 'string') continue;
                    const t = token.charAt(0) === 'r' ? token.slice(1) : token;
                    const parts = t.split('_');
                    if (parts.length !== 3) continue;
                    const start = parseInt(parts[0], 36);
                    const len = parseInt(parts[1], 36);
                    const id = parseInt(parts[2], 36);
                    if (!Number.isFinite(start) || !Number.isFinite(len) || !Number.isFinite(id) || len <= 0) continue;
                    const maxLen = Math.min(len, 20000);
                    for (let i = 0; i < maxLen; i++) {
                        if (totalEntries >= 100000) break;
                        const idx = start + i;
                        diff.set((idx % w) + ',' + ((idx / w) | 0), id);
                        totalEntries++;
                    }
                }
            }

            data._diffMap = diff;
            return data;
        } catch (e) {
            console.error('[SaveSystem] Load error:', e);
            return null;
        }
    }

    static _encodeDiff(diffMap, worldW) {
        const w = Number.isFinite(worldW) ? (worldW | 0) : 0;
        if (w <= 0) return { fmt: 'rle1', w: 0, data: [] };

        const entries = [];
        for (const [k, id] of diffMap.entries()) {
            const [x, y] = k.split(',').map(n => parseInt(n, 10));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(id)) continue;
            entries.push([y * w + x, id]);
        }
        entries.sort((a, b) => a[0] - b[0]);

        const out = [];
        for (let i = 0; i < entries.length;) {
            const start = entries[i][0];
            const id = entries[i][1];
            let len = 1;
            while (i + len < entries.length && entries[i + len][1] === id && entries[i + len][0] === start + len) len++;
            out.push('r' + start.toString(36) + '_' + len.toString(36) + '_' + id.toString(36));
            i += len;
        }
        return { fmt: 'rle1', w, data: out };
    }

    static async promptStartIfNeeded() {
        const has = SaveSystem.hasSave();
        if (!has) return { mode: 'new', save: null };
        const overlay = document.getElementById('save-prompt-overlay');
        const btnC = document.getElementById('save-prompt-continue');
        const btnN = document.getElementById('save-prompt-new');
        const btnX = document.getElementById('save-prompt-close');
        if (!overlay || !btnC || !btnN) return { mode: 'new', save: null };

        return await new Promise((resolve) => {
            const done = (mode) => {
                overlay.classList.remove('show');
                overlay.setAttribute('aria-hidden', 'true');
                btnC.removeEventListener('click', onC);
                btnN.removeEventListener('click', onN);
                if (btnX) btnX.removeEventListener('click', onX);
                let loaded = null;
                if (mode === 'continue') {
                    loaded = SaveSystem.load();
                    if (!loaded) {
                        try { Toast.show('Save data corrupted, starting new world', 2600); } catch {}
                        try { SaveSystem.clear(); } catch {}
                        mode = 'new';
                    }
                }
                resolve({ mode, save: loaded });
            };
            const onC = () => done('continue');
            const onN = () => done('new');
            const onX = () => done('new');
            overlay.classList.add('show');
            overlay.setAttribute('aria-hidden', 'false');
            btnC.addEventListener('click', onC);
            btnN.addEventListener('click', onN);
            if (btnX) btnX.addEventListener('click', onX);
        });
    }

    markTile(x, y, blockId) {
        this.diff.set(x + ',' + y, blockId);
    }

    importLoaded(save) {
        if (!save) return;
        this.seed = save.seed;
        if (save._diffMap) this.diff = new Map(save._diffMap);
    }

    applyToWorld(world, save) {
        if (!world || !save || !save._diffMap) return;
        for (const [k, id] of save._diffMap) {
            const [x, y] = k.split(',').map(n => parseInt(n, 10));
            if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < world.w && y >= 0 && y < world.h) {
                world.tiles[x][y] = id;
            }
        }
    }

    applyToPlayer(player, ui, save) {
        if (!player || !save || !save.player) return;
        const p = save.player;
        if (Number.isFinite(p.x)) player.x = p.x;
        if (Number.isFinite(p.y)) player.y = p.y;
        if (Number.isFinite(p.health)) player.health = p.health;
        if (Number.isFinite(p.mana)) player.mana = p.mana;
        if (Array.isArray(p.inventory) && p.inventory.length > 0) {
            player.inventory = p.inventory;
        }
        if (Number.isFinite(p.selectedSlot)) player.selectedSlot = p.selectedSlot;
        if (ui && ui.buildHotbar) ui.buildHotbar();
    }

    save(reason = 'auto') {
        if (this._disabled) return false;
        const game = this.game;
        if (!game || !game.world || !game.player) return false;

        try {
            const data = {
                v: 1,
                ts: Date.now(),
                seed: this.seed || game.seed,
                w: game.world.w,
                h: game.world.h,
                timeOfDay: game.timeOfDay || 0.35,
                player: {
                    x: game.player.x,
                    y: game.player.y,
                    health: game.player.health,
                    maxHealth: game.player.maxHealth,
                    mana: game.player.mana,
                    maxMana: game.player.maxMana,
                    inventory: game.player.inventory,
                    selectedSlot: game.player.selectedSlot
                },
                diffs: SaveSystem._encodeDiff(this.diff, game.world.w)
            };

            const serialized = JSON.stringify(data);
            localStorage.setItem(SaveSystem.KEY, serialized);
            try { Toast.show('Saved', 800); } catch {}
            return true;
        } catch (e) {
            console.error('[SaveSystem] Save error:', e);
            return false;
        }
    }

    tickAutosave(dtMs) {
        if (this._disabled) return;
        const interval = (this.game && this.game.settings && this.game.settings.autosaveMs) || 30000;
        this._autosaveAcc += dtMs;
        if (this._autosaveAcc >= interval) {
            this._autosaveAcc = 0;
            this.save('auto');
        }
    }
}

window.TU = window.TU || {};
Object.assign(window.TU, { SaveSystem });
window.SaveSystem = SaveSystem;
