/**
 * Preset question templates & prompt builders for the Job Seek AI Agent.
 * Phase 1: Onboarding questions that gate chat access until required answers are provided.
 */

const WORK_MODE_OPTIONS_ZH = [
    { id: 'remote', label: '远程' },
    { id: 'hybrid', label: '混合' },
    { id: 'onsite', label: '到岗' },
    { id: 'any', label: '不限' }
];

const WORK_MODE_OPTIONS_EN = [
    { id: 'remote', label: 'Remote' },
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'onsite', label: 'Onsite' },
    { id: 'any', label: 'Any' }
];

const getPresetQuestionTemplates = (isZh) => {
    if (isZh) {
        return [
            {
                id: 'q_job_title',
                type: 'input',
                inputType: 'text',
                text: '目标职位名称',
                placeholder: '例如：前端工程师',
                required: true
            },
            {
                id: 'q_location',
                type: 'input',
                inputType: 'text',
                text: '期望工作地点',
                placeholder: '例如：上海 / Toronto',
                required: true
            },
            {
                id: 'q_work_mode',
                text: '工作模式',
                options: WORK_MODE_OPTIONS_ZH,
                required: true
            },
            {
                id: 'q_salary',
                type: 'input',
                inputType: 'text',
                text: '目标年薪（K，可选）',
                placeholder: '例如 300',
                required: false
            },
            {
                id: 'q_upload_profile',
                type: 'upload',
                text: '上传简历（可选，PDF/DOC/图片/文本）',
                buttonLabel: '上传文件',
                allowMultiple: false,
                acceptKinds: ['pdf', 'doc', 'image', 'text'],
                maxSizeMB: 6,
                required: false
            }
        ];
    }
    return [
        {
            id: 'q_job_title',
            type: 'input',
            inputType: 'text',
            text: 'Target job title',
            placeholder: 'e.g. Frontend Engineer',
            required: true
        },
        {
            id: 'q_location',
            type: 'input',
            inputType: 'text',
            text: 'Preferred location',
            placeholder: 'e.g. Toronto / Shanghai',
            required: true
        },
        {
            id: 'q_work_mode',
            text: 'Work mode',
            options: WORK_MODE_OPTIONS_EN,
            required: true
        },
        {
            id: 'q_salary',
            type: 'input',
            inputType: 'text',
            text: 'Target annual salary in K (optional)',
            placeholder: 'e.g. 120',
            required: false
        },
        {
            id: 'q_upload_profile',
            type: 'upload',
            text: 'Upload resume (optional, PDF/DOC/image/text)',
            buttonLabel: 'Upload File',
            allowMultiple: false,
            acceptKinds: ['pdf', 'doc', 'image', 'text'],
            maxSizeMB: 6,
            required: false
        }
    ];
};

/**
 * Check if all required onboarding questions have been answered.
 */
const isOnboardingComplete = (selectedMap = {}, templates) => {
    const required = templates.filter(q => q.required && q.type !== 'upload');
    return required.every(q => {
        const v = String(selectedMap[q.id] || '').trim();
        return v.length > 0;
    });
};

/**
 * Check if user profile has at least basic + skills sections.
 */
const isProfileComplete = (profileSections = {}) => {
    return Boolean(profileSections.basic && profileSections.skills);
};

const defaultSubTasks = (now) => ([
    { key: 'onboarding', status: 'running', updatedAt: now },
    { key: 'profile', status: 'pending', updatedAt: now },
    { key: 'search', status: 'pending', updatedAt: now },
    { key: 'match', status: 'pending', updatedAt: now },
    { key: 'resume', status: 'pending', updatedAt: now },
    { key: 'coverLetter', status: 'pending', updatedAt: now }
]);

const buildPresetPrompt = (isZh, selectedMap = {}, questionTemplates) => ({
    text: isZh ? '请回答以下问题以开始求职' : 'Answer the following questions to start your job search',
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
        options.push({ id: 'attach_extract_pdf', label: isZh ? '提取PDF关键信息' : 'Extract PDF key points' });
    }
    if (kinds.includes('image')) {
        options.push({ id: 'attach_ocr_image', label: isZh ? '图片OCR识别' : 'Run OCR on image' });
    }
    if (kinds.includes('sheet')) {
        options.push({ id: 'attach_map_sheet', label: isZh ? '表格字段映射' : 'Map spreadsheet fields' });
    }
    if (kinds.includes('text') || kinds.includes('file')) {
        options.push({ id: 'attach_summarize', label: isZh ? '总结附件内容' : 'Summarize attachments' });
    }
    if (!options.length) return null;
    return {
        id: 'q_attachment_action',
        text: isZh ? '请选择附件处理方式' : 'Choose attachment processing action',
        options
    };
};

