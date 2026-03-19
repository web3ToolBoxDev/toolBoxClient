/**
 * stateService.test.js — Unit tests for StateService Phase 1 (Foundation)
 *
 * Covers:
 *   - Helper functions (getByPath, setByPath, deleteByPath, deepMerge, deepClone)
 *   - EventBus: emit/on/off, circular event log
 *   - StateStore: get/set/merge/delete with dot-paths, subscribe, snapshot/restore
 *   - Persistence: save/load, atomic write, debounce
 *   - StateService singleton: auto-load, auto-persist, AgentBridge stubs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock config before requiring stateService
const mockAgentPath = path.join(os.tmpdir(), 'stateService-test-' + Date.now());
jest.mock('../../config', () => ({
    getInstance: () => ({
        defaultAgentPath: mockAgentPath
    })
}));

const {
    StateService,
    EventBus,
    StateStore,
    Persistence,
    _helpers: { getByPath, setByPath, deleteByPath, deepMerge, deepClone }
} = require('./stateService');

// ─── Helpers ───────────────────────────────────────────────

describe('Helper functions', () => {
    describe('getByPath', () => {
        const obj = { a: { b: { c: 42 } }, x: [1, 2, 3] };

        test('returns nested value', () => {
            expect(getByPath(obj, 'a.b.c')).toBe(42);
        });

        test('returns undefined for non-existent path', () => {
            expect(getByPath(obj, 'a.b.z')).toBeUndefined();
        });

        test('returns undefined when traversing through non-object', () => {
            expect(getByPath(obj, 'a.b.c.d')).toBeUndefined();
        });

        test('returns root object for empty path', () => {
            expect(getByPath(obj, '')).toBe(obj);
        });

        test('returns array value', () => {
            expect(getByPath(obj, 'x')).toEqual([1, 2, 3]);
        });
    });

    describe('setByPath', () => {
        test('sets a nested value, creating intermediates', () => {
            const obj = {};
            setByPath(obj, 'a.b.c', 'hello');
            expect(obj.a.b.c).toBe('hello');
        });

        test('overwrites existing value', () => {
            const obj = { a: { b: 1 } };
            setByPath(obj, 'a.b', 2);
            expect(obj.a.b).toBe(2);
        });

        test('overwrites non-object intermediate', () => {
            const obj = { a: 'string' };
            setByPath(obj, 'a.b', 5);
            expect(obj.a.b).toBe(5);
        });
    });

    describe('deleteByPath', () => {
        test('deletes existing key', () => {
            const obj = { a: { b: { c: 1, d: 2 } } };
            expect(deleteByPath(obj, 'a.b.c')).toBe(true);
            expect(obj.a.b.c).toBeUndefined();
            expect(obj.a.b.d).toBe(2);
        });

        test('returns false for non-existent path', () => {
            const obj = { a: 1 };
            expect(deleteByPath(obj, 'x.y.z')).toBe(false);
        });

        test('returns false for non-existent key', () => {
            const obj = { a: { b: 1 } };
            expect(deleteByPath(obj, 'a.c')).toBe(false);
        });
    });

    describe('deepMerge', () => {
        test('merges nested objects', () => {
            const target = { a: { x: 1, y: 2 }, b: 3 };
            const source = { a: { y: 99, z: 100 }, c: 4 };
            deepMerge(target, source);
            expect(target).toEqual({ a: { x: 1, y: 99, z: 100 }, b: 3, c: 4 });
        });

        test('replaces arrays instead of merging', () => {
            const target = { arr: [1, 2, 3] };
            deepMerge(target, { arr: [4, 5] });
            expect(target.arr).toEqual([4, 5]);
        });

        test('replaces primitives', () => {
            const target = { a: 'old' };
            deepMerge(target, { a: 'new' });
            expect(target.a).toBe('new');
        });
    });

    describe('deepClone', () => {
        test('clones an object', () => {
            const obj = { a: { b: [1, 2] } };
            const clone = deepClone(obj);
            expect(clone).toEqual(obj);
            clone.a.b.push(3);
            expect(obj.a.b).toEqual([1, 2]); // original unaffected
        });

        test('returns undefined for undefined', () => {
            expect(deepClone(undefined)).toBeUndefined();
        });
    });
});

// ─── EventBus ──────────────────────────────────────────────

describe('EventBus', () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus(5); // small log for testing overflow
    });

    test('emits events and calls listeners', () => {
        const handler = jest.fn();
        bus.on('test', handler);
        bus.emit('test', { foo: 'bar' });
        expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });

    test('records events in log', () => {
        bus.emit('e1', 'data1');
        bus.emit('e2', 'data2');
        const log = bus.getLog();
        expect(log).toHaveLength(2);
        expect(log[0].event).toBe('e1');
        expect(log[0].data).toBe('data1');
        expect(log[1].event).toBe('e2');
    });

    test('circular log evicts oldest entries', () => {
        for (let i = 0; i < 7; i++) {
            bus.emit('ev', i);
        }
        const log = bus.getLog();
        expect(log).toHaveLength(5); // max is 5
        expect(log[0].data).toBe(2); // oldest surviving is index 2
        expect(log[4].data).toBe(6);
    });

    test('off removes listener', () => {
        const handler = jest.fn();
        bus.on('test', handler);
        bus.off('test', handler);
        bus.emit('test', 'ignored');
        expect(handler).not.toHaveBeenCalled();
    });

    test('clearLog empties the log', () => {
        bus.emit('x', 1);
        bus.clearLog();
        expect(bus.getLog()).toHaveLength(0);
    });

    test('log entries have timestamps', () => {
        const before = Date.now();
        bus.emit('ts', null);
        const after = Date.now();
        const entry = bus.getLog()[0];
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
        expect(entry.timestamp).toBeLessThanOrEqual(after);
    });
});

// ─── StateStore ────────────────────────────────────────────

describe('StateStore', () => {
    let bus, store;

    beforeEach(() => {
        bus = new EventBus();
        store = new StateStore(bus);
    });

    describe('get / set', () => {
        test('set and get a simple value', () => {
            store.set('agent1.name', 'TestAgent');
            expect(store.get('agent1.name')).toBe('TestAgent');
        });

        test('set and get a nested value', () => {
            store.set('agent1.session.direction.jobTitle', 'Engineer');
            expect(store.get('agent1.session.direction.jobTitle')).toBe('Engineer');
            expect(store.get('agent1.session.direction')).toEqual({ jobTitle: 'Engineer' });
        });

        test('get returns deep clone (isolation)', () => {
            store.set('a.obj', { x: 1 });
            const v = store.get('a.obj');
            v.x = 999;
            expect(store.get('a.obj').x).toBe(1);
        });

        test('get returns undefined for non-existent path', () => {
            expect(store.get('nope.nada')).toBeUndefined();
        });
    });

    describe('merge', () => {
        test('deep merges an object at path', () => {
            store.set('a.config', { x: 1, y: 2 });
            store.merge('a.config', { y: 20, z: 30 });
            expect(store.get('a.config')).toEqual({ x: 1, y: 20, z: 30 });
        });

        test('merge on non-existent path creates the object', () => {
            store.merge('b.settings', { theme: 'dark' });
            expect(store.get('b.settings')).toEqual({ theme: 'dark' });
        });
    });

    describe('delete', () => {
        test('deletes an existing key', () => {
            store.set('a.b.c', 10);
            store.set('a.b.d', 20);
            expect(store.delete('a.b.c')).toBe(true);
            expect(store.get('a.b.c')).toBeUndefined();
            expect(store.get('a.b.d')).toBe(20);
        });

        test('returns false for non-existent key', () => {
            expect(store.delete('x.y.z')).toBe(false);
        });
    });

    describe('events on state changes', () => {
        test('set emits state.changed with path, value, oldValue', () => {
            const handler = jest.fn();
            bus.on('state.changed', handler);

            store.set('a.val', 'first');
            expect(handler).toHaveBeenCalledWith({
                path: 'a.val',
                value: 'first',
                oldValue: undefined
            });

            store.set('a.val', 'second');
            expect(handler).toHaveBeenCalledWith({
                path: 'a.val',
                value: 'second',
                oldValue: 'first'
            });
        });

        test('delete emits state.changed with value=undefined', () => {
            store.set('a.x', 5);
            const handler = jest.fn();
            bus.on('state.changed', handler);
            store.delete('a.x');
            expect(handler).toHaveBeenCalledWith({
                path: 'a.x',
                value: undefined,
                oldValue: 5
            });
        });

        test('merge emits state.changed', () => {
            store.set('a.obj', { x: 1 });
            const handler = jest.fn();
            bus.on('state.changed', handler);
            store.merge('a.obj', { y: 2 });
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0].path).toBe('a.obj');
            expect(handler.mock.calls[0][0].value).toEqual({ x: 1, y: 2 });
        });
    });

    describe('subscribe', () => {
        test('callback fires on matching path changes', () => {
            const cb = jest.fn();
            store.subscribe('agent1', cb);
            store.set('agent1.direction.jobTitle', 'Dev');
            expect(cb).toHaveBeenCalledTimes(1);
            expect(cb.mock.calls[0][0].path).toBe('agent1.direction.jobTitle');
        });

        test('callback does NOT fire for unrelated paths', () => {
            const cb = jest.fn();
            store.subscribe('agent1', cb);
            store.set('agent2.name', 'Other');
            expect(cb).not.toHaveBeenCalled();
        });

        test('unsubscribe stops callbacks', () => {
            const cb = jest.fn();
            const unsub = store.subscribe('a', cb);
            store.set('a.x', 1);
            expect(cb).toHaveBeenCalledTimes(1);
            unsub();
            store.set('a.y', 2);
            expect(cb).toHaveBeenCalledTimes(1); // no new call
        });

        test('parent subscribe fires when child path changes', () => {
            const cb = jest.fn();
            store.subscribe('a', cb);
            store.set('a.b.c', 'deep');
            expect(cb).toHaveBeenCalledTimes(1);
        });
    });

    describe('snapshot / restore', () => {
        test('snapshot returns deep clone of agent state', () => {
            store.set('myAgent.x', 1);
            store.set('myAgent.y', { nested: true });
            const snap = store.snapshot('myAgent');
            expect(snap).toEqual({ x: 1, y: { nested: true } });
            // Mutate snapshot, original unaffected
            snap.x = 999;
            expect(store.get('myAgent.x')).toBe(1);
        });

        test('snapshot returns {} for non-existent agent', () => {
            expect(store.snapshot('nonexistent')).toEqual({});
        });

        test('restore round-trip', () => {
            store.set('ag.a', 1);
            store.set('ag.b', { c: 2 });
            const snap = store.snapshot('ag');

            // Clear and restore
            store.delete('ag');
            store.restore('ag', snap);
            expect(store.get('ag.a')).toBe(1);
            expect(store.get('ag.b.c')).toBe(2);
        });

        test('restore emits state.changed', () => {
            const handler = jest.fn();
            bus.on('state.changed', handler);
            store.restore('newAgent', { foo: 'bar' });
            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                path: 'newAgent',
                value: { foo: 'bar' }
            }));
        });
    });
});

// ─── Persistence ───────────────────────────────────────────

describe('Persistence', () => {
    const testBase = path.join(os.tmpdir(), 'persistence-test-' + Date.now());
    let persistence;

    beforeEach(() => {
        persistence = new Persistence(testBase, 50); // 50ms debounce for fast tests
    });

    afterEach(() => {
        persistence.cancelAll();
    });

    afterAll(() => {
        // Clean up temp dir
        try { fs.rmSync(testBase, { recursive: true, force: true }); } catch (_) {}
    });

    test('getFilePath returns correct path', () => {
        const fp = persistence.getFilePath('job-seek');
        expect(fp).toBe(path.join(testBase, 'job-seek', 'data', 'state.json'));
    });

    test('load returns {} when file does not exist', () => {
        expect(persistence.load('nonexistent')).toEqual({});
    });

    test('saveNow + load round-trip', () => {
        const data = { session: { direction: { jobTitle: 'Dev' } } };
        persistence.saveNow('test-agent', data);
        const loaded = persistence.load('test-agent');
        expect(loaded).toEqual(data);
    });

    test('atomic write: .tmp file is cleaned up', () => {
        persistence.saveNow('atomic-test', { x: 1 });
        const tmpPath = persistence.getFilePath('atomic-test') + '.tmp';
        expect(fs.existsSync(tmpPath)).toBe(false);
    });

    test('scheduleSave debounces writes', (done) => {
        persistence.scheduleSave('debounce-test', { v: 1 });
        persistence.scheduleSave('debounce-test', { v: 2 });
        persistence.scheduleSave('debounce-test', { v: 3 });
        // After debounce window, only last value should be written
        setTimeout(() => {
            const loaded = persistence.load('debounce-test');
            expect(loaded).toEqual({ v: 3 });
            done();
        }, 120); // wait longer than 50ms debounce
    });

    test('cancelAll prevents pending writes', (done) => {
        persistence.scheduleSave('cancel-test', { data: 'should not persist' });
        persistence.cancelAll();
        setTimeout(() => {
            const loaded = persistence.load('cancel-test');
            expect(loaded).toEqual({});
            done();
        }, 120);
    });

    test('isLoaded tracks load state', () => {
        expect(persistence.isLoaded('fresh')).toBe(false);
        persistence.load('fresh');
        expect(persistence.isLoaded('fresh')).toBe(true);
    });
});

// ─── StateService (Singleton Integration) ──────────────────

describe('StateService', () => {
    beforeEach(() => {
        StateService._reset();
    });

    afterEach(() => {
        StateService._reset();
    });

    test('getInstance returns singleton', () => {
        const a = StateService.getInstance();
        const b = StateService.getInstance();
        expect(a).toBe(b);
    });

    test('get/set through service', () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.value', 42);
        expect(svc.get('testAgent.value')).toBe(42);
    });

    test('merge through service', () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.config', { a: 1 });
        svc.merge('testAgent.config', { b: 2 });
        expect(svc.get('testAgent.config')).toEqual({ a: 1, b: 2 });
    });

    test('delete through service', () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.temp', 'gone');
        expect(svc.delete('testAgent.temp')).toBe(true);
        expect(svc.get('testAgent.temp')).toBeUndefined();
    });

    test('snapshot and restore', () => {
        const svc = StateService.getInstance();
        svc.set('ag.x', 1);
        svc.set('ag.y', 2);
        const snap = svc.snapshot('ag');
        svc.delete('ag');
        svc.restore('ag', snap);
        expect(svc.get('ag.x')).toBe(1);
    });

    test('subscribe works through service', () => {
        const svc = StateService.getInstance();
        const cb = jest.fn();
        svc.subscribe('agent', cb);
        svc.set('agent.foo', 'bar');
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test('handleMessage stub does not throw', () => {
        const svc = StateService.getInstance();
        expect(() => svc.handleMessage('ag', { type: 'state_sync_set' })).not.toThrow();
    });

    test('broadcastToFrontend stub does not throw', () => {
        const svc = StateService.getInstance();
        expect(() => svc.broadcastToFrontend('ag', { op: 'set' })).not.toThrow();
    });

    test('flushAll does not throw on empty state', () => {
        const svc = StateService.getInstance();
        expect(() => svc.flushAll()).not.toThrow();
    });
});
