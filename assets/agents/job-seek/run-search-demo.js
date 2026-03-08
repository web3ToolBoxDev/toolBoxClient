'use strict';

/**
 * Standalone search pipeline demo.
 *
 * Boots the dashboard server, runs a search pipeline with realistic data,
 * and opens the dashboard in the browser.
 *
 * Usage:
 *   node assets/agents/job-seek/run-search-demo.js
 *   (or via bundled Node: assets/node_for_win/node-v22.22.0-win/node.exe assets/agents/job-seek/run-search-demo.js)
 */

const path = require('path');
process.chdir(path.join(__dirname));

const dashboardServer = require('./lib/dashboardServer');
const searchPipeline = require('./lib/searchPipeline');

const SESSION_ID = 'demo-' + Date.now();

// Simulated user profile and direction
const STATE = {
    selectedAnswers: {
        [SESSION_ID]: {
            q_job_title: 'Frontend Developer',
            q_location: 'Toronto, Canada',
            q_work_mode: 'remote',
            q_salary: '120'
        }
    },
    profileSections: {
        [SESSION_ID]: {
            basic: 'Jane Smith | jane.smith@email.com | Toronto, Canada | github.com/janesmith',
            skills: 'React, TypeScript, JavaScript, Node.js, CSS/SCSS, HTML5, Redux, GraphQL, REST API, Git, Webpack, Jest, Playwright, Figma',
            experience: '5 years Senior Frontend Developer at TechCorp (2019-2024). Built React SPA serving 50K users. Led frontend team of 3. Migrated legacy jQuery to React.',
            education: 'Bachelor of Computer Science, University of Toronto, 2018. Dean\'s List. Capstone: real-time collaboration tool.'
        }
    },
    subtasks: {
        [SESSION_ID]: [
            { key: 'onboarding', status: 'done' },
            { key: 'profile', status: 'done' },
            { key: 'search', status: 'running' }
        ]
    },
    intentFiles: { [SESSION_ID]: { version: 2 } }
};

// ─── Start dashboard ───
console.log('[demo] Starting dashboard server on port 30003...');
dashboardServer.start(() => STATE);

// ─── Seed realistic job listings ───
const JOBS = [
    {
        url: 'https://www.linkedin.com/jobs/view/senior-react-developer-at-shopify-123456',
        title: 'Senior React Developer',
        company: 'Shopify',
        location: 'Toronto, ON (Remote)',
        salary: '$130K - $170K CAD'
    },
    {
        url: 'https://www.indeed.com/viewjob?jk=abc123&q=frontend+developer',
        title: 'Frontend Engineer',
        company: 'Wealthsimple',
        location: 'Toronto, ON',
        salary: '$120K - $150K'
    },
    {
        url: 'https://careers.google.com/jobs/results/123456-frontend-engineer',
        title: 'Frontend Software Engineer, Google Cloud',
        company: 'Google',
        location: 'Waterloo, ON (Hybrid)',
        salary: '$140K - $200K'
    },
    {
        url: 'https://jobs.lever.co/stripe/frontend-engineer-dashboard',
        title: 'Frontend Engineer — Dashboard',
        company: 'Stripe',
        location: 'Remote (Canada)',
        salary: '$150K - $180K USD'
    },
    {
        url: 'https://www.glassdoor.com/job/react-developer-rbc-456789',
        title: 'React Developer',
        company: 'RBC (Royal Bank of Canada)',
        location: 'Toronto, ON',
        salary: '$100K - $130K'
    },
    {
        url: 'https://www.indeed.com/viewjob?jk=def456&q=fullstack',
        title: 'Fullstack Developer (React + Node)',
        company: 'Hootsuite',
        location: 'Vancouver, BC (Remote)',
        salary: '$110K - $140K'
    },
    {
        url: 'https://www.linkedin.com/jobs/view/vue-developer-at-clio-789012',
        title: 'Vue.js Developer',
        company: 'Clio',
        location: 'Calgary, AB (Remote)',
        salary: '$95K - $125K'
    },
    {
        url: 'https://boards.greenhouse.io/datadog/frontend-engineer-1234',
        title: 'Senior Frontend Engineer',
        company: 'Datadog',
        location: 'Remote (EST timezone)',
        salary: '$160K - $190K USD'
    },
    {
        url: 'https://www.indeed.com/viewjob?jk=ghi789&q=java+developer',
        title: 'Java Backend Developer',
        company: 'TD Bank',
        location: 'Toronto, ON',
        salary: '$110K - $135K'
    },
    {
        url: 'https://www.linkedin.com/jobs/view/devops-engineer-at-telus-345678',
        title: 'DevOps Engineer',
        company: 'TELUS',
        location: 'Vancouver, BC',
        salary: '$115K - $145K'
    },
    {
        url: 'https://angel.co/company/figma/jobs/frontend-engineer-567890',
        title: 'Frontend Engineer — Design Tools',
        company: 'Figma',
        location: 'Remote (North America)',
        salary: '$170K - $210K USD'
    },
    {
        url: 'https://www.indeed.com/viewjob?jk=jkl012&q=python+ml',
        title: 'Machine Learning Engineer (Python)',
        company: 'Element AI',
        location: 'Montreal, QC',
        salary: '$130K - $160K'
    }
];

