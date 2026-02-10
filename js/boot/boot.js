'use strict';
/**
 * @file boot.js - Application bootstrap
 * @description Initializes the game on window.load
 */
window.addEventListener('load', () => {
    const report = (err, ctx) => {
        try { console.error('[Boot]', err, ctx); } catch {}
    };

    try {
        const game = new Game();
        window.__GAME_INSTANCE__ = game;
        window.game = game;

        const p = game.init();
        if (p && typeof p.catch === 'function') {
            p.catch((e) => report(e, { phase: 'init' }));
        }
    } catch (e) {
        report(e, { phase: 'boot' });
    }
});

// Page cleanup
window.addEventListener('beforeunload', function() {
    if (window.TU && window.TU._worldWorkerClient && window.TU._worldWorkerClient.worker) {
        try { window.TU._worldWorkerClient.worker.terminate(); } catch {}
    }
});

// Health check (30s interval)
setInterval(function() {
    const game = window.__GAME_INSTANCE__ || window.game;
    if (game && game.player && game.world) {
        const px = game.player.x, py = game.player.y;
        if (typeof px !== 'number' || typeof py !== 'number' || isNaN(px) || isNaN(py)) {
            console.error('[HealthCheck] Invalid player position, resetting');
            game.player.x = game.world.w * 16 / 2;
            game.player.y = game.world.h * 16 / 2;
        }
    }
}, 30000);
