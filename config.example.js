// Clarivo — config.example.js
// API keys for the Web App. For local development or hosting:
//   1. Copy this file to config.js and replace YOUR_* placeholders with real keys.
//   2. config.js is gitignored; config.example.js is loaded on every page as fallback.
// If keys are left as YOUR_* placeholders, api.js uses built-in defaults.
window.CLARIVO_CONFIG = {
    AV_KEY:      'YOUR_AV_KEY',         // https://alphavantage.co — historical fallback
    TD_KEY:      'YOUR_TD_KEY',         // https://twelvedata.com — quotes & primary historical charts
    MX_KEY:      'YOUR_MARKETAUX_KEY',  // https://www.marketaux.com — news with images
    NA_KEY:      'YOUR_NEWSAPI_KEY'     // https://newsapi.org — top headlines with images
};
