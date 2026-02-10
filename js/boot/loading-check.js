'use strict';
/**
 * @file loading-check.js - Loading screen timeout detection
 */
(function() {
    const LOADING_CHECK_INTERVAL = 12000;
    const checkLoading = () => {
        const loadingEl = document.getElementById('loading');
        if (!loadingEl || loadingEl.style.display === 'none') return;
        if (loadingEl.style.opacity === '0') return;
        console.error('[Loading] Timeout or stuck detected');
        const statusEl = document.getElementById('load-status');
        if (statusEl) statusEl.textContent = 'Loading issue detected, please refresh';
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Retry';
        retryBtn.style.cssText = 'margin-top: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;';
        retryBtn.onclick = () => window.location.reload();
        const content = document.querySelector('.loading-content');
        if (content && !document.getElementById('loading-retry-btn')) {
            retryBtn.id = 'loading-retry-btn';
            content.appendChild(retryBtn);
        }
    };
    setTimeout(checkLoading, LOADING_CHECK_INTERVAL);
})();
