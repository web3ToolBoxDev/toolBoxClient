/**
 * stateClient.test.js — Unit tests for StateClient (Agent SDK)
 *
 * Covers:
 *   - Proxy set triggers WS message
 *   - set / merge / batch methods
 *   - syncFromServer request/response
 *   - handleServerMessage updates local state
 */

const { StateClient } = require('./stateClient');

// ─── Mock WebSocket ────────────────────────────────────────

function createMockWs() {
    const sent = [];
    return {
        send: jest.fn((str) => {
            sent.push(JSON.parse(str));
        }),
        sent,
        /** Get last sent message */
        last() { return sent[sent.length - 1]; },
        /** Clear sent history */
        clear() { sent.length = 0; }
    };
}

// ─── Proxy Tests ───────────────────────────────────────────

describe('StateClient Proxy', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'test-agent');
    });

    test('setting a top-level property sends state_sync_set', () => {
        client.state.direction = { jobTitle: 'Engineer' };
        expect(ws.sent).toHaveLength(1);
        expect(ws.last()).toEqual({
            type: 'state_sync_set',
            agentName: 'test-agent',
            path: 'direction',
            value: { jobTitle: 'Engineer' }
        });
    });

    test('setting a primitive top-level property', () => {
        client.state.status = 'running';
        expect(ws.last().type).toBe('state_sync_set');
        expect(ws.last().path).toBe('status');
        expect(ws.last().value).toBe('running');
    });

    test('reading a property returns local value', () => {
        client.state.count = 42;
        expect(client.state.count).toBe(42);
    });

    test('deep property access returns raw value (no nested proxy)', () => {
        client.state.config = { a: { b: 1 } };
        ws.clear();
        // Reading deep property should not send any WS message
        const val = client.state.config.a.b;
        expect(val).toBe(1);
        expect(ws.sent).toHaveLength(0);
    });

    test('setting value is cloned (isolation)', () => {
        const obj = { x: 1 };
        client.state.data = obj;
        obj.x = 999;
        expect(client.state.data.x).toBe(1); // original mutation doesn't affect state
    });

    test('delete via proxy sends patch', () => {
        client.state.temp = 'hello';
        ws.clear();
        delete client.state.temp;
        expect(ws.last()).toEqual({
            type: 'state_sync_patch',
            agentName: 'test-agent',
            ops: [{ op: 'delete', path: 'temp' }]
        });
        expect(client.state.temp).toBeUndefined();
    });
});

// ─── set() Method ──────────────────────────────────────────

describe('StateClient.set()', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'agent1');
    });

    test('deep set sends state_sync_patch', () => {
        client.set('session.config.timeout', 5000);
        expect(ws.last()).toEqual({
            type: 'state_sync_patch',
            agentName: 'agent1',
            ops: [{ op: 'set', path: 'session.config.timeout', value: 5000 }]
        });
    });

    test('deep set updates local state', () => {
        client.set('a.b.c', 'deep');
        expect(client.state.a.b.c).toBe('deep');
    });

    test('set value is cloned', () => {
        const arr = [1, 2, 3];
        client.set('list', arr);
        arr.push(4);
        expect(client.state.list).toEqual([1, 2, 3]);
    });
});

// ─── merge() Method ────────────────────────────────────────

describe('StateClient.merge()', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'agent1');
    });

    test('merge sends state_sync_patch with op=merge', () => {
        client.set('config', { a: 1 });
        ws.clear();
        client.merge('config', { b: 2 });
        expect(ws.last()).toEqual({
            type: 'state_sync_patch',
            agentName: 'agent1',
            ops: [{ op: 'merge', path: 'config', partial: { b: 2 } }]
        });
    });

    test('merge updates local state', () => {
        client.set('config', { x: 1 });
        client.merge('config', { y: 2 });
        expect(client.state.config).toEqual({ x: 1, y: 2 });
    });

    test('merge on non-existent path creates it', () => {
        client.merge('newObj', { key: 'val' });
        expect(client.state.newObj).toEqual({ key: 'val' });
    });
});

// ─── batch() Method ────────────────────────────────────────

