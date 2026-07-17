# Pikmin LINE Bot

一個可部署到 Render 的 LINE Messaging API Bot。它會依 LINE 群組分開記錄固定玩家名單的當日剩餘次數與戰力；資料存放於 Supabase（PostgreSQL），永久保存，每天台灣時間凌晨自動將剩餘次數重設為 3 次。

## Changelog

### v1.3.1

- 支援戰力一次修改多位玩家：`戰力 小蓁 12000 牙齒 9800 jun 15200`（亦支援換行分列）。
- 戰力查詢新增統計：總戰力、平均戰力、最高戰力、最低戰力。
- 改善活動巨菇最佳化演算法：`菇 最佳 N` 一次規劃 N 顆巨菇（非逐顆完成）。
- 每顆巨菇限制為 3～5 位玩家；演算法同時考慮 `remaining`、`power` 與派遣人數限制。
- 無法在限制下規劃指定顆數時，回覆可安排的最大顆數，不產生不合法方案。
- 改善活動巨菇最佳化輸出排版（星級、人數、統計與玩家派遣摘要）。
- Scheduler 模組化至 `src/jobs/`（`dailyReset`、`monthlyReset`、`index`）。
- 新增 Monthly Scheduler（預留，`0 0 1 * *`，目前僅輸出 log，不重置資料）。

### v1.3.0

- 新增活動巨菇最佳分配：`菇 最佳 <巨菇數>`（例如 `菇 最佳 2`、`菇 最佳 3`）。
- 依玩家戰力與今日剩餘次數，計算指定巨菇數的最佳分配；戰力可拆分，剩餘次數決定一位玩家最多能派幾顆巨菇。
- 最佳化目標依序為：總星數最大、四星數量最多、浪費戰力最少、拆分玩家數最少、單一玩家拆分次數最少（採用 Backtracking + Branch and Bound，非單純 Greedy）。

### v1.2.0

- 資料改存 Supabase（PostgreSQL），永久保存，服務重啟不再遺失。
- 新增戰力功能（不需「菇」前綴）：`戰力`、`戰力 <玩家>`、`戰力 <玩家> <數值>`。
- 新增戰力合計：`戰力合計`（全部）、`戰力合計 <玩家> <玩家>`（指定）。
- 新增玩家資訊：`菇 玩家 <玩家>`。
- 支援任意倍數相對加減：`菇 小蓁 -2`、`菇 全部 +2`（帶正負號即為相對，結果自動夾在 0～3）。

### v1.1.0

新增功能：

- 支援 `out`（不分大小寫），等同設定為 0。
- 支援一次修改全部玩家。
- 支援一次修改多位玩家。
- 更新後自動顯示全部剩餘次數。
- 歸零與回滿時顯示提醒。

## 功能

在群組內傳送下列文字；所有指令以「菇」為前綴。一般指令使用 `菇 ` 加至少一個半形空格；`菇查詢`、`菇玩家` 與 `菇幫助` 也支援不加空格的寫法。不是這些格式的訊息會被直接忽略，不會回覆。

| 訊息 | 結果 |
| --- | --- |
| `菇 小蓁 -1` | 小蓁扣 1 次，最低為 0 |
| `菇 小蓁 +1` | 小蓁加 1 次，最高為 3 |
| `菇 小蓁 -2` | 小蓁扣 2 次（帶正負號即為相對加減，結果自動夾在 0～3） |
| `菇 小蓁 +2` | 小蓁加 2 次，最高為 3 |
| `菇 小蓁 2` | 小蓁直接設為 2 次（只接受 0～3） |
| `菇 小蓁 out` | 小蓁直接設為 0 次；也支援 `OUT`、`Out` |
| `菇 全部 +1` | 所有玩家各加 1 次，最高為 3 |
| `菇 小蓁 2 牙齒 out jun 1` | 一次修改多位玩家 |
| `菇 小蓁` | 查詢小蓁的剩餘次數 |
| `菇 查詢` | 依固定玩家順序，列出該群組所有玩家的剩餘次數 |
| `菇 玩家` | 顯示固定玩家名單 |
| `菇 玩家 小蓁` | 顯示小蓁的玩家資訊（戰力與今日剩餘） |
| `菇 最佳 2` | 依戰力與剩餘次數計算 2 顆活動巨菇的最佳分配 |
| `菇 最佳 3` | 依戰力與剩餘次數計算 3 顆活動巨菇的最佳分配 |
| `戰力` | 列出所有玩家戰力，並顯示總戰力、平均、最高、最低（不需「菇」前綴） |
| `戰力 小蓁` | 查詢小蓁的戰力與今日剩餘 |
| `戰力 小蓁 12000` | 將小蓁的戰力設為 12000 |
| `戰力 小蓁 12000 牙齒 9800 jun 15200` | 一次設定多位玩家戰力（找不到的玩家會略過並提示） |
| `戰力合計` | 加總所有玩家的戰力並顯示總和 |
| `戰力合計 小蓁 jun` | 只加總指定玩家的戰力 |
| `菇 幫助` | 顯示指令說明 |
| `菇` | 顯示簡短指令提示 |

