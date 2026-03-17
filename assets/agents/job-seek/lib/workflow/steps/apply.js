'use strict';

/**
 * Step: Apply — sequential auto-apply with rate limiting.
 *
 * For each tailored job:
 *   1. Write DOCX buffer to temp file
 *   2. Call autoApply handler (fill form + upload resume + submit)
 *   3. Update job card status (submitted/failed)
 *   4. Broadcast progress via SSE
 *   5. Dispatch alert (screenshot + result)
 *   6. Clean up temp files
 *   7. Random delay between jobs (anti-bot)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dashboardServer = require('../../dashboardServer');
const alertService = require('../alertService');
const { handler: autoApplyHandler } = require('../../tools/autoApply');

// ─── Defaults ───
const DEFAULT_MAX_PER_RUN = 10;
const DEFAULT_DELAY_RANGE = [10, 30]; // seconds between jobs
const DEFAULT_AUTO_SUBMIT = true;

/**
 * Write a base64-encoded DOCX buffer to a temp file.
 * @param {string} base64 - Base64-encoded DOCX content
 * @param {string} filename - Desired filename
 * @returns {string|null} Absolute path to temp file, or null if no data
 */
function writeTempDocx(base64, filename) {
    if (!base64) return null;
    try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-'));
        const filePath = path.join(tmpDir, filename);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        return filePath;
    } catch (err) {
        console.error('[apply] Failed to write temp DOCX:', err.message);
        return null;
    }
}

/**
 * Clean up temp files created during apply.
 * @param {string[]} paths - File paths to clean up
 */
function cleanupTempFiles(paths) {
    for (const filePath of paths) {
        if (!filePath) continue;
        try {
            const dir = path.dirname(filePath);
            fs.rmSync(dir, { recursive: true, force: true });
        } catch (_) { /* best-effort cleanup */ }
    }
}

/**
 * Random delay between min and max seconds.
 * @param {number[]} range - [minSec, maxSec]
 * @returns {Promise<void>}
 */
