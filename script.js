// Clarivo — script.js

// =============================================
// 1. PROFILE ICON — link based on login state
// =============================================

// Check localStorage for a saved user session.
// If a user is logged in, send them to profile.html.
// If not, send them to auth.html (login/register page).

var profileBtn = document.getElementById("navProfileBtn");

if (profileBtn) {
    var savedUser = localStorage.getItem("clarivoUser");

    if (savedUser) {
        profileBtn.href = "profile.html";
        profileBtn.setAttribute("aria-label", "My Profile");
    } else {
        profileBtn.href = "auth.html";
        profileBtn.setAttribute("aria-label", "Sign in");
    }
}

// =============================================
// 2. NAVBAR — scroll effect
// =============================================

window.addEventListener("scroll", function () {
    var navbar = document.getElementById("mainNav");
    if (window.scrollY > 50) {
        navbar.style.backgroundColor = "rgba(3, 13, 28, 0.98)";
    } else {
        navbar.style.backgroundColor = "rgba(3, 13, 28, 0.92)";
    }
});

// Close mobile nav when a link is clicked
var navItems = document.querySelectorAll("#navbarLinks .nav-link");
var navCollapse = document.getElementById("navbarLinks");

navItems.forEach(function (link) {
    link.addEventListener("click", function () {
        if (window.innerWidth < 992 && navCollapse.classList.contains("show")) {
            var bsCollapse = bootstrap.Collapse.getInstance(navCollapse);
            if (bsCollapse) {
                bsCollapse.hide();
            }
        }
    });
});

// =============================================
// 2. MARKET SNAPSHOT — stock data
// =============================================

var stocks = [
    {
        name: "Apple Inc.",
        ticker: "AAPL",
        price: "€192.45",
        change: "+1.8%",
        positive: true,
        initial: "A",
        colorClass: "apple"
    },
    {
        name: "Tesla",
        ticker: "TSLA",
        price: "€248.20",
        change: "-0.9%",
        positive: false,
        initial: "T",
        colorClass: "tesla"
    },
    {
        name: "Amazon",
        ticker: "AMZN",
        price: "€181.60",
        change: "+2.1%",
        positive: true,
        initial: "A",
        colorClass: "amazon"
    },
    {
        name: "Microsoft",
        ticker: "MSFT",
        price: "€430.20",
        change: "+0.7%",
        positive: true,
        initial: "M",
        colorClass: "microsoft"
    },
    {
        name: "Nvidia",
        ticker: "NVDA",
        price: "€875.60",
        change: "+2.8%",
        positive: true,
        initial: "N",
        colorClass: "nvidia"
    },
    {
        name: "SAP",
        ticker: "SAP",
        price: "€184.20",
        change: "+0.4%",
        positive: true,
        initial: "S",
        colorClass: "sap"
    }
];

// Index of the first visible stock
var currentIndex = 0;

// How many cards to show based on screen width
function getCardsPerPage() {
    if (window.innerWidth < 576) {
        return 1;
    }
    if (window.innerWidth < 992) {
        return 2;
    }
    return 3;
}

// Build Bootstrap column class based on how many cards are shown
function getColClass(perPage) {
    if (perPage === 1) return "col-12";
    if (perPage === 2) return "col-6";
    return "col-lg-4 col-md-6 col-12";
}

var _stockLogoMap = {
    AAPL: 'assets/apple_logo.png',
    TSLA: 'assets/tesla_logo.png',
    AMZN: 'assets/amazon_logo.png',
    MSFT: 'https://cdn.simpleicons.org/microsoft',
    NVDA: 'https://cdn.simpleicons.org/nvidia',
    SAP:  'https://cdn.simpleicons.org/sap',
    GOOGL:'https://cdn.simpleicons.org/google',
    META: 'https://cdn.simpleicons.org/meta',
    NFLX: 'https://cdn.simpleicons.org/netflix'
};
function stockLogoSrc(ticker) {
    return _stockLogoMap[ticker] || '';
}

// Build a single stock card's HTML string
function buildCardHTML(stock, colClass) {
    var changeClass = stock.positive ? "positive-badge" : "negative-badge";
    var arrow       = stock.positive ? "↑" : "↓";
    var logoSrc = stockLogoSrc(stock.ticker);
    var logoImg = logoSrc
        ? '<img class="stock-logo-img" src="' + logoSrc + '" alt="" '
            + 'onload="this.nextElementSibling.style.display=\'none\'" '
            + 'onerror="this.style.display=\'none\'">'
        : '';

    return '<div class="' + colClass + '">' +
        '<a class="stock-card-link" href="stock-detail.html?ticker=' + stock.ticker + '">' +
        '<article class="stock-card">' +
            '<div class="stock-card-inner">' +
                '<div class="stock-logo-placeholder ' + stock.colorClass + '">' +
                    logoImg +
                    '<span class="stock-logo-initial">' + stock.initial + '</span>' +
                '</div>' +
                '<div class="stock-info">' +
                    '<p class="stock-name">' + stock.name + '</p>' +
                    '<p class="stock-ticker">' + stock.ticker + '</p>' +
                '</div>' +
            '</div>' +
            '<div class="stock-chart-wrap" aria-hidden="true">' +
                '<canvas class="home-mini-chart"></canvas>' +
            '</div>' +
            '<div class="stock-price-area">' +
                '<p class="stock-price">' + stock.price + '</p>' +
                '<span class="stock-change ' + changeClass + '">' +
                    arrow + ' ' + stock.change +
                '</span>' +
            '</div>' +
        '</article>' +
        '</a>' +
    '</div>';
}

