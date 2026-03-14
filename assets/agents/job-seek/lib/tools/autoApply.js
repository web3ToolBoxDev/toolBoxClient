'use strict';

/**
 * auto_apply domain tool — Open job listing in browser and auto-fill application form.
 *
 * Flow:
 *   1. Launch browser (fingerprint if available)
 *   2. Navigate to job URL
 *   3. Detect CAPTCHA → solve
 *   4. Find and fill application form fields from profile
 *   5. Upload resume DOCX if file input found
 *   6. Take screenshot for user review
 *   7. Update application status in dashboard
 *
 * NOTE: This is a best-effort automation. Many sites have unique form layouts.
 * Manual fallback is always available via the dashboard.
 */

const toolServiceClient = require('../core/toolServiceClient');

const TOOL_DEF = {
    name: 'auto_apply',
    description: 'Open a job listing URL in browser, attempt to auto-fill application form from profile data and upload resume DOCX. Returns status of the application attempt.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Job listing URL to apply to' },
            profile: { type: 'object', description: 'User profile: { basic, skills, experience, education }' },
            resumeDocxPath: { type: 'string', description: 'Absolute path to resume DOCX file for upload (optional)' },
            coverLetterDocxPath: { type: 'string', description: 'Absolute path to cover letter DOCX file for upload (optional)' },
            resumeMarkdown: { type: 'string', description: 'Resume content in Markdown (deprecated, use resumeDocxPath)' },
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
 * Resume/CV file upload selectors (ordered by specificity).
 */
const RESUME_UPLOAD_SELECTORS = [
    'input[type="file"][name*="resume"]',
    'input[type="file"][name*="cv"]',
    'input[type="file"][id*="resume"]',
    'input[type="file"][id*="cv"]',
    'input[type="file"][accept*=".doc"]',
    'input[type="file"][accept*=".pdf"]',
    'input[type="file"][accept*="word"]',
    'input[type="file"]'  // fallback: any file input
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
 * Attempt to upload a file to the first matching file input on the page.
 * @param {string} browserId
 * @param {string} filePath - Absolute path to the file
 * @param {string[]} selectors - Ordered list of CSS selectors to try
 * @returns {Promise<{ uploaded: boolean, selector: string|null, error: string|null }>}
 */
async function uploadFile(browserId, filePath, selectors = RESUME_UPLOAD_SELECTORS) {
    if (!filePath) return { uploaded: false, selector: null, error: 'No file path provided' };

    for (const selector of selectors) {
        const result = await toolServiceClient.executeTool('page_upload_file', {
            browserId,
            selector,
            filePath
        });
        if (result.success) {
            return { uploaded: true, selector, error: null };
        }
    }
    return { uploaded: false, selector: null, error: 'No file input found on page' };
}

/**
 * Execute auto-apply.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function handler({ url, profile, resumeDocxPath, coverLetterDocxPath, resumeMarkdown, headless = false }) {
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

        // Step 6: Upload resume DOCX if available
        if (resumeDocxPath) {
            const uploadResult = await uploadFile(browserId, resumeDocxPath, RESUME_UPLOAD_SELECTORS);
            steps.push({
                step: 'upload_resume',
                status: uploadResult.uploaded ? 'ok' : 'not_found',
                selector: uploadResult.selector,
                error: uploadResult.error
            });
        } else {
            steps.push({ step: 'upload_resume', status: 'skipped', note: 'No DOCX file provided' });
        }

        // Step 6b: Upload cover letter DOCX if available (look for second file input)
        if (coverLetterDocxPath) {
            const clSelectors = [
                'input[type="file"][name*="cover"]',
                'input[type="file"][id*="cover"]',
                'input[type="file"][name*="letter"]',
                // If resume already uploaded to first input, try remaining file inputs
                'input[type="file"]:not([name*="resume"]):not([id*="resume"])'
            ];
            const uploadResult = await uploadFile(browserId, coverLetterDocxPath, clSelectors);
            steps.push({
                step: 'upload_cover_letter',
                status: uploadResult.uploaded ? 'ok' : 'not_found',
                selector: uploadResult.selector,
                error: uploadResult.error
            });
        }

        // Step 7: Take screenshot for user review
        const screenshot = await toolServiceClient.executeTool('page_screenshot', { browserId });
        if (screenshot.success) {
            steps.push({ step: 'screenshot', status: 'ok', format: screenshot.result?.format });
        }

        // Don't submit automatically — let user review
        const filledCount = fillResult.filled.length;
        const resumeUploaded = steps.find(s => s.step === 'upload_resume')?.status === 'ok';
        const parts = [];
        if (filledCount > 0) parts.push(`filled ${filledCount} fields (${fillResult.filled.join(', ')})`);
        if (resumeUploaded) parts.push('uploaded resume');
        const message = parts.length > 0
            ? `${parts.join(', ')}. Please review and submit manually.`
            : 'Could not find application form fields. Please apply manually on the opened page.';

        return {
            success: true,
            browserId, // Keep browser open for manual review
            url,
            steps,
            message,
            filledFields: fillResult.filled,
            skippedFields: fillResult.skipped,
            resumeUploaded
        };
    } catch (err) {
        // Close browser on error
        await toolServiceClient.executeTool('browser_close', { browserId });
        throw err;
    }
}

module.exports = { TOOL_DEF, handler, fillFormFields, uploadFile, FIELD_MAPPINGS, RESUME_UPLOAD_SELECTORS };
