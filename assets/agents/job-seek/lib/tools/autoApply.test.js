'use strict';

const { TOOL_DEF, handler, fillFormFields, FIELD_MAPPINGS } = require('./autoApply');

// Mock toolServiceClient
jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn()
}));

const toolServiceClient = require('../core/toolServiceClient');

describe('auto_apply tool', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('auto_apply');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires url and profile', () => {
            expect(TOOL_DEF.parameters.required).toContain('url');
            expect(TOOL_DEF.parameters.required).toContain('profile');
        });

        test('has headless parameter', () => {
            expect(TOOL_DEF.parameters.properties.headless).toBeDefined();
        });
    });

    describe('FIELD_MAPPINGS', () => {
        test('has name, email, phone, location mappings', () => {
            const keys = FIELD_MAPPINGS.map(m => m.profileKey);
            expect(keys).toContain('name');
            expect(keys).toContain('email');
            expect(keys).toContain('phone');
            expect(keys).toContain('location');
        });

        test('name extract returns first line/segment', () => {
            const mapping = FIELD_MAPPINGS.find(m => m.profileKey === 'name');
            expect(mapping.extract('John Doe, NYC')).toBe('John Doe');
            expect(mapping.extract('Jane\nSomewhere')).toBe('Jane');
        });

        test('email extract finds email address', () => {
            const mapping = FIELD_MAPPINGS.find(m => m.profileKey === 'email');
            expect(mapping.extract('Contact: john@example.com')).toBe('john@example.com');
            expect(mapping.extract('no email here')).toBe('');
        });

        test('phone extract finds phone number', () => {
            const mapping = FIELD_MAPPINGS.find(m => m.profileKey === 'phone');
            expect(mapping.extract('Call me at 123-456-7890')).toBe('123-456-7890');
            expect(mapping.extract('no phone')).toBe('');
        });

        test('location extract returns second segment', () => {
            const mapping = FIELD_MAPPINGS.find(m => m.profileKey === 'location');
            expect(mapping.extract('John Doe, New York')).toBe('New York');
            expect(mapping.extract('Solo')).toBe('');
        });
    });

    describe('fillFormFields', () => {
        test('fills fields when selectors match', async () => {
            toolServiceClient.executeTool.mockResolvedValue({ success: true });
            const profile = { basic: 'John Doe, NYC\njohn@test.com\n123-456-7890' };
            const result = await fillFormFields('browser-1', profile);
            expect(result.filled.length).toBeGreaterThan(0);
            expect(result.filled).toContain('name');
        });

        test('skips fields with empty extracted value', async () => {
            const profile = { basic: '' };
            const result = await fillFormFields('browser-1', profile);
            expect(result.filled).toHaveLength(0);
            expect(result.skipped.length).toBeGreaterThan(0);
        });

        test('skips fields when all selectors fail', async () => {
            toolServiceClient.executeTool.mockResolvedValue({ success: false, error: 'not found' });
            const profile = { basic: 'John Doe, NYC\njohn@test.com' };
            const result = await fillFormFields('browser-1', profile);
            expect(result.skipped).toContain('name');
        });

        test('tries multiple selectors per field', async () => {
            // First selector fails, second succeeds
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true });
            const profile = { basic: 'John, City\njohn@x.com' };
            const result = await fillFormFields('browser-1', profile);
            expect(result.filled).toContain('name');
        });
    });

    describe('handler', () => {
        test('throws if url is missing', async () => {
            await expect(handler({ profile: {} })).rejects.toThrow('url is required');
        });

        test('throws if profile is missing', async () => {
            await expect(handler({ url: 'https://x.com' })).rejects.toThrow('profile is required');
        });

        test('throws if browser launch fails', async () => {
            toolServiceClient.executeTool.mockResolvedValue({ success: false, error: 'no chrome' });
            await expect(handler({ url: 'https://x.com', profile: { basic: 'Test' } }))
                .rejects.toThrow('Browser launch failed');
        });

        test('returns steps on successful flow', async () => {
            // Mock: launch → navigate → captcha_detect → click → fill → screenshot
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b1', mode: 'headless' } }) // launch
                .mockResolvedValueOnce({ success: true, result: { title: 'Job Page' } }) // navigate
                .mockResolvedValueOnce({ success: true, result: { type: 'none' } }) // captcha_detect
                .mockResolvedValueOnce({ success: false }) // click apply (not found)
                .mockResolvedValue({ success: false }); // fill attempts

            const result = await handler({
                url: 'https://example.com/job',
                profile: { basic: 'Test User, NYC' },
                headless: true
            });

            expect(result.success).toBe(true);
            expect(result.browserId).toBe('b1');
            expect(result.steps.length).toBeGreaterThan(0);
            expect(result.steps[0].step).toBe('detect_platform');
            expect(result.steps[1].step).toBe('launch');
            expect(result.steps[2].step).toBe('navigate');
        });

        test('handles CAPTCHA detection and solving', async () => {
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b2', mode: 'headless' } })
                .mockResolvedValueOnce({ success: true, result: { title: 'Job' } })
                .mockResolvedValueOnce({ success: true, result: { type: 'cloudflare' } }) // captcha detected
                .mockResolvedValueOnce({ success: true, result: { solved: true, method: 'wait' } }) // solve
                .mockResolvedValueOnce({ success: false }) // click
                .mockResolvedValue({ success: false }); // fill

            const result = await handler({
                url: 'https://example.com/job',
                profile: { basic: 'Test' }
            });

            expect(result.success).toBe(true);
            const captchaStep = result.steps.find(s => s.step === 'captcha_detected');
            expect(captchaStep).toBeDefined();
            expect(captchaStep.type).toBe('cloudflare');
        });

        test('returns failure when navigation fails', async () => {
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b3', mode: 'headless' } })
                .mockResolvedValueOnce({ success: false, error: 'timeout' });

            const result = await handler({
                url: 'https://example.com/job',
                profile: { basic: 'Test' }
            });

            expect(result.success).toBe(false);
            expect(result.message).toContain('Failed to navigate');
        });

        test('closes browser on error', async () => {
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b4', mode: 'headless' } })
                .mockResolvedValueOnce({ success: true, result: { title: 'Page' } })
                .mockRejectedValueOnce(new Error('unexpected error'));

            await expect(handler({
                url: 'https://example.com/job',
                profile: { basic: 'Test' }
            })).rejects.toThrow('unexpected error');

            // Verify browser_close was called
            const closeCalls = toolServiceClient.executeTool.mock.calls
                .filter(c => c[0] === 'browser_close');
            expect(closeCalls.length).toBe(1);
            expect(closeCalls[0][1].browserId).toBe('b4');
        });
    });
});
