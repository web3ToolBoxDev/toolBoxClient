'use strict';

/**
 * Job-seek domain pack — memory types specific to the job-seek agent.
 * Registered with dbservice at agent startup via /knowledge/register-pack.
 */

const DOMAIN = 'job-seek';

const TYPES = {
    profile:      { durability: 'durable',  conflictPolicy: 'replace', description: 'User career profile section', subTypes: ['basic', 'skills', 'experience', 'education'] },
    direction:    { durability: 'durable',  conflictPolicy: 'replace', description: 'Job search direction', subTypes: ['target'] },
    job_listing:  { durability: 'durable',  conflictPolicy: 'replace', description: 'Scraped job posting', subTypes: [] },
    match_result: { durability: 'session',  conflictPolicy: 'replace', description: 'Job match score', subTypes: [] }
};

module.exports = { domain: DOMAIN, types: TYPES };