// Render the visible cards into the carousel container
function renderCards() {
    var container = document.getElementById("stockCarousel");
    if (!container) return;

    var perPage  = getCardsPerPage();
    var colClass = getColClass(perPage);
    var html     = "";

    for (var i = 0; i < perPage; i++) {
        var idx = (currentIndex + i) % stocks.length;
        html += buildCardHTML(stocks[idx], colClass);
    }

    container.innerHTML = html;
}

// =============================================
// 3. ARROW BUTTON CLICK HANDLERS
// =============================================

var arrowRight = document.getElementById("arrowRight");
var arrowLeft  = document.getElementById("arrowLeft");

if (arrowRight) {
    arrowRight.addEventListener("click", function () {
        var perPage = getCardsPerPage();
        currentIndex = (currentIndex + perPage) % stocks.length;
        renderCards();
    });
}

if (arrowLeft) {
    arrowLeft.addEventListener("click", function () {
        var perPage = getCardsPerPage();
        currentIndex = (currentIndex - perPage + stocks.length) % stocks.length;
        renderCards();
    });
}

// Re-render on resize so card count adapts
window.addEventListener("resize", function () {
    renderCards();
});

// Initial render
renderCards();

// =============================================
// PORTFOLIO & STOCK DETAIL — Shared chart util
// =============================================

/**
 * Draws a smooth line chart with gradient fill on a <canvas> element.
 * The canvas is sized to its container via DPR-aware pixel mapping.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {number[]}          data       - array of numeric values
 * @param {string}            lineColor  - CSS color string
 * @param {string}            gradStart  - gradient top color (rgba)
 * @param {string}            gradEnd    - gradient bottom color (rgba)
 */
function drawLineChart(canvasEl, data, lineColor, gradStart, gradEnd) {
    if (!canvasEl || !data || data.length < 2) return;

    var parent = canvasEl.parentElement;
    var rect   = parent.getBoundingClientRect();
    var dpr    = window.devicePixelRatio || 1;
    var w      = rect.width  || parent.offsetWidth  || 600;
    var h      = rect.height || parent.offsetHeight || 160;

    canvasEl.width        = Math.round(w * dpr);
    canvasEl.height       = Math.round(h * dpr);
    canvasEl.style.width  = w + 'px';
    canvasEl.style.height = h + 'px';

    var ctx = canvasEl.getContext('2d');
    ctx.scale(dpr, dpr);

    var pad = { top: 12, right: 12, bottom: 12, left: 12 };
    var cw  = w - pad.left - pad.right;
    var ch  = h - pad.top  - pad.bottom;

    var min   = Math.min.apply(null, data);
    var max   = Math.max.apply(null, data);
    var range = (max - min) || 1;

    var pts = data.map(function (v, i) {
        return {
            x: pad.left + (i / (data.length - 1)) * cw,
            y: pad.top  + (1 - (v - min) / range)  * ch
        };
    });

    ctx.clearRect(0, 0, w, h);

    /* --- gradient fill --- */
    var grad = ctx.createLinearGradient(0, pad.top, 0, h);
    grad.addColorStop(0, gradStart || 'rgba(66,214,181,0.25)');
    grad.addColorStop(1, gradEnd   || 'rgba(66,214,181,0)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
        var cpx = (pts[i - 1].x + pts[i].x) / 2;
        ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length - 1].x, h - pad.bottom);
    ctx.lineTo(pts[0].x, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* --- line stroke --- */
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) {
        var cpx2 = (pts[j - 1].x + pts[j].x) / 2;
        ctx.bezierCurveTo(cpx2, pts[j - 1].y, cpx2, pts[j].y, pts[j].x, pts[j].y);
    }
    ctx.strokeStyle = lineColor || '#42D6B5';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    /* --- end dot --- */
    var last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor || '#42D6B5';
    ctx.fill();
}

// =============================================
// PORTFOLIO PAGE
// =============================================

var pfChartData = {
    '1D':  [],
    '1W':  [],
    '1M':  [],
    '3M':  [],
    '1Y':  [],
    'ALL': []
};

var activePfPeriod = '1W';

function initPortfolioValueChart() {
    /* Portfolio chart is driven by api.js (Chart.js + Twelve Data history) */
}

/* Time tab switch handler */
var pfTabsEl = document.getElementById('pfTimeTabs');
if (pfTabsEl) {
    pfTabsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.pf-time-tab');
        if (!btn) return;
        pfTabsEl.querySelectorAll('.pf-time-tab').forEach(function (t) {
            t.classList.remove('active');
        });
        btn.classList.add('active');
        activePfPeriod = btn.dataset.period;
        initPortfolioValueChart();
    });
}

/* Donut chart — drawn by api.js from real holdings (pfUpdateDonut); no placeholder here */
function drawPortfolioDonut() {}

/* Mini sparklines — drawn by api.js with real data only */
function drawMiniCharts() {
    /* Intentionally empty — api.js draws these from live API closes */
}

/* Bootstrap portfolio donut on window load (value chart handled by api.js) */
if (document.getElementById('portfolioValueChart')) {
    window.addEventListener('load', function () {
        requestAnimationFrame(function () {
            drawPortfolioDonut();
            drawMiniCharts();
        });
    });

    window.addEventListener('resize', function () {
        drawPortfolioDonut();
        drawMiniCharts();
    });
}

// =============================================
// STOCK DETAIL PAGE
// =============================================

