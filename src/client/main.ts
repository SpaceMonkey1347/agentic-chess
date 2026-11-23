import htmx from 'htmx.org'

import type { Side } from './game.ts'
import { buildMovePrompt, defaultDrawOfferPrompt } from './prompt.ts'
import { createSession } from './session.ts'
import { createEndpointBot } from './endpoint.ts'
import type { EndpointConfig } from './endpoint.ts'

declare global {
    interface Window {
        htmx: typeof htmx
    }
}

window.htmx = htmx

const apiEndpointEl = document.getElementById(
    'api-endpoint'
) as HTMLInputElement
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement
const apiKeyToggleEl = document.getElementById(
    'api-key-visibility-toggle'
) as HTMLInputElement | null
const modelNameEl = document.getElementById('ai-model') as HTMLInputElement

apiKeyToggleEl?.addEventListener('change', () => {
    const revealed = apiKeyToggleEl.checked
    apiKeyEl.type = revealed ? 'text' : 'password'
    apiKeyToggleEl.setAttribute(
        'aria-label',
        revealed ? 'Hide API key' : 'Show API key'
    )
})

const moveTemplateEl = document.getElementById(
    'move-prompt-block'
) as HTMLTextAreaElement | null
const drawTemplateEl = document.getElementById(
    'draw-prompt-block'
) as HTMLTextAreaElement | null
const allowDrawOfferEl = document.getElementById(
    'allow-draw-offer-toggle'
) as HTMLInputElement | null
const allowResignEl = document.getElementById(
    'allow-resign-toggle'
) as HTMLInputElement | null

/**
 * The two toggles pick the move template variant: plain, draw, resign or both.
 * Toggling one reloads the textarea, so a hand-edited template gives way to the
 * variant the switches describe.
 */
const refreshMoveTemplate = () => {
    if (moveTemplateEl) {
        moveTemplateEl.value = buildMovePrompt({
            offerDraw: allowDrawOfferEl?.checked ?? false,
            resign: allowResignEl?.checked ?? false,
        })
    }
}

refreshMoveTemplate()
if (drawTemplateEl) {
    drawTemplateEl.value = defaultDrawOfferPrompt
}

allowDrawOfferEl?.addEventListener('change', refreshMoveTemplate)
allowResignEl?.addEventListener('change', refreshMoveTemplate)

document
    .getElementById('reset-move-template')
    ?.addEventListener('click', refreshMoveTemplate)
document
    .getElementById('reset-draw-template')
    ?.addEventListener('click', () => {
        if (drawTemplateEl) {
            drawTemplateEl.value = defaultDrawOfferPrompt
        }
    })

/**
 * The ? buttons open a help overlay. Kept brief: what the template is for, the
 * placeholders that get filled in, and the reply lines the parser reads.
 */
const templateHelp = {
    move: {
        title: 'Move Template',
        body:
            "<p>The prompt sent on the AI's turn, before each of its moves.</p>" +
            '<p>Placeholders are filled in before sending: <code>[FEN]</code>, ' +
            '<code>[PGN]</code>, <code>[moveHistory]</code>, ' +
            '<code>[lastMove]</code>, <code>[legalMoves]</code>, ' +
            '<code>[playerColor]</code>, <code>[aiColor]</code>.</p>' +
            '<p>Keep the reply-format lines — <code>MOVE:</code>, plus ' +
            '<code>OFFER DRAW:</code> and <code>RESIGN:</code> while their ' +
            "toggles are on. The AI's reply is read from them.</p>",
    },
    draw: {
        title: 'Draw Template',
        body:
            '<p>The prompt sent when your draw offer needs an answer. The AI ' +
            'makes its move and answers the offer in the same reply.</p>' +
            '<p>Same placeholders as the move template.</p>' +
            '<p>Keep the <code>MOVE:</code> and <code>DRAW:</code> reply lines ' +
            '— the reply is read from them.</p>',
    },
} as const

const helpDialog = document.getElementById(
    'template-help'
) as HTMLDialogElement | null
const helpTitle = document.getElementById('template-help-title')
const helpBody = helpDialog?.querySelector('.help-overlay-body')

document
    .querySelectorAll<HTMLButtonElement>('.icon-btn--info')
    .forEach((button) => {
        button.addEventListener('click', () => {
            const help =
                templateHelp[button.dataset.help as keyof typeof templateHelp]
            if (!help || !helpDialog) {
                return
            }
            if (helpTitle) {
                helpTitle.textContent = help.title
            }
            if (helpBody) {
                helpBody.innerHTML = help.body
            }
            helpDialog.showModal()
        })
    })

helpDialog
    ?.querySelector('.help-overlay-close')
    ?.addEventListener('click', () => helpDialog.close())

// clicking the backdrop (the dialog element itself) closes it
helpDialog?.addEventListener('click', (event) => {
    if (event.target === helpDialog) {
        helpDialog.close()
    }
})

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
    const drawPrompt = drawTemplateEl?.value || ''
    return { endpoint, apiKey, model, prompt, drawPrompt }
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
    document
        .getElementById('accept-draw')
        ?.addEventListener('click', () => session.answerDrawOffer(true))
    document
        .getElementById('decline-draw')
        ?.addEventListener('click', () => session.answerDrawOffer(false))
    document
        .getElementById('retry-ai-turn')
        ?.addEventListener('click', session.retryTurn)
}
