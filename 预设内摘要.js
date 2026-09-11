/**
 * 预设内摘要 —— 对话自动总结插件
 *
 * 用途：对话每满 N 条消息，后台增量总结一次，摘要写入对话级变量 chat_summary。
 * 在预设的任意 prompt 块里放一行 {{getvar::chat_summary}} 即可每轮自动带入摘要，
 * 防止长对话记忆缺失。删除对话后变量随聊天文件一起消失。
 *
 * 命令：/summary 立即总结  /summaryclear 清空摘要
 *
 * 要求：SillyTavern 1.12+
 * 安装：放入 public/scripts/extensions/third-party/ 目录后刷新页面
 * 预设：在你想放摘要的块里加一行 {{getvar::chat_summary}}（本项目的梁元预设已内置）
 */
import { eventSource, event_types, getContext, saveSettingsDebounced, generateQuietPrompt, getCurrentChatId, saveMetadataDebounced } from '../../../script.js';
import { registerSlashCommand } from '../../slash-commands.js';
import { extension_settings } from '../../extensions.js';

const EXT_NAME = 'preset_summary';
const VAR_NAME = 'chat_summary';

const defaultSettings = {
    enabled: true,
    interval: 20,  // 每满 N 条消息总结一次
    lookback: 30,  // 每次回顾最近 M 条
    maxLen: 400,   // 摘要上限字数
};

let busy = false;

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(defaultSettings);
    }
    return extension_settings[EXT_NAME];
}

async function runSummary() {
    const s = getSettings();
    const ctx = getContext();
    const chat = ctx.chat;
    if (!Array.isArray(chat) || chat.length < 2) return;
    if (busy) return;
    busy = true;
    toastr.info('正在更新聊天摘要…');
    try {
        const old = ctx.chatMetadata?.variables?.[VAR_NAME] || '';
        const recent = chat.slice(-s.lookback).map((m) => {
            const who = m.is_user ? '{{user}}' : (m.name || '角色');
            return `${who}：${(m.mes || '').slice(0, 600)}`;
        }).join('\n');
        const prompt = [
            '你是剧情记录员。下面有一段对话的已有摘要和最近的新对话，请把新内容并入摘要，输出更新后的完整摘要。',
            '',
            '[已有摘要]',
            old || '（尚无摘要）',
            '',
            '[最近对话]',
            recent,
            '',
            '要求：',
            '1. 只记录剧情事实：进展、任务、地点、NPC与关系、关键事件与决定，不写分析评论',
            `2. 全文不超过 ${s.maxLen} 字，用平实中文`,
            '3. 直接输出摘要正文，不要任何前缀或解释',
        ].join('\n');
        const out = (await generateQuietPrompt(prompt, false, true) || '').trim();
        if (!out) throw new Error('生成结果为空');
        if (!ctx.chatMetadata.variables) ctx.chatMetadata.variables = {};
        ctx.chatMetadata.variables[VAR_NAME] = out;
        saveMetadataDebounced();
        console.log(`[预设内摘要] 已更新（${out.length} 字）`);
        toastr.success(`聊天摘要已更新（${out.length} 字）`);
    } catch (err) {
        console.error('[预设内摘要] 失败', err);
        toastr.error('聊天摘要更新失败：' + (err?.message || err));
    } finally {
        busy = false;
    }
}

function maybeSummarize() {
    const s = getSettings();
    if (!s.enabled || busy) return;
    const chat = getContext().chat;
    if (!Array.isArray(chat) || chat.length < 4) return;
    if (chat.length % s.interval !== 0) return;
    runSummary();
}

// ============ 事件 ============
eventSource.on(event_types.CHAT_CHANGED, () => {
    busy = false;
});

eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    maybeSummarize();
});

eventSource.on(event_types.MESSAGE_SENT, () => {
    maybeSummarize();
});

// ============ 斜杠命令 ============
registerSlashCommand('summary', () => {
    runSummary();
    return '已触发总结…';
}, [], { helpString: '立即总结当前对话并写入 chat_summary 变量' });

registerSlashCommand('summaryclear', () => {
    const ctx = getContext();
    if (ctx.chatMetadata?.variables) {
        delete ctx.chatMetadata.variables[VAR_NAME];
        saveMetadataDebounced();
    }
    return '摘要已清空。';
}, [], { helpString: '清空 chat_summary 变量' });

// ============ 设置面板 ============
jQuery(() => {
    const s = getSettings();
    const html = `
    <div id="preset_summary_settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>预设内摘要</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
        </div>
        <div class="inline-drawer-content">
          <label class="checkbox_label" for="preset_summary_enabled">
            <input type="checkbox" id="preset_summary_enabled" ${s.enabled ? 'checked' : ''}/>
            <span>启用（每满 N 条消息自动总结）</span>
          </label>
          <div class="title_restorable">
            每 <input id="preset_summary_interval" class="text_pole width50p" type="number" min="4" max="200" value="${Number(s.interval) || 20}"/> 条消息总结一次
          </div>
          <div class="title_restorable">
            每次回顾最近 <input id="preset_summary_lookback" class="text_pole width50p" type="number" min="5" max="300" value="${Number(s.lookback) || 30}"/> 条消息
          </div>
          <div class="title_restorable">
            摘要上限 <input id="preset_summary_maxlen" class="text_pole width50p" type="number" min="100" max="2000" value="${Number(s.maxLen) || 400}"/> 字
          </div>
          <div class="title_restorable">
            预设中放置：<code>{{getvar::chat_summary}}</code>（当前摘要自动出现在该行）
          </div>
        </div>
      </div>
    </div>`;
    $('#extensions_settings').append(html);
    $('#preset_summary_enabled').on('change', function () {
        s.enabled = !!this.checked;
        saveSettingsDebounced();
    });
    $('#preset_summary_interval').on('input', function () {
        s.interval = Math.max(4, Math.min(200, Number(this.value) || 20));
        saveSettingsDebounced();
    });
    $('#preset_summary_lookback').on('input', function () {
        s.lookback = Math.max(5, Math.min(300, Number(this.value) || 30));
        saveSettingsDebounced();
    });
    $('#preset_summary_maxlen').on('input', function () {
        s.maxLen = Math.max(100, Math.min(2000, Number(this.value) || 400));
        saveSettingsDebounced();
    });
});
