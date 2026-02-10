/**
 * @file perf-tracker.js - Unified performance monitor (replaces PERF_MONITOR + PerfMonitor duplicates)
 * @description Uses loop-based max instead of Math.max(...array) to prevent stack overflow
 */
'use strict';

const PerfMonitor = {
    _samples: [],
    _maxSamples: 60,
    _lastFrame: 0,
    _frameCount: 0,
    _maxFrameCount: 1000000,

    frame(timestamp) {
        if (!Number.isFinite(timestamp)) return;
        if (this._frameCount >= this._maxFrameCount) this.reset();
        this._frameCount++;
        if (this._lastFrame) {
            const delta = timestamp - this._lastFrame;
            if (delta > 0 && delta < 10000) {
                this._samples.push(delta);
                if (this._samples.length > this._maxSamples) this._samples.shift();
            }
        }
        this._lastFrame = timestamp;
    },

    reset() { this._samples = []; this._lastFrame = 0; this._frameCount = 0; },

    getAverageFPS() {
        if (!this._samples.length) return 60;
        const valid = this._samples.filter(s => s > 0 && s < 1000);
        if (!valid.length) return 60;
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        return Math.max(1, Math.min(999, Math.round(1000 / avg)));
    },

    getMinFPS() {
        if (!this._samples.length) return 60;
        const valid = this._samples.filter(s => s > 0 && s < 1000);
        if (!valid.length) return 60;
        // Loop-based max instead of Math.max(...array) to prevent stack overflow
        let maxVal = 0;
        for (let i = 0; i < valid.length; i++) {
            if (valid[i] > maxVal) maxVal = valid[i];
        }
        return Math.max(1, Math.min(999, Math.round(1000 / maxVal)));
    },

    getFrameTimeStats() {
        if (!this._samples.length) return { avg: '16.67', min: '16.67', max: '16.67' };
        const valid = this._samples.filter(s => s > 0 && s < 1000);
        if (!valid.length) return { avg: '16.67', min: '16.67', max: '16.67' };
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        let minVal = Infinity, maxVal = 0;
        for (let i = 0; i < valid.length; i++) {
            if (valid[i] < minVal) minVal = valid[i];
            if (valid[i] > maxVal) maxVal = valid[i];
        }
        return { avg: avg.toFixed(2), min: minVal.toFixed(2), max: maxVal.toFixed(2) };
    }
};

// PERF_MONITOR delegate (backwards compat)
window.PERF_MONITOR = {
    record(ft) { PerfMonitor.frame(performance.now()); },
    getAverageFPS() { return PerfMonitor.getAverageFPS(); }
};

window.PerfMonitor = PerfMonitor;
