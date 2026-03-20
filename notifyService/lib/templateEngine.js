'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'config', 'templates');
const _templates = {};

/**
 * Load templates from disk.
 */
function load() {
    try {
        for (const file of fs.readdirSync(TEMPLATE_DIR)) {
            if (!file.endsWith('.json')) continue;
            const lang = file.replace('.json', '');
            _templates[lang] = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8'));
        }
        console.log(`[templateEngine] Loaded ${Object.keys(_templates).length} language(s)`);
    } catch (err) {
        console.warn('[templateEngine] Load failed:', err.message);
    }
}

/**
 * Get a translated string with variable interpolation.
 * @param {string} key - Template key (e.g., 'login_expired.title')
 * @param {string} [lang='en'] - Language code
 * @param {object} [vars={}] - Variables to interpolate ({{name}} syntax)
 */
function t(key, lang = 'en', vars = {}) {
    const dict = _templates[lang] || _templates['en'] || {};
    let text = dict[key] || key;
    for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
    return text;
}

/**
 * List available languages.
 */
function languages() {
    return Object.keys(_templates);
}

module.exports = { load, t, languages };
