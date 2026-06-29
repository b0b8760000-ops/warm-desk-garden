# Warm Desk Garden

React + Vite + TypeScript prototype for a gentle personal notes, folders,
chat, friends, albums, and calendar app. The backend architecture is MongoDB
Atlas first, with Appwrite for Auth, Storage, and Email Messaging.
The app starts with an empty workspace by default; there is no restore-demo
entry point in the product UI.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Verification

```bash
npm test
npm run lint
npm run build
npm run server:build
```

## Environment

Frontend environment values are public Appwrite identifiers only. Copy
`.env.example` to `.env.local` if you want to set them by hand:

For the full MongoDB Atlas + Appwrite Cloud education setup using GitHub
`b0b8760000-ops`, see [BACKEND_SETUP.md](./BACKEND_SETUP.md).

```text
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a39ed84003504b380f9
```

Do not put backend secrets in frontend `.env.local`. For local backend setup,
copy `.env.backend.example` to `.env.backend.local`, fill the secrets there, and
keep that file out of Git:

```text
MONGODB_URI
APPWRITE_API_KEY
APPWRITE_BUCKET_ID=warm-desk-garden-files
MONGODB_DB_NAME=warm_desk_garden
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_EMAIL_TOPIC_ID
```

For Render deployment, add the same secret names in Render Environment
Variables instead of committing any `.env` file that contains real values.

Email/Gmail reminders use Appwrite Messaging through an Email provider or SMTP.
Firebase is intentionally not part of the first version.

## Data Model

MongoDB collections used by the Render API:

- `profiles`, `friendships`, `friendGroups`
- `folders`, `notes`, `noteAttachments`
- `reflections`, `reflectionPhotos`
- `chatPosts`, `chatReplies`, `chatThreads`, `chatMessages`
- `albums`, `photos`
- `calendarEvents`, `calendarTasks`, `eventInvites`
- `notifications`, `reminderJobs`

## API Routes

The Render backend exposes routes for:

- `/me`
- `/folders`
- `/notes`
- `/note-attachments`
- `/reflections`
- `/reflection-photos`
- `/chat-posts`
- `/chat-replies`
- `/chat-threads`
- `/chat-messages`
- `/friends`
- `/friend-groups`
- `/albums`
- `/photos`
- `/calendar/events`
- `/calendar/tasks`
- `/calendar/invites`
- `/notifications`

- `/files`

## Render Deployment

Render is the only public deployment target. It serves both the React app and
the backend API from one Web Service.

```bash
npm run build
npm run server:build
npm run server:start
```

`render.yaml` describes:

- `warm-desk-garden`: free Render Web Service for React static files, Express
  API, and Socket.IO.

The worker and cron source files are kept in `server/src`, but they are not
enabled in `render.yaml` because the current deployment path avoids paid Render
resources and payment-method prompts.

Set these Render environment variables:

```text
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_API_KEY=
APPWRITE_BUCKET_ID=warm-desk-garden-files
MONGODB_URI=
MONGODB_DB_NAME=warm_desk_garden
```

File uploads go through `POST /api/files`. The browser sends a file and
optional friend IDs; Render verifies the Appwrite session, checks accepted
friends in MongoDB, and then creates the Appwrite Storage file permissions.
The response includes file metadata (`fileId`, `bucketId`, `storagePath`,
`category`, `url`, `mimeType`, `size`, and `originalName`) that should be saved
in MongoDB records such as `noteAttachments`, `photos`, or `reflectionPhotos`.
