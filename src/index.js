import 'dotenv/config';
import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import {
  MAX_ATTEMPTS,
  DEFAULT_PLAYERS,
  PlayerServiceError,
  getPlayers,
  getPlayer,
  updateRemaining,
  updatePower,
  createPlayers,
} from './services/playerService.js';
import { optimizeMushrooms, MAX_MEMBERS } from './services/mushroomOptimizer.js';
import {
  WHALE_GRADES,
  WhaleServiceError,
  isValidGrade,
  getWhales,
  getWhale,
  addWhale,
  updateWhaleGrade,
  deleteWhale,
} from './services/whaleService.js';
import { registerJobs } from './jobs/index.js';
import { SYSTEM_COMMANDS } from './constants/commands.js';
import {
  buildHelp,
  buildQuickHelp,
  buildAllCommands,
  buildAbout,
  buildVersion,
  buildUpdateLog,
  buildWhaleHelp,
  buildCommandSuggestion,
} from './utils/messageBuilder.js';
import { matchedPrefix, suggestCommands } from './utils/commandSuggestion.js';

const { LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  console.error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET.');
  process.exit(1);
}

const app = express();
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});

function formatPlayerNotFound(name) {
  return `⚠️ 找不到玩家：${name}\n\n請輸入：\n\n菇 玩家\n\n查看玩家名單。`;
}

function formatRemaining(remaining) {
  return remaining === 0 ? 'out' : `${remaining} 次`;
}

// `players` is an ordered array of rows: { player_name, remaining, power }.
function formatStatus(players) {
  const rows = players.map((player) => `${player.player_name}：${formatRemaining(player.remaining)}`);
  return ['🍄 今日剩餘', '', ...(rows.length ? rows : ['目前尚無玩家資料'])].join('\n');
}

function formatPlayerList() {
  return [
    '👥 玩家名單',
    '',
    ...DEFAULT_PLAYERS.map((name) => `• ${name}`),
    '',
    '💡 提示：',
    '',
    '查詢：',
    '菇 <玩家名稱>',
    '',
    '例如：',
    '',
    '菇 小蓁',
  ].join('\n');
}

function formatPlayerInfo(player) {
  return [
    `👤 ${player.player_name}`,
    '',
    '⚔️ 戰力：',
    '',
    `${player.power}`,
    '',
    '🍄 今日剩餘：',
    '',
    formatRemaining(player.remaining),
  ].join('\n');
}

function formatPowerAll(players) {
  if (!players.length) {
    return ['⚔️ 玩家戰力', '', '目前尚無玩家資料'].join('\n');
  }

  const rows = players.map((player) => `${player.player_name}：${player.power}`);
  const total = players.reduce((sum, player) => sum + player.power, 0);
  const average = Math.round(total / players.length);
  const highest = players.reduce((best, player) => (player.power > best.power ? player : best));
  const lowest = players.reduce((worst, player) => (player.power < worst.power ? player : worst));

  return [
    '⚔️ 玩家戰力',
    '',
    ...rows,
    '',
    '──────────',
    '',
    `總戰力：${total}`,
    `平均戰力：${average}`,
    `最高戰力：${highest.player_name}（${highest.power}）`,
    `最低戰力：${lowest.player_name}（${lowest.power}）`,
  ].join('\n');
}

function formatPowerOne(player) {
  return [
    `👤 ${player.player_name}`,
    '',
    `⚔️ 戰力：${player.power}`,
    '',
    `🍄 今日剩餘：${formatRemaining(player.remaining)}`,
  ].join('\n');
}

function formatPowerUpdate(updated, missingPlayers = []) {
  const lines = ['⚔️ 已更新戰力'];
  for (const { name, previousPower, power } of updated) {
    lines.push('', name, `${previousPower} → ${power}`);
  }
  if (missingPlayers.length) {
    lines.push('', formatMissingPlayers(missingPlayers));
  }
  return lines.join('\n');
}