/**
 * System prompt for guided profile collection via chat.
 * Used when user skips resume upload and onboarding is complete.
 */
const buildProfileCollectionPrompt = (isZh, direction = {}) => {
    const jobTitle = direction.q_job_title || '';
    const location = direction.q_location || '';
    if (isZh) {
        return `你是一个专业的求职顾问。用户正在寻找 "${jobTitle}" 的职位（地点：${location || '不限'}）。
用户没有上传简历，请通过对话收集以下信息来帮助构建个人档案：

1. **基本信息** — 姓名、联系方式（邮箱/电话）
2. **技能列表** — 与目标职位相关的技术技能和软技能
3. **工作经历** — 公司、职位、时间段、主要职责和成就
4. **教育背景** — 学校、专业、学位、毕业时间

请逐步引导用户，每次只问一个类别的问题。使用友好的对话方式。
当收集到足够信息后（至少有基本信息和技能），用 [PROFILE_COMPLETE] 标记表示可以开始匹配。
用中文回复。`;
    }
    return `You are a professional career consultant. The user is looking for a "${jobTitle}" position (location: ${location || 'any'}).
The user did not upload a resume. Collect the following information through conversation to build their profile:

1. **Basic info** — Full name, contact info (email/phone)
2. **Skills** — Technical and soft skills relevant to the target role
3. **Work experience** — Company, role, duration, key responsibilities and achievements
4. **Education** — School, major, degree, graduation year

Guide the user step by step, asking about one category at a time. Be friendly and conversational.
When you have enough info (at least basic info and skills), mark with [PROFILE_COMPLETE] to indicate readiness for matching.
Reply in English.`;
};

/**
 * System prompt for onboarding phase.
 * AI guides user to provide: job title, location, work mode.
 * AI extracts structured answers from conversation and returns them as [ANSWER:xxx=yyy] markers.
 */
const buildOnboardingPrompt = (isZh, currentAnswers = {}) => {
    const missing = [];
    if (!currentAnswers.q_job_title) missing.push(isZh ? '目标职位名称' : 'target job title');
    if (!currentAnswers.q_location) missing.push(isZh ? '期望工作地点' : 'preferred location');
    if (!currentAnswers.q_work_mode) missing.push(isZh ? '工作模式（远程/混合/到岗/不限）' : 'work mode (remote/hybrid/onsite/any)');

    const answered = [];
    if (currentAnswers.q_job_title) answered.push(`Job title: ${currentAnswers.q_job_title}`);
    if (currentAnswers.q_location) answered.push(`Location: ${currentAnswers.q_location}`);
    if (currentAnswers.q_work_mode) answered.push(`Work mode: ${currentAnswers.q_work_mode}`);

    const answeredSection = answered.length
        ? (isZh ? `\n已收集的信息：${answered.join('，')}` : `\nAlready collected: ${answered.join(', ')}`)
        : '';

    if (isZh) {
        return `你是一个求职助手。用户刚创建了一个新的求职会话，需要先设定求职方向。${answeredSection}

还需要收集：${missing.join('、')}${!currentAnswers.q_salary ? '（可选：目标年薪K）' : ''}

请友好地引导用户提供以上信息。当用户在消息中提到相关信息时，提取并在回复末尾用以下格式标记：
[ANSWER:q_job_title=职位名称]
[ANSWER:q_location=地点]
[ANSWER:q_work_mode=remote|hybrid|onsite|any]
[ANSWER:q_salary=数字]

注意：工作模式必须是 remote、hybrid、onsite、any 之一。
每条标记单独一行，放在回复最后。如果用户一次给了多个信息，可以输出多个标记。
用中文回复。`;
    }
    return `You are a job search assistant. The user just created a new job search session and needs to set their direction.${answeredSection}

Still needed: ${missing.join(', ')}${!currentAnswers.q_salary ? ' (optional: target annual salary in K)' : ''}

Guide the user to provide this information in a friendly way. When the user mentions relevant info in their message, extract and mark at the END of your reply using:
[ANSWER:q_job_title=job title]
[ANSWER:q_location=location]
[ANSWER:q_work_mode=remote|hybrid|onsite|any]
[ANSWER:q_salary=number]

Note: work mode MUST be one of: remote, hybrid, onsite, any.
Each marker on its own line, at the very end of your reply. Multiple markers allowed if user provides multiple pieces of info.
Reply in the same language as the user.`;
};

module.exports = {
    getPresetQuestionTemplates,
    isOnboardingComplete,
    isProfileComplete,
    defaultSubTasks,
    buildPresetPrompt,
    buildAttachmentActionQuestion,
    buildProfileCollectionPrompt,
    buildOnboardingPrompt
};
