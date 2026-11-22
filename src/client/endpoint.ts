import type { Chess } from 'chess.js'
import type { MoveSource, Side } from './game.ts'

import { substituteKeywords, defultMovePrompt } from './prompt.ts'

export type EndpointConfig = {
    endpoint: string
    apiKey: string
    model: string
    prompt: string
}

const sanRegex =
    /\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g
const keywordRegex =
    /\b(yes|no|accept|decline|draw|\(=\)|resign|0-1|1-0|1\/2-1\/2|0-0|1\/2-0|0-1\/2)\b/gi

function extractMove(prompt: string): string | null {
    const moves = prompt.match(sanRegex) || ''
    return moves[moves?.length - 1]
}

// TODO: allow the bot to offer draw and resign
function extractAction(prompt: string): string | null {
    const keywords = prompt.match(keywordRegex) || ''
    return keywords[keywords.length - 1]
}

export function createEndpointBot(getConfig: () => EndpointConfig): MoveSource {
    const endpointBot: MoveSource = {
        async pickMove(game: Chess): Promise<string | null> {
            const cfg = getConfig()
            const playerSide: Side = game.turn() === 'w' ? 'black' : 'white'
            const prompt = substituteKeywords(game, cfg.prompt, playerSide)
            const res = await fetch('/api/move', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...cfg, prompt }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(`body.error ?? HTTP ${res.status}`)
            const move = extractMove(String(body.text ?? ''))
            try {
                game.move(move)
                game.undo()
            } catch (error) {
                throw new Error(
                    `no legal move in: ${String(body.text).slice(0, 120)}`
                )
            }
            return move
        },
        async takeTurn(game: Chess): Promise<string | null> {
            return this.pickMove(game)
        },
    }
    return endpointBot
}
