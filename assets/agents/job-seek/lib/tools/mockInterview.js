'use strict';

/**
 * mock_interview domain tool — AI-powered mock interview simulation.
 *
 * Generates interview questions from a job description,
 * evaluates user answers, and provides feedback.
 */

const TOOL_DEF = {
    name: 'mock_interview',
    description: 'Generate mock interview questions from a job description and evaluate answers. Supports behavioral, technical, and situational questions.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', description: 'Action: generate | evaluate | summary' },
            jobTitle: { type: 'string', description: 'Job title for context' },
            jobDescription: { type: 'string', description: 'Full job description text' },
            requirements: { type: 'object', description: 'Parsed requirements from parse_listing' },
            questionType: { type: 'string', description: 'Type: behavioral | technical | situational | all (default all)' },
            count: { type: 'number', description: 'Number of questions to generate (default 5)' },
            question: { type: 'string', description: 'The interview question (for evaluate)' },
            answer: { type: 'string', description: 'User answer to evaluate (for evaluate)' },
            profile: { type: 'object', description: 'User profile for personalized feedback' }
        },
        required: ['action']
    },
    category: 'job-seek'
};

/**
 * Common behavioral question templates.
 */
const BEHAVIORAL_TEMPLATES = [
    'Tell me about a time you had to deal with a difficult team member.',
    'Describe a situation where you had to meet a tight deadline.',
    'Give an example of when you took initiative on a project.',
    'Tell me about a time you received critical feedback and how you handled it.',
    'Describe a situation where you had to learn a new technology quickly.',
    'Tell me about a time you disagreed with your manager.',
    'Give an example of a project that failed and what you learned.',
    'Describe a time when you had to prioritize multiple tasks.'
];

/**
 * Common situational question templates.
 */
const SITUATIONAL_TEMPLATES = [
    'How would you handle a production outage during off-hours?',
    'What would you do if you realized a feature you shipped had a security vulnerability?',
    'How would you approach a project with unclear requirements?',
    'What would you do if two stakeholders had conflicting priorities?',
    'How would you onboard a new team member?'
];

/**
 * Generate technical questions from requirements.
 */
function generateTechnicalQuestions(requirements, count) {
    const questions = [];
    const skills = requirements?.technical || [];
    const responsibilities = requirements?.responsibilities || [];

    for (const skill of skills.slice(0, count)) {
        questions.push(`Explain your experience with ${skill}. What projects have you used it in?`);
    }

    for (const resp of responsibilities.slice(0, Math.max(0, count - questions.length))) {
        questions.push(`How would you approach: ${resp}?`);
    }

    // Fill remaining with generic technical
    const generic = [
        'Walk me through your approach to debugging a complex issue.',
        'How do you ensure code quality in your projects?',
        'Describe your experience with CI/CD pipelines.',
        'How do you handle technical debt?'
    ];

    let i = 0;
    while (questions.length < count && i < generic.length) {
        questions.push(generic[i++]);
    }

    return questions.slice(0, count);
}

/**
 * Generate interview questions based on job description and type.
 */
function generateQuestions({ jobTitle, jobDescription, requirements, questionType = 'all', count = 5 }) {
    const questions = [];
    const types = questionType === 'all' ? ['behavioral', 'technical', 'situational'] : [questionType];
    const perType = Math.ceil(count / types.length);

    for (const type of types) {
        switch (type) {
            case 'behavioral': {
                const shuffled = [...BEHAVIORAL_TEMPLATES].sort(() => Math.random() - 0.5);
                for (const q of shuffled.slice(0, perType)) {
                    questions.push({ type: 'behavioral', question: q });
                }
                break;
            }
            case 'technical': {
                const techQs = generateTechnicalQuestions(requirements || {}, perType);
                for (const q of techQs) {
                    questions.push({ type: 'technical', question: q });
                }
                break;
            }
            case 'situational': {
                const shuffled = [...SITUATIONAL_TEMPLATES].sort(() => Math.random() - 0.5);
                for (const q of shuffled.slice(0, perType)) {
                    questions.push({ type: 'situational', question: q });
                }
                break;
            }
        }
    }

    return {
        jobTitle: jobTitle || 'General',
        totalQuestions: Math.min(questions.length, count),
        questions: questions.slice(0, count)
    };
}

/**
 * Evaluate a user's answer to an interview question.
 * Uses keyword-based heuristic scoring.
 */
function evaluateAnswer({ question, answer, profile }) {
    if (!question) throw new Error('question is required');
    if (!answer) throw new Error('answer is required');

    const criteria = {
        specificity: 0,
        structure: 0,
        relevance: 0,
        length: 0
    };

    const words = answer.split(/\s+/).length;

    // Length score: 30-200 words is ideal
    if (words < 15) criteria.length = 20;
    else if (words < 30) criteria.length = 50;
    else if (words <= 200) criteria.length = 100;
    else if (words <= 300) criteria.length = 80;
    else criteria.length = 60;

    // Structure: looks for STAR-like structure (Situation, Task, Action, Result)
    const starKeywords = ['situation', 'task', 'action', 'result', 'when', 'then', 'because', 'therefore', 'outcome', 'learned'];
    const starHits = starKeywords.filter(k => answer.toLowerCase().includes(k)).length;
    criteria.structure = Math.min(100, starHits * 20);

    // Specificity: numbers, proper nouns, specific details
    const hasNumbers = /\d+/.test(answer);
    const hasSpecifics = /\b(team|project|company|client|system|tool|framework|database)\b/i.test(answer);
    const hasMetrics = /\b(\d+%|\d+x|\$\d+|\d+ (users|customers|employees|months|years))\b/i.test(answer);
    criteria.specificity = (hasNumbers ? 30 : 0) + (hasSpecifics ? 30 : 0) + (hasMetrics ? 40 : 0);

    // Relevance: check if answer words relate to question words
    const qWords = new Set(question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const aWords = answer.toLowerCase().split(/\s+/);
    const overlap = aWords.filter(w => qWords.has(w)).length;
    criteria.relevance = Math.min(100, overlap * 15);

    const overall = Math.round(
        criteria.specificity * 0.3 +
        criteria.structure * 0.25 +
        criteria.relevance * 0.2 +
        criteria.length * 0.25
    );

    const tips = [];
    if (criteria.specificity < 50) tips.push('Add specific examples with numbers and metrics.');
    if (criteria.structure < 40) tips.push('Use the STAR method (Situation, Task, Action, Result).');
    if (criteria.length < 50) tips.push('Expand your answer with more detail (aim for 50-150 words).');
    if (criteria.relevance < 40) tips.push('Make sure your answer directly addresses the question.');

    return {
        question,
        score: overall,
        criteria,
        tips,
        wordCount: words,
        rating: overall >= 80 ? 'excellent' : overall >= 60 ? 'good' : overall >= 40 ? 'fair' : 'needs_improvement'
    };
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    const { action } = params;

    switch (action) {
        case 'generate':
            return generateQuestions(params);
        case 'evaluate':
            return evaluateAnswer(params);
        case 'summary':
            return {
                message: 'Mock interview practice helps prepare for real interviews. Use generate to get questions and evaluate to get feedback on your answers.'
            };
        default:
            throw new Error(`Unknown action: ${action}. Use generate, evaluate, or summary.`);
    }
}

module.exports = { TOOL_DEF, handler, generateQuestions, evaluateAnswer, generateTechnicalQuestions };
