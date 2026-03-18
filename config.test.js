const path = require('path');

// Mock nedb before requiring Config
jest.mock('nedb', () => {
    return jest.fn().mockImplementation((opts) => ({
        _filename: opts?.filename,
        findOne: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
    }));
});

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(() => false),
    readFileSync: jest.fn(() => '{}'),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => []),
}));

const fs = require('fs');
const Datastore = require('nedb');

let Config;

beforeEach(() => {
    // Reset singleton before each test
    jest.isolateModules(() => {
        Config = require('./config');
    });
    // Also clear the static instance in case it leaked
    if (Config.instance) {
        Config.instance = null;
    }
    jest.clearAllMocks();
    // Default: no savePath.json found
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
});

describe('Config singleton', () => {
    it('getInstance() returns a Config instance', () => {
        const instance = Config.getInstance();
        expect(instance).toBeInstanceOf(Config);
    });

    it('getInstance() always returns the same instance', () => {
        const a = Config.getInstance();
        const b = Config.getInstance();
        expect(a).toBe(b);
    });

    it('new Config() returns existing instance if already created', () => {
        const a = new Config();
        const b = new Config();
        expect(a).toBe(b);
    });
});

describe('getIsBuild()', () => {
    it('returns the IS_BUILD value', () => {
        const instance = Config.getInstance();
        const val = instance.getIsBuild();
        expect(typeof val).toBe('boolean');
    });
});

describe('getAssetsPath()', () => {
    it('returns a string path', () => {
        const instance = Config.getInstance();
        const p = instance.getAssetsPath();
        expect(typeof p).toBe('string');
        expect(p).toContain('assets');
    });
});

describe('getDefaultExecPath()', () => {
    it('returns a path string', () => {
        const instance = Config.getInstance();
        const p = instance.getDefaultExecPath();
        expect(typeof p).toBe('string');
    });
});

describe('getSavePath() / setSavePath()', () => {
    it('getSavePath() returns no path when none configured', () => {
        const instance = Config.getInstance();
        const result = instance.getSavePath();
        expect(result.path).toBeFalsy();
    });

    it('setSavePath() updates savePath and creates databases', async () => {
        const instance = Config.getInstance();
        instance.loadDefaultTask = jest.fn();
        instance.refreshData = jest.fn().mockResolvedValue({ success: true });

        const callsBefore = Datastore.mock.calls.length;
        await instance.setSavePath('/test/save/path');

        expect(instance.getSavePath()).toEqual({ success: true, path: '/test/save/path' });
        // Should have created 3 new Datastore instances (wallet, task, fingerprint)
        const newCalls = Datastore.mock.calls.slice(callsBefore);
        expect(newCalls.length).toBe(3);
        const filenames = newCalls.map(c => c[0]?.filename);
        expect(filenames.some(f => f.includes('walletData.db'))).toBe(true);
        expect(filenames.some(f => f.includes('task.db'))).toBe(true);
        expect(filenames.some(f => f.includes('fingerPrint.db'))).toBe(true);
    });

    it('setSavePath() persists path to JSON file', async () => {
        const instance = Config.getInstance();
        instance.loadDefaultTask = jest.fn();
        instance.refreshData = jest.fn().mockResolvedValue({ success: true });

        await instance.setSavePath('/my/path');

        expect(fs.writeFileSync).toHaveBeenCalled();
        const writeCall = fs.writeFileSync.mock.calls.find(call =>
            call[1]?.includes('/my/path')
        );
        expect(writeCall).toBeTruthy();
    });
});

describe('getChromePath() / setChromePath()', () => {
    it('getChromePath() returns no path when none configured', () => {
        const instance = Config.getInstance();
        const result = instance.getChromePath();
        expect(result.path).toBeFalsy();
    });

    it('setChromePath() stores and retrieves chromePath', () => {
        const instance = Config.getInstance();
        instance.setChromePath('/usr/bin/chrome');
        const result = instance.getChromePath();
        expect(result).toEqual({ success: true, path: '/usr/bin/chrome' });
    });

    it('setChromePath() returns success', () => {
        const instance = Config.getInstance();
        const result = instance.setChromePath('/usr/bin/chrome');
        expect(result).toEqual({ success: true });
    });
});

