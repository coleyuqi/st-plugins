/**
 * NPC登记 —— 随机出场角色人设锁定插件（通用）
 *
 * 用途：角色卡对话中即兴登场的随机 NPC（路人/店主/卫兵等），在首次出场时
 * 后台生成并锁定其人设，后续出场保持一致，防止人设漂移。
 *
 * 触发方式（两种并存）：
 * 1. 标记模式：角色消息中出现 [[新角色:名字]]（需卡的世界书配合输出标记）
 * 2. 命令模式：/npc 名字 或 /npc 名字 一句话印象
 *
 * 其他命令：/npclist 查看已登记  /npcforget 名字 删除登记
 *
 * 存储：纯内存。重启 ST 或删除对话后自动清空，符合"临时人设"定位。
 * 注入：每轮生成前，仅注入最近 N 条消息中出现过的已登记 NPC 人设，防止撑爆上下文。
 *
 * 要求：SillyTavern 1.12+
 * 安装：放入 public/scripts/extensions/third-party/ 目录后刷新页面
 */
import { eventSource, event_types, getContext, saveSettingsDebounced, generateQuietPrompt, getCurrentChatId } from '../../../script.js';
import { registerSlashCommand } from '../../slash-commands.js';
import { registerPromptManager } from '../../prompt-manager.js';
import { extension_settings } from '../../extensions.js';

const EXT_NAME = 'npc_register';
const MARKER_RE = /\[\[新角色[:：]\s*([^\[\]]+)\]\]/g;

const defaultSettings = {
    enabled: true,
    template: [
        '你是角色卡世界观的设定助手。请为下面这位临时出场角色写一份人设卡，供后续所有对话保持一致。',
        '',
        '角色名：{{name}}',
        '补充印象：{{note}}',
        '出场场景原文（供你了解处境）：',
        '{{context}}',
        '',
        '人设卡要求：',
        '1. 外貌：突出身体特征与衣着，符合世界观与出场场景',
        '2. 性格：核心性格与隐藏的一面',
        '3. 说话方式：语气、自称、口头禅',
        '4. 当前处境与对 {{user}} 的态度',
        '控制在200字以内，直接输出人设卡正文，不要任何解释或前缀。',
    ].join('\n'),
    recentWindow: 8,
};

const npcMap = new Map();     // chatId -> Map<name, persona>
const recentMes = new Map();  // chatId -> [文本, ...]（最近 recentWindow 条消息）
const pending = new Set();    // "chatId::name" 正在生成

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(defaultSettings);
    }
    return extension_settings[EXT_NAME];
}

function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function recordMessage(chatId, isUser, text) {
    const arr = recentMes.get(chatId) || [];
    arr.push((isUser ? '{{user}}' : '{{char}}') + '：' + text);
    while (arr.length > getSettings().recentWindow) arr.shift();
    recentMes.set(chatId, arr);
}

async function registerNpc(chatId, name, note, contextText) {
    const s = getSettings();
    if (!s.enabled) return;
    name = (name || '').trim();
    if (!name || name.length > 20) return;
    if (!npcMap.has(chatId)) npcMap.set(chatId, new Map());
    const map = npcMap.get(chatId);
    if (map.has(name)) return; // 已登记，静默跳过
    const key = chatId + '::' + name;
    if (pending.has(key)) return;
    pending.add(key);
    toastr.info(`正在生成「${name}」的人设…`);
    try {
        const prompt = s.template
            .replaceAll('{{name}}', name)
            .replaceAll('{{note}}', note || '（无）')
            .replaceAll('{{context}}', (contextText || '').slice(0, 800) || '（无）');
        const persona = (await generateQuietPrompt(prompt, false, true) || '').trim();
        if (!persona) throw new Error('生成结果为空');
        map.set(name, persona);
        console.log(`[NPC登记] 已锁定「${name}」`, persona);
        toastr.success(`NPC「${name}」人设已锁定`);
    } catch (err) {
        console.error('[NPC登记] 生成失败', err);
        toastr.error(`「${name}」人设生成失败：${err?.message || err}`);
    } finally {
        pending.delete(key);
    }
}

function parseMarkers(text) {
    const names = [];
    MARKER_RE.lastIndex = 0;
    let m;
    while ((m = MARKER_RE.exec(text)) !== null) {
        names.push(m[1].trim());
    }
    return names;
}

