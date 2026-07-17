// Message builders: every Bot reply text is produced here, so index.js never
// hand-assembles large strings. Builders are pure functions returning strings.
//
// When a new feature is added, add a builder here (and its command keywords to
// src/constants/commands.js) — the help / all-commands / suggestion features
// then pick it up without further wiring.

import { COMMANDS, COMMAND_PREFIXES } from '../constants/commands.js';
import { VERSION, APP_NAME, ABOUT, UPDATE_LOG, ERRORS } from '../constants/helpMessages.js';

const DIVIDER = '──────────';
const HEAVY_DIVIDER = '══════════════';

// ── System / informational ────────────────────────────────────────────────

export function buildVersion() {
  return [`${APP_NAME}`, '', `📦 版本：v${VERSION}`].join('\n');
}

export function buildAbout() {
  return [ABOUT.title, '', ...ABOUT.lines, '', `📦 版本：v${VERSION}`].join('\n');
}

export function buildUpdateLog() {
  const lines = ['🗒️ 更新紀錄', ''];
  UPDATE_LOG.forEach((entry, index) => {
    if (index > 0) lines.push(DIVIDER, '');
    lines.push(`v${entry.version}`, '');
    for (const change of entry.changes) lines.push(`• ${change}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

// A compact listing of every command family, generated from COMMANDS so it can
// never fall out of sync with what the Bot actually accepts.
export function buildAllCommands() {
  const section = (title, prefix, keywords) => {
    const label = prefix ? `（${prefix}）` : '（直接輸入）';
    const rows = keywords.map((keyword) => (prefix ? `• ${prefix} ${keyword}` : `• ${keyword}`));
    return [`${title}${label}`, ...rows];
  };

  return [
    '📋 全部指令',
    '',
    ...section('🍄 打菇', COMMAND_PREFIXES.mushroom, COMMANDS.mushroom),
    '',
    DIVIDER,
    '',
    ...section('⚔️ 戰力', COMMAND_PREFIXES.power, COMMANDS.power),
    '',
    DIVIDER,
    '',
    ...section('💎 課長', COMMAND_PREFIXES.whale, COMMANDS.whale),
    '',
    DIVIDER,
    '',
    ...section('ℹ️ 系統', COMMAND_PREFIXES.system, COMMANDS.system),
    '',
    HEAVY_DIVIDER,
    '',
    '輸入「幫助」查看完整說明。',
  ].join('\n');
}

// ── Top-level help & quick help ─────────────────────────────────────────────

export function buildQuickHelp() {
  return [
    APP_NAME,
    '',
    '可使用以下指令：',
    '',
    '• 菇 查詢',
    '• 菇 玩家',
    '• 菇 幫助',
    '• 課長',
    '• 全部指令',
    '',
    '查看完整說明請輸入：',
    '',
    '幫助',
  ].join('\n');
}

export function buildHelp(gradeList) {
  return [
    '📖 使用說明',
    '',
    APP_NAME,
    '',
    buildMushroomHelp(),
    '',
    HEAVY_DIVIDER,
    '',
    buildPowerHelp(),
    '',
    HEAVY_DIVIDER,
    '',
    buildWhaleHelp(gradeList),
    '',
    HEAVY_DIVIDER,
    '',
    'ℹ️ 系統',
    '',
    '• 全部指令',
    '• 資訊',
    '• 版本',
    '• 更新紀錄',
  ].join('\n');
}

// ── Per-feature help ────────────────────────────────────────────────────────

export function buildMushroomHelp() {
  return [
    '🍄 打菇',
    '',
    '📋 查詢',
    '',
    '• 菇 查詢',
    '查看所有玩家剩餘次數',
    '',
    '• 菇 玩家',
    '查看玩家名單',
    '',
    '• 菇 <玩家名稱>',
    '查看指定玩家剩餘次數',
    '',
    '🍄 活動巨菇最佳分配',
    '',
    '• 菇 最佳 <巨菇數>',
    '依戰力與剩餘次數計算最佳分配',
    '',
    '例如：',
    '',
    '菇 最佳 2',
    '菇 最佳 3',
    '',
    '✏️ 修改次數',
    '',
    '• 菇 <玩家名稱> -1 / +1',
    '扣除／增加一次（夾在 0～3）',
    '',
    '• 菇 <玩家名稱> <0~3>',
    '直接設定剩餘次數',
    '',
    '• 菇 <玩家名稱> out',
    '直接設定為 0 次',
    '',
    '• 菇 全部 <操作>',
    '一次修改全部玩家',
    '',
    '• 菇 <玩家> <操作> <玩家> <操作>',
    '一次修改多位玩家',
    '',
    '例如：',
    '',
    '菇 小蓁 -1',
    '菇 jun 2',
  ].join('\n');
}

export function buildPowerHelp() {
  return [
    '⚔️ 戰力（不需「菇」前綴）',
    '',
    '• 戰力',
    '查看所有玩家戰力（含總戰力、平均、最高、最低）',
    '',
    '• 戰力 <玩家名稱>',
    '查看指定玩家戰力',
    '',
    '• 戰力 <玩家名稱> <數值>',
    '設定玩家戰力',
    '',
    '• 戰力 <玩家> <數值> <玩家> <數值>',
    '一次設定多位玩家戰力',
    '',
    '• 戰力合計',
    '加總所有玩家戰力',
    '',
    '• 戰力合計 <玩家> <玩家> ...',
    '加總指定玩家戰力',
  ].join('\n');
}

export function buildWhaleHelp(gradeList) {
  return [
    '💎 課長系統',
    '',
    '📋 查詢',
    '',
    '課長',
    '課長 阿明',
    '課長 統計',
    '',
    DIVIDER,
    '',
    '➕ 新增',
    '',
    '課長 新增 阿明',
    '課長 新增 阿明 ㄅ',
    '',
    DIVIDER,
    '',
    '✏️ 修改',
    '',
    '課長 阿明 ㄆ',
    '',
    DIVIDER,
    '',
    '🗑️ 刪除',
    '',
    '課長 刪除 阿明',
    '',
    DIVIDER,
    '',
    '📦 批次',
    '',
    '課長 新增',
    '阿明 ㄅ',
    '小華 ㄆ',
    '',
    '課長',
    '阿明 ㄅ',
    '小華 ㄇ',
    '',
    '課長 刪除',
    '阿明',
    '小華',
    '',
    DIVIDER,
    '',
    '🏅 支援級分：',
    '',
    gradeList ?? '',
  ].join('\n').trimEnd();
}

// ── Errors / suggestions ────────────────────────────────────────────────────

export function buildGenericError() {
  return ERRORS.generic;
}

// Suggestion reply for an input that looks like a known-prefix command but is
// not recognised. `suggestions` is an array of concrete example command
// strings the user probably meant.
export function buildCommandSuggestion(input, suggestions) {
  const lines = ['🤔 找不到這個指令：', '', input];
  if (suggestions.length) {
    lines.push('', '你是不是想輸入：', '', ...suggestions.map((s) => `• ${s}`));
  }
  lines.push('', '輸入「全部指令」查看所有可用指令。');
  return lines.join('\n');
}

export { DIVIDER, HEAVY_DIVIDER };