function formatPowerSum(players) {
  const total = players.reduce((sum, player) => sum + player.power, 0);
  const rows = players.map((player) => `${player.player_name}：${player.power}`);
  return [
    '🧮 戰力合計',
    '',
    ...rows,
    '',
    '──────────',
    '',
    `總戰力：${total}`,
  ].join('\n');
}

// A mushroom's displayed stars are its threshold index + 1 (index 1 -> ⭐⭐, …).
function stars(level) {
  return '⭐'.repeat(level + 1);
}

function formatOptimizeMissing() {
  return ['請輸入：', '', '菇 最佳 2', '', '或：', '', '菇 最佳 3'].join('\n');
}

function formatOptimizeRange() {
  return '⚠️ 巨菇數量需介於 1～10。';
}

function formatOptimizeEmpty() {
  return ['🍄 活動巨菇最佳方案', '', '目前沒有可派遣的玩家。', '', '（需要有剩餘次數且戰力大於 0）'].join('\n');
}

function formatOptimizeInfeasible(requested, maxCount) {
  const canArrange = maxCount > 0
    ? `目前最多可安排：\n\n${maxCount} 顆。`
    : '目前無法安排任何活動巨菇。';
  return [
    `⚠️ 無法規劃 ${requested} 顆活動巨菇。`,
    '',
    '原因：',
    '',
    '目前剩餘派遣次數不足。',
    '',
    canArrange,
  ].join('\n');
}

function formatOptimize(plan, count) {
  const lines = [`🍄 活動巨菇最佳方案（${count} 顆）`, ''];

  plan.mushrooms.forEach((mushroom, index) => {
    lines.push(
      '══════════════',
      '',
      `🍄 巨菇 ${index + 1}`,
      stars(mushroom.stars),
      `👥 ${mushroom.members.length} / ${MAX_MEMBERS}`,
      `⚔️ ${mushroom.total}`,
      '',
      '──────────',
      '',
    );
    for (const member of mushroom.members) {
      lines.push(`${member.name}　${member.power}`);
    }
    lines.push('');
  });

  lines.push(
    '══════════════',
    '',
    '📊 統計',
    '',
    '⭐ 總星數：',
    `${plan.totalStars}`,
    '',
    '⚔️ 使用戰力：',
    `${plan.usedPower}`,
    '',
    '⚔️ 剩餘戰力：',
    `${plan.unusedPower}`,
  );

  lines.push('', '📌 玩家派遣摘要', '', '══════════════', '');
  plan.dispatch.forEach((entry, index) => {
    if (index > 0) lines.push('──────────', '');
    lines.push(`👤 ${entry.name}`, '');
    for (const assignment of entry.assignments) {
      lines.push(`🍄 巨菇${assignment.mushroom + 1}`, `${assignment.power}`);
    }
    lines.push('', '剩餘次數：', `${entry.remaining - entry.assignments.length} / ${entry.remaining}`, '');
  });

  return lines.join('\n').trimEnd();
}

// Medal / rank markers for each grade position (ㄅ first). Grades beyond the
// podium fall back to keycap numbers.
const WHALE_RANK_MARKERS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function whaleRankMarker(index) {
  return WHALE_RANK_MARKERS[index] ?? '🔹';
}

function formatGradeList() {
  return WHALE_GRADES.join('、');
}

function formatWhaleGradeError() {
  return `⚠️ 級分只能是：\n\n${formatGradeList()}`;
}

function formatWhaleNotFound(names) {
  return ['⚠️ 找不到課長：', '', ...names.map((name) => `• ${name}`)].join('\n');
}

// Group whales by grade in fixed order, dropping empty grades.
function groupWhalesByGrade(whales) {
  return WHALE_GRADES
    .map((grade) => ({ grade, members: whales.filter((whale) => whale.grade === grade) }))
    .filter((group) => group.members.length > 0);
}

