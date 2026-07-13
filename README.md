# Pikmin LINE Bot

一個可部署到 Render 的 LINE Messaging API Bot。它會依 LINE 群組分開記錄固定玩家名單的當日剩餘次數；資料存放於記憶體 `Map`，每天台灣時間凌晨重設為 3 次，也會在服務重新啟動後重設。

## Changelog

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
| `菇 小蓁 2` | 小蓁直接設為 2 次（只接受 0～3） |
| `菇 小蓁 out` | 小蓁直接設為 0 次；也支援 `OUT`、`Out` |
| `菇 全部 +1` | 所有玩家各加 1 次，最高為 3 |
| `菇 小蓁 2 牙齒 out jun 1` | 一次修改多位玩家 |
| `菇 小蓁` | 查詢小蓁的剩餘次數 |
| `菇 查詢` | 依固定玩家順序，列出該群組所有玩家的剩餘次數 |
| `菇 玩家` | 顯示固定玩家名單 |
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

## 加入群組

Bot 加入群組時：

- 自動建立該群組的預設玩家資料。
- 自動發送歡迎訊息與快速指令說明。
- 若群組已有資料，既有剩餘次數不會被覆蓋。

## 離開群組

Bot 離開群組時：

- 自動清除該群組的記憶體資料。
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

4. 在 `.env` 填入 LINE Channel access token 與 Channel secret。
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

- 資料只存在記憶體，不使用資料庫；Render 重啟、重新部署或 free instance 休眠後都會遺失資料。
- 每日 `00:00`（`Asia/Taipei`）會將所有固定玩家重設為 3 次。
- Webhook 簽章由 `@line/bot-sdk` middleware 驗證；請勿將 Channel secret 放進前端或提交 `.env`。
- Render 免費方案可能因閒置而休眠；第一次收到 LINE 訊息時，Bot 可能需要數秒喚醒，喚醒完成後即可正常使用。
