'use strict';

const { TOOL_DEF, handler, addReminder, checkDue, dismissReminder, listReminders, clearAll } = require('./followUpReminder');

describe('follow_up tool', () => {
    beforeEach(() => clearAll());

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('follow_up');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires action', () => {
            expect(TOOL_DEF.parameters.required).toContain('action');
        });
    });

    describe('addReminder', () => {
        test('creates a reminder with defaults', () => {
            const r = addReminder({ jobUrl: 'https://j.com/1', company: 'Acme' });
            expect(r.jobUrl).toBe('https://j.com/1');
            expect(r.company).toBe('Acme');
            expect(r.followUpDays).toBe(7);
            expect(r.dismissed).toBe(false);
        });

        test('computes followUpDate correctly', () => {
            const applied = '2024-01-01T00:00:00.000Z';
            const r = addReminder({ jobUrl: 'https://j.com/2', appliedAt: applied, followUpDays: 5 });
            expect(new Date(r.followUpDate).toISOString()).toBe('2024-01-06T00:00:00.000Z');
        });

        test('throws without jobUrl', () => {
            expect(() => addReminder({ company: 'Acme' })).toThrow('jobUrl is required');
        });

        test('accepts custom followUpDays', () => {
            const r = addReminder({ jobUrl: 'https://j.com/3', followUpDays: 14 });
            expect(r.followUpDays).toBe(14);
        });
    });

    describe('checkDue', () => {
        test('returns empty when no reminders', () => {
            expect(checkDue()).toHaveLength(0);
        });

        test('returns due reminders', () => {
            addReminder({ jobUrl: 'https://j.com/4', appliedAt: '2024-01-01T00:00:00Z', followUpDays: 3 });
            const due = checkDue(new Date('2024-01-10'));
            expect(due).toHaveLength(1);
            expect(due[0].daysSinceApply).toBe(9);
            expect(due[0].overdueDays).toBe(6);
        });

        test('excludes not-yet-due reminders', () => {
            addReminder({ jobUrl: 'https://j.com/5', appliedAt: '2024-01-01T00:00:00Z', followUpDays: 30 });
            const due = checkDue(new Date('2024-01-10'));
            expect(due).toHaveLength(0);
        });

        test('excludes dismissed reminders', () => {
            addReminder({ jobUrl: 'https://j.com/6', appliedAt: '2024-01-01T00:00:00Z', followUpDays: 3 });
            dismissReminder('https://j.com/6');
            const due = checkDue(new Date('2024-01-10'));
            expect(due).toHaveLength(0);
        });

        test('sorts by overdue days descending', () => {
            addReminder({ jobUrl: 'https://j.com/7', appliedAt: '2024-01-01T00:00:00Z', followUpDays: 3 });
            addReminder({ jobUrl: 'https://j.com/8', appliedAt: '2024-01-05T00:00:00Z', followUpDays: 3 });
            const due = checkDue(new Date('2024-01-20'));
            expect(due[0].jobUrl).toBe('https://j.com/7'); // More overdue first
        });
    });

    describe('dismissReminder', () => {
        test('dismisses existing reminder', () => {
            addReminder({ jobUrl: 'https://j.com/9' });
            expect(dismissReminder('https://j.com/9')).toBe(true);
            expect(listReminders()).toHaveLength(0);
        });

        test('returns false for nonexistent', () => {
            expect(dismissReminder('https://nope.com')).toBe(false);
        });
    });

    describe('listReminders', () => {
        test('excludes dismissed by default', () => {
            addReminder({ jobUrl: 'https://j.com/10' });
            addReminder({ jobUrl: 'https://j.com/11' });
            dismissReminder('https://j.com/10');
            expect(listReminders()).toHaveLength(1);
        });

        test('includes dismissed when requested', () => {
            addReminder({ jobUrl: 'https://j.com/12' });
            dismissReminder('https://j.com/12');
            expect(listReminders(true)).toHaveLength(1);
        });
    });

    describe('handler', () => {
        test('add action', async () => {
            const r = await handler({ action: 'add', jobUrl: 'https://j.com/h1', company: 'Test' });
            expect(r.jobUrl).toBe('https://j.com/h1');
        });

        test('check action', async () => {
            addReminder({ jobUrl: 'https://j.com/h2', appliedAt: '2020-01-01T00:00:00Z' });
            const r = await handler({ action: 'check' });
            expect(r.due.length).toBeGreaterThanOrEqual(1);
            expect(r.total).toBe(1);
        });

        test('dismiss action', async () => {
            addReminder({ jobUrl: 'https://j.com/h3' });
            const r = await handler({ action: 'dismiss', jobUrl: 'https://j.com/h3' });
            expect(r.dismissed).toBe(true);
        });

        test('list action', async () => {
            addReminder({ jobUrl: 'https://j.com/h4' });
            const r = await handler({ action: 'list' });
            expect(r.reminders).toHaveLength(1);
        });

        test('throws on unknown action', async () => {
            await expect(handler({ action: 'bad' })).rejects.toThrow('Unknown action');
        });
    });
});
