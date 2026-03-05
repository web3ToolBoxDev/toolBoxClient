const { extractText, stripDataUriPrefix } = require('./fileParser');

describe('fileParser', () => {
    describe('stripDataUriPrefix', () => {
        it('strips data URI prefix', () => {
            expect(stripDataUriPrefix('data:application/pdf;base64,AAAA')).toBe('AAAA');
        });

        it('returns raw base64 if no prefix', () => {
            expect(stripDataUriPrefix('AAAA')).toBe('AAAA');
        });

        it('handles empty/null input', () => {
            expect(stripDataUriPrefix('')).toBe('');
            expect(stripDataUriPrefix(null)).toBe('');
        });
    });

    describe('extractText', () => {
        it('extracts plain text from base64', async () => {
            const text = 'Hello, my name is Tom. I am a frontend developer.';
            const base64 = Buffer.from(text).toString('base64');
            const result = await extractText(base64, 'text/plain', 'resume.txt');
            expect(result.kind).toBe('text');
            expect(result.text).toBe(text);
        });

        it('extracts text from base64 with data URI prefix', async () => {
            const text = 'Resume content here';
            const dataUri = `data:text/plain;base64,${Buffer.from(text).toString('base64')}`;
            const result = await extractText(dataUri, 'text/plain', 'resume.txt');
            expect(result.kind).toBe('text');
            expect(result.text).toBe(text);
        });

        it('returns image kind with dataUri for image files', async () => {
            const fakeBase64 = 'iVBORw0KGgo=';
            const result = await extractText(fakeBase64, 'image/png', 'screenshot.png');
            expect(result.kind).toBe('image');
            expect(result.text).toBe('');
            expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
            expect(result.mimeType).toBe('image/png');
        });

        it('detects image by file extension when mime is generic', async () => {
            const result = await extractText('AAAA', 'application/octet-stream', 'photo.jpg');
            expect(result.kind).toBe('image');
            expect(result.mimeType).toBe('image/jpeg');
        });

        it('handles markdown files as text', async () => {
            const md = '# Resume\n\n- Skill: JavaScript';
            const base64 = Buffer.from(md).toString('base64');
            const result = await extractText(base64, 'text/markdown', 'resume.md');
            expect(result.kind).toBe('text');
            expect(result.text).toBe(md);
        });

        it('returns empty text for unknown binary formats', async () => {
            // Create a buffer with invalid UTF-8
            const buf = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0xff, 0xfe]);
            const base64 = buf.toString('base64');
            const result = await extractText(base64, 'application/octet-stream', 'data.bin');
            expect(result.kind).toBe('text');
        });
    });
});
