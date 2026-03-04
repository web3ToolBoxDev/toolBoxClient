const normalizeLanguage = (language = '') => String(language || '').trim();

const pickLocalizedLabel = (taskI18n = {}, language = '') => {
    if (!taskI18n || typeof taskI18n !== 'object') {
        return '';
    }
    const lang = normalizeLanguage(language);
    if (lang && taskI18n[lang]) {
        return String(taskI18n[lang]).trim();
    }
    const base = lang.split('-')[0];
    if (base && taskI18n[base]) {
        return String(taskI18n[base]).trim();
    }
    return '';
};

export const resolveTaskDisplayName = (task = {}, options = {}) => {
    const language = normalizeLanguage(options?.language || options?.lang || '');
    const localized = pickLocalizedLabel(task?.taskI18n, language);
    if (localized) return localized;
    const defaultName = String(task?.taskName || '').trim();
    if (defaultName) return defaultName;
    const key = String(task?.taskKey || '').trim();
    return key || '';
};