var stockDetailData = {
    AAPL: {
        name:     'Apple Inc.',
        ticker:   'AAPL',
        price:    '€1,924.50',
        priceRaw: 192.45,
        change:   '+1.8%',
        positive: true,
        logo:     'assets/apple_logo.png',
        initial:  'A',
        colorClass: 'apple',
        keyInfo: {
            open:      '€191.20',
            high:      '€194.80',
            low:       '€190.50',
            volume:    '52.3M',
            marketCap: '€2.98T',
            currency:  'EUR'
        },
        news: [
            { title: 'Apple unveils new AI features for iPhone', time: '2h ago' },
            { title: 'Analysts raise AAPL price target to €210', time: '5h ago' }
        ]
    },
    TSLA: {
        name:     'Tesla',
        ticker:   'TSLA',
        price:    '€1,241.00',
        priceRaw: 248.20,
        change:   '-0.9%',
        positive: false,
        logo:     'assets/tesla_logo.png',
        initial:  'T',
        colorClass: 'tesla',
        keyInfo: {
            open:      '€248.50',
            high:      '€252.10',
            low:       '€246.80',
            volume:    '38.7M',
            marketCap: '€790B',
            currency:  'EUR'
        },
        news: [
            { title: 'Tesla Q2 deliveries beat analyst estimates', time: '3h ago' },
            { title: 'Tesla Cybertruck production ramps up in Europe', time: '6h ago' }
        ]
    },
    AMZN: {
        name:     'Amazon',
        ticker:   'AMZN',
        price:    '€1,452.80',
        priceRaw: 181.60,
        change:   '+2.1%',
        positive: true,
        logo:     'assets/amazon_logo.png',
        initial:  'A',
        colorClass: 'amazon',
        keyInfo: {
            open:      '€181.50',
            high:      '€185.20',
            low:       '€180.90',
            volume:    '44.1M',
            marketCap: '€1.88T',
            currency:  'EUR'
        },
        news: [
            { title: 'Amazon AWS revenue surges 35% in Q2 2026', time: '1h ago' },
            { title: 'Amazon expands same-day delivery across Europe', time: '4h ago' }
        ]
    }
};

/* Cache generated chart data so resize doesn't re-randomise */
var sdChartCache = {};

/* generateStockData / getStockChartData / drawStockChart
   — replaced by api.js with Chart.js + real Twelve Data closes */
function generateStockData() { return []; }
function getStockChartData()  { return []; }

var currentStock      = null;
var activeStockPeriod = '1W';

function drawStockChart(period) {
    /* No-op: api.js patches this with a Chart.js implementation */
}

function buildNewsHTML(newsItems) {
    return newsItems.map(function (n) {
        return '<div class="sd-news-row">' +
            '<div class="sd-news-icon" aria-hidden="true">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
                    '<polyline points="14 2 14 8 20 8"/>' +
                    '<line x1="16" y1="13" x2="8" y2="13"/>' +
                    '<line x1="16" y1="17" x2="8" y2="17"/>' +
                    '<polyline points="10 9 9 9 8 9"/>' +
                '</svg>' +
            '</div>' +
            '<div class="sd-news-body">' +
                '<p class="sd-news-title">' + n.title + '</p>' +
                '<p class="sd-news-time">'  + n.time  + '</p>' +
            '</div>' +
            '<svg class="sd-news-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
    }).join('');
}

// Tickers viewable on Stock Detail but outside stockDetailData's hardcoded
// placeholder set still need an honest name/initial — never Apple's.
var STOCK_DETAIL_EXTRAS = {
    MSFT: { name: 'Microsoft', initial: 'M', colorClass: 'microsoft' },
    NVDA: { name: 'NVIDIA',    initial: 'N', colorClass: 'nvidia'    },
    SAP:  { name: 'SAP SE',    initial: 'S', colorClass: 'sap'       }
};

// Builds a safe placeholder for any ticker not in stockDetailData. Never
// falls back to Apple — real price/chart/news for this exact ticker still
// arrive from api.js's own API fetch, keyed off the same URL ticker.
function buildGenericStockDetail(ticker) {
    var extra = STOCK_DETAIL_EXTRAS[ticker];
    return {
        name:     extra ? extra.name : ticker,
        ticker:   ticker,
        price:    '—',
        priceRaw: null,
        change:   '',
        positive: true,
        logo:     null,
        initial:  extra ? extra.initial : ticker.charAt(0),
        colorClass: extra ? extra.colorClass : '',
        keyInfo: {
            open: '—', high: '—', low: '—', volume: '—', marketCap: '—', currency: 'EUR'
        },
        news: []
    };
}

function initStockDetailPage() {
    if (!document.getElementById('stockDetailMain')) return;

    var params = new URLSearchParams(window.location.search);
    var ticker = (params.get('ticker') || 'AAPL').toUpperCase();
    var stock  = stockDetailData[ticker] || buildGenericStockDetail(ticker);
    currentStock = stock;

    /* Page <title> */
    document.title = 'Clarivo \u2014 ' + stock.name;

    /* Header company name */
    var headerName = document.getElementById('sdHeaderName');
    if (headerName) headerName.textContent = stock.name;

    /* Logo image vs fallback */
    var logoImg      = document.getElementById('sdLogoImg');
    var logoFallback = document.getElementById('sdLogoFallback');

    if (stock.logo) {
        if (logoImg) {
            logoImg.src   = stock.logo;
            logoImg.alt   = stock.name;
            logoImg.style.display = 'block';
        }
        if (logoFallback) logoFallback.style.display = 'none';
    } else {
        if (logoImg)      logoImg.style.display      = 'none';
        if (logoFallback) {
            logoFallback.style.display = 'flex';
            /* Reset classes, keeping structural ones */
            logoFallback.className = 'pf-stock-fallback stock-logo-placeholder ' + stock.colorClass;
            logoFallback.textContent = stock.initial;
        }
    }

    /* Name & ticker */
    var sdName   = document.getElementById('sdStockName');
    var sdTicker = document.getElementById('sdStockTicker');
    if (sdName)   sdName.textContent   = stock.name;
    if (sdTicker) sdTicker.textContent = stock.ticker;

    /* Price & change badge */
    var sdPrice  = document.getElementById('sdStockPrice');
    var sdChange = document.getElementById('sdStockChange');
    if (sdPrice)  sdPrice.textContent  = stock.price;
    if (sdChange) {
        sdChange.textContent = (stock.positive ? '\u2191 ' : '\u2193 ') + stock.change;
        sdChange.className   = 'sd-main-badge ' + (stock.positive ? 'positive-badge' : 'negative-badge');
    }

    /* Key information values */
    var infoMap = {
        sdOpen:      stock.keyInfo.open,
        sdHigh:      stock.keyInfo.high,
        sdLow:       stock.keyInfo.low,
        sdVolume:    stock.keyInfo.volume,
        sdMarketCap: stock.keyInfo.marketCap,
        sdCurrency:  stock.keyInfo.currency
    };
    Object.keys(infoMap).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = infoMap[id];
    });

    /* Related news */
    var newsContainer = document.getElementById('sdNewsContainer');
    if (newsContainer) newsContainer.innerHTML = buildNewsHTML(stock.news);

    /* Draw initial chart */
    requestAnimationFrame(function () {
        drawStockChart(activeStockPeriod);
    });

    /* Time tab events */
    var sdTabs = document.getElementById('sdTimeTabs');
    if (sdTabs) {
        sdTabs.addEventListener('click', function (e) {
            var btn = e.target.closest('.pf-time-tab');
            if (!btn) return;
            sdTabs.querySelectorAll('.pf-time-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            btn.classList.add('active');
            activeStockPeriod = btn.dataset.period;
            drawStockChart(activeStockPeriod);
        });
    }

    /* Redraw on resize */
    window.addEventListener('resize', function () {
        drawStockChart(activeStockPeriod);
    });
}

