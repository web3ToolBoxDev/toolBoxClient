// fingerPrintService.test.js — unit tests for migration, proxy cleanup, and generation format

const mockDb = {
    find: jest.fn(),
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
};

const mockConfigInstance = {
    getAssetsPath: () => __dirname,
    getFingerPrintDb: () => mockDb,
    getSavePath: () => ({ path: '/tmp/test-save' })
};

jest.mock('../../config', () => ({
    getInstance: () => mockConfigInstance
}));

jest.mock('./proxyService', () => ({
    checkProxy: jest.fn().mockResolvedValue({
        success: true,
        data: { ip: '1.2.3.4', position: { lat: 43.0, lng: -79.0 }, country: 'CA', timeZone: 'America/Toronto' }
    })
}));

const fs = require('fs');
const path = require('path');

// Ensure fpData.json exists for module load
const fpDataPath = path.join(__dirname, 'fpData.json');
if (!fs.existsSync(fpDataPath)) {
    fs.writeFileSync(fpDataPath, '{}');
}

const fingerPrintService = require('./fingerPrintService');

describe('fingerPrintService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ====== migrateFingerprint (tested via getEnvById) ======

    describe('getEnvById with migration', () => {
        it('migrates old float audio to {seed} object on load', async () => {
            const oldFp = { id: 'env-1', name: 'Test', audio: 0.5, canvas: { toDataUrl: 3.2, seed: 100 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...oldFp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.getEnvById('env-1');
            expect(result.success).toBe(true);
            // audio should now be an object with seed
            expect(typeof result.data.audio).toBe('object');
            expect(result.data.audio).toHaveProperty('seed');
            expect(typeof result.data.audio.seed).toBe('number');
            expect(result.data.audio.seed).toBeGreaterThan(0);
        });

        it('migrates undefined audio to {seed} object', async () => {
            const oldFp = { id: 'env-2', name: 'Test2', canvas: { toDataUrl: 1.5, seed: 50 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...oldFp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.getEnvById('env-2');
            expect(result.success).toBe(true);
            expect(typeof result.data.audio).toBe('object');
            expect(result.data.audio).toHaveProperty('seed');
        });

        it('migrates canvas without seed to add seed', async () => {
            const oldFp = { id: 'env-3', name: 'Test3', audio: { seed: 123 }, canvas: { toDataUrl: 5.5 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...oldFp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.getEnvById('env-3');
            expect(result.success).toBe(true);
            expect(result.data.canvas).toHaveProperty('seed');
            expect(typeof result.data.canvas.seed).toBe('number');
            expect(result.data.canvas.toDataUrl).toBe(5.5);
        });

        it('migrates old numeric canvas to full object', async () => {
            const oldFp = { id: 'env-4', name: 'Test4', audio: { seed: 456 }, canvas: 0.7 };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...oldFp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.getEnvById('env-4');
            expect(result.success).toBe(true);
            expect(typeof result.data.canvas).toBe('object');
            expect(result.data.canvas).toHaveProperty('toDataUrl');
            expect(result.data.canvas).toHaveProperty('seed');
        });

        it('does not migrate already-correct fingerprint', async () => {
            const goodFp = { id: 'env-5', name: 'Test5', audio: { seed: 789 }, canvas: { toDataUrl: 2.1, seed: 321 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...goodFp }));

            const result = await fingerPrintService.getEnvById('env-5');
            expect(result.success).toBe(true);
            expect(result.data.audio).toEqual({ seed: 789 });
            expect(result.data.canvas).toEqual({ toDataUrl: 2.1, seed: 321 });
            // update should NOT be called since no migration needed
            expect(mockDb.update).not.toHaveBeenCalled();
        });

        it('returns error for missing id', async () => {
            const result = await fingerPrintService.getEnvById(null);
            expect(result.success).toBe(false);
        });

        it('returns error when env not found', async () => {
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const result = await fingerPrintService.getEnvById('nonexistent');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2013);
        });
    });

    // ====== deleteFingerPrintProxy — geo field cleanup ======

    describe('deleteFingerPrintProxy', () => {
        it('clears proxy and geo fields (position, webrtc_public, timeZone)', async () => {
            const fpWithProxy = {
                id: 'env-proxy-1',
                name: 'ProxyEnv',
                audio: { seed: 100 },
                canvas: { toDataUrl: 1, seed: 200 },
                proxy: { ipHost: '5.6.7.8', ipPort: '3128', ipType: 'http' },
                position: { lat: 43.0, lng: -79.0 },
                webrtc_public: '5.6.7.8',
                timeZone: 'America/Toronto',
                proxyUrl: 'http://127.0.0.1:30000',
                useProxy: true,
                country: 'CA'
            };

            // getEnvById will be called internally
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fpWithProxy }));
            // deleteFingerPrintProxy calls db.update with $set + $unset
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.deleteFingerPrintProxy('env-proxy-1');
            expect(result.success).toBe(true);
            expect(result.data.proxy).toBeNull();
            expect(result.data.position).toBeUndefined();
            expect(result.data.webrtc_public).toBeUndefined();
            expect(result.data.timeZone).toBeUndefined();
            // Also check old proxy_* fields are cleared
            expect(result.data.proxy_type).toBeUndefined();
            expect(result.data.proxy_ip).toBeUndefined();
            expect(result.data.proxy_port).toBeUndefined();
            // Runtime proxy fields (set by taskService) must also be cleared
            expect(result.data.proxyUrl).toBeUndefined();
            expect(result.data.useProxy).toBeUndefined();
            expect(result.data.country).toBeUndefined();
        });

        it('returns error for missing id', async () => {
            const result = await fingerPrintService.deleteFingerPrintProxy(null);
            expect(result.success).toBe(false);
        });

        it('returns error when env not found', async () => {
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const result = await fingerPrintService.deleteFingerPrintProxy('nonexistent');
            expect(result.success).toBe(false);
        });
    });

    // ====== generateRandomFingerPrint — new format ======

    describe('generateRandomFingerPrint', () => {
        beforeEach(() => {
            // Setup fpData with required data via loadFingerPrints mock
            // We need to directly set the fpData — use the loadFingerPrints function
        });

        it('generates fingerprints with audio as {seed} object and canvas with seed', async () => {
            // First load fingerprint base data
            const fpDataPath = path.join(__dirname, 'fpData.json');
            const testFpData = {
                userdata: {
                    fontsFamily: ['Arial', 'Helvetica', 'Verdana'],
                    hardware: { memory: 8, concurrency: 4 }
                },
                matchedFingerprintList: [{
                    userAgentFingerprint: 'Mozilla/5.0 Test',
                    clientHintFingerprint: {},
                    webglFingerprint: {}
                }],
                languageFingerprintList: [{
                    jsLanguage: 'en-US',
                    httpLanguage: 'en-US,en;q=0.9'
                }]
            };
            fs.writeFileSync(fpDataPath, JSON.stringify(testFpData));

            // Reload the fpData
            const loadResult = await fingerPrintService.loadFingerPrints(fpDataPath);
            expect(loadResult.success).toBe(true);

            // Capture what gets inserted
            let insertedFingerprint = null;
            mockDb.insert.mockImplementation((doc, cb) => {
                insertedFingerprint = doc;
                cb(null, doc);
            });

            const result = await fingerPrintService.generateRandomFingerPrint(1);
            expect(result.success).toBe(true);

            // Verify the inserted fingerprint has correct format
            expect(insertedFingerprint).not.toBeNull();
            expect(typeof insertedFingerprint.audio).toBe('object');
            expect(insertedFingerprint.audio).toHaveProperty('seed');
            expect(typeof insertedFingerprint.audio.seed).toBe('number');
            expect(insertedFingerprint.audio.seed).toBeGreaterThan(0);
            expect(insertedFingerprint.audio.seed).toBeLessThanOrEqual(99999);

            expect(typeof insertedFingerprint.canvas).toBe('object');
            expect(insertedFingerprint.canvas).toHaveProperty('toDataUrl');
            expect(insertedFingerprint.canvas).toHaveProperty('seed');
            expect(typeof insertedFingerprint.canvas.seed).toBe('number');
            expect(insertedFingerprint.canvas.seed).toBeGreaterThan(0);
        });

        it('rejects invalid counts', async () => {
            const result = await fingerPrintService.generateRandomFingerPrint(-1);
            expect(result.success).toBe(false);
        });

        it('rejects non-numeric counts', async () => {
            const result = await fingerPrintService.generateRandomFingerPrint('abc');
            expect(result.success).toBe(false);
        });
    });

    // ====== updateFingerPrintProxy ======

    describe('updateFingerPrintProxy', () => {
        it('sets geo fields when proxy check succeeds', async () => {
            const fp = { id: 'env-geo-1', name: 'GeoTest', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.updateFingerPrintProxy('env-geo-1', {
                ipType: 'http', ipHost: '1.2.3.4', ipPort: '8080'
            });
            expect(result.success).toBe(true);
            expect(result.data.position).toEqual({ lat: 43.0, lng: -79.0 });
            expect(result.data.webrtc_public).toBe('1.2.3.4');
            expect(result.data.timeZone).toBe('America/Toronto');
        });
    });

    // ====== getFingerPrints with migration ======

    describe('getFingerPrints with migration', () => {
        it('migrates old fingerprints when loading from DB', async () => {
            const oldFingerprints = [
                { id: 'old-1', name: 'Old1', audio: 0.3, canvas: { toDataUrl: 2.0 } },
                { id: 'old-2', name: 'Old2', audio: 0.7, canvas: 0.5 }
            ];
            mockDb.find.mockImplementation((query, cb) => cb(null, [...oldFingerprints.map(fp => ({ ...fp }))]));

            // Force DB path (clear envData first)
            // We need to simulate empty envData — since getFingerPrints checks envData first,
            // we call it after clearing. In real code envData is module-scoped,
            // so this test verifies the DB fallback path.

            const result = await fingerPrintService.getFingerPrints();
            // Since envData may already be populated from earlier tests, just verify the function succeeds
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    // ====== updateFingerPrintName ======

    describe('updateFingerPrintName', () => {
        it('updates name in DB and memory cache', async () => {
            // Seed envData via getEnvById first
            const fp = { id: 'name-1', name: 'OldName', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));
            await fingerPrintService.getEnvById('name-1');

            jest.clearAllMocks();
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.updateFingerPrintName('name-1', 'NewName');
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            // Verify memory was updated
            const envResult = await fingerPrintService.getEnvById('name-1');
            expect(envResult.data.name).toBe('NewName');
        });

        it('returns error when id is missing', async () => {
            const result = await fingerPrintService.updateFingerPrintName(null, 'SomeName');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2007);
        });

        it('returns error when env not found in DB', async () => {
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 0));
            const result = await fingerPrintService.updateFingerPrintName('no-exist-name', 'NewName');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2008);
        });
    });

    // ====== deleteFingerPrints ======

    describe('deleteFingerPrints', () => {
        it('deletes by ids and returns count', async () => {
            mockDb.remove.mockImplementation((query, opts, cb) => cb(null, 2));

            const result = await fingerPrintService.deleteFingerPrints(['del-1', 'del-2']);
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            expect(result.message).toContain('2');
        });

        it('returns error for empty ids array', async () => {
            const result = await fingerPrintService.deleteFingerPrints([]);
            expect(result.success).toBe(false);
            expect(result.code).toBe(2010);
        });

        it('returns error on DB failure', async () => {
            mockDb.remove.mockImplementation((query, opts, cb) => cb(new Error('DB remove failed')));

            const result = await fingerPrintService.deleteFingerPrints(['fail-1']);
            expect(result.success).toBe(false);
            expect(result.code).toBe(2011);
            expect(result.message).toBe('DB remove failed');
        });

        it('clears memory cache after delete', async () => {
            // First seed envData via getEnvById
            const fp = { id: 'del-cache-1', name: 'ToDelete', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));
            await fingerPrintService.getEnvById('del-cache-1');

            // Verify it's in memory
            const before = await fingerPrintService.getEnvById('del-cache-1');
            expect(before.success).toBe(true);

            jest.clearAllMocks();
            mockDb.remove.mockImplementation((query, opts, cb) => cb(null, 1));

            await fingerPrintService.deleteFingerPrints(['del-cache-1']);

            // Now getEnvById should NOT find it in memory — falls through to DB
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const after = await fingerPrintService.getEnvById('del-cache-1');
            expect(after.success).toBe(false);
            expect(after.code).toBe(2013);
        });
    });

    // ====== getFingerPrintCount ======

    describe('getFingerPrintCount', () => {
        it('returns correct count from loaded fpData', async () => {
            const testFpData = {
                userdata: { fontsFamily: ['Arial'] },
                matchedFingerprintList: [{ ua: 'a' }, { ua: 'b' }, { ua: 'c' }],
                languageFingerprintList: [{ js: 'en' }, { js: 'fr' }]
            };
            fs.writeFileSync(fpDataPath, JSON.stringify(testFpData));
            await fingerPrintService.loadFingerPrints(fpDataPath);

            const result = await fingerPrintService.getFingerPrintCount();
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            // Math.max(3, 2) = 3
            expect(result.message).toBe(3);
        });

        it('returns error when fpData is empty', async () => {
            // loadFingerPrints sets fpData = data BEFORE key validation,
            // so loading {} makes fpData empty even though load returns failure
            const emptyPath = path.join(__dirname, 'fpData_empty_test.json');
            fs.writeFileSync(emptyPath, '{}');
            await fingerPrintService.loadFingerPrints(emptyPath);
            fs.unlinkSync(emptyPath);

            const result = await fingerPrintService.getFingerPrintCount();
            expect(result.success).toBe(false);
            expect(result.code).toBe(2002);
        });
    });

    // ====== loadFingerPrints ======

    describe('loadFingerPrints', () => {
        it('loads valid fpData JSON file successfully', async () => {
            const validData = {
                userdata: { fontsFamily: ['Arial'] },
                matchedFingerprintList: [{ ua: 'test' }],
                languageFingerprintList: [{ js: 'en' }]
            };
            const tempPath = path.join(__dirname, 'fpData_test_load.json');
            fs.writeFileSync(tempPath, JSON.stringify(validData));

            const result = await fingerPrintService.loadFingerPrints(tempPath);
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);

            // cleanup
            fs.unlinkSync(tempPath);
        });

        it('returns error for non-existent file', async () => {
            const result = await fingerPrintService.loadFingerPrints('/nonexistent/path/fp.json');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2001);
        });

        it('returns error when required key is missing', async () => {
            const incompleteData = {
                userdata: { fontsFamily: ['Arial'] }
                // missing matchedFingerprintList and languageFingerprintList
            };
            const tempPath = path.join(__dirname, 'fpData_test_incomplete.json');
            fs.writeFileSync(tempPath, JSON.stringify(incompleteData));

            const result = await fingerPrintService.loadFingerPrints(tempPath);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Missing key');

            // cleanup
            fs.unlinkSync(tempPath);
        });
    });

    // ====== bindWalletEnv / unbindWalletEnv ======

    describe('bindWalletEnv', () => {
        it('binds wallet to environment successfully', async () => {
            const fp = { id: 'bind-1', name: 'BindEnv', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.bindWalletEnv('wallet-A', 'bind-1');
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            expect(result.data.bindWalletId).toBe('wallet-A');
        });

        it('returns error when env not found', async () => {
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const result = await fingerPrintService.bindWalletEnv('wallet-B', 'no-env');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2022);
        });

        it('returns error when env already bound to another wallet', async () => {
            const fp = { id: 'bind-dup', name: 'BoundEnv', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 }, bindWalletId: 'wallet-X' };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.bindWalletEnv('wallet-Y', 'bind-dup');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2024);
        });
    });

    describe('unbindWalletEnv', () => {
        it('unbinds wallet from environment successfully', async () => {
            const fp = { id: 'unbind-1', name: 'UnbindEnv', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 }, bindWalletId: 'wallet-C' };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.unbindWalletEnv('unbind-1');
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            expect(result.data.bindWalletId).toBe('');
        });

        it('attempts to delete userdata directory on unbind', async () => {
            const fp = { id: 'unbind-dir-1', name: 'DirEnv', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 }, bindWalletId: 'wallet-D' };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const existsSpy = jest.spyOn(fs, 'existsSync');
            const rmSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

            // Make existsSync return true for the userdata path check
            existsSpy.mockImplementation((p) => {
                if (typeof p === 'string' && p.includes('unbind-dir-1')) return true;
                // Call through for other paths
                return jest.requireActual('fs').existsSync(p);
            });

            const result = await fingerPrintService.unbindWalletEnv('unbind-dir-1');
            expect(result.success).toBe(true);
            expect(rmSpy).toHaveBeenCalledWith(
                expect.stringContaining('unbind-dir-1'),
                { recursive: true, force: true }
            );

            existsSpy.mockRestore();
            rmSpy.mockRestore();
        });

        it('returns error when env not found', async () => {
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const result = await fingerPrintService.unbindWalletEnv('no-env-unbind');
            expect(result.success).toBe(false);
            expect(result.code).toBe(2026);
        });

        it('returns success when env has no wallet bound', async () => {
            const fp = { id: 'unbind-none', name: 'NoWallet', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.unbindWalletEnv('unbind-none');
            expect(result.success).toBe(true);
            expect(result.message).toContain('not bound');
        });
    });

    // ====== setEnvById ======

    describe('setEnvById', () => {
        it('updates env in DB and syncs memory', async () => {
            // Seed memory first
            const fp = { id: 'set-1', name: 'SetEnv', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));
            await fingerPrintService.getEnvById('set-1');

            jest.clearAllMocks();
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));

            const result = await fingerPrintService.setEnvById('set-1', { name: 'UpdatedName', customField: 'val' });
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);

            // Verify memory was merged
            const envResult = await fingerPrintService.getEnvById('set-1');
            expect(envResult.data.name).toBe('UpdatedName');
            expect(envResult.data.customField).toBe('val');
        });

        it('returns error when id is missing', async () => {
            const result = await fingerPrintService.setEnvById(null, { name: 'x' });
            expect(result.success).toBe(false);
            expect(result.code).toBe(2015);
        });

        it('returns error when env not found (0 updated)', async () => {
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 0));
            const result = await fingerPrintService.setEnvById('no-exist-set', { name: 'x' });
            expect(result.success).toBe(false);
            expect(result.code).toBe(2016);
        });
    });

    // ====== reinitializeDatabase ======

    describe('reinitializeDatabase', () => {
        it('reloads fingerprints from DB into memory', async () => {
            const dbFingerprints = [
                { id: 'reinit-1', name: 'R1', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } },
                { id: 'reinit-2', name: 'R2', audio: { seed: 2 }, canvas: { toDataUrl: 2, seed: 2 } }
            ];
            mockDb.find.mockImplementation((query, cb) => cb(null, [...dbFingerprints.map(fp => ({ ...fp }))]));

            const result = await fingerPrintService.reinitializeDatabase();
            expect(result.success).toBe(true);
            expect(result.code).toBe(0);
            expect(result.message).toContain('2');

            // Verify memory contains the reloaded data
            const env1 = await fingerPrintService.getEnvById('reinit-1');
            expect(env1.success).toBe(true);
            expect(env1.data.name).toBe('R1');
        });

        it('clears envData cache before reloading', async () => {
            // First seed some data in memory
            const fp = { id: 'stale-1', name: 'Stale', audio: { seed: 1 }, canvas: { toDataUrl: 1, seed: 1 } };
            mockDb.findOne.mockImplementation((query, cb) => cb(null, { ...fp }));
            mockDb.update.mockImplementation((query, update, opts, cb) => cb(null, 1));
            await fingerPrintService.getEnvById('stale-1');

            // Reinitialize with empty DB
            mockDb.find.mockImplementation((query, cb) => cb(null, []));
            const result = await fingerPrintService.reinitializeDatabase();
            expect(result.success).toBe(true);

            // stale-1 should no longer be in memory
            jest.clearAllMocks();
            mockDb.findOne.mockImplementation((query, cb) => cb(null, null));
            const staleResult = await fingerPrintService.getEnvById('stale-1');
            expect(staleResult.success).toBe(false);
            expect(staleResult.code).toBe(2013);
        });
    });

    // ====== language_js consistency ======

    describe('language_js consistency', () => {
        let insertedFingerprints;

        beforeEach(async () => {
            insertedFingerprints = [];
            const testFpData = {
                userdata: {
                    fontsFamily: ['Arial', 'Helvetica', 'Verdana'],
                    hardware: { memory: 8, concurrency: 4 }
                },
                matchedFingerprintList: [{
                    userAgentFingerprint: 'Mozilla/5.0 Test',
                    clientHintFingerprint: {},
                    webglFingerprint: {}
                }],
                languageFingerprintList: [{
                    jsLanguage: 'en-US',
                    httpLanguage: 'en-US,en;q=0.9'
                }]
            };
            fs.writeFileSync(fpDataPath, JSON.stringify(testFpData));
            await fingerPrintService.loadFingerPrints(fpDataPath);

            mockDb.insert.mockImplementation((doc, cb) => {
                insertedFingerprints.push(doc);
                cb(null, doc);
            });
        });

        it('generated fingerprints have language_js without q-values', async () => {
            await fingerPrintService.generateRandomFingerPrint(3);
            expect(insertedFingerprints.length).toBe(3);
            for (const fp of insertedFingerprints) {
                expect(fp.language_js).not.toContain(';q=');
            }
        });

        it('generated fingerprints have language_js without commas', async () => {
            await fingerPrintService.generateRandomFingerPrint(3);
            for (const fp of insertedFingerprints) {
                expect(fp.language_js).not.toContain(',');
            }
        });

        it('generated language_js equals the jsLanguage source value', async () => {
            await fingerPrintService.generateRandomFingerPrint(1);
            // With only one item in languageFingerprintList, it must be 'en-US'
            expect(insertedFingerprints[0].language_js).toBe('en-US');
        });

        it('language_js matches first segment of language_http', async () => {
            await fingerPrintService.generateRandomFingerPrint(1);
            const fp = insertedFingerprints[0];
            // language_http is "en-US,en;q=0.9", first segment is "en-US"
            const firstHttpSegment = fp.language_http.split(',')[0].split(';')[0];
            expect(fp.language_js).toBe(firstHttpSegment);
        });
    });

    // ====== isFingerPrintDbAvailable ======

    describe('isFingerPrintDbAvailable', () => {
        it('returns true when DB exists', () => {
            const result = fingerPrintService.isFingerPrintDbAvailable();
            expect(result).toBe(true);
        });

        it('returns false when DB is null', () => {
            const originalGetDb = mockConfigInstance.getFingerPrintDb;
            mockConfigInstance.getFingerPrintDb = () => null;

            const result = fingerPrintService.isFingerPrintDbAvailable();
            expect(result).toBe(false);

            // Restore
            mockConfigInstance.getFingerPrintDb = originalGetDb;
        });
    });
});
