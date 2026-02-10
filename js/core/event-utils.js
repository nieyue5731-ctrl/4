/**
 * @file event-utils.js - Event management and throttling utilities
 * @description Unified EventManager and EventUtils
 */
'use strict';

class EventManager {
    constructor() {
        this.listeners = [];
        this._destroyed = false;
    }
    add(target, event, handler, options) {
        if (this._destroyed) return;
        target.addEventListener(event, handler, options);
        this.listeners.push({ target, event, handler, options });
    }
    removeAll() {
        for (const { target, event, handler } of this.listeners) {
            try { target.removeEventListener(event, handler); } catch (e) { /* safe */ }
        }
        this.listeners = [];
    }
    destroy() {
        this.removeAll();
        this._destroyed = true;
    }
}

const EventUtils = {
    throttle(fn, delay) {
        let last = 0;
        let timer = null;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) {
                last = now;
                fn.apply(this, args);
            } else if (!timer) {
                timer = setTimeout(() => {
                    timer = null;
                    last = Date.now();
                    fn.apply(this, args);
                }, delay - (now - last));
            }
        };
    },

    debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    rafThrottle(fn) {
        if (typeof fn !== 'function') return () => {};
        let scheduled = false;
        let lastArgs = null;
        return function(...args) {
            lastArgs = args;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    try { fn.apply(this, lastArgs); } catch (e) { console.error('[EventUtils.rafThrottle]', e); }
                    lastArgs = null;
                });
            }
        };
    }
};

window.TU = window.TU || {};
Object.assign(window.TU, { EventManager });
window.EventUtils = EventUtils;
