'use strict';

/**
 * auto_apply domain tool — Open job listing in browser and auto-fill application form.
 *
 * Flow:
 *   1. Launch browser (fingerprint if available)
 *   2. Navigate to job URL
 *   3. Detect CAPTCHA → solve
 *   4. Find and fill application form fields from profile
 *   5. Attach resume if upload field found
 *   6. Update application status in dashboard
 *
 * NOTE: This is a best-effort automation. Many sites have unique form layouts.
 * Manual fallback is always available via the dashboard.
 */

const toolServiceClient = require('../core/toolServiceClient');

const TOOL_DEF = {
    name: 'auto_apply',
    description: 'Open a job listing URL in browser, attempt to auto-fill application form from profile data. Returns status of the application attempt.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Job listing URL to apply to' },
            profile: { type: 'object', description: 'User profile: { basic, skills, experience, education }' },
            resumeMarkdown: { type: 'string', description: 'Resume content in Markdown (optional)' },
            headless: { type: 'boolean', description: 'Run browser headless (default false for manual oversight)' }
        },
        required: ['url', 'profile']
    },
    category: 'job-seek'
};

/**
 * Common form field mappings.
 * Maps profile fields to common form field selectors.
 */
const FIELD_MAPPINGS = [
    { profileKey: 'name', selectors: ['input[name*="name"]', 'input[id*="name"]', 'input[placeholder*="name"]', 'input[placeholder*="姓名"]'], extract: (basic) => basic.split(/[,\n]/)[0]?.trim() || '' },
    { profileKey: 'email', selectors: ['input[type="email"]', 'input[name*="email"]', 'input[id*="email"]', 'input[placeholder*="email"]', 'input[placeholder*="邮箱"]'], extract: (basic) => { const m = basic.match(/[\w.-]+@[\w.-]+\.\w+/); return m ? m[0] : ''; } },
    { profileKey: 'phone', selectors: ['input[type="tel"]', 'input[name*="phone"]', 'input[id*="phone"]', 'input[placeholder*="phone"]', 'input[placeholder*="电话"]'], extract: (basic) => { const m = basic.match(/[\d\s+()-]{7,}/); return m ? m[0].trim() : ''; } },
    { profileKey: 'location', selectors: ['input[name*="location"]', 'input[name*="city"]', 'input[id*="location"]', 'input[placeholder*="location"]', 'input[placeholder*="地点"]'], extract: (basic) => { const parts = basic.split(/[,\n]/); return parts[1]?.trim() || ''; } }
];

/**
 * Attempt to auto-fill form fields on the page.
 * @param {string} browserId
 * @param {object} profile
 * @returns {Promise<{ filled: string[], skipped: string[] }>}
 */
async function fillFormFields(browserId, profile) {
    const basic = profile.basic || '';
    const filled = [];
    const skipped = [];

    for (const mapping of FIELD_MAPPINGS) {
        const value = mapping.extract(basic);
        if (!value) {
            skipped.push(mapping.profileKey);
            continue;
        }

        let fieldFilled = false;
        for (const selector of mapping.selectors) {
            const typeResult = await toolServiceClient.executeTool('page_type', {
                browserId,
                selector,
                text: value
            });
            if (typeResult.success) {
                filled.push(mapping.profileKey);
                fieldFilled = true;
                break;
            }
        }
        if (!fieldFilled) {
            skipped.push(mapping.profileKey);
        }
    }

    return { filled, skipped };
}

/**
 * Execute auto-apply.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function handler({ url, profile, resumeMarkdown, headless = false }) {
    if (!url) throw new Error('url is required');
    if (!profile) throw new Error('profile is required');

    const steps = [];

    // Step 1: Launch browser
    const launch = await toolServiceClient.executeTool('browser_launch', { headless });
    if (!launch.success) {
        throw new Error(`Browser launch failed: ${launch.error}`);
    }
    const browserId = launch.result.browserId;
    steps.push({ step: 'launch', status: 'ok', mode: launch.result.mode });

    try {
        // Step 2: Navigate to job URL
        const goto = await toolServiceClient.executeTool('page_goto', {
            browserId,
            url,
            waitFor: 3000
        });
        if (!goto.success) {
            steps.push({ step: 'navigate', status: 'failed', error: goto.error });
            return { success: false, steps, message: 'Failed to navigate to job page' };
        }
        steps.push({ step: 'navigate', status: 'ok', title: goto.result?.title });

        // Step 3: Check for CAPTCHA
        const detect = await toolServiceClient.executeTool('captcha_detect', { browserId });
        if (detect.success && detect.result?.type !== 'none') {
            steps.push({ step: 'captcha_detected', type: detect.result.type });

            const solve = await toolServiceClient.executeTool('captcha_solve', {
                browserId,
                captchaType: detect.result.type
            });
            steps.push({
                step: 'captcha_solve',
                status: solve.success && solve.result?.solved ? 'solved' : 'unsolved',
                method: solve.result?.method
            });
        } else {
            steps.push({ step: 'captcha_check', status: 'none' });
        }

        // Step 4: Look for apply button or form
        const clickResult = await toolServiceClient.executeTool('page_click', {
            browserId,
            selector: 'a[href*="apply"], button[id*="apply"], button[class*="apply"], a[class*="apply"], [data-testid*="apply"], button:has-text("Apply"), a:has-text("Apply")'
        });
        if (clickResult.success) {
            steps.push({ step: 'click_apply', status: 'ok' });
            // Wait for form to load
            await new Promise(r => setTimeout(r, 2000));
        } else {
            steps.push({ step: 'click_apply', status: 'not_found', note: 'No apply button found on page' });
        }

        // Step 5: Attempt to fill form fields
        const fillResult = await fillFormFields(browserId, profile);
        steps.push({
            step: 'fill_form',
            filled: fillResult.filled,
            skipped: fillResult.skipped,
            status: fillResult.filled.length > 0 ? 'partial' : 'no_fields_found'
        });

        // Step 6: Take screenshot for user review
        const screenshot = await toolServiceClient.executeTool('page_screenshot', { browserId });
        if (screenshot.success) {
            steps.push({ step: 'screenshot', status: 'ok', format: screenshot.result?.format });
        }

        // Don't submit automatically — let user review
        const message = fillResult.filled.length > 0
            ? `Filled ${fillResult.filled.length} fields (${fillResult.filled.join(', ')}). Please review and submit manually.`
            : 'Could not find application form fields. Please apply manually on the opened page.';

        return {
            success: true,
            browserId, // Keep browser open for manual review
            url,
            steps,
            message,
            filledFields: fillResult.filled,
            skippedFields: fillResult.skipped
        };
    } catch (err) {
        // Close browser on error
        await toolServiceClient.executeTool('browser_close', { browserId });
        throw err;
    }
}

module.exports = { TOOL_DEF, handler, fillFormFields, FIELD_MAPPINGS };
