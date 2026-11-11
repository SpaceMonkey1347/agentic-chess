import express from 'express'
import path from 'node:path'

const app = express()
const __dirname = import.meta.dirname

app.use(express.static(path.join(__dirname, '../../dist')))
app.use(express.static(path.join(__dirname, '../public')))

app.use(express.urlencoded({ extended: true }))

export default app
