import useAgentStore, {
    getByPath,
    setByPath,
    deleteByPath,
    deepMerge,
    mergeByPath
} from './agentStore';

// Reset store before each test
beforeEach(() => {
    useAgentStore.getState().reset();
});

// ─── Helper unit tests ─────────────────────────────────────

describe('helper functions', () => {
    describe('getByPath', () => {
        it('returns nested value', () => {
            const obj = { a: { b: { c: 42 } } };
            expect(getByPath(obj, 'a.b.c')).toBe(42);
        });

        it('returns undefined for missing path', () => {
            expect(getByPath({ a: 1 }, 'a.b.c')).toBeUndefined();
        });

        it('returns root when path is empty', () => {
            const obj = { x: 1 };
            expect(getByPath(obj, '')).toBe(obj);
        });
    });

    describe('setByPath', () => {
        it('sets nested value immutably', () => {
            const obj = { a: { b: 1 } };
            const result = setByPath(obj, 'a.b', 2);
            expect(result.a.b).toBe(2);
            expect(obj.a.b).toBe(1); // original unchanged
        });

        it('creates intermediate objects', () => {
            const result = setByPath({}, 'a.b.c', 'hello');
            expect(result.a.b.c).toBe('hello');
        });
    });

    describe('deleteByPath', () => {
        it('deletes nested key immutably', () => {
            const obj = { a: { b: 1, c: 2 } };
            const result = deleteByPath(obj, 'a.b');
            expect(result.a.b).toBeUndefined();
            expect(result.a.c).toBe(2);
            expect(obj.a.b).toBe(1); // original unchanged
        });

        it('returns same structure if path does not exist', () => {
            const obj = { a: 1 };
            const result = deleteByPath(obj, 'x.y.z');
            expect(result.a).toBe(1);
        });
    });

    describe('deepMerge', () => {
        it('merges nested objects', () => {
            const target = { a: { b: 1, c: 2 } };
            const source = { a: { c: 3, d: 4 } };
            const result = deepMerge(target, source);
            expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
        });

        it('replaces arrays instead of merging', () => {
            const target = { list: [1, 2, 3] };
            const source = { list: [4, 5] };
            const result = deepMerge(target, source);
            expect(result.list).toEqual([4, 5]);
        });

        it('does not mutate target', () => {
            const target = { a: { b: 1 } };
            deepMerge(target, { a: { c: 2 } });
            expect(target.a.c).toBeUndefined();
        });
    });

    describe('mergeByPath', () => {
        it('merges partial object at path', () => {
            const obj = { agent: { session: { direction: { title: 'dev' } } } };
            const result = mergeByPath(obj, 'agent.session.direction', { salary: '100k' });
            expect(result.agent.session.direction).toEqual({ title: 'dev', salary: '100k' });
        });

        it('creates path if it does not exist', () => {
            const result = mergeByPath({}, 'a.b', { x: 1 });
            expect(result.a.b).toEqual({ x: 1 });
        });
    });
});

// ─── Store: applyPatch ─────────────────────────────────────

describe('useAgentStore — applyPatch', () => {
    it('set operation creates/updates a value', () => {
        const { applyPatch } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.direction.jobTitle', value: 'Engineer' });

        const state = useAgentStore.getState().agentState;
        expect(state.jobSeekAgent.s1.direction.jobTitle).toBe('Engineer');
    });

    it('merge operation deep-merges into existing state', () => {
        const { applyPatch } = useAgentStore.getState();
        // Set initial
        applyPatch({ op: 'set', path: 'agent.s1.profile', value: { name: 'Alice', age: 30 } });
        // Merge partial
        applyPatch({ op: 'merge', path: 'agent.s1.profile', value: { age: 31, city: 'NYC' } });

        const profile = useAgentStore.getState().agentState.agent.s1.profile;
        expect(profile).toEqual({ name: 'Alice', age: 31, city: 'NYC' });
    });

    it('delete operation removes a key', () => {
        const { applyPatch } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'agent.s1.temp', value: 'remove-me' });
        expect(useAgentStore.getState().agentState.agent.s1.temp).toBe('remove-me');

        applyPatch({ op: 'delete', path: 'agent.s1.temp' });
        expect(useAgentStore.getState().agentState.agent.s1.temp).toBeUndefined();
    });

    it('ignores invalid patch (no op)', () => {
        const before = useAgentStore.getState().agentState;
        useAgentStore.getState().applyPatch({ path: 'a.b', value: 1 });
        expect(useAgentStore.getState().agentState).toEqual(before);
    });

    it('ignores invalid patch (no path)', () => {
        const before = useAgentStore.getState().agentState;
        useAgentStore.getState().applyPatch({ op: 'set', value: 1 });
        expect(useAgentStore.getState().agentState).toEqual(before);
    });

    it('ignores unknown op', () => {
        useAgentStore.getState().applyPatch({ op: 'set', path: 'a.b', value: 1 });
        const before = { ...useAgentStore.getState().agentState };
        useAgentStore.getState().applyPatch({ op: 'unknown', path: 'a.b', value: 99 });
        expect(useAgentStore.getState().agentState).toEqual(before);
    });

    it('handles multiple sequential patches', () => {
        const { applyPatch } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'a.s1.x', value: 1 });
        applyPatch({ op: 'set', path: 'a.s1.y', value: 2 });
        applyPatch({ op: 'set', path: 'a.s2.x', value: 3 });

        const state = useAgentStore.getState().agentState;
        expect(state.a.s1.x).toBe(1);
        expect(state.a.s1.y).toBe(2);
        expect(state.a.s2.x).toBe(3);
    });
});