function buildPrompt() {
    const s = getSettings();
    if (!s.enabled) return '';
    const chatId = getCurrentChatId();
    const map = npcMap.get(chatId);
    if (!map || map.size === 0) return '';
    const recent = (recentMes.get(chatId) || []).join('\n');
    const active = [...map.entries()].filter(([n]) => recent.includes(n));
    if (active.length === 0) return '';
    return '[已登记NPC人设]\n' + active.map(([n, p]) => `◆ ${n}\n${p}`).join('\n');
}

// ============ 事件 ============
eventSource.on(event_types.CHAT_CHANGED, () => {
    // 只保留当前对话的人设，删除对话时自动清理；重启天然清空（纯内存）
    const chatId = getCurrentChatId();
    for (const key of npcMap.keys()) {
        if (key !== chatId) npcMap.delete(key);
    }
    // 解析开场白中的标记，并初始化最近消息窗口
    const chat = getContext().chat;
    recentMes.set(chatId, []);
    if (Array.isArray(chat) && chat.length > 0) {
        for (const m of chat.slice(-getSettings().recentWindow)) {
            recordMessage(chatId, !!m.is_user, m.mes || '');
        }
        const first = chat[0];
        if (first && !first.is_user) {
            for (const name of parseMarkers(first.mes || '')) {
                registerNpc(chatId, name, '', first.mes || '');
            }
        }
    }
});

eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
    const chatId = data?.chat_id || getCurrentChatId();
    const text = data?.mes || '';
    recordMessage(chatId, !!data?.is_user, text);
    if (data?.is_user) return; // 只解析角色消息里的标记
    for (const name of parseMarkers(text)) {
        registerNpc(chatId, name, '', text);
    }
});

// ============ 注入 ============
registerPromptManager({
    selector: () => null,
    position: 'extension_prompt',
    identifier: EXT_NAME,
    onPrompt: () => buildPrompt(),
});

// ============ 斜杠命令 ============
registerSlashCommand('npc', (_args, value) => {
    const v = (value || '').trim();
    if (!v) return '用法：/npc 名字 或 /npc 名字 一句话印象';
    const sp = v.indexOf(' ');
    const name = sp === -1 ? v : v.slice(0, sp);
    const note = sp === -1 ? '' : v.slice(sp + 1).trim();
    registerNpc(getCurrentChatId(), name, note, '');
    return '';
}, [], { helpString: '登记临时NPC人设：/npc 名字 或 /npc 名字 一句话印象' });

registerSlashCommand('npclist', () => {
    const map = npcMap.get(getCurrentChatId());
    if (!map || map.size === 0) return '当前对话没有已登记的NPC。';
    return '已登记NPC：\n' + [...map.keys()].join('、');
}, [], { helpString: '查看当前对话已登记的NPC' });

registerSlashCommand('npcforget', (_args, value) => {
    const name = (value || '').trim();
    const map = npcMap.get(getCurrentChatId());
    if (!name) return '用法：/npcforget 名字';
    if (map && map.delete(name)) return `已删除「${name}」的登记。`;
    return `「${name}」未登记。`;
}, [], { helpString: '删除NPC登记：/npcforget 名字' });

// ============ 设置面板 ============
jQuery(() => {
    const s = getSettings();
    const html = `
    <div id="npc_register_settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>NPC 登记</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
        </div>
        <div class="inline-drawer-content">
          <label class="checkbox_label" for="npc_register_enabled">
            <input type="checkbox" id="npc_register_enabled" ${s.enabled ? 'checked' : ''}/>
            <span>启用（标记 [[新角色:名字]] 与 /npc 命令）</span>
          </label>
          <div class="title_restorable">
            人设生成模板（占位符：{{name}} {{note}} {{context}}）
          </div>
          <textarea id="npc_register_template" class="text_pole" rows="9" placeholder="人设生成模板">${escapeHtml(s.template)}</textarea>
          <div class="title_restorable">
            注入窗口：最近 <input id="npc_register_window" class="text_pole width50p" type="number" min="1" max="50" value="${Number(s.recentWindow) || 8}"/> 条消息里出现过的已登记NPC才注入
          </div>
        </div>
      </div>
    </div>`;
    $('#extensions_settings').append(html);
    $('#npc_register_enabled').on('change', function () {
        s.enabled = !!this.checked;
        saveSettingsDebounced();
    });
    $('#npc_register_template').on('input', function () {
        s.template = String(this.value);
        saveSettingsDebounced();
    });
    $('#npc_register_window').on('input', function () {
        s.recentWindow = Math.max(1, Math.min(50, Number(this.value) || 8));
        saveSettingsDebounced();
    });
});
