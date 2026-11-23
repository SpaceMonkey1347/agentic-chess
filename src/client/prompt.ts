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

/**
 * The reply format every template asks for, one `KEY: value` per line. It is
 * parsed in endpoint.ts: keys are matched on their own line (or between pipes)
 * so prose around them cannot be mistaken for a move or an answer.
 */
const replyFormat = {
    move: 'MOVE: <your move in standard algebraic notation>',
    draw: 'DRAW: <accept or decline>',
    offerDraw: 'OFFER DRAW: <yes or no>',
    resign: 'RESIGN: <yes or no>',
}

/** the actions the AI is allowed to take, beyond moving */
export interface MovePromptOptions {
    /** the AI may offer a draw to the player */
    offerDraw?: boolean
    /** the AI may resign */
    resign?: boolean
}

/** the lines a reply must contain, in order, for the given options */
const replyLines = (options: MovePromptOptions): string =>
    [
        replyFormat.move,
        ...(options.offerDraw ? [replyFormat.offerDraw] : []),
        ...(options.resign ? [replyFormat.resign] : []),
    ].join('\n')

const actionNotes = (options: MovePromptOptions): string[] => {
    const notes: string[] = []
    if (options.offerDraw) {
        notes.push(
            'You may offer a draw: answer OFFER DRAW: yes when you want one, ' +
                'otherwise answer OFFER DRAW: no. A draw offer only ends the ' +
                'game if your opponent accepts it.'
        )
    }
    if (options.resign) {
        notes.push(
            'You may resign: answer RESIGN: yes only when the position is ' +
                'clearly lost, otherwise answer RESIGN: no. Resigning ends ' +
                'the game immediately and your move is ignored.'
        )
    }
    return notes
}

/**
 * A move template. The two flags add the optional actions, so the sidebar
 * toggles can compose the four variants (plain, draw, resign, both).
 */
export function buildMovePrompt(options: MovePromptOptions = {}): string {
    const notes = actionNotes(options)
    return [
        "Let's play chess!",
        'I play as [playerColor] and you play as [aiColor].',
        'Use standard algebraic notation for all moves. Strictly follow all FIDE chess rules.',
        'Your move must be one of the legal moves.',
        ...(notes.length ? ['', ...notes] : []),
        '',
        'Reply with ONLY these lines and nothing else:',
        replyLines(options),
        '',
        'FEN: [FEN]',
        '',
        'legal moves: [legalMoves]',
        '',
        'Your move.',
    ].join('\n')
}

/** the move template with no extra actions */
export const defaultMovePrompt = buildMovePrompt()

/**
 * The reply to a draw offer: the AI moves *and* answers the offer in the same
 * reply, so the game never has to wait for a second request.
 */
export const defaultDrawOfferPrompt = [
    'You are playing chess as [aiColor] against [playerColor],',
    'and [playerColor] has just offered a draw.',
    'Make your move and answer the offer in the same reply.',
    'Use standard algebraic notation for your move. Strictly follow all FIDE chess rules.',
    'Your move must be one of the legal moves.',
    '',
    'Reply with ONLY these two lines and nothing else:',
    replyFormat.move,
    replyFormat.draw,
    '',
    'FEN: [FEN]',
    '',
    'legal moves: [legalMoves]',
    '',
    'Your move and your answer to the draw offer.',
].join('\n')
