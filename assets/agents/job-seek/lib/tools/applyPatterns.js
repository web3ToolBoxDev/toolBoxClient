'use strict';

/**
 * Platform-specific apply patterns for known job sites.
 *
 * Each pattern provides:
 *   - match: RegExp to test against job URL
 *   - applyButton: CSS selectors to find the apply/start button
 *   - submitButton: CSS selectors to find the submit button
 *   - fields: Profile field → CSS selector overrides (beyond generic FIELD_MAPPINGS)
 *   - multiStep: Whether the apply flow has multiple pages/modals
 *   - nextButton: Selectors for "Next"/"Continue" buttons (multiStep only)
 *   - maxSteps: Max pages to iterate through (multiStep only)
 *   - resumeUpload: Selector for resume file input (overrides generic)
 *   - successIndicators: { text: RegExp[], urlPattern: RegExp[] }
 *   - requiresLogin: Whether login is needed before applying
 *   - chatBased: Whether apply is chat-based (no traditional form submit)
 */

const PATTERNS = {
    indeed: {
        name: 'Indeed',
        match: /indeed\.(com|co|ca|com\.au|co\.uk|co\.in)/i,
        applyButton: [
            'button[id*="apply"]',
            '.ia-IndeedApplyButton',
            '#indeedApplyButton',
            'button:has-text("Apply now")',
            'button:has-text("Apply on company site")',
            'a[href*="/applycomp/"]'
        ],
        // Indeed has its own apply form after clicking
        submitButton: [
            'button[type="submit"]',
            'button:has-text("Continue")',
            'button:has-text("Submit your application")',
            'button:has-text("Submit")',
            'button:has-text("Apply")'
        ],
        fields: {
            // Indeed pre-fills most fields from account, but some external forms need:
            name: ['input[name="applicant.name"]', 'input[id*="name"]'],
            email: ['input[name="applicant.email"]', 'input[type="email"]'],
            phone: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]']
        },
        resumeUpload: [
            'input[type="file"][name*="resume"]',
            'input[type="file"][id*="resume"]',
            'input[type="file"]'
        ],
        multiStep: true,
        nextButton: [
            'button:has-text("Continue")',
            'button:has-text("Next")',
            'button[data-testid="ContinueButton"]'
        ],
        maxSteps: 5,
        successIndicators: {
            text: [/thank you/i, /application.*submitted/i, /application.*received/i, /successfully applied/i],
            urlPattern: [/\/confirmation/i, /\/thank/i, /\/success/i, /applied=true/i]
        },
        requiresLogin: false
    },

    linkedin: {
        name: 'LinkedIn',
        match: /linkedin\.com/i,
        applyButton: [
            'button[aria-label*="Easy Apply"]',
            '.jobs-apply-button',
            'button:has-text("Easy Apply")',
            'button:has-text("Apply")',
            '.jobs-apply-button--top-card'
        ],
        submitButton: [
            'button[aria-label="Submit application"]',
            'button:has-text("Submit application")',
            'button:has-text("Submit")'
        ],
        fields: {
            // LinkedIn Easy Apply pre-fills from profile
            // Some forms ask additional questions
            phone: ['input[id*="phone"]', 'input[name*="phone"]']
        },
        resumeUpload: [
            'input[type="file"]'  // In Easy Apply modal
        ],
        multiStep: true,
        nextButton: [
            'button[aria-label="Continue to next step"]',
            'button[aria-label="Next"]',
            'button:has-text("Next")',
            'button:has-text("Continue")',
            'button:has-text("Review")'
        ],
        maxSteps: 6,
        successIndicators: {
            text: [/application.*sent/i, /applied.*successfully/i, /your application was sent/i],
            urlPattern: [/\/jobs\/view/i]
        },
        requiresLogin: true
    },

    boss: {
        name: 'Boss直聘',
        match: /zhipin\.com|bosszhipin\.com/i,
        applyButton: [
            'a:has-text("立即沟通")',
            'a:has-text("投递简历")',
            '.btn-startchat',
            '.btn-chat',
            'a.btn-startchat',
            'div.btn-container a'
        ],
        submitButton: [],  // Boss直聘 is chat-based — no traditional submit
        fields: {},        // All from account profile
        resumeUpload: [],
        multiStep: false,
        chatBased: true,   // Chat-based apply: sends greeting message
        chatGreeting: '您好，我对这个职位很感兴趣，请问还在招聘吗？',
        chatInput: [
            'textarea.chat-input',
            'div[contenteditable="true"]',
            'textarea[placeholder*="沟通"]',
            '.message-input textarea'
        ],
        chatSendButton: [
            'button:has-text("发送")',
            'button.btn-send',
            '.chat-op button'
        ],
        successIndicators: {
            text: [/已投递/i, /沟通中/i, /消息已发送/i, /投递成功/i],
            urlPattern: [/\/chat/i]
        },
        requiresLogin: true
    },

    glassdoor: {
        name: 'Glassdoor',
        match: /glassdoor\.(com|co|ca|com\.au|co\.uk)/i,
        applyButton: [
            'button[data-test="apply-button"]',
            'button:has-text("Apply")',
            'a:has-text("Apply on company site")',
            '.apply-button'
        ],
        submitButton: [
            'button[type="submit"]',
            'button:has-text("Submit")',
            'button:has-text("Apply")'
        ],
        fields: {},
        resumeUpload: [
            'input[type="file"]'
        ],
        multiStep: false,
        successIndicators: {
            text: [/thank you/i, /application.*submitted/i],
            urlPattern: [/\/confirmation/i, /\/thank/i]
        },
        requiresLogin: false
    }
};

/**
 * Detect which platform a URL belongs to.
 * @param {string} url - Job listing URL
 * @returns {{ key: string, pattern: object } | null}
 */
function detectPlatform(url) {
    if (!url) return null;
    for (const [key, pattern] of Object.entries(PATTERNS)) {
        if (pattern.match.test(url)) {
            return { key, pattern };
        }
    }
    return null;
}

/**
 * Generic submit button selectors (fallback for unknown sites).
 */
const GENERIC_SUBMIT_SELECTORS = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Submit Application")',
    'button:has-text("Send Application")',
    'button:has-text("提交")',
    'button:has-text("投递")',
    'button[id*="submit"]',
    'button[class*="submit"]',
    'form button:last-of-type'
];

/**
 * Generic success indicators (fallback for unknown sites).
 */
const GENERIC_SUCCESS_INDICATORS = {
    text: [
        /thank you/i,
        /submitted/i,
        /application.*received/i,
        /successfully/i,
        /投递成功/i,
        /提交成功/i,
        /已投递/i
    ],
    urlPattern: [
        /\/confirmation/i,
        /\/thank/i,
        /\/success/i,
        /submitted/i
    ]
};

module.exports = {
    PATTERNS,
    detectPlatform,
    GENERIC_SUBMIT_SELECTORS,
    GENERIC_SUCCESS_INDICATORS
};
