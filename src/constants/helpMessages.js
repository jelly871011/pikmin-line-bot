import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Central copy for informational messages: version, about, update log, and
// shared error strings. Builders (src/utils/messageBuilder.js) turn these into
// the final reply text — keep raw copy and data here, formatting there.

// Read the version straight from package.json so it never drifts from the
// published version. Resolved relative to this file, not the cwd.
const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

export const VERSION = packageJson.version;
export const APP_NAME = '🍄 皮克敏打菇助手';

export const ABOUT = {
  title: '🍄 皮克敏打菇助手',
  lines: [
    '一個 LINE 群組小幫手，協助記錄每日打菇剩餘次數、玩家戰力、活動巨菇最佳分配，以及課長排行榜。',
    '',
    '資料儲存於 Supabase，每天台灣時間 00:00 自動重置剩餘次數。',
  ],
};

// Update log, newest first. Each entry: { version, changes: string[] }.
// Adding a release here surfaces it in the 更新紀錄 command automatically.
export const UPDATE_LOG = [
  {
    version: '1.4.2',
    changes: [
      '新增 VIP 課長等級，排在 ㄅ 之上（最高級）。',
      'VIP 輸入不分大小寫，一律以大寫 VIP 儲存與顯示；排行榜以 👑 標記。',
    ],
  },
  {
    version: '1.4.1',
    changes: [
      '指令改為設定驅動：集中管理於 commands.js，Help／全部指令／推薦共用同一份清單。',
      '新增系統指令：全部指令、資訊、版本、更新紀錄、幫助。',
      '新增 Smart Help：輸入以 菇／戰力／課長 開頭但打錯時，會推薦最接近的指令。',
      '回覆訊息集中由 messageBuilder 產生，未來新增功能只需新增 Builder。',
    ],
  },
  {
    version: '1.4.0',
    changes: [
      '新增課長排行榜系統（獨立 whales 資料表）。',
      '支援課長排行榜、統計、單人查詢、新增、修改、刪除。',
      '支援課長批次新增／修改／刪除，並防止重複新增。',
      '固定級分排序（ㄅ→ㄆ→ㄇ→ㄈ→ㄦ）。',
    ],
  },
  {
    version: '1.3.2',
    changes: [
      '改善活動巨菇最佳化策略（整體星級最大化）。',
      '每顆巨菇限制 3～5 位玩家、每人單顆至少 1000 戰力。',
      '新增「接近下一星級」作為最佳化排序條件。',
    ],
  },
  {
    version: '1.3.1',
    changes: [
      '支援戰力一次修改多位玩家。',
      '戰力查詢新增總戰力、平均、最高、最低統計。',
      'Scheduler 模組化並新增預留的 Monthly Scheduler。',
    ],
  },
  {
    version: '1.3.0',
    changes: ['新增活動巨菇最佳分配：`菇 最佳 <巨菇數>`。'],
  },
];

// Shared error copy. Keyed so builders and handlers reference one source.
export const ERRORS = {
  generic: '⚠️ 發生錯誤，請稍後再試。',
  unknownCommand: '⚠️ 無法辨識的指令。',
};
