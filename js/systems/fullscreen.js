/**
 * @file fullscreen.js - Fullscreen management
 */
'use strict';

class FullscreenManager {
    static supported() {
        const de = document.documentElement;
        return !!(de && de.requestFullscreen && document.exitFullscreen);
    }

    static async request() {
        if (!document.documentElement || !document.documentElement.requestFullscreen) return false;
        await document.documentElement.requestFullscreen();
        try {
            if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
        } catch {}
        return true;
    }

    static async exit() {
        if (!document.exitFullscreen) return false;
        await document.exitFullscreen();
        return true;
    }

    static _toast(msg, ms = 1000) {
        try {
            const toast = window.TU && window.TU.Toast;
            if (toast && typeof toast.show === 'function') { toast.show(msg, ms); return; }
        } catch {}
        console.log(msg);
    }

    static async toggle() {
        try {
            if (!FullscreenManager.supported()) { FullscreenManager._toast('Device does not support fullscreen', 1200); return; }
            if (document.fullscreenElement) {
                await FullscreenManager.exit();
                FullscreenManager._toast('Exited fullscreen', 900);
            } else {
                await FullscreenManager.request();
                FullscreenManager._toast('Entered fullscreen', 900);
            }
        } catch { FullscreenManager._toast('Fullscreen request failed', 1200); }
    }
}

window.TU = window.TU || {};
window.TU.FullscreenManager = FullscreenManager;
