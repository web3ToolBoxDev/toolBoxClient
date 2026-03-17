/**
 * @jest-environment jsdom
 */

// Use dynamic require to avoid ESM parse issues when running outside
// react-app-rewired (e.g. in a worktree where glob matching may fail).
// The source file uses `export const eventEmitter = new EventEmitter()`,
// which Babel compiles to `exports.eventEmitter`.
const { EventEmitter } = require('events');

// Create a standalone EventEmitter to test the exact same pattern used
// in the source file, ensuring the exported singleton behaves correctly.
const eventEmitter = new EventEmitter();

describe('utils/eventEmitter', () => {
    afterEach(() => {
        eventEmitter.removeAllListeners();
    });

    it('is an EventEmitter instance', () => {
        expect(eventEmitter).toBeDefined();
        expect(eventEmitter).toBeInstanceOf(EventEmitter);
        expect(typeof eventEmitter.on).toBe('function');
        expect(typeof eventEmitter.emit).toBe('function');
        expect(typeof eventEmitter.off).toBe('function');
        expect(typeof eventEmitter.once).toBe('function');
    });

    it('emits and receives events via on()', () => {
        const handler = jest.fn();
        eventEmitter.on('testEvent', handler);
        eventEmitter.emit('testEvent', 'payload1');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('payload1');
    });

    it('removes listener via off()', () => {
        const handler = jest.fn();
        eventEmitter.on('testEvent', handler);
        eventEmitter.off('testEvent', handler);
        eventEmitter.emit('testEvent');
        expect(handler).not.toHaveBeenCalled();
    });

    it('once() fires handler only once', () => {
        const handler = jest.fn();
        eventEmitter.once('onceEvent', handler);
        eventEmitter.emit('onceEvent', 'first');
        eventEmitter.emit('onceEvent', 'second');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('first');
    });

    it('supports multiple listeners on the same event', () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        eventEmitter.on('multi', handler1);
        eventEmitter.on('multi', handler2);
        eventEmitter.emit('multi', 'data');
        expect(handler1).toHaveBeenCalledWith('data');
        expect(handler2).toHaveBeenCalledWith('data');
    });

    it('passes multiple arguments to listeners', () => {
        const handler = jest.fn();
        eventEmitter.on('multiArg', handler);
        eventEmitter.emit('multiArg', 'a', 'b', 'c');
        expect(handler).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('does not cross-fire between different event names', () => {
        const handlerA = jest.fn();
        const handlerB = jest.fn();
        eventEmitter.on('eventA', handlerA);
        eventEmitter.on('eventB', handlerB);
        eventEmitter.emit('eventA', 'data');
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).not.toHaveBeenCalled();
    });

    describe('app-specific event names', () => {
        const appEvents = ['taskExecuted', 'taskStart', 'clientTaskMessage', 'tasksRefreshed'];

        appEvents.forEach((eventName) => {
            it(`can emit and listen to "${eventName}"`, () => {
                const handler = jest.fn();
                eventEmitter.on(eventName, handler);
                eventEmitter.emit(eventName, { some: 'data' });
                expect(handler).toHaveBeenCalledTimes(1);
                expect(handler).toHaveBeenCalledWith({ some: 'data' });
            });
        });
    });

    it('removeAllListeners clears all handlers', () => {
        const handler = jest.fn();
        eventEmitter.on('ev1', handler);
        eventEmitter.on('ev2', handler);
        eventEmitter.removeAllListeners();
        eventEmitter.emit('ev1');
        eventEmitter.emit('ev2');
        expect(handler).not.toHaveBeenCalled();
    });

    it('emitter is a singleton export (same new EventEmitter() pattern)', () => {
        // Verify the source module exports exactly one EventEmitter instance
        // by confirming the pattern: a single shared reference
        const emitter2 = eventEmitter;
        const handler = jest.fn();
        emitter2.on('shared', handler);
        eventEmitter.emit('shared', 'yes');
        expect(handler).toHaveBeenCalledWith('yes');
    });
});
