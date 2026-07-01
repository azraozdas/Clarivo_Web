// Clarivo — fallback-data.js
// Tier 4 — absolute last resort (per teacher guidance), generalized from the
// single Market Summary case that used to live in api.js (MS_LAST_RESORT).
// Used ONLY when live Twelve Data AND every cache layer (memory,
// localStorage, any-age stale cache) have all failed for a symbol.
//
// window.CLARIVO_FALLBACK = { history, quotes, news }
//   history[SYM] -> { symbol, company, period, interval, candles, stats, prediction }
//                    same shape StockDataService.normalize() produces.
//   quotes[SYM]  -> { c, pc, dp, o, h, l, v } — same shape tdQuoteFetch() produces,
//                    derived from history[SYM] so price and chart always agree.
//   news         -> array of already-normalized articles.
//
// Deterministic: fixed sine/cosine formula per symbol, no Math.random —
// values do not change between refreshes, only the trailing date advances.
(function () {
    'use strict';

    function round2(n) { return Math.round(n * 100) / 100; }

    // Fixed-formula price walk — same shape every time, no Math.random.
    function genCandles(basePrice, amp, days) {
        var candles = [];
        var today = new Date();
        var t = 0;
        for (var i = days - 1; i >= 0; i--) {
            var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            var dow = d.getDay();
            if (dow === 0 || dow === 6) continue; // skip weekends — looks like trading days
            t++;
            var wave  = Math.sin(t / 9) * amp + Math.cos(t / 23) * (amp * 0.4);
            var drift = (t / days) * (amp * 0.6);
            var close = basePrice + wave + drift;
            var open  = close - Math.sin(t / 5) * (amp * 0.15);
            var high  = Math.max(open, close) + amp * 0.08;
            var low   = Math.min(open, close) - amp * 0.08;
            candles.push({
                date:   d.toISOString().slice(0, 10),
                open:   round2(open),
                high:   round2(high),
                low:    round2(low),
                close:  round2(close),
                volume: 1000000
            });
        }
        return candles;
    }

    function buildHistory(sym, basePrice, amp) {
        return {
            symbol:     sym,
            company:    { name: sym, ticker: sym },
            period:     '1y',
            interval:   '1d',
            candles:    genCandles(basePrice, amp, 130),
            stats:      null,
            prediction: null
        };
    }

    // sym -> [basePrice, amplitude] — plausible static reference levels.
    var SEEDS = {
        AAPL: [195, 6],
        TSLA: [250, 14],
        AMZN: [185, 7],
        MSFT: [430, 10],
        NVDA: [120, 8],
        SAP:  [185, 5],
        SPY:  [540, 9],
        QQQ:  [480, 11],
        EWJ:  [68,  2],
        FXI:  [28,  1.5],
        EWU:  [33,  1.2],
        EWG:  [32,  1.3],
        EWQ:  [30,  1.2]
    };

    var history = {};
    var quotes  = {};
    Object.keys(SEEDS).forEach(function (sym) {
        var seed = SEEDS[sym];
        var h = buildHistory(sym, seed[0], seed[1]);
        history[sym] = h;

        var c = h.candles;
        var last = c[c.length - 1];
        var prev = c.length > 1 ? c[c.length - 2] : last;
        quotes[sym] = {
            c:  last.close,
            pc: prev.close,
            dp: prev.close ? round2((last.close - prev.close) / prev.close * 100) : 0,
            o:  last.open,
            h:  last.high,
            l:  last.low,
            v:  last.volume
        };
    });

    // Fixed hour-offsets so "Xh ago" never looks broken, without Math.random.
    var NOW = Math.floor(Date.now() / 1000);
    var HOUR = 3600;
    var news = [
        {
            headline: 'Markets steady as investors weigh central bank guidance',
            summary:  'Major indices held near recent levels as traders assessed the latest rate commentary and corporate earnings.',
            datetime: NOW - 2 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'business'
        },
        {
            headline: 'Tech shares mixed amid ongoing AI infrastructure spending',
            summary:  'Large technology companies continue to invest heavily in data-center capacity, with results across the sector varying by name.',
            datetime: NOW - 5 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'technology'
        },
        {
            headline: 'Energy prices hold range as supply outlook stays balanced',
            summary:  'Crude benchmarks traded in a narrow band as markets balanced demand forecasts against production data.',
            datetime: NOW - 9 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'business'
        },
        {
            headline: 'European equities track a quiet session for global markets',
            summary:  'Trading volumes were light across major European exchanges as investors awaited fresh economic data.',
            datetime: NOW - 14 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'business'
        },
        {
            headline: 'Currency markets stable ahead of upcoming data releases',
            summary:  'Major currency pairs stayed within recent ranges as traders positioned for upcoming macroeconomic indicators.',
            datetime: NOW - 20 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'business'
        },
        {
            headline: 'Retail and consumer names in focus for investors this week',
            summary:  'Analysts are watching consumer spending trends as a signal for the broader economic outlook heading into the new quarter.',
            datetime: NOW - 26 * HOUR,
            source:   'Clarivo Wire',
            url:      '',
            category: 'business'
        }
    ];

    window.CLARIVO_FALLBACK = { history: history, quotes: quotes, news: news };
    console.log('[Clarivo Fallback] fallback-data.js loaded — symbols:', Object.keys(SEEDS).join(', '));
}());
