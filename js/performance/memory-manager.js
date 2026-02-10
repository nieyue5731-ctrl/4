/**
 * @file memory-manager.js - Memory cleanup on high-water-mark / visibility change
 * @description Consolidated from MemoryManager + TextureCache
 */
'use strict';

const MemoryManager = {
    _lastCleanup: 0,
    _cleanupInterval: 30000,
    _cleanupCount: 0,
    _maxCleanups: 10000,

    tick(now) {
        if (!Number.isFinite(now) || this._cleanupCount >= this._maxCleanups) return;
        if (now - this._lastCleanup > this._cleanupInterval) {
            this._lastCleanup = now;
            this._cleanupCount++;
            this.cleanup();
        }
    },

    cleanup() {
        try {
            if (window.ObjectPool && window.ObjectPool._pools) {
                window.ObjectPool._pools.forEach((pool) => {
                    if (Array.isArray(pool) && pool.length > 100) pool.length = 100;
                });
            }
            if (window.VecPool && Array.isArray(window.VecPool._pool) && window.VecPool._pool.length > 100) {
                window.VecPool._pool.length = 100;
            }
            if (window.ArrayPool && window.ArrayPool._pools) {
                window.ArrayPool._pools.forEach((pool) => {
                    if (Array.isArray(pool) && pool.length > 20) pool.length = 20;
                });
            }
        } catch (e) { console.error('[MemoryManager] Cleanup error:', e); }
    },

    reset() { this._cleanupCount = 0; this._lastCleanup = 0; }
};

// TextureCache: O(1) LRU using Map iteration order
const TextureCache = {
    _cache: new Map(),
    _maxSize: 200,
    _hitCount: 0,
    _missCount: 0,

    get(key) {
        if (key === undefined || key === null) return null;
        const val = this._cache.get(key);
        if (val !== undefined) {
            this._hitCount++;
            this._cache.delete(key);
            this._cache.set(key, val);
            return val;
        }
        this._missCount++;
        return null;
    },

    set(key, value) {
        if (key === undefined || key === null) return;
        if (this._cache.has(key)) {
            this._cache.delete(key);
            this._cache.set(key, value);
            return;
        }
        while (this._cache.size >= this._maxSize) {
            const oldest = this._cache.keys().next().value;
            this._cache.delete(oldest);
        }
        this._cache.set(key, value);
    },

    clear() { this._cache.clear(); this._hitCount = 0; this._missCount = 0; }
};

window.MemoryManager = MemoryManager;
window.TextureCache = TextureCache;
