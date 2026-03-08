'use strict';

/**
 * CAPTCHA Solver — Detect and attempt to solve CAPTCHAs on web pages.
 *
 * Supports detection of:
 *   - reCAPTCHA v2/v3 (Google)
 *   - hCaptcha
 *   - Image-text CAPTCHAs
 *   - Slider/drag CAPTCHAs
 *   - Cloudflare challenge
 *
 * Strategies:
 *   1. Detection: screenshot → classify type
 *   2. Auto-solve: type-specific solver (click, wait, simple patterns)
 *   3. Manual fallback: notify user via callback
 */

const browserPool = require('./browserPool');
const toolRegistry = require('./toolRegistry');

/**
 * CAPTCHA types we can detect.
 */
const CAPTCHA_TYPES = {
    RECAPTCHA: 'recaptcha',
    HCAPTCHA: 'hcaptcha',
    CLOUDFLARE: 'cloudflare',
    IMAGE_TEXT: 'image_text',
    SLIDER: 'slider',
    NONE: 'none'
};

/**
 * Detect CAPTCHA type on the current page.
 * Uses DOM analysis (no AI vision needed for common patterns).
 *
 * @param {string} browserId
 * @returns {Promise<{ type: string, details: object }>}
 */
async function detectCaptcha(browserId) {
    const page = await browserPool.getPage(browserId);

    const detection = await page.evaluate(() => {
        const result = { type: 'none', details: {} };

        // Check for reCAPTCHA
        const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
        const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
        if (recaptchaFrame || recaptchaDiv) {
            result.type = 'recaptcha';
            result.details.version = recaptchaFrame?.src?.includes('recaptcha/api2') ? 'v2' : 'v3';
            result.details.siteKey = recaptchaDiv?.getAttribute('data-sitekey') || '';
            return result;
        }

        // Check for hCaptcha
        const hcaptchaFrame = document.querySelector('iframe[src*="hcaptcha"]');
        const hcaptchaDiv = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
        if (hcaptchaFrame || hcaptchaDiv) {
            result.type = 'hcaptcha';
            result.details.siteKey = hcaptchaDiv?.getAttribute('data-sitekey') || '';
            return result;
        }

        // Check for Cloudflare challenge
        const cfChallenge = document.querySelector('#cf-challenge-running, .cf-browser-verification, #challenge-running');
        const cfTurnstile = document.querySelector('.cf-turnstile, [data-cf-turnstile]');
        if (cfChallenge || cfTurnstile) {
            result.type = 'cloudflare';
            result.details.isTurnstile = Boolean(cfTurnstile);
            return result;
        }

        // Check for slider CAPTCHA (common in Chinese sites)
        const slider = document.querySelector(
            '.slider-captcha, .slide-verify, [class*="slider"], [class*="drag"], ' +
            '.geetest_slider, #nc_1_wrapper, .JDJRV-slide'
        );
        if (slider) {
            result.type = 'slider';
            result.details.selector = slider.className;
            return result;
        }

        // Check for image-text CAPTCHA
        const captchaImg = document.querySelector(
            'img[src*="captcha"], img[src*="verify"], img[alt*="captcha"], ' +
            'img[class*="captcha"], canvas[class*="captcha"]'
        );
        const captchaInput = document.querySelector(
            'input[name*="captcha"], input[placeholder*="验证码"], input[placeholder*="captcha"]'
        );
        if (captchaImg && captchaInput) {
            result.type = 'image_text';
            result.details.hasImage = true;
            result.details.hasInput = true;
            return result;
        }

        // Check page title and content for challenge indicators
        const title = document.title.toLowerCase();
        const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 2000);
        if (title.includes('captcha') || title.includes('verify') || title.includes('challenge') ||
            title.includes('验证') || title.includes('access denied') ||
            bodyText.includes('prove you are human') || bodyText.includes('complete the security check') ||
            bodyText.includes('请完成安全验证')) {
            result.type = 'image_text'; // generic CAPTCHA
            result.details.detected = 'from-title-or-text';
            return result;
        }

        return result;
    });

    return detection;
}

/**
 * Attempt to solve a CAPTCHA.
 * @param {string} browserId
 * @param {string} captchaType - From detectCaptcha
 * @param {object} [options]
 * @param {Function} [options.onManualNeeded] - Callback when manual intervention needed
 * @returns {Promise<{ solved: boolean, method: string, details: string }>}
 */
async function solveCaptcha(browserId, captchaType, options = {}) {
    switch (captchaType) {
        case CAPTCHA_TYPES.CLOUDFLARE:
            return solveCloudflare(browserId);
        case CAPTCHA_TYPES.RECAPTCHA:
            return solveRecaptcha(browserId, options);
        case CAPTCHA_TYPES.HCAPTCHA:
            return solveHcaptcha(browserId, options);
        case CAPTCHA_TYPES.SLIDER:
            return solveSlider(browserId);
        case CAPTCHA_TYPES.IMAGE_TEXT:
            return solveImageText(browserId, options);
        case CAPTCHA_TYPES.NONE:
            return { solved: true, method: 'none', details: 'No CAPTCHA detected' };
        default:
            return { solved: false, method: 'unknown', details: `Unknown CAPTCHA type: ${captchaType}` };
    }
}

/**
 * Cloudflare challenge — usually auto-completes after waiting.
 */
