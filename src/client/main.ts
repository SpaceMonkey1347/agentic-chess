import './htmx.ts'

import { createBoard } from './board.ts'
import { randomBot } from './bot.ts'
import { defultPromt } from './prompt.ts'
import './moveHistory.ts'

const promptTemplateEl = document.getElementById(
    'instruction-prompt-block'
) as HTMLTextAreaElement | null

if (promptTemplateEl) {
    promptTemplateEl.value = defultPromt
}

/** the side picked in the sidebar; only takes effect when a game starts */
const chosenSide = (): 'white' | 'black' => {
    const picked = document.querySelector<HTMLInputElement>(
        'input[name="player-side"]:checked'
    )
    return picked?.value === 'black' ? 'black' : 'white'
}

const boardEl = document.getElementById('board-1')

if (boardEl) {
    const board = createBoard(boardEl, randomBot)

    // same action as Start Game, just reachable from the move history tab
    const newGame = () => board.startGame(chosenSide())

    document.getElementById('start-game')?.addEventListener('click', newGame)
    document.getElementById('new-game')?.addEventListener('click', newGame)
    document.getElementById('resign')?.addEventListener('click', board.resign)
    document.getElementById('draw')?.addEventListener('click', board.offerDraw)
}
