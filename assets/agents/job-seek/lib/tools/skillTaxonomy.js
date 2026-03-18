'use strict';

/**
 * skillTaxonomy — AI-powered + fallback skill taxonomy for smart matching.
 *
 * Provides:
 * - BASE_TAXONOMY / BASE_ALIASES — hardcoded fallback (~15 categories)
 * - buildTaxonomyPrompt() — construct AI prompt from profile + direction
 * - parseTaxonomyResponse() — extract JSON from AI response text
 * - mergeTaxonomy() — merge BASE + AI-generated taxonomy
 * - resolveAlias() / findCategory() / isSameCategory() — matching helpers
 */

// ─── Fallback taxonomy (used when AI is unavailable) ───

const BASE_TAXONOMY = {
    // Languages
    'lang-js': ['javascript', 'typescript', 'js', 'ts', 'es6'],
    'lang-python': ['python', 'py', 'python3'],
    'lang-java': ['java', 'kotlin'],
    'lang-go': ['go', 'golang'],
    'lang-rust': ['rust'],
    'lang-cpp': ['c', 'cpp', 'c++'],
    'lang-csharp': ['csharp', 'c#', 'dotnet', '.net'],
    'lang-ruby': ['ruby', 'rails'],
    'lang-php': ['php', 'laravel'],

    // Frontend frameworks
    'frontend-framework': ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'gatsby', 'remix'],
    'frontend-style': ['css', 'tailwind', 'sass', 'scss', 'less', 'styled-components', 'bootstrap', 'material-ui', 'mui', 'chakra'],
    'frontend-build': ['webpack', 'vite', 'rollup', 'esbuild', 'parcel', 'turbopack'],
    'frontend-state': ['redux', 'zustand', 'mobx', 'recoil', 'jotai', 'pinia', 'vuex'],

    // Backend frameworks
    'backend-node': ['express', 'koa', 'fastify', 'nestjs', 'hapi'],
    'backend-python': ['flask', 'django', 'fastapi', 'tornado', 'aiohttp'],
    'backend-java': ['spring', 'springboot', 'spring boot'],
    'backend-go': ['gin', 'echo', 'fiber'],

    // Databases
    'db-sql': ['mysql', 'postgresql', 'postgres', 'sqlite', 'mssql', 'sql', 'oracle', 'mariadb'],
    'db-nosql': ['mongodb', 'dynamodb', 'couchdb', 'firestore', 'cassandra', 'couchbase'],
    'db-cache': ['redis', 'memcached', 'elasticache'],
    'db-search': ['elasticsearch', 'opensearch', 'solr', 'algolia'],

    // DevOps / Cloud
    'cloud-provider': ['aws', 'gcp', 'azure', 'digitalocean', 'heroku', 'vercel', 'netlify', 'cloudflare'],
    'container': ['docker', 'kubernetes', 'k8s', 'podman', 'ecs', 'eks'],
    'cicd': ['jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis', 'ci/cd', 'ci', 'cd'],
    'iac': ['terraform', 'cloudformation', 'pulumi', 'ansible', 'chef', 'puppet'],

    // AI / ML
    'ai-tools': ['claude', 'claude code', 'cursor', 'copilot', 'chatgpt', 'openai'],
    'ai-ml': ['machine learning', 'ml', 'deep learning', 'tensorflow', 'pytorch', 'xgboost', 'ai', 'nlp', 'llm'],

    // Architecture / API
    'api-style': ['rest', 'rest apis', 'graphql', 'grpc', 'websocket', 'soap'],
    'architecture': ['microservices', 'monorepo', 'monolith', 'serverless', 'distributed systems', 'event-driven'],
    'messaging': ['kafka', 'rabbitmq', 'sqs', 'sns', 'nats', 'pubsub'],

    // Testing
    'testing': ['jest', 'mocha', 'pytest', 'junit', 'cypress', 'playwright', 'selenium', 'vitest'],

    // Monitoring
    'monitoring': ['datadog', 'prometheus', 'grafana', 'newrelic', 'cloudwatch', 'observability', 'sentry'],

    // Scraping / Automation
    'scraping': ['web scraping', 'puppeteer', 'playwright', 'selenium', 'cheerio', 'proxy management', 'beautifulsoup', 'scrapy'],

    // Version control
    'vcs': ['git', 'github', 'gitlab', 'bitbucket'],
};

const BASE_ALIASES = {
    'node.js': 'nodejs', 'node': 'nodejs', 'react.js': 'react', 'vue.js': 'vue',
    'express.js': 'express', 'next.js': 'nextjs', 'nuxt.js': 'nuxt',
    'tailwind css': 'tailwind', 'styled components': 'styled-components',
    'material ui': 'material-ui',
    'c++': 'cpp', 'c#': 'csharp', '.net': 'dotnet',
    'ci/cd': 'cicd', 'k8s': 'kubernetes',
    'mongo': 'mongodb', 'postgres': 'postgresql', 'pg': 'postgresql',
    'spring boot': 'springboot',
    'amazon web services': 'aws', 'google cloud': 'gcp', 'google cloud platform': 'gcp',
    'rest api': 'rest apis', 'restful': 'rest apis', 'restful api': 'rest apis',
    'web socket': 'websocket', 'web sockets': 'websocket',
    'machine-learning': 'machine learning', 'deep-learning': 'deep learning',
    'github action': 'github actions',
};

// ─── Matching helpers ───

/**
 * Resolve a skill name through aliases.
 * @param {string} skill — raw skill name (lowercase)
 * @param {object} [aliases] — custom aliases (from AI), falls back to BASE_ALIASES
 * @returns {string} normalized skill name
 */