function formatWhaleRank(whales) {
  if (!whales.length) {
    return ['💎 課長排行榜', '', '目前尚無課長資料。', '', '新增請輸入：', '', '課長 新增 <名稱>'].join('\n');
  }

  const groups = groupWhalesByGrade(whales);
  const lines = ['💎 課長排行榜', ''];
  groups.forEach((group, index) => {
    if (index > 0) lines.push('──────────', '');
    const marker = whaleRankMarker(WHALE_GRADES.indexOf(group.grade));
    lines.push(`${marker} ${group.grade}級分（${group.members.length}）`, '');
    for (const member of group.members) lines.push(`• ${member.name}`);
    lines.push('');
  });
  lines.push('══════════', '', `📊 共 ${whales.length} 位課長`);
  return lines.join('\n');
}

function formatWhaleStats(whales) {
  const lines = ['💎 課長統計', ''];
  WHALE_GRADES.forEach((grade, index) => {
    const count = whales.filter((whale) => whale.grade === grade).length;
    lines.push(`${whaleRankMarker(index)} ${grade}級分：${count} 位`, '');
  });
  lines.push('──────────', '', '📊 總計：', '', `${whales.length} 位`);
  return lines.join('\n');
}

function formatWhaleInfo(whale) {
  return [`👤 ${whale.name}`, '', '🏅 級分：', '', whale.grade].join('\n');
}

function formatWhaleAdded(added, { duplicates = [], invalidGrade = false } = {}) {
  const lines = ['✅ 已新增課長'];
  for (const { name, grade } of added) {
    lines.push('', `👤 ${name}`, `🏅 ${grade}級分`);
  }
  if (duplicates.length) {
    lines.push('', ...duplicates.map((name) => `⚠️ ${name} 已經在課長名單中。`));
  }
  if (invalidGrade) lines.push('', formatWhaleGradeError());
  return lines.join('\n');
}

function formatWhaleUpdated(updated, missingNames = []) {
  const lines = ['💎 已更新課長'];
  for (const { name, previousGrade, grade } of updated) {
    lines.push('', name, `${previousGrade} → ${grade}`);
  }
  if (missingNames.length) {
    lines.push('', formatWhaleNotFound(missingNames));
  }
  return lines.join('\n');
}

function formatWhaleDeleted(deletedNames, missingNames = []) {
  const lines = ['🗑️ 已刪除課長'];
  for (const name of deletedNames) lines.push('', name);
  if (missingNames.length) {
    lines.push('', formatWhaleNotFound(missingNames));
  }
  return lines.join('\n');
}

function formatWhaleHelp() {
  return buildWhaleHelp(formatGradeList());
}

function formatQuickHelp() {
  return buildQuickHelp();
}

function formatHelp() {
  return buildHelp(formatGradeList());
}

function formatWelcome() {
  return [
    '🎉🍄 歡迎使用 Pikmin 打菇助手！',
    '',
    '目前玩家：',
    '',
    ...DEFAULT_PLAYERS.map((name) => `• ${name}`),
    '',
    '可使用：',
    '',
    '• 菇',
    '快速查看指令',
    '',
    '• 菇 查詢',
    '查看所有玩家',
    '',
    '• 菇 玩家',
    '查看玩家名單',
    '',
    '• 菇 <玩家>',
    '查詢單人',
    '',
    '• 菇 <玩家> -1',
    '',
    '• 菇 <玩家> +1',
    '',
    '• 菇 <玩家> 2',
    '',
    '🍄 活動巨菇最佳分配：',
    '',
    '• 菇 最佳 2',
    '• 菇 最佳 3',
    '依戰力與剩餘次數計算最佳分配',
    '',
    '⚔️ 戰力功能（不需「菇」）：',
    '',
    '• 戰力',
    '查看所有玩家戰力（含總戰力、平均、最高、最低）',
    '',
    '• 戰力 <玩家>',
    '查詢單人戰力',
    '',
    '• 戰力 <玩家> <數值>',
    '設定戰力',
    '',
    '• 戰力 <玩家> <數值> <玩家> <數值>',
    '一次設定多位玩家戰力',
    '',
    '• 戰力合計',
    '加總所有玩家戰力',
    '',
    '• 戰力合計 <玩家> <玩家>',
    '加總指定玩家戰力',
    '',
    '每天凌晨 00:00',
    '會自動重置為 3 次。',
    '',
    '💎 課長排行榜（不需「菇」）：',
    '',
    '• 課長',
    '查看課長排行榜',
    '',
    '• 課長 幫助',
    '查看課長系統說明',
    '',
    '祝大家今天都能打滿菇！🍄',
  ].join('\n');
}

