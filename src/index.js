import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { middleware, messagingApi } from '@line/bot-sdk';
import {
  MAX_ATTEMPTS,
  DEFAULT_PLAYERS,
  PlayerServiceError,
  getPlayers,
  getPlayer,
  updateRemaining,
  updatePower,
  resetRemaining,
  createPlayers,
  getRanking,
} from './services/playerService.js';

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
  const rows = players.map((player) => `${player.player_name}：${player.power}`);
  return ['⚔️ 玩家戰力', '', ...(rows.length ? rows : ['目前尚無玩家資料'])].join('\n');
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

function formatPowerUpdate(name, previousPower, power) {
  return ['⚔️ 已更新戰力', '', `${name}：`, '', `${previousPower} → ${power}`].join('\n');
}

function formatRanking(players) {
  const medals = ['🥇', '🥈', '🥉', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const rows = players.flatMap((player, index) => [
    `${medals[index] ?? `${index + 1}.`} ${player.player_name}`,
    '',
    `${player.power}`,
    '',
  ]);
  if (rows.length) rows.pop();
  return ['🏆 戰力排行榜', '', ...(rows.length ? rows : ['目前尚無玩家資料'])].join('\n');
}

function formatQuickHelp() {
  return [
    '🍄 皮克敏打菇助手',
    '',
    '可使用以下指令：',
    '',
    '• 菇 查詢',
    '• 菇 玩家',
    '• 菇 幫助',
    '',
    '查看完整說明請輸入：',
    '',
    '菇 幫助',
  ].join('\n');
}

function formatHelp() {
  return [
    '📖 使用說明',
    '',
    '🍄 皮克敏打菇助手',
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
    '✏️ 修改次數',
    '',
    '• 菇 <玩家名稱> -1',
    '扣除一次（最低 0）',
    '',
    '• 菇 <玩家名稱> +1',
    '增加一次（最高 3）',
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
    '',
    '⚔️ 戰力',
    '',
    '• 菇 戰力',
    '查看所有玩家戰力',
    '',
    '• 菇 戰力 <玩家名稱>',
    '查看指定玩家戰力',
    '',
    '• 菇 戰力 <玩家名稱> <數值>',
    '設定玩家戰力',
    '',
    '• 菇 排名',
    '查看戰力排行榜',
    '',
    '• 菇 玩家 <玩家名稱>',
    '查看玩家資訊',
    '',
    'ℹ️ 說明',
    '',
    '• 玩家名稱需與玩家名單一致',
    '• 每位玩家每天預設 3 次',
    '• 每天 00:00（Asia/Taipei）自動重置',
  ].join('\n');
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
    '每天凌晨 00:00',
    '會自動重置為 3 次。',
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
  if (value === '-1') return { type: 'change', value: -1 };
  if (value === '+1') return { type: 'change', value: 1 };
  if (/^-?\d+$/.test(value)) return { type: 'set', value: Number(value) };
  return null;
}

function isValidOperation(operation) {
  return operation.type !== 'set' || (operation.value >= 0 && operation.value <= MAX_ATTEMPTS);
}

function getRemainingAfterOperation(current, operation) {
  if (operation.type === 'set') return operation.value;
  return Math.max(0, Math.min(MAX_ATTEMPTS, current + operation.value));
}

function parseCommand(text) {
  const trimmed = text.trim();
  if (trimmed === '菇') return { type: 'quick-help' };

  const compactCommands = new Map([
    ['菇查詢', 'query-all'],
    ['菇玩家', 'player-list'],
    ['菇幫助', 'help'],
    ['菇戰力', 'power-all'],
    ['菇排名', 'ranking'],
  ]);
  if (compactCommands.has(trimmed)) return { type: compactCommands.get(trimmed) };

  if (!/^菇 +/.test(trimmed)) return null;
  const content = trimmed.replace(/^菇 +/, '').trim();
  if (content === '幫助') return { type: 'help' };
  if (content === '查詢') return { type: 'query-all' };
  if (content === '玩家') return { type: 'player-list' };
  if (content === '戰力') return { type: 'power-all' };
  if (content === '排名') return { type: 'ranking' };

  const tokens = content.split(/\s+/);

  if (tokens[0] === '戰力') {
    if (tokens.length === 2) return { type: 'power-one', name: tokens[1] };
    if (tokens.length === 3 && /^\d+$/.test(tokens[2])) {
      return { type: 'power-set', name: tokens[1], power: Number(tokens[2]) };
    }
  }

  if (tokens[0] === '玩家' && tokens.length === 2) {
    return { type: 'player-info', name: tokens[1] };
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

async function handleCommand(groupId, command, replyToken) {
  if (command.type === 'quick-help') {
    await reply(replyToken, formatQuickHelp());
    return;
  }

  if (command.type === 'help') {
    await reply(replyToken, formatHelp());
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

  if (command.type === 'ranking') {
    const players = await getRanking(groupId);
    await reply(replyToken, formatRanking(players));
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
    const player = await getPlayer(groupId, command.name);
    if (!player) {
      await reply(replyToken, formatPlayerNotFound(command.name));
      return;
    }
    const previousPower = player.power;
    await updatePower(groupId, command.name, command.power);
    await reply(replyToken, formatPowerUpdate(command.name, previousPower, command.power));
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

    if (command.type === 'update-one' && operation.type === 'change' && operation.value === -1 && previousRemaining === 0) {
      await reply(replyToken, `⚠️ ${name}今天已沒有剩餘次數。`);
      return;
    }
    if (command.type === 'update-one' && operation.type === 'change' && operation.value === 1 && previousRemaining === MAX_ATTEMPTS) {
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
  if (!command) return;

  try {
    await handleCommand(groupId, command, event.replyToken);
  } catch (error) {
    if (error instanceof PlayerServiceError) {
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

// node-cron uses IANA time zones, so this always runs at Taiwan midnight.
cron.schedule('0 0 * * *', async () => {
  try {
    await resetRemaining();
    console.info('Daily player data reset to defaults.');
  } catch (error) {
    console.error('Daily reset failed:', error);
  }
}, { timezone: 'Asia/Taipei' });

app.listen(PORT, () => {
  console.info('Server started');
  console.info(`Port: ${PORT}`);
  console.info('Timezone: Asia/Taipei');
});
