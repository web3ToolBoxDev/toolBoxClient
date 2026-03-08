'use strict';

/**
 * Job-seek domain pack — memory types specific to the job-seek agent.
 * Registered with dbservice at agent startup via /knowledge/register-pack.
 */

const DOMAIN = 'job-seek';

const TYPES = {
    // ─── Existing types ───
    profile:            { durability: 'durable',  conflictPolicy: 'replace', description: 'User career profile section', subTypes: ['basic', 'skills', 'experience', 'education', 'highlights'] },
    direction:          { durability: 'durable',  conflictPolicy: 'replace', description: 'Job search direction', subTypes: ['target', 'history'] },
    job_listing:        { durability: 'durable',  conflictPolicy: 'replace', description: 'Scraped job posting', subTypes: [] },
    match_result:       { durability: 'session',  conflictPolicy: 'replace', description: 'Job match score', subTypes: [] },

    // ─── New types (Phase 4.4d) ───
    job_requirement:    { durability: 'durable',  conflictPolicy: 'replace', description: 'Structured requirements extracted from JD', subTypes: ['technical', 'experience', 'education', 'soft_skills'] },
    application_record: { durability: 'durable',  conflictPolicy: 'replace', description: 'Application status tracking', subTypes: ['submitted', 'in_review', 'interview', 'offer', 'rejected'] },
    resume_variant:     { durability: 'durable',  conflictPolicy: 'replace', description: 'Tailored resume for specific job target', subTypes: [] },
    outreach_message:   { durability: 'session',  conflictPolicy: 'replace', description: 'Cover letter, thank-you email, follow-up', subTypes: ['cover_letter', 'thank_you', 'follow_up'] },
    company_info:       { durability: 'durable',  conflictPolicy: 'replace', description: 'Company research brief', subTypes: [] }
};

module.exports = { domain: DOMAIN, types: TYPES };
