// Clarivo — stock-data-service.js
// Central historical stock data adapter.
//
// DATA SOURCES (set STOCK_DATA_SOURCE below):
//   'backend'      → FastAPI/yfinance at BACKEND_URL (start: uvicorn backend.app:app --port 8000)
//   'static-json'  → assets/data/SYM.json  (generate: python tools/generate-stock-data.py)
//   'php'          → PHP proxy at PHP_ENDPOINT
//   'alpha-vantage'→ Alpha Vantage TIME_SERIES_DAILY_ADJUSTED (25 req/day free key in config.js)
//
// For exam submission without a running backend, change STOCK_DATA_SOURCE to:
//   'static-json'  after generating JSON files with tools/generate-stock-data.py
//   'alpha-vantage' to use the API key from config.js directly

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────────────────────
    // Change this one line to switch data source for exam submission:
    var STOCK_DATA_SOURCE = 'twelve-data';      // 'twelve-data' | 'alpha-vantage' | 'backend' | 'static-json' | 'php'

    var BACKEND_URL      = 'http://localhost:8000';   // reference FastAPI backend
    var STATIC_JSON_PATH = 'assets/data/';            // e.g. assets/data/AAPL.json
    var PHP_ENDPOINT     = 'api/history.php';         // optional PHP proxy

    // ── Cache ──────────────────────────────────────────────────────────────────
    var _mem   = {};          // in-memory: { SYM: normalizedResult }
    var _stale = {};          // tracks which _mem entries came from expired cache
    var LS_PFX = 'clarivo_history_';
    var LS_TTL = 3600000;   // 1 hour

    // ── Alpha Vantage rate-limit queue ─────────────────────────────────────────
    // AV free tier: 5 req/min, 25 req/day.  Fire up to 5 in parallel per 61s window.
    var AV_BASE       = 'https://www.alphavantage.co/query';
    var _avQueue      = [];
    var _avPending    = {};
    var _avInFlight   = 0;
    var _avBatchStart = 0;
    var _avBatchCount = 0;
    var _avTimerSet   = false;
    var AV_CONCURRENT = 5;
    var AV_BATCH_WIN  = 61000;   // ms — slightly over AV's 60s window

    // ── Twelve Data rate-limit queue ───────────────────────────────────────────
    // Free tier: 800 credits/day, 8 req/min. Fire up to 8 in parallel per 61s window.
    var TD_BASE       = 'https://api.twelvedata.com';
    var _tdQueue      = [];
    var _tdPending    = {};
    var _tdInFlight   = 0;
    var _tdBatchStart = 0;
    var _tdBatchCount = 0;
    var _tdTimerSet   = false;
    var TD_CONCURRENT = 8;
    var TD_BATCH_WIN  = 61000;

    // ── Shared Twelve Data account-wide budget ──────────────────────────────────
    // Twelve Data's 8 req/min cap is per ACCOUNT, not per feature. History (this
    // file) and live quotes (api.js) both call Twelve Data with the same key, so
    // they must share one counter — otherwise each queue thinks it has its own
    // 8/min budget and together they fire up to 16, guaranteeing 429s on a fresh
    // page load. Loaded before api.js, so api.js reuses this same gate.
    window._clarivoTDGate = window._clarivoTDGate || {
        used: 0,
        windowStart: Date.now(),
        cooldownUntil: 0,
        cap: 8,
        win: 61000,
        canFire: function () {
            var now = Date.now();
            if (now < this.cooldownUntil) return false;
            if (now - this.windowStart > this.win) { this.used = 0; this.windowStart = now; }
            return this.used < this.cap;
        },
        markFired: function () { this.used++; },
        markRateLimited: function () {
            this.cooldownUntil = Date.now() + 60000;
            console.warn('[Clarivo TD] account-wide rate limit hit — pausing all new Twelve Data requests for 60s, using cache only');
        }
    };
    window._clarivoMarketApiGate = window._clarivoTDGate; // alias, same shared gate
    var _tdGate = window._clarivoTDGate;

    // ── Backend availability flag ──────────────────────────────────────────────
    // Once a backend request fails, skip subsequent ones to save time.
    var _backendFailed = false;

    // ── Migrate old AV localStorage keys ──────────────────────────────────────
    // Previous api.js stored [{date, close}] under 'clarivo_avhist_SYM'.
    // Migrate to new format so existing cached data is not thrown away.
    (function migrate() {
        try {
            Object.keys(localStorage).forEach(function (k) {
                if (k.indexOf('clarivo_avhist_') !== 0) return;
                var sym = k.slice('clarivo_avhist_'.length);
                if (localStorage.getItem(LS_PFX + sym)) return;   // new key already exists
                var raw = localStorage.getItem(k);
                if (!raw) return;
                var e = JSON.parse(raw);
                var rows = e.data;
                if (!Array.isArray(rows) || rows.length < 2) return;
                // Old rows: [{date, close}] — wrap in normalized structure
                var candles = rows.map(function (r) {
                    return { date: r.date, open: r.close, high: r.close, low: r.close, close: r.close, volume: 0 };
                });
                var result = { symbol: sym, company: { name: sym, ticker: sym }, period: '1y', interval: '1d', candles: candles, stats: null, prediction: null };
                localStorage.setItem(LS_PFX + sym, JSON.stringify({ ts: e.ts, data: result }));
            });
        } catch (_) {}
    }());

    // ── Normalize ──────────────────────────────────────────────────────────────
    // Accepts three raw formats and returns a unified normalized object.
    // Format A: Array  [{date, close}] or [{date, open, high, low, close, volume}]  (AV rows)
    // Format B: Object { data: [{date, open, high, low, close, volume}], ... }       (backend / static JSON)
    function normalize(sym, raw) {
        var candles = [];

        if (Array.isArray(raw)) {
            // Format A — already an array (from AV parse)
            candles = raw.map(function (r) {
                return {
                    date:   r.date   || '',
                    open:   isFinite(r.open)   ? r.open   : r.close,
                    high:   isFinite(r.high)   ? r.high   : r.close,
                    low:    isFinite(r.low)    ? r.low    : r.close,
                    close:  r.close  || 0,
                    volume: r.volume || 0
                };
            });
        } else if (raw && Array.isArray(raw.data)) {
            // Format B — backend / static-JSON / PHP
            candles = raw.data.map(function (r) {
                return {
                    date:   r.date   || '',
                    open:   r.open   || 0,
                    high:   r.high   || 0,
                    low:    r.low    || 0,
                    close:  r.close  || 0,
                    volume: r.volume || 0
                };
            });
        }

        // Validate: require non-empty date and positive close
        candles = candles.filter(function (c) {
            return c.date && !isNaN(c.close) && c.close > 0;
        });

        // Sort ascending by date string (ISO dates sort lexicographically)
        candles.sort(function (a, b) {
            return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        });

        // Remove duplicate dates (keep first)
        candles = candles.filter(function (c, i, arr) {
            return i === 0 || c.date !== arr[i - 1].date;
        });

        if (candles.length < 2) return null;

        return {
            symbol:     sym,
            company:    (raw && raw.company)    || { name: sym, ticker: sym },
            period:     (raw && raw.period)     || '1y',
            interval:   (raw && raw.interval)   || '1d',
            candles:    candles,
            stats:      (raw && raw.stats)      || null,
            prediction: (raw && raw.prediction) || null
        };
    }

    // ── localStorage helpers ───────────────────────────────────────────────────
    function lsGet(sym) {
        try {
            var raw = localStorage.getItem(LS_PFX + sym);
            if (!raw) return null;
            var e = JSON.parse(raw);
            return (Date.now() - e.ts < LS_TTL) ? e.data : null;
        } catch (_) { return null; }
    }

    function lsGetStale(sym) {
        try {
            var raw = localStorage.getItem(LS_PFX + sym);
            if (!raw) return null;
            return JSON.parse(raw).data || null;
        } catch (_) { return null; }
    }

    function lsSet(sym, result) {
        try {
            localStorage.setItem(LS_PFX + sym, JSON.stringify({ ts: Date.now(), data: result }));
        } catch (_) {}
    }

    // ── Tier 4 — absolute last resort (per teacher guidance) ───────────────────
    // Used ONLY when live Twelve Data AND Alpha Vantage AND every cache layer
    // have all failed for this symbol — see fallback-data.js. Never persisted
    // to localStorage (so a later page load always tries the real APIs again).
    function fallbackHistory(sym) {
        return (window.CLARIVO_FALLBACK && window.CLARIVO_FALLBACK.history[sym]) || null;
    }

    // ── Alpha Vantage — parse TIME_SERIES_DAILY_ADJUSTED ──────────────────────
    function avParse(json, sym) {
        var ts = json['Time Series (Daily)'];
        if (!ts) {
            var msg = json['Information'] || json['Note'] || json['Error Message'] || '';
            if (msg) console.warn('[Clarivo AV]', sym + ':', msg.slice(0, 160));
            return null;
        }
        var rows = Object.keys(ts).sort().map(function (d) {
            var v = parseFloat(ts[d]['5. adjusted close']);
            return isNaN(v) ? null : { date: d, close: v };
        }).filter(Boolean);
        return rows.length >= 2 ? rows : null;
    }

    // ── Alpha Vantage — concurrent batch queue ─────────────────────────────────
    function avDrain() {
        if (!_avQueue.length || _avInFlight >= AV_CONCURRENT) return;

        var now = Date.now();

        // Enforce 5/min: wait for the 61s window to reset when batch is full
        if (_avBatchCount >= AV_CONCURRENT) {
            var wait = AV_BATCH_WIN - (now - _avBatchStart);
            if (wait > 0) {
                if (!_avTimerSet) {
                    _avTimerSet = true;
                    setTimeout(function () { _avTimerSet = false; avDrain(); }, wait);
                }
                return;
            }
            _avBatchCount = 0;
            _avBatchStart = now;
        }
        if (!_avBatchCount) _avBatchStart = now;

        var sym = _avQueue.shift();
        var cbs = _avPending[sym] || [];
        delete _avPending[sym];

        // Served while queued (e.g. stale was already in _mem)?
        if (_mem[sym] && !_stale[sym]) {
            cbs.forEach(function (c) { c(null, _mem[sym]); });
            avDrain();
            return;
        }

        _avInFlight++;
        _avBatchCount++;

        // Single source of truth — see tdDrain() comment above.
        var key = (window.CLARIVO_CONFIG && window.CLARIVO_CONFIG.AV_KEY) || '';
        var url = AV_BASE + '?function=TIME_SERIES_DAILY_ADJUSTED'
                + '&symbol=' + encodeURIComponent(sym)
                + '&outputsize=full'
                + '&apikey=' + key;

        console.log('[Clarivo AV] Fetching', sym,
            '(batch slot ' + _avBatchCount + '/' + AV_CONCURRENT + ') ...');
        var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
        fetch(url, ctrl ? { signal: ctrl.signal } : {})
            .then(function (r) { if (timer) clearTimeout(timer); return r.json(); })
            .then(function (json) {
                var rows = avParse(json, sym);
                if (!rows) throw new Error('No series for ' + sym);
                var result = normalize(sym, rows);
                if (!result) throw new Error('Normalize failed for ' + sym);
                _mem[sym] = result; delete _stale[sym];
                lsSet(sym, result);
                var c = result.candles;
                console.log('[Clarivo StockData] symbol=' + sym + ' source=alpha-vantage candles=' + c.length
                    + ' first=' + c[0].date + ' last=' + c[c.length - 1].date
                    + ' first_close=' + c[0].close + ' last_close=' + c[c.length - 1].close);
                cbs.forEach(function (c2) { c2(null, result); });
            })
            .catch(function (err) {
                if (timer) clearTimeout(timer);
                console.error('[Clarivo AV] Error', sym + ':', err.message || err);
                var stale = lsGetStale(sym);
                if (stale && stale.candles && stale.candles.length >= 2) {
                    console.warn('[Clarivo StockData] symbol=' + sym + ' source=stale-cache (AV failed) candles=' + stale.candles.length);
                    _mem[sym] = stale; _stale[sym] = true;
                    cbs.forEach(function (c2) { c2(null, stale); });
                } else {
                    var fb = fallbackHistory(sym);
                    if (fb) {
                        console.warn('[Clarivo StockData] symbol=' + sym + ' source=fallback (TD + AV + cache all failed)');
                        _mem[sym] = fb;
                        cbs.forEach(function (c2) { c2(null, fb); });
                    } else {
                        cbs.forEach(function (c2) { c2(err, null); });
                    }
                }
            })
            .then(function () { _avInFlight--; avDrain(); });

        avDrain();   // fill remaining batch slots immediately
    }

    function avFetchInternal(sym, cb) {
        if (_avPending[sym]) { _avPending[sym].push(cb); return; }
        _avPending[sym] = [cb];
        _avQueue.push(sym);
        avDrain();
    }

    // ── Twelve Data — parse /time_series response ──────────────────────────────
    // Response: { status:"ok", values:[{datetime,open,high,low,close,volume},...] }
    // Values are newest-first — reverse to ascending before normalize().
    function tdParse(json, sym) {
        if (!json || json.status !== 'ok' || !Array.isArray(json.values)) {
            var msg = (json && (json.message || json.code || '')) || 'unknown error';
            if (msg) console.warn('[Clarivo TD]', sym + ':', String(msg).slice(0, 120));
            return null;
        }
        var rows = json.values.slice().reverse().map(function (v) {
            return {
                date:   (v.datetime || '').slice(0, 10),
                open:   parseFloat(v.open)     || 0,
                high:   parseFloat(v.high)     || 0,
                low:    parseFloat(v.low)      || 0,
                close:  parseFloat(v.close)    || 0,
                volume: parseInt(v.volume, 10) || 0
            };
        }).filter(function (r) { return r.date && r.close > 0; });
        return rows.length >= 2 ? rows : null;
    }

    // ── Twelve Data — concurrent batch queue ──────────────────────────────────
    function tdDrain() {
        if (!_tdQueue.length || _tdInFlight >= TD_CONCURRENT) return;
        var now = Date.now();
        if (_tdBatchCount >= TD_CONCURRENT) {
            var wait = TD_BATCH_WIN - (now - _tdBatchStart);
            if (wait > 0) {
                if (!_tdTimerSet) {
                    _tdTimerSet = true;
                    setTimeout(function () { _tdTimerSet = false; tdDrain(); }, wait);
                }
                return;
            }
            _tdBatchCount = 0; _tdBatchStart = now;
        }
        if (!_tdBatchCount) _tdBatchStart = now;

        // Respect the shared account-wide Twelve Data budget (shared with api.js's
        // live-quote queue). If the budget is used up or we're in a post-429
        // cooldown, fall straight to stale cache / AV fallback instead of firing
        // a request that's almost certain to 429 anyway.
        if (!_tdGate.canFire()) {
            var sym0 = _tdQueue[0];
            console.log('[Clarivo TD] shared rate budget unavailable for', sym0, '— using stale cache/fallback, not retrying yet');
            _tdQueue.shift();
            var cbs0 = _tdPending[sym0] || []; delete _tdPending[sym0];
            var stale0 = lsGetStale(sym0);
            if (stale0 && stale0.candles && stale0.candles.length >= 2) {
                _mem[sym0] = stale0; _stale[sym0] = true;
                cbs0.forEach(function (cb) { cb(null, stale0); });
            } else {
                avFetchInternal(sym0, function (e, r) { cbs0.forEach(function (cb) { cb(e, r); }); });
            }
            if (_tdQueue.length) setTimeout(tdDrain, 2000);
            return;
        }

        var sym = _tdQueue.shift();
        var cbs = _tdPending[sym] || []; delete _tdPending[sym];

        if (_mem[sym] && !_stale[sym]) {
            cbs.forEach(function (c) { c(null, _mem[sym]); }); tdDrain(); return;
        }

        _tdInFlight++; _tdBatchCount++;
        _tdGate.markFired();
        // Single source of truth: api.js merges config.js/config.example.js with
        // its built-in defaults and republishes the result on window.CLARIVO_CONFIG,
        // so this file never needs its own copy of the key.
        var tdKey = (window.CLARIVO_CONFIG && window.CLARIVO_CONFIG.TD_KEY) || '';
        var url   = TD_BASE + '/time_series?symbol=' + encodeURIComponent(sym)
                  + '&interval=1day&outputsize=252&apikey=' + tdKey;

        console.log('[Clarivo TD] Fetching', sym, '(slot ' + _tdBatchCount + '/' + TD_CONCURRENT + ')');
        var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
        fetch(url, ctrl ? { signal: ctrl.signal } : {})
            .then(function (r) { if (timer) clearTimeout(timer); return r.json(); })
            .then(function (json) {
                if (json && (json.code === 429 || /run out of api credits/i.test(json.message || ''))) {
                    _tdGate.markRateLimited();
                }
                var rows = tdParse(json, sym);
                if (!rows) throw new Error('No series for ' + sym);
                var result = normalize(sym, rows);
                if (!result) throw new Error('Normalize failed for ' + sym);
                _mem[sym] = result; delete _stale[sym];
                lsSet(sym, result);
                var c = result.candles;
                console.log('[Clarivo StockData] symbol=' + sym + ' source=twelve-data candles=' + c.length
                    + ' first=' + c[0].date + ' last=' + c[c.length - 1].date
                    + ' last_close=' + c[c.length - 1].close);
                cbs.forEach(function (cb) { cb(null, result); });
            })
            .catch(function (err) {
                if (timer) clearTimeout(timer);
                console.error('[Clarivo TD] Error', sym + ':', err.message || err);
                var stale = lsGetStale(sym);
                if (stale && stale.candles && stale.candles.length >= 2) {
                    console.warn('[Clarivo StockData] symbol=' + sym + ' source=stale-cache (TD failed)');
                    _mem[sym] = stale; _stale[sym] = true;
                    cbs.forEach(function (cb) { cb(null, stale); });
                } else {
                    console.warn('[Clarivo TD] Falling back to AV for', sym);
                    avFetchInternal(sym, function (e, r) { cbs.forEach(function (cb) { cb(e, r); }); });
                }
            })
            .then(function () { _tdInFlight--; tdDrain(); });

        tdDrain();
    }

    function tdFetchInternal(sym, cb) {
        if (_tdPending[sym]) { _tdPending[sym].push(cb); return; }
        _tdPending[sym] = [cb];
        _tdQueue.push(sym);
        tdDrain();
    }

    // ── Network fetch ──────────────────────────────────────────────────────────
    function netFetch(sym, cb) {
        if (STOCK_DATA_SOURCE === 'twelve-data')  { tdFetchInternal(sym, cb); return; }
        if (STOCK_DATA_SOURCE === 'alpha-vantage' || _backendFailed) {
            avFetchInternal(sym, cb);
            return;
        }

        var url;
        if (STOCK_DATA_SOURCE === 'backend') {
            url = BACKEND_URL + '/api/history?ticker=' + encodeURIComponent(sym) + '&period=1y&interval=1d&predict=false';
        } else if (STOCK_DATA_SOURCE === 'php') {
            url = PHP_ENDPOINT + '?ticker=' + encodeURIComponent(sym) + '&period=1y&interval=1d';
        } else {
            url = STATIC_JSON_PATH + sym + '.json';
        }

        console.log('[Clarivo StockData] Fetching ' + sym + ' via ' + STOCK_DATA_SOURCE + ': ' + url);
        var ctrl    = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer   = ctrl ? setTimeout(function () { ctrl.abort(); }, 3000) : null;
        var opts    = ctrl ? { signal: ctrl.signal } : {};
        fetch(url, opts)
            .then(function (r) {
                if (timer) clearTimeout(timer);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (raw) {
                var result = normalize(sym, raw);
                if (!result) throw new Error('Normalize failed for ' + sym);
                _mem[sym] = result; delete _stale[sym];
                lsSet(sym, result);
                var c = result.candles;
                console.log('[Clarivo StockData] symbol=' + sym + ' source=' + STOCK_DATA_SOURCE
                    + ' candles=' + c.length + ' first=' + c[0].date + ' last=' + c[c.length - 1].date
                    + ' first_close=' + c[0].close + ' last_close=' + c[c.length - 1].close);
                cb(null, result);
            })
            .catch(function (err) {
                if (timer) clearTimeout(timer);
                // Backend / static / PHP failed — fall back to Alpha Vantage
                if (STOCK_DATA_SOURCE === 'backend') _backendFailed = true;
                console.warn('[Clarivo StockData] ' + STOCK_DATA_SOURCE + ' failed for ' + sym
                    + ' (' + (err.message || err) + '), falling back to alpha-vantage');
                avFetchInternal(sym, cb);
            });
    }

    // ── Cache-only peek — never triggers a network call ───────────────────────
    // Used for stocks the user does not own: their mini chart may render from
    // whatever is already cached, but must never cause a fresh API request.
    function peekCache(sym) {
        sym = sym.toUpperCase();
        if (_mem[sym]) return _mem[sym];
        var fresh = lsGet(sym);
        if (fresh) { _mem[sym] = fresh; return fresh; }
        var stale = lsGetStale(sym);
        if (stale && stale.candles && stale.candles.length >= 2) { _mem[sym] = stale; _stale[sym] = true; return stale; }
        return null;
    }

    // ── Pending coalesce for non-AV sources ───────────────────────────────────
    var _netPending = {};

    // ── Main entry point ───────────────────────────────────────────────────────
    function fetchSym(sym, cb) {
        sym = sym.toUpperCase();

        // 1. Fresh memory
        if (_mem[sym] && !_stale[sym]) {
            var c0 = _mem[sym].candles;
            console.log('[Clarivo StockData] symbol=' + sym + ' source=memory candles=' + c0.length);
            cb(null, _mem[sym]);
            return;
        }

        // 2. Fresh localStorage (within 12h TTL)
        var cached = lsGet(sym);
        if (cached) {
            _mem[sym] = cached; delete _stale[sym];
            var c1 = cached.candles;
            console.log('[Clarivo StockData] symbol=' + sym + ' source=localStorage candles=' + c1.length
                + ' first=' + c1[0].date + ' last=' + c1[c1.length - 1].date);
            cb(null, cached);
            return;
        }

        // 3. Stale localStorage — render immediately; queue background refresh
        var staleData = lsGetStale(sym);
        if (staleData && staleData.candles && staleData.candles.length >= 2) {
            _mem[sym] = staleData; _stale[sym] = true;
            var c2 = staleData.candles;
            console.log('[Clarivo StockData] symbol=' + sym + ' source=stale-cache candles=' + c2.length
                + ' first=' + c2[0].date + ' queuing background refresh');
            cb(null, staleData);

            // Silent background refresh — updates _mem and localStorage when done
            var bgCb = function (e, r) { if (!e && r) { _mem[sym] = r; delete _stale[sym]; } };
            if (STOCK_DATA_SOURCE === 'alpha-vantage') {
                if (!_avPending[sym]) { _avPending[sym] = [bgCb]; _avQueue.push(sym); avDrain(); }
            } else if (STOCK_DATA_SOURCE === 'twelve-data') {
                if (!_tdPending[sym]) { _tdPending[sym] = [bgCb]; _tdQueue.push(sym); tdDrain(); }
            } else if (!_netPending[sym]) {
                _netPending[sym] = [bgCb];
                netFetch(sym, function (e, r) {
                    var cbs2 = _netPending[sym] || []; delete _netPending[sym];
                    cbs2.forEach(function (c3) { c3(e, r); });
                });
            }
            return;
        }

        // 4. No cache — network fetch with coalescing
        if (STOCK_DATA_SOURCE === 'alpha-vantage') { avFetchInternal(sym, cb); return; }
        if (STOCK_DATA_SOURCE === 'twelve-data')   { tdFetchInternal(sym, cb); return; }
        if (_netPending[sym]) { _netPending[sym].push(cb); return; }
        _netPending[sym] = [cb];
        netFetch(sym, function (e, r) {
            var cbs3 = _netPending[sym] || []; delete _netPending[sym];
            cbs3.forEach(function (c4) { c4(e, r); });
        });
    }

    // ── Slice helpers ──────────────────────────────────────────────────────────
    // MINI = last 30 trading days (for sparklines)
    function sliceCandles(candles, period) {
        var n = candles.length;
        var take = { 'MINI': 30, '1D': 2, '1W': 5, '1M': 22, '3M': 66, '1Y': 252, 'ALL': n }[period] || 30;
        return candles.slice(Math.max(0, n - take));
    }

    function closes(candles) { return candles.map(function (c) { return c.close; }); }
    function labels(candles) { return candles.map(function (c) { return c.date;  }); }

    // ── Public API ─────────────────────────────────────────────────────────────
    window.StockDataService = {
        // fetch(sym, cb) — cb(null, { symbol, company, period, interval, candles, stats, prediction })
        //                    or cb(err, null) if all sources failed and no cache available
        fetch:  fetchSym,

        // peek(sym) — returns cached result (fresh or stale) or null. Never calls the network.
        peek:   peekCache,

        // slice(candles, period) — returns last N candles for named period
        // period: 'MINI'(30) | '1D'(2) | '1W'(5) | '1M'(22) | '3M'(66) | '1Y'(252) | 'ALL'
        slice:  sliceCandles,

        // closes(candles) — extracts close prices as plain number[]
        closes: closes,

        // labels(candles) — extracts date strings as string[]
        labels: labels,

        // Source management
        getSource: function ()    { return STOCK_DATA_SOURCE; },
        setSource: function (src) {
            STOCK_DATA_SOURCE = src;
            _backendFailed    = false;
            _mem = {}; _stale = {};
            _tdQueue = []; _tdPending = {}; _tdInFlight = 0; _tdBatchCount = 0;
            console.log('[Clarivo StockData] Source switched to:', src);
        },

        // Cache control
        clearCache: function (sym) {
            if (sym) {
                sym = sym.toUpperCase();
                delete _mem[sym]; delete _stale[sym];
                localStorage.removeItem(LS_PFX + sym);
            } else {
                _mem = {}; _stale = {};
                Object.keys(localStorage).forEach(function (k) {
                    if (k.indexOf(LS_PFX) === 0) localStorage.removeItem(k);
                });
            }
        }
    };

}());