// Parse requirements for each job (simulating parseListing)
const REQUIREMENTS = {
    'Senior React Developer': {
        title: 'Senior React Developer', sections: {
            technical: 'React, TypeScript, Redux, GraphQL, CSS-in-JS, Jest, Webpack, Performance optimization, 5+ years frontend',
            experience: '5+ years professional frontend development, React expertise required',
            education: 'Bachelor in CS or equivalent experience',
            soft_skills: 'Strong communication, team collaboration, mentoring junior developers'
        }
    },
    'Frontend Engineer': {
        title: 'Frontend Engineer', sections: {
            technical: 'React or Vue, JavaScript/TypeScript, HTML5, CSS3, REST API, Git, responsive design',
            experience: '3+ years frontend development',
            education: 'Bachelor degree in Computer Science',
            soft_skills: 'Team player, agile experience'
        }
    },
    'Frontend Software Engineer, Google Cloud': {
        title: 'Frontend Software Engineer', sections: {
            technical: 'React, Angular or Vue, TypeScript, gRPC, protobuf, large-scale web applications, cloud computing',
            experience: '4+ years software engineering, distributed systems experience',
            education: 'BS/MS in Computer Science',
            soft_skills: 'Problem solving, code review, cross-functional collaboration'
        }
    },
    'Frontend Engineer — Dashboard': {
        title: 'Frontend Engineer — Dashboard', sections: {
            technical: 'React, TypeScript, D3.js or charting libraries, CSS, responsive design, data visualization',
            experience: '3+ years frontend, dashboard or data-heavy UI experience preferred',
            education: 'Bachelor degree or equivalent',
            soft_skills: 'Attention to detail, user empathy'
        }
    },
    'React Developer': {
        title: 'React Developer', sections: {
            technical: 'React, JavaScript, TypeScript, HTML, CSS, Redux, Node.js, REST API',
            experience: '2+ years React development',
            education: 'Bachelor degree',
            soft_skills: 'Communication, teamwork'
        }
    },
    'Fullstack Developer (React + Node)': {
        title: 'Fullstack Developer', sections: {
            technical: 'React, Node.js, TypeScript, PostgreSQL, Docker, REST API, GraphQL, AWS',
            experience: '3+ years fullstack development',
            education: 'Bachelor degree in CS or related',
            soft_skills: 'Ownership mentality, startup experience a plus'
        }
    },
    'Vue.js Developer': {
        title: 'Vue.js Developer', sections: {
            technical: 'Vue.js, Vuex, JavaScript, TypeScript, CSS, HTML, REST API, Git',
            experience: '2+ years Vue.js development',
            education: 'Bachelor degree',
            soft_skills: 'Self-motivated, remote work experience'
        }
    },
    'Senior Frontend Engineer': {
        title: 'Senior Frontend Engineer', sections: {
            technical: 'React, TypeScript, CSS, performance optimization, monitoring, observability, large-scale SPAs',
            experience: '5+ years frontend, 2+ years at scale (100K+ users)',
            education: 'Bachelor or Master in CS',
            soft_skills: 'Technical leadership, mentoring'
        }
    },
    'Java Backend Developer': {
        title: 'Java Backend Developer', sections: {
            technical: 'Java, Spring Boot, Hibernate, PostgreSQL, Oracle, Docker, Kubernetes, microservices, REST API',
            experience: '3+ years Java development, banking/fintech experience preferred',
            education: 'Bachelor degree in CS',
            soft_skills: 'Detail-oriented, compliance awareness'
        }
    },
    'DevOps Engineer': {
        title: 'DevOps Engineer', sections: {
            technical: 'Terraform, AWS/GCP/Azure, Docker, Kubernetes, CI/CD, Jenkins, Linux, Python, Bash, monitoring',
            experience: '4+ years DevOps or SRE, cloud certifications a plus',
            education: 'Bachelor degree',
            soft_skills: 'Automation mindset, incident response'
        }
    },
    'Frontend Engineer — Design Tools': {
        title: 'Frontend Engineer — Design Tools', sections: {
            technical: 'React, TypeScript, WebGL/Canvas, performance optimization, design systems, CSS, HTML',
            experience: '4+ years frontend, experience with creative/design tools',
            education: 'Bachelor or Master in CS',
            soft_skills: 'Design sensibility, user-focused engineering'
        }
    },
    'Machine Learning Engineer (Python)': {
        title: 'ML Engineer', sections: {
            technical: 'Python, PyTorch, TensorFlow, scikit-learn, pandas, SQL, MLOps, Docker, model serving',
            experience: '3+ years ML engineering, production model deployment',
            education: 'Master or PhD in CS/ML/Statistics',
            soft_skills: 'Research skills, communication of technical concepts'
        }
    }
};

