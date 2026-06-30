// Clarivo — api.js
// Live quotes & historical charts: Twelve Data only | News: NewsAPI / Marketaux
// Finnhub is no longer used anywhere in this project.
console.log('[Clarivo] Web build version: final-hosting-fix-2026-06-29');
(function () {
    'use strict';

    var _defaults = {
        AV_KEY:      'K5DXU7FSAF10A7GH',
        TD_KEY:      '4de42b6c86634df08c4082e774e43686',
        MX_KEY:      'm9oEfV3SlFmetmID2aPD1cc0DcFE95aUvV37YQFh',
        NA_KEY:      'b79110e0372a45f792d34b04f15c7167'
    };

    function isPlaceholderKey(k) {
        return !k || /^YOUR_/i.test(String(k));
    }
    function mergeConfig(raw) {
        raw = raw || {};
        var out = {};
        Object.keys(_defaults).forEach(function (key) {
            out[key] = isPlaceholderKey(raw[key]) ? _defaults[key] : raw[key];
        });
        return out;
    }

    var cfg = mergeConfig(window.CLARIVO_CONFIG);
    // Single source of truth for every API key in this project: other files
    // (stock-data-service.js) read the same merged object instead of holding
    // their own hardcoded copy of any key.
    window.CLARIVO_CONFIG = cfg;
    console.log('[Clarivo] config.js loaded:', !!window.CLARIVO_CONFIG, '| Chart.js loaded:', typeof Chart !== 'undefined');

    // ── Unified chart trend — single source for line color AND adjacent ↑/↓ text ──
    // Rule: read the final segment of the exact array drawn on the chart
    // (second-to-last → last). Rising right edge → green; falling → red.
    // Sparklines, main Chart.js charts, and all trend badges use this same rule.

    var CHART_LINE_TENSION = 0;

    function cleanTrendValues(values) {
        return (values || []).map(function (v) { return Number(v); })
            .filter(function (v) { return Number.isFinite(v); });
    }

    function trendFromPair(start, end) {
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            return { direction: 'neutral', percent: 0, color: 'neutral', arrow: '', positive: null };
        }
        if (Math.abs(start) < 1e-9) {
            return { direction: 'neutral', percent: 0, color: 'neutral', arrow: '', positive: null };
        }
        var percent = ((end - start) / Math.abs(start)) * 100;
        if (percent > 0) {
            return { direction: 'up', percent: percent, color: 'positive', arrow: '↑', positive: true };
        }
        if (percent < 0) {
            return { direction: 'down', percent: percent, color: 'negative', arrow: '↓', positive: false };
        }
        return { direction: 'neutral', percent: 0, color: 'neutral', arrow: '→', positive: null };
    }

    function getDisplayTrendFromValues(values) {
        var clean = cleanTrendValues(values);
        if (clean.length < 2) {
            return { direction: 'neutral', percent: 0, color: 'neutral', arrow: '', positive: null };
        }
        return trendFromPair(clean[clean.length - 2], clean[clean.length - 1]);
    }

    function applyTrendBadge(el, values, baseClass) {
        if (!el) return;
        var trend = getDisplayTrendFromValues(values);
        if (!values || values.length < 2 || trend.positive === null) return;
        el.textContent = fChg(trend.percent);
        el.className   = baseClass + ' ' + badgeCls(trend.percent);
    }

    function applyPeriodTrendLabel(el, values, periodSuffix) {
        if (!el) return;
        var trend = getDisplayTrendFromValues(values);
        if (!values || values.length < 2) {
            el.textContent = '—';
            el.style.color = 'var(--text-muted)';
            return;
        }
        if (trend.positive === null) {
            el.textContent = '→ 0.00% ' + (periodSuffix || '');
            el.style.color = 'var(--text-muted)';
            return;
        }
        el.textContent = (trend.percent >= 0 ? '↑ +' : '↓ ')
            + Math.abs(trend.percent).toFixed(2) + '% ' + (periodSuffix || '');
        el.style.color = trend.percent < 0 ? 'var(--color-negative)' : 'var(--color-positive)';
    }

    function drawSyncedSparkline(canvas, closes, height, badgeEl, badgeClass) {
        if (!canvas || !closes || closes.length < 2) return;
        var trend = getDisplayTrendFromValues(closes);
        canvas._rPos = trend.positive;
        drawRealSparkline(canvas, closes, height);
        applyTrendBadge(badgeEl, closes, badgeClass);
    }

    function chartPalette(positive) {
        if (positive === null) {
            return { line: '#9BA3AF', fill: 'rgba(155,163,175,0.12)' };
        }
        return positive
            ? { line: '#42D6B5', fill: 'rgba(66,214,181,0.15)' }
            : { line: '#E66A73', fill: 'rgba(230,106,115,0.15)' };
    }

    // ── Block ALL random chart data in script.js ────────
    // script.js uses Math.random() in four functions. We override every one
    // synchronously here — api.js loads after script.js so all window.*
    // functions are already defined at this point.
    // Patching synchronously (before DOMContentLoaded) guarantees the patched
    // versions are in place before any 'load' handler in script.js fires.
    // generateStockData — script.js calls this when sdChartCache has no entry yet.
    // Return [] so drawLineChart skips rendering (data.length < 2 guard).
    // Real Alpha Vantage data arrives via sdInjectCandles and overwrites the cache.
    // No fake prices, no deterministic walk — blank chart until API responds.
    window.generateStockData = function () {
        console.log('[Clarivo AV] generateStockData called — returning [] (waiting for AV data)');
        return [];
    };

    // All patch calls below use hoisted function declarations — safe to call here
    // before DOMContentLoaded. Patching synchronously guarantees no Math.random
    // chart ever renders, even if window.load fires before boot().
    patchDrawMiniCharts();
    patchDrawMkSparkline();
    patchDrawNewsSnapshots();
    patchDrawStockChart();
    patchInitPortfolioValueChart();
    patchRenderMkCountryPanel();

    // ── TTLs (ms) — quotes 15m, news/fx 60m (historical TTL in stock-data-service.js) ─
    var TTL = { q: 900000, news: 3600000, fx: 3600000 };

    // ── Shared cache via sessionStorage (cross-page sync) ─
    // All pages read from the same sessionStorage so AAPL seen
    // on index.html is identical to the one on market.html.
    function ssGet(key, ttl) {
        try {
            var raw = sessionStorage.getItem('clarivo_' + key);
            if (!raw) return null;
            var e = JSON.parse(raw);
            return (Date.now() - e.ts < ttl) ? e.d : null;
        } catch (_) { return null; }
    }
    function ssSet(key, d) {
        try { sessionStorage.setItem('clarivo_' + key, JSON.stringify({ d: d, ts: Date.now() })); } catch (_) {}
    }

    // ── News cache — localStorage, dedicated to news only ────────────────────
    // Separate from the sessionStorage cache above (which quotes/FX use) so
    // headlines survive a closed tab/browser restart for the full 60-minute
    // TTL instead of clearing every time the tab closes.
    function lsNewsGet(key, ttl) {
        try {
            var raw = localStorage.getItem('clarivo_news_' + key);
            if (!raw) return null;
            var e = JSON.parse(raw);
            return (Date.now() - e.ts < ttl) ? e.d : null;
        } catch (_) { return null; }
    }
    function lsNewsGetStale(key) {
        try {
            var raw = localStorage.getItem('clarivo_news_' + key);
            if (!raw) return null;
            return JSON.parse(raw).d || null;
        } catch (_) { return null; }
    }
    function lsNewsSet(key, d) {
        try { localStorage.setItem('clarivo_news_' + key, JSON.stringify({ d: d, ts: Date.now() })); } catch (_) {}
    }

    // Per-page in-memory cache (faster than sessionStorage reads for same-page repeat calls)
    var _mem = {};
    function memGet(key, ttl) {
        var e = _mem[key];
        return (e && Date.now() - e.ts < ttl) ? e.d : null;
    }
    function memSet(key, d) { _mem[key] = { d: d, ts: Date.now() }; }

    function fromCache(key, ttl) {
        return memGet(key, ttl) || ssGet(key, ttl);
    }
    function toCache(key, d) { memSet(key, d); ssSet(key, d); }

    // Last-resort read that ignores TTL — used only when a live fetch has
    // already failed (API limit / CORS / network), so stale data is better
    // than nothing. Never used as the normal cache-first path.
    function staleCache(key) {
        return memGet(key, Infinity) || ssGet(key, Infinity);
    }

    // ── Twelve Data quote — sole live-quote provider ─────────────────────
    // Twelve Data's free tier allows 8 req/min, shared with the history
    // fetcher in stock-data-service.js. Quote calls are queued here so a
    // page that needs many symbols at once (e.g. Home) never bursts past
    // that limit — excess requests wait for the next per-minute window
    // instead of erroring out.
    var _tdqQueue      = [];
    var _tdqPending     = {};
    var _tdqInFlight    = 0;
    var _tdqBatchStart  = 0;
    var _tdqBatchCount  = 0;
    var _tdqTimerSet    = false;
    var TDQ_CONCURRENT  = 8;
    var TDQ_BATCH_WIN   = 61000;

    function tdQuoteFetch(sym, cb) {
        var cacheKey = 'q_' + sym;
        var tdKey    = cfg.TD_KEY;
        var url      = 'https://api.twelvedata.com/quote?symbol=' + encodeURIComponent(sym)
            + '&apikey=' + encodeURIComponent(tdKey);
        var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
        fetch(url, ctrl ? { signal: ctrl.signal } : {})
            .then(function (r) { if (timer) clearTimeout(timer); return r.json(); })
            .then(function (d) {
                if (d && (d.code === 429 || /run out of api credits/i.test(d.message || ''))) {
                    window._clarivoTDGate && window._clarivoTDGate.markRateLimited();
                }
                if (!d || d.status === 'error' || !d.close) {
                    cb(new Error((d && d.message) || 'No Twelve Data quote'), null);
                    return;
                }
                var norm = {
                    c:  parseFloat(d.close),
                    pc: parseFloat(d.previous_close) || parseFloat(d.close),
                    dp: parseFloat(d.percent_change) || 0,
                    o:  parseFloat(d.open)  || 0,
                    h:  parseFloat(d.high)  || 0,
                    l:  parseFloat(d.low)   || 0,
                    v:  parseFloat(String(d.volume).replace(/,/g, '')) || 0
                };
                toCache(cacheKey, norm);
                cb(null, norm);
            })
            .catch(function (e) { if (timer) clearTimeout(timer); cb(e, null); });
    }

    function tdQuoteDrain() {
        if (!_tdqQueue.length || _tdqInFlight >= TDQ_CONCURRENT) return;
        var now = Date.now();
        if (_tdqBatchCount >= TDQ_CONCURRENT) {
            var wait = TDQ_BATCH_WIN - (now - _tdqBatchStart);
            if (wait > 0) {
                if (!_tdqTimerSet) {
                    _tdqTimerSet = true;
                    setTimeout(function () { _tdqTimerSet = false; tdQuoteDrain(); }, wait);
                }
                return;
            }
            _tdqBatchCount = 0; _tdqBatchStart = now;
        }
        if (!_tdqBatchCount) _tdqBatchStart = now;

        // Shared account-wide Twelve Data budget — same gate stock-data-service.js
        // uses for history requests. If it's exhausted or in a post-429 cooldown,
        // skip straight to the caller's own stale-cache fallback instead of firing
        // a request that's almost certain to 429.
        if (window._clarivoTDGate && !window._clarivoTDGate.canFire()) {
            var sym0 = _tdqQueue.shift();
            var cbs0 = _tdqPending[sym0] || []; delete _tdqPending[sym0];
            console.log('[Clarivo API] shared rate budget unavailable for', sym0, '— skipping live fetch this cycle');
            cbs0.forEach(function (cb0) { cb0(new Error('Twelve Data rate limited'), null); });
            if (_tdqQueue.length) setTimeout(tdQuoteDrain, 2000);
            return;
        }

        var sym = _tdqQueue.shift();
        var cbs = _tdqPending[sym] || []; delete _tdqPending[sym];

        _tdqInFlight++; _tdqBatchCount++;
        window._clarivoTDGate && window._clarivoTDGate.markFired();
        tdQuoteFetch(sym, function (e, d) {
            _tdqInFlight--;
            cbs.forEach(function (cb2) { cb2(e, d); });
            tdQuoteDrain();
        });
        tdQuoteDrain();
    }

    function tdQuote(sym, cb) {
        if (_tdqPending[sym]) { _tdqPending[sym].push(cb); return; }
        _tdqPending[sym] = [cb];
        _tdqQueue.push(sym);
        tdQuoteDrain();
    }

    // q(sym, cb) — the single quote entry point used throughout the app.
    // Cache-first (TTL.q), Twelve Data only. cb(err, normalizedQuote|null).
    function q(sym, cb) {
        var cacheKey = 'q_' + sym;
        var hit = fromCache(cacheKey, TTL.q);
        if (hit && hit.c > 0) { cb(null, hit); return; }
        tdQuote(sym, function (e, d) {
            if (!e && d) { cb(null, d); return; }
            // Live fetch failed (API limit / CORS / network) — fall back to
            // whatever quote we last cached for this symbol, however old.
            var stale = staleCache(cacheKey);
            if (stale && stale.c > 0) {
                console.log('[Clarivo API] quote fetch failed for', sym, '— using stale cache', e && e.message);
                cb(null, stale);
                return;
            }
            cb(e, null);
        });
    }

    // ── News image helpers ────────────────────────────────────
    function getArticleImage(article) {
        if (!article) return '';
        var raw = article.image || article.urlToImage || article.thumbnail
            || article.banner_image || article.image_url || '';
        if (typeof raw !== 'string') return '';
        raw = raw.trim();
        if (!raw || raw === 'null' || raw === 'undefined') return '';
        return /^https?:\/\//i.test(raw) ? raw : '';
    }

    function normalizeNewsArticle(a) {
        if (!a) return null;
        if (a.title === '[Removed]') return null;
        var source = a.source;
        if (source && typeof source === 'object') source = source.name || '';
        return {
            headline: a.headline || a.title || '',
            summary:  a.summary  || a.description || a.snippet || '',
            image:    getArticleImage(a),
            datetime: a.datetime || (a.publishedAt
                ? Math.floor(new Date(a.publishedAt).getTime() / 1000)
                : (a.published_at ? Math.floor(new Date(a.published_at).getTime() / 1000) : 0)),
            source:   source || '',
            url:      a.url || '',
            category: a.category || ''
        };
    }

    function normalizeNewsList(items) {
        return (items || []).map(normalizeNewsArticle).filter(function (a) {
            return a && a.headline;
        }).sort(function (a, b) {
            return (b.image ? 1 : 0) - (a.image ? 1 : 0);
        });
    }

    function hideNewsImageWrap(wrap) {
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.style.display = 'none';
    }

    function renderNewsImage(wrap, imgUrl, className) {
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!imgUrl) {
            hideNewsImageWrap(wrap);
            return;
        }
        var img = document.createElement('img');
        img.className = className || 'news-card-image';
        img.src = imgUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { hideNewsImageWrap(wrap); };
        wrap.style.display = 'block';
        wrap.appendChild(img);
    }

    function setFeaturedNewsImage(bgEl, imgUrl) {
        if (!bgEl) return;
        var prev = bgEl.querySelector('.news-featured-photo');
        if (prev) prev.remove();
        var grid = bgEl.querySelector('.nfbg-grid');
        var glow = bgEl.querySelector('.nfbg-glow');
        if (grid) grid.style.display = '';
        if (glow) glow.style.display = '';
        if (!imgUrl) return;
        var img = document.createElement('img');
        img.className = 'news-featured-photo news-card-image';
        img.src = imgUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () {
            img.remove();
            if (grid) grid.style.display = '';
            if (glow) glow.style.display = '';
        };
        img.onload = function () {
            if (grid) grid.style.display = 'none';
            if (glow) glow.style.display = 'none';
        };
        bgEl.insertBefore(img, bgEl.firstChild);
    }

    // ── NewsAPI.org — primary news source (images included) ───
    // Response: { status, articles:[{title,description,urlToImage,url,publishedAt,source:{name}}] }
    var _naInFlight = {};   // cacheKey -> [callbacks] — dedupes simultaneous requests for the same query

    function naFetch(params, cacheKey, cb) {
        var cached = lsNewsGet(cacheKey, TTL.news);
        if (cached) {
            console.log('[Clarivo News] using cached NewsAPI articles');
            cb(null, cached);
            return;
        }
        if (_naInFlight[cacheKey]) { _naInFlight[cacheKey].push(cb); return; }
        var key = cfg.NA_KEY;
        if (!key || isPlaceholderKey(key)) { cb(new Error('No NA key'), null); return; }
        _naInFlight[cacheKey] = [cb];
        var url = 'https://newsapi.org/v2/top-headlines?' + params
            + '&apiKey=' + encodeURIComponent(key);
        console.log('[Clarivo News] fetching NewsAPI once');
        fetch(url)
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (json) {
                if (json.status === 'error') throw new Error(json.message || 'NewsAPI error');
                var arts = normalizeNewsList(json.articles || []);
                if (arts.length) lsNewsSet(cacheKey, arts);
                var cbs = _naInFlight[cacheKey] || []; delete _naInFlight[cacheKey];
                cbs.forEach(function (c) { c(null, arts); });
            })
            .catch(function (err) {
                console.warn('[Clarivo News] NewsAPI failed —', err.message || err, '— trying fallback');
                var cbs = _naInFlight[cacheKey] || []; delete _naInFlight[cacheKey];
                cbs.forEach(function (c) { c(err, null); });
            });
    }

    // ── Marketaux — secondary news source ─────────────────────
    var MX_BASE = 'https://api.marketaux.com/v1/news/all';
    var _mxInFlight = {};   // same in-flight dedupe as naFetch, separate map

    function mxFetch(extraParams, cacheKey, cb) {
        var cached = lsNewsGet(cacheKey, TTL.news);
        if (cached) { cb(null, cached); return; }
        if (_mxInFlight[cacheKey]) { _mxInFlight[cacheKey].push(cb); return; }
        var key = cfg.MX_KEY;
        if (!key || isPlaceholderKey(key)) { cb(new Error('No MX key'), null); return; }
        _mxInFlight[cacheKey] = [cb];
        var url = MX_BASE + '?language=en&limit=12&filter_entities=true'
            + (extraParams ? '&' + extraParams : '')
            + '&api_token=' + encodeURIComponent(key);
        fetch(url)
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (json) {
                if (json.error) throw new Error(json.error.message || 'Marketaux error');
                var arts = normalizeNewsList(json.data || []);
                if (arts.length) lsNewsSet(cacheKey, arts);
                var cbs = _mxInFlight[cacheKey] || []; delete _mxInFlight[cacheKey];
                cbs.forEach(function (c) { c(null, arts); });
            })
            .catch(function (err) {
                console.warn('[Clarivo Marketaux]', err.message || err, '— trying fallback');
                var cbs = _mxInFlight[cacheKey] || []; delete _mxInFlight[cacheKey];
                cbs.forEach(function (c) { c(err, null); });
            });
    }

    // Priority chain: NewsAPI → Marketaux. Finnhub news fallback removed —
    // if both fail, cb reports the failure honestly (no fake fallback).
    function newsAll(cb) {
        naFetch('category=business&language=en&pageSize=12', 'na_news_v2', function (e, arts) {
            if (!e && arts && arts.length) { cb(null, arts); return; }
            mxFetch('', 'mx_news_v2', function (e2, arts2) {
                if (!e2 && arts2 && arts2.length) { cb(null, arts2); return; }
                // Both sources failed (CORS block / quota / network) — use
                // whatever news was last cached, however old, before giving up.
                var stale = lsNewsGetStale('na_news_v2') || lsNewsGetStale('mx_news_v2');
                if (stale && stale.length) {
                    console.log('[Clarivo News] NewsAPI failed, using stale cache');
                    cb(null, stale);
                    return;
                }
                cb(e2 || e, null);
            });
        });
    }

    // Company-specific: NewsAPI q= → Marketaux symbols=. Finnhub company-news
    // fallback removed — if both fail, cb reports the failure honestly.
    function newsForSymbol(sym, from, to, cb) {
        naFetch('q=' + encodeURIComponent(sym) + '&language=en&pageSize=8&sortBy=publishedAt',
            'na_news_' + sym, function (e, arts) {
            if (!e && arts && arts.length) { cb(null, arts); return; }
            mxFetch('symbols=' + encodeURIComponent(sym), 'mx_news_' + sym, function (e2, arts2) {
                if (!e2 && arts2 && arts2.length) { cb(null, arts2); return; }
                var stale = lsNewsGetStale('na_news_' + sym) || lsNewsGetStale('mx_news_' + sym);
                if (stale && stale.length) {
                    console.log('[Clarivo News] NewsAPI failed, using stale cache for', sym);
                    cb(null, stale);
                    return;
                }
                cb(e2 || e, null);
            });
        });
    }

    // ════════════════════════════════════════════════════
    // HISTORICAL DATA — delegated to stock-data-service.js
    // StockDataService.fetch(sym, cb) → cb(null, { candles:[{date,close,...}], ... })
    // Switch data source (backend/static-json/alpha-vantage) in stock-data-service.js
    // ════════════════════════════════════════════════════

    // How often to re-check historical data (matches 1h localStorage TTL in StockDataService)
    var HIST_REFRESH_MS = 3600000;

    // Thin helpers so existing rendering code stays unchanged
    function avFetch(sym, cb) {
        StockDataService.fetch(sym, function (e, result) {
            cb(e, result ? result.candles : null);
        });
    }
    function avSlice(rows, period) { return StockDataService.slice(rows, period); }
    function avCloses(rows)        { return StockDataService.closes(rows); }

    // ── EUR/USD rate (also persisted in sessionStorage) ──
    // Stored so all pages use the same conversion rate.
    var _eur = (function () {
        try {
            var r = sessionStorage.getItem('clarivo_eur_rate');
            return r ? parseFloat(r) : 0.925;
        } catch (_) { return 0.925; }
    }());

    // USD→EUR multiplier used to display USD stock prices in EUR. Uses
    // Frankfurter (free, no key — same provider as the visible currency
    // converter), not Twelve Data, so it never competes with stock quote
    // quota. Cache-first; on failure the last known rate is kept (no fake
    // fallback rate is invented).
    function refreshEUR(cb) {
        var cached = fromCache('fx_usdeur', TTL.fx);
        if (cached && cached.rate) {
            _eur = cached.rate;
            try { sessionStorage.setItem('clarivo_eur_rate', String(_eur)); } catch (_) {}
            if (cb) cb();
            return;
        }
        fetch('https://api.frankfurter.dev/v2/rate/USD/EUR')
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (data) {
                var entry = Array.isArray(data) ? data[0] : data;
                var rate  = entry && (entry.rate || (entry.rates && entry.rates.EUR));
                if (rate) {
                    _eur = rate;
                    toCache('fx_usdeur', { rate: rate });
                    try { sessionStorage.setItem('clarivo_eur_rate', String(_eur)); } catch (_) {}
                }
            })
            .catch(function (e) {
                console.warn('[Clarivo FX] USD→EUR rate unavailable, using last known rate', _eur);
            })
            .then(function () { if (cb) cb(); });
    }
    function toEUR(usd) { return usd * _eur; }

    // ── Formatters ───────────────────────────────────────
    function fEUR(n) {
        if (n == null || isNaN(n)) return '—';
        return '€' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function fChg(dp) {
        if (dp == null || isNaN(dp)) return '—';
        return (dp >= 0 ? '↑ +' : '↓ ') + Math.abs(dp).toFixed(2) + '%';
    }
    function fAgo(ts) {
        var s = Math.floor(Date.now() / 1000 - ts);
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    }
    function badgeCls(dp) { return (dp != null && !isNaN(dp) && dp < 0) ? 'negative-badge' : 'positive-badge'; }

    // When market is closed / pre-market, c may be 0.
    // Return a normalised quote always has a valid price (using pc as fallback).
    function normalizeQuote(d) {
        if (!d) return null;
        if (d.c > 0) return d;
        if (d.pc > 0) {
            return { c: d.pc, pc: d.pc, dp: d.dp || 0, d: d.d || 0,
                     o: d.o || d.pc, h: d.h || d.pc, l: d.l || d.pc,
                     v: d.v || 0, t: d.t || 0 };
        }
        return null;
    }

    // ── Page-load sentinel (distinguishes initial-load from resize) ─
    var _pageLoaded = (document.readyState === 'complete');
    if (!_pageLoaded) {
        window.addEventListener('load', function () { _pageLoaded = true; }, { once: true });
    }

    // ── Central chart data store ─────────────────────────
    // All sparkline data is stored on the canvas element under these keys.
    // This means resize redraws always use the exact same array — no regeneration.
    //   _rCloses : number[]       – close prices (API or deterministic fallback)
    //   _rPos    : boolean        – true = uptrend (green), false = downtrend (red)
    //   _rSource : 'API'|'fallback'
    //   _rSym    : string         – ticker symbol
    //   _rRange  : string         – e.g. '30D', '1Y'
    //   _rFirst  : string         – first date string (for logging)
    //   _rLast   : string         – last  date string (for logging)
    //
    // Rule: once _rSource === 'API', nothing may overwrite the array except
    // another API response (sparkSave). Fallback paths check _rSource first.

    function sparkSave(canvas, closes, sym, range, firstDate, lastDate) {
        var trend = getDisplayTrendFromValues(closes);
        canvas._rCloses = closes;
        canvas._rPos    = trend.positive;
        canvas._rSource = 'API';
        canvas._rSym    = sym       || '';
        canvas._rRange  = range     || '30D';
        canvas._rFirst  = firstDate || '?';
        canvas._rLast   = lastDate  || '?';
    }

    // ── Centralized chart render logger ─────────────────
    function logChart(component, sym, range, source, closes, cause, firstDate, lastDate) {
        var n    = closes ? closes.length : 0;
        var fv   = n ? (closes[0]     || 0).toFixed(2) : '?';
        var lv   = n ? (closes[n - 1] || 0).toFixed(2) : '?';
        console.log(
            '[Clarivo Chart]',
            'component:', component,
            '| sym:', sym      || '?',
            '| range:', range  || '?',
            '| source:', source,
            '| points:', n,
            '| firstDate:', firstDate || '?',
            '| lastDate:',  lastDate  || '?',
            '| firstClose:', fv,
            '| lastClose:',  lv,
            '| cause:', cause
        );
    }

    // ── Patch window.drawMiniCharts ─────────────────────
    // Replaces script.js's random version.
    // If _rSource === 'API' and _rCloses is stored → redraw from store (resize safe).
    // If no data yet → leave canvas blank; StockDataService.fetch will fill it when data arrives.
    function patchDrawMiniCharts() {
        if (window._clarivo_dmcPatched) return;
        window._clarivo_dmcPatched = true;
        window.drawMiniCharts = function () {
            var cause = _pageLoaded ? 'resize' : 'initial-load';
            document.querySelectorAll('.mini-chart-canvas').forEach(function (cv) {
                if (cv._rSource === 'API' && cv._rCloses && cv._rCloses.length >= 2) {
                    logChart('portfolio/mini-sparkline', cv._rSym, cv._rRange, 'API',
                        cv._rCloses, cause, cv._rFirst, cv._rLast);
                    drawRealSparkline(cv, cv._rCloses, 40);
                }
                // No real data yet → blank canvas; no fake/random/deterministic data
            });
        };
    }

    // ── Patch window.drawMkSparkline ────────────────────
    // Replaces script.js's random version.
    // If _rSource === 'API' → redraw from store (resize safe).
    // If no API data yet → leave canvas blank.
    function patchDrawMkSparkline() {
        if (window._clarivo_dmsPatched) return;
        window._clarivo_dmsPatched = true;
        window.drawMkSparkline = function (canvas, _positive, height) {
            if (canvas._rSource === 'API' && canvas._rCloses && canvas._rCloses.length >= 2) {
                var cause = _pageLoaded ? 'resize' : 'initial-load';
                var comp  = canvas.classList.contains('mk-idx-chart')
                    ? 'market/index-sparkline' : 'market/stock-sparkline';
                logChart(comp, canvas._rSym, canvas._rRange, 'API',
                    canvas._rCloses, cause, canvas._rFirst, canvas._rLast);
                drawRealSparkline(canvas, canvas._rCloses, height);
            }
            // No real data yet → blank canvas
        };
    }

    // ── Patch window.drawNewsSnapshots ──────────────────
    // Replaces script.js's random version.
    // If _rSource === 'API' → redraw from store (resize safe).
    // If no API data yet → leave canvas blank.
    function patchDrawNewsSnapshots() {
        if (window._clarivo_dnsPatched) return;
        window._clarivo_dnsPatched = true;
        window.drawNewsSnapshots = function () {
            var cause = _pageLoaded ? 'resize' : 'initial-load';
            document.querySelectorAll('.ns-mini-chart').forEach(function (cv) {
                if (cv._rSource === 'API' && cv._rCloses && cv._rCloses.length >= 2) {
                    logChart('news/snapshot-sparkline', cv._rSym, cv._rRange, 'API',
                        cv._rCloses, cause, cv._rFirst, cv._rLast);
                    drawRealSparkline(cv, cv._rCloses, 48);
                }
                // No real data yet → blank canvas
            });
        };
    }

    // ── Real sparkline — straight segments; color synced to badge via display trend ─
    function drawRealSparkline(canvas, closes, height) {
        if (!canvas || !closes || closes.length < 2) return;
        var positive = getDisplayTrendFromValues(closes).positive;
        var dpr = window.devicePixelRatio || 1;
        var w   = canvas.offsetWidth  || canvas.clientWidth  || 80;
        var h   = height || canvas.offsetHeight || canvas.clientHeight || 36;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        var min = Math.min.apply(null, closes);
        var max = Math.max.apply(null, closes);
        var rng = max - min || 1;
        var pad = 3;

        var pts = closes.map(function (v, i) {
            return {
                x: (i / (closes.length - 1)) * w,
                y: h - pad - ((v - min) / rng) * (h - pad * 2)
            };
        });

        var color     = positive === true ? '#42D6B5' : (positive === false ? '#E66A73' : '#9BA3AF');
        var gradStart = positive === true ? 'rgba(66,214,181,0.25)' : (positive === false ? 'rgba(230,106,115,0.25)' : 'rgba(155,163,175,0.15)');
        var gradEnd   = positive === true ? 'rgba(66,214,181,0)'    : (positive === false ? 'rgba(230,106,115,0)'    : 'rgba(155,163,175,0)');
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, gradStart);
        grad.addColorStop(1, gradEnd);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[pts.length - 1].x, h);
        ctx.lineTo(pts[0].x, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.stroke();
    }

    // ── Market-open check ────────────────────────────────
    function isMarketOpen() {
        var et  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        var day = et.getDay();
        if (day === 0 || day === 6) return false;
        var mins = et.getHours() * 60 + et.getMinutes();
        return mins >= 570 && mins < 960;
    }

    // ════════════════════════════════════════════════════
    // HOME PAGE  (index.html)
    // ════════════════════════════════════════════════════

    var HOME_STOCKS = [
        { sym: 'AAPL', i: 0 }, { sym: 'TSLA', i: 1 },
        { sym: 'AMZN', i: 2 }, { sym: 'MSFT', i: 3 },
        { sym: 'NVDA', i: 4 }, { sym: 'SAP',  i: 5 }
    ];
    var MAJOR_IDX = [
        { sym: 'QQQ', ticker: 'NDX'  },
        { sym: 'EWJ', ticker: 'N225' },
        { sym: 'FXI', ticker: 'SSEC' },
        { sym: 'EWU', ticker: 'FTSE' },
        { sym: 'EWG', ticker: 'DAX'  },
        { sym: 'EWQ', ticker: 'CAC'  }
    ];
    var MS_SUMMARY_SYM  = 'SPY';
    var MS_SUMMARY_MULT = 10;
    var _msSummaryChart = null;

    function homeUpdateSummaryChart(rows) {
        var canvas  = document.getElementById('msSummaryChart');
        var unavail = document.getElementById('msChartUnavailable');
        if (!canvas) return;

        function showUnavailable() {
            if (_msSummaryChart) {
                _msSummaryChart.destroy();
                _msSummaryChart = null;
            }
            canvas.style.display = 'none';
            if (unavail) unavail.style.display = 'flex';
        }

        console.log('[Clarivo Chart] Chart.js available:', typeof Chart === 'function');
        console.log('[Clarivo Chart] Market Summary points:', rows ? rows.length : 0);

        if (!rows || rows.length < 2) {
            showUnavailable();
            return;
        }

        var slice  = rows.slice(Math.max(0, rows.length - 60));
        var closes = avCloses(slice);
        var data   = closes.map(function (c) { return c * MS_SUMMARY_MULT; });

        if (data.length < 2 || typeof Chart === 'undefined') {
            showUnavailable();
            return;
        }

        canvas.style.display = 'block';
        if (unavail) unavail.style.display = 'none';
        console.log('[Clarivo Chart] Rendering Market Summary chart');

        var trend = trendFromPair(data[0], data[data.length - 1]);
        var pal   = chartPalette(trend.positive);

        if (_msSummaryChart) {
            _msSummaryChart.data.labels = data.map(function (_, i) { return i; });
            _msSummaryChart.data.datasets[0].data = data;
            _msSummaryChart.data.datasets[0].borderColor = pal.line;
            _msSummaryChart.data.datasets[0].backgroundColor = pal.fill;
            _msSummaryChart.update('none');
            return;
        }

        _msSummaryChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: data.map(function (_, i) { return i; }),
                datasets: [{
                    data: data,
                    borderColor: pal.line,
                    backgroundColor: pal.fill,
                    fill: true,
                    tension: CHART_LINE_TENSION,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 350 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: function () { return ''; },
                            label: function (ctx) {
                                return '  ' + ctx.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                            }
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false, beginAtZero: false }
                }
            }
        });
    }

    function homeRefreshSummaryChart() {
        avFetch(MS_SUMMARY_SYM, function (e, rows) {
            homeUpdateSummaryChart(e || !rows ? null : rows);
        });
    }

    function homeUpdateStockCard(sym, data) {
        if (window.stocks) {
            HOME_STOCKS.forEach(function (cfg) {
                if (cfg.sym !== sym) return;
                window.stocks[cfg.i].price    = fEUR(toEUR(data.c));
                window.stocks[cfg.i].change   = (data.dp >= 0 ? '+' : '') + data.dp.toFixed(2) + '%';
                window.stocks[cfg.i].positive = data.dp >= 0;
            });
        }
        document.querySelectorAll('#stockCarousel .stock-card').forEach(function (card) {
            var t = card.querySelector('.stock-ticker');
            if (!t || t.textContent.trim() !== sym) return;
            var p = card.querySelector('.stock-price');
            var c = card.querySelector('.stock-change');
            var cv = card.querySelector('.home-mini-chart');
            if (p) p.textContent = fEUR(toEUR(data.c));
            if (cv && cv._rCloses && cv._rCloses.length > 1) {
                drawSyncedSparkline(cv, cv._rCloses, 36, c, 'stock-change');
            } else if (c) {
                c.textContent = '—';
                c.className   = 'stock-change';
            }
        });
    }

    function homeUpdateSummary(data) {
        // SPY as S&P proxy — multiply ×10 to approximate S&P 500 level
        var level  = data.c * 10;
        var price  = document.querySelector('.ms-index-price');
        var change = document.querySelector('.ms-index-change');
        if (price)  price.textContent  = level.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (change) {
            change.textContent = fChg(data.dp);
            change.className   = 'ms-index-change ' + (data.dp >= 0 ? 'positive' : 'negative');
        }
        var stats = document.querySelectorAll('.ms-stat-row .ms-stat-value');
        if (stats[0]) stats[0].textContent = (data.o * 10).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (stats[1]) { stats[1].textContent = (data.h * 10).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); stats[1].className = 'ms-stat-value positive'; }
        if (stats[2]) stats[2].textContent = (data.l * 10).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        // Volume — real API value (fVol already returns '—' when unavailable); no fake static figure.
        if (stats[3]) stats[3].textContent = fVol(data.v);
    }

    function homeUpdateMajorIdx(ticker, data) {
        document.querySelectorAll('.mi-row').forEach(function (row) {
            var t = row.querySelector('.mi-ticker');
            if (!t || t.textContent.trim() !== ticker) return;
            var c = row.querySelector('.mi-change');
            if (!c) return;
            c.textContent = (data.dp >= 0 ? '+' : '') + data.dp.toFixed(2) + '%';
            c.className   = 'mi-change ' + (data.dp >= 0 ? 'positive' : 'negative');
        });
    }

    function homeUpdateNews(articles) {
        var cards = document.querySelectorAll('.news-section .news-card');
        articles.slice(0, cards.length).forEach(function (art, i) {
            var card = cards[i]; if (!card) return;
            var t = card.querySelector('.news-title');
            var x = card.querySelector('.news-text');
            var d = card.querySelector('.news-date');
            var l = card.querySelector('.news-link');
            var c = card.querySelector('.news-category');
            if (t) t.textContent = art.headline;
            if (x) x.textContent = (art.summary || '').substring(0, 140) + '…';
            if (d) d.textContent = fAgo(art.datetime);
            if (l) l.href        = art.url || '#';
            if (c && art.category) c.textContent = art.category.charAt(0).toUpperCase() + art.category.slice(1);
        });
    }

    // Called only when newsAll() reports a real failure with no cached
    // fallback left — replaces the "Loading…" placeholder so it never hangs.
    function homeShowNewsUnavailable() {
        document.querySelectorAll('.news-section .news-card .news-title').forEach(function (t) {
            t.textContent = 'News data is temporarily unavailable.';
        });
        document.querySelectorAll('.news-section .news-card .news-text').forEach(function (x) {
            x.textContent = '';
        });
    }

    // Called only when newsAll() reports a real failure with no cached
    // fallback left — replaces the "Loading…" placeholder on Market's
    // Trending News cards so they never hang on it, and never silently
    // keep showing the static demo headlines forever.
    function mkShowNewsUnavailable() {
        document.querySelectorAll('.mk-news-mini-card .mk-nmcard-title').forEach(function (t) {
            t.textContent = 'News data is temporarily unavailable.';
        });
        document.querySelectorAll('.mk-news-mini-card .mk-nmcard-desc').forEach(function (d) {
            d.textContent = '';
        });
        document.querySelectorAll('.mk-news-mini-card .mk-nmcard-meta').forEach(function (m) {
            m.textContent = '';
        });
    }

    // Called only when the market-summary quote fails with no cached
    // fallback left — replaces the "Loading…" placeholder so it never hangs.
    function homeShowSummaryUnavailable() {
        var change = document.querySelector('.ms-index-change');
        if (change) {
            change.textContent = 'Market data unavailable';
            change.className   = 'ms-index-change';
        }
    }

    var _homeSparkCache = {};

    function homeDrawSparkline(sym, closes, fd, ld) {
        if (!closes || closes.length < 2) return;
        document.querySelectorAll('#stockCarousel .stock-card').forEach(function (card) {
            var t = card.querySelector('.stock-ticker');
            if (!t || t.textContent.trim() !== sym) return;
            var cv = card.querySelector('.home-mini-chart');
            var c  = card.querySelector('.stock-change');
            if (!cv) return;
            sparkSave(cv, closes, sym, '30D', fd, ld);
            logChart('home/snapshot-sparkline', sym, '30D', 'API', closes, 'api-response', fd, ld);
            drawRealSparkline(cv, closes, 36);
            applyTrendBadge(c, closes, 'stock-change');
        });
    }

    function homeApplySparklines() {
        HOME_STOCKS.forEach(function (cfg) {
            var hit = _homeSparkCache[cfg.sym];
            if (hit) homeDrawSparkline(cfg.sym, hit.closes, hit.fd, hit.ld);
        });
    }

    function initHomePage() {
        if (!document.getElementById('stockCarousel') && !document.getElementById('msSummaryChart')) return;

        if (typeof window.renderCards === 'function' && !window._clarivo_homeRenderPatched) {
            window._clarivo_homeRenderPatched = true;
            var _origRenderCards = window.renderCards;
            window.renderCards = function () {
                _origRenderCards();
                homeApplySparklines();
            };
        }

        function refreshSparklines() {
            HOME_STOCKS.forEach(function (cfg) {
                avFetch(cfg.sym, function (e, rows) {
                    if (e || !rows || rows.length < 2) return;
                    var slice  = avSlice(rows, 'MINI');
                    var closes = avCloses(slice);
                    if (closes.length < 2) return;
                    var fd = slice[0].date;
                    var ld = slice[slice.length - 1].date;
                    _homeSparkCache[cfg.sym] = { closes: closes, fd: fd, ld: ld };
                    homeDrawSparkline(cfg.sym, closes, fd, ld);
                });
            });
        }

        // Request priority (shared Twelve Data budget is only 8/min):
        //   1. Market Summary (SPY)      — the most visible widget
        //   2. Market Snapshot (HOME_STOCKS)
        //   3. Major Indices              — delayed into the next rate window
        //   4. News                       — different API, but kept last anyway
        function refresh() {
            refreshEUR(function () {
                q('SPY', function (e, d) {
                    var nd = normalizeQuote(d);
                    if (!e && nd) { homeUpdateSummary(nd); return; }
                    console.log('[Clarivo API] market summary quote unavailable —', e && e.message);
                    homeShowSummaryUnavailable();
                });
                HOME_STOCKS.forEach(function (cfg) {
                    q(cfg.sym, function (e, d) { var nd = normalizeQuote(d); if (!e && nd) homeUpdateStockCard(cfg.sym, nd); });
                });
                setTimeout(function () {
                    MAJOR_IDX.forEach(function (mi) {
                        q(mi.sym, function (e, d) { var nd = normalizeQuote(d); if (!e && nd) homeUpdateMajorIdx(mi.ticker, nd); });
                    });
                }, 4000);
                setTimeout(function () {
                    newsAll(function (e, a) {
                        if (!e && a && a.length) { homeUpdateNews(a); return; }
                        console.log('[Clarivo API] news unavailable —', e && e.message);
                        homeShowNewsUnavailable();
                    });
                }, 1500);
            });
        }

        homeRefreshSummaryChart();           // Priority 1 history (SPY)
        refresh();                           // Priority 1 quote + Priority 2 quotes (3/4 delayed inside)
        setTimeout(refreshSparklines, 2000); // Priority 2 history, after Priority 1 history has its turn
        setInterval(refresh, TTL.q);
        setInterval(refreshSparklines, HIST_REFRESH_MS);
        setInterval(homeRefreshSummaryChart, HIST_REFRESH_MS);
    }

    // ════════════════════════════════════════════════════
    // MARKET PAGE  (market.html)
    // ════════════════════════════════════════════════════

    // Index card multipliers to convert ETF price → approximate index level
    var MK_IDX = [
        { sym: 'SPY', i: 0, mult: 10  },   // SPY ~$540 × 10 ≈ S&P 500 ~5,400
        { sym: 'QQQ', i: 1, mult: 40  },   // QQQ ~$480 × 40 ≈ NASDAQ ~19,200
        { sym: 'EWG', i: 2, mult: 1   },   // Show ETF price as-is
        { sym: 'EWU', i: 3, mult: 1   }
    ];
    var MK_STOCKS = ['AAPL', 'TSLA', 'AMZN', 'MSFT', 'NVDA'];

    // ── Country market panel — real cached quotes only, no sample data ────
    // Each entry maps to a symbol this app already fetches elsewhere on the
    // page (or on Home, via the shared sessionStorage quote cache), so no
    // new API request is ever made here — this only reads whatever is
    // already cached. A null sym means there is no real data source for
    // that instrument in this project; it always shows "Data unavailable".
    var MK_COUNTRY_SYMS = {
        germany: [
            { name: 'DAX (EWG proxy)', ticker: 'DAX', sym: 'EWG' },
            { name: 'SAP SE',          ticker: 'SAP', sym: 'SAP' },
            { name: 'Siemens',         ticker: 'SIE', sym: null }
        ],
        usa: [
            { name: 'S&P 500 (SPY proxy)', ticker: 'SPX',  sym: 'SPY'  },
            { name: 'Apple Inc.',          ticker: 'AAPL', sym: 'AAPL' },
            { name: 'Tesla',               ticker: 'TSLA', sym: 'TSLA' }
        ],
        turkey: [
            { name: 'BIST 100', ticker: 'XU100', sym: null },
            { name: 'Türk Hava', ticker: 'THYAO', sym: null },
            { name: 'Aselsan',  ticker: 'ASELS', sym: null }
        ],
        uk: [
            { name: 'FTSE 100 (EWU proxy)', ticker: 'FTSE', sym: 'EWU' },
            { name: 'HSBC', ticker: 'HSBA', sym: null },
            { name: 'BP plc', ticker: 'BP.', sym: null }
        ]
    };

    function patchRenderMkCountryPanel() {
        if (window._clarivo_mkCountryPatched) return;
        window._clarivo_mkCountryPatched = true;

        window.renderMkCountryPanel = function (countryKey) {
            var result = document.getElementById('mkCountryResult');
            var flag   = document.getElementById('mkCountryFlag');
            var name   = document.getElementById('mkCountryName');
            var items  = document.getElementById('mkCountryItems');
            var list   = MK_COUNTRY_SYMS[countryKey];
            var meta   = (window.MK_COUNTRIES && window.MK_COUNTRIES[countryKey]) || null;
            if (!list || !meta || !result) { if (result) result.style.display = 'none'; return; }

            flag.textContent = meta.flag;
            name.textContent = (typeof tMarket === 'function' ? tMarket(meta.nameKey) : countryKey);

            items.innerHTML = list.map(function (item) {
                // Cache-only read — never triggers a network call. These symbols
                // are already kept warm by Market/Home's own periodic refresh.
                var cached = item.sym ? fromCache('q_' + item.sym, TTL.q) : null;
                var dp     = cached && isFinite(cached.dp) ? cached.dp : null;
                var change = (dp == null) ? 'Data unavailable' : fChg(dp);
                var color  = (dp == null) ? 'var(--text-muted)' : (dp >= 0 ? 'var(--color-positive)' : 'var(--color-negative)');
                return '<li>' +
                    '<div>' +
                        '<span class="mk-country-item-name">' + item.name + '</span><br>' +
                        '<span class="mk-country-item-ticker">' + item.ticker + '</span>' +
                    '</div>' +
                    '<span style="font-size:12px;font-weight:700;color:' + color + '">' + change + '</span>' +
                '</li>';
            }).join('');

            result.style.display = 'block';
        };
    }

    function mkUpdateIndex(cfg, data) {
        var cols = document.querySelectorAll('#mkIndicesGrid .mk-index-col');
        var col  = cols[cfg.i]; if (!col) return;
        var v = col.querySelector('.mk-idx-value');
        var c = col.querySelector('.mk-idx-change');
        var level = data.c * (cfg.mult || 1);
        if (v) v.textContent = (cfg.mult > 1 ? '' : '$') +
            level.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        var cv = col.querySelector('.mk-idx-chart');
        var c  = col.querySelector('.mk-idx-change');
        if (cv && cv._rCloses && cv._rCloses.length > 1) {
            drawSyncedSparkline(cv, cv._rCloses, 48, c, 'mk-idx-change');
        } else if (c) {
            c.textContent = fChg(data.dp);
            c.className   = 'mk-idx-change ' + badgeCls(data.dp);
        }
    }

    function mkUpdateStock(sym, data) {
        document.querySelectorAll('#mkStocksTable .mk-stock-row').forEach(function (row) {
            var t = row.querySelector('.mk-stock-ticker');
            if (!t || t.textContent.trim() !== sym) return;
            var p  = row.querySelector('.mk-stock-price');
            var cv = row.querySelector('.mk-stock-spark');
            var c  = row.querySelector('.mk-stock-change');
            if (p) p.textContent = fEUR(toEUR(data.c));
            if (cv && cv._rCloses && cv._rCloses.length > 1) {
                drawSyncedSparkline(cv, cv._rCloses, 36, c, 'mk-stock-change');
            } else if (c) {
                c.textContent = fChg(data.dp);
                c.className   = 'mk-stock-change ' + badgeCls(data.dp);
            }
        });
    }

    function mkUpdateNews(articles) {
        var cards = document.querySelectorAll('.mk-news-mini-card');
        articles.slice(0, cards.length).forEach(function (art, i) {
            var card = cards[i]; if (!card) return;
            var t = card.querySelector('.mk-nmcard-title');
            var d = card.querySelector('.mk-nmcard-desc');
            var m = card.querySelector('.mk-nmcard-meta');
            var imgWrap = card.querySelector('.mk-nmcard-img');
            var imgUrl  = getArticleImage(art);
            if (t) t.textContent = art.headline;
            if (d) d.textContent = (art.summary || '').substring(0, 100) + '…';
            if (m) m.innerHTML   = (art.source || 'MarketWatch') +
                ' <span style="color:var(--border-color)">·</span> ' + fAgo(art.datetime);
            renderNewsImage(imgWrap, imgUrl, 'mk-nmcard-img-el news-card-image');
            if (art.url) {
                card.style.cursor = 'pointer';
                card.onclick = function () { window.open(art.url, '_blank', 'noopener'); };
            }
        });
    }

    function setupConverter() {
        var btn    = document.getElementById('mkConvBtn');
        var swpBtn = document.getElementById('mkConvSwap');
        var note   = document.querySelector('.mk-conv-note');
        if (!btn || window._clarivo_converterReady) return;
        window._clarivo_converterReady = true;

        if (note) note.textContent = 'Live rates via frankfurter.dev — no API key needed.';

        function doConvert() {
            var amount = parseFloat((document.getElementById('mkConvAmount') || {}).value);
            var from   = (document.getElementById('mkConvFrom') || {}).value || 'EUR';
            var to     = (document.getElementById('mkConvTo')   || {}).value || 'USD';
            var resBox = document.getElementById('mkConvResult');
            var resVal = document.getElementById('mkConvResultValue');
            if (!resVal || !resBox || isNaN(amount) || amount <= 0) return;

            resVal.textContent = 'Loading…';
            resBox.style.display = 'block';

            if (from === to) {
                resVal.textContent = amount.toLocaleString() + ' ' + from + ' = ' + amount.toFixed(4) + ' ' + to;
                if (note) note.textContent = 'Same currency — no conversion needed.';
                return;
            }

            var url = 'https://api.frankfurter.dev/v2/rate/' + encodeURIComponent(from) + '/' + encodeURIComponent(to);
            fetch(url)
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    // Response is an array [{date, base, quote, rate}, ...]
                    var entry = Array.isArray(data) ? data[0] : data;
                    var rate  = entry && entry.rate;
                    if (!rate) throw new Error('No rate in response');
                    var result = amount * rate;
                    resVal.textContent = amount.toLocaleString() + ' ' + from + ' = '
                        + result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                        + ' ' + to;
                    if (note) note.textContent = 'Rate: 1 ' + from + ' = ' + rate.toFixed(6) + ' ' + to
                        + ' · ' + (entry.date || 'today') + ' · frankfurter.dev';
                })
                .catch(function (err) {
                    resVal.textContent = 'Error fetching rate. Check connection.';
                    console.error('[Clarivo Converter]', err);
                });
        }

        btn.addEventListener('click', doConvert);

        if (swpBtn) {
            swpBtn.addEventListener('click', function () {
                var selFrom = document.getElementById('mkConvFrom');
                var selTo   = document.getElementById('mkConvTo');
                if (!selFrom || !selTo) return;
                var tmp = selFrom.value;
                selFrom.value = selTo.value;
                selTo.value   = tmp;
            });
        }
    }

    function initMarketPage() {
        if (!document.getElementById('mkIndicesGrid')) return;
        patchDrawMkSparkline();

        // Chart.js: daily % change bar chart for market indices
        var _mkOvChart  = null;
        var _mkDp       = [null, null, null, null];
        var _mkLabels   = ['S&P 500', 'NASDAQ', 'DAX', 'FTSE 100'];

        function updateMkOverviewChart() {
            var canvas = document.getElementById('mkOverviewChart');
            if (!canvas || typeof Chart === 'undefined') return;
            var dp    = _mkDp.map(function (v) { return v != null ? v : 0; });
            var colors = dp.map(function (v) { return v >= 0 ? 'rgba(66,214,181,0.85)' : 'rgba(230,106,115,0.85)'; });
            if (_mkOvChart) {
                _mkOvChart.data.datasets[0].data           = dp;
                _mkOvChart.data.datasets[0].backgroundColor = colors;
                _mkOvChart.update('none');
            } else {
                _mkOvChart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: _mkLabels,
                        datasets: [{
                            data: dp,
                            backgroundColor: colors,
                            borderRadius: 6,
                            borderSkipped: false
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 400 },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function (ctx) {
                                        var v = ctx.parsed.y;
                                        return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: '#9BA3AF', font: { size: 11 } } },
                            y: {
                                grid: { color: 'rgba(255,255,255,0.05)' },
                                ticks: {
                                    color: '#9BA3AF', font: { size: 11 },
                                    callback: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
                                }
                            }
                        }
                    }
                });
            }
        }

        function refreshMkSparklines() {
            // Index sparklines — last 30 trading days from Alpha Vantage
            MK_IDX.forEach(function (cfg) {
                avFetch(cfg.sym, function (e, rows) {
                    if (e || !rows) return;
                    var slice  = avSlice(rows, 'MINI');
                    var closes = avCloses(slice);
                    var fd     = slice[0].date;
                    var ld     = slice[slice.length - 1].date;
                    var cols   = document.querySelectorAll('#mkIndicesGrid .mk-index-col');
                    var col    = cols[cfg.i];
                    var cv     = col && col.querySelector('.mk-idx-chart');
                    var cEl    = col && col.querySelector('.mk-idx-change');
                    if (cv) {
                        sparkSave(cv, closes, cfg.sym, '30D', fd, ld);
                        logChart('market/index-sparkline', cfg.sym, '30D', 'API', closes, 'api-response', fd, ld);
                        drawRealSparkline(cv, closes, 48);
                        applyTrendBadge(cEl, closes, 'mk-idx-change');
                    }
                });
            });
            // Stock sparklines — last 30 trading days from Alpha Vantage
            MK_STOCKS.forEach(function (sym) {
                avFetch(sym, function (e, rows) {
                    if (e || !rows) return;
                    var slice  = avSlice(rows, 'MINI');
                    var closes = avCloses(slice);
                    var fd     = slice[0].date;
                    var ld     = slice[slice.length - 1].date;
                    document.querySelectorAll('#mkStocksTable .mk-stock-row').forEach(function (row) {
                        var t = row.querySelector('.mk-stock-ticker');
                        if (!t || t.textContent.trim() !== sym) return;
                        var cv = row.querySelector('.mk-stock-spark');
                        var c  = row.querySelector('.mk-stock-change');
                        if (cv) {
                            sparkSave(cv, closes, sym, '30D', fd, ld);
                            logChart('market/stock-sparkline', sym, '30D', 'API', closes, 'api-response', fd, ld);
                            drawRealSparkline(cv, closes, 36);
                            applyTrendBadge(c, closes, 'mk-stock-change');
                        }
                    });
                });
            });
        }

        function refresh() {
            refreshEUR(function () {
                MK_IDX.forEach(function (cfg) {
                    q(cfg.sym, function (e, d) {
                        var nd = normalizeQuote(d);
                        if (!e && nd) {
                            mkUpdateIndex(cfg, nd);
                            _mkDp[cfg.i] = nd.dp;
                            updateMkOverviewChart();
                        }
                    });
                });
                MK_STOCKS.forEach(function (sym) {
                    q(sym, function (e, d) { var nd = normalizeQuote(d); if (!e && nd) mkUpdateStock(sym, nd); });
                });
                newsAll(function (e, a) {
                    if (!e && a && a.length) { mkUpdateNews(a); console.log('[Clarivo News] articles rendered:', a.length); return; }
                    console.log('[Clarivo News] NewsAPI/Marketaux unavailable —', e && e.message);
                    mkShowNewsUnavailable();
                });
            });
        }

        setupConverter();
        updateMkOverviewChart();
        refresh();
        refreshMkSparklines();
        setInterval(refresh, TTL.q);
        setInterval(refreshMkSparklines, HIST_REFRESH_MS);
    }

    // ════════════════════════════════════════════════════
    // PORTFOLIO PAGE  (portfolio.html)
    // ════════════════════════════════════════════════════

    var PF_META = {
        AAPL: { name: 'Apple Inc.', color: '#42D6B5', logo: 'assets/apple_logo.png', cls: 'apple', letter: 'A' },
        TSLA: { name: 'Tesla',      color: '#E66A73', logo: 'assets/tesla_logo.png', cls: 'tesla', letter: 'T' },
        AMZN: { name: 'Amazon',     color: '#4B7BEC', logo: 'assets/amazon_logo.png', cls: 'amazon', letter: 'A' }
    };
    // All three supported stocks — Your Holdings always shows a card for each
    // of these (mobile-app behaviour), even when owned shares = 0.
    var ALL_SYMS = Object.keys(PF_META);

    // PF holds only symbols the user actually owns (shares > 0), read from
    // LocalStorage (single source of truth). Drives Total Value/Invested/Gain/
    // Allocation/Chart — those stay strictly limited to real holdings.
    function pfBuildHoldings() {
        var holdings = window.ClarivoHoldings ? window.ClarivoHoldings.getHoldings() : { AAPL: 0, TSLA: 0, AMZN: 0 };
        return ALL_SYMS.filter(function (sym) { return holdings[sym] > 0; })
            .map(function (sym) {
                return { sym: sym, shares: holdings[sym], color: PF_META[sym].color };
            });
    }

    var PF = pfBuildHoldings();
    var _pfQ = {};

    var PF_LABELS = {
        '1D': 'today', '1W': 'this week', '1M': 'this month',
        '3M': 'last 3 months', '1Y': 'this year', 'ALL': 'all time'
    };

    function pfActivePeriod() {
        if (window.activePfPeriod) return window.activePfPeriod;
        var btn = document.querySelector('.pf-time-tab.active');
        return btn ? btn.dataset.period : '1W';
    }

    // ── Donut canvas (live allocation) ──────────────────
    function pfDrawDonut(segs) {
        var canvas = document.getElementById('portfolioDonutChart');
        if (!canvas) return;
        var wrap   = canvas.parentElement;
        var size   = Math.min(wrap.offsetWidth, wrap.offsetHeight) || 160;
        var dpr    = window.devicePixelRatio || 1;
        canvas.width  = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        canvas.style.width  = size + 'px';
        canvas.style.height = size + 'px';

        var ctx    = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        var cx     = size / 2, cy = size / 2;
        var outerR = size * 0.44, innerR = size * 0.28, gap = 0.04;
        var start  = -Math.PI / 2;

        ctx.clearRect(0, 0, size, size);
        segs.forEach(function (s) {
            var sweep = (s.pct / 100) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, start + gap / 2, start + sweep - gap / 2);
            ctx.arc(cx, cy, innerR, start + sweep - gap / 2, start + gap / 2, true);
            ctx.closePath();
            ctx.fillStyle = s.color;
            ctx.fill();
            start += sweep;
        });
    }

    function pfUpdateDonut() {
        var legendList = document.querySelector('.pf-legend');
        if (!PF.length) {
            var canvas = document.getElementById('portfolioDonutChart');
            if (canvas) {
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            if (legendList) legendList.innerHTML = '<li class="pf-legend-item"><span class="pf-legend-name">No allocation</span></li>';
            return;
        }

        var vals  = {};
        var total = 0;
        PF.forEach(function (h) {
            var qq = _pfQ[h.sym];
            vals[h.sym] = (qq && qq.c > 0) ? toEUR(qq.c) * h.shares : 0;
            total += vals[h.sym];
        });
        if (!total) return;

        var segs = PF.map(function (h) {
            return { pct: (vals[h.sym] / total) * 100, color: h.color, sym: h.sym };
        });

        pfDrawDonut(segs);

        if (legendList) {
            legendList.innerHTML = segs.map(function (s) {
                var meta = PF_META[s.sym] || { name: s.sym };
                return '<li class="pf-legend-item">' +
                    '<span class="pf-legend-dot" style="background:' + s.color + ';" aria-hidden="true"></span>' +
                    '<span class="pf-legend-name">' + meta.name + '</span>' +
                    '<span class="pf-legend-pct">' + s.pct.toFixed(1) + '%</span>' +
                    '</li>';
            }).join('');
        }
    }

    // ── Individual holding row ───────────────────────────
    // Owned stocks always keep their row — only the price/value text changes
    // between a real figure and "Price unavailable" depending on quote success.
    function pfUpdateRow(sym, data) {
        document.querySelectorAll('.pf-holding-row').forEach(function (row) {
            var m = row.querySelector('.pf-holding-meta');
            if (!m || m.textContent.indexOf(sym) === -1) return;
            var h   = PF.filter(function (x) { return x.sym === sym; })[0];
            var p   = row.querySelector('.pf-holding-price');
            var c   = row.querySelector('.pf-holding-change');
            var cv  = row.querySelector('.mini-chart-canvas');

            if (!data) {
                if (p) p.textContent = 'Price unavailable';
                return;
            }
            var val = toEUR(data.c) * (h ? h.shares : 1);
            if (p) p.textContent = fEUR(val);
            if (cv && cv._rCloses && cv._rCloses.length > 1) {
                drawSyncedSparkline(cv, cv._rCloses, 40, c, 'pf-holding-change');
            }
        });
    }

    // ── Portfolio totals (runs only when ALL holdings loaded) ─
    function pfUpdateChangeText() {
        var period = pfActivePeriod();
        var chgEl  = document.querySelector('.pf-value-change');
        if (!chgEl) return;
        var series = window.pfChartData && window.pfChartData[period];
        applyPeriodTrendLabel(chgEl, series, PF_LABELS[period] || '');
    }

    function pfUpdateTotals() {
        var valEl     = document.querySelector('.pf-portfolio-value');
        var investedEl = document.querySelector('.pf-bottom-stats .pf-stat-item:nth-child(1) .pf-stat-value');
        var gainEl    = document.querySelector('.pf-bottom-stats .pf-stat-item:nth-child(2) .pf-stat-value');
        var upEl      = document.querySelector('.pf-bottom-stats .pf-stat-item:nth-child(3) .pf-stat-value');

        if (!PF.length) {
            if (valEl)      valEl.textContent      = '€0.00';
            if (investedEl) investedEl.textContent = '€0.00';
            if (gainEl)     { gainEl.textContent = '€0.00'; gainEl.className = 'pf-stat-value'; }
            if (upEl)       upEl.textContent       = '—';
            pfUpdateDonut();
            return;
        }

        // Guard: only run when all holdings have quotes
        var allPresent = PF.every(function (h) { return _pfQ[h.sym] && _pfQ[h.sym].c > 0; });
        if (!allPresent) return;

        var total = 0, invested = 0;
        PF.forEach(function (h) {
            var qq = _pfQ[h.sym];
            total    += toEUR(qq.c)  * h.shares;
            invested += toEUR(qq.pc) * h.shares;   // previous close used as cost basis (no fake purchase price)
        });
        var gain = total - invested;
        if (valEl)      valEl.textContent      = fEUR(total);
        if (investedEl) investedEl.textContent = fEUR(invested);
        if (gainEl) {
            gainEl.textContent = (gain >= 0 ? '+' : '−') + fEUR(Math.abs(gain));
            gainEl.className   = 'pf-stat-value ' + (gain >= 0 ? 'positive' : 'negative');
        }
        if (upEl)   upEl.textContent   = 'Just now';

        pfUpdateChangeText();
        pfUpdateDonut();
    }

    // ── Recent Activity — real Buy/Sell log only, no fake demo rows ──
    function pfRenderActivityList() {
        var list  = document.getElementById('pfActivityList');
        var empty = document.getElementById('pfActivityEmpty');
        if (!list || !window.ClarivoHoldings) return;

        var activity = window.ClarivoHoldings.getActivity();
        if (!activity.length) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        list.innerHTML = activity.map(function (a) {
            var meta   = PF_META[a.sym] || { name: a.sym };
            var isBuy  = a.type === 'buy';
            var iconCls = isBuy ? 'pf-activity-buy' : 'pf-activity-sell';
            var title  = (isBuy ? 'Bought 1 ' : 'Sold 1 ') + meta.name + ' share';
            var arrow  = isBuy
                ? '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>'
                : '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>';
            return '<div class="pf-activity-row">' +
                '<div class="pf-activity-icon ' + iconCls + '" aria-hidden="true">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + arrow + '</svg>' +
                '</div>' +
                '<div class="pf-activity-info">' +
                    '<p class="pf-activity-title">' + title + '</p>' +
                    '<p class="pf-activity-date">' + fAgo(Math.floor(a.ts / 1000)) + '</p>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    // ── Render holdings list — always shows all 3 supported stocks ──────
    // (mobile-app behaviour). 0-share cards display "0 shares / €0.00" and
    // are still clickable through to Stock Detail. Portfolio stays read-only:
    // there is no Buy/Sell control here, only navigation.
    function pfRenderHoldingsList() {
        var list  = document.getElementById('pfHoldingsList');
        var empty = document.getElementById('pfHoldingsEmpty');
        if (!list) return;
        if (empty) empty.style.display = 'none';   // cards are always shown now

        var holdings = window.ClarivoHoldings ? window.ClarivoHoldings.getHoldings() : { AAPL: 0, TSLA: 0, AMZN: 0 };

        list.innerHTML = ALL_SYMS.map(function (sym) {
            var meta   = PF_META[sym];
            var shares = holdings[sym] || 0;
            var priceText = shares > 0 ? '—' : '€0.00';   // owned rows filled in by pfUpdateRow once quote loads
            return '<a href="stock-detail.html?ticker=' + sym + '" class="pf-holding-row">' +
                '<img src="' + meta.logo + '" alt="' + meta.name + '" class="pf-stock-logo" ' +
                    'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
                '<div class="pf-stock-fallback stock-logo-placeholder ' + meta.cls + '" style="display:none;" aria-hidden="true">' + meta.letter + '</div>' +
                '<div class="pf-holding-info">' +
                    '<p class="pf-holding-name">' + meta.name + '</p>' +
                    '<p class="pf-holding-meta">' + sym + ' &middot; ' + shares + ' share' + (shares === 1 ? '' : 's') + '</p>' +
                '</div>' +
                '<div class="pf-mini-chart-wrap" aria-hidden="true"><canvas class="mini-chart-canvas"></canvas></div>' +
                '<div class="pf-holding-price-col">' +
                    '<p class="pf-holding-price">' + priceText + '</p>' +
                    '<span class="pf-holding-change positive-badge">—</span>' +
                '</div>' +
                '<svg class="pf-holding-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</a>';
        }).join('');
    }

    // ── Mini sparklines for 0-share cards — cache-only, never calls the API ──
    // Represents the stock's own recent trend, not the user's holding, so it's
    // shown even at 0 shares, but only when history is already cached.
    function pfLoadZeroShareSparklines(ownedSyms) {
        ALL_SYMS.forEach(function (sym) {
            if (ownedSyms.indexOf(sym) !== -1) return;   // owned rows are handled by refreshCandles
            var cached = StockDataService.peek(sym);
            if (!cached || !cached.candles || cached.candles.length < 2) return;
            var slice  = avSlice(cached.candles, 'MINI');
            var closes = avCloses(slice);
            document.querySelectorAll('.pf-holding-row').forEach(function (row) {
                var m = row.querySelector('.pf-holding-meta');
                if (!m || m.textContent.indexOf(sym) === -1) return;
                var cv = row.querySelector('.mini-chart-canvas');
                var c  = row.querySelector('.pf-holding-change');
                if (cv) {
                    drawRealSparkline(cv, closes, 40);
                    applyTrendBadge(c, closes, 'pf-holding-change');
                }
            });
        });
    }

    // ── Portfolio chart (candle series) ─────────────────
    function buildPfSeries(cmap) {
        var days = {};
        PF.forEach(function (h) {
            var rows = cmap[h.sym];
            if (!rows || !rows.length) return;
            rows.forEach(function (r) {
                days[r.date] = (days[r.date] || 0) + toEUR(r.close) * h.shares;
            });
        });
        return Object.keys(days).sort().map(function (day) { return days[day]; });
    }

    function pfSliceSeries(series) {
        var n = series.length;
        return {
            '1D':  series.slice(Math.max(0, n - 2)),
            '1W':  series.slice(Math.max(0, n - 5)),
            '1M':  series.slice(Math.max(0, n - 22)),
            '3M':  series.slice(Math.max(0, n - 66)),
            '1Y':  series,
            'ALL': series
        };
    }

    function pfUpdateChart(series) {
        if (series.length < 2) {
            if (window.pfChartData) {
                ['1D', '1W', '1M', '3M', '1Y', 'ALL'].forEach(function (p) {
                    window.pfChartData[p] = [];
                });
            }
            if (typeof initPortfolioValueChart === 'function') initPortfolioValueChart();
            pfUpdateChangeText();
            return;
        }
        var slices = pfSliceSeries(series);
        if (window.pfChartData) {
            Object.keys(slices).forEach(function (p) {
                window.pfChartData[p] = slices[p];
            });
        }
        if (typeof initPortfolioValueChart === 'function') initPortfolioValueChart();
        pfUpdateChangeText();
    }

    function initPortfolioPage() {
        if (!document.getElementById('portfolioValueChart')) return;
        patchDrawMiniCharts();

        PF = pfBuildHoldings();
        _pfQ = {};
        console.log('[Clarivo Portfolio] holdings loaded from LocalStorage', PF);
        pfRenderHoldingsList();
        pfRenderActivityList();
        pfLoadZeroShareSparklines(PF.map(function (h) { return h.sym; }));

        // Wipe hardcoded fake values from script.js so the chart is blank
        // until real historical data arrives — prevents showing wrong EUR totals.
        if (window.pfChartData) {
            ['1D','1W','1M','3M','1Y','ALL'].forEach(function (p) {
                window.pfChartData[p] = [];
            });
            if (typeof window.initPortfolioValueChart === 'function') window.initPortfolioValueChart();
        }

        if (!PF.length) {
            console.log('[Clarivo Portfolio] no holdings — skipping quote/history API calls (cards still shown from cache only)');
            pfUpdateTotals();
            return;
        }

        // Market status badge
        var badge = document.querySelector('.pf-market-badge');
        if (badge) {
            var open = isMarketOpen();
            var dot  = badge.querySelector('.pf-market-dot');
            if (dot) dot.style.background = open ? 'var(--color-positive)' : 'var(--color-negative)';
            var txt = badge.lastChild;
            if (txt && txt.nodeType === 3) txt.textContent = open ? ' Market is Open' : ' Market is Closed';
        }

        function refreshQuotes() {
            refreshEUR(function () {
                PF.forEach(function (h) {
                    q(h.sym, function (e, d) {
                        var nd = normalizeQuote(d);
                        if (!e && nd) {
                            _pfQ[h.sym] = nd;
                            pfUpdateRow(h.sym, nd);
                            pfUpdateTotals();
                            return;
                        }

                        // Live quote failed (API limit/error) — fall back to the
                        // last real close from cached historical data, the same
                        // history this page's own mini chart already uses.
                        // Cache-only read; never triggers a new network call.
                        var cached  = window.StockDataService && StockDataService.peek(h.sym);
                        var candles = cached && cached.candles;
                        if (candles && candles.length) {
                            var last = candles[candles.length - 1];
                            var prev = candles.length > 1 ? candles[candles.length - 2] : last;
                            var fallbackQuote = {
                                c:  last.close,
                                pc: prev.close,
                                dp: prev.close ? ((last.close - prev.close) / prev.close * 100) : 0,
                                o:  last.open  || last.close,
                                h:  last.high  || last.close,
                                l:  last.low   || last.close,
                                v:  last.volume || 0
                            };
                            console.warn('[Clarivo Portfolio] quote unavailable for', h.sym, '— using last real close from cached history');
                            _pfQ[h.sym] = fallbackQuote;
                            pfUpdateRow(h.sym, fallbackQuote);
                            pfUpdateTotals();
                            return;
                        }

                        console.warn('[Clarivo Portfolio] quote unavailable for', h.sym, '— no cache available, showing Price unavailable');
                        pfUpdateRow(h.sym, null);
                    });
                });
            });
        }

        function refreshCandles() {
            refreshEUR(function () {
                var loaded = 0, cmap = {};
                PF.forEach(function (h) {
                    avFetch(h.sym, function (e, rows) {
                        cmap[h.sym] = rows || null;
                        if (!e && rows) {
                            var slice  = avSlice(rows, 'MINI');
                            var closes = avCloses(slice);
                            var fd     = slice[0].date;
                            var ld     = slice[slice.length - 1].date;
                            document.querySelectorAll('.pf-holding-row').forEach(function (row) {
                                var m = row.querySelector('.pf-holding-meta');
                                if (!m || m.textContent.indexOf(h.sym) === -1) return;
                                var cv = row.querySelector('.mini-chart-canvas');
                                var c  = row.querySelector('.pf-holding-change');
                                if (cv) {
                                    sparkSave(cv, closes, h.sym, '30D', fd, ld);
                                    logChart('portfolio/mini-sparkline', h.sym, '30D', 'API', closes, 'api-response', fd, ld);
                                    drawRealSparkline(cv, closes, 40);
                                    applyTrendBadge(c, closes, 'pf-holding-change');
                                }
                            });
                        }
                        if (++loaded === PF.length) pfUpdateChart(buildPfSeries(cmap));
                    });
                });
            });
        }

        // Tab click: script.js fires first (updates activePfPeriod + redraws chart),
        // then our listener defers one tick and recomputes the change text.
        var tabsEl = document.getElementById('pfTimeTabs');
        if (tabsEl) {
            tabsEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.pf-time-tab');
                if (!btn) return;
                setTimeout(function () {
                    if (typeof initPortfolioValueChart === 'function') initPortfolioValueChart();
                    pfUpdateChangeText();
                }, 0);
            });
        }

        refreshQuotes();
        refreshCandles();
        setInterval(refreshQuotes, TTL.q);
        setInterval(refreshCandles, HIST_REFRESH_MS);
    }

    // ════════════════════════════════════════════════════
    // NEWS PAGE  (news.html)
    // ════════════════════════════════════════════════════

    var NS_SYMS = ['AAPL', 'TSLA', 'AMZN', 'MSFT', 'NVDA'];

    function nsUpdateCard(sym, data) {
        document.querySelectorAll('#snapshotTrack .ns-card').forEach(function (card) {
            var t = card.querySelector('.ns-ticker');
            if (!t || t.textContent.trim() !== sym) return;
            var p = card.querySelector('.ns-price');
            var c = card.querySelector('.ns-change');
            var cv = card.querySelector('.ns-mini-chart');
            if (p) p.textContent = fEUR(toEUR(data.c));
            if (cv && cv._rCloses && cv._rCloses.length > 1) {
                drawSyncedSparkline(cv, cv._rCloses, 48, c, 'ns-change');
            } else if (c) {
                c.textContent = fChg(data.dp);
                c.className   = 'ns-change ' + badgeCls(data.dp);
            }
        });
    }

    function nsUpdateArticles(articles) {
        if (!articles || !articles.length) return;

        // ── Featured card ──────────────────────────────────────
        var feat = document.querySelector('.news-featured-card');
        if (feat && articles[0]) {
            var a    = articles[0];
            var tEl  = feat.querySelector('.news-featured-title');
            var dEl  = feat.querySelector('.news-featured-desc');
            var mEls = feat.querySelectorAll('.news-meta-text');
            var bgEl = feat.querySelector('.news-featured-bg');

            if (tEl) tEl.textContent = a.headline || '';
            if (dEl) dEl.textContent = (a.summary || '').substring(0, 180) + '…';
            if (mEls[0]) mEls[0].textContent = a.source || 'MarketWatch';
            if (mEls[1]) mEls[1].textContent  = fAgo(a.datetime);

            setFeaturedNewsImage(bgEl, getArticleImage(a));
            if (a.url) {
                feat.style.cursor = 'pointer';
                feat.onclick = function () { window.open(a.url, '_blank', 'noopener'); };
            }
        }

        // ── More News grid — rebuilt from live API ─────────────
        var grid = document.getElementById('moreNewsGrid');
        if (grid && articles.length > 1) {
            var moreArts = articles.slice(1, 5);
            grid.innerHTML = '';
            moreArts.forEach(function (art) {
                var col = document.createElement('div');
                col.className = 'col-sm-6 col-12';

                var article = document.createElement('article');
                article.className = 'news-more-card news-card-item';
                if (art.url) {
                    article.style.cursor = 'pointer';
                    article.onclick = function () { window.open(art.url, '_blank', 'noopener'); };
                }

                var imgWrap = document.createElement('div');
                imgWrap.className = 'nmc-img-wrap';
                renderNewsImage(imgWrap, getArticleImage(art), 'news-card-image');

                var body = document.createElement('div');
                body.className = 'nmc-body';

                var title = document.createElement('p');
                title.className = 'nmc-title';
                title.textContent = (art.headline || '').substring(0, 80);

                var desc = document.createElement('p');
                desc.className = 'nmc-desc';
                desc.textContent = (art.summary || '').substring(0, 100) + '…';

                var meta = document.createElement('p');
                meta.className = 'nmc-meta';
                meta.innerHTML = (art.source || 'Reuters') + ' <span class="nmc-sep">·</span> ' + fAgo(art.datetime);

                body.appendChild(title);
                body.appendChild(desc);
                body.appendChild(meta);
                article.appendChild(imgWrap);
                article.appendChild(body);
                col.appendChild(article);
                grid.appendChild(col);
            });
        }

        // ── News list rows ──────────────────────────────────────
        var rows = document.querySelectorAll('#newsListRows .news-list-row');
        articles.slice(5, 5 + rows.length).forEach(function (art, i) {
            var row = rows[i]; if (!row) return;
            var t     = row.querySelector('.nlr-title');
            var d     = row.querySelector('.nlr-desc');
            var m     = row.querySelector('.nlr-meta');
            var thumb = row.querySelector('.nlr-thumb');

            if (t) t.textContent = art.headline || '';
            if (d) d.textContent = (art.summary || '').substring(0, 80) + '…';
            if (m) m.innerHTML   = (art.source || 'Reuters') + ' <span class="nlr-sep">·</span> ' + fAgo(art.datetime);

            if (thumb) {
                renderNewsImage(thumb, getArticleImage(art), 'nlr-thumb-img news-card-image');
            }

            if (art.url) {
                row.style.cursor = 'pointer';
                row.onclick = function () { window.open(art.url, '_blank', 'noopener'); };
            }
        });
    }

    function initNewsPage() {
        if (!document.querySelector('.news-snapshot-section')) return;
        patchDrawNewsSnapshots();

        function refreshNsSparklines() {
            NS_SYMS.forEach(function (sym) {
                avFetch(sym, function (e, rows) {
                    if (e || !rows) return;
                    var slice  = avSlice(rows, 'MINI');
                    var closes = avCloses(slice);
                    var fd     = slice[0].date;
                    var ld     = slice[slice.length - 1].date;
                    document.querySelectorAll('#snapshotTrack .ns-card').forEach(function (card) {
                        var t = card.querySelector('.ns-ticker');
                        if (!t || t.textContent.trim() !== sym) return;
                        var cv = card.querySelector('.ns-mini-chart');
                        var c  = card.querySelector('.ns-change');
                        if (cv) {
                            sparkSave(cv, closes, sym, '30D', fd, ld);
                            logChart('news/snapshot-sparkline', sym, '30D', 'API', closes, 'api-response', fd, ld);
                            drawRealSparkline(cv, closes, 48);
                            applyTrendBadge(c, closes, 'ns-change');
                        }
                    });
                });
            });
        }

        function refresh() {
            refreshEUR(function () {
                NS_SYMS.forEach(function (sym) {
                    q(sym, function (e, d) { var nd = normalizeQuote(d); if (!e && nd) nsUpdateCard(sym, nd); });
                });
                newsAll(function (e, a) { if (!e && a && a.length) nsUpdateArticles(a); });
            });
        }
        refresh();
        refreshNsSparklines();
        setInterval(refresh, TTL.q);
        setInterval(refreshNsSparklines, HIST_REFRESH_MS);
    }

    // ════════════════════════════════════════════════════
    // STOCK DETAIL PAGE  (stock-detail.html?ticker=XXXX)
    // ════════════════════════════════════════════════════

    function fVol(v) {
        if (!v) return '—';
        if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        return (v / 1e3).toFixed(0) + 'K';
    }

    function fMarketCap(millionsUSD) {
        if (!millionsUSD) return '—';
        var eur = millionsUSD * 1e6 * _eur;
        if (eur >= 1e12) return '€' + (eur / 1e12).toFixed(2) + 'T';
        if (eur >= 1e9)  return '€' + (eur / 1e9).toFixed(1) + 'B';
        return '€' + (eur / 1e6).toFixed(0) + 'M';
    }

    function sdDateStr(daysBack) {
        var d = new Date(Date.now() - daysBack * 86400000);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function sdBuildNewsHTML(articles) {
        if (!articles || !articles.length) return '<p style="color:var(--text-muted);font-size:13px;">No recent news found.</p>';
        return articles.slice(0, 5).map(function (art) {
            var url  = art.url || '#';
            var thumb = art.image
                ? '<div class="sd-news-icon" aria-hidden="true" style="width:52px;height:48px;flex-shrink:0;border-radius:8px;overflow:hidden;">'
                  + '<img src="' + art.image + '" alt="" style="width:100%;height:100%;object-fit:cover;"'
                  + ' onerror="this.parentNode.style.display=\'none\'">'
                  + '</div>'
                : '<div class="sd-news-icon" aria-hidden="true">'
                  + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                  + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
                  + '<polyline points="14 2 14 8 20 8"/>'
                  + '<line x1="16" y1="13" x2="8" y2="13"/>'
                  + '<line x1="16" y1="17" x2="8" y2="17"/>'
                  + '</svg></div>';
            return '<div class="sd-news-row" style="cursor:pointer;" onclick="window.open(\'' +
                url.replace(/'/g, "\\'") + '\',\'_blank\',\'noopener\')">' +
                thumb +
                '<div class="sd-news-body">' +
                    '<p class="sd-news-title">' + (art.headline || '').substring(0, 80) + (art.headline && art.headline.length > 80 ? '…' : '') + '</p>' +
                    '<p class="sd-news-time">' + (art.source || '') + (art.source ? ' · ' : '') + fAgo(art.datetime) + '</p>' +
                '</div>' +
                '<svg class="sd-news-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</div>';
        }).join('');
    }

    // Inject real candle series into sdChartCache (and metadata store) used by script.js.
    // Real data is tagged source:'API' — generateStockData fallback is tagged 'fallback'.
    // On resize, drawStockChart reads sdChartCache directly — no regeneration occurs.
    function sdInjectCandles(sym, series, periods, firstDate, lastDate) {
        if (!window.sdChartCache)     window.sdChartCache   = {};
        if (!window._sdChartMeta)     window._sdChartMeta   = {};
        periods.forEach(function (p) {
            window.sdChartCache[sym + '_' + p]   = series[p];
            window._sdChartMeta[sym + '_' + p]   = {
                source: 'API', sym: sym, period: p,
                firstDate: firstDate || '?', lastDate: lastDate || '?'
            };
        });
    }

    // Slice daily series for each period; cap 1Y at 252 (AV returns 20+ years)
    // 1D uses 10 trading days: daily data has no intraday ticks, so 2 points looks flat.
    function sdSliceSeries(closes) {
        var n = closes.length;
        return {
            '1D' : closes.slice(Math.max(0, n - 10)),
            '1W' : closes.slice(Math.max(0, n - 5)),
            '1M' : closes.slice(Math.max(0, n - 22)),
            '3M' : closes.slice(Math.max(0, n - 66)),
            '1Y' : closes.slice(Math.max(0, n - 252)),
            'ALL': closes
        };
    }

    function initStockDetailPage() {
        if (!document.getElementById('stockDetailMain')) return;

        var params = new URLSearchParams(window.location.search);
        var sym    = (params.get('ticker') || 'AAPL').toUpperCase();
        var today  = sdDateStr(0);
        var week   = sdDateStr(8);
        var _sdLastPriceEUR = null;   // last known cached/live price — used by Buy/Sell + holding card

        // ── Update DOM with live quote ──────────────────
        function sdUpdateQuote(data) {
            var priceEl  = document.getElementById('sdStockPrice');
            var openEl   = document.getElementById('sdOpen');
            var highEl   = document.getElementById('sdHigh');
            var lowEl    = document.getElementById('sdLow');
            var volEl    = document.getElementById('sdVolume');

            _sdLastPriceEUR = toEUR(data.c);

            if (priceEl)  priceEl.textContent  = fEUR(toEUR(data.c));
            if (openEl)  openEl.textContent  = fEUR(toEUR(data.o));
            if (highEl)  { highEl.textContent = fEUR(toEUR(data.h)); highEl.className = 'sd-info-value positive'; }
            if (lowEl)   { lowEl.textContent  = fEUR(toEUR(data.l)); lowEl.className  = 'sd-info-value negative'; }
            if (volEl)   volEl.textContent   = fVol(data.v);

            if (window.currentStock) {
                window.currentStock.priceRaw = data.c;
            }
            sdUpdateHoldingCard();
        }

        // ── "Your Holding" card — driven by LocalStorage + last known price ──
        function sdUpdateHoldingCard() {
            var sharesEl = document.getElementById('sdHoldingShares');
            var valueEl  = document.getElementById('sdHoldingValue');
            if (!sharesEl || !valueEl || !window.ClarivoHoldings) return;
            var shares = window.ClarivoHoldings.getShares(sym);
            sharesEl.textContent = shares + (shares === 1 ? ' share' : ' shares');
            if (_sdLastPriceEUR == null) {
                valueEl.textContent = 'Price data unavailable';
            } else {
                valueEl.textContent = fEUR(_sdLastPriceEUR * shares);
            }
        }

        // ── Buy / Sell — LocalStorage only, no API call ──────────────
        function sdCompanyName() {
            return (PF_META[sym] && PF_META[sym].name) || sym;
        }

        function sdShowTradeMessage(msg) {
            var el = document.getElementById('sdTradeMessage');
            if (el) el.textContent = msg;
        }

        var buyBtn  = document.getElementById('sdBtnBuy');
        var sellBtn = document.getElementById('sdBtnSell');

        // Portfolio trading is intentionally limited to AAPL/TSLA/AMZN
        // (window.ClarivoHoldings.SYMBOLS). Buy/Sell must not appear to work
        // for any other symbol, since holdings.js never persists shares for
        // a symbol outside that list.
        var tradeSupported = window.ClarivoHoldings &&
            window.ClarivoHoldings.SYMBOLS.indexOf(sym) !== -1;

        if (!tradeSupported) {
            if (buyBtn)  buyBtn.disabled  = true;
            if (sellBtn) sellBtn.disabled = true;
            sdShowTradeMessage('Portfolio trading is available for AAPL, TSLA, and AMZN only.');
        } else {
            if (buyBtn) {
                buyBtn.addEventListener('click', function () {
                    window.ClarivoHoldings.buyShare(sym);
                    sdUpdateHoldingCard();
                    sdShowTradeMessage('Bought 1 share of ' + sdCompanyName() + '.');
                });
            }
            if (sellBtn) {
                sellBtn.addEventListener('click', function () {
                    var before = window.ClarivoHoldings.getShares(sym);
                    if (before <= 0) {
                        sdShowTradeMessage('You do not own any ' + sdCompanyName() + ' shares.');
                        return;
                    }
                    window.ClarivoHoldings.sellShare(sym);
                    sdUpdateHoldingCard();
                    sdShowTradeMessage('Sold 1 share of ' + sdCompanyName() + '.');
                });
            }
        }
        sdUpdateHoldingCard();

        // ── Update chart with Alpha Vantage rows ────────
        function sdUpdateChart(rows) {
            if (!rows || rows.length < 2) {
                console.warn('[Clarivo Chart] stock-detail | sym:', sym,
                    '| Not enough data from Alpha Vantage (got', rows ? rows.length : 0, 'points)');
                return;
            }

            var fd = rows[0].date;
            var ld = rows[rows.length - 1].date;

            var closes  = avCloses(rows);
            var series  = sdSliceSeries(closes);
            var PERIODS = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
            sdInjectCandles(sym, series, PERIODS, fd, ld);

            var period = window.activeStockPeriod || '1W';
            var drawn  = series[period] || closes;
            logChart('stock-detail/main-chart', sym, period, 'API', drawn, 'api-response', fd, ld);

            if (typeof drawStockChart === 'function') drawStockChart(period);
        }

        // ── Fetch all data ──────────────────────────────
        function refresh() {
            refreshEUR(function () {
                // 1. Live quote
                q(sym, function (e, d) {
                    var nd = normalizeQuote(d);
                    if (!e && nd) sdUpdateQuote(nd);
                });

                // 2. Historical closes from Twelve Data (Market Cap not shown —
                //    Twelve Data's free tier has no reliable market-cap field,
                //    so sdMarketCap stays at its honest "—" default rather than
                //    calling a removed/fake endpoint.
                avFetch(sym, function (e, rows) {
                    if (!e && rows) sdUpdateChart(rows);
                });

                // 3. Company news — NewsAPI, fallback Marketaux
                newsForSymbol(sym, week, today, function (e, arts) {
                    var container = document.getElementById('sdNewsContainer');
                    if (!container) return;
                    if (!e && arts && arts.length > 0) {
                        container.innerHTML = sdBuildNewsHTML(arts);
                    } else {
                        newsAll(function (e2, general) {
                            if (!e2 && general && general.length) {
                                container.innerHTML = sdBuildNewsHTML(general);
                            }
                        });
                    }
                });
            });
        }

        // Run initial fetch — wait a tick so script.js window.load has run first
        setTimeout(refresh, 200);
        // Quote refreshes on the same cadence as the shared quote cache TTL,
        // so this just re-reads the cache and only hits the API once per TTL.
        setInterval(function () {
            refreshEUR(function () {
                q(sym, function (e, d) { var nd = normalizeQuote(d); if (!e && nd) sdUpdateQuote(nd); });
            });
        }, TTL.q);
        setInterval(function () {
            avFetch(sym, function (e, rows) {
                if (!e && rows) sdUpdateChart(rows);
            });
        }, HIST_REFRESH_MS);
    }

    // ════════════════════════════════════════════════════
    // FLOATING HERO CHIPS  (market & news heroes)
    // ════════════════════════════════════════════════════

    function updateFloatingChips() {
        var map = [
            { sym: 'AAPL', prefix: 'AAPL' }, { sym: 'TSLA', prefix: 'TSLA' },
            { sym: 'NVDA', prefix: 'NVDA' }, { sym: 'MSFT', prefix: 'MSFT' },
            { sym: 'SPY',  prefix: 'S&P'  }, { sym: 'QQQ',  prefix: 'NQ'   },
            { sym: 'EWG',  prefix: 'DAX'  }, { sym: 'EWU',  prefix: 'FTSE' }
        ];
        map.forEach(function (cfg) {
            q(cfg.sym, function (e, d) {
                var nd = normalizeQuote(d); if (e || !nd) { d = null; return; }
                d = nd;
                if (e || !d) return;
                var tag = cfg.prefix + ' ' + (d.dp >= 0 ? '+' : '') + d.dp.toFixed(2) + '%';
                document.querySelectorAll('.globe-ticker, .mk-float-chip').forEach(function (el) {
                    if (el.textContent.indexOf(cfg.prefix) > -1) el.textContent = tag;
                });
            });
        });
    }

    // ════════════════════════════════════════════════════
    // GEOLOCATION — shows "Your current location: City, Country" in every navbar
    // Uses browser Geolocation → Nominatim reverse-geocode, falls back to ipapi.co
    // ════════════════════════════════════════════════════
    function initGeolocation() {
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        var badge = document.createElement('span');
        badge.id = 'clarivo-geo';
        badge.style.cssText = 'font-size:13px;color:#42D6B5;display:inline-flex;background:rgba(66,214,181,0.1);'
            + 'border:1px solid rgba(66,214,181,0.3);border-radius:20px;padding:3px 10px;'
            + 'align-items:center;gap:6px;white-space:nowrap;margin-right:8px;font-weight:500;';
        badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"'
            + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<circle cx="12" cy="12" r="3"/><path d="M19.94 11A8 8 0 1 0 12 20.94"/>'
            + '<path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>Locating…';
        navActions.insertBefore(badge, navActions.firstChild);

        function show(city, country) {
            badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"'
                + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                + (city ? city + ', ' : '') + (country || '');
        }

        function ipFallback() {
            fetch('https://ipapi.co/json/')
                .then(function (r) { return r.json(); })
                .then(function (d) { show(d.city || '', d.country_name || ''); })
                .catch(function () {
                    badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"'
                        + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                        + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                        + 'Location unavailable';
                });
        }

        if (!navigator.geolocation) { ipFallback(); return; }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                fetch('https://nominatim.openstreetmap.org/reverse?format=json'
                    + '&lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude,
                    { headers: { 'Accept-Language': 'en' } })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var a = d.address || {};
                        show(a.city || a.town || a.county || '', a.country || '');
                    })
                    .catch(ipFallback);
            },
            function (err) {
                if (err && err.code === 1) {
                    badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"'
                        + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                        + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                        + 'Location denied';
                    return;
                }
                ipFallback();
            },
            { timeout: 8000 }
        );
    }

    // ════════════════════════════════════════════════════
    // CHART.JS — Stock Detail main chart
    // Overrides script.js's drawStockChart() to use Chart.js.
    // Only active when Chart is loaded (stock-detail.html).
    // ════════════════════════════════════════════════════
    function patchDrawStockChart() {
        if (typeof Chart === 'undefined' || window._clarivo_dscPatched) return;
        window._clarivo_dscPatched = true;

        var _sdChart = null;

        window.drawStockChart = function (period) {
            var canvas = document.getElementById('stockChart');
            if (!canvas) return;

            var key  = (window.currentStock ? window.currentStock.ticker : '__init') + '_' + (period || '1W');
            var data  = (window.sdChartCache && window.sdChartCache[key]) || [];
            var pal = chartPalette(getDisplayTrendFromValues(data).positive);
            var color   = pal.line;
            var bgColor = pal.fill;

            var changeEl = document.getElementById('sdStockChange');
            if (changeEl && data.length >= 2) {
                applyTrendBadge(changeEl, data, 'sd-main-badge');
            }

            if (_sdChart) {
                _sdChart.data.labels = data.map(function (_, i) { return i; });
                _sdChart.data.datasets[0].data        = data;
                _sdChart.data.datasets[0].borderColor      = color;
                _sdChart.data.datasets[0].backgroundColor  = bgColor;
                _sdChart.data.datasets[0].tension          = CHART_LINE_TENSION;
                _sdChart.update('none');
            } else {
                _sdChart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: data.map(function (_, i) { return i; }),
                        datasets: [{
                            data: data, borderColor: color, backgroundColor: bgColor,
                            fill: true, tension: CHART_LINE_TENSION, pointRadius: 0,
                            pointHoverRadius: 5, borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 350 },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index', intersect: false,
                                callbacks: {
                                    title: function () { return ''; },
                                    label: function (ctx) {
                                        return '  €' + toEUR(ctx.raw).toFixed(2);
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { display: false },
                            y: { display: false, beginAtZero: false }
                        }
                    }
                });
            }
        };
    }

    // ════════════════════════════════════════════════════
    // CHART.JS — Portfolio value chart
    // Overrides script.js's initPortfolioValueChart() to use Chart.js.
    // Only active when Chart is loaded (portfolio.html).
    // ════════════════════════════════════════════════════
    function patchInitPortfolioValueChart() {
        if (typeof Chart === 'undefined' || window._clarivo_ipvcPatched) return;
        window._clarivo_ipvcPatched = true;

        var _pfChart = null;

        window.initPortfolioValueChart = function () {
            var canvas = document.getElementById('portfolioValueChart');
            if (!canvas) return;

            var unavail = document.getElementById('pfChartUnavailable');
            var period  = (typeof window.activePfPeriod !== 'undefined') ? window.activePfPeriod : '1W';
            var data    = window.pfChartData ? (window.pfChartData[period] || []) : [];

            if (!data || data.length < 2) {
                if (_pfChart) {
                    _pfChart.destroy();
                    _pfChart = null;
                }
                canvas.style.display = 'none';
                if (unavail) unavail.style.display = 'flex';
                return;
            }

            canvas.style.display = 'block';
            if (unavail) unavail.style.display = 'none';

            var pal = chartPalette(getDisplayTrendFromValues(data).positive);

            if (_pfChart) {
                _pfChart.data.labels = data.map(function (_, i) { return i; });
                _pfChart.data.datasets[0].data = data;
                _pfChart.data.datasets[0].borderColor = pal.line;
                _pfChart.data.datasets[0].backgroundColor = pal.fill;
                _pfChart.data.datasets[0].tension = CHART_LINE_TENSION;
                _pfChart.update('none');
            } else {
                _pfChart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: data.map(function (_, i) { return i; }),
                        datasets: [{
                            data: data, borderColor: pal.line,
                            backgroundColor: pal.fill,
                            fill: true, tension: CHART_LINE_TENSION, pointRadius: 0,
                            pointHoverRadius: 5, borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 350 },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index', intersect: false,
                                callbacks: {
                                    title: function () { return ''; },
                                    label: function (ctx) {
                                        return '  €' + ctx.raw.toFixed(2);
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { display: false },
                            y: { display: false, beginAtZero: false }
                        }
                    }
                });
            }

            var chgEl = document.querySelector('.pf-value-change');
            if (chgEl) applyPeriodTrendLabel(chgEl, data, PF_LABELS[period] || '');
        };
    }

    // ════════════════════════════════════════════════════
    // BOOT
    // ════════════════════════════════════════════════════
    function boot() {
        initGeolocation();
        initHomePage();
        initMarketPage();
        initPortfolioPage();
        initNewsPage();
        initStockDetailPage();
        if (document.querySelector('.globe-ticker, .mk-float-chip')) {
            updateFloatingChips();
            setInterval(updateFloatingChips, 60000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
        setTimeout(boot, 0);
    }

})();
