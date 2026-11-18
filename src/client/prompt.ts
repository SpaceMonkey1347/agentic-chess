import type { Chess } from 'chess.js'
import type { Side } from './game'

type keywordEntry =
    string | string[] | ((game: Chess) => string | string[] | undefined)

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

/** the keywords that come from the position alone */
const keywords = new Map<string, keywordEntry>([
    ['FEN', fen],
    ['PGN', pgn],
    ['moveHistory', moveHistory],
    ['lastMove', lastMove],
    ['legalMoves', legalMoves],
])

/**
 * Fill the [keyword] placeholders in `prompt`. The side is passed in rather
 * than remembered here: the sidebar is the only place a side gets picked.
 */
export function substituteKeywords(
    game: Chess,
    prompt: string,
    playerColor: Side
): string {
    const aiColor: Side = playerColor === 'white' ? 'black' : 'white'
    const entries = new Map<string, keywordEntry>([
        ['playerColor', playerColor],
        ['aiColor', aiColor],
        ...keywords,
    ])
    return prompt.replaceAll(/\[\s*([a-zA-Z]+)\s*\]/g, (fullMatch, key) => {
        const entry = entries.get(key)
        if (!entry) {
            return fullMatch
        }
        if (typeof entry === 'function') {
            return String(entry(game) ?? '')
        }
        return String(entry ?? '')
    })
}

export const defultMovePrompt = `Let's play chess! \
I play as [playerColor] and you play as [aiColor]. \
Use standard algebraic notation for all moves. Strictly follow all FIDE chess rules. \
Output ONLY your move, no move numbers, no '...' no board, no explanations. \
Your move must be in legal moves.

FEN: [FEN]

legal moves: [[legalMoves]]

Your move.`

export const defaultDrawOfferPrompt = `You are currently playing chess, \
You are playing as [aiColor] and your opponent is playing as [playerColor]. \
Your opponent is offering a draw. Output ONLY either yes or no. \
Do NOT output ANYTHING other than yes or no.

FEN: [FEN]

legal moves: [[legalMoves]]

Do you accept the draw?`
