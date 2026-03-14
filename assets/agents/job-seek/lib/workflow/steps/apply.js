'use strict';

/**
 * Step: Apply — auto-fill application forms with resume DOCX upload.
 *
 * For each tailored job:
 *   1. Write DOCX buffer to temp file
 *   2. Call autoApply tool (fills form + uploads resume)
 *   3. Track results per job
 *   4. Clean up temp files
 *
 * Does NOT auto-submit — user must review and click submit.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dashboardServer = require('../../dashboardServer');

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
 * Execute the apply step.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.config - Workflow config
 * @param {object} params.context - { direction, profile, envId }
 * @returns {object} Application status summary
 */
async function execute({ sessionId, config, context }) {
    const cards = dashboardServer.getJobCards(sessionId);
    const tailored = cards.filter(c => c.status === 'tailored');
    const submitted = cards.filter(c => c.status === 'submitted');

    // Get apply step config
    const applyStep = (config?.steps || []).find(s => s.name === 'apply');
    const confirmBeforeApply = applyStep?.confirmBeforeApply !== false;

    // Filter to specific jobIds if configured
    let jobsToApply = tailored;
    if (applyStep?.jobIds?.length > 0) {
        const jobIdSet = new Set(applyStep.jobIds);
        jobsToApply = tailored.filter(j => jobIdSet.has(j.url));
    }

    const results = [];
    const tempFiles = [];

    for (const job of jobsToApply) {
        // Write DOCX temp files for this job
        const resumePath = writeTempDocx(
            job.artifacts?.resumeDocx,
            `Resume_${(job.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_')}.docx`
        );
        const coverLetterPath = writeTempDocx(
            job.artifacts?.coverLetterDocx,
            `CoverLetter_${(job.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_')}.docx`
        );
        if (resumePath) tempFiles.push(resumePath);
        if (coverLetterPath) tempFiles.push(coverLetterPath);

        results.push({
            url: job.url,
            title: job.title,
            company: job.company,
            resumeDocxPath: resumePath,
            coverLetterDocxPath: coverLetterPath,
            status: 'ready'
        });
    }

    // Clean up temp files after step completes
    // NOTE: In real auto-apply flow, cleanup happens after browser interaction.
    // Here we defer cleanup to caller or autoApply handler completion.

    return {
        readyToApply: jobsToApply.length,
        alreadyApplied: submitted.length,
        jobs: results,
        tempFiles,
        confirmBeforeApply,
        summary: `${jobsToApply.length} jobs ready to apply (${results.filter(r => r.resumeDocxPath).length} with DOCX resume), ${submitted.length} already submitted`
    };
}

module.exports = { execute, writeTempDocx, cleanupTempFiles };
