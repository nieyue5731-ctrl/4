/**
 * @file object-pool.js - Object/Vec/Array pools with O(1) release
 * @description Consolidated pool implementations with tag-based double-release prevention
 */
'use strict';

const ObjectPool = {
    _pools: new Map(),
    _typeCount: 0,
    MAX_TYPES: 100,
    MAX_POOL_SIZE: 500,

    get(type, factory) {
        if (typeof type !== 'string' || type.length === 0) return factory();
        let pool = this._pools.get(type);
        if (!pool) {
            if (this._typeCount >= this.MAX_TYPES) return factory();
            pool = [];
            this._pools.set(type, pool);
            this._typeCount++;
        }
        return pool.length > 0 ? pool.pop() : factory();
    },

    release(type, obj) {
        if (!obj || typeof obj !== 'object' || typeof type !== 'string') return;
        let pool = this._pools.get(type);
        if (!pool) {
            if (this._typeCount >= this.MAX_TYPES) return;
            pool = [];
            this._pools.set(type, pool);
            this._typeCount++;
        }
        if (pool.length < this.MAX_POOL_SIZE) pool.push(obj);
    },

    clear(type) {
        if (type) {
            if (this._pools.has(type)) { this._pools.delete(type); this._typeCount = Math.max(0, this._typeCount - 1); }
        } else {
            this._pools.clear();
            this._typeCount = 0;
        }
    },

    getStats() {
        let totalObjects = 0;
        this._pools.forEach(pool => { totalObjects += pool.length; });
        return { typeCount: this._typeCount, totalObjects, maxTypes: this.MAX_TYPES, maxPoolSize: this.MAX_POOL_SIZE };
    }
};

// VecPool with O(1) tag-based duplicate detection (replaces O(n) includes check)
const VecPool = {
    _pool: [],
    _maxSize: 200,

    get(x = 0, y = 0) {
        const safeX = Number.isFinite(x) ? x : 0;
        const safeY = Number.isFinite(y) ? y : 0;
        if (this._pool.length > 0) {
            const v = this._pool.pop();
            if (v && typeof v === 'object') { v.x = safeX; v.y = safeY; v._pooled = false; return v; }
        }
        return { x: safeX, y: safeY, _pooled: false };
    },

    release(v) {
        if (!v || typeof v !== 'object' || v._pooled) return;
        if (this._pool.length < this._maxSize) { v.x = 0; v.y = 0; v._pooled = true; this._pool.push(v); }
    },

    clear() { this._pool = []; }
};

// ArrayPool with O(1) tag-based duplicate detection
const ArrayPool = {
    _pools: new Map(),
    _typeCount: 0,
    MAX_TYPES: 10,
    MAX_POOL_SIZE: 50,

    get(size = 0) {
        const safeSize = Number.isInteger(size) && size >= 0 ? size : 0;
        const key = safeSize <= 16 ? 16 : safeSize <= 64 ? 64 : safeSize <= 256 ? 256 : 1024;
        let pool = this._pools.get(key);
        if (!pool) {
            if (this._typeCount >= this.MAX_TYPES) return new Array(safeSize);
            pool = [];
            this._pools.set(key, pool);
            this._typeCount++;
        }
        if (pool.length > 0) {
            const arr = pool.pop();
            if (Array.isArray(arr)) { arr.length = 0; arr._pooled = false; return arr; }
        }
        return new Array(safeSize);
    },

    release(arr) {
        if (!Array.isArray(arr) || arr._pooled) return;
        const len = arr.length;
        const key = len <= 16 ? 16 : len <= 64 ? 64 : len <= 256 ? 256 : 1024;
        let pool = this._pools.get(key);
        if (!pool) {
            if (this._typeCount >= this.MAX_TYPES) return;
            pool = [];
            this._pools.set(key, pool);
            this._typeCount++;
        }
        if (pool.length < this.MAX_POOL_SIZE) { arr._pooled = true; arr.length = 0; pool.push(arr); }
    },

    clear() { this._pools.clear(); this._typeCount = 0; }
};

window.ObjectPool = ObjectPool;
window.VecPool = VecPool;
window.ArrayPool = ArrayPool;
