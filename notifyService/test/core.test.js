'use strict';

const channelRegistry = require('../lib/channelRegistry');
const rateLimiter = require('../lib/rateLimiter');
const telegram = require('../lib/channels/telegram');
const feishu = require('../lib/channels/feishu');

describe('channelRegistry', () => {
    beforeEach(() => {
        channelRegistry.clear();
        // Register mock adapters
        channelRegistry.registerAdapter('telegram', {
            send: async () => ({ messageId: 'tg_123' }),
            parseWebhook: telegram.parseWebhook
        });
        channelRegistry.registerAdapter('feishu', {
            send: async () => ({ messageId: 'fs_456' }),
            parseWebhook: feishu.parseWebhook
        });
    });

    it('registers and retrieves adapters', () => {
        expect(channelRegistry.getAdapter('telegram')).toBeTruthy();
        expect(channelRegistry.getAdapter('feishu')).toBeTruthy();
        expect(channelRegistry.getAdapter('whatsapp')).toBeNull();
    });

    it('adds and lists channels', () => {
        const ch = channelRegistry.add('telegram', { botToken: 'x', chatId: '1' });
        expect(ch.id).toMatch(/^ch_/);
        expect(ch.type).toBe('telegram');
        expect(ch.enabled).toBe(true);
        expect(channelRegistry.list()).toHaveLength(1);
    });

    it('removes channels', () => {
        const ch = channelRegistry.add('telegram', { botToken: 'x', chatId: '1' });
        expect(channelRegistry.remove(ch.id)).toBe(true);
        expect(channelRegistry.list()).toHaveLength(0);
    });

    it('rejects unknown channel types', () => {
        expect(() => channelRegistry.add('whatsapp', {})).toThrow('Unknown channel type');
    });

    it('enables/disables channels', () => {
        const ch = channelRegistry.add('telegram', { botToken: 'x', chatId: '1' });
        channelRegistry.setEnabled(ch.id, false);
        expect(channelRegistry.get(ch.id).enabled).toBe(false);
    });
});

describe('rateLimiter', () => {
    beforeEach(() => {
        rateLimiter.reset();
    });

    it('allows messages within limit', () => {
        rateLimiter.configure({ maxTokens: 3, refillMs: 60000 });
        expect(rateLimiter.allow('ch1')).toBe(true);
        expect(rateLimiter.allow('ch1')).toBe(true);
        expect(rateLimiter.allow('ch1')).toBe(true);
        expect(rateLimiter.allow('ch1')).toBe(false); // exhausted
    });

    it('tracks per-channel independently', () => {
        rateLimiter.configure({ maxTokens: 1, refillMs: 60000 });
        expect(rateLimiter.allow('ch1')).toBe(true);
        expect(rateLimiter.allow('ch2')).toBe(true);
        expect(rateLimiter.allow('ch1')).toBe(false);
    });

    it('reports remaining tokens', () => {
        rateLimiter.configure({ maxTokens: 5, refillMs: 60000 });
        rateLimiter.allow('ch1');
        rateLimiter.allow('ch1');
        expect(rateLimiter.remaining('ch1')).toBe(3);
    });
});

describe('telegram.parseWebhook', () => {
    it('parses callback_query', () => {
        const parsed = telegram.parseWebhook({
            callback_query: {
                from: { id: 123 },
                message: { message_id: 456 },
                data: 'task:t1:resolve:relogin'
            }
        });
        expect(parsed.type).toBe('callback');
        expect(parsed.userId).toBe('123');
        expect(parsed.callbackData).toBe('task:t1:resolve:relogin');
    });

    it('parses text message', () => {
        const parsed = telegram.parseWebhook({
            message: { from: { id: 789 }, message_id: 100, text: '/resume' }
        });
        expect(parsed.type).toBe('message');
        expect(parsed.text).toBe('/resume');
    });

    it('returns null for unknown format', () => {
        expect(telegram.parseWebhook({ update_id: 1 })).toBeNull();
    });
});

describe('feishu.parseWebhook', () => {
    it('parses challenge verification', () => {
        const parsed = feishu.parseWebhook({ challenge: 'abc123' });
        expect(parsed.type).toBe('challenge');
        expect(parsed.challenge).toBe('abc123');
    });

    it('parses card action callback', () => {
        const parsed = feishu.parseWebhook({
            action: { value: { callback: 'task:t1:resolve:skip_platform' } },
            operator: { user_id: 'u1' },
            token: 'msg_1'
        });
        expect(parsed.type).toBe('callback');
        expect(parsed.callbackData).toBe('task:t1:resolve:skip_platform');
    });

    it('parses message event', () => {
        const parsed = feishu.parseWebhook({
            event: {
                message: { message_id: 'm1', content: '{"text":"/status"}' },
                sender: { sender_id: { user_id: 'u2' } }
            }
        });
        expect(parsed.type).toBe('message');
        expect(parsed.text).toBe('/status');
    });
});
