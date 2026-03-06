'use strict';

const {
    getPresetQuestionTemplates,
    isOnboardingComplete,
    isProfileComplete,
    defaultSubTasks,
    buildPresetPrompt,
    buildProfileCollectionPrompt,
    buildOnboardingPrompt
} = require('./prompts');

describe('prompts.js', () => {
    describe('getPresetQuestionTemplates', () => {
        it('returns 5 questions for English', () => {
            const templates = getPresetQuestionTemplates(false);
            expect(templates).toHaveLength(5);
            expect(templates[0].id).toBe('q_job_title');
            expect(templates[1].id).toBe('q_location');
            expect(templates[2].id).toBe('q_work_mode');
            expect(templates[3].id).toBe('q_salary');
            expect(templates[4].id).toBe('q_upload_profile');
        });

        it('returns 5 questions for Chinese', () => {
            const templates = getPresetQuestionTemplates(true);
            expect(templates).toHaveLength(5);
            expect(templates[0].required).toBe(true);
            expect(templates[3].required).toBe(false);
            expect(templates[4].required).toBe(false);
        });

        it('marks q_job_title, q_location, q_work_mode as required', () => {
            const templates = getPresetQuestionTemplates(false);
            expect(templates.filter(q => q.required).map(q => q.id))
                .toEqual(['q_job_title', 'q_location', 'q_work_mode']);
        });
    });

    describe('isOnboardingComplete', () => {
        const templates = getPresetQuestionTemplates(false);

        it('returns false when no answers provided', () => {
            expect(isOnboardingComplete({}, templates)).toBe(false);
        });

        it('returns false when only some required answers provided', () => {
            expect(isOnboardingComplete({ q_job_title: 'Engineer' }, templates)).toBe(false);
        });

        it('returns true when all required answers provided', () => {
            expect(isOnboardingComplete({
                q_job_title: 'Frontend Engineer',
                q_location: 'Toronto',
                q_work_mode: 'remote'
            }, templates)).toBe(true);
        });

        it('returns true even without optional answers', () => {
            expect(isOnboardingComplete({
                q_job_title: 'QA',
                q_location: 'Shanghai',
                q_work_mode: 'onsite'
                // q_salary and q_upload_profile are optional
            }, templates)).toBe(true);
        });
    });

    describe('isProfileComplete', () => {
        it('returns false for empty sections', () => {
            expect(isProfileComplete({})).toBe(false);
        });

        it('returns false with only basic', () => {
            expect(isProfileComplete({ basic: 'name' })).toBe(false);
        });

        it('returns true with basic + skills', () => {
            expect(isProfileComplete({ basic: 'name', skills: 'JS' })).toBe(true);
        });
    });

    describe('defaultSubTasks', () => {
        it('includes onboarding as first task', () => {
            const tasks = defaultSubTasks(Date.now());
            expect(tasks[0].key).toBe('onboarding');
            expect(tasks[0].status).toBe('running');
            expect(tasks[1].key).toBe('profile');
        });
    });

    describe('buildPresetPrompt', () => {
        it('builds prompt with question states', () => {
            const templates = getPresetQuestionTemplates(false);
            const prompt = buildPresetPrompt(false, { q_job_title: 'Dev' }, templates);
            expect(prompt.questions[0].answerValue).toBe('Dev');
            expect(prompt.questions[2].selectedOptionId).toBe('');
        });
    });

    describe('buildProfileCollectionPrompt', () => {
        it('returns English prompt with job title', () => {
            const prompt = buildProfileCollectionPrompt(false, { q_job_title: 'QA Engineer', q_location: 'Toronto' });
            expect(prompt).toContain('QA Engineer');
            expect(prompt).toContain('Toronto');
        });

        it('returns Chinese prompt when isZh=true', () => {
            const prompt = buildProfileCollectionPrompt(true, { q_job_title: '前端工程师' });
            expect(prompt).toContain('前端工程师');
        });
    });

    describe('buildOnboardingPrompt', () => {
        it('lists all missing fields when no answers given', () => {
            const prompt = buildOnboardingPrompt(false, {});
            expect(prompt).toContain('target job title');
            expect(prompt).toContain('preferred location');
            expect(prompt).toContain('work mode');
            expect(prompt).toContain('[ANSWER:q_job_title=');
        });

        it('shows already collected info when partial answers given', () => {
            const prompt = buildOnboardingPrompt(false, { q_job_title: 'Frontend' });
            expect(prompt).toContain('Job title: Frontend');
            expect(prompt).toContain('preferred location');
            expect(prompt).not.toContain('target job title');
        });

        it('returns Chinese prompt when isZh=true', () => {
            const prompt = buildOnboardingPrompt(true, {});
            expect(prompt).toContain('目标职位名称');
            expect(prompt).toContain('[ANSWER:q_job_title=');
        });
    });
});