async function solveCloudflare(browserId) {
    const page = await browserPool.getPage(browserId);

    // Cloudflare challenges often auto-resolve after a few seconds
    try {
        await page.waitForFunction(() => {
            return !document.querySelector('#cf-challenge-running, .cf-browser-verification, #challenge-running');
        }, { timeout: 15000 });
        return { solved: true, method: 'wait', details: 'Cloudflare challenge auto-resolved' };
    } catch (_) {
        // Try clicking the Turnstile checkbox if present
        try {
            const turnstile = await page.$('.cf-turnstile iframe');
            if (turnstile) {
                const frame = await turnstile.contentFrame();
                if (frame) {
                    const checkbox = await frame.$('input[type="checkbox"], .ctp-checkbox-label');
                    if (checkbox) {
                        await checkbox.click();
                        await page.waitForTimeout(3000);
                        return { solved: true, method: 'click-turnstile', details: 'Clicked Turnstile checkbox' };
                    }
                }
            }
        } catch (_) {}

        return { solved: false, method: 'wait', details: 'Cloudflare challenge did not auto-resolve' };
    }
}

/**
 * reCAPTCHA v2 — try clicking checkbox.
 */
async function solveRecaptcha(browserId, options) {
    const page = await browserPool.getPage(browserId);

    try {
        // Find reCAPTCHA iframe and click the checkbox
        const frames = page.frames();
        for (const frame of frames) {
            if (frame.url().includes('recaptcha/api2/anchor')) {
                const checkbox = await frame.$('#recaptcha-anchor');
                if (checkbox) {
                    await checkbox.click();
                    await page.waitForTimeout(3000);

                    // Check if solved (checkbox gets "checked" class)
                    const checked = await frame.evaluate(() => {
                        const anchor = document.querySelector('#recaptcha-anchor');
                        return anchor?.getAttribute('aria-checked') === 'true';
                    });

                    if (checked) {
                        return { solved: true, method: 'click-checkbox', details: 'reCAPTCHA checkbox clicked successfully' };
                    }
                }
            }
        }
    } catch (_) {}

    // Manual fallback
    if (options.onManualNeeded) {
        return { solved: false, method: 'manual-needed', details: 'reCAPTCHA requires manual solving' };
    }
    return { solved: false, method: 'failed', details: 'Could not solve reCAPTCHA automatically' };
}

/**
 * hCaptcha — similar to reCAPTCHA, try checkbox click.
 */
async function solveHcaptcha(browserId, options) {
    const page = await browserPool.getPage(browserId);

    try {
        const frames = page.frames();
        for (const frame of frames) {
            if (frame.url().includes('hcaptcha.com/captcha')) {
                const checkbox = await frame.$('#checkbox');
                if (checkbox) {
                    await checkbox.click();
                    await page.waitForTimeout(3000);
                    return { solved: true, method: 'click-checkbox', details: 'hCaptcha checkbox clicked' };
                }
            }
        }
    } catch (_) {}

    return { solved: false, method: 'failed', details: 'Could not solve hCaptcha automatically' };
}

/**
 * Slider CAPTCHA — attempt to drag the slider to the end.
 */
async function solveSlider(browserId) {
    const page = await browserPool.getPage(browserId);

    try {
        // Try common slider selectors
        const selectors = [
            '.slider-captcha .slider-button',
            '.slide-verify .slide-btn',
            '.geetest_slider_button',
            '#nc_1_n1z',
            '[class*="slider"] [class*="btn"]',
            '[class*="drag"] [class*="btn"]'
        ];

        for (const sel of selectors) {
            const slider = await page.$(sel);
            if (slider) {
                const box = await slider.boundingBox();
                if (box) {
                    // Drag from current position to the right edge
                    const startX = box.x + box.width / 2;
                    const startY = box.y + box.height / 2;

                    await page.mouse.move(startX, startY);
                    await page.mouse.down();
                    // Drag to the right (usually 260-300px)
                    for (let i = 0; i < 300; i += 5) {
                        await page.mouse.move(startX + i, startY + Math.random() * 2 - 1, { steps: 2 });
                    }
                    await page.mouse.up();
                    await page.waitForTimeout(2000);

                    return { solved: true, method: 'drag', details: `Dragged slider with selector: ${sel}` };
                }
            }
        }
    } catch (_) {}

    return { solved: false, method: 'failed', details: 'Could not find or drag slider' };
}

/**
 * Image-text CAPTCHA — requires manual solving or AI vision.
 * For now, returns manual-needed status.
 */
async function solveImageText(browserId, options) {
    // Image-text CAPTCHAs are too varied for simple automation
    // Would need AI vision (screenshot → OCR/classify → type answer)
    return { solved: false, method: 'manual-needed', details: 'Image-text CAPTCHA requires manual solving or AI vision' };
}

/**
 * Register CAPTCHA tools in the tool registry.
 */
function registerAll() {
    toolRegistry.register({
        name: 'captcha_detect',
        description: 'Detect CAPTCHA type on the current page. Returns type (recaptcha, hcaptcha, cloudflare, slider, image_text, none) and details.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string', description: 'Browser instance ID' }
            },
            required: ['browserId']
        },
        category: 'captcha',
        handler: async ({ browserId }) => {
            return detectCaptcha(browserId);
        }
    });

    toolRegistry.register({
        name: 'captcha_solve',
        description: 'Attempt to solve a detected CAPTCHA. Works for Cloudflare, reCAPTCHA checkbox, slider. Returns solved status.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string', description: 'Browser instance ID' },
                captchaType: { type: 'string', description: 'CAPTCHA type from captcha_detect' }
            },
            required: ['browserId']
        },
        category: 'captcha',
        handler: async ({ browserId, captchaType }) => {
            if (!captchaType) {
                // Auto-detect first
                const detection = await detectCaptcha(browserId);
                captchaType = detection.type;
            }
            return solveCaptcha(browserId, captchaType);
        }
    });

    console.log('[captchaSolver] Registered 2 CAPTCHA tools');
}

module.exports = {
    detectCaptcha,
    solveCaptcha,
    registerAll,
    CAPTCHA_TYPES
};
