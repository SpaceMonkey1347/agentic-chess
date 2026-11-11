import { generateText } from 'ai'
import { Chess } from 'chess.js'

const game = new Chess()

const promptStartEl = document.getElementById(
    'instruction-prompt-block'
) as HTMLInputElement | null
const promptMoveEl = document.getElementById(
    'move-prompt-block'
) as HTMLInputElement | null

const whitePlayerPrompt = `I will play as white and you will play as black.`

const blackPlayerPrompt = `I will play as black and you will play as white.`

let lastMove = (move?: string) => {
    return move ? `\n\n${move}` : ''
}

let playerPrompt = whitePlayerPrompt

const promptStart = () => {
    return `Let's play chess! ${playerPrompt}
Use standard algebraic notation for all moves. Strictly follow all FIDE chess rules.
Output ONLY your move, no move numbers, no board, no explanations.`
}

const promptMove = () => {
    return `FEN: ${game.fen()}\n\nLegal Moves:\n${game.moves()}`
}

promptStartEl!.value = promptStart()
