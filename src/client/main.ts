import htmx from 'htmx.org'

import { randomBot, switchableBot } from './game.ts'
import type { Side } from './game.ts'
import { buildMovePrompt, defaultDrawOfferPrompt } from './prompt.ts'
import { createSession } from './session.ts'
import type { GameState } from './session.ts'
import { checkConnection, createEndpointBot } from './endpoint.ts'
import type { CheckResult, ConfigField, EndpointConfig } from './endpoint.ts'

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

/** the inputs the connection check can point at, keyed by the field it names */
const configFields = {
    endpoint: apiEndpointEl,
    apiKey: apiKeyEl,
    model: modelNameEl,
} as const

const fieldLabels: Record<ConfigField, string> = {
    endpoint: 'API Endpoint',
    apiKey: 'API Key',
    model: 'Model Name',
}

const connectionResultEl = document.getElementById('connection-result')
const startButton = document.getElementById(
    'start-game'
) as HTMLButtonElement | null
const abortButton = document.getElementById(
    'abort-game'
) as HTMLButtonElement | null
const newGameButton = document.getElementById(
    'new-game'
) as HTMLButtonElement | null
const resignButton = document.getElementById(
    'resign'
) as HTMLButtonElement | null
const drawButton = document.getElementById('draw') as HTMLButtonElement | null
const regenerateButton = document.getElementById(
    'regenerate-move'
) as HTMLButtonElement | null
const cancelButton = document.getElementById(
    'cancel-ai-move'
) as HTMLButtonElement | null
const playRandomBotToggle = document.getElementById(
    'play-random-bot'
) as HTMLInputElement | null

const tabConfigEl = document.getElementById('tab-config') as HTMLInputElement | null
const tabSessionEl = document.getElementById('tab-session') as HTMLInputElement | null

const clearFieldErrors = () => {
    for (const el of Object.values(configFields)) {
        el?.classList.remove('field-invalid')
    }
}

/** clear the highlight everywhere, then mark the field the check blamed */
const markFieldInvalid = (field?: ConfigField) => {
    clearFieldErrors()
    if (field) {
        configFields[field]?.classList.add('field-invalid')
    }
}

/** replace the connection result box; an empty box hides itself via CSS */
const showConnectionResult = (
    kind: 'ok' | 'error',
    title: string,
    detail?: string,
    raw?: string
) => {
    if (!connectionResultEl) {
        return
    }
    connectionResultEl.className = `connection-result connection-result--${kind}`
    const dot = document.createElement('span')
    dot.className = 'connection-dot'
    const text = document.createElement('div')
    text.className = 'connection-text'
    const heading = document.createElement('strong')
    heading.textContent = title
    text.append(heading)
    if (detail) {
        const line = document.createElement('span')
        line.className = 'connection-detail'
        line.textContent = detail
        text.append(line)
    }
    if (raw) {
        const line = document.createElement('div')
        line.className = 'connection-error'
        line.textContent = raw
        text.append(line)
    }
    connectionResultEl.replaceChildren(dot, text)
}

const clearConnectionResult = () => {
    if (connectionResultEl) {
        connectionResultEl.className = 'connection-result'
        connectionResultEl.replaceChildren()
    }
}

/** the last state the session reported, so a failed check can restore it */
let gameState: GameState = {
    inProgress: false,
    over: false,
    thinking: false,
    canRegenerate: false,
}

/** show only the controls the current game state allows */
const renderGameState = (state: GameState) => {
    gameState = state
    const running = state.inProgress && !state.over
    if (startButton) {
        startButton.disabled = running
        startButton.textContent = running ? 'Game in progress' : 'Start Game'
    }
    if (abortButton) {
        abortButton.disabled = !running
    }
    // resign and draw only make sense while a game is live
    if (resignButton) {
        resignButton.disabled = !running
    }
    if (drawButton) {
        drawButton.disabled = !running
    }
    // a new game only makes sense once the last one is over
    if (newGameButton) {
        newGameButton.disabled = !state.over
    }
    // regenerate is offered while the AI is to move or has just moved
    if (regenerateButton) {
        regenerateButton.disabled = !state.canRegenerate
    }
    // cancel only while a request is actually in flight
    if (cancelButton) {
        cancelButton.hidden = !state.thinking
    }
}

const boardEl = document.getElementById('chessboard')

if (boardEl) {
    const focusSession = () => {
        if (tabConfigEl && tabSessionEl) {
            tabConfigEl.checked = false
            tabSessionEl.checked = true
        }
    }
    // the random bot stands in for the endpoint: the sidebar toggle picks
    // which one answers, decided per turn so it can be flipped mid-game
    const endpointBot = createEndpointBot(readConfig)
    const session = createSession(
        boardEl,
        switchableBot(() =>
            playRandomBotToggle?.checked ? randomBot : endpointBot
        ),
        { onStateChange: renderGameState }
    )

    /**
     * Start Game and New Game both go through the connection check, so a bad
     * endpoint, key or model is pointed at now instead of failing on the move.
     * The random bot talks to nobody, so it skips the check.
     */
    const startValidatedGame = async () => {
        clearFieldErrors()
        clearConnectionResult()
        if (playRandomBotToggle?.checked) {
            focusSession()
            session.startGame(chosenSide())
            return
        }
        if (startButton) {
            startButton.disabled = true
            startButton.textContent = 'Checking…'
        }
        let result: CheckResult
        try {
            result = await checkConnection(readConfig())
        } catch (error) {
            result = {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
        if (!result.ok) {
            markFieldInvalid(result.field)
            showConnectionResult(
                'error',
                result.field
                    ? `${fieldLabels[result.field]} looks wrong`
                    : 'Connection failed',
                result.field
                    ? 'Fix this field and try again.'
                    : 'Check the settings and try again.',
                result.error
            )
            // no game started, so hand the controls back as they were
            renderGameState(gameState)
            return
        }
        showConnectionResult('ok', 'Connected', 'The endpoint answered.')
        focusSession()
        session.startGame(chosenSide())
    }

    const start = () => void startValidatedGame()

    startButton?.addEventListener('click', start)
    newGameButton?.addEventListener('click', start)
    resignButton?.addEventListener('click', session.resign)
    abortButton?.addEventListener('click', session.resign)
    drawButton?.addEventListener('click', session.offerDraw)
    document
        .getElementById('accept-draw')
        ?.addEventListener('click', () => session.answerDrawOffer(true))
    document
        .getElementById('decline-draw')
        ?.addEventListener('click', () => session.answerDrawOffer(false))
    regenerateButton?.addEventListener('click', session.regenerate)
    cancelButton?.addEventListener('click', session.cancelTurn)
}
