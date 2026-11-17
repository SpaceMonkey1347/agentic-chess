import type { Chess } from 'chess.js'

type keywordEntry =
    string | string[] | ((game: Chess) => string | string[] | undefined)

// default values
export let playerColor: 'white' | 'black' = 'white'
export let aiColor: 'white' | 'black' = 'black'

/** set the side the human plays; the ai takes the other one */
export function setPlayerSide(side: 'white' | 'black'): void {
    playerColor = side
    aiColor = side === 'white' ? 'black' : 'white'
}

const fen = (game: Chess): string => {
    return game.fen()
}

const pgn = (game: Chess): string => {
    return game.pgn()
}

const legalMoves = (game: Chess): string[] => {
    return game.moves()
}

const moveHistory = (game: Chess): string[] => {
    return game.history()
}

const lastMove = (game: Chess): string => {
    const history = game.history()
    return history[history.length - 1] || ''
}

const keywords = new Map<string, keywordEntry>([
    // read through getters so a side picked later shows up in the prompt
    ['playerColor', () => playerColor],
    ['aiColor', () => aiColor],
    ['FEN', fen],
    ['PGN', pgn],
    ['moveHistory', moveHistory],
    ['lastMove', lastMove],
    ['legalMoves', legalMoves],
])

export function substituteKeywords(game: Chess, prompt: string): string {
    return prompt.replaceAll(/\[\s*([a-zA-Z]+)\s*\]/g, (fullMatch, key) => {
        const entry = keywords.get(key)
        if (!entry) {
            return fullMatch
        }
        if (typeof entry === 'function') {
            return String(entry(game) ?? '')
        }
        return String(entry ?? '')
    })
}

export const defultPromt = `Let's play chess! I play as [playerColor] and you play as [aiColor]. \
Use standard algebraic notation for all moves. Strictly follow all FIDE chess rules. \
Output ONLY your move, no move numbers, no board, no explanations. \
Your move must be in legal moves.

FEN: [FEN]

legal moves: [[legalMoves]]

Your move.`
