import app from './app.js'
import { createServer } from 'node:http'
import { Server } from 'socket.io'

const server = createServer(app)
const io = new Server(server)

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost'

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`)
})
