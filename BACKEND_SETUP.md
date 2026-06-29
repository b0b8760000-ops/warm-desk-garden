# Warm Desk Garden Backend Setup

This project now uses Render as the single public website and API entry point.
GitHub Pages is no longer used.

## Architecture

- Render Web Service: serves the built React app from `dist`, exposes `/api/*`,
  and hosts Socket.IO at `/socket.io`.
- MongoDB Atlas: stores all workspace records and relationships, including
  profiles, friendships, folders, notes, reflections, chat, albums, photos,
  calendar events, tasks, invites, and notifications.
- Appwrite Cloud: provides Auth, Storage, and optional Email Messaging. Storage
  uploads are handled by the Render backend, not directly by the browser.
- GitHub: stores source code and runs CI only. It does not deploy the site to
  GitHub Pages.

## Render Service

Use the existing free Render service or create one from this repository:

```text
Source: https://github.com/b0b8760000-ops/warm-desk-garden
Branch: main
Build Command: npm ci --include=dev && npm run build && npm run server:build
Start Command: npm run server:start
Instance Type: Free
```

The Render URL becomes the website URL. The same origin also serves API calls,
so the frontend can call `/api/...` without `VITE_RENDER_API_URL`.

## Render Environment Variables

Set these in Render. Do not commit real secret values to Git:

```text
NODE_ENV=production
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_API_KEY=<Render secret>
APPWRITE_BUCKET_ID=warm-desk-garden-files
MONGODB_URI=<Render secret>
MONGODB_DB_NAME=warm_desk_garden
APPWRITE_EMAIL_TOPIC_ID=<optional>
```

`APPWRITE_API_KEY` needs Storage file permissions and any Appwrite server
permissions used by backend setup scripts. `MONGODB_URI` comes from MongoDB
Atlas.

## Local Development

Frontend-only Vite development:

```powershell
npm install
npm run dev
```

Full backend build check:

```powershell
npm run build
npm run server:build
npm run server:start
```

For local backend secrets, copy `.env.backend.example` to `.env.backend.local`
and fill values there. Keep `.env.backend.local` out of Git.

## File Upload Flow

1. Browser asks Appwrite Auth for a JWT.
2. Browser sends `multipart/form-data` to `POST /api/files`.
3. Render verifies the Appwrite JWT.
4. Render checks accepted friends in MongoDB.
5. Render uploads the file to Appwrite Storage with owner and accepted-friend
   read permissions.
6. Render returns file metadata to the browser.
7. The app stores the metadata in MongoDB collections such as `noteAttachments`,
   `photos`, or `reflectionPhotos`.

This keeps Appwrite Storage permission generation out of the frontend.

## MongoDB Collection Map

```text
profiles
friendships
friendGroups
folders
notes
noteAttachments
reflections
reflectionPhotos
chatPosts
chatReplies
chatThreads
chatMessages
albums
photos
calendarEvents
calendarTasks
eventInvites
notifications
reminderJobs
```

Calendar data stays in MongoDB. Appwrite is not used as the calendar database.

## Appwrite Storage Bucket

Use one bucket for now:

```text
warm-desk-garden-files
```

Files are categorized in returned metadata with:

```text
avatars
backgrounds
notes
journals
chat
albums
pdfs
```

The category is stored in MongoDB metadata; it is not a replacement for MongoDB
ownership or visibility rules.
