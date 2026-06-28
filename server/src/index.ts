import 'dotenv/config'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { apiRouter } from './api.js'
import { getCurrentUserFromRequest } from './auth.js'
import { collections } from './collections.js'
import { getDb } from './db.js'
import { chatPostRooms } from './security.js'

const app = express()
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use('/api', apiRouter)

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
    origin: allowedOrigins.length ? allowedOrigins : true,
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
