import { shortAddress, sleep, formatNumber, log } from './index';
import { eventEmitter } from './eventEmitter';

describe('utils/index', () => {
    it('shortAddress abbreviates address', () => {
        expect(shortAddress('0x1234567890abcdef')).toBe('0x1234...cdef');
    });

    it('sleep resolves after timeout', async () => {
        jest.useFakeTimers();
        const p = sleep(100);
        jest.advanceTimersByTime(100);
        await p;
        jest.useRealTimers();
    });

    it('formatNumber handles numbers less than 1', () => {
        expect(formatNumber(0.123456)).toBe('0.1235');
    });

    it('formatNumber handles numbers >= 1 with floor', () => {
        expect(formatNumber(3.567)).toBe(3.56);
        expect(formatNumber(1.999)).toBe(1.99);
    });

    it('log emits clientTaskMessage event', () => {
        const spy = jest.fn();
        eventEmitter.on('clientTaskMessage', spy);
        log('test message');
        expect(spy).toHaveBeenCalled();
        const arg = spy.mock.calls[0][0];
        expect(arg).toContain('test message');
        eventEmitter.off('clientTaskMessage', spy);
    });
});
