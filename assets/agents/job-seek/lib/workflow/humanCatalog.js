'use strict';

/**
 * Human Intervention Catalog — defines all scenarios where workflow
 * tasks need human help, with message templates, actions, and timeouts.
 */

const REASONS = {
    login_required: {
        severity: 'blocking',
        notifyPriority: 'high',
        autoTimeout: 30 * 60 * 1000,  // 30 min
        actions: [
            { label: '🔑 Re-login', callback: 'relogin' },
            { label: '⏭ Skip platform', callback: 'skip_platform' }
        ],
        message: {
            'zh-CN': (ctx) => `${ctx.platform || '平台'} 登录已过期，需要重新登录。`,
            'en': (ctx) => `${ctx.platform || 'Platform'} session expired. Re-login needed.`
        },
        title: {
            'zh-CN': (ctx) => `登录过期 — ${ctx.platform || ''}`,
            'en': (ctx) => `Login Expired — ${ctx.platform || ''}`
        }
    },

    captcha_manual: {
        severity: 'blocking',
        notifyPriority: 'high',
        autoTimeout: 10 * 60 * 1000,  // 10 min
        actions: [
            { label: '✅ Solved', callback: 'solved' },
            { label: '⏭ Skip', callback: 'skip_source' }
        ],
        message: {
            'zh-CN': (ctx) => `${ctx.source || '网站'} 触发了人机验证，自动解决失败。请手动完成验证。`,
            'en': (ctx) => `${ctx.source || 'Website'} triggered a CAPTCHA challenge. Auto-solve failed. Please solve manually.`
        },
        title: {
            'zh-CN': (ctx) => `人机验证 — ${ctx.source || ''}`,
            'en': (ctx) => `CAPTCHA — ${ctx.source || ''}`
        }
    },

    tool_build_failed: {
        severity: 'blocking',
        notifyPriority: 'high',
        autoTimeout: 60 * 60 * 1000,  // 60 min
        actions: [
            { label: '🔄 Retry build', callback: 'retry_build' },
            { label: '⏭ Skip platform', callback: 'skip_platform' }
        ],
        message: {
            'zh-CN': (ctx) => `${ctx.platform || '平台'} 搜索脚本连续构建失败 ${ctx.attempts || 3} 次，需要人工介入。`,
            'en': (ctx) => `${ctx.platform || 'Platform'} search script build failed ${ctx.attempts || 3} times. Manual intervention needed.`
        },
        title: {
            'zh-CN': (ctx) => `脚本构建失败 — ${ctx.platform || ''}`,
            'en': (ctx) => `Build Failed — ${ctx.platform || ''}`
        }
    },

    apply_confirmation: {
        severity: 'confirmation',
        notifyPriority: 'normal',
        autoTimeout: 24 * 60 * 60 * 1000,  // 24 hours
        actions: [
            { label: '✅ Approve all', callback: 'approve_all' },
            { label: '📋 Review', callback: 'review' },
            { label: '❌ Cancel', callback: 'cancel' }
        ],
        message: {
            'zh-CN': (ctx) => `${ctx.jobCount || 0} 个职位已准备好投递，确认？`,
            'en': (ctx) => `${ctx.jobCount || 0} jobs ready to apply. Confirm?`
        },
        title: {
            'zh-CN': () => '投递确认',
            'en': () => 'Apply Confirmation'
        }
    },

    ai_unavailable: {
        severity: 'degraded',
        notifyPriority: 'normal',
        autoTimeout: 15 * 60 * 1000,  // 15 min
        actions: [
            { label: '🔄 Retry', callback: 'retry' },
            { label: '🔀 Switch provider', callback: 'switch_provider' },
            { label: '❌ Cancel', callback: 'cancel' }
        ],
        message: {
            'zh-CN': (ctx) => `AI 服务连续 ${ctx.attempts || 3} 次不可用（${ctx.provider || ''}）。`,
            'en': (ctx) => `AI provider unavailable after ${ctx.attempts || 3} attempts (${ctx.provider || ''}).`
        },
        title: {
            'zh-CN': () => 'AI 服务不可用',
            'en': () => 'AI Unavailable'
        }
    },

    browser_disconnected: {
        severity: 'blocking',
        notifyPriority: 'high',
        autoTimeout: 30 * 60 * 1000,
        actions: [
            { label: '🔑 Re-login', callback: 'relogin' },
            { label: '⏭ Skip', callback: 'skip_platform' }
        ],
        message: {
            'zh-CN': (ctx) => `${ctx.platform || '浏览器'} 连接断开，搜索任务已暂停。`,
            'en': (ctx) => `${ctx.platform || 'Browser'} disconnected. Search task paused.`
        },
        title: {
            'zh-CN': (ctx) => `浏览器断开 — ${ctx.platform || ''}`,
            'en': (ctx) => `Browser Disconnected — ${ctx.platform || ''}`
        }
    }
};

/**
 * Build a human intervention block for taskManager.
 * @param {string} reason - Key from REASONS
 * @param {object} ctx - Context: { platform, source, envId, attempts, jobCount, provider, ... }
 * @param {string} [lang='en'] - Language code
 * @returns {object} Block for taskManager.requestHumanIntervention()
 */
function buildBlock(reason, ctx = {}, lang = 'en') {
    const def = REASONS[reason];
    if (!def) throw new Error(`Unknown intervention reason: ${reason}`);

    const l = def.message[lang] ? lang : 'en';
    return {
        reason,
        platform: ctx.platform || null,
        envId: ctx.envId || null,
        message: def.message[l](ctx),
        title: def.title[l](ctx),
        actions: def.actions.map(a => ({
            label: a.label,
            callback: `task:${ctx.taskId || ''}:resolve:${a.callback}`
        })),
        autoTimeout: def.autoTimeout,
        priority: def.notifyPriority,
        severity: def.severity
    };
}

/**
 * Get reason definition.
 */
function getReason(reason) {
    return REASONS[reason] || null;
}

/**
 * List all reason keys.
 */
function listReasons() {
    return Object.keys(REASONS);
}

module.exports = { REASONS, buildBlock, getReason, listReasons };