// ─── Store: applySnapshot ──────────────────────────────────

describe('useAgentStore — applySnapshot', () => {
    it('replaces full state for an agent', () => {
        const { applyPatch, applySnapshot } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'agent.s1.old', value: 'data' });

        const snapshot = { s1: { direction: { title: 'New' } }, s2: { profile: { name: 'Bob' } } };
        applySnapshot('agent', snapshot);

        const state = useAgentStore.getState().agentState;
        expect(state.agent).toEqual(snapshot);
        expect(state.agent.s1.old).toBeUndefined();
    });

    it('does not affect other agents', () => {
        const { applyPatch, applySnapshot } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'agentA.s1.x', value: 1 });
        applyPatch({ op: 'set', path: 'agentB.s1.y', value: 2 });

        applySnapshot('agentA', { s1: { x: 99 } });

        const state = useAgentStore.getState().agentState;
        expect(state.agentA.s1.x).toBe(99);
        expect(state.agentB.s1.y).toBe(2);
    });

    it('handles null snapshot by setting empty object', () => {
        const { applyPatch, applySnapshot } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'agent.s1.x', value: 1 });
        applySnapshot('agent', null);
        expect(useAgentStore.getState().agentState.agent).toEqual({});
    });

    it('ignores call with empty agentId', () => {
        const { applyPatch, applySnapshot } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'a.b', value: 1 });
        const before = { ...useAgentStore.getState().agentState };
        applySnapshot('', { x: 1 });
        expect(useAgentStore.getState().agentState).toEqual(before);
    });
});

// ─── Store: selectors ──────────────────────────────────────

describe('useAgentStore — selectors', () => {
    beforeEach(() => {
        const { applyPatch } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.direction', value: { jobTitle: 'Engineer', salary: '100k' } });
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.profile', value: { name: 'Alice' } });
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.platforms', value: ['linkedin', 'indeed'] });
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.env', value: { browser: 'chrome1' } });
        applyPatch({ op: 'set', path: 'jobSeekAgent.s1.subtasks', value: [{ id: 't1', status: 'done' }] });
    });

    it('getDirection returns direction for session', () => {
        expect(useAgentStore.getState().getDirection('s1')).toEqual({ jobTitle: 'Engineer', salary: '100k' });
    });

    it('getProfile returns profile for session', () => {
        expect(useAgentStore.getState().getProfile('s1')).toEqual({ name: 'Alice' });
    });

    it('getPlatforms returns platforms for session', () => {
        expect(useAgentStore.getState().getPlatforms('s1')).toEqual(['linkedin', 'indeed']);
    });

    it('getEnv returns env for session', () => {
        expect(useAgentStore.getState().getEnv('s1')).toEqual({ browser: 'chrome1' });
    });

    it('getSubtasks returns subtasks for session', () => {
        expect(useAgentStore.getState().getSubtasks('s1')).toEqual([{ id: 't1', status: 'done' }]);
    });

    it('selectors return undefined for non-existent session', () => {
        expect(useAgentStore.getState().getDirection('nonexistent')).toBeUndefined();
        expect(useAgentStore.getState().getProfile('nonexistent')).toBeUndefined();
        expect(useAgentStore.getState().getPlatforms('nonexistent')).toBeUndefined();
        expect(useAgentStore.getState().getEnv('nonexistent')).toBeUndefined();
        expect(useAgentStore.getState().getSubtasks('nonexistent')).toBeUndefined();
    });
});

// ─── Store: reset ──────────────────────────────────────────

describe('useAgentStore — reset', () => {
    it('clears all state', () => {
        const { applyPatch, reset } = useAgentStore.getState();
        applyPatch({ op: 'set', path: 'a.b', value: 1 });
        applyPatch({ op: 'set', path: 'c.d', value: 2 });

        reset();
        expect(useAgentStore.getState().agentState).toEqual({});
    });
});