function formatMissingPlayers(names) {
  return ['⚠️ 找不到玩家：', '', ...names.map((name) => `• ${name}`)].join('\n');
}

function formatUpdate(updates, players, { allPlayers = false, missingPlayers = [] } = {}) {
  const lines = [
    allPlayers ? '🍄 已更新全部玩家' : '🍄 已更新',
    ...(allPlayers ? [] : ['', ...updates.map(({ name, previousRemaining, remaining }) => (
      `${name}：${formatRemaining(previousRemaining)} → ${formatRemaining(remaining)}`
    ))]),
    '',
    '──────────',
    '',
    formatStatus(players),
  ];

  const zeroNames = updates
    .filter(({ previousRemaining, remaining }) => previousRemaining !== 0 && remaining === 0)
    .map(({ name }) => name);
  if (zeroNames.length) {
    lines.push('', '⚠️ 已沒有剩餘打菇次數：', '', ...zeroNames.map((name) => `• ${name}`));
  }

  const maxNames = updates
    .filter(({ previousRemaining, remaining }) => previousRemaining !== MAX_ATTEMPTS && remaining === MAX_ATTEMPTS)
    .map(({ name }) => name);
  if (maxNames.length) {
    lines.push('', '✅ 已恢復今日最大次數：', '', ...maxNames.map((name) => `• ${name}`));
  }

  if (missingPlayers.length) {
    lines.push('', formatMissingPlayers(missingPlayers));
  }

  return lines.join('\n');
}

function parseOperation(value) {
  if (value.toLowerCase() === 'out') return { type: 'set', value: 0 };
  // A leading + or - means relative (e.g. -2 subtracts 2, +3 adds 3); the
  // result is clamped to 0～MAX_ATTEMPTS later. A bare number sets directly.
  if (/^[+-]\d+$/.test(value)) return { type: 'change', value: Number(value) };
  if (/^\d+$/.test(value)) return { type: 'set', value: Number(value) };
  return null;
}

function isValidOperation(operation) {
  return operation.type !== 'set' || (operation.value >= 0 && operation.value <= MAX_ATTEMPTS);
}

function getRemainingAfterOperation(current, operation) {
  if (operation.type === 'set') return operation.value;
  return Math.max(0, Math.min(MAX_ATTEMPTS, current + operation.value));
}

// Parse a 課長 (whale) command. Returns a command object, or null if the text
// is not a 課長 command. Whale commands have no 菇 prefix and support both
// single-line and multi-line (batch) forms.
function parseWhaleCommand(trimmed) {
  if (trimmed === '課長') return { type: 'whale-rank' };
  if (!/^課長[ \n\r\t]/.test(trimmed)) return null;

  // Everything after the 課長 keyword, keeping newlines to tell batch forms
  // apart from a single trailing name.
  const rest = trimmed.replace(/^課長[ \n\r\t]+/, '');
  const tokens = rest.split(/\s+/).filter(Boolean);
  const keyword = tokens[0];

  if (keyword === '統計' && tokens.length === 1) return { type: 'whale-stats' };
  if (keyword === '幫助' && tokens.length === 1) return { type: 'whale-help' };

  if (keyword === '新增') {
    // 課長 新增 <name> [grade] [<name> [grade] ...] or one entry per line.
    const entries = parseWhaleAddEntries(rest.replace(/^新增[ \n\r\t]*/, ''));
    if (!entries) return null;
    return { type: 'whale-add', entries };
  }

  if (keyword === '刪除') {
    const names = tokens.slice(1);
    if (!names.length) return null;
    return { type: 'whale-delete', names };
  }

  // No keyword: either query one (課長 <name>) or update grades in batch
  // (課長 <name> <grade> ...). A lone token is a single-person query.
  if (tokens.length === 1) return { type: 'whale-query', name: tokens[0] };

  const updates = parseWhaleGradePairs(tokens);
  if (!updates) return null;
  return { type: 'whale-update', updates };
}

