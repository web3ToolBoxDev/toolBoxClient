'use strict';

const { isProfileComplete } = require('./lib/prompts');

/**
 * Pure-function copies from agent.js (lines ~621 and ~1664).
 * These are not exported from agent.js, so we duplicate them here for testing.
 */

function sanitizeForMemory(text) {
    return text
        .replace(/^[-*\u2022\s]+/, '')                       // strip leading bullets/spaces
        .replace(/\*+/g, '')                                 // remove all asterisks (markdown bold/italic)
        .replace(/`/g, '')                                   // remove backticks (markdown code)
        .replace(/\.(?=js|ts|py|css|html|net|io)\b/gi, ' ') // .js/.ts etc → space (prevent period splitting)
        .replace(/\s{2,}/g, ' ')                             // collapse whitespace
        .trim();
}

function parseResumeSections(reply) {
    // Strategy 1: explicit [SECTION:xxx] markers
    const sections = {};
    const sectionRegex = /\[SECTION:(\w+)\]\s*([\s\S]*?)(?=\[SECTION:|\s*$)/gi;
    let match;
    while ((match = sectionRegex.exec(reply)) !== null) {
        const key = match[1].toLowerCase().trim();
        const content = match[2].trim();
        if (content) sections[key] = content;
    }
    if (Object.keys(sections).length >= 2) return sections;

    // Strategy 2: auto-detect from heading patterns (bold, colon, ##, etc.)
    const HEADING_MAP = [
        { pattern: /(?:name|full\s*name|姓名|联系|contact|location|地[点址]|电话|phone|email)/i, key: 'basic' },
        { pattern: /(?:skill|技[能术]|proficien|tech.*stack|工具|framework)/i, key: 'skills' },
        { pattern: /(?:experience|work|employment|工作|经[历验]|职[位业]|company|公司)/i, key: 'experience' },
        { pattern: /(?:education|学[历历]|degree|university|大学|college|school|学校)/i, key: 'education' },
        { pattern: /(?:highlight|certif|award|language|语言|证书|项目|project|other|其[他它]|亮点|objective|意向)/i, key: 'highlights' },
    ];

    const lines = reply.split('\n');
    let currentKey = 'basic';
    const autoSections = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect heading: "**Skills:**", "## Skills", "Skills:", "- **Skills**" etc.
        const isHeading = /^(?:#+\s*|[-*•]\s*)?(?:\*{1,2})?[\w\u4e00-\u9fff].*?(?:\*{1,2})?[:：]\s*$/i.test(trimmed)
            || /^#{1,3}\s+/.test(trimmed);

        if (isHeading) {
            for (const { pattern, key } of HEADING_MAP) {
                if (pattern.test(trimmed)) {
                    currentKey = key;
                    break;
                }
            }
            // Don't add the heading line itself to content (it's just a label)
            continue;
        }

        // Check if this line IS a heading+content combo like "Name: Zhang Ying"
        let matched = false;
        for (const { pattern, key } of HEADING_MAP) {
            if (pattern.test(trimmed)) {
                if (!autoSections[key]) autoSections[key] = '';
                autoSections[key] += (autoSections[key] ? '\n' : '') + trimmed;
                matched = true;
                currentKey = key;
                break;
            }
        }
        if (!matched) {
            if (!autoSections[currentKey]) autoSections[currentKey] = '';
            autoSections[currentKey] += (autoSections[currentKey] ? '\n' : '') + trimmed;
        }
    }

    // Use auto-detected sections if we got more than just 'basic'
    if (Object.keys(autoSections).length >= 2) return autoSections;

    // Final fallback: store everything as 'basic'
    if (reply.trim()) {
        return { basic: reply.trim() };
    }
    return {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseResumeSections', () => {
    test('parses explicit [SECTION:xxx] markers correctly', () => {
        const input = [
            '[SECTION:basic]',
            'John Doe, New York, john@example.com',
            '',
            '[SECTION:skills]',
            'JavaScript, React, Node.js',
            '',
            '[SECTION:experience]',
            'Software Engineer at Acme Corp (2020-2023)',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(result.basic).toBe('John Doe, New York, john@example.com');
        expect(result.skills).toBe('JavaScript, React, Node.js');
        expect(result.experience).toBe('Software Engineer at Acme Corp (2020-2023)');
    });

    test('auto-detects **Skills:** bold heading pattern', () => {
        const input = [
            'Name: Alice Smith',
            'Email: alice@test.com',
            '',
            '**Skills:**',
            'Python, Django, PostgreSQL',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(result).toHaveProperty('skills');
        expect(result.skills).toContain('Python');
    });

    test('auto-detects ## Education markdown heading', () => {
        const input = [
            'Name: Bob Lee',
            '',
            '## Education',
            'MIT, B.S. Computer Science, 2019',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(result).toHaveProperty('education');
        expect(result.education).toContain('MIT');
    });

    test('auto-detects Skills: colon heading', () => {
        const input = [
            'Name: Carol Xu',
            '',
            'Skills:',
            'TypeScript, Vue, AWS',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(result).toHaveProperty('skills');
        expect(result.skills).toContain('TypeScript');
    });

    test('auto-detects Chinese headings like 技能：', () => {
        const input = [
            '姓名：张三',
            '',
            '技能：',
            'Java, Spring Boot',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(result).toHaveProperty('skills');
        expect(result.skills).toContain('Java');
    });

    test('falls back to {basic: fullText} when no headings found', () => {
        const input = 'Just some plain text without any headings or structure';
        const result = parseResumeSections(input);
        expect(result).toEqual({ basic: input });
    });

    test('returns empty object for empty input', () => {
        expect(parseResumeSections('')).toEqual({});
        expect(parseResumeSections('   ')).toEqual({});
    });

    test('handles mixed heading styles in one resume', () => {
        const input = [
            '[SECTION:basic]',
            'Jane Doe, SF',
            '',
            '[SECTION:skills]',
            'Go, Kubernetes',
            '',
            '[SECTION:education]',
            'Stanford University',
        ].join('\n');

        const result = parseResumeSections(input);
        expect(Object.keys(result)).toEqual(
            expect.arrayContaining(['basic', 'skills', 'education'])
        );
        expect(result.basic).toBe('Jane Doe, SF');
        expect(result.skills).toBe('Go, Kubernetes');
        expect(result.education).toBe('Stanford University');
    });
});

describe('sanitizeForMemory', () => {
    test('strips leading bullets "- " and "* "', () => {
        expect(sanitizeForMemory('- bullet item')).toBe('bullet item');
        expect(sanitizeForMemory('* starred item')).toBe('starred item');
    });

    test('removes markdown bold **text** -> text', () => {
        expect(sanitizeForMemory('**bold text**')).toBe('bold text');
    });

    test('removes backticks', () => {
        expect(sanitizeForMemory('use `console.log`')).toBe('use console.log');
    });

    test('converts .js to " js"', () => {
        expect(sanitizeForMemory('Vue.js and Node.js')).toBe('Vue js and Node js');
    });

    test('collapses multiple spaces', () => {
        expect(sanitizeForMemory('too   many    spaces')).toBe('too many spaces');
    });

    test('trims whitespace', () => {
        expect(sanitizeForMemory('  padded  ')).toBe('padded');
    });
});

describe('isProfileComplete', () => {
    test('returns true when basic and skills present', () => {
        expect(isProfileComplete({ basic: 'info', skills: 'js' })).toBe(true);
    });

    test('returns false when only basic present', () => {
        expect(isProfileComplete({ basic: 'info' })).toBe(false);
    });

    test('returns false when empty', () => {
        expect(isProfileComplete({})).toBe(false);
    });

    test('returns true with extra sections beyond basic+skills', () => {
        expect(isProfileComplete({
            basic: 'info',
            skills: 'js',
            education: 'MIT',
            experience: 'Acme Corp',
        })).toBe(true);
    });
});
