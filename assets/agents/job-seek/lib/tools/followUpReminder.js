'use strict';

/**
 * follow_up domain tool — Post-application follow-up reminders.
 *
 * Tracks applications with configurable follow-up intervals.
 * Checks which applications are due for follow-up based on
 * days since last action.
 */

const TOOL_DEF = {
    name: 'follow_up',
    description: 'Manage post-application follow-up reminders. Create, check, and dismiss reminders for job applications.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', description: 'Action: add | check | dismiss | list' },
            jobUrl: { type: 'string', description: 'Job URL to track' },
            company: { type: 'string', description: 'Company name (for display)' },
            jobTitle: { type: 'string', description: 'Job title (for display)' },
            appliedAt: { type: 'string', description: 'ISO date when applied (default now)' },
            followUpDays: { type: 'number', description: 'Days until follow-up (default 7)' },
            note: { type: 'string', description: 'Optional note for the reminder' }
        },
        required: ['action']
    },
    category: 'job-seek'
};

// In-memory reminder store: jobUrl → ReminderEntry
const _reminders = new Map();

const DEFAULT_FOLLOWUP_DAYS = 7;

/**
 * Add a follow-up reminder.
 */
function addReminder({ jobUrl, company, jobTitle, appliedAt, followUpDays, note }) {
    if (!jobUrl) throw new Error('jobUrl is required');
    const applied = appliedAt ? new Date(appliedAt) : new Date();

    const reminder = {
        jobUrl,
        company: company || '',
        jobTitle: jobTitle || '',
        appliedAt: applied.toISOString(),
        followUpDays: followUpDays || DEFAULT_FOLLOWUP_DAYS,
        followUpDate: new Date(applied.getTime() + (followUpDays || DEFAULT_FOLLOWUP_DAYS) * 86400000).toISOString(),
        note: note || '',
        dismissed: false,
        createdAt: new Date().toISOString()
    };

    _reminders.set(jobUrl, reminder);
    return reminder;
}

/**
 * Check which reminders are due.
 * @param {Date} [now] - Current date (for testing)
 * @returns {Array<object>}
 */
function checkDue(now) {
    const current = now || new Date();
    const due = [];

    for (const reminder of _reminders.values()) {
        if (reminder.dismissed) continue;
        if (new Date(reminder.followUpDate) <= current) {
            const daysSinceApply = Math.floor((current - new Date(reminder.appliedAt)) / 86400000);
            due.push({
                ...reminder,
                daysSinceApply,
                overdueDays: Math.floor((current - new Date(reminder.followUpDate)) / 86400000)
            });
        }
    }

    return due.sort((a, b) => a.overdueDays - b.overdueDays).reverse();
}

/**
 * Dismiss a reminder.
 */
function dismissReminder(jobUrl) {
    const reminder = _reminders.get(jobUrl);
    if (!reminder) return false;
    reminder.dismissed = true;
    return true;
}

/**
 * List all reminders.
 */
function listReminders(includeDismissed = false) {
    const all = Array.from(_reminders.values());
    return includeDismissed ? all : all.filter(r => !r.dismissed);
}

/**
 * Clear all reminders (for testing).
 */
function clearAll() {
    _reminders.clear();
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    const { action } = params;

    switch (action) {
        case 'add':
            return addReminder(params);
        case 'check':
            return { due: checkDue(), total: listReminders().length };
        case 'dismiss':
            if (!params.jobUrl) throw new Error('jobUrl is required for dismiss');
            return { dismissed: dismissReminder(params.jobUrl), jobUrl: params.jobUrl };
        case 'list':
            return { reminders: listReminders(params.includeDismissed) };
        default:
            throw new Error(`Unknown action: ${action}. Use add, check, dismiss, or list.`);
    }
}

module.exports = { TOOL_DEF, handler, addReminder, checkDue, dismissReminder, listReminders, clearAll };
