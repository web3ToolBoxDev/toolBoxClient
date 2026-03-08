'use strict';

const { CAPTCHA_TYPES, registerAll } = require('../lib/captchaSolver');
const toolRegistry = require('../lib/toolRegistry');

describe('captchaSolver', () => {

    describe('CAPTCHA_TYPES', () => {
        test('has all expected types', () => {
            expect(CAPTCHA_TYPES.RECAPTCHA).toBe('recaptcha');
            expect(CAPTCHA_TYPES.HCAPTCHA).toBe('hcaptcha');
            expect(CAPTCHA_TYPES.CLOUDFLARE).toBe('cloudflare');
            expect(CAPTCHA_TYPES.IMAGE_TEXT).toBe('image_text');
            expect(CAPTCHA_TYPES.SLIDER).toBe('slider');
            expect(CAPTCHA_TYPES.NONE).toBe('none');
        });
    });

    describe('registerAll', () => {
        beforeEach(() => {
            toolRegistry.clear();
        });

        test('registers captcha_detect and captcha_solve tools', () => {
            registerAll();
            const tools = toolRegistry.list();
            const names = tools.map(t => t.name);
            expect(names).toContain('captcha_detect');
            expect(names).toContain('captcha_solve');
        });

        test('captcha_detect has correct category and required params', () => {
            registerAll();
            const tool = toolRegistry.list().find(t => t.name === 'captcha_detect');
            expect(tool.category).toBe('captcha');
            expect(tool.parameters.required).toEqual(['browserId']);
        });

        test('captcha_solve has correct category', () => {
            registerAll();
            const tool = toolRegistry.list().find(t => t.name === 'captcha_solve');
            expect(tool.category).toBe('captcha');
            expect(tool.parameters.required).toEqual(['browserId']);
        });
    });
});
