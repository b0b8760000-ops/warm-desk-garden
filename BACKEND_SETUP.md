# Warm Desk Garden 後端設定

本專案的後端採用：

- MongoDB Atlas：主要資料庫，儲存資料夾、筆記、心得、聊天、好友、相簿、行事曆等資料。
- Appwrite Cloud：Auth、Storage、Functions、Email Messaging。
- 第一版不使用 Firebase。

目前專案已經預先固定：

```text
Appwrite endpoint: https://sgp.cloud.appwrite.io/v1
Appwrite project id: 6a39ed84003504b380f9
Storage bucket id: warm-desk-garden-files
Function id: warm-desk-garden-api
MongoDB database name: warm_desk_garden
```

你最後只需要準備 2 個必要 secret，外加 1 個可選值：

```text
Appwrite API Key
MongoDB Atlas MONGODB_URI
APPWRITE_EMAIL_TOPIC_ID（可選，沒有 Email provider 時可先留空）
```

## Secret 放在哪裡

不要把 MongoDB URI 或 Appwrite API Key 放進前端 `.env.local`。

照你習慣的方式，本機後端 secret 放在：

```text
.env.backend.local
```

這個檔案符合 `.gitignore` 的 `*.local` 規則，不會被上傳 GitHub。

先複製範例：

```powershell
Copy-Item .env.backend.example .env.backend.local
```

然後在 VS Code 打開 `.env.backend.local`，填入：

```env
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_API_KEY=貼你的 Appwrite API secret
MONGODB_URI=貼你的 MongoDB URI
MONGODB_DB_NAME=warm_desk_garden
APPWRITE_EMAIL_TOPIC_ID=
```

`APPWRITE_EMAIL_TOPIC_ID` 目前可以留空。

`scripts/appwrite-bootstrap.ps1` 會讀 `.env.backend.local`，再把 secret 寫入 Appwrite Function variables：

```text
MONGODB_URI
APPWRITE_API_KEY
```

前端 `.env.local` 只保存公開設定：

```text
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a39ed84003504b380f9
VITE_APPWRITE_BUCKET_ID=warm-desk-garden-files
VITE_APPWRITE_API_FUNCTION_ID=warm-desk-garden-api
```

## 一次性部署指令

在專案根目錄執行：

```powershell
.\scripts\appwrite-bootstrap.ps1
```

腳本會做這些事：

- 設定 Appwrite CLI client。
- 建立或確認 Storage bucket `warm-desk-garden-files`。
- 建立或確認 Function `warm-desk-garden-api`。
- 寫入 Function variables。
- 寫入前端 `.env.local`。
- 部署 `functions/api`。

如果 `.env.backend.local` 已經填好，執行時只會詢問還缺的值：

```text
APPWRITE_EMAIL_TOPIC_ID (optional, press Enter to skip)
```

如果 `APPWRITE_EMAIL_TOPIC_ID` 沒有要用，直接按 Enter。

如果 `.env.backend.local` 沒有填 `APPWRITE_API_KEY` 或 `MONGODB_URI`，腳本仍會用隱藏輸入詢問。

## GitHub Secrets

之後如果要用 GitHub Actions 部署，不要把 `.env.backend.local` 上傳到 repo。

請到 GitHub repo：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

新增這些 Secrets：

```text
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_API_KEY=<Appwrite API secret>
MONGODB_URI=<MongoDB URI>
MONGODB_DB_NAME=warm_desk_garden
APPWRITE_EMAIL_TOPIC_ID=<可選>
```

## Appwrite API Key 去哪裡拿

在 Appwrite Cloud：

1. 進入 project `RetroGram` / `6a39ed84003504b380f9`。
2. 左側點 `設定`。
3. 找 `API keys` 或 `API 金鑰`。
4. 建立新的 server API key。
5. 建議名稱：`warm-desk-garden-bootstrap`。
6. 權限至少需要：

```text
users.read
storage.read
storage.write
functions.read
functions.write
messaging.read
messaging.write
```

如果 Appwrite UI 提供更細的 scopes，保守做法是先勾選與 Users、Storage、Functions、Messaging 相關的 read/write 權限。

API key 只會顯示一次。複製後貼到腳本的 `Appwrite API Key (hidden)`。

## MongoDB URI 去哪裡拿

在 MongoDB Atlas：

1. 進入 cluster `uhaa`。
2. 點 `連接`。
3. 選 `Driver` / `司機`。
4. Driver 選 `Node.js`。
5. 複製 connection string。
6. 把 `<password>` 換成你的 database user 密碼。
7. 建議把 database name 加在 host 後面：

```text
mongodb+srv://<username>:<password>@<cluster-host>/warm_desk_garden?retryWrites=true&w=majority
```

最後貼到腳本的 `MongoDB Atlas MONGODB_URI (hidden)`。

如果還沒有 database user：

1. MongoDB Atlas 左側進入 `資料庫和網路訪問`。
2. 建立 database user。
3. 建議 username：`warmdesk_app`。
4. 密碼由你自己設定並保存。
5. 權限可先給該 project/cluster 的 readWrite。

如果還沒有允許目前網路：

1. MongoDB Atlas 左側進入 `資料庫和網路訪問`。
2. 切到 Network Access。
3. 新增目前 IP address。

## Email / Gmail 提醒

第一版不加 Firebase。Email/Gmail 提醒走 Appwrite Messaging。

如果你還沒設定 Email provider 或 SMTP，腳本的 `APPWRITE_EMAIL_TOPIC_ID` 可以直接留空。主要功能仍可運作，提醒會先保留站內提醒。

如果之後要 Gmail/Google Workspace：

1. Appwrite 左側進入 `訊息傳遞`。
2. 建立 Email provider 或 SMTP provider。
3. 建立/確認 topic。
4. 把 topic id 填入 `APPWRITE_EMAIL_TOPIC_ID`。

## MongoDB Collections

Function API 會使用這些 collections；MongoDB 會在第一次寫入時自動建立：

```text
profiles
folders
notes
chatPosts
chatReplies
friendships
albums
photos
calendarEvents
calendarTasks
eventInvites
notifications
reminderJobs
```

## 部署後確認

部署完成後：

```powershell
npm run dev
```

打開：

```text
http://127.0.0.1:5173
```

確認流程：

1. Appwrite Auth 可註冊 / 登入。
2. 新增資料夾。
3. 從書櫃點資料夾進入筆記區。
4. 新增筆記，上傳照片或 PDF。
5. 新增心得與照片。
6. 新增聊天貼文。
7. 新增相簿照片。
8. 新增行事曆事件或任務。
9. 回 MongoDB Atlas Data Explorer 查看 collections 是否出現資料。
