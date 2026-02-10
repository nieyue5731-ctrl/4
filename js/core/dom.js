/**
 * @file dom.js - DOM utility helpers and UI element ID constants
 */
'use strict';

const DOM = {
    byId(id) { return document.getElementById(id); },
    show(el) { if (el) el.style.display = ''; },
    hide(el) { if (el) el.style.display = 'none'; }
};

const UI_IDS = Object.freeze({
    loading: 'loading',
    loadProgress: 'load-progress',
    loadStatus: 'load-status',
    fullscreenBtn: 'fullscreen-btn',
    game: 'game',
    minimap: 'minimap',
    minimapCanvas: 'minimap-canvas',
    hotbar: 'hotbar',
    fps: 'fps',
    timeIcon: 'time-icon',
    timeText: 'time-text',
    healthFill: 'health-fill',
    healthValue: 'health-value',
    manaFill: 'mana-fill',
    manaValue: 'mana-value',
    toastContainer: 'toast-container',
    miningBar: 'mining-bar',
    miningIcon: 'mining-icon',
    miningName: 'mining-name',
    miningPercent: 'mining-percent'
});

window.DOM = DOM;
window.UI_IDS = UI_IDS;
