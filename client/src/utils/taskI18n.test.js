import { resolveTaskDisplayName } from './taskI18n';

describe('resolveTaskDisplayName', () => {
    it('prefers exact language in taskI18n', () => {
        const task = {
            taskName: '求职AI助手',
            taskKey: 'jobAgentTask',
            taskI18n: {
                en: 'Job Search AI Assistant',
                'zh-CN': '求职AI助手'
            }
        };
        expect(resolveTaskDisplayName(task, { language: 'zh-CN' })).toBe('求职AI助手');
    });

    it('falls back to base language', () => {
        const task = {
            taskName: '求职AI助手',
            taskKey: 'jobAgentTask',
            taskI18n: {
                en: 'Job Search AI Assistant'
            }
        };
        expect(resolveTaskDisplayName(task, { language: 'en-US' })).toBe('Job Search AI Assistant');
    });

    it('falls back to taskName then taskKey', () => {
        expect(resolveTaskDisplayName({ taskName: '测试任务' }, { language: 'fr' })).toBe('测试任务');
        expect(resolveTaskDisplayName({ taskKey: 'sampleTask' }, { language: 'fr' })).toBe('sampleTask');
    });
});

