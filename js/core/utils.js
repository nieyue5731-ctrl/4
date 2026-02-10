/**
 * @file utils.js - Unified utility functions (single source of truth)
 * @description Replaces all duplicate clamp/lerp/safeGet/SafeAccess implementations
 */
'use strict';

const Utils = {
    clamp(v, min, max) {
        return v < min ? min : v > max ? max : v;
    },

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            ('ontouchstart' in window && navigator.maxTouchPoints > 1);
    },

    nightFactor(time) {
        if (time < 0.22 || time > 0.78) return 1;
        if (time < 0.3) return 1 - (time - 0.22) / 0.08;
        if (time > 0.7) return (time - 0.7) / 0.08;
        return 0;
    },

    lerpColor(c1, c2, t) {
        const h2r = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const [r1, g1, b1] = h2r(c1);
        const [r2, g2, b2] = h2r(c2);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    },

    hexToRgb(hex) {
        if (typeof hex !== 'string' || hex.length < 4) return { r: 240, g: 15, b: 0 };
        const n = parseInt(hex.slice(1), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
};

// Unified safe access functions (replaces 3-5 duplicate implementations)
window.safeGet = function(arr, index, defaultValue) {
    if (!arr || index < 0 || index >= arr.length) return defaultValue;
    return arr[index];
};

window.safeGetProp = function(obj, prop, defaultValue) {
    if (!obj || typeof obj !== 'object') return defaultValue;
    return obj[prop] !== undefined ? obj[prop] : defaultValue;
};

window.safeJSONParse = function(str, defaultValue) {
    try { return JSON.parse(str); } catch (e) { return defaultValue; }
};

window.clamp = Utils.clamp;
window.lerp = Utils.lerp;
window.Utils = Utils;
