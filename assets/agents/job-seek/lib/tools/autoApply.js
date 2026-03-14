'use strict';

/**
 * auto_apply domain tool — Open job listing in browser, auto-fill, upload resume, and submit.
 *
 * Flow:
 *   1. Launch browser (fingerprint if available)
 *   2. Navigate to job URL
 *   3. Detect CAPTCHA → solve
 *   4. Detect platform → use platform-specific or generic selectors
 *   5. Click apply button
 *   6. Fill form fields (multi-step if needed)
 *   7. Upload resume DOCX + cover letter
 *   8. Submit application (if autoSubmit enabled)
 *   9. Verify success via text/URL indicators
 *  10. Take screenshot for notification/review
 *
 * Supports:
 *   - Known platforms (Indeed, LinkedIn, Boss直聘) via applyPatterns.js
 *   - Generic sites with common form selectors
 *   - AI-driven form analysis for unknown layouts (via aiFormAnalyzer callback)
 */

const toolServiceClient = require('../core/toolServiceClient');
const { detectPlatform, GENERIC_SUBMIT_SELECTORS, GENERIC_SUCCESS_INDICATORS } = require('./applyPatterns');

const TOOL_DEF = {
    name: 'auto_apply',
    description: 'Open a job listing URL in browser, auto-fill application form, upload resume DOCX, and optionally auto-submit. Returns status with screenshot for verification.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Job listing URL to apply to' },
            profile: { type: 'object', description: 'User profile: { basic, skills, experience, education }' },
            resumeDocxPath: { type: 'string', description: 'Absolute path to resume DOCX file for upload' },
            coverLetterDocxPath: { type: 'string', description: 'Absolute path to cover letter DOCX file for upload' },
            autoSubmit: { type: 'boolean', description: 'Auto-click submit after filling (default true)' },
            headless: { type: 'boolean', description: 'Run browser headless (default false)' },
            aiFormAnalyzer: { type: 'object', description: 'AI callback for unknown form layouts (injected)' }
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

// ─── Helper: wait ───
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Attempt to auto-fill form fields on the page.
 * @param {string} browserId
 * @param {object} profile
 * @param {object} [platformFields] - Platform-specific field overrides
 * @returns {Promise<{ filled: string[], skipped: string[] }>}
 */