// Parse name/optional-grade entries for 課長 新增. A grade is any token that is
// a known grade; a name is always followed by an optional grade. We treat the
// token stream as: name, [grade], name, [grade], ... Because names and grades
// are both bare words, we use the grade set to decide: a token right after a
// name is that name's grade only if it is a valid grade.
function parseWhaleAddEntries(rest) {
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const name = tokens[index];
    const next = tokens[index + 1];
    if (next !== undefined && isValidGrade(next)) {
      entries.push({ name, grade: next });
      index += 2;
    } else {
      entries.push({ name, grade: null }); // null -> service default (ㄦ)
      index += 1;
    }
  }
  return entries;
}

// Parse strict name/grade pairs for 課長 batch update. Every name must be
// followed by a token; that token must be a valid grade. Returns null if the
// stream is not clean name/grade pairs.
function parseWhaleGradePairs(tokens) {
  if (tokens.length % 2 !== 0) return null;
  const updates = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const grade = tokens[index + 1];
    updates.push({ name, grade });
  }
  return updates;
}

function parseCommand(text) {
  const trimmed = text.trim();

  const whaleCommand = parseWhaleCommand(trimmed);
  if (whaleCommand) return whaleCommand;

  // System commands are bare keywords (no prefix). Keyword list lives in
  // src/constants/commands.js so it stays in sync with 全部指令 / suggestion.
  if (SYSTEM_COMMANDS.includes(trimmed)) {
    const systemTypes = {
      幫助: 'help',
      全部指令: 'all-commands',
      資訊: 'about',
      版本: 'version',
      更新紀錄: 'update-log',
    };
    return { type: systemTypes[trimmed] };
  }

  // Power commands intentionally have no 菇 prefix.
  // 戰力合計 must be checked before the 戰力 branches below.
  if (trimmed === '戰力合計') return { type: 'power-sum', names: [] };
  if (/^戰力合計 +/.test(trimmed)) {
    const names = trimmed.replace(/^戰力合計 +/, '').trim().split(/\s+/);
    return { type: 'power-sum', names };
  }

  if (trimmed === '戰力') return { type: 'power-all' };
  // 戰力 may be followed by content on the same line or across newlines, e.g.
  //   戰力 小蓁 12000 牙齒 9800        (single line, many pairs)
  //   戰力\n小蓁 12000\n牙齒 9800       (one pair per line)
  if (/^戰力[ \n\r\t]/.test(trimmed)) {
    const powerTokens = trimmed.replace(/^戰力/, '').trim().split(/\s+/).filter(Boolean);
    if (powerTokens.length === 1) return { type: 'power-one', name: powerTokens[0] };
    // A single name + value still sets one player; two or more name/value pairs
    // set many at once. Anything not forming clean pairs is rejected.
    if (powerTokens.length >= 2 && powerTokens.length % 2 === 0) {
      const updates = [];
      for (let index = 0; index < powerTokens.length; index += 2) {
        if (!/^\d+$/.test(powerTokens[index + 1])) return null;
        updates.push({ name: powerTokens[index], power: Number(powerTokens[index + 1]) });
      }
      return { type: 'power-set', updates };
    }
    return null;
  }

  if (trimmed === '菇') return { type: 'quick-help' };

  const compactCommands = new Map([
    ['菇查詢', 'query-all'],
    ['菇玩家', 'player-list'],
    ['菇幫助', 'help'],
  ]);
  if (compactCommands.has(trimmed)) return { type: compactCommands.get(trimmed) };

  if (!/^菇 +/.test(trimmed)) return null;
  const content = trimmed.replace(/^菇 +/, '').trim();
  if (content === '幫助') return { type: 'help' };
  if (content === '查詢') return { type: 'query-all' };
  if (content === '玩家') return { type: 'player-list' };

  const tokens = content.split(/\s+/);

  if (tokens[0] === '玩家' && tokens.length === 2) {
    return { type: 'player-info', name: tokens[1] };
  }

  if (tokens[0] === '最佳') {
    if (tokens.length === 1) return { type: 'optimize', count: null };
    if (tokens.length === 2 && /^\d+$/.test(tokens[1])) {
      return { type: 'optimize', count: Number(tokens[1]) };
    }
    return { type: 'optimize', count: null };
  }

  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const updates = [];
    for (let index = 0; index < tokens.length; index += 2) {
      const operation = parseOperation(tokens[index + 1]);
      if (!operation) break;
      updates.push({ name: tokens[index], operation });
    }

    if (updates.length === tokens.length / 2) {
      if (updates.length === 1 && updates[0].name === '全部') {
        return { type: 'update-all', operation: updates[0].operation };
      }
      return { type: updates.length === 1 ? 'update-one' : 'update-many', updates };
    }
  }

  if (content) return { type: 'query-one', name: content };
  return { type: 'help' };
}

