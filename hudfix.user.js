// ==UserScript==
// @name         Aries Mod - Fix HUD Hidden
// @namespace    https://github.com/romann/aries-mod
// @version      1.0.1
// @description  Forces the Aries mod HUD to be visible (fix for users who can't trigger the keyboard shortcut)
// @author       Romann
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    try {
        const raw = localStorage.getItem('aries_mod');
        if (!raw) {
            console.warn('[Aries Fix] "aries_mod" key not found in localStorage.');
            return;
        }

        const config = JSON.parse(raw);
        config.hud = config.hud || {};

        if (config.hud.hidden === false) {
            console.log('[Aries Fix] HUD is already visible, nothing to do.');
            return;
        }

        config.hud.hidden = false;
        localStorage.setItem('aries_mod', JSON.stringify(config));
        console.log('[Aries Fix] HUD set to visible ✔ — reloading...');
        location.reload();
    } catch (e) {
        console.error('[Aries Fix] Error:', e);
    }
})();
