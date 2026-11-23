import type { Chess } from 'chess.js'
import type { DrawDecision, MoveSource, Side, TurnDecision } from './game.ts'

import { opposite } from './game.ts'
import { substituteKeywords } from './prompt.ts'

export type EndpointConfig = {
    endpoint: string
    apiKey: string
    model: string
    /** the move template */
    prompt: string
    /** the template used to answer a draw offer */
    drawPrompt: string
}

const sanRegex =
    /\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![a-zA-Z0-9])/g
/** what a template reply can say, beyond the move itself */
export interface BotReply {
    /** the move in standard algebraic notation, or null when there is none */
    move: string | null
    /** the answer to a draw offer, when the template asked for one */
    draw?: 'accept' | 'decline'
    /** the AI offers the player a draw */
    offerDraw?: boolean
    /** the AI resigns */
    resign?: boolean
}

/**
 * Models decorate replies in ways the templates do not ask for: markdown
 * emphasis, list bullets, code fences. Strip that before reading the keys.
 */
function normalize(text: string): string {
    return text
        .replace(/```[a-z]*\n?/gi, '')
        .replace(/[*`]/g, '')
        .replace(/^\s*[-•]\s*/gm, '')
}

/**
 * The reply is one `KEY: value` per line, but a model may also put them on a
 * single line separated by pipes. Split on both and match each piece, so a
 * value can never swallow the next key.
 */
function field(text: string, key: string): string | null {
    const pattern = new RegExp(`^${key}\\s*[:=]\\s*(.*)$`, 'i')
    for (const piece of normalize(text).split(/[|\n]/)) {
        const match = piece.trim().match(pattern)
        if (match) {
            return match[1].trim()
        }
    }
    return null
}

/** the last standard-algebraic-looking token in the text */
function lastSan(text: string): string | null {
    const moves = normalize(text).match(sanRegex)
    return moves ? (moves[moves.length - 1] ?? null) : null
}

function readDraw(text: string): 'accept' | 'decline' | undefined {
    const value = field(text, 'DRAW')
    if (!value) {
        return undefined
    }
    if (/^(accept|yes|true|1\/2)/i.test(value)) {
        return 'accept'
    }
    if (/^(decline|no|false|reject)/i.test(value)) {
        return 'decline'
    }
    return undefined
}

function readYesNo(text: string, key: string): boolean | undefined {
    const value = field(text, key)
    if (!value) {
        return undefined
    }
    if (/^(yes|true|offer|1)\b/i.test(value)) {
        return true
    }
    if (/^(no|false|0)\b/i.test(value)) {
        return false
    }
    return undefined
}

/**
 * Read a reply in the format the templates ask for. The `MOVE:` key wins; a
 * reply without one falls back to the last move-like token, so a hand-written
 * template that only asks for the move still works.
 */
export function parseReply(text: string): BotReply {
    const move = field(text, 'MOVE')
    return {
        move: lastSan(move ?? text),
        draw: readDraw(text),
        offerDraw: readYesNo(text, 'OFFER DRAW'),
        resign: readYesNo(text, 'RESIGN'),
    }
}

export function createEndpointBot(getConfig: () => EndpointConfig): MoveSource {
    /** send one filled-in template and return the raw reply */
    const ask = async (
        game: Chess,
        template: string,
        playerSide: Side
    ): Promise<string> => {
        const cfg = getConfig()
        const prompt = substituteKeywords(game, template, playerSide)
        const res = await fetch('/api/move', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...cfg, prompt }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        return String(body.text ?? '')
    }

    /** the AI is always the side to move when its move template is used */
    const sideToMove = (game: Chess): Side =>
        game.turn() === 'w' ? 'white' : 'black'

    /** throw unless the move is legal here, so a bad reply is loud */
    const requireLegal = (game: Chess, move: string | null, text: string) => {
        if (!move) {
            throw new Error(`no move in: ${text.slice(0, 120)}`)
        }
        try {
            game.move(move)
            game.undo()
        } catch {
            throw new Error(`no legal move in: ${text.slice(0, 120)}`)
        }
    }

    const endpointBot: MoveSource = {
        async pickMove(game: Chess): Promise<string | null> {
            const text = await ask(
                game,
                getConfig().prompt,
                opposite(sideToMove(game))
            )
            const move = parseReply(text).move
            requireLegal(game, move, text)
            return move
        },
        async takeTurn(game: Chess): Promise<string | null> {
            return this.pickMove(game)
        },
        async turn(game: Chess): Promise<TurnDecision> {
            const text = await ask(
                game,
                getConfig().prompt,
                opposite(sideToMove(game))
            )
            const reply = parseReply(text)
            // a resignation needs no move, so a bad one cannot block it
            if (reply.move && !reply.resign) {
                requireLegal(game, reply.move, text)
            }
            return {
                move: reply.move,
                offerDraw: reply.offerDraw,
                resign: reply.resign,
            }
        },
        async respondToDraw(
            game: Chess,
            aiSide: Side
        ): Promise<DrawDecision | null> {
            const text = await ask(
                game,
                getConfig().drawPrompt,
                opposite(aiSide)
            )
            const reply = parseReply(text)
            return {
                move: reply.move,
                accept: reply.draw === 'accept',
            }
        },
    }
    return endpointBot
}