function resolveAlias(skill, aliases) {
    if (!skill) return '';
    const s = skill.trim().toLowerCase();
    // Try custom aliases first, then base
    if (aliases && aliases[s]) return aliases[s];
    if (BASE_ALIASES[s]) return BASE_ALIASES[s];
    // Additional normalization: strip ".js", ".io", whitespace
    return s.replace(/\.js$/i, '').replace(/\.io$/i, '').replace(/\s+/g, '').replace(/[^a-z0-9+#]/gi, '');
}

/**
 * Find the category a skill belongs to.
 * @param {string} skill — normalized skill name
 * @param {object} [taxonomy] — custom taxonomy, falls back to BASE_TAXONOMY
 * @returns {string|null} category name or null
 */
function findCategory(skill, taxonomy) {
    const tax = taxonomy || BASE_TAXONOMY;
    for (const [cat, skills] of Object.entries(tax)) {
        if (skills.some(s => s === skill || resolveAlias(s) === skill)) {
            return cat;
        }
    }
    return null;
}

/**
 * Check if two skills belong to the same category.
 * @param {string} skillA — normalized
 * @param {string} skillB — normalized
 * @param {object} [taxonomy]
 * @returns {{ same: boolean, category: string|null }}
 */
function isSameCategory(skillA, skillB, taxonomy) {
    const tax = taxonomy || BASE_TAXONOMY;
    for (const [cat, skills] of Object.entries(tax)) {
        const normalized = skills.map(s => resolveAlias(s));
        const hasA = normalized.includes(skillA) || skills.includes(skillA);
        const hasB = normalized.includes(skillB) || skills.includes(skillB);
        if (hasA && hasB) {
            return { same: true, category: cat };
        }
    }
    return { same: false, category: null };
}

// ─── AI prompt builder ───

/**
 * Build the prompt for AI to generate a personalized skill taxonomy.
 * @param {object} profile — { skills, experience, education, highlights }
 * @param {object} direction — { q_job_title, q_location }
 * @returns {string} prompt text
 */
function buildTaxonomyPrompt(profile, direction) {
    const skills = Array.isArray(profile.skills)
        ? profile.skills.join(', ')
        : String(profile.skills || '');
    const experience = String(profile.experience || '').slice(0, 300);
    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';

    return `You are a technical recruiter AI. Given a job seeker's profile and target role, generate a skill taxonomy for job matching.

Profile skills: ${skills}
Experience summary: ${experience}
Target role: ${jobTitle}
Target location: ${location}

Return ONLY valid JSON (no markdown fences, no explanation, no extra text):
{
  "taxonomy": {
    "category-name": ["skill1", "skill2", ...],
    ...
  },
  "aliases": {
    "variant": "standard",
    ...
  }
}

Requirements:
- Each category groups skills that are functionally similar or substitutable in the job market
- Cover relevant categories: languages, frontend frameworks, backend frameworks, databases, cloud/devops, AI/ML, architecture, testing, monitoring, etc.
- Include skills from the user's profile AND common alternatives that appear in ${jobTitle} job listings
- All skill names should be lowercase
- Aliases should normalize common variations (e.g. "Node.js" → "nodejs", "React.js" → "react", "C#" → "csharp", "CI/CD" → "cicd")
- Skills within a category will get partial match credit when one is required but the user has another from the same category
- Aim for 15-25 categories with 3-10 skills each`;
}

/**
 * Parse the AI response text to extract taxonomy JSON.
 * Handles markdown fences, extra text before/after JSON, etc.
 * @param {string} text — AI response text
 * @returns {{ taxonomy: object, aliases: object }|null}
 */
function parseTaxonomyResponse(text) {
    if (!text) return null;

    // Strip markdown code fences if present
    let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

    // Try to find JSON object boundaries
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (parsed.taxonomy && typeof parsed.taxonomy === 'object') {
            return {
                taxonomy: parsed.taxonomy,
                aliases: parsed.aliases || {}
            };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Merge BASE taxonomy with AI-generated taxonomy.
 * AI categories take precedence; BASE categories fill gaps.
 * @param {object} base — { taxonomy, aliases }
 * @param {object} aiGenerated — { taxonomy, aliases }
 * @returns {{ taxonomy: object, aliases: object }}
 */
function mergeTaxonomy(base, aiGenerated) {
    if (!aiGenerated) return { taxonomy: base.taxonomy || BASE_TAXONOMY, aliases: base.aliases || BASE_ALIASES };

    const merged = {
        taxonomy: { ...BASE_TAXONOMY },
        aliases: { ...BASE_ALIASES }
    };

    // AI taxonomy overwrites/extends base categories
    if (aiGenerated.taxonomy) {
        for (const [cat, skills] of Object.entries(aiGenerated.taxonomy)) {
            if (Array.isArray(skills)) {
                // Merge with existing category if present, otherwise create new
                const existing = merged.taxonomy[cat] || [];
                const combined = [...new Set([...existing, ...skills.map(s => String(s).toLowerCase())])];
                merged.taxonomy[cat] = combined;
            }
        }
    }

    // AI aliases extend base aliases
    if (aiGenerated.aliases) {
        for (const [variant, standard] of Object.entries(aiGenerated.aliases)) {
            merged.aliases[String(variant).toLowerCase()] = String(standard).toLowerCase();
        }
    }

    return merged;
}

module.exports = {
    BASE_TAXONOMY,
    BASE_ALIASES,
    resolveAlias,
    findCategory,
    isSameCategory,
    buildTaxonomyPrompt,
    parseTaxonomyResponse,
    mergeTaxonomy
};