describe('database getters', () => {
    it('getWalletDb() returns undefined when no savePath set', () => {
        const instance = Config.getInstance();
        expect(instance.getWalletDb()).toBeUndefined();
    });

    it('getTaskDb() returns undefined when no savePath set', () => {
        const instance = Config.getInstance();
        expect(instance.getTaskDb()).toBeUndefined();
    });

    it('getFingerPrintDb() returns undefined when no savePath set', () => {
        const instance = Config.getInstance();
        expect(instance.getFingerPrintDb()).toBeUndefined();
    });

    it('database getters return Datastore instances after setSavePath()', async () => {
        const instance = Config.getInstance();
        instance.loadDefaultTask = jest.fn();
        instance.refreshData = jest.fn().mockResolvedValue({ success: true });

        await instance.setSavePath('/test/db/path');

        expect(instance.getWalletDb()).toBeDefined();
        expect(instance.getTaskDb()).toBeDefined();
        expect(instance.getFingerPrintDb()).toBeDefined();
    });
});

describe('getConfigDir()', () => {
    it('returns APP_USER_DATA env var when set', () => {
        const orig = process.env.APP_USER_DATA;
        process.env.APP_USER_DATA = '/custom/config/dir';
        const instance = Config.getInstance();
        expect(instance.getConfigDir()).toBe('/custom/config/dir');
        if (orig !== undefined) {
            process.env.APP_USER_DATA = orig;
        } else {
            delete process.env.APP_USER_DATA;
        }
    });

    it('falls back to assetsPath when APP_USER_DATA is not set', () => {
        const orig = process.env.APP_USER_DATA;
        delete process.env.APP_USER_DATA;
        const instance = Config.getInstance();
        expect(instance.getConfigDir()).toBe(instance.getAssetsPath());
        if (orig !== undefined) {
            process.env.APP_USER_DATA = orig;
        }
    });
});

describe('_loadAllPathsFromJson()', () => {
    it('loads paths from savePath.json when it exists', () => {
        fs.existsSync.mockImplementation((p) => {
            if (typeof p === 'string' && p.endsWith('savePath.json')) return true;
            return false;
        });
        fs.readFileSync.mockReturnValue(JSON.stringify({ path: '/loaded/path', chromePath: '/loaded/chrome' }));

        const instance = Config.getInstance();
        const result = instance.getSavePath();
        expect(result.path).toBe('/loaded/path');
    });

    it('handles corrupted JSON gracefully', () => {
        fs.existsSync.mockImplementation((p) => {
            if (typeof p === 'string' && p.endsWith('savePath.json')) return true;
            return false;
        });
        fs.readFileSync.mockReturnValue('not-valid-json');

        // Should not throw
        expect(() => Config.getInstance()).not.toThrow();
    });
});

describe('_saveAllPathsToJson()', () => {
    it('creates config directory if it does not exist', () => {
        fs.existsSync.mockReturnValue(false);
        const instance = Config.getInstance();

        // Trigger a save
        instance.setChromePath('/test/chrome');

        // Should have tried to create directory
        expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('writes JSON to savePath.json', () => {
        const instance = Config.getInstance();
        instance.setChromePath('/test/chrome');

        const writeCall = fs.writeFileSync.mock.calls.find(call =>
            typeof call[0] === 'string' && call[0].endsWith('savePath.json')
        );
        expect(writeCall).toBeTruthy();
        const written = JSON.parse(writeCall[1]);
        expect(written.chromePath).toBe('/test/chrome');
    });
});

describe('getPlatform()', () => {
    it('returns the current platform', () => {
        const instance = Config.getInstance();
        const platform = instance.getPlatform();
        expect(['win32', 'darwin']).toContain(platform);
    });
});

describe('getDefaultScriptPath()', () => {
    it('joins relative path with default script directory', () => {
        const instance = Config.getInstance();
        const result = instance.getDefaultScriptPath('myScript.js');
        expect(result).toContain('scripts');
        expect(result).toContain('myScript.js');
    });
});

describe('getInstallerPath()', () => {
    it('returns failure when no installer configured', () => {
        fs.existsSync.mockReturnValue(false);
        const instance = Config.getInstance();
        const result = instance.getInstallerPath();
        expect(result.success).toBe(false);
    });

    it('returns assets installer when it exists', () => {
        const instance = Config.getInstance();
        fs.existsSync.mockImplementation((p) => {
            if (typeof p === 'string' && p.includes('mini_installer.exe')) return true;
            return false;
        });
        const result = instance.getInstallerPath();
        expect(result.success).toBe(true);
        expect(result.path).toContain('mini_installer.exe');
    });

    it('returns user-set installer path when configured', () => {
        const instance = Config.getInstance();
        instance.setInstallerPath('/custom/installer.exe');
        const result = instance.getInstallerPath();
        expect(result.success).toBe(true);
        expect(result.path).toBe('/custom/installer.exe');
    });
});