/* Run when DOM + assets are ready */
if (document.getElementById('stockDetailMain')) {
    window.addEventListener('load', initStockDetailPage);
}

// =============================================
// NEWS PAGE
// =============================================

/* News sparklines — drawn by api.js with real data only */
function drawNewsSnapshots() {
    /* Intentionally empty — api.js draws these from live API closes */
}

/* --- Category chip filter --- */
var newsActiveCategory   = 'all';
var newsActiveSearchTerm = '';
var newsCurrentLang      = 'EN';

var newsTranslations = {
    EN: {
        'page.title':              'Clarivo — Market News',
        'nav.home':                'Home',
        'nav.market':              'Market',
        'nav.portfolio':           'Portfolio',
        'nav.news':                'News',
        'nav.profile':             'Profile',
        'nav.upgrade':             'Upgrade',
        'hero.liveUpdates':        'Live Updates',
        'hero.title':              'Market News',
        'hero.subtitle':           'Stay updated with the latest stock market movements and financial news.',
        'hero.searchPlaceholder':  'Search news, companies, or markets…',
        'section.marketSnapshot':  'Market Snapshot',
        'section.live':            'Live',
        'section.latestNews':      'Latest News',
        'section.moreNews':        'More News',
        'chip.all':                'All',
        'chip.technology':         'Technology',
        'chip.automotive':         'Automotive',
        'chip.markets':            'Markets',
        'chip.earnings':           'Earnings',
        'chip.economy':            'Economy',
        'subscribe.title':         'Stay Informed',
        'subscribe.text':          'Get the latest market news and updates delivered to your inbox.',
        'subscribe.placeholder':   'your@email.com',
        'subscribe.btn':           'Subscribe',
        'subscribe.error':         'Please enter a valid email address.',
        'subscribe.success':       'Subscription confirmed! Check your inbox for updates.',
        'empty.noResults':         'No results found.'
    },
    TR: {
        'page.title':              'Clarivo — Piyasa Haberleri',
        'nav.home':                'Ana Sayfa',
        'nav.market':              'Piyasa',
        'nav.portfolio':           'Portföy',
        'nav.news':                'Haberler',
        'nav.profile':             'Profil',
        'nav.upgrade':             'Yükselt',
        'hero.liveUpdates':        'Canlı Güncellemeler',
        'hero.title':              'Piyasa Haberleri',
        'hero.subtitle':           'En son borsa hareketleri ve finans haberleriyle güncel kalın.',
        'hero.searchPlaceholder':  'Haber, şirket veya piyasa ara…',
        'section.marketSnapshot':  'Piyasa Özeti',
        'section.live':            'Canlı',
        'section.latestNews':      'Son Haberler',
        'section.moreNews':        'Daha Fazla Haber',
        'chip.all':                'Tümü',
        'chip.technology':         'Teknoloji',
        'chip.automotive':         'Otomotiv',
        'chip.markets':            'Piyasalar',
        'chip.earnings':           'Kazançlar',
        'chip.economy':            'Ekonomi',
        'subscribe.title':         'Bilgili Kalın',
        'subscribe.text':          'En son piyasa haberlerini ve güncellemeleri e-posta kutunuza alın.',
        'subscribe.placeholder':   'eposta@ornek.com',
        'subscribe.btn':           'Abone Ol',
        'subscribe.error':         'Lütfen geçerli bir e-posta adresi girin.',
        'subscribe.success':       'Abonelik onaylandı! Güncellemeler için gelen kutunuzu kontrol edin.',
        'empty.noResults':         'Sonuç bulunamadı.'
    },
    DE: {
        'page.title':              'Clarivo — Marktnachrichten',
        'nav.home':                'Startseite',
        'nav.market':              'Markt',
        'nav.portfolio':           'Portfolio',
        'nav.news':                'Nachrichten',
        'nav.profile':             'Profil',
        'nav.upgrade':             'Upgrade',
        'hero.liveUpdates':        'Live-Updates',
        'hero.title':              'Marktnachrichten',
        'hero.subtitle':           'Bleiben Sie über die neuesten Börsenbewegungen und Finanznachrichten informiert.',
        'hero.searchPlaceholder':  'Nachrichten, Unternehmen oder Märkte suchen…',
        'section.marketSnapshot':  'Marktübersicht',
        'section.live':            'Live',
        'section.latestNews':      'Neueste Nachrichten',
        'section.moreNews':        'Weitere Nachrichten',
        'chip.all':                'Alle',
        'chip.technology':         'Technologie',
        'chip.automotive':         'Automobil',
        'chip.markets':            'Märkte',
        'chip.earnings':           'Ergebnisse',
        'chip.economy':            'Wirtschaft',
        'subscribe.title':         'Bleiben Sie informiert',
        'subscribe.text':          'Erhalten Sie die neuesten Marktnachrichten und Updates in Ihrem Posteingang.',
        'subscribe.placeholder':   'ihre@email.de',
        'subscribe.btn':           'Abonnieren',
        'subscribe.error':         'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
        'subscribe.success':       'Abonnement bestätigt! Überprüfen Sie Ihren Posteingang auf Updates.',
        'empty.noResults':         'Keine Ergebnisse gefunden.'
    }
};

