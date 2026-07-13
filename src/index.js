import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { middleware, messagingApi } from '@line/bot-sdk';

const { LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const MAX_ATTEMPTS = 3;
const DEFAULT_PLAYERS = [
  '小蓁',
  '牙齒',
  '肌膚',
  '青青',
  'jun',
];

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  console.error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET.');
  process.exit(1);
}

const app = express();
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});

// groupId -> (player name -> remaining attempts). Data is deliberately in memory.
const groups = new Map();

function createDefaultPlayers() {
  return new Map(DEFAULT_PLAYERS.map((name) => [name, MAX_ATTEMPTS]));
}

function getPlayers(groupId) {
  let players = groups.get(groupId);
  if (!players) {
    players = createDefaultPlayers();
    groups.set(groupId, players);
  }
  return players;
}

function formatPlayerNotFound(name) {
  return `⚠️ 找不到玩家：${name}\n\n請輸入：\n\n菇 玩家\n\n查看玩家名單。`;
}

function resetAllGroups() {
  for (const groupId of groups.keys()) {
    groups.set(groupId, createDefaultPlayers());
  }
}

function formatStatus(players) {
  const defaultRows = DEFAULT_PLAYERS
    .filter((name) => players.has(name))
    .map((name) => `${name}：${players.get(name)} 次`);
  const additionalRows = [...players.entries()]
    .filter(([name]) => !DEFAULT_PLAYERS.includes(name))
    .map(([name, remaining]) => `${name}：${remaining} 次`);
  const rows = [...defaultRows, ...additionalRows];

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
    '例如：',
    '',
    '菇 小蓁 -1',
    '菇 jun 2',
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

function formatUpdate(name, previousRemaining, remaining, players) {
  const lines = [
    '🍄 已更新',
    '',
    `${name}：${previousRemaining} → ${remaining} 次`,
    '',
    '──────────',
    '',
    formatStatus(players),
  ];

  if (remaining === 0) {
    lines.push('', `⚠️ ${name}今天已沒有剩餘打菇次數！`);
  }
  if (remaining === MAX_ATTEMPTS) {
    lines.push('', '✅ 已恢復至今日最大次數。');
  }

  return lines.join('\n');
}

function parseCommand(text) {
  const trimmed = text.trim();
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

  const match = content.match(/^(.+?)\s+(-1|\+1|-?\d+)$/);
  if (match) {
    const name = match[1].trim();
    if (!name) return { type: 'help' };

    const operation = match[2];
    if (operation === '-1') return { type: 'change', name, value: -1 };
    if (operation === '+1') return { type: 'change', name, value: 1 };
    return { type: 'set', name, value: Number(operation) };
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

async function handleEvent(event) {
  if (event.source.type !== 'group' || !event.source.groupId) return;

  const { groupId } = event.source;
  if (event.type === 'join') {
    if (!groups.has(groupId)) groups.set(groupId, createDefaultPlayers());
    await reply(event.replyToken, formatWelcome());
    return;
  }

  if (event.type === 'leave') {
    groups.delete(groupId);
    console.info(`Left group: ${groupId}`);
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const command = parseCommand(event.message.text);
  if (!command) return;

  const players = getPlayers(groupId);
  if (command.type === 'quick-help') {
    await reply(event.replyToken, formatQuickHelp());
    return;
  }

  if (command.type === 'help') {
    await reply(event.replyToken, formatHelp());
    return;
  }

  if (command.type === 'query-all') {
    await reply(event.replyToken, formatStatus(players));
    return;
  }

  if (command.type === 'player-list') {
    await reply(event.replyToken, formatPlayerList());
    return;
  }

  if (command.type === 'set' && (command.value < 0 || command.value > MAX_ATTEMPTS)) {
    await reply(event.replyToken, '⚠️ 次數只能設定為 0～3。');
    return;
  }

  const current = players.get(command.name);
  if (current === undefined) {
    await reply(event.replyToken, formatPlayerNotFound(command.name));
    return;
  }

  if (command.type === 'query-one') {
    await reply(event.replyToken, `🍄 ${command.name}\n\n今日剩餘：${current} 次`);
    return;
  }

  if (command.type === 'change' && command.value === -1 && current === 0) {
    await reply(event.replyToken, `⚠️ ${command.name}今天已沒有剩餘次數。`);
    return;
  }

  if (command.type === 'change' && command.value === 1 && current === MAX_ATTEMPTS) {
    await reply(event.replyToken, `⚠️ ${command.name}已是最大次數（${MAX_ATTEMPTS}）。`);
    return;
  }

  const remaining = command.type === 'set' ? command.value : current + command.value;
  players.set(command.name, remaining);
  await reply(event.replyToken, formatUpdate(command.name, current, remaining, players));
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
cron.schedule('0 0 * * *', () => {
  resetAllGroups();
  console.info('Daily player data reset to defaults.');
}, { timezone: 'Asia/Taipei' });

app.listen(PORT, () => {
  console.info('Server started');
  console.info(`Port: ${PORT}`);
  console.info('Timezone: Asia/Taipei');
});
