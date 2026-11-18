import htmx from 'htmx.org'

import type { Side } from './game.ts'
import { defultMovePrompt, defaultDrawOfferPrompt } from './prompt.ts'
import { createSession } from './session.ts'
import { createEndpointBot } from './endpoint.ts'
import type { EndpointConfig } from './endpoint.ts'

declare global {
    interface Window {
        htmx: typeof htmx
    }
}

window.htmx = htmx

const apiEndpointEl = document.getElementById('api-endpoint') as HTMLInputElement
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement
const modelNameEl = document.getElementById('ai-model') as HTMLInputElement

const moveTemplateEl = document.getElementById(
    'move-prompt-block'
) as HTMLTextAreaElement | null
const drawTemplateEl = document.getElementById(
    'draw-prompt-block'
) as HTMLTextAreaElement | null

if (moveTemplateEl) {
    moveTemplateEl.value = defultMovePrompt
}
if (drawTemplateEl) {
    drawTemplateEl.value = defaultDrawOfferPrompt
}

/** the side picked in the sidebar; only takes effect when a game starts */
const chosenSide = (): Side => {
    const picked = document.querySelector<HTMLInputElement>(
        'input[name="player-side"]:checked'
    )
    if (picked?.value === 'random') {
        return Math.random() < 0.5 ? 'white' : 'black'
    }
    return picked?.value === 'black' ? 'black' : 'white'
}

const readConfig = (): EndpointConfig => {
    const endpoint = apiEndpointEl?.value || ''
    const apiKey = apiKeyEl?.value || ''
    const model = modelNameEl?.value || ''
    const prompt = moveTemplateEl?.value || ''
    return { endpoint, apiKey, model, prompt }
}

const boardEl = document.getElementById('chessboard')

if (boardEl) {
    const session = createSession(boardEl, createEndpointBot(readConfig))

    // same action as Start Game, just reachable from the move history tab
    const newGame = () => session.startGame(chosenSide())

    document.getElementById('start-game')?.addEventListener('click', newGame)
    document.getElementById('new-game')?.addEventListener('click', newGame)
    document.getElementById('resign')?.addEventListener('click', session.resign)
    document
        .getElementById('draw')
        ?.addEventListener('click', session.offerDraw)
}