describe('StateClient.batch()', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'agent1');
    });

    test('batch collects multiple ops into single message', () => {
        client.batch(() => {
            client.set('a', 1);
            client.set('b', 2);
            client.merge('c', { d: 3 });
        });
        // Should send exactly 1 WS message (no per-op messages)
        expect(ws.sent).toHaveLength(1);
        expect(ws.last().type).toBe('state_sync_patch');
        expect(ws.last().ops).toHaveLength(3);
        expect(ws.last().ops[0]).toEqual({ op: 'set', path: 'a', value: 1 });
        expect(ws.last().ops[1]).toEqual({ op: 'set', path: 'b', value: 2 });
        expect(ws.last().ops[2]).toEqual({ op: 'merge', path: 'c', partial: { d: 3 } });
    });

    test('batch updates local state', () => {
        client.batch(() => {
            client.set('x', 10);
            client.set('y', 20);
        });
        expect(client.state.x).toBe(10);
        expect(client.state.y).toBe(20);
    });

    test('batch sends nothing if no ops', () => {
        client.batch(() => {
            // no ops
        });
        expect(ws.sent).toHaveLength(0);
    });

    test('proxy set inside batch is collected', () => {
        client.batch(() => {
            client.state.topLevel = 'hello';
            client.set('deep.path', 42);
        });
        expect(ws.sent).toHaveLength(1);
        expect(ws.last().ops).toHaveLength(2);
    });

    test('batch cleans up even if fn throws', () => {
        expect(() => {
            client.batch(() => {
                client.set('before', 1);
                throw new Error('oops');
            });
        }).toThrow('oops');
        // _batching should be reset
        client.set('after', 2);
        expect(ws.sent).toHaveLength(1); // only the 'after' set, batch ops were lost
        expect(ws.last().ops[0].path).toBe('after');
    });
});

// ─── syncFromServer() ──────────────────────────────────────

describe('StateClient.syncFromServer()', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'agent1');
    });

    test('sends state_sync_request message', () => {
        client.syncFromServer();
        expect(ws.last()).toEqual({
            type: 'state_sync_request',
            agentName: 'agent1'
        });
    });
});

// ─── handleServerMessage() ─────────────────────────────────

describe('StateClient.handleServerMessage()', () => {
    let ws, client;

    beforeEach(() => {
        ws = createMockWs();
        client = new StateClient(ws, 'agent1');
    });

    test('state_sync_response restores full state', () => {
        // Pre-set some local state
        client.state.old = 'data';
        ws.clear();

        client.handleServerMessage({
            type: 'state_sync_response',
            data: { direction: { jobTitle: 'Dev' }, status: 'ready' }
        });

        expect(client.state.direction).toEqual({ jobTitle: 'Dev' });
        expect(client.state.status).toBe('ready');
        expect(client.state.old).toBeUndefined(); // old data cleared
    });

    test('state_sync_response with empty data clears state', () => {
        client.state.x = 1;
        ws.clear();
        client.handleServerMessage({
            type: 'state_sync_response',
            data: {}
        });
        expect(client.state.x).toBeUndefined();
    });

    test('agent_state_patch with op=set updates state', () => {
        client.handleServerMessage({
            type: 'agent_state_patch',
            op: 'set',
            path: 'config.theme',
            value: 'dark'
        });
        expect(client.state.config.theme).toBe('dark');
    });

    test('agent_state_patch with op=merge updates state', () => {
        client.set('settings', { a: 1 });
        ws.clear();
        client.handleServerMessage({
            type: 'agent_state_patch',
            op: 'merge',
            path: 'settings',
            partial: { b: 2 }
        });
        expect(client.state.settings).toEqual({ a: 1, b: 2 });
    });

    test('agent_state_patch with op=delete removes key', () => {
        client.state.toRemove = 'bye';
        ws.clear();
        client.handleServerMessage({
            type: 'agent_state_patch',
            op: 'delete',
            path: 'toRemove'
        });
        expect(client.state.toRemove).toBeUndefined();
    });

    test('agent_state_patch delete deep path', () => {
        client.set('a.b.c', 'deep');
        ws.clear();
        client.handleServerMessage({
            type: 'agent_state_patch',
            op: 'delete',
            path: 'a.b.c'
        });
        expect(client.state.a.b.c).toBeUndefined();
        // Parent object should still exist
        expect(client.state.a.b).toBeDefined();
    });

    test('ignores messages with no type', () => {
        expect(() => client.handleServerMessage(null)).not.toThrow();
        expect(() => client.handleServerMessage({})).not.toThrow();
        expect(() => client.handleServerMessage({ foo: 'bar' })).not.toThrow();
    });

    test('ignores unknown message types', () => {
        expect(() => {
            client.handleServerMessage({ type: 'unknown_type', data: {} });
        }).not.toThrow();
    });
});

// ─── Edge Cases ────────────────────────────────────────────

describe('StateClient edge cases', () => {
    test('works with null ws (no crash)', () => {
        const client = new StateClient(null, 'agent1');
        expect(() => {
            client.state.x = 1;
            client.set('a.b', 2);
            client.merge('c', { d: 3 });
            client.syncFromServer();
        }).not.toThrow();
        // Local state still works
        expect(client.state.x).toBe(1);
    });

    test('works with ws that throws on send', () => {
        const badWs = {
            send: jest.fn(() => { throw new Error('connection closed'); })
        };
        const client = new StateClient(badWs, 'agent1');
        // Should not throw — error is caught internally
        expect(() => { client.state.val = 42; }).not.toThrow();
        expect(client.state.val).toBe(42);
    });
});
