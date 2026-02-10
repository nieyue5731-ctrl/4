/**
 * @file defensive.js - Streamlined defensive infrastructure
 * @description Error handling, type guards, safe math (consolidated from TU_Defensive)
 */
'use strict';

(function(global) {
    // Error counting & circuit breaker
    global.__TU_ERROR_COUNT__ = 0;
    global.__TU_MAX_ERRORS__ = 100;
    global.__TU_FATAL_ERROR__ = false;

    global.onerror = function(msg, url, line, col, error) {
        global.__TU_ERROR_COUNT__++;
        console.error('[Global Error #' + global.__TU_ERROR_COUNT__ + ']', { msg, url, line, col, error });
        if (global.__TU_ERROR_COUNT__ > global.__TU_MAX_ERRORS__) {
            global.__TU_FATAL_ERROR__ = true;
            console.error('[CRITICAL] Error count exceeded threshold');
            if (global.game && typeof global.game.pause === 'function') {
                global.game.pause();
            }
        }
        return false;
    };

    global.addEventListener('unhandledrejection', function(event) {
        global.__TU_ERROR_COUNT__++;
        console.error('[Unhandled Rejection #' + global.__TU_ERROR_COUNT__ + ']', event.reason);
        event.preventDefault();
    });

    // Type Guards
    const TypeGuards = {
        isValidNumber(val) { return typeof val === 'number' && !isNaN(val) && isFinite(val); },
        isValidInteger(val) { return Number.isInteger(val); },
        isValidString(val, maxLength = 10000) { return typeof val === 'string' && val.length <= maxLength; },
        isValidArray(val) { return Array.isArray(val); },
        isValidFunction(val) { return typeof val === 'function'; },
        isValidObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); },
        isValidCoordinate(x, y, w, h) {
            return Number.isInteger(x) && Number.isInteger(y) &&
                   Number.isInteger(w) && Number.isInteger(h) &&
                   x >= 0 && x < w && y >= 0 && y < h;
        }
    };

    // Safe Math
    const SafeMath = {
        clamp(val, min, max) {
            if (!TypeGuards.isValidNumber(val)) return min;
            return val < min ? min : val > max ? max : val;
        },
        clampInt(val, min, max) {
            if (!TypeGuards.isValidInteger(val)) return min;
            return val < min ? min : val > max ? max : val;
        },
        toIndex(x, y, width) { return y * width + x; },
        toInt32(val) {
            const n = Number(val);
            return Number.isFinite(n) ? n | 0 : 0;
        }
    };

    // Input Validation
    const InputValidator = {
        sanitizeString(str) {
            if (!TypeGuards.isValidString(str)) return '';
            return str.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
        },
        sanitizeNumber(num, defaultVal = 0) {
            if (!TypeGuards.isValidNumber(num)) return defaultVal;
            return num;
        }
    };

    // Safe world access
    const SafeAccess = {
        getTile(world, x, y) {
            if (!world || !world.tiles) return 0;
            x = x | 0; y = y | 0;
            if (x < 0 || x >= world.w || y < 0 || y >= world.h) return 0;
            const col = world.tiles[x];
            return col ? (col[y] | 0) : 0;
        },
        getLight(world, x, y) {
            if (!world || !world.light) return 0;
            x = x | 0; y = y | 0;
            if (x < 0 || x >= world.w || y < 0 || y >= world.h) return 0;
            const col = world.light[x];
            return col ? (col[y] | 0) : 0;
        },
        setTile(world, x, y, val) {
            if (!world || !world.tiles) return false;
            x = x | 0; y = y | 0;
            if (x < 0 || x >= world.w || y < 0 || y >= world.h) return false;
            const col = world.tiles[x];
            if (!col) return false;
            col[y] = val | 0;
            return true;
        }
    };

    // Export to TU_Defensive namespace and window.TU
    const TU_Defensive = { TypeGuards, SafeMath, InputValidator, SafeAccess };
    global.TU_Defensive = TU_Defensive;
    global.TU_SAFE = TU_Defensive;

    global.TU = global.TU || {};
    Object.assign(global.TU, { TypeGuards, SafeMath, InputValidator, SafeAccess });
})(window);
