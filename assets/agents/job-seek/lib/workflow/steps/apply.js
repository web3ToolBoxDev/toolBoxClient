'use strict';

/**
 * Step: Apply — tracks application submissions.
 *
 * This step is primarily user-driven (they submit applications manually).
 * The engine just marks the step as ready for user action.
 */

const dashboardServer = require('../../dashboardServer');

/**
 * Execute the apply step.
 * @param {object} params
 * @param {string} params.sessionId
 * @returns {object} Application status summary
 */
async function execute({ sessionId }) {
    const cards = dashboardServer.getJobCards(sessionId);
    const tailored = cards.filter(c => c.status === 'tailored');
    const submitted = cards.filter(c => c.status === 'submitted');

    return {
        readyToApply: tailored.length,
        alreadyApplied: submitted.length,
        summary: `${tailored.length} jobs ready to apply, ${submitted.length} already submitted`
    };
}

module.exports = { execute };