async function reply(replyToken, text) {
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

async function handleWhaleCommand(groupId, command, replyToken) {
  if (command.type === 'whale-help') {
    await reply(replyToken, formatWhaleHelp());
    return;
  }

  if (command.type === 'whale-rank') {
    const whales = await getWhales(groupId);
    await reply(replyToken, formatWhaleRank(whales));
    return;
  }

  if (command.type === 'whale-stats') {
    const whales = await getWhales(groupId);
    await reply(replyToken, formatWhaleStats(whales));
    return;
  }

  if (command.type === 'whale-query') {
    const whale = await getWhale(groupId, command.name);
    if (!whale) {
      await reply(replyToken, formatWhaleNotFound([command.name]));
      return;
    }
    await reply(replyToken, formatWhaleInfo(whale));
    return;
  }

  if (command.type === 'whale-add') {
    // Reject the whole request if any explicit grade is invalid.
    const badGrade = command.entries.find((entry) => entry.grade !== null && !isValidGrade(entry.grade));
    if (badGrade) {
      await reply(replyToken, formatWhaleGradeError());
      return;
    }
    const added = [];
    const duplicates = [];
    for (const { name, grade } of command.entries) {
      const inserted = await addWhale(groupId, name, grade ?? undefined);
      if (inserted) added.push({ name, grade: grade ?? 'ㄦ' });
      else duplicates.push(name);
    }
    if (!added.length && duplicates.length) {
      await reply(replyToken, duplicates.map((name) => `⚠️ ${name} 已經在課長名單中。`).join('\n'));
      return;
    }
    await reply(replyToken, formatWhaleAdded(added, { duplicates }));
    return;
  }

  if (command.type === 'whale-update') {
    const badGrade = command.updates.find((update) => !isValidGrade(update.grade));
    if (badGrade) {
      await reply(replyToken, formatWhaleGradeError());
      return;
    }
    const updated = [];
    const missingNames = [];
    for (const { name, grade } of command.updates) {
      const whale = await getWhale(groupId, name);
      if (!whale) {
        missingNames.push(name);
        continue;
      }
      const previousGrade = whale.grade;
      if (grade !== previousGrade) await updateWhaleGrade(groupId, name, grade);
      updated.push({ name, previousGrade, grade });
    }
    if (!updated.length && missingNames.length) {
      await reply(replyToken, formatWhaleNotFound(missingNames));
      return;
    }
    await reply(replyToken, formatWhaleUpdated(updated, missingNames));
    return;
  }

  if (command.type === 'whale-delete') {
    const deletedNames = [];
    const missingNames = [];
    for (const name of command.names) {
      const whale = await getWhale(groupId, name);
      if (!whale) {
        missingNames.push(name);
        continue;
      }
      await deleteWhale(groupId, name);
      deletedNames.push(name);
    }
    if (!deletedNames.length && missingNames.length) {
      await reply(replyToken, formatWhaleNotFound(missingNames));
      return;
    }
    await reply(replyToken, formatWhaleDeleted(deletedNames, missingNames));
    return;
  }
}

async function handleCommand(groupId, command, replyToken) {
  if (command.type.startsWith('whale-')) {
    await handleWhaleCommand(groupId, command, replyToken);
    return;
  }

  if (command.type === 'quick-help') {
    await reply(replyToken, formatQuickHelp());
    return;
  }

  if (command.type === 'help') {
    await reply(replyToken, formatHelp());
    return;
  }

  if (command.type === 'all-commands') {
    await reply(replyToken, buildAllCommands());
    return;
  }

  if (command.type === 'about') {
    await reply(replyToken, buildAbout());
    return;
  }

  if (command.type === 'version') {
    await reply(replyToken, buildVersion());
    return;
  }

  if (command.type === 'update-log') {
    await reply(replyToken, buildUpdateLog());
    return;
  }

  if (command.type === 'query-all') {
    const players = await getPlayers(groupId);
    await reply(replyToken, formatStatus(players));
    return;
  }

  if (command.type === 'player-list') {
    await reply(replyToken, formatPlayerList());
    return;
  }

  if (command.type === 'player-info') {
    const player = await getPlayer(groupId, command.name);
    if (!player) {
      await reply(replyToken, formatPlayerNotFound(command.name));
      return;
    }
    await reply(replyToken, formatPlayerInfo(player));
    return;
  }

  if (command.type === 'power-all') {
    const players = await getPlayers(groupId);
    await reply(replyToken, formatPowerAll(players));
    return;
  }

  if (command.type === 'power-sum') {
    const players = await getPlayers(groupId);
    if (command.names.length === 0) {
      await reply(replyToken, formatPowerSum(players));
      return;
    }
    const byName = new Map(players.map((player) => [player.player_name, player]));
    const selected = [];
    const missingPlayers = [];
    for (const name of command.names) {
      const player = byName.get(name);
      if (player) selected.push(player);
      else missingPlayers.push(name);
    }
    if (!selected.length) {
      await reply(replyToken, formatMissingPlayers(missingPlayers));
      return;
    }
    const text = missingPlayers.length
      ? `${formatPowerSum(selected)}\n\n${formatMissingPlayers(missingPlayers)}`
      : formatPowerSum(selected);
    await reply(replyToken, text);
    return;
  }

  if (command.type === 'power-one') {
    const player = await getPlayer(groupId, command.name);
    if (!player) {
      await reply(replyToken, formatPlayerNotFound(command.name));
      return;
    }
    await reply(replyToken, formatPowerOne(player));
    return;
  }

  if (command.type === 'power-set') {
    const players = await getPlayers(groupId);
    const byName = new Map(players.map((player) => [player.player_name, player]));
    const updated = [];
    const missingPlayers = [];
    for (const { name, power } of command.updates) {
      const player = byName.get(name);
      if (!player) {
        missingPlayers.push(name);
        continue;
      }
      const previousPower = player.power;
      await updatePower(groupId, name, power);
      updated.push({ name, previousPower, power });
    }
    if (!updated.length) {
      await reply(replyToken, formatMissingPlayers(missingPlayers));
      return;
    }
    await reply(replyToken, formatPowerUpdate(updated, missingPlayers));
    return;
  }

  if (command.type === 'optimize') {
    if (command.count === null) {
      await reply(replyToken, formatOptimizeMissing());
      return;
    }
    const players = await getPlayers(groupId);
    const plan = optimizeMushrooms(players, command.count);
    if (!plan.ok) {
      if (plan.reason === 'range') await reply(replyToken, formatOptimizeRange());
      else if (plan.reason === 'infeasible') await reply(replyToken, formatOptimizeInfeasible(plan.requested, plan.maxCount));
      else await reply(replyToken, formatOptimizeEmpty());
      return;
    }
    await reply(replyToken, formatOptimize(plan, command.count));
    return;
  }

  if (command.type === 'query-one') {
    const player = await getPlayer(groupId, command.name);
    if (!player) {
      await reply(replyToken, formatPlayerNotFound(command.name));
      return;
    }
    await reply(replyToken, `🍄 ${command.name}\n\n今日剩餘：${formatRemaining(player.remaining)}`);
    return;
  }

  if (command.type === 'update-all') {
    if (!isValidOperation(command.operation)) {
      await reply(replyToken, '⚠️ 次數只能設定為 0～3。');
      return;
    }

    const players = await getPlayers(groupId);
    const updates = [];
    for (const player of players) {
      const previousRemaining = player.remaining;
      const remaining = getRemainingAfterOperation(previousRemaining, command.operation);
      if (remaining !== previousRemaining) await updateRemaining(groupId, player.player_name, remaining);
      player.remaining = remaining;
      updates.push({ name: player.player_name, previousRemaining, remaining });
    }
    await reply(replyToken, formatUpdate(updates, players, { allPlayers: true }));
    return;
  }

  const invalidUpdate = command.updates.find(({ operation }) => !isValidOperation(operation));
  if (invalidUpdate) {
    await reply(replyToken, '⚠️ 次數只能設定為 0～3。');
    return;
  }

  const players = await getPlayers(groupId);
  const byName = new Map(players.map((player) => [player.player_name, player]));
  const missingPlayers = [];
  const updates = [];
  for (const { name, operation } of command.updates) {
    const player = byName.get(name);
    if (!player) {
      missingPlayers.push(name);
      continue;
    }
    const previousRemaining = player.remaining;

    if (command.type === 'update-one' && operation.type === 'change' && operation.value < 0 && previousRemaining === 0) {
      await reply(replyToken, `⚠️ ${name}今天已沒有剩餘次數。`);
      return;
    }
    if (command.type === 'update-one' && operation.type === 'change' && operation.value > 0 && previousRemaining === MAX_ATTEMPTS) {
      await reply(replyToken, `⚠️ ${name}已是最大次數（${MAX_ATTEMPTS}）。`);
      return;
    }

    const remaining = getRemainingAfterOperation(previousRemaining, operation);
    if (remaining !== previousRemaining) await updateRemaining(groupId, name, remaining);
    player.remaining = remaining;
    updates.push({ name, previousRemaining, remaining });
  }

  if (!updates.length && missingPlayers.length) {
    await reply(replyToken, formatMissingPlayers(missingPlayers));
    return;
  }

  await reply(replyToken, formatUpdate(updates, players, { missingPlayers }));
}

async function ensurePlayers(groupId) {
  const players = await getPlayers(groupId);
  if (players.length === 0) await createPlayers(groupId);
}

async function handleEvent(event) {
  if (event.source.type !== 'group' || !event.source.groupId) return;

  const { groupId } = event.source;
  if (event.type === 'join') {
    await createPlayers(groupId);
    await reply(event.replyToken, formatWelcome());
    return;
  }

  if (event.type === 'leave') {
    console.info(`Left group: ${groupId}`);
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const command = parseCommand(event.message.text);
  if (!command) {
    // Not a recognised command. If it still looks like a known-prefix command
    // (菇 / 戰力 / 課長) the user probably mistyped, so offer suggestions.
    // Ordinary chatter has no known prefix and is silently ignored as before.
    const text = event.message.text.trim();
    if (matchedPrefix(text)) {
      await reply(event.replyToken, buildCommandSuggestion(text, suggestCommands(text)));
    }
    return;
  }

  try {
    // Whale commands are fully independent of the players table, so they must
    // not trigger player seeding. Every other command self-heals the roster
    // first: groups added before this deploy (or whose seeding failed) have no
    // rows yet. createPlayers is an idempotent upsert.
    if (!command.type.startsWith('whale-')) await ensurePlayers(groupId);
    await handleCommand(groupId, command, event.replyToken);
  } catch (error) {
    if (error instanceof PlayerServiceError || error instanceof WhaleServiceError) {
      await reply(event.replyToken, '⚠️ 發生錯誤，請稍後再試。');
      return;
    }
    throw error;
  }
}

app.get('/', (_req, res) => res.status(200).send('LINE bot is running.'));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.post('/webhook', middleware({ channelSecret: LINE_CHANNEL_SECRET }), async (req, res, next) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return;
  res.status(error.status ?? 500).json({ error: 'Internal server error' });
});

registerJobs();

app.listen(PORT, () => {
  console.info('Server started');
  console.info(`Port: ${PORT}`);
  console.info('Timezone: Asia/Taipei');
});