const { handler: matchProfileHandler } = require('./lib/tools/matchProfile');
const { handler: resumeGenHandler } = require('./lib/tools/resumeGen');

async function runDemo() {
    console.log(`[demo] Session: ${SESSION_ID}`);
    console.log(`[demo] Profile: ${STATE.profileSections[SESSION_ID].skills.slice(0, 60)}...`);
    console.log(`[demo] Direction: ${STATE.selectedAnswers[SESSION_ID].q_job_title} in ${STATE.selectedAnswers[SESSION_ID].q_location}`);
    console.log(`[demo] Searching ${JOBS.length} job listings...`);
    console.log('');

    const profile = STATE.profileSections[SESSION_ID];

    // Phase 1: Discover all jobs
    for (const job of JOBS) {
        dashboardServer.upsertJobCard(SESSION_ID, {
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary,
            status: 'discovered'
        });
    }
    console.log(`[demo] Phase 1: ${JOBS.length} jobs discovered`);

    // Phase 2: Parse & Match
    let qualified = 0;
    for (const job of JOBS) {
        const req = REQUIREMENTS[job.title];
        if (req) {
            dashboardServer.updateJobStatus(SESSION_ID, job.url, 'parsed');
        }

        const matchResult = matchProfileHandler({
            profile,
            requirements: req || { title: job.title, sections: { technical: '', experience: '', education: '', soft_skills: '' } },
            jobTitle: job.title,
            jobUrl: job.url
        });

        const score = matchResult.overallScore || 0;
        const status = score >= 60 ? 'matched' : 'discovered';

        dashboardServer.upsertJobCard(SESSION_ID, {
            url: job.url,
            matchScore: score,
            status,
            artifacts: req ? { requirements: true } : {}
        });

        if (score >= 60) qualified++;

        console.log(`  ${status === 'matched' ? '✓' : '✗'} ${score}% — ${job.title} @ ${job.company}`);
    }
    console.log(`[demo] Phase 2: ${qualified} jobs qualified (score >= 60%)`);

    // Phase 3: Generate resume for top match
    const cards = dashboardServer.getJobCards(SESSION_ID);
    const topJob = cards[0];
    if (topJob && topJob.matchScore >= 60) {
        console.log(`[demo] Phase 3: Generating resume for "${topJob.title}" @ ${topJob.company}...`);

        const resume = resumeGenHandler({
            profile,
            requirements: REQUIREMENTS[topJob.title] || {},
            jobTitle: topJob.title,
            company: topJob.company
        });

        dashboardServer.upsertJobCard(SESSION_ID, {
            url: topJob.url,
            status: 'tailored',
            artifacts: { resume: 'generated', resumeMarkdown: resume.markdown }
        });
        console.log(`  Resume generated (${resume.markdown.length} chars)`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Dashboard: http://127.0.0.1:30003/dashboard/${SESSION_ID}`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('Open the URL above in your browser to see the results.');
    console.log('Press Ctrl+C to stop the dashboard server.');

    // Open browser automatically
    try {
        const { exec } = require('child_process');
        const url = `http://127.0.0.1:30003/dashboard/${SESSION_ID}`;
        if (process.platform === 'win32') {
            exec(`start "" "${url}"`);
        } else if (process.platform === 'darwin') {
            exec(`open "${url}"`);
        } else {
            exec(`xdg-open "${url}"`);
        }
    } catch {}
}

// Wait for server to be ready, then run
setTimeout(runDemo, 500);
