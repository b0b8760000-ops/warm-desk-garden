# Warm Desk Garden Backend Setup

這份專案目前採用免費優先部署：

- GitHub Pages：前端網站。
- Render Free Web Service：Express API + Socket.IO 即時聊天。
- MongoDB Atlas：主要資料庫。
- Appwrite Cloud：Auth、Storage、Email Messaging。

目前 Render 免費服務沿用舊的 `defect-system` 服務，不新增第二個服務，也不需要填付款資料。

```text
Render API URL: https://defect-system-bco5.onrender.com
GitHub repo: https://github.com/b0b8760000-ops/warm-desk-garden
```

## Render 設定

在既有 Render Web Service `defect-system` 裡改成：

```text
Source: https://github.com/b0b8760000-ops/warm-desk-garden
Branch: main
Build Command: npm ci --include=dev && npm run server:build
Start Command: npm run server:start
Instance Type: Free
```

Render Environment Variables：

```text
NODE_ENV=production
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_API_KEY=<貼到 Render，不要放進 Git>
MONGODB_URI=<貼到 Render，不要放進 Git>
MONGODB_DB_NAME=warm_desk_garden
CORS_ORIGIN=https://b0b8760000-ops.github.io
```

`APPWRITE_EMAIL_TOPIC_ID` 可先不填。沒有 Email topic 時，主要資料功能不會因此不能用。

## GitHub Pages 設定

`.github/workflows/pages.yml` 會把前端 build 成 GitHub Pages，並使用：

```text
VITE_RENDER_API_URL=https://defect-system-bco5.onrender.com
```

如果以後 Render 網址改了，要同步改：

- `.env.example`
- `.github/workflows/pages.yml`
- `README.md`

## 免費版限制

Render Free Web Service 可用於 API 與 Socket.IO，但會有閒置休眠，第一次喚醒會慢一些。

第一版先不開：

- Render Background Worker
- Render Cron Job
- 任何需要信用卡或付款資料的 Render 服務

需要長時間背景任務時，可以之後再評估：

- Render 付費 worker/cron
- GitHub Actions scheduled workflow
- Appwrite Functions 排程

## Secret 安全

不要把真實 secret 寫入 GitHub repo。

本機可以用：

```text
.env.backend.local
```

GitHub repo 和 `.env.backend.example` 只放空白範例。

如果曾經把真實 MongoDB URI 或 Appwrite API Key commit 到 GitHub，請到 MongoDB Atlas 與 Appwrite 重新產生新的 key/password，舊的刪掉。