`菇查詢`、`菇玩家`、`菇幫助` 分別等同於有空格的 `菇 查詢`、`菇 玩家`、`菇 幫助`。

固定玩家為「小蓁、牙齒、肌膚、青青、jun」，每位玩家預設為 3 次。系統不會新增玩家；輸入不在名單中的名字時，會提示使用 `菇 玩家` 查看名單。所有回應都使用 LINE 的 `replyMessage`。

## 使用範例

> 菇 查詢

```text
🍄 今日剩餘

小蓁：3 次
牙齒：2 次
肌膚：3 次
青青：1 次
jun：0 次
```

> 菇 小蓁 -1

```text
🍄 已更新

小蓁：3 → 2

──────────

🍄 今日剩餘

小蓁：2 次
牙齒：3 次
肌膚：3 次
青青：3 次
jun：3 次
```

> 菇 全部 2

```text
🍄 已更新全部玩家

──────────

🍄 今日剩餘

小蓁：2 次
牙齒：2 次
肌膚：2 次
青青：2 次
jun：2 次
```

> 菇 小蓁 2 牙齒 out jun 1

```text
🍄 已更新

小蓁：3 → 2
牙齒：3 → 0
jun：3 → 1

──────────

🍄 今日剩餘

小蓁：2 次
牙齒：0 次
肌膚：3 次
青青：3 次
jun：1 次

⚠️ 已沒有剩餘打菇次數：

• 牙齒
```

> 菇 玩家

```text
👥 玩家名單

• 小蓁
• 牙齒
• 肌膚
• 青青
• jun
```

> 戰力

```text
⚔️ 玩家戰力

小蓁：12000
牙齒：9800
肌膚：14900
青青：9800
jun：15200

──────────

總戰力：61700
平均戰力：12340
最高戰力：jun（15200）
最低戰力：牙齒（9800）
```

> 戰力 小蓁 12000 牙齒 9800 jun 15200

```text
⚔️ 已更新戰力

小蓁
10543 → 12000

牙齒
9500 → 9800

jun
14900 → 15200
```

> 戰力合計 小蓁 jun

```text
🧮 戰力合計

小蓁：12000
jun：15200

──────────

總戰力：27200
```

> 菇 玩家 小蓁

```text
👤 小蓁

⚔️ 戰力：

12000

🍄 今日剩餘：

2 次
```

> 菇 最佳 2

```text
🍄 活動巨菇最佳方案

══════════════

🍄 巨菇1
⭐⭐⭐
👥 3 / 5
⚔️ 36120

──────────

jun　16000
肌膚　15000
小蓁　5120

══════════════

🍄 巨菇2
⭐⭐
👥 3 / 5
⚔️ 20020

──────────

小蓁　6880
牙齒　10000
青青　3140

══════════════

📊 統計

⭐ 總星數：5

⚔️ 使用戰力：56140

⚔️ 剩餘未分配：5860

📌 玩家派遣摘要

👤 小蓁

🍄 巨菇1
5120
🍄 巨菇2
6880

剩餘次數：0 / 2

...
```

> 每顆活動巨菇需 3～5 位玩家；若目前剩餘派遣次數不足以規劃指定顆數，Bot 會回覆目前可安排的最大顆數，例如「⚠️ 無法規劃 3 顆活動巨菇。⋯目前可安排：2 顆。」。

## 加入群組

Bot 加入群組時：

- 自動在 Supabase 建立該群組的預設玩家資料（若尚未存在）。
- 自動發送歡迎訊息與快速指令說明。
- 若群組已有資料，既有剩餘次數與戰力不會被覆蓋。

## 離開群組

Bot 離開群組時：

- 保留該群組在 Supabase 的資料（永久保存）。
- 不會傳送任何離開回覆。

