// utils.test.js — unit tests for server/utils.js

const fs = require('fs');

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn()
}));

const { createDirectoryIfNotExists, sleep, shortAddress, formatNumber } = require('./utils');

describe('utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ====== createDirectoryIfNotExists ======

    describe('createDirectoryIfNotExists', () => {
        it('creates directory when it does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            const result = createDirectoryIfNotExists('/tmp/new-dir');

            expect(fs.existsSync).toHaveBeenCalledWith('/tmp/new-dir');
            expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-dir', { recursive: true });
            expect(result).toBe('/tmp/new-dir');
        });

        it('does not create directory when it already exists', () => {
            fs.existsSync.mockReturnValue(true);

            const result = createDirectoryIfNotExists('/tmp/existing-dir');

            expect(fs.existsSync).toHaveBeenCalledWith('/tmp/existing-dir');
            expect(fs.mkdirSync).not.toHaveBeenCalled();
            expect(result).toBe('/tmp/existing-dir');
        });

        it('returns the directory path in both cases', () => {
            fs.existsSync.mockReturnValue(false);
            expect(createDirectoryIfNotExists('/a/b/c')).toBe('/a/b/c');

            fs.existsSync.mockReturnValue(true);
            expect(createDirectoryIfNotExists('/x/y/z')).toBe('/x/y/z');
        });

        it('passes recursive option to mkdirSync', () => {
            fs.existsSync.mockReturnValue(false);
            createDirectoryIfNotExists('/deep/nested/path');
            expect(fs.mkdirSync).toHaveBeenCalledWith('/deep/nested/path', { recursive: true });
        });
    });

    // ====== sleep ======

    describe('sleep', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('resolves after the specified time', async () => {
            const promise = sleep(1000);
            jest.advanceTimersByTime(1000);
            await expect(promise).resolves.toBeUndefined();
        });

        it('does not resolve before the specified time', async () => {
            let resolved = false;
            sleep(500).then(() => { resolved = true; });

            jest.advanceTimersByTime(499);
            await Promise.resolve(); // flush microtasks
            expect(resolved).toBe(false);

            jest.advanceTimersByTime(1);
            await Promise.resolve();
            // After flushing, the promise should be resolved
        });

        it('works with 0ms', async () => {
            const promise = sleep(0);
            jest.advanceTimersByTime(0);
            await expect(promise).resolves.toBeUndefined();
        });
    });

    // ====== shortAddress ======

    describe('shortAddress', () => {
        it('truncates a standard Ethereum address', () => {
            const addr = '0x1234567890abcdef1234567890abcdef12345678';
            expect(shortAddress(addr)).toBe('0x1234...5678');
        });

        it('returns first 6 chars + ... + last 4 chars', () => {
            const addr = '0xABCDEF0000000000000000000000000000009999';
            expect(shortAddress(addr)).toBe('0xABCD...9999');
        });

        it('works with short strings', () => {
            // Even with a 10-char string it should still produce the format
            const addr = '0x12345678';
            expect(shortAddress(addr)).toBe('0x1234...5678');
        });

        it('preserves case', () => {
            const addr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
            const result = shortAddress(addr);
            expect(result).toBe('0xAbCd...Ef12');
            expect(result.endsWith('Ef12')).toBe(true);
            expect(result.startsWith('0xAbCd')).toBe(true);
        });
    });

    // ====== formatNumber ======

    describe('formatNumber', () => {
        it('formats numbers >= 1 with 2 decimal places', () => {
            expect(formatNumber(1)).toBe('1.00');
            expect(formatNumber(100)).toBe('100.00');
            expect(formatNumber(1.5)).toBe('1.50');
            expect(formatNumber(1234.5678)).toBe('1234.57');
        });

        it('formats numbers < 1 with 4 significant digits', () => {
            expect(formatNumber(0.5)).toBe('0.5000');
            expect(formatNumber(0.001234)).toBe('0.001234');
            expect(formatNumber(0.00009876)).toBe('0.00009876');
        });

        it('formats 0 with toPrecision(4)', () => {
            // 0 < 1, so toPrecision(4) is used
            expect(formatNumber(0)).toBe('0.000');
        });

        it('formats negative numbers < 1', () => {
            // -0.5 < 1, so toPrecision is used
            expect(formatNumber(-0.5)).toBe('-0.5000');
        });

        it('formats exact boundary value 1 with toFixed(2)', () => {
            expect(formatNumber(1)).toBe('1.00');
        });

        it('handles string-like numeric input', () => {
            // Number() coercion happens inside the function
            expect(formatNumber('5.123')).toBe('5.12');
            expect(formatNumber('0.123')).toBe('0.1230');
        });
    });
});
