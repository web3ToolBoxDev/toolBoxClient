'use strict';

/**
 * Script Builder — AI-driven Puppeteer script generation for job platforms.
 *
 * 5-step build flow:
 *   1. Page Load   — navigate to platform URL via toolServiceClient
 *   2. DOM Analysis — extract page structure (inputs, buttons, selectors)
 *   3. AI Generate  — send DOM + screenshot to AI, receive Puppeteer script
 *   4. Verify       — execute script with test keywords, screenshot-verify via AI
 *   5. Store        — save validated script to platformStore
 *
 * All browser operations go through toolServiceClient (tool calls to toolService :30004).
 * The AI caller is injected as `options.aiInvoke` for flexibility.
 */

// ---------------------------------------------------------------------------
// Lazy-require helpers (avoid circular deps)
// ---------------------------------------------------------------------------

let _platformStore = null;
function getPlatformStore() {
    if (!_platformStore) _platformStore = require('./platformStore');
    return _platformStore;
}

let _tsc = null;
function getTSC() {
    if (!_tsc) _tsc = require('../core/toolServiceClient');
    return _tsc;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 5;

const DOM_EXTRACT_SELECTOR = 'input, button, select, a[href], form, textarea, [role="search"], [role="listbox"]';

const SEARCH_OUTPUT_SCHEMA = '{ jobs: [{ title, company, url, location, salary, description }] }';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a BuildLogEntry.
 */
function logEntry(step, message, status, extra = {}) {
    return {
        step,
        totalSteps: TOTAL_STEPS,
        message,
        status,
        timestamp: new Date().toISOString(),
        ...extra
    };
}

/**
 * Emit a progress event if onProgress callback is provided.
 */
function emitProgress(buildLog, onProgress) {
    if (typeof onProgress === 'function') {
        onProgress(buildLog[buildLog.length - 1]);
    }
}

/**
 * Extract JavaScript code from an AI response string.
 * Looks for ```javascript or ```js fenced code blocks; falls back to the full text.
 */
function extractCodeBlock(text) {
    const fenced = text.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    // Try generic code fence
    const generic = text.match(/```\s*\n([\s\S]*?)```/);
    if (generic) return generic[1].trim();

    // Last resort: return trimmed text
    return text.trim();
}

/**
 * Execute a tool call via toolServiceClient.
 */
async function toolCall(name, params) {
    const res = await getTSC().executeTool(name, params);
    if (res && res.success === false) {
        throw new Error(`Tool ${name} failed: ${res.error || 'unknown'}`);
    }
    return res.result !== undefined ? res.result : res;
}

/**
 * Detect anti-bot protection pages (Cloudflare, CAPTCHA, access denied).
 * Returns a description string if blocked, or null if page looks normal.
 */
async function _detectAntiBot(browserId, pageIndex) {
    try {
        const res = await toolCall('page_evaluate', {
            browserId,
            pageIndex,
            expression: `(function() {
                var title = (document.title || '').toLowerCase();
                var body = (document.body ? document.body.innerText : '').slice(0, 2000).toLowerCase();
                // Cloudflare challenge / block
                if (title.includes('just a moment') || title.includes('attention required'))
                    return 'Cloudflare challenge page';
                if (body.includes('ray id') && (body.includes('cloudflare') || body.includes('请求被拦截')))
                    return 'Cloudflare blocked request';
                // Generic CAPTCHA
                if (body.includes('captcha') && body.includes('verify'))
                    return 'CAPTCHA verification required';
                // Access denied
                if (title.includes('access denied') || title.includes('403 forbidden'))
                    return 'Access denied (403)';
                if (body.includes('access denied') && body.length < 500)
                    return 'Access denied page';
                // Bot detection
                if (body.includes('automated') && body.includes('blocked'))
                    return 'Automated access blocked';
                if (body.includes('unusual traffic') || body.includes('异常流量'))
                    return 'Unusual traffic detected';
                return null;
            })()`
        });
        return res.result || null;
    } catch (_) {
        return null; // Can't check — proceed anyway
    }
}

/**
 * Build a concise DOM summary from raw extracted elements.
 * Returns a shortened string suitable for AI prompts.
 */
function buildDomSummary(extractedData) {
    if (!extractedData) return '(no data extracted)';
    const raw = typeof extractedData === 'string' ? extractedData : JSON.stringify(extractedData);
    // Truncate to a reasonable size for the AI context
    const MAX = 12000;
    if (raw.length > MAX) return raw.slice(0, MAX) + '\n... (truncated)';
    return raw;
}

// ---------------------------------------------------------------------------
// buildTool
// ---------------------------------------------------------------------------

/**
 * Build a search or apply tool for a platform.
 * @param {string} sessionId
 * @param {string} platformId
 * @param {'search'|'apply'} toolType
 * @param {object} options
 * @param {Function} options.aiInvoke - async (prompt, screenshot?) => string
 * @param {object}  [options.testParams] - { keywords, location }
 * @param {number}  [options.maxRetries=3]
 * @param {Function} [options.onProgress] - (BuildLogEntry) => void
 * @returns {Promise<{success: boolean, script?: string, error?: string, buildLog: BuildLogEntry[]}>}
 */
async function buildTool(sessionId, platformId, toolType, options = {}) {
    const { aiInvoke, testParams = {}, maxRetries = 3, onProgress } = options;

    if (typeof aiInvoke !== 'function') {
        return { success: false, error: 'options.aiInvoke is required', buildLog: [] };
    }
    if (!['search', 'apply'].includes(toolType)) {
        return { success: false, error: 'toolType must be "search" or "apply"', buildLog: [] };
    }

    const store = getPlatformStore();
    const buildLog = [];
    let browserId = null;
    let pageIndex = null;
    let screenshot = null;
    let reusedBrowser = false;

    try {
        // ---------------------------------------------------------------
        // Step 1 — Page Load
        // ---------------------------------------------------------------
        const platform = store.getPlatform(sessionId, platformId);
        if (!platform) {
            return { success: false, error: 'Platform not found', buildLog };
        }

        store.updateToolStatus(sessionId, platformId, toolType, 'building');


        console.log(`[dashboard:build] Step 1 — Loading ${platform.name} (${platform.url}) | _browserId=${platform._browserId || 'NONE'} | envId=${platform.envId || 'NONE'}`);
        buildLog.push(logEntry(1, `Loading ${platform.name} (${platform.url})`, 'running'));
        emitProgress(buildLog, onProgress);

        // Reuse the logged-in env browser when available, with fallback if dead
        if (platform._browserId) {
            console.log(`[dashboard:build] Step 1 — Reusing logged-in browser ${platform._browserId}, opening new tab...`);
            try {
                const newTab = await toolCall('page_new', { browserId: platform._browserId, url: platform.url, waitUntil: 'domcontentloaded' });
                browserId = platform._browserId;
                reusedBrowser = true;
                pageIndex = newTab.pageIndex !== undefined ? newTab.pageIndex : 0;
                console.log(`[dashboard:build] Step 1 — New tab opened, pageIndex=${pageIndex}`);
            } catch (reuseErr) {
                console.log(`[dashboard:build] Step 1 — Browser ${platform._browserId} is dead (${reuseErr.message}), falling back to fresh launch`);
                delete platform._browserId;
                delete platform._pageIndex;
                // Fall through to fresh launch below
            }
        }
        if (!browserId) {
            console.log(`[dashboard:build] Step 1 — No _browserId, launching fresh browser...`);
            const launchRes = await toolCall('browser_launch', { envId: platform.envId || undefined });
            browserId = launchRes.browserId;
            const gotoRes = await toolCall('page_goto', { browserId, url: platform.url });
            pageIndex = gotoRes.pageIndex !== undefined ? gotoRes.pageIndex : 0;
            console.log(`[dashboard:build] Step 1 — Fresh browser ${browserId}, pageIndex=${pageIndex}`);
        }

        // Wait for dynamic content to fully render (SPA pages like LinkedIn need extra time)
        console.log(`[dashboard:build] Step 1 — Waiting 3s for dynamic content render...`);
        await new Promise(r => setTimeout(r, 3000));

        buildLog.push(logEntry(1, `Loaded ${platform.name}`, 'success'));
        emitProgress(buildLog, onProgress);
        console.log(`[dashboard:build] Step 1 — DONE`);

        // ---------------------------------------------------------------
        // Step 2 — DOM Analysis
        // ---------------------------------------------------------------
        console.log(`[dashboard:build] Step 2 — Taking screenshot & extracting DOM...`);
        buildLog.push(logEntry(2, 'Analysing page structure', 'running'));
        emitProgress(buildLog, onProgress);

        const ssRes = await toolCall('page_screenshot', { browserId, pageIndex });
        screenshot = ssRes.base64 || ssRes.screenshot || null;
        console.log(`[dashboard:build] Step 2 — Screenshot taken: ${screenshot ? `${(screenshot.length / 1024).toFixed(1)}KB base64` : 'NULL'}`);

        // Use page_evaluate to extract rich DOM structure (inputs, buttons, forms, links)
        const extractRes = await toolCall('page_evaluate', {
            browserId,
            pageIndex,
            expression: `
                (function() {
                    const selector = '${DOM_EXTRACT_SELECTOR.replace(/'/g, "\\'")}';
                    const els = Array.from(document.querySelectorAll(selector)).slice(0, 200);
                    return els.map(el => {
                        const tag = el.tagName.toLowerCase();
                        const attrs = {};
                        ['id', 'name', 'type', 'placeholder', 'value', 'href', 'role', 'aria-label', 'class', 'data-testid', 'autocomplete', 'action', 'method'].forEach(a => {
                            const v = el.getAttribute(a);
                            if (v) attrs[a] = v.slice(0, 100);
                        });
                        const text = (el.textContent || '').trim().slice(0, 60);
                        return { tag, attrs, text: text || undefined };
                    });
                })()
            `
        });
        const domData = extractRes.result || extractRes.data || extractRes;
        const domSummary = buildDomSummary(domData);
        console.log(`[dashboard:build] Step 2 — DOM summary: ${domSummary.length} chars`);

        // Detect anti-bot blocks (Cloudflare, CAPTCHA, access denied) before wasting AI calls
        const blockDetected = await _detectAntiBot(browserId, pageIndex);
        if (blockDetected) {
            const msg = `Page blocked by anti-bot protection: ${blockDetected}. Use a fingerprint browser with a logged-in session.`;
            console.log(`[dashboard:build] Step 2 — BLOCKED: ${msg}`);
            buildLog.push(logEntry(2, msg, 'failed', screenshot ? { screenshotUrl: `data:image/png;base64,${screenshot}` } : {}));
            emitProgress(buildLog, onProgress);
            if (!reusedBrowser) {
                try { await toolCall('browser_close', { browserId }); } catch (_) { /* ignore */ }
            }
            store.updateToolStatus(sessionId, platformId, toolType, 'error', { buildLog });
            return { success: false, error: msg, buildLog };
        }

        buildLog.push(logEntry(2, 'DOM analysis complete', 'success', screenshot ? { screenshotUrl: `data:image/png;base64,${screenshot}` } : {}));
        emitProgress(buildLog, onProgress);
        console.log(`[dashboard:build] Step 2 — DONE`);

        // ---------------------------------------------------------------
        // Step 3 — AI Script Generation (with retry loop for verification)
        // ---------------------------------------------------------------
        let generatedScript = null;
        let verified = false;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            // --- Step 3: Generate ---
            console.log(`[dashboard:build] Step 3 — AI generate (attempt ${attempt + 1}/${maxRetries + 1})`);
            buildLog.push(logEntry(3, attempt === 0 ? 'Generating script via AI' : `Regenerating script (attempt ${attempt + 1})`, 'running'));
            emitProgress(buildLog, onProgress);

            const prompt = buildGeneratePrompt(platform, toolType, domSummary, lastError);
            console.log(`[dashboard:build] Step 3 — AI prompt: ${prompt.length} chars, screenshot: ${screenshot ? 'YES' : 'NO'}`);
            const aiResponse = await aiInvoke(prompt, screenshot);
            console.log(`[dashboard:build] Step 3 — AI response: ${aiResponse ? aiResponse.length : 0} chars`);
            generatedScript = extractCodeBlock(aiResponse);

            if (!generatedScript) {
                lastError = 'AI returned empty or unparseable script';
                console.log(`[dashboard:build] Step 3 — FAILED: ${lastError}`);
                buildLog.push(logEntry(3, lastError, 'failed'));
                emitProgress(buildLog, onProgress);
                continue;
            }

            console.log(`[dashboard:build] Step 3 — Script extracted: ${generatedScript.length} chars`);
            console.log(`[dashboard:build] Step 3 — Script preview:\n${generatedScript.slice(0, 500)}\n...`);
            buildLog.push(logEntry(3, 'Script generated', 'success'));
            emitProgress(buildLog, onProgress);

            // --- Step 4: Verification ---
            console.log(`[dashboard:build] Step 4 — Verifying script...`);
            buildLog.push(logEntry(4, 'Verifying script', 'running'));
            emitProgress(buildLog, onProgress);

            const verifyResult = await verifyScript(
                browserId, pageIndex, generatedScript, toolType,
                testParams, aiInvoke
            );
            console.log(`[dashboard:build] Step 4 — Verify result: ok=${verifyResult.ok} | ${verifyResult.message}`);

            if (verifyResult.screenshotUrl) {
                buildLog.push(logEntry(4, verifyResult.message, verifyResult.ok ? 'success' : 'failed', { screenshotUrl: verifyResult.screenshotUrl }));
            } else {
                buildLog.push(logEntry(4, verifyResult.message, verifyResult.ok ? 'success' : 'failed'));
            }
            emitProgress(buildLog, onProgress);

            if (verifyResult.ok) {
                verified = true;
                break;
            }

            lastError = verifyResult.message;
        }

        // Clean up: only close browser if we launched a fresh one (don't kill the shared login browser)
        if (!reusedBrowser) {
            try { await toolCall('browser_close', { browserId }); } catch (_) { /* ignore */ }
        }

        if (!verified) {
            store.updateToolStatus(sessionId, platformId, toolType, 'error', { buildLog });
            return { success: false, error: lastError || 'Verification failed after max retries', buildLog };
        }

        // ---------------------------------------------------------------
        // Step 5 — Store
        // ---------------------------------------------------------------
        buildLog.push(logEntry(5, 'Saving script', 'running'));
        emitProgress(buildLog, onProgress);

        store.updateToolStatus(sessionId, platformId, toolType, 'ready', {
            script: generatedScript,
            buildLog
        });

        buildLog.push(logEntry(5, 'Script saved — tool is ready', 'success'));
        emitProgress(buildLog, onProgress);

        return { success: true, script: generatedScript, buildLog };
    } catch (err) {
        // Ensure browser is closed on unexpected errors (only if we launched a fresh one)
        if (browserId && !reusedBrowser) {
            try { await toolCall('browser_close', { browserId }); } catch (_) { /* ignore */ }
        }
        store.updateToolStatus(sessionId, platformId, toolType, 'error', { buildLog });
        return { success: false, error: err.message, buildLog };
    }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildGeneratePrompt(platform, toolType, domSummary, previousError) {
    const typeDesc = toolType === 'search'
        ? `a SEARCH script that accepts { keywords, location, jobType, minSalary } and returns ${SEARCH_OUTPUT_SCHEMA}`
        : 'an APPLY script that fills out a job application form given { resumeText, coverLetterText, jobUrl }';

    let prompt = `You are an expert Puppeteer script writer.

Platform: ${platform.name}
URL: ${platform.url}

Generate ${typeDesc}.

The script will be executed inside an async function body that receives:
  - page: a Puppeteer-like Page proxy already navigated to the platform URL
  - params: the input parameters object

IMPORTANT — Available page methods (ONLY use these):

  Basic:
  page.goto(url)                     — navigate to a URL
  page.click(selector)               — click an element (use humanClick instead when possible)
  page.type(selector, text, {delay}) — type text (use humanType instead when possible)
  page.focus(selector)               — focus an element
  page.keyboard.press(key)           — press a key ("Enter", "Tab", "Escape", etc.)
  page.waitForSelector(selector, {timeout, visible}) — wait for element to appear
  page.waitForNavigation({timeout})  — wait for page navigation
  page.waitForTimeout(ms)            — wait for N milliseconds
  page.evaluate(fn, ...args)         — run JS in the browser (fn can be a function or string)
  page.$eval(selector, fn, ...args)  — run JS on first matching element
  page.$$eval(selector, fn, ...args) — run JS on all matching elements
  page.$(selector)                   — check if element exists (returns selector string or null)
  page.$$(selector)                  — get array of matching elements
  page.screenshot()                  — take a screenshot (returns base64)
  page.url()                         — get current page URL
  page.title()                       — get page title

  Human-like (PREFERRED for anti-detection):
  page.humanClick(selector)          — mouse moves to element with Bezier curve, then clicks
  page.humanType(selector, text)     — click, clear via triple-click+Backspace, type with 80-220ms random delay
  page.randomDelay(min, max)         — wait random ms between min and max
  page.mouse.move(x, y, {steps})     — move mouse along curved path to coordinates
  page.checkAntiBot({maxWait})       — detect Cloudflare/CAPTCHA, wait up to maxWait ms for resolution

Return ONLY a JavaScript code block (no imports, no browser creation). The code must:
1. Use \`page\` and \`params\` (do NOT require/import anything).
2. Use page.waitForSelector() with 5-10s timeouts before interacting with elements.
3. For search: fill the search form with params.keywords, submit, wait for results, extract job cards using page.$$eval(), return the results array.
4. For apply: navigate to the job URL, fill form fields, submit.
5. Wrap everything in try/catch and return { success: true, jobs: [...] } or { success: false, error: '...' }.
6. Use page.evaluate() or page.$$eval() to extract data from the DOM — do NOT use page_extract directly.
7. ANTI-DETECTION: Use page.humanClick() and page.humanType() instead of page.click()/page.type().
   Add page.randomDelay(800, 2000) between major actions. Call page.checkAntiBot() after navigation.
   NEVER use page.evaluate() to set input .value directly — always use page.humanType().

DOM structure of the page:
${domSummary}
`;

    if (previousError) {
        prompt += `\n\nPREVIOUS ATTEMPT FAILED with: ${previousError}\nPlease fix the issues and generate a corrected script.\n`;
    }

    return prompt;
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

async function verifyScript(browserId, pageIndex, script, toolType, testParams, aiInvoke) {
    try {
        const keywords = testParams.keywords || 'software engineer';
        const location = testParams.location || '';

        const execParams = toolType === 'search'
            ? { keywords, location, jobType: '', minSalary: '' }
            : { jobUrl: 'https://example.com/job/1', resumeText: 'Test resume', coverLetterText: '' };

        console.log(`[dashboard:build] verify — Executing script via pageProxy with params: ${JSON.stringify(execParams)}`);

        // Actually execute the generated script via pageProxy so it fills forms / triggers search
        const pageProxy = buildPageProxy(browserId, pageIndex);
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        let scriptError = null;
        try {
            const scriptFn = new AsyncFunction('page', 'params', script);
            const t0 = Date.now();
            await scriptFn(pageProxy, execParams);
            console.log(`[dashboard:build] verify — Script execution completed in ${Date.now() - t0}ms`);
        } catch (err) {
            scriptError = err.message;
            console.log(`[dashboard:build] verify — Script execution THREW: ${scriptError}`);
        }

        // Wait for dynamic content to render after script execution
        console.log(`[dashboard:build] verify — Waiting 3s for post-execution render...`);
        await new Promise(r => setTimeout(r, 3000));

        // Take screenshot of the page AFTER script execution
        console.log(`[dashboard:build] verify — Taking post-execution screenshot (browserId=${browserId}, pageIndex=${pageIndex})...`);
        const ssRes = await toolCall('page_screenshot', { browserId, pageIndex });
        const verifyScreenshot = ssRes.base64 || ssRes.screenshot || null;
        const screenshotUrl = verifyScreenshot ? `data:image/png;base64,${verifyScreenshot}` : null;
        console.log(`[dashboard:build] verify — Screenshot: ${verifyScreenshot ? `${(verifyScreenshot.length / 1024).toFixed(1)}KB` : 'NULL'}`);

        // If script threw, report it but still let AI check the screenshot
        if (scriptError) {
            console.log(`[dashboard:build] verify — Returning FAILED due to script error`);
            return {
                ok: false,
                message: `Script execution error: ${scriptError}`,
                screenshotUrl
            };
        }

        // Ask AI to verify the post-execution screenshot
        const verifyPrompt = toolType === 'search'
            ? `Look at this screenshot of a job search page. Does it show job search results or a properly filled search form with results? Answer YES or NO and explain briefly.`
            : `Look at this screenshot of a job application page. Does it show a correctly filled application form? Answer YES or NO and explain briefly.`;

        console.log(`[dashboard:build] verify — Asking AI to verify screenshot...`);
        const aiVerdict = await aiInvoke(verifyPrompt, verifyScreenshot);
        const isOk = /\byes\b/i.test(aiVerdict);
        console.log(`[dashboard:build] verify — AI verdict: ${isOk ? 'YES' : 'NO'} | ${aiVerdict.slice(0, 200)}`);

        return {
            ok: isOk,
            message: isOk ? 'AI verified script output' : `AI verification failed: ${aiVerdict.slice(0, 300)}`,
            screenshotUrl
        };
    } catch (err) {
        console.error(`[dashboard:build] verify — EXCEPTION: ${err.message}`);
        return {
            ok: false,
            message: `Verification error: ${err.message}`,
            screenshotUrl: null
        };
    }
}

// ---------------------------------------------------------------------------
// executeSearchScript
// ---------------------------------------------------------------------------

/**
 * Execute a previously built search script.
 * @param {string} sessionId
 * @param {string} platformId
 * @param {object} searchParams - { keywords, location, jobType, minSalary }
 * @param {object} [options] - { envId, maxResults }
 * @returns {Promise<{success: boolean, jobs: Array, error?: string}>}
 */
async function executeSearchScript(sessionId, platformId, searchParams, options = {}) {
    const store = getPlatformStore();
    const platform = store.getPlatform(sessionId, platformId);
    if (!platform) {
        return { success: false, jobs: [], error: 'Platform not found' };
    }

    const tool = platform.tools.search;
    if (tool.status !== 'ready' || !tool.script) {
        return { success: false, jobs: [], error: `Search tool is not ready (status: ${tool.status})` };
    }

    let browserId = null;
    let reusedBrowser = false;
    try {
        let pageIndex;
        // Reuse the logged-in env browser when available, with fallback if dead
        if (platform._browserId) {
            try {
                // Navigate on the existing login tab instead of opening a new tab.
                // page_new triggers Cloudflare blocks on some sites; page_goto on an
                // already-trusted tab preserves the session cookie context.
                browserId = platform._browserId;
                pageIndex = platform._pageIndex || 0;
                reusedBrowser = true;
                await toolCall('page_goto', { browserId, pageIndex, url: platform.url, waitUntil: 'domcontentloaded' });
                console.log(`[search:exec] Navigated existing tab (pageIndex=${pageIndex}) to ${platform.url}`);
            } catch (err) {
                console.log(`[search:exec] Browser ${platform._browserId} is dead (${err.message}), falling back to fresh launch`);
                browserId = null;
                reusedBrowser = false;
                delete platform._browserId;
                delete platform._pageIndex;
            }
        }
        if (!browserId) {
            const launchRes = await toolCall('browser_launch', { envId: options.envId || platform.envId || undefined });
            browserId = launchRes.browserId;
            const gotoRes = await toolCall('page_goto', { browserId, url: platform.url });
            pageIndex = gotoRes.pageIndex !== undefined ? gotoRes.pageIndex : 0;
        }

        // Wait for dynamic content to render
        await new Promise(r => setTimeout(r, 3000));

        // Check for anti-bot before running script
        const blocked = await _detectAntiBot(browserId, pageIndex);
        if (blocked) {
            console.log(`[search:exec] Anti-bot detected before script: ${blocked}. Waiting up to 45s...`);
            let resolved = false;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const still = await _detectAntiBot(browserId, pageIndex);
                if (!still) { resolved = true; break; }
            }
            if (!resolved) {
                if (!reusedBrowser) {
                    try { await toolCall('browser_close', { browserId }); } catch (_) {}
                }
                return { success: false, jobs: [], error: `Blocked by anti-bot: ${blocked}` };
            }
            console.log('[search:exec] Anti-bot cleared, proceeding with script.');
        }

        // Build execution context — we create an AsyncFunction that receives `page` helpers and `params`
        // The script expects `page` (Puppeteer-like) and `params`. We bridge via toolServiceClient calls.
        const pageProxy = buildPageProxy(browserId, pageIndex);
        const params = {
            keywords: searchParams.keywords || '',
            location: searchParams.location || '',
            jobType: searchParams.jobType || '',
            minSalary: searchParams.minSalary || ''
        };

        // Execute the stored script in a sandboxed async function
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const scriptFn = new AsyncFunction('page', 'params', tool.script);
        const result = await scriptFn(pageProxy, params);

        // Only close browser if we launched a fresh one
        if (!reusedBrowser) {
            try { await toolCall('browser_close', { browserId }); } catch (_) { /* ignore */ }
        }

        if (result && result.success === false) {
            return { success: false, jobs: [], error: result.error || 'Script execution failed' };
        }

        let jobs = [];
        if (result && Array.isArray(result.jobs)) {
            jobs = result.jobs;
        } else if (Array.isArray(result)) {
            jobs = result;
        }

        // Apply maxResults limit
        if (options.maxResults && jobs.length > options.maxResults) {
            jobs = jobs.slice(0, options.maxResults);
        }

        return { success: true, jobs };
    } catch (err) {
        if (browserId && !reusedBrowser) {
            try { await toolCall('browser_close', { browserId }); } catch (_) { /* ignore */ }
        }
        return { success: false, jobs: [], error: err.message };
    }
}

/**
 * Build a Puppeteer-like page proxy that delegates to toolServiceClient.
 *
 * Available toolService tools:
 *   page_click      — click by CSS selector or text
 *   page_type       — type text into an input (supports clear)
 *   page_extract    — extract text / attribute from elements
 *   page_evaluate   — run arbitrary JS in the page context
 *   page_screenshot — take a screenshot
 *   page_goto       — navigate to URL
 *   page_scroll     — scroll page
 *   page_keyboard   — press a key
 *   page_wait_for_selector    — wait for a CSS selector
 *   page_wait_for_navigation  — wait for navigation event
 */
function buildPageProxy(browserId, pageIndex) {
    const proxy = {
        // -- Navigation --
        async goto(url, opts) {
            return toolCall('page_goto', { browserId, url, pageIndex });
        },

        // -- Waiting --
        async waitForSelector(selector, opts = {}) {
            const timeout = (opts && opts.timeout) || 8000;
            const visible = opts && opts.visible;
            try {
                await toolCall('page_wait_for_selector', { browserId, pageIndex, selector, timeout, visible: !!visible });
                return true;
            } catch (err) {
                throw new Error(`waitForSelector timed out: ${selector}`);
            }
        },
        async waitForNavigation(opts = {}) {
            const timeout = (opts && opts.timeout) || 10000;
            const waitUntil = (opts && opts.waitUntil) || 'domcontentloaded';
            try {
                await toolCall('page_wait_for_navigation', { browserId, pageIndex, waitUntil, timeout });
            } catch (_) {
                // Fallback: simple wait if navigation detection fails
                await new Promise(r => setTimeout(r, 2000));
            }
        },
        async waitForTimeout(ms) {
            await new Promise(r => setTimeout(r, ms || 1000));
        },

        // -- Interaction --
        async click(selector) {
            return toolCall('page_click', { browserId, selector, pageIndex });
        },
        async type(selector, text, opts) {
            const delay = opts && opts.delay;
            return toolCall('page_type', { browserId, selector, text, delay, pageIndex });
        },
        async focus(selector) {
            return toolCall('page_evaluate', {
                browserId, pageIndex,
                expression: `document.querySelector('${selector.replace(/'/g, "\\'")}')?.focus()`
            });
        },

        // -- Keyboard --
        keyboard: {
            async press(key) {
                return toolCall('page_keyboard', { browserId, key, pageIndex });
            },
            async type(text) {
                // Type text one character at a time via page_type on active element
                return toolCall('page_evaluate', {
                    browserId, pageIndex,
                    expression: `void 0` // placeholder — actual typing uses page_type
                });
            }
        },

        // -- Query --
        async $(selector) {
            try {
                const res = await toolCall('page_evaluate', {
                    browserId, pageIndex,
                    expression: `!!document.querySelector('${selector.replace(/'/g, "\\'")}')`
                });
                return res.result ? selector : null; // Return selector as truthy handle-like value
            } catch (_) {
                return null;
            }
        },
        async $$(selector) {
            try {
                const res = await toolCall('page_evaluate', {
                    browserId, pageIndex,
                    expression: `document.querySelectorAll('${selector.replace(/'/g, "\\'")}').length`
                });
                const count = res.result || 0;
                // Return array of placeholder objects with length matching actual elements
                return Array.from({ length: count }, (_, i) => ({ _index: i, _selector: selector }));
            } catch (_) {
                return [];
            }
        },
        async $eval(selector, fnStr, ...args) {
            // Execute a function on the first element matching the selector
            // fnStr can be a string expression or a function — we convert to string
            const fn = typeof fnStr === 'function' ? fnStr.toString() : fnStr;
            const argsJson = JSON.stringify(args);
            const expression = `
                (function() {
                    const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                    if (!el) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
                    const fn = ${fn};
                    const args = ${argsJson};
                    return fn(el, ...args);
                })()
            `;
            const res = await toolCall('page_evaluate', { browserId, pageIndex, expression });
            return res.result;
        },
        async $$eval(selector, fnStr, ...args) {
            const fn = typeof fnStr === 'function' ? fnStr.toString() : fnStr;
            const argsJson = JSON.stringify(args);
            const expression = `
                (function() {
                    const els = Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}'));
                    const fn = ${fn};
                    const args = ${argsJson};
                    return fn(els, ...args);
                })()
            `;
            const res = await toolCall('page_evaluate', { browserId, pageIndex, expression });
            return res.result;
        },

        // -- Evaluate arbitrary JS --
        async evaluate(fnOrString, ...args) {
            let expression;
            if (typeof fnOrString === 'function') {
                const argsJson = args.map(a => JSON.stringify(a)).join(', ');
                expression = `(${fnOrString.toString()})(${argsJson})`;
            } else {
                expression = String(fnOrString);
            }
            const res = await toolCall('page_evaluate', { browserId, pageIndex, expression });
            return res.result;
        },

        // -- Extract text (convenience, maps to page_extract) --
        async extractText(selector, opts = {}) {
            const res = await toolCall('page_extract', {
                browserId, pageIndex, selector,
                attribute: opts.attribute || undefined,
                all: opts.all || false
            });
            if (opts.all) return res.results || [];
            return res.result || '';
        },

        // -- Screenshot --
        async screenshot(opts) {
            const res = await toolCall('page_screenshot', { browserId, pageIndex });
            return res.base64 || res.screenshot || null;
        },

        // -- Page info --
        async content() {
            const res = await toolCall('page_evaluate', {
                browserId, pageIndex,
                expression: 'document.documentElement.outerHTML.slice(0, 50000)'
            });
            return res.result || '';
        },
        async url() {
            const res = await toolCall('page_evaluate', {
                browserId, pageIndex,
                expression: 'window.location.href'
            });
            return res.result || '';
        },
        async title() {
            const res = await toolCall('page_evaluate', {
                browserId, pageIndex,
                expression: 'document.title'
            });
            return res.result || '';
        },

        // -- Scroll --
        async scroll(direction) {
            return toolCall('page_scroll', { browserId, direction: direction || 'down' });
        },

        // ── Human-like helpers (anti-detection) ──

        /**
         * Random delay between min and max ms.
         */
        async randomDelay(min = 500, max = 2000) {
            const ms = Math.floor(Math.random() * (max - min)) + min;
            await new Promise(r => setTimeout(r, ms));
        },

        /**
         * Mouse movement simulation via synthetic MouseEvent dispatch.
         */
        mouse: {
            async move(x, y, opts = {}) {
                const steps = opts.steps || 8;
                const startX = Math.floor(Math.random() * 300);
                const startY = Math.floor(Math.random() * 300);
                const jitterX = Math.floor(Math.random() * 30 - 15);
                const jitterY = Math.floor(Math.random() * 20 - 10);
                await toolCall('page_evaluate', {
                    browserId, pageIndex,
                    expression: `(function(){
                        var sX=${startX},sY=${startY},eX=${x},eY=${y},st=${steps},jX=${jitterX},jY=${jitterY};
                        for(var i=0;i<=st;i++){
                            var t=i/st;
                            var cx=sX+(eX-sX)*t+Math.sin(t*Math.PI)*jX;
                            var cy=sY+(eY-sY)*t+Math.cos(t*Math.PI)*jY;
                            document.dispatchEvent(new MouseEvent('mousemove',{clientX:cx,clientY:cy,bubbles:true}));
                        }
                    })()`
                });
                await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
            }
        },

        /**
         * Human-like click: move mouse to element center (with jitter) then click.
         */
        async humanClick(selector) {
            try {
                const res = await toolCall('page_evaluate', {
                    browserId, pageIndex,
                    expression: `(function(){
                        var el=document.querySelector('${selector.replace(/'/g, "\\'")}');
                        if(!el)return null;
                        var r=el.getBoundingClientRect();
                        return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};
                    })()`
                });
                const pos = res.result;
                if (pos) {
                    const offX = (Math.random() - 0.5) * pos.w * 0.3;
                    const offY = (Math.random() - 0.5) * pos.h * 0.3;
                    await proxy.mouse.move(pos.x + offX, pos.y + offY);
                    await new Promise(r => setTimeout(r, 80 + Math.random() * 150));
                }
            } catch (_) { /* best-effort mouse movement */ }
            return toolCall('page_click', { browserId, selector, pageIndex });
        },

        /**
         * Human-like typing: click into field, clear via triple-click+Backspace, type with random delay.
         */
        async humanType(selector, text, opts = {}) {
            await proxy.humanClick(selector);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
            // Clear field using page_type clear:true
            await toolCall('page_type', { browserId, selector, text: '', clear: true, pageIndex });
            await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
            if (text) {
                const delay = Math.floor(80 + Math.random() * 140); // 80-220ms avg
                await toolCall('page_type', { browserId, selector, text, delay, pageIndex });
            }
        },

        /**
         * Detect Cloudflare / CAPTCHA / anti-bot pages.
         * Polls until resolved or maxWait exceeded.
         * @returns {{blocked: boolean}}
         * @throws if still blocked after maxWait
         */
        async checkAntiBot(opts = {}) {
            const maxWait = opts.maxWait || 45000;
            const pollInterval = opts.pollInterval || 3000;
            const startTime = Date.now();
            while (true) {
                const blocked = await _detectAntiBot(browserId, pageIndex);
                if (!blocked) return { blocked: false };
                if (Date.now() - startTime > maxWait) {
                    throw new Error(`Anti-bot: ${blocked}. Timed out after ${Math.round(maxWait / 1000)}s.`);
                }
                console.log(`[pageProxy] Anti-bot detected: ${blocked}. Waiting for resolution...`);
                await new Promise(r => setTimeout(r, pollInterval));
            }
        }
    };

    return proxy;
}

// ---------------------------------------------------------------------------
// healScript
// ---------------------------------------------------------------------------

/**
 * Self-heal a broken script by sending error + screenshot to AI for fix.
 * @param {string} sessionId
 * @param {string} platformId
 * @param {'search'|'apply'} toolType
 * @param {object} errorContext - { error, screenshot, currentScript }
 * @param {object} options - { aiInvoke }
 * @returns {Promise<{success: boolean, fixedScript?: string, error?: string}>}
 */
async function healScript(sessionId, platformId, toolType, errorContext, options = {}) {
    const { aiInvoke } = options;
    if (typeof aiInvoke !== 'function') {
        return { success: false, error: 'options.aiInvoke is required' };
    }

    const store = getPlatformStore();
    const platform = store.getPlatform(sessionId, platformId);
    if (!platform) {
        return { success: false, error: 'Platform not found' };
    }

    const currentScript = errorContext.currentScript || (platform.tools[toolType] && platform.tools[toolType].script);
    if (!currentScript) {
        return { success: false, error: 'No existing script to heal' };
    }

    const prompt = `You are an expert Puppeteer script fixer.

The following script for ${platform.name} (${platform.url}) failed with this error:
${errorContext.error}

Current script:
\`\`\`javascript
${currentScript}
\`\`\`

The screenshot shows the current state of the page when the error occurred.

Please fix the script. Return ONLY a corrected JavaScript code block.
Keep the same function signature (receives \`page\` and \`params\`).
`;

    try {
        const aiResponse = await aiInvoke(prompt, errorContext.screenshot || null);
        const fixedScript = extractCodeBlock(aiResponse);

        if (!fixedScript) {
            return { success: false, error: 'AI returned empty or unparseable fix' };
        }

        // Update in platform store — increments version automatically when status is 'ready'
        store.updateToolStatus(sessionId, platformId, toolType, 'ready', {
            script: fixedScript
        });

        return { success: true, fixedScript };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    buildTool,
    executeSearchScript,
    healScript,
    // Exported for testing
    _extractCodeBlock: extractCodeBlock,
    _buildDomSummary: buildDomSummary,
    _buildPageProxy: buildPageProxy
};
