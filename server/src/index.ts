import 'dotenv/config'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { apiRouter } from './api.js'
import { getCurrentUserFromRequest } from './auth.js'
import { collections } from './collections.js'
import { buildAllowedOrigins, isCorsOriginAllowed } from './corsPolicy.js'
import { getDb } from './db.js'
import { chatPostRooms } from './security.js'

const app = express()
const allowedOrigins = buildAllowedOrigins(process.env.CORS_ORIGIN ?? '')
const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => {
  callback(null, isCorsOriginAllowed(origin, allowedOrigins))
}

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use('/api', apiRouter)

const serverDistDir = path.dirname(fileURLToPath(import.meta.url))
const clientDistPath =
  [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '..', 'dist'),
    path.resolve(serverDistDir, '..', '..', 'dist'),
  ].find((candidate) => existsSync(path.join(candidate, 'index.html'))) ??
  path.resolve(process.cwd(), 'dist')

if (process.env.NODE_ENV === 'production' && existsSync(path.join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath))
  app.get(/^(?!\/api)(?!\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
}

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next
  const status =
    typeof error === 'object' && error && 'status' in error
      ? Number(error.status)
      : 500
  const message = error instanceof Error ? error.message : 'Unexpected error'
  res.status(status).json({ error: message })
}
app.use(errorHandler)

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
})

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    } as express.Request
    socket.data.user = await getCurrentUserFromRequest(req)
    next()
  } catch (error) {
    next(error instanceof Error ? error : new Error('Socket authentication failed.'))
  }
})

io.on('connection', (socket) => {
  const user = socket.data.user as { id: string; email: string }
  socket.join(`user:${user.id}`)

  socket.on('chat:send', async (payload, callback) => {
    try {
      const db = await getDb()
      const now = new Date().toISOString()
      const post = {
        ...payload,
        ownerId: user.id,
        createdAt: now,
        updatedAt: now,
      }
      const result = await db.collection(collections.chatPosts).insertOne(post)
      const savedPost = { ...post, id: result.insertedId.toHexString() }
      for (const room of chatPostRooms(savedPost)) {
        io.to(room).emit('chat:post', savedPost)
      }
      callback?.({ ok: true, post: savedPost })
    } catch (error) {
      callback?.({
        ok: false,
        error: error instanceof Error ? error.message : 'Chat send failed.',
      })
    }
  })
})

const port = Number(process.env.PORT ?? 10000)
httpServer.listen(port, () => {
  console.log(`Warm Desk Garden API listening on ${port}`)
})
