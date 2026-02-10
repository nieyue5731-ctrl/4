/**
 * @file ux-overlays.js - UX overlay wiring (pause, settings, help, save prompt)
 */
'use strict';

function applyInfoHintText(isMobile) {
    const el = document.getElementById('info');
    if (!el) return;
    if (isMobile) {
        el.innerHTML = '<span class="highlight">Joystick</span> Move | <span class="highlight">Buttons</span> Action | <span class="highlight">Tap</span> Target';
    }
}

function wireUXUI(game) {
    if (!game) return;

    const ux = {};
    ux.pauseOverlay = document.getElementById('pause-overlay');
    ux.settingsOverlay = document.getElementById('settings-overlay');
    ux.helpOverlay = document.getElementById('help-overlay');

    ux.showOverlay = (el) => { if (el) { el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); } };
    ux.hideOverlay = (el) => { if (el) { el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); } };

    ux.isPauseOpen = () => ux.pauseOverlay && ux.pauseOverlay.classList.contains('show');
    ux.isSettingsOpen = () => ux.settingsOverlay && ux.settingsOverlay.classList.contains('show');
    ux.isHelpOpen = () => ux.helpOverlay && ux.helpOverlay.classList.contains('show');

    ux.setPaused = (p) => {
        game.paused = !!p;
        if (p) ux.showOverlay(ux.pauseOverlay);
        else ux.hideOverlay(ux.pauseOverlay);
    };

    ux.toggleHelp = () => {
        if (ux.isHelpOpen()) ux.hideOverlay(ux.helpOverlay);
        else ux.showOverlay(ux.helpOverlay);
    };

    ux.closeSettings = () => {
        ux.hideOverlay(ux.settingsOverlay);
        if (game._settingsReturnToPause) { ux.showOverlay(ux.pauseOverlay); game._settingsReturnToPause = false; }
        else { game.paused = false; }
    };

    // Wire buttons
    const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

    wire('btn-pause', () => { game.audio && game.audio.play('ui'); ux.setPaused(!game.paused); });
    wire('pause-resume', () => { game.audio && game.audio.play('ui'); ux.setPaused(false); });
    wire('pause-save', () => { game.audio && game.audio.play('ui'); game.saveSystem && game.saveSystem.save('manual'); });
    wire('pause-fullscreen', () => { const fm = window.TU && window.TU.FullscreenManager; if (fm) fm.toggle(); });
    wire('pause-newworld', () => { SaveSystem.clear(); window.location.reload(); });
    wire('pause-close', () => ux.setPaused(false));

    wire('btn-settings', () => {
        game.audio && game.audio.play('ui');
        game._settingsReturnToPause = !!game.paused;
        if (typeof syncSettingsControls === 'function') syncSettingsControls(game.settings);
        game.paused = true;
        ux.hideOverlay(ux.pauseOverlay);
        ux.showOverlay(ux.settingsOverlay);
    });
    wire('settings-close', () => ux.closeSettings());
    wire('settings-apply', () => {
        if (typeof readSettingsControls === 'function') {
            const newSettings = readSettingsControls(game.settings);
            GameSettings.save(newSettings);
            game.settings = GameSettings.applyToDocument(newSettings);
        }
        ux.closeSettings();
    });
    wire('settings-reset', () => {
        const defaults = GameSettings.defaults();
        GameSettings.save(defaults);
        game.settings = GameSettings.applyToDocument(defaults);
        if (typeof syncSettingsControls === 'function') syncSettingsControls(defaults);
    });
    wire('settings-clear-save', () => { SaveSystem.clear(); Toast.show('Save data cleared', 1200); });

    wire('btn-save', () => { game.audio && game.audio.play('ui'); game.saveSystem && game.saveSystem.save('manual'); });
    wire('btn-help', () => { game.audio && game.audio.play('ui'); ux.toggleHelp(); });
    wire('help-ok', () => ux.hideOverlay(ux.helpOverlay));
    wire('help-dontshow', () => { try { localStorage.setItem('terraria_ultra_help_seen_v1', '1'); } catch {} ux.hideOverlay(ux.helpOverlay); });
    wire('help-close', () => ux.hideOverlay(ux.helpOverlay));

    wire('btn-inventory', () => { if (game.inventoryUI) game.inventoryUI.toggle(); });
    wire('btn-craft-toggle', () => { if (game.crafting) game.crafting.toggle(); });
    wire('btn-bag-toggle', () => { if (game.inventoryUI) game.inventoryUI.toggle(); });

    // Minimap toggle
    const mm = document.getElementById('minimap');
    if (mm) {
        mm.addEventListener('click', () => {
            mm.classList.toggle('minimap-collapsed');
            mm.classList.toggle('minimap-expanded');
        });
        window.TU.toggleMinimap = () => {
            mm.classList.toggle('minimap-collapsed');
            mm.classList.toggle('minimap-expanded');
        };
    }

    // Show help on first visit
    try {
        if (!localStorage.getItem('terraria_ultra_help_seen_v1') && ux.helpOverlay) {
            setTimeout(() => ux.showOverlay(ux.helpOverlay), 1500);
        }
    } catch {}

    game._ux = ux;
}

