/**
 * @file settings.js - Game settings management
 */
'use strict';

class GameSettings {
    static KEY = 'terraria_ultra_settings_v1';

    static defaults() {
        return {
            dprCap: 2,
            postFxMode: 1,
            joystickSize: 140,
            joystickDeadzone: 0.14,
            joystickCurve: 2.2,
            buttonSize: 70,
            sfxVolume: 0.5,
            autosaveMs: 30000,
            cameraSmooth: 0.08,
            lookAhead: 1.0,
            placeIntervalMs: 80,
            aimAssist: true,
            vibration: true,
            showFps: false,
            autoQuality: true,
            particles: true,
            ambient: true,
            bgMountains: true,
            minimap: true,
            reducedMotion: false
        };
    }

    static sanitize(s) {
        const d = GameSettings.defaults();
        if (!s || typeof s !== 'object') return d;
        const num = (v, min, max, fallback) => {
            const n = Number(v);
            if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, n));
        };
        s.dprCap = num(s.dprCap, 1, 2, d.dprCap);
        s.postFxMode = num(s.postFxMode, 0, 2, d.postFxMode);
        s.joystickSize = num(s.joystickSize, 110, 200, d.joystickSize);
        s.joystickDeadzone = num(s.joystickDeadzone, 0, 0.35, d.joystickDeadzone);
        s.joystickCurve = num(s.joystickCurve, 1, 4, d.joystickCurve);
        s.buttonSize = num(s.buttonSize, 52, 100, d.buttonSize);
        s.sfxVolume = num(s.sfxVolume, 0, 1, d.sfxVolume);
        s.autosaveMs = num(s.autosaveMs, 10000, 120000, d.autosaveMs);
        s.cameraSmooth = num(s.cameraSmooth, 0.03, 0.18, d.cameraSmooth);
        s.lookAhead = num(s.lookAhead, 0, 1.5, d.lookAhead);
        s.placeIntervalMs = num(s.placeIntervalMs, 40, 200, d.placeIntervalMs);
        s.aimAssist = !!s.aimAssist;
        s.vibration = !!s.vibration;
        s.showFps = !!s.showFps;
        s.autoQuality = (s.autoQuality === undefined) ? d.autoQuality : !!s.autoQuality;
        s.particles = !!s.particles;
        s.ambient = !!s.ambient;
        s.bgMountains = (s.bgMountains === undefined) ? d.bgMountains : !!s.bgMountains;
        s.minimap = !!s.minimap;
        s.reducedMotion = !!s.reducedMotion;
        return s;
    }

    static load() {
        try {
            const raw = localStorage.getItem(GameSettings.KEY);
            if (!raw || raw.length > 100 * 1024) return GameSettings.defaults();
            return GameSettings.sanitize(JSON.parse(raw));
        } catch (e) { return GameSettings.defaults(); }
    }

    static save(settings) {
        try {
            const serialized = JSON.stringify(GameSettings.sanitize(settings));
            if (serialized.length > 100 * 1024) return false;
            localStorage.setItem(GameSettings.KEY, serialized);
            return true;
        } catch (e) { return false; }
    }

    static applyToDocument(settings) {
        const s = GameSettings.sanitize(settings);
        const root = document.documentElement;
        const safeCSS = (value, unit = 'px') => {
            const num = Number(value);
            if (Number.isNaN(num) || !Number.isFinite(num)) return null;
            return Math.max(0, Math.min(10000, num)) + unit;
        };
        const joySize = safeCSS(s.joystickSize);
        if (joySize) root.style.setProperty('--joy-size', joySize);
        const btnSize = safeCSS(s.buttonSize);
        if (btnSize) root.style.setProperty('--btn-size', btnSize);
        root.classList.toggle('reduced-motion', !!s.reducedMotion);
        const minimap = document.getElementById('minimap');
        if (minimap) minimap.style.display = s.minimap ? '' : 'none';
        const ambient = document.getElementById('ambient-particles');
        if (ambient) ambient.style.display = s.ambient ? '' : 'none';
        const fpsEl = document.getElementById('fps');
        if (fpsEl) fpsEl.style.display = s.showFps ? '' : 'none';
        window.GAME_SETTINGS = s;
        return s;
    }
}

window.TU = window.TU || {};
Object.assign(window.TU, { GameSettings });
window.GameSettings = GameSettings;
