/**
 * Preset question templates & prompt builders for the Job Seek AI Agent.
 * Extracted from example/ai_example.js so the agent entry script stays lean.
 */

const getPresetQuestionTemplates = (isZh) => {
    if (isZh) {
        return [
            {
                id: 'q_track',
                text: '\u8BF7\u9009\u62E9\u4F60\u5F53\u524D\u6C42\u804C\u4E3B\u65B9\u5411',
                options: [
                    { id: 'track_frontend', label: '\u524D\u7AEF\u5DE5\u7A0B\u5E08' },
                    { id: 'track_backend', label: '\u540E\u7AEF\u5DE5\u7A0B\u5E08' },
                    { id: 'track_fullstack', label: '\u5168\u6808\u5DE5\u7A0B\u5E08' }
                ]
            },
            {
                id: 'q_style',
                text: '\u8BF7\u9009\u62E9\u7B80\u5386\u98CE\u683C',
                options: [
                    { id: 'style_data', label: '\u6570\u636E\u5BFC\u5411\u578B' },
                    { id: 'style_story', label: '\u9879\u76EE\u53D9\u4E8B\u578B' },
                    { id: 'style_compact', label: '\u7B80\u6D01\u6458\u8981\u578B' }
                ]
            },
            {
                id: 'q_salary',
                type: 'input',
                inputType: 'number',
                text: '\u8BF7\u8F93\u5165\u76EE\u6807\u85AA\u8D44\uFF08K/\u6708\uFF09',
                placeholder: '\u4F8B\u5982 30'
            },
            {
                id: 'q_upload_profile',
                type: 'upload',
                text: '\u8BF7\u4E0A\u4F20\u7B80\u5386\u6216\u4F5C\u54C1\u96C6\uFF08\u53EF\u9009\uFF09',
                buttonLabel: '\u4E0A\u4F20\u6587\u4EF6',
                allowMultiple: false,
                acceptKinds: ['pdf', 'image', 'text'],
                maxSizeMB: 6
            },
            {
                id: 'q_next',
                text: '\u8BF7\u9009\u62E9\u4E0B\u4E00\u6B65\u64CD\u4F5C',
                options: [
                    { id: 'next_match', label: '\u8FDB\u884C\u5C97\u4F4D\u5339\u914D' },
                    { id: 'next_resume', label: '\u751F\u6210\u7B80\u5386\u8349\u7A3F' },
                    { id: 'next_cover', label: '\u751F\u6210\u6C42\u804C\u4FE1\u8349\u7A3F' }
                ]
            }
        ];
    }
    return [
        {
            id: 'q_track',
            text: 'Choose your primary job track',
            options: [
                { id: 'track_frontend', label: 'Frontend Engineer' },
                { id: 'track_backend', label: 'Backend Engineer' },
                { id: 'track_fullstack', label: 'Fullstack Engineer' }
            ]
        },
        {
            id: 'q_style',
            text: 'Choose resume style',
            options: [
                { id: 'style_data', label: 'Data-Oriented' },
                { id: 'style_story', label: 'Project Story' },
                { id: 'style_compact', label: 'Compact Summary' }
            ]
        },
        {
            id: 'q_salary',
            type: 'input',
            inputType: 'number',
            text: 'Input target monthly salary (K)',
            placeholder: 'e.g. 30'
        },
        {
            id: 'q_upload_profile',
            type: 'upload',
            text: 'Upload resume or portfolio (optional)',
            buttonLabel: 'Upload File',
            allowMultiple: false,
            acceptKinds: ['pdf', 'image', 'text'],
            maxSizeMB: 6
        },
        {
            id: 'q_next',
            text: 'Choose next action',
            options: [
                { id: 'next_match', label: 'Run Requirement Match' },
                { id: 'next_resume', label: 'Generate Resume Draft' },
                { id: 'next_cover', label: 'Generate Cover Letter Draft' }
            ]
        }
    ];
};

const defaultSubTasks = (now) => ([
    { key: 'profile', status: 'running', updatedAt: now },
    { key: 'search', status: 'pending', updatedAt: now },
    { key: 'match', status: 'pending', updatedAt: now },
    { key: 'resume', status: 'pending', updatedAt: now },
    { key: 'coverLetter', status: 'pending', updatedAt: now }
]);

const buildPresetPrompt = (isZh, selectedMap = {}, questionTemplates) => ({
    text: isZh ? '\u8BF7\u9009\u62E9\u9884\u8BBE\u95EE\u9898\u5E76\u56DE\u7B54' : 'Select preset questions and answer',
    attachmentPolicy: {
        maxSizeMB: 4,
        allowedKinds: ['image', 'pdf', 'doc', 'sheet', 'text']
    },
    questions: questionTemplates.map((q) => ({
        ...q,
        ...(Array.isArray(q.options) ? { selectedOptionId: selectedMap[q.id] || '' } : {}),
        ...((q.type === 'input' || q.type === 'number' || q.type === 'date') ? { answerValue: selectedMap[q.id] || '' } : {}),
        ...(q.type === 'upload' ? { uploaded: Boolean(selectedMap[q.id]) } : {})
    }))
});

const buildAttachmentActionQuestion = (isZh, kinds = []) => {
    if (!Array.isArray(kinds) || !kinds.length) return null;
    const options = [];
    if (kinds.includes('pdf')) {
        options.push({ id: 'attach_extract_pdf', label: isZh ? '\u63D0\u53D6PDF\u5173\u952E\u4FE1\u606F' : 'Extract PDF key points' });
    }
    if (kinds.includes('image')) {
        options.push({ id: 'attach_ocr_image', label: isZh ? '\u56FE\u7247OCR\u8BC6\u522B' : 'Run OCR on image' });
    }
    if (kinds.includes('sheet')) {
        options.push({ id: 'attach_map_sheet', label: isZh ? '\u8868\u683C\u5B57\u6BB5\u6620\u5C04' : 'Map spreadsheet fields' });
    }
    if (kinds.includes('text') || kinds.includes('file')) {
        options.push({ id: 'attach_summarize', label: isZh ? '\u603B\u7ED3\u9644\u4EF6\u5185\u5BB9' : 'Summarize attachments' });
    }
    if (!options.length) return null;
    return {
        id: 'q_attachment_action',
        text: isZh ? '\u8BF7\u9009\u62E9\u9644\u4EF6\u5904\u7406\u65B9\u5F0F' : 'Choose attachment processing action',
        options
    };
};

module.exports = {
    getPresetQuestionTemplates,
    defaultSubTasks,
    buildPresetPrompt,
    buildAttachmentActionQuestion
};