function tNews(key) {
    var dict = newsTranslations[newsCurrentLang] || newsTranslations.EN;
    return dict[key] || newsTranslations.EN[key] || key;
}

function applyNewsTranslations(lang) {
    if (!document.querySelector('.news-snapshot-section')) return;

    newsCurrentLang = lang;
    var dict = newsTranslations[lang] || newsTranslations.EN;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.dataset.i18n;
        if (dict[key]) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        var key = el.dataset.i18nPlaceholder;
        if (dict[key]) el.placeholder = dict[key];
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var key = el.dataset.i18nAria;
        if (dict[key]) el.setAttribute('aria-label', dict[key]);
    });

    if (dict['page.title']) document.title = dict['page.title'];
    document.documentElement.lang = lang.toLowerCase();
}

function getSearchText(item) {
    var keywords = item.dataset.searchKeywords || '';
    var title    = item.dataset.title || '';
    return (keywords + ' ' + title + ' ' + item.textContent).toLowerCase();
}

function filterNewsItems() {
    var term     = newsActiveSearchTerm.toLowerCase();
    var category = newsActiveCategory;
    var anyNewsVisible     = false;
    var anySnapshotVisible = false;

    /* Filter Market Snapshot cards */
    var snapshots = document.querySelectorAll('.ns-card[data-searchable]');
    snapshots.forEach(function (card) {
        var visible = !term || getSearchText(card).indexOf(term) !== -1;
        card.style.display = visible ? '' : 'none';
        if (visible) anySnapshotVisible = true;
    });

    var snapshotSection = document.querySelector('.news-snapshot-section');
    if (snapshotSection) {
        snapshotSection.style.display = (!term || anySnapshotVisible) ? '' : 'none';
    }

    /* Filter news cards */
    var items = document.querySelectorAll('.news-card-item[data-searchable]');
    items.forEach(function (item) {
        var catMatch  = (category === 'all') || (item.dataset.category === category);
        var termMatch = !term || getSearchText(item).indexOf(term) !== -1;
        var visible   = catMatch && termMatch;

        item.style.display = visible ? '' : 'none';
        if (visible) anyNewsVisible = true;

        var colWrap = item.closest('#moreNewsGrid .col-sm-6, #moreNewsGrid .col-12');
        if (colWrap) colWrap.style.display = visible ? '' : 'none';
    });

    var moreHeading = document.querySelector('.news-more-heading');
    if (moreHeading) {
        var moreVisible = Array.from(document.querySelectorAll('#moreNewsGrid .news-card-item')).some(function (el) {
            return el.style.display !== 'none';
        });
        moreHeading.style.display = moreVisible ? '' : 'none';
    }

    var listCard = document.querySelector('.news-list-card');
    if (listCard) {
        var listVisible = Array.from(document.querySelectorAll('#newsListRows .news-card-item')).some(function (el) {
            return el.style.display !== 'none';
        });
        listCard.style.display = listVisible ? '' : 'none';
    }

    /* Empty state */
    var emptyState = document.getElementById('newsEmptyState');
    var emptyMsg   = document.getElementById('newsEmptyMessage');
    var showEmpty  = false;

    if (term) {
        showEmpty = !anyNewsVisible && !anySnapshotVisible;
    } else if (category !== 'all') {
        showEmpty = !anyNewsVisible;
    }

    if (emptyState) emptyState.style.display = showEmpty ? 'block' : 'none';
    if (emptyMsg) emptyMsg.textContent = tNews('empty.noResults');
}

function initNewsChips() {
    var chipsContainer = document.getElementById('newsChips');
    if (!chipsContainer) return;

    chipsContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-chip');
        if (!btn) return;

        chipsContainer.querySelectorAll('.news-chip').forEach(function (c) {
            c.classList.remove('active');
        });
        btn.classList.add('active');

        newsActiveCategory = btn.dataset.category;
        filterNewsItems();
    });
}

/* --- Search filter --- */
function initNewsSearch() {
    var input = document.getElementById('newsSearchInput');
    if (!input) return;

    var debounceTimer;
    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            newsActiveSearchTerm = input.value.trim();
            filterNewsItems();
        }, 180);
    });
}

/* --- Logo path resolver --- */
function tryLoadAssetPaths(img, paths, index, fallback) {
    if (index >= paths.length) {
        img.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
        return;
    }

    var probe = new Image();
    probe.onload = function () {
        img.src = paths[index];
        img.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
    };
    probe.onerror = function () {
        tryLoadAssetPaths(img, paths, index + 1, fallback);
    };
    probe.src = paths[index];
}

function initAssetLogos() {
    var logos = document.querySelectorAll('.js-stock-logo, .js-news-thumb-logo');
    logos.forEach(function (img) {
        var paths = [];
        try {
            paths = JSON.parse(img.dataset.paths || '[]');
        } catch (err) {
            paths = [];
        }

        var fallback = img.nextElementSibling;
        img.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';

        if (paths.length) {
            tryLoadAssetPaths(img, paths, 0, fallback);
        } else if (fallback) {
            img.style.display = 'none';
            fallback.style.display = 'flex';
        }
    });
}

