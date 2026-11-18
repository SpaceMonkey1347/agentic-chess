import express from 'express'
import path from 'node:path'

import { requestMove } from './ai.js'

const app = express()
const __dirname = import.meta.dirname

app.use(express.static(path.join(__dirname, '../../dist')))
app.use(express.static(path.join(__dirname, '../public')))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.post('/api/move', async (req, res) => {
    const { endpoint, apiKey, model, prompt } = req.body ?? {}
    if (!endpoint || !prompt) {
        return res
            .status(400)
            .json({ error: 'endpoint and prompt are required' })
    }
    try {
        const text = await requestMove({ endpoint, apiKey, model, prompt })
        res.json({ text })
    } catch (err) {
        res.status(502).json({ error: err?.message ?? String(err) })
    }
})

export default app