## 更新提示

修改次數後：

- 自動顯示所有玩家的剩餘次數。
- 次數歸零時顯示提醒。
- 恢復至 3 次時顯示最大次數提醒。

## 本機執行

1. 安裝 Node.js 20。
2. 安裝依賴：

   ```bash
   npm install
   ```

3. 建立環境變數檔：

   ```bash
   cp .env.example .env
   ```

4. 在 `.env` 填入 LINE Channel access token、Channel secret，以及 Supabase 的 `SUPABASE_URL` 與 `SUPABASE_ANON_KEY`（見下方「Supabase 設定」）。
5. 啟動：

   ```bash
   npm start
   ```

本機服務預設在 `http://localhost:3000`；Webhook 路徑是 `/webhook`。要讓 LINE 從外網連到本機，可使用 ngrok 或 Cloudflare Tunnel。

## LINE Developers 設定

1. 到 [LINE Developers Console](https://developers.line.biz/console/) 建立 Provider 與 **Messaging API channel**。
2. 在 channel 的 **Messaging API** 頁面，發行並複製 **Channel access token**，填入 `LINE_CHANNEL_ACCESS_TOKEN`。
3. 在 **Basic settings** 頁面，複製 **Channel secret**，填入 `LINE_CHANNEL_SECRET`。
4. 在 Messaging API 設定中關閉 Auto-reply messages 與 Greeting messages（避免與 Bot 回覆混淆）。
5. 將 Bot 加入目標群組；必要時在 Messaging API 設定允許加入群組。

## Supabase 設定

Bot 的資料儲存在 Supabase（PostgreSQL）。部署前請先建立專案與資料表。

1. 到 [Supabase](https://supabase.com/) 註冊並建立一個新的 **Project**。
2. 在專案的 **SQL Editor**，貼上並執行 [`supabase/schema.sql`](supabase/schema.sql)，建立 `players` 資料表：

   ```sql
   create extension if not exists "pgcrypto";

   create table if not exists players (
     id uuid primary key default gen_random_uuid(),
     group_id text not null,
     player_name text not null,
     remaining integer not null default 3,
     power integer not null default 0,
     updated_at timestamptz not null default now(),
     unique (group_id, player_name)
   );

   create index if not exists players_group_id_idx on players (group_id);
   ```

3. 到專案的 **Settings → API**，取得兩個值：

   - **Project URL** → 對應環境變數 `SUPABASE_URL`
   - **anon public** API key → 對應環境變數 `SUPABASE_ANON_KEY`

4. 這兩個值分別填入本機 `.env` 與 Render 的 Environment Variables，**請勿寫入程式或提交到 repository**。

## Render 部署

1. 將專案 Push 到 GitHub。
2. 開啟 [Render Dashboard](https://dashboard.render.com/)，選擇 **New +** → **Web Service**，連結 repository。
3. 設定服務：

   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
   - **Health Check Path**：`/health`

4. 在 **Environment Variables** 手動新增：

   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

   由你自行在 Render Dashboard 填入值；不要將任何值寫入 repository、`render.yaml` 或 README。

5. 開始部署。完成後取得服務網址，例如：

   ```text
   https://xxxx.onrender.com
   ```

6. 到 LINE Developers Console 的 Messaging API 設定 **Webhook URL**：

   ```text
   https://xxxx.onrender.com/webhook
   ```

   按下 **Verify** 確認成功，接著開啟 **Use webhook**。

## 部署完成測試

將 Bot 加入群組後，依序測試以下訊息，確認每一項皆有正常回覆：

```text
菇
菇 幫助
菇 玩家
菇 查詢
菇 小蓁
菇 小蓁 -1
```

## 注意事項

- 資料儲存在 Supabase（PostgreSQL），永久保存；Render 重啟、重新部署或 free instance 休眠後都不會遺失。
- 排程集中於 `src/jobs/`：每日 `00:00`（`Asia/Taipei`）會將所有玩家的剩餘次數重設為 3 次（不影響戰力）；每月 1 日 `00:00` 有一支預留的 Monthly Scheduler，目前僅輸出 log，不重置任何資料。
- Webhook 簽章由 `@line/bot-sdk` middleware 驗證；請勿將 Channel secret 放進前端或提交 `.env`。
- Render 免費方案可能因閒置而休眠；第一次收到 LINE 訊息時，Bot 可能需要數秒喚醒，喚醒完成後即可正常使用。
