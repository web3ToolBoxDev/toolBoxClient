'use strict';

const { TOOL_DEF, handler, generateQuestions, evaluateAnswer, generateTechnicalQuestions } = require('./mockInterview');

describe('mock_interview tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('mock_interview');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires action', () => {
            expect(TOOL_DEF.parameters.required).toContain('action');
        });
    });

    describe('generateQuestions', () => {
        test('generates default 5 questions', () => {
            const result = generateQuestions({ jobTitle: 'Dev' });
            expect(result.questions.length).toBeLessThanOrEqual(5);
            expect(result.jobTitle).toBe('Dev');
        });

        test('generates behavioral questions', () => {
            const result = generateQuestions({ questionType: 'behavioral', count: 3 });
            expect(result.questions.every(q => q.type === 'behavioral')).toBe(true);
        });

        test('generates technical questions from requirements', () => {
            const result = generateQuestions({
                questionType: 'technical',
                count: 3,
                requirements: { technical: ['React', 'TypeScript', 'Node.js'] }
            });
            expect(result.questions.every(q => q.type === 'technical')).toBe(true);
            expect(result.questions[0].question).toContain('React');
        });

        test('generates situational questions', () => {
            const result = generateQuestions({ questionType: 'situational', count: 3 });
            expect(result.questions.every(q => q.type === 'situational')).toBe(true);
        });

        test('generates mixed questions for "all" type', () => {
            const result = generateQuestions({ questionType: 'all', count: 6 });
            const types = new Set(result.questions.map(q => q.type));
            expect(types.size).toBeGreaterThan(1);
        });

        test('respects count parameter', () => {
            const result = generateQuestions({ count: 2 });
            expect(result.questions.length).toBeLessThanOrEqual(2);
        });
    });

    describe('generateTechnicalQuestions', () => {
        test('generates from skills', () => {
            const qs = generateTechnicalQuestions({ technical: ['React', 'Python'] }, 2);
            expect(qs).toHaveLength(2);
            expect(qs[0]).toContain('React');
        });

        test('fills with generic when skills insufficient', () => {
            const qs = generateTechnicalQuestions({}, 3);
            expect(qs).toHaveLength(3);
        });

        test('uses responsibilities when available', () => {
            const qs = generateTechnicalQuestions({
                technical: [],
                responsibilities: ['Build microservices', 'Mentor juniors']
            }, 2);
            expect(qs.some(q => q.includes('Build microservices'))).toBe(true);
        });
    });

    describe('evaluateAnswer', () => {
        test('scores a detailed STAR answer highly', () => {
            const result = evaluateAnswer({
                question: 'Tell me about a time you led a team.',
                answer: 'In my previous role at Acme Corp, the situation was that we had a critical project deadline. The task assigned to me was to coordinate 5 team members. My action was to break down the work into sprints. As a result, we delivered 2 weeks early, improving customer satisfaction by 30%.'
            });
            expect(result.score).toBeGreaterThan(40);
            expect(result.criteria.structure).toBeGreaterThan(0);
            expect(result.criteria.specificity).toBeGreaterThan(0);
        });

        test('scores a brief answer lower', () => {
            const result = evaluateAnswer({
                question: 'Tell me about a challenge you faced.',
                answer: 'It was hard but I fixed it.'
            });
            expect(result.score).toBeLessThan(50);
            expect(result.rating).toBe('needs_improvement');
        });

        test('provides improvement tips', () => {
            const result = evaluateAnswer({
                question: 'Describe your experience.',
                answer: 'I have experience.'
            });
            expect(result.tips.length).toBeGreaterThan(0);
        });

        test('throws without question', () => {
            expect(() => evaluateAnswer({ answer: 'test' })).toThrow('question is required');
        });

        test('throws without answer', () => {
            expect(() => evaluateAnswer({ question: 'test' })).toThrow('answer is required');
        });

        test('includes word count', () => {
            const result = evaluateAnswer({
                question: 'test?',
                answer: 'one two three four five'
            });
            expect(result.wordCount).toBe(5);
        });
    });

    describe('handler', () => {
        test('generate action', async () => {
            const result = await handler({ action: 'generate', jobTitle: 'Dev', count: 2 });
            expect(result.questions).toBeDefined();
        });

        test('evaluate action', async () => {
            const result = await handler({ action: 'evaluate', question: 'Q?', answer: 'My answer with some detail about the project and team.' });
            expect(result.score).toBeDefined();
        });

        test('summary action', async () => {
            const result = await handler({ action: 'summary' });
            expect(result.message).toBeDefined();
        });

        test('throws on unknown action', async () => {
            await expect(handler({ action: 'bad' })).rejects.toThrow('Unknown action');
        });
    });
});
