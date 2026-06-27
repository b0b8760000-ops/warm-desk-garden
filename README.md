# Warm Desk Garden

React + Vite + TypeScript prototype for a gentle personal notes, folders,
chat, friends, albums, and calendar app. The backend architecture is MongoDB
Atlas first, with Appwrite for Auth, Storage, Functions, and Email Messaging.
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
npx tsc -p functions/api/tsconfig.json
```

## Environment

Frontend environment values are public Appwrite identifiers only. Copy
`.env.example` to `.env.local` if you want to set them by hand:

For the full MongoDB Atlas + Appwrite Cloud education setup using GitHub
`b0b8760000-ops`, see [BACKEND_SETUP.md](./BACKEND_SETUP.md).

```text
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a39ed84003504b380f9
VITE_APPWRITE_BUCKET_ID=warm-desk-garden-files
VITE_APPWRITE_API_FUNCTION_ID=warm-desk-garden-api
```

Do not put backend secrets in frontend `.env.local`. For local backend setup,
copy `.env.backend.example` to `.env.backend.local`, fill the secrets there, and
keep that file out of Git:

```text
MONGODB_URI
APPWRITE_API_KEY
MONGODB_DB_NAME=warm_desk_garden
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a39ed84003504b380f9
APPWRITE_EMAIL_TOPIC_ID
```

For GitHub deployment later, add the same secret names in GitHub repository
Secrets instead of committing any `.env` file that contains real values.

Email/Gmail reminders use Appwrite Messaging through an Email provider or SMTP.
Firebase is intentionally not part of the first version.

## Data Model

MongoDB collections used by the Function API:

- `profiles`, `folders`, `notes`
- `chatPosts`, `chatReplies`
- `friendships`
- `albums`, `photos`
- `calendarEvents`, `calendarTasks`, `eventInvites`
- `notifications`, `reminderJobs`

## Appwrite Function

The Function lives in `functions/api` and exposes routes for:

- `/me`
- `/folders`
- `/notes`
- `/chat-posts`
- `/friends`
- `/albums`
- `/photos`
- `/calendar/events`
- `/calendar/tasks`
- `/calendar/invites`
- `/notifications`

Deploy and configure the backend with:

```powershell
.\scripts\appwrite-bootstrap.ps1
```

The script creates the Appwrite Storage bucket, creates the Function, writes the
Function variables, writes `.env.local`, and deploys `functions/api`.