/* --- Language dropdown (shared: news + market pages) --- */
function initLanguageDropdown() {
    var dropdown = document.getElementById('navLangDropdown');
    if (!dropdown) return;

    var toggle  = document.getElementById('navLangToggle');
    var label   = document.getElementById('navLangLabel');
    var options = dropdown.querySelectorAll('.nav-lang-option');

    function setLanguage(lang) {
        if (label) label.textContent = lang;
        localStorage.setItem('clarivoLang', lang);
        options.forEach(function (opt) {
            opt.classList.toggle('active', opt.dataset.lang === lang);
        });

        if (document.querySelector('.news-snapshot-section')) {
            applyNewsTranslations(lang);
            filterNewsItems();
        }
        if (document.getElementById('mkIndicesGrid')) {
            applyMarketTranslations(lang);
        }
    }

    var savedLang = localStorage.getItem('clarivoLang') || 'EN';
    if (['EN', 'TR', 'DE'].indexOf(savedLang) === -1) savedLang = 'EN';
    setLanguage(savedLang);

    if (toggle) {
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = dropdown.classList.toggle('open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    options.forEach(function (opt) {
        opt.addEventListener('click', function () {
            setLanguage(opt.dataset.lang);
            dropdown.classList.remove('open');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('click', function (e) {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

/* --- Subscribe form --- */
function initNewsSubscribe() {
    var btn   = document.getElementById('newsSubscribeBtn');
    var input = document.getElementById('newsSubscribeInput');
    var msg   = document.getElementById('newsSubscribeMsg');
    if (!btn || !input || !msg) return;

    function showSubscribeMessage(text, type) {
        msg.textContent = text;
        msg.className = 'nsc-message nsc-message-' + type;
    }

    btn.addEventListener('click', function () {
        var email = input.value.trim();
        var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!valid) {
            showSubscribeMessage(tNews('subscribe.error'), 'error');
            return;
        }

        showSubscribeMessage(tNews('subscribe.success'), 'success');
        input.value = '';
    });
}

/* --- Bootstrap the news page --- */
if (document.querySelector('.news-snapshot-section')) {
    initLanguageDropdown();
    initNewsChips();
    initNewsSearch();
    initNewsSubscribe();
    initAssetLogos();

    window.addEventListener('load', function () {
        requestAnimationFrame(function () {
            drawNewsSnapshots();
        });
    });

    window.addEventListener('resize', drawNewsSnapshots);
}

// =============================================
// MARKET PAGE
// =============================================

var mkCurrentLang = 'EN';

var marketTranslations = {
    EN: {
        'page.title':              'Clarivo — Market Overview',
        'nav.home':                'Home',
        'nav.market':              'Market',
        'nav.portfolio':           'Portfolio',
        'nav.news':                'News',
        'nav.profile':             'Profile',
        'nav.upgrade':             'Upgrade',
        'hero.liveMarkets':        'Live Markets',
        'hero.title':              'Market Overview',
        'hero.subtitle':           'Track global stocks, indices, currencies, and market movement in one place.',
        'hero.searchPlaceholder':  'Search stocks, indices, or currencies…',
        'section.indices':         'Market Indices',
        'section.live':            'Live',
        'section.topStocks':       'Top Stocks',
        'section.converter':       'Currency Converter',
        'section.countrySearch':   'Country Market Search',
        'section.trendingNews':    'Trending News',
        'conv.amount':             'Amount',
        'conv.from':               'From',
        'conv.to':                 'To',
        'conv.convert':            'Convert',
        'conv.swap':               'Swap currencies',
        'conv.eur':                'EUR — Euro',
        'conv.usd':                'USD — US Dollar',
        'conv.try':                'TRY — Turkish Lira',
        'conv.pendingResult':      'Conversion result will be available after API integration.',
        'conv.ratesNote':          'Live exchange rates will be connected later.',
        'country.select':          'Select a country…',
        'country.germany':         'Germany',
        'country.usa':             'USA',
        'country.turkey':          'Turkey',
        'country.uk':              'UK',
        'news.badgeMarkets':       'Markets',
        'news.badgeEurope':        'Europe',
        'news.badgeCommodities':   'Commodities',
        'news.techGains':          'Tech stocks lead market gains',
        'news.techGainsDesc':      'Major technology companies posted broad gains driven by AI optimism and strong earnings reports.',
        'news.europeHigher':       'European markets open higher',
        'news.europeHigherDesc':   'European indices gained ground as inflation data came in below forecast, boosting investor confidence.',
        'news.oilLower':           'Oil prices move lower',
        'news.oilLowerDesc':       'Crude oil futures retreated on rising supply expectations and weaker global demand forecasts.',
        'empty.indices':           'No indices match your search.',
        'empty.stocks':            'No stocks match your search.'
    },
    TR: {
        'page.title':              'Clarivo — Piyasa Genel Bakış',
        'nav.home':                'Ana Sayfa',
        'nav.market':              'Piyasa',
        'nav.portfolio':           'Portföy',
        'nav.news':                'Haberler',
        'nav.profile':             'Profil',
        'nav.upgrade':             'Yükselt',
        'hero.liveMarkets':        'Canlı Piyasalar',
        'hero.title':              'Piyasa Genel Bakış',
        'hero.subtitle':           'Küresel hisseleri, endeksleri, dövizleri ve piyasa hareketlerini tek yerden takip edin.',
        'hero.searchPlaceholder':  'Hisse, endeks veya döviz ara…',
        'section.indices':         'Piyasa Endeksleri',
        'section.live':            'Canlı',
        'section.topStocks':       'Öne Çıkan Hisseler',
        'section.converter':       'Döviz Çevirici',
        'section.countrySearch':   'Ülke Piyasası Arama',
        'section.trendingNews':    'Trend Haberler',
        'conv.amount':             'Tutar',
        'conv.from':               'Kaynak',
        'conv.to':                 'Hedef',
        'conv.convert':            'Çevir',
        'conv.swap':               'Para birimlerini değiştir',
        'conv.eur':                'EUR — Euro',
        'conv.usd':                'USD — ABD Doları',
        'conv.try':                'TRY — Türk Lirası',
        'conv.pendingResult':      'Dönüşüm sonucu API entegrasyonundan sonra kullanılabilir olacak.',
        'conv.ratesNote':          'Canlı döviz kurları daha sonra bağlanacak.',
        'country.select':          'Bir ülke seçin…',
        'country.germany':         'Almanya',
        'country.usa':             'ABD',
        'country.turkey':          'Türkiye',
        'country.uk':              'İngiltere',
        'news.badgeMarkets':       'Piyasalar',
        'news.badgeEurope':        'Avrupa',
        'news.badgeCommodities':   'Emtialar',
        'news.techGains':          'Teknoloji hisseleri piyasa kazançlarına öncülük ediyor',
        'news.europeHigher':       'Avrupa piyasaları yükselişle açıldı',
        'news.europeHigherDesc':   'Enflasyon verilerinin beklentinin altında gelmesi yatırımcı güvenini artırdı.',
        'news.techGainsDesc':      'Yapay zeka iyimserliği ve güçlü kazanç raporları teknoloji hisselerini yukarı taşıdı.',
        'news.oilLower':           'Petrol fiyatları geriledi',
        'news.oilLowerDesc':       'Ham petrol vadeli işlemleri artan arz beklentileriyle düştü.',
        'empty.indices':           'Aramanızla eşleşen endeks bulunamadı.',
        'empty.stocks':            'Aramanızla eşleşen hisse bulunamadı.'
    },
    DE: {
        'page.title':              'Clarivo — Marktübersicht',
        'nav.home':                'Startseite',
        'nav.market':              'Markt',
        'nav.portfolio':           'Portfolio',
        'nav.news':                'Nachrichten',
        'nav.profile':             'Profil',
        'nav.upgrade':             'Upgrade',
        'hero.liveMarkets':        'Live-Märkte',
        'hero.title':              'Marktübersicht',
        'hero.subtitle':           'Verfolgen Sie globale Aktien, Indizes, Währungen und Marktbewegungen an einem Ort.',
        'hero.searchPlaceholder':  'Aktien, Indizes oder Währungen suchen…',
        'section.indices':         'Marktindizes',
        'section.live':            'Live',
        'section.topStocks':       'Top-Aktien',
        'section.converter':       'Währungsrechner',
        'section.countrySearch':   'Ländermarkt-Suche',
        'section.trendingNews':    'Trend-Nachrichten',
        'conv.amount':             'Betrag',
        'conv.from':               'Von',
        'conv.to':                 'Nach',
        'conv.convert':            'Umrechnen',
        'conv.swap':               'Währungen tauschen',
        'conv.eur':                'EUR — Euro',
        'conv.usd':                'USD — US-Dollar',
        'conv.try':                'TRY — Türkische Lira',
        'conv.pendingResult':      'Das Umrechnungsergebnis ist nach der API-Integration verfügbar.',
        'conv.ratesNote':          'Live-Wechselkurse werden später angebunden.',
        'country.select':          'Land auswählen…',
        'country.germany':         'Deutschland',
        'country.usa':             'USA',
        'country.turkey':          'Türkei',
        'country.uk':              'Großbritannien',
        'news.badgeMarkets':       'Märkte',
        'news.badgeEurope':        'Europa',
        'news.badgeCommodities':   'Rohstoffe',
        'news.techGains':          'Tech-Aktien führen Marktgewinne an',
        'news.techGainsDesc':      'Große Technologieunternehmen verzeichneten breite Gewinne durch KI-Optimismus.',
        'news.europeHigher':       'Europäische Märkte eröffnen höher',
        'news.europeHigherDesc':   'Europäische Indizes legten zu, da die Inflationsdaten unter den Prognosen lagen.',
        'news.oilLower':           'Ölpreise fallen',
        'news.oilLowerDesc':       'Rohölfutures gaben aufgrund steigender Angebotsprognosen nach.',
        'empty.indices':           'Keine Indizes entsprechen Ihrer Suche.',
        'empty.stocks':            'Keine Aktien entsprechen Ihrer Suche.'
    }
};

function tMarket(key) {
    var dict = marketTranslations[mkCurrentLang] || marketTranslations.EN;
    return dict[key] || marketTranslations.EN[key] || key;
}

function applyMarketTranslations(lang) {
    if (!document.getElementById('mkIndicesGrid')) return;

    mkCurrentLang = lang;
    var dict = marketTranslations[lang] || marketTranslations.EN;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.dataset.i18n;
        if (dict[key]) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        var key = el.dataset.i18nPlaceholder;
        if (dict[key]) el.placeholder = dict[key];
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var key = el.dataset.i18nAria;
        if (dict[key]) el.setAttribute('aria-label', dict[key]);
    });

    if (dict['page.title']) document.title = dict['page.title'];
    document.documentElement.lang = lang.toLowerCase();

    /* Refresh country panel if open */
    var sel = document.getElementById('mkCountrySelect');
    if (sel && sel.value) renderMkCountryPanel(sel.value);

    var resultVal = document.getElementById('mkConvResultValue');
    var resultBox = document.getElementById('mkConvResult');
    if (resultVal && resultBox && resultBox.style.display !== 'none') {
        resultVal.textContent = tMarket('conv.pendingResult');
    }
}

var MK_COUNTRIES = {
    germany: {
        flag: '🇩🇪',
        nameKey: 'country.germany',
        items: [
            { name: 'DAX',     ticker: 'DAX',     change: '+0.46%', pos: true  },
            { name: 'SAP SE',  ticker: 'SAP',     change: '+0.88%', pos: true  },
            { name: 'Siemens', ticker: 'SIE',     change: '+0.31%', pos: true  }
        ]
    },
    usa: {
        flag: '🇺🇸',
        nameKey: 'country.usa',
        items: [
            { name: 'S&P 500',    ticker: 'SPX',  change: '+0.82%', pos: true  },
            { name: 'Apple Inc.', ticker: 'AAPL', change: '+1.82%', pos: true  },
            { name: 'Tesla',      ticker: 'TSLA', change: '-0.93%', pos: false }
        ]
    },
    turkey: {
        flag: '🇹🇷',
        nameKey: 'country.turkey',
        items: [
            { name: 'BIST 100', ticker: 'XU100', change: '+1.20%', pos: true  },
            { name: 'Türk Hava', ticker: 'THYAO', change: '+2.14%', pos: true  },
            { name: 'Aselsan',  ticker: 'ASELS', change: '-0.44%', pos: false }
        ]
    },
    uk: {
        flag: '🇬🇧',
        nameKey: 'country.uk',
        items: [
            { name: 'FTSE 100', ticker: 'UKX',  change: '-0.22%', pos: false },
            { name: 'HSBC',     ticker: 'HSBA', change: '+0.55%', pos: true  },
            { name: 'BP plc',   ticker: 'BP.',  change: '-0.38%', pos: false }
        ]
    }
};

/* Market sparklines — drawn by api.js with real Alpha Vantage closes */
function drawMkSparkline() {
    /* Intentionally empty — api.js draws these from live API closes */
}

function initMkCharts() {
    /* Intentionally empty — api.js handles market chart initialisation */
}

/* --- Logo loader (reuse tryLoadAssetPaths from news page) --- */
function initMkLogos() {
    document.querySelectorAll('.js-mk-logo').forEach(function (img) {
        var paths = [];
        try { paths = JSON.parse(img.dataset.paths || '[]'); } catch (e) {}
        var fallback = img.nextElementSibling;
        img.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
        if (paths.length && typeof tryLoadAssetPaths === 'function') {
            tryLoadAssetPaths(img, paths, 0, fallback);
        }
    });
}

/* --- Search filter --- */
function initMkSearch() {
    var input = document.getElementById('mkSearchInput');
    if (!input) return;

    var timer;
    input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            var term = input.value.trim().toLowerCase();
            var anyIndex = false;
            var anyStock = false;

            document.querySelectorAll('.mk-index-col[data-searchable]').forEach(function (col) {
                var text    = (col.dataset.searchText || '') + ' ' + col.textContent.toLowerCase();
                var visible = !term || text.indexOf(term) !== -1;
                col.style.display = visible ? '' : 'none';
                if (visible) anyIndex = true;
            });

            document.querySelectorAll('.mk-stock-row[data-searchable]').forEach(function (row) {
                var text    = (row.dataset.searchText || '') + ' ' + row.textContent.toLowerCase();
                var visible = !term || text.indexOf(term) !== -1;
                row.style.display = visible ? '' : 'none';
                if (visible) anyStock = true;
            });

            var idxEmpty = document.getElementById('mkIndicesEmpty');
            var stkEmpty = document.getElementById('mkStocksEmpty');
            if (idxEmpty) idxEmpty.style.display = anyIndex ? 'none' : 'block';
            if (stkEmpty) stkEmpty.style.display = anyStock ? 'none' : 'block';
        }, 180);
    });
}

