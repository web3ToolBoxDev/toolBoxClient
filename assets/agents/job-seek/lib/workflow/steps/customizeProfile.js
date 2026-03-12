'use strict';

/**
 * Step: Customize Profile — validates profile and direction are ready.
 *
 * This step checks that the user has provided sufficient profile data
 * (resume sections, direction) before proceeding to search.
 */

/**
 * Execute the customizeProfile step.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.context - { direction, profile }
 * @returns {object} Result with validation status
 */
async function execute({ sessionId, context }) {
    const { direction, profile } = context;
    const issues = [];

    // Check direction
    if (!direction) {
        issues.push('No job direction set');
    } else {
        if (!direction.q_job_title && !direction.jobTitle) {
            issues.push('Job title is required');
        }
    }

    // Check profile
    if (!profile) {
        issues.push('No profile data');
    } else {
        if (!profile.basic && !profile.skills) {
            issues.push('Profile needs at least basic info or skills');
        }
    }

    if (issues.length > 0) {
        return {
            ready: false,
            issues,
            summary: `Profile incomplete: ${issues.join(', ')}`
        };
    }

    return {
        ready: true,
        summary: `Profile ready: ${direction.q_job_title || direction.jobTitle} in ${direction.q_location || direction.location || 'any location'}`,
        direction,
        profileSections: Object.keys(profile).filter(k => profile[k])
    };
}

module.exports = { execute };