function syncSettingsControls(s) {
    if (!s) return;
    const $ = (id) => document.getElementById(id);
    const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
    const setSpan = (id, v) => { const el = $(id); if (el) el.textContent = v; };

    setVal('opt-dpr', s.dprCap);
    setVal('opt-particles', s.particles ? '1' : '0');
    setVal('opt-ambient', s.ambient ? '1' : '0');
    setVal('opt-bgmountains', s.bgMountains ? '1' : '0');
    setVal('opt-postfx', s.postFxMode);
    setVal('opt-minimap', s.minimap ? '1' : '0');
    setVal('opt-aimassist', s.aimAssist ? '1' : '0');
    setVal('opt-vibration', s.vibration ? '1' : '0');
    setVal('opt-autoquality', s.autoQuality ? '1' : '0');
    setVal('opt-showfps', s.showFps ? '1' : '0');
    setVal('opt-reduce-motion', s.reducedMotion ? '1' : '0');

    const setRange = (id, v, spanId) => {
        const el = $(id); if (el) el.value = v;
        setSpan(spanId, v);
    };
    setRange('opt-camsmooth', Math.round(s.cameraSmooth * 100), 'val-camsmooth');
    setRange('opt-lookahead', Math.round(s.lookAhead * 100), 'val-lookahead');
    setRange('opt-placeinterval', s.placeIntervalMs, 'val-placeinterval');
    setRange('opt-joy', s.joystickSize, 'val-joy');
    setRange('opt-btn', s.buttonSize, 'val-btn');
    setRange('opt-sfx', Math.round(s.sfxVolume * 100), 'val-sfx');
}

function readSettingsControls(base) {
    const $ = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

    return GameSettings.sanitize({
        ...base,
        dprCap: num($('opt-dpr'), base.dprCap),
        particles: $('opt-particles') === '1',
        ambient: $('opt-ambient') === '1',
        bgMountains: $('opt-bgmountains') === '1',
        postFxMode: num($('opt-postfx'), base.postFxMode),
        minimap: $('opt-minimap') === '1',
        aimAssist: $('opt-aimassist') === '1',
        vibration: $('opt-vibration') === '1',
        autoQuality: $('opt-autoquality') === '1',
        showFps: $('opt-showfps') === '1',
        cameraSmooth: num($('opt-camsmooth'), base.cameraSmooth * 100) / 100,
        lookAhead: num($('opt-lookahead'), base.lookAhead * 100) / 100,
        placeIntervalMs: num($('opt-placeinterval'), base.placeIntervalMs),
        joystickSize: num($('opt-joy'), base.joystickSize),
        buttonSize: num($('opt-btn'), base.buttonSize),
        sfxVolume: num($('opt-sfx'), base.sfxVolume * 100) / 100,
        reducedMotion: $('opt-reduce-motion') === '1',
    });
}

window.TU = window.TU || {};
Object.assign(window.TU, { applyInfoHintText, wireUXUI, syncSettingsControls, readSettingsControls });
window.applyInfoHintText = applyInfoHintText;
window.wireUXUI = wireUXUI;
window.syncSettingsControls = syncSettingsControls;
window.readSettingsControls = readSettingsControls;
