'use strict';

const { buildBlock, getReason, listReasons, REASONS } = require('./humanCatalog');

describe('humanCatalog', () => {
    describe('buildBlock', () => {
        it('builds login_required block in English', () => {
            const block = buildBlock('login_required', { platform: 'LinkedIn', taskId: 't1' }, 'en');
            expect(block.reason).toBe('login_required');
            expect(block.platform).toBe('LinkedIn');
            expect(block.message).toContain('LinkedIn');
            expect(block.message).toContain('expired');
            expect(block.title).toContain('Login Expired');
            expect(block.actions.length).toBeGreaterThan(0);
            expect(block.actions[0].callback).toContain('task:t1:resolve:');
            expect(block.autoTimeout).toBe(30 * 60 * 1000);
            expect(block.priority).toBe('high');
        });

        it('builds login_required block in Chinese', () => {
            const block = buildBlock('login_required', { platform: 'Indeed' }, 'zh-CN');
            expect(block.message).toContain('登录已过期');
            expect(block.title).toContain('登录过期');
        });

        it('builds captcha_manual block', () => {
            const block = buildBlock('captcha_manual', { source: 'Indeed' });
            expect(block.reason).toBe('captcha_manual');
            expect(block.message).toContain('CAPTCHA');
            expect(block.autoTimeout).toBe(10 * 60 * 1000);
        });

        it('builds apply_confirmation block with job count', () => {
            const block = buildBlock('apply_confirmation', { jobCount: 5 });
            expect(block.message).toContain('5 jobs');
            expect(block.priority).toBe('normal');
            expect(block.autoTimeout).toBe(24 * 60 * 60 * 1000);
        });

        it('builds ai_unavailable with provider', () => {
            const block = buildBlock('ai_unavailable', { attempts: 4, provider: 'Claude Code' });
            expect(block.message).toContain('4 attempts');
            expect(block.message).toContain('Claude Code');
        });

        it('builds browser_disconnected block', () => {
            const block = buildBlock('browser_disconnected', { platform: 'Indeed' });
            expect(block.message).toContain('disconnected');
            expect(block.severity).toBe('blocking');
        });

        it('throws on unknown reason', () => {
            expect(() => buildBlock('nonexistent')).toThrow('Unknown intervention reason');
        });

        it('falls back to English for unknown lang', () => {
            const block = buildBlock('login_required', { platform: 'X' }, 'fr');
            expect(block.message).toContain('expired'); // English fallback
        });
    });

    describe('getReason / listReasons', () => {
        it('returns reason definition', () => {
            const r = getReason('login_required');
            expect(r.severity).toBe('blocking');
            expect(r.autoTimeout).toBe(30 * 60 * 1000);
        });

        it('returns null for unknown', () => {
            expect(getReason('fake')).toBeNull();
        });

        it('lists all reasons', () => {
            const reasons = listReasons();
            expect(reasons).toContain('login_required');
            expect(reasons).toContain('captcha_manual');
            expect(reasons).toContain('browser_disconnected');
            expect(reasons.length).toBe(Object.keys(REASONS).length);
        });
    });
});