async function fillFormFields(browserId, profile, platformFields = {}) {
    const basic = profile.basic || '';
    const filled = [];
    const skipped = [];

    for (const mapping of FIELD_MAPPINGS) {
        const value = mapping.extract(basic);
        if (!value) {
            skipped.push(mapping.profileKey);
            continue;
        }

        // Use platform-specific selectors first, then generic
        const selectors = [
            ...(platformFields[mapping.profileKey] || []),
            ...mapping.selectors
        ];

        let fieldFilled = false;
        for (const selector of selectors) {
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
 * Click the first matching selector from a list.
 * @param {string} browserId
 * @param {string[]} selectors
 * @returns {Promise<{ clicked: boolean, selector: string|null }>}
 */
async function clickFirst(browserId, selectors) {
    for (const selector of selectors) {
        const result = await toolServiceClient.executeTool('page_click', {
            browserId,
            selector
        });
        if (result.success) {
            return { clicked: true, selector };
        }
    }
    return { clicked: false, selector: null };
}

/**
 * Take a screenshot and return base64 data.
 * @param {string} browserId
 * @returns {Promise<{ ok: boolean, base64: string|null, format: string|null }>}
 */
async function takeScreenshot(browserId) {
    const result = await toolServiceClient.executeTool('page_screenshot', { browserId });
    if (result.success) {
        return {
            ok: true,
            base64: result.result?.base64 || result.result?.data || null,
            format: result.result?.format || 'png'
        };
    }
    return { ok: false, base64: null, format: null };
}

/**
 * Check the current page for success indicators.
 * @param {string} browserId
 * @param {{ text: RegExp[], urlPattern: RegExp[] }} indicators
 * @returns {Promise<{ detected: boolean, method: string|null, detail: string|null }>}
 */
async function checkSuccess(browserId, indicators) {
    // Check URL patterns
    const urlResult = await toolServiceClient.executeTool('page_url', { browserId });
    if (urlResult.success && urlResult.result?.url) {
        const currentUrl = urlResult.result.url;
        for (const pattern of indicators.urlPattern || []) {
            if (pattern.test(currentUrl)) {
                return { detected: true, method: 'url', detail: currentUrl };
            }
        }
    }

    // Check page text content
    const textResult = await toolServiceClient.executeTool('page_text', { browserId });
    if (textResult.success && textResult.result?.text) {
        const pageText = textResult.result.text;
        for (const pattern of indicators.text || []) {
            if (pattern.test(pageText)) {
                return { detected: true, method: 'text', detail: pattern.toString() };
            }
        }
    }

    return { detected: false, method: null, detail: null };
}

/**
 * Handle multi-step apply flow (LinkedIn Easy Apply, Indeed multi-page).
 * Iterates through form pages clicking Next/Continue until Submit is found.
 * @param {string} browserId
 * @param {object} profile
 * @param {object} platformPattern
 * @param {string|null} resumeDocxPath
 * @param {object[]} steps - Steps array to push progress into
 * @returns {Promise<{ submitted: boolean }>}
 */
async function handleMultiStepApply(browserId, profile, platformPattern, resumeDocxPath, steps) {
    const maxSteps = platformPattern.maxSteps || 5;
    let submitted = false;

    for (let page = 0; page < maxSteps; page++) {
        await wait(1500);

        // Try to fill any visible form fields on this step
        const fillResult = await fillFormFields(browserId, profile, platformPattern.fields || {});
        if (fillResult.filled.length > 0) {
            steps.push({
                step: `multi_step_fill_${page}`,
                filled: fillResult.filled,
                status: 'ok'
            });
        }

        // Try to upload resume if file input visible on this step
        if (resumeDocxPath) {
            const resumeSelectors = platformPattern.resumeUpload || RESUME_UPLOAD_SELECTORS;
            const uploadResult = await uploadFile(browserId, resumeDocxPath, resumeSelectors);
            if (uploadResult.uploaded) {
                steps.push({ step: `multi_step_upload_${page}`, status: 'ok' });
            }
        }

        // Try submit button first
        const submitResult = await clickFirst(browserId, platformPattern.submitButton || []);
        if (submitResult.clicked) {
            steps.push({ step: 'submit', status: 'clicked', selector: submitResult.selector, page });
            submitted = true;
            break;
        }

        // Try next/continue button
        const nextResult = await clickFirst(browserId, platformPattern.nextButton || []);
        if (nextResult.clicked) {
            steps.push({ step: `multi_step_next_${page}`, status: 'ok', selector: nextResult.selector });
            continue;
        }

        // Neither submit nor next found — done iterating
        steps.push({ step: `multi_step_${page}`, status: 'no_button_found' });
        break;
    }

    return { submitted };
}

/**
 * Handle chat-based apply (Boss直聘 style).
 * @param {string} browserId
 * @param {object} platformPattern
 * @param {object[]} steps
 * @returns {Promise<{ submitted: boolean }>}
 */
async function handleChatApply(browserId, platformPattern, steps) {
    // Type greeting message
    const greeting = platformPattern.chatGreeting || '您好，我对这个职位很感兴趣';
    const chatInputSelectors = platformPattern.chatInput || [];
    const chatSendSelectors = platformPattern.chatSendButton || [];

    // Type into chat input
    let typed = false;
    for (const selector of chatInputSelectors) {
        const typeResult = await toolServiceClient.executeTool('page_type', {
            browserId,
            selector,
            text: greeting
        });
        if (typeResult.success) {
            typed = true;
            steps.push({ step: 'chat_type', status: 'ok', selector });
            break;
        }
    }

    if (!typed) {
        steps.push({ step: 'chat_type', status: 'not_found' });
        return { submitted: false };
    }

    await wait(500);

    // Click send
    const sendResult = await clickFirst(browserId, chatSendSelectors);
    if (sendResult.clicked) {
        steps.push({ step: 'chat_send', status: 'ok', selector: sendResult.selector });
        return { submitted: true };
    }

    steps.push({ step: 'chat_send', status: 'not_found' });
    return { submitted: false };
}

/**
 * Execute auto-apply.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function handler({
    url, profile, resumeDocxPath, coverLetterDocxPath,
    autoSubmit = true, headless = false, aiFormAnalyzer = null
}) {
    if (!url) throw new Error('url is required');
    if (!profile) throw new Error('profile is required');

    const steps = [];

    // Detect platform
    const platform = detectPlatform(url);
    const platformPattern = platform?.pattern || null;
    const platformName = platform?.key || 'unknown';
    steps.push({ step: 'detect_platform', platform: platformName, name: platformPattern?.name || 'Generic' });

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
            return _buildResult(false, { browserId, url, steps, message: 'Failed to navigate to job page' });
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
            const captchaSolved = solve.success && solve.result?.solved;
            steps.push({
                step: 'captcha_solve',
                status: captchaSolved ? 'solved' : 'unsolved',
                method: solve.result?.method
            });

            if (!captchaSolved) {
                const ss = await takeScreenshot(browserId);
                return _buildResult(false, {
                    browserId, url, steps,
                    message: 'CAPTCHA could not be solved automatically',
                    screenshotBase64: ss.base64
                });
            }
        } else {
            steps.push({ step: 'captcha_check', status: 'none' });
        }

        // Step 4: Click apply button
        const applySelectors = platformPattern?.applyButton || [
            'a[href*="apply"]', 'button[id*="apply"]', 'button[class*="apply"]',
            'a[class*="apply"]', '[data-testid*="apply"]',
            'button:has-text("Apply")', 'a:has-text("Apply")'
        ];
        const clickApplyResult = await clickFirst(browserId, applySelectors);
        if (clickApplyResult.clicked) {
            steps.push({ step: 'click_apply', status: 'ok', selector: clickApplyResult.selector });
            await wait(2000);
        } else {
            steps.push({ step: 'click_apply', status: 'not_found', note: 'No apply button found on page' });
        }

        // Step 5: Fill form + upload + submit (varies by mode)
        let submitted = false;
        let fillResult = { filled: [], skipped: [] };

        if (platformPattern?.chatBased) {
            // ─── Chat-based apply (Boss直聘) ───
            const chatResult = await handleChatApply(browserId, platformPattern, steps);
            submitted = chatResult.submitted;

        } else if (platformPattern?.multiStep) {
            // ─── Multi-step apply (LinkedIn Easy Apply, Indeed) ───
            const msResult = await handleMultiStepApply(
                browserId, profile, platformPattern, resumeDocxPath, steps
            );
            submitted = msResult.submitted;

        } else {
            // ─── Standard single-page apply ───
            // Fill form fields
            fillResult = await fillFormFields(browserId, profile, platformPattern?.fields || {});
            steps.push({
                step: 'fill_form',
                filled: fillResult.filled,
                skipped: fillResult.skipped,
                status: fillResult.filled.length > 0 ? 'partial' : 'no_fields_found'
            });

            // Upload resume DOCX
            if (resumeDocxPath) {
                const resumeSelectors = platformPattern?.resumeUpload || RESUME_UPLOAD_SELECTORS;
                const uploadResult = await uploadFile(browserId, resumeDocxPath, resumeSelectors);
                steps.push({
                    step: 'upload_resume',
                    status: uploadResult.uploaded ? 'ok' : 'not_found',
                    selector: uploadResult.selector,
                    error: uploadResult.error
                });
            } else {
                steps.push({ step: 'upload_resume', status: 'skipped', note: 'No DOCX file provided' });
            }

            // Upload cover letter DOCX
            if (coverLetterDocxPath) {
                const clSelectors = [
                    'input[type="file"][name*="cover"]',
                    'input[type="file"][id*="cover"]',
                    'input[type="file"][name*="letter"]',
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

            // AI-driven form analysis fallback for unknown sites
            if (fillResult.filled.length === 0 && !platformPattern && aiFormAnalyzer) {
                try {
                    const ss = await takeScreenshot(browserId);
                    const domSnapshot = await toolServiceClient.executeTool('page_evaluate', {
                        browserId,
                        expression: `JSON.stringify(Array.from(document.querySelectorAll('input,textarea,select,button')).map(el => ({
                            tag: el.tagName, type: el.type, name: el.name, id: el.id,
                            placeholder: el.placeholder, value: el.value,
                            text: el.textContent?.slice(0, 100),
                            selector: el.id ? '#' + el.id : (el.name ? el.tagName.toLowerCase() + '[name="' + el.name + '"]' : null)
                        })))`
                    });

                    const instructions = await aiFormAnalyzer({
                        screenshot: ss.base64,
                        domSnapshot: domSnapshot.result,
                        profile,
                        prompt: 'Identify form fields and map to profile data. Return JSON array: [{selector, value, action}]'
                    });

                    if (Array.isArray(instructions)) {
                        let aiFilled = 0;
                        for (const inst of instructions) {
                            if (inst.action === 'type' && inst.selector && inst.value) {
                                const r = await toolServiceClient.executeTool('page_type', {
                                    browserId, selector: inst.selector, text: inst.value
                                });
                                if (r.success) aiFilled++;
                            } else if (inst.action === 'select' && inst.selector && inst.value) {
                                const r = await toolServiceClient.executeTool('page_select', {
                                    browserId, selector: inst.selector, value: inst.value
                                });
                                if (r.success) aiFilled++;
                            }
                        }
                        steps.push({ step: 'ai_form_fill', status: aiFilled > 0 ? 'ok' : 'no_match', filled: aiFilled });
                    }
                } catch (aiErr) {
                    steps.push({ step: 'ai_form_fill', status: 'error', error: aiErr.message });
                }
            }

            // Auto-submit
            if (autoSubmit) {
                const submitSelectors = platformPattern?.submitButton || GENERIC_SUBMIT_SELECTORS;
                const submitResult = await clickFirst(browserId, submitSelectors);
                if (submitResult.clicked) {
                    steps.push({ step: 'submit', status: 'clicked', selector: submitResult.selector });
                    submitted = true;
                } else {
                    steps.push({ step: 'submit', status: 'not_found', note: 'No submit button found' });
                }
            }
        }

        // Step 6: Wait and verify success
        if (submitted) {
            await wait(3000);
            const successIndicators = platformPattern?.successIndicators || GENERIC_SUCCESS_INDICATORS;
            const successCheck = await checkSuccess(browserId, successIndicators);
            steps.push({
                step: 'verify_success',
                detected: successCheck.detected,
                method: successCheck.method,
                detail: successCheck.detail
            });
        }

        // Step 7: Take screenshot
        const screenshot = await takeScreenshot(browserId);
        if (screenshot.ok) {
            steps.push({ step: 'screenshot', status: 'ok', format: screenshot.format });
        }

        // Build result
        const resumeUploaded = steps.some(s => s.step === 'upload_resume' && s.status === 'ok');
        const successDetected = steps.find(s => s.step === 'verify_success')?.detected || false;
        const filledCount = fillResult.filled.length + (steps.find(s => s.step === 'ai_form_fill')?.filled || 0);

        const msgParts = [];
        if (submitted && successDetected) msgParts.push('Application submitted successfully');
        else if (submitted) msgParts.push('Submit clicked (verification inconclusive)');
        else if (autoSubmit) msgParts.push('Could not find submit button');
        if (filledCount > 0) msgParts.push(`filled ${filledCount} fields`);
        if (resumeUploaded) msgParts.push('uploaded resume');
        const message = msgParts.length > 0
            ? msgParts.join(', ') + '.'
            : 'Could not find application form. Manual apply may be needed.';

        return _buildResult(true, {
            browserId,
            url,
            steps,
            message,
            filledFields: fillResult.filled,
            skippedFields: fillResult.skipped,
            resumeUploaded,
            submitted,
            successDetected,
            screenshotBase64: screenshot.base64,
            platform: platformName
        });

    } catch (err) {
        // Close browser on error
        await toolServiceClient.executeTool('browser_close', { browserId });
        throw err;
    }
}

/**
 * Build a standardized result object.
 */
function _buildResult(success, extras = {}) {
    return { success, ...extras };
}

module.exports = {
    TOOL_DEF,
    handler,
    fillFormFields,
    uploadFile,
    clickFirst,
    takeScreenshot,
    checkSuccess,
    handleMultiStepApply,
    handleChatApply,
    FIELD_MAPPINGS,
    RESUME_UPLOAD_SELECTORS
};