/* --- Currency converter (live rates via api.js / frankfurter.dev) --- */
function initMkConverter() {
    /* Handled by api.js setupConverter() — avoid duplicate click handlers */
}

/* --- Country market selector --- */
function renderMkCountryPanel(countryKey) {
    var result = document.getElementById('mkCountryResult');
    var flag   = document.getElementById('mkCountryFlag');
    var name   = document.getElementById('mkCountryName');
    var items  = document.getElementById('mkCountryItems');
    var country = MK_COUNTRIES[countryKey];

    if (!country || !result) { if (result) result.style.display = 'none'; return; }

    flag.textContent = country.flag;
    name.textContent = tMarket(country.nameKey) + ' · sample reference';

    items.innerHTML = country.items.map(function (item) {
        var changeColor = item.pos ? 'var(--color-positive)' : 'var(--color-negative)';
        return '<li>' +
            '<div>' +
                '<span class="mk-country-item-name">' + item.name + '</span><br>' +
                '<span class="mk-country-item-ticker">' + item.ticker + '</span>' +
            '</div>' +
            '<span style="font-size:12px;font-weight:700;color:' + changeColor + '">' + item.change + '</span>' +
        '</li>';
    }).join('');

    result.style.display = 'block';
}

function initMkCountry() {
    var sel = document.getElementById('mkCountrySelect');
    if (!sel) return;

    sel.addEventListener('change', function () {
        if (!sel.value) {
            var result = document.getElementById('mkCountryResult');
            if (result) result.style.display = 'none';
            return;
        }
        renderMkCountryPanel(sel.value);
    });
}

/* --- Bootstrap market page --- */
if (document.getElementById('mkIndicesGrid')) {
    initLanguageDropdown();

    window.addEventListener('load', function () {
        requestAnimationFrame(function () {
            initMkCharts();
            initMkLogos();
        });
    });

    window.addEventListener('resize', function () {
        requestAnimationFrame(initMkCharts);
    });

    initMkSearch();
    initMkConverter();
    initMkCountry();
}