function randomDelay(range) {
    const [min, max] = range;
    const ms = (Math.random() * (max - min) + min) * 1000;
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Execute the apply step — sequential auto-apply for each tailored job.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.config - Workflow config
 * @param {object} params.context - { direction, profile, envId }
 * @returns {object} Application status summary
 */
async function execute({ sessionId, config, context }) {
    const cards = dashboardServer.getJobCards(sessionId);
    const tailored = cards.filter(c => c.status === 'tailored');
    const alreadySubmitted = cards.filter(c => c.status === 'submitted');

    // Get apply step config
    const applyStep = (config?.steps || []).find(s => s.name === 'apply');
    const autoSubmit = applyStep?.autoSubmit ?? config?.apply?.autoSubmit ?? DEFAULT_AUTO_SUBMIT;
    const maxPerRun = applyStep?.maxApplyPerRun ?? config?.apply?.maxApplyPerRun ?? DEFAULT_MAX_PER_RUN;
    const delayRange = applyStep?.delayBetweenJobs ?? config?.apply?.delayBetweenJobs ?? DEFAULT_DELAY_RANGE;
    const skipOnCaptchaFail = applyStep?.skipOnCaptchaFail ?? config?.apply?.skipOnCaptchaFail ?? true;

    // Filter to specific jobIds if configured
    let jobsToApply = tailored;
    if (applyStep?.jobIds?.length > 0) {
        const jobIdSet = new Set(applyStep.jobIds);
        jobsToApply = tailored.filter(j => jobIdSet.has(j.url));
    }

    // Limit per run
    jobsToApply = jobsToApply.slice(0, maxPerRun);

    const results = [];
    let submittedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Broadcast start
    _broadcastSSE(sessionId, 'applyStart', {
        total: jobsToApply.length,
        alreadyApplied: alreadySubmitted.length
    });

    for (let i = 0; i < jobsToApply.length; i++) {
        const job = jobsToApply[i];
        const jobTempFiles = [];

        // Broadcast progress
        _broadcastSSE(sessionId, 'applyProgress', {
            jobUrl: job.url,
            title: job.title,
            company: job.company,
            index: i,
            total: jobsToApply.length,
            status: 'applying'
        });

        try {
            // Write DOCX temp files
            const resumePath = writeTempDocx(
                job.artifacts?.resumeDocx,
                `Resume_${_sanitize(job.company)}.docx`
            );
            const coverLetterPath = writeTempDocx(
                job.artifacts?.coverLetterDocx,
                `CoverLetter_${_sanitize(job.company)}.docx`
            );
            if (resumePath) jobTempFiles.push(resumePath);
            if (coverLetterPath) jobTempFiles.push(coverLetterPath);

            // Call autoApply handler
            const applyResult = await autoApplyHandler({
                url: job.url,
                profile: context.profile || {},
                resumeDocxPath: resumePath,
                coverLetterDocxPath: coverLetterPath,
                autoSubmit,
                headless: false
            });

            if (applyResult.submitted) {
                // Success — mark as submitted
                dashboardServer.upsertJobCard(sessionId, {
                    url: job.url,
                    status: 'submitted',
                    artifacts: {
                        ...(job.artifacts || {}),
                        appliedAt: new Date().toISOString(),
                        applyScreenshot: applyResult.screenshotBase64 || null,
                        applySteps: applyResult.steps,
                        applyPlatform: applyResult.platform
                    },
                    taskLog: {
                        apply: {
                            status: 'ok',
                            at: new Date().toISOString(),
                            platform: applyResult.platform || null,
                            attempts: (job.taskLog?.apply?.attempts || 0) + 1,
                            screenshot: !!applyResult.screenshotBase64
                        }
                    }
                });
                submittedCount++;

                _broadcastSSE(sessionId, 'applyProgress', {
                    jobUrl: job.url, status: 'submitted',
                    index: i, total: jobsToApply.length,
                    screenshotAvailable: !!applyResult.screenshotBase64
                });

                // Alert: success
                alertService.dispatch(sessionId, {
                    type: 'completed',
                    title: `Applied: ${job.company} — ${job.title}`,
                    message: applyResult.message,
                    stepName: 'apply',
                    meta: {
                        company: job.company,
                        title: job.title,
                        url: job.url,
                        screenshotBase64: applyResult.screenshotBase64,
                        platform: applyResult.platform
                    }
                });

                alertService.resetFailureCounter(sessionId, 'apply');

            } else {
                // Could not submit — mark as apply_failed
                dashboardServer.upsertJobCard(sessionId, {
                    url: job.url,
                    artifacts: {
                        ...(job.artifacts || {}),
                        applyError: applyResult.message,
                        applyScreenshot: applyResult.screenshotBase64 || null,
                        applySteps: applyResult.steps,
                        applyAttemptedAt: new Date().toISOString()
                    },
                    taskLog: {
                        apply: {
                            status: 'error',
                            at: new Date().toISOString(),
                            error: applyResult.message,
                            platform: applyResult?.platform || null,
                            attempts: (job.taskLog?.apply?.attempts || 0) + 1
                        }
                    }
                });
                failedCount++;

                _broadcastSSE(sessionId, 'applyProgress', {
                    jobUrl: job.url, status: 'failed',
                    message: applyResult.message,
                    index: i, total: jobsToApply.length
                });

                // Alert: failure
                alertService.dispatch(sessionId, {
                    type: 'failure',
                    title: `Apply failed: ${job.company} — ${job.title}`,
                    message: applyResult.message,
                    stepName: 'apply',
                    meta: {
                        company: job.company,
                        title: job.title,
                        url: job.url,
                        screenshotBase64: applyResult.screenshotBase64,
                        platform: applyResult.platform
                    }
                });

                alertService.trackFailure(sessionId, 'apply', applyResult.message);
            }

            results.push({
                url: job.url,
                title: job.title,
                company: job.company,
                status: applyResult.submitted ? 'submitted' : 'failed',
                message: applyResult.message,
                platform: applyResult.platform,
                screenshotAvailable: !!applyResult.screenshotBase64
            });

        } catch (err) {
            console.error(`[apply] Error applying to ${job.url}:`, err.message);
            failedCount++;

            dashboardServer.upsertJobCard(sessionId, {
                url: job.url,
                artifacts: {
                    ...(job.artifacts || {}),
                    applyError: err.message,
                    applyAttemptedAt: new Date().toISOString()
                },
                taskLog: {
                    apply: {
                        status: 'error',
                        at: new Date().toISOString(),
                        error: err.message,
                        attempts: (job.taskLog?.apply?.attempts || 0) + 1
                    }
                }
            });

            _broadcastSSE(sessionId, 'applyProgress', {
                jobUrl: job.url, status: 'error',
                message: err.message,
                index: i, total: jobsToApply.length
            });

            results.push({
                url: job.url,
                title: job.title,
                company: job.company,
                status: 'error',
                message: err.message
            });

            alertService.trackFailure(sessionId, 'apply', err.message);
        } finally {
            // Cleanup temp files for this job
            cleanupTempFiles(jobTempFiles);
        }

        // Random delay between jobs (anti-bot), skip after last job
        if (i < jobsToApply.length - 1) {
            await randomDelay(delayRange);
        }
    }

    // Broadcast completion
    _broadcastSSE(sessionId, 'applyComplete', {
        total: jobsToApply.length,
        submitted: submittedCount,
        failed: failedCount,
        skipped: skippedCount,
        alreadyApplied: alreadySubmitted.length
    });

    const summary = [
        `${submittedCount} submitted`,
        `${failedCount} failed`,
        `${alreadySubmitted.length} already applied`
    ].join(', ');

    return {
        total: jobsToApply.length,
        submitted: submittedCount,
        failed: failedCount,
        skipped: skippedCount,
        alreadyApplied: alreadySubmitted.length,
        jobs: results,
        summary
    };
}

// ─── Helpers ───

function _sanitize(str) {
    return (str || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
}

function _broadcastSSE(sessionId, event, data) {
    try {
        const broadcaster = dashboardServer._getSSEBroadcaster?.();
        if (broadcaster) {
            broadcaster(sessionId, event, data);
        }
    } catch (_) { /* best-effort SSE */ }
}

module.exports = { execute, writeTempDocx, cleanupTempFiles, randomDelay };
