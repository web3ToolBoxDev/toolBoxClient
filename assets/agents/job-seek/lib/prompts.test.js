'use strict';

const {
    getPresetQuestionTemplates,
    isOnboardingComplete,
    isProfileComplete,
    defaultSubTasks,
    buildPresetPrompt,
    buildProfileCollectionPrompt,
    buildOnboardingPrompt,
    buildChatPrompt,
    buildToolContext,
    buildToolDefinitions
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
        it('returns 3 subtasks: onboarding, profile, search', () => {
            const tasks = defaultSubTasks(Date.now());
            expect(tasks).toHaveLength(3);
            expect(tasks[0].key).toBe('onboarding');
            expect(tasks[0].status).toBe('pending');
            expect(tasks[1].key).toBe('profile');
            expect(tasks[2].key).toBe('search');
        });

        it('includes actionLabel on action subtasks', () => {
            const tasks = defaultSubTasks(Date.now());
            const profile = tasks.find((t) => t.key === 'profile');
            expect(profile.actionLabel).toBe('Collect Profile');
            const search = tasks.find((t) => t.key === 'search');
            expect(search.actionLabel).toBe('Build Dashboard');
            expect(search.actionLabelZh).toBe('构建仪表盘');
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

        it('includes marker instructions in English prompt', () => {
            const prompt = buildProfileCollectionPrompt(false, {});
            expect(prompt).toContain('[PROFILE_SET:');
            expect(prompt).toContain('[PROFILE_ADD:');
            expect(prompt).toContain('[PROFILE_REMOVE:');
            expect(prompt).toContain('[DIRECTION:');
            expect(prompt).toContain('[PROFILE_COMPLETE]');
        });

        it('includes marker instructions in Chinese prompt', () => {
            const prompt = buildProfileCollectionPrompt(true, {});
            expect(prompt).toContain('[PROFILE_SET:');
            expect(prompt).toContain('[PROFILE_ADD:');
            expect(prompt).toContain('[PROFILE_REMOVE:');
            expect(prompt).toContain('[DIRECTION:');
            expect(prompt).toContain('[PROFILE_COMPLETE]');
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

    describe('buildChatPrompt', () => {
        it('includes marker instructions in English', () => {
            const prompt = buildChatPrompt(false);
            expect(prompt).toContain('[PROFILE_SET:');
            expect(prompt).toContain('[PROFILE_ADD:');
            expect(prompt).toContain('[PROFILE_REMOVE:');
            expect(prompt).toContain('[DIRECTION:');
        });

        it('includes marker instructions in Chinese', () => {
            const prompt = buildChatPrompt(true);
            expect(prompt).toContain('[PROFILE_SET:');
            expect(prompt).toContain('[PROFILE_ADD:');
            expect(prompt).toContain('[PROFILE_REMOVE:');
            expect(prompt).toContain('[DIRECTION:');
        });
    });

    describe('buildToolContext', () => {
        const sampleTools = [
            {
                name: 'http_fetch',
                description: 'Fetch a URL via HTTP',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL to fetch' },
                        extract: { type: 'boolean', description: 'Auto-extract HTML content' }
                    },
                    required: ['url']
                },
                category: 'http'
            },
            {
                name: 'browser_launch',
                description: 'Launch a browser instance',
                parameters: {
                    type: 'object',
                    properties: {
                        headless: { type: 'boolean', description: 'Run headless' }
                    }
                },
                category: 'browser'
            }
        ];

        it('returns empty string when no tools provided', () => {
            expect(buildToolContext([], false)).toBe('');
            expect(buildToolContext(null, false)).toBe('');
        });

        it('generates English tool context with descriptions', () => {
            const context = buildToolContext(sampleTools, false);
            expect(context).toContain('Available Tools');
            expect(context).toContain('http_fetch');
            expect(context).toContain('browser_launch');
            expect(context).toContain('TOOL_CALL');
            expect(context).toContain('url: string (required)');
            expect(context).toContain('extract: boolean');
        });

        it('generates Chinese tool context', () => {
            const context = buildToolContext(sampleTools, true);
            expect(context).toContain('可用工具');
            expect(context).toContain('http_fetch');
            expect(context).toContain('TOOL_CALL');
        });

        it('includes example tool call syntax', () => {
            const context = buildToolContext(sampleTools, false);
            expect(context).toContain('[TOOL_CALL:http_fetch(url="https://example.com"');
        });
    });

    describe('buildToolDefinitions', () => {
        it('returns empty array when no tools', () => {
            expect(buildToolDefinitions([])).toEqual([]);
            expect(buildToolDefinitions(null)).toEqual([]);
        });

        it('returns cleaned tool definitions', () => {
            const tools = [
                { name: 'test', description: 'Test tool', parameters: { type: 'object', properties: {} }, category: 'test', handler: () => {} }
            ];
            const defs = buildToolDefinitions(tools);
            expect(defs).toHaveLength(1);
            expect(defs[0].name).toBe('test');
            expect(defs[0].description).toBe('Test tool');
            expect(defs[0]).not.toHaveProperty('handler');
            expect(defs[0]).not.toHaveProperty('category');
        });
    });
});
