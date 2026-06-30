// Clarivo — holdings.js
// Single source of truth for the user's simulated stock holdings.
// Holdings live only in localStorage — no backend, no fake demo data.

(function () {
    'use strict';

    var LS_KEY       = 'clarivo_holdings';
    var ACTIVITY_KEY = 'clarivo_activity';
    var ACTIVITY_MAX = 10;
    var SYMBOLS = ['AAPL', 'TSLA', 'AMZN'];

    function defaults() {
        return { AAPL: 0, TSLA: 0, AMZN: 0 };
    }

    // Small predefined demo setup so the chart/holdings aren't empty on first
    // launch. Share counts only — no fake prices, no fake chart data.
    function seedDefaultHoldings() {
        return { AAPL: 2, TSLA: 1, AMZN: 1 };
    }

    function getHoldings() {
        try {
            var raw = localStorage.getItem(LS_KEY);

            // Key truly missing (never created before) — seed once and persist
            // immediately, so every later call (including this same check)
            // sees the key as already existing and never reseeds. Selling
            // everything back to 0 writes a real "{AAPL:0,...}" string, which
            // is not null, so it is never mistaken for "missing" again.
            if (raw === null) {
                var seeded = setHoldings(seedDefaultHoldings());
                console.log('[Clarivo Holdings] no holdings found — seeded initial demo portfolio (one-time)', seeded);
                return seeded;
            }

            var h = JSON.parse(raw) || {};
            var out = defaults();
            SYMBOLS.forEach(function (sym) {
                var n = Number(h[sym]);
                out[sym] = (isFinite(n) && n > 0) ? Math.floor(n) : 0;
            });
            return out;
        } catch (_) {
            return defaults();
        }
    }

    function setHoldings(h) {
        try {
            var safe = defaults();
            SYMBOLS.forEach(function (sym) {
                var n = Number(h && h[sym]);
                safe[sym] = (isFinite(n) && n > 0) ? Math.floor(n) : 0;
            });
            localStorage.setItem(LS_KEY, JSON.stringify(safe));
            return safe;
        } catch (_) {
            return getHoldings();
        }
    }

    function getShares(sym) {
        var h = getHoldings();
        return h[(sym || '').toUpperCase()] || 0;
    }

    // ── Recent activity (real Buy/Sell log only — no fake demo entries) ──
    function getActivity() {
        try {
            var raw = localStorage.getItem(ACTIVITY_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (_) {
            return [];
        }
    }

    function pushActivity(type, sym) {
        try {
            var list = getActivity();
            list.unshift({ type: type, sym: sym, ts: Date.now() });
            list = list.slice(0, ACTIVITY_MAX);
            localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list));
        } catch (_) {}
    }

    function buyShare(sym) {
        sym = (sym || '').toUpperCase();
        var h = getHoldings();
        h[sym] = (h[sym] || 0) + 1;
        setHoldings(h);
        pushActivity('buy', sym);
        console.log('[Clarivo Holdings] bought 1 share of', sym, '-> total', h[sym]);
        return h[sym];
    }

    function sellShare(sym) {
        sym = (sym || '').toUpperCase();
        var h = getHoldings();
        if (!h[sym] || h[sym] <= 0) {
            console.log('[Clarivo Holdings] sell blocked — 0 shares of', sym);
            return 0;
        }
        h[sym] = h[sym] - 1;
        setHoldings(h);
        pushActivity('sell', sym);
        console.log('[Clarivo Holdings] sold 1 share of', sym, '-> total', h[sym]);
        return h[sym];
    }

    console.log('[Clarivo Holdings] loaded from LocalStorage', getHoldings());

    window.ClarivoHoldings = {
        SYMBOLS:    SYMBOLS,
        getHoldings: getHoldings,
        setHoldings: setHoldings,
        getShares:   getShares,
        buyShare:    buyShare,
        sellShare:   sellShare,
        getActivity: getActivity
    };

}());
