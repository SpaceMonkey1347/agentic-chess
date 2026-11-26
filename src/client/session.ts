import type { Key } from '@lichess-org/chessground/types'

import { askPromotion, createBoardView } from './board.ts'
import type { PositionView } from './board.ts'
import { createGame, opposite } from './game.ts'
import type {
    DrawDecision,
    MoveSource,
    PromotionPiece,
    Side,
    TurnDecision,
} from './game.ts'
import { createMoveHistory } from './history.ts'

/** how long the bot "thinks" before replying, so its move animates */
const BOT_MOVE_DELAY_MS = 300

export interface Session {
    /** reset and start a new game with the player on the given side */
    startGame(side: Side): void
    /** the player aborts game before thier first move */
    abort(): void
    /** the player gives up */
    resign(): void
    /** the player offers a draw */
    offerDraw(): void
    /** the player answers the AI's draw offer */
    answerDrawOffer(accept: boolean): void
    /** ask the AI for its move again, taking back its last one if it moved */
    regenerate(): void
    /** drop the in-flight AI move, leaving it the AI's turn */
    cancelTurn(): void
}

/** what the sidebar needs to know to show the right controls */
export interface GameState {
    /** a game is running: started and not yet concluded */
    inProgress: boolean
    /** the current game has ended */
    over: boolean
    /** an AI move is scheduled or in flight */
    thinking: boolean
    /** the AI's move can be asked for again: its turn, or it just moved */
    canRegenerate: boolean
    /** number of plys played */
    playerMoved: boolean
}

export interface SessionOptions {
    /** called on every change to the running / finished state */
    onStateChange?(state: GameState): void
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Runs a game against `bot` on the board in `element`: the player moves with
 * the mouse, the bot answers, and promotions go through the promotion dialog.
 */
export function createSession(
    element: HTMLElement,
    bot: MoveSource,
    options: SessionOptions = {}
): Session {
    const { onStateChange } = options
    const game = createGame()
    const view = createBoardView(element, {
        onMove: (orig: Key, dest: Key) => onPlayerMove(orig, dest),
    })

    let inProgress = false
    let thinking = false
    /** the request behind the current AI turn, so it can be cancelled */
    let botAbort: AbortController | null = null
    let botMoveToken = 0
    /** the side the player picked, until a new game changes it */
    let playingAs: Side = 'white'
    /** the ply under review, or null while the live position is on the board */
    let reviewing: number | null = null

    const playerSide = (): 'w' | 'b' => (playingAs === 'white' ? 'w' : 'b')
    const aiSide = (): Side => opposite(playingAs)
    const isPlayerTurn = () => game.turn() === playerSide() && !game.isOver()

    /** the live position, as the board needs to see it */
    const liveView = (): PositionView => ({
        fen: game.fen(),
        turn: game.turn(),
        orientation: playingAs,
        movableColor: playingAs,
        // no destinations while it is the bot's move, so a drag can only queue
        // a premove
        legalDests: isPlayerTurn() ? game.legalDests() : new Map(),
        lastMove: game.lastMove(),
        check: game.isCheck(),
        interactive: !game.isOver(),
    })

    /** an earlier position, frozen: nothing to drag, no destinations */
    const pastView = (ply: number): PositionView => {
        const position = game.positionAt(ply)
        return {
            fen: position.fen,
            turn: position.turn,
            orientation: playingAs,
            movableColor: playingAs,
            legalDests: new Map(),
            lastMove: position.lastMove,
            check: position.check,
            interactive: false,
        }
    }

    /** put the position after `ply` moves on the board; moves.length is live */
    const showPly = (ply: number) => {
        const total = game.moves().length
        reviewing = ply >= total ? null : Math.max(0, ply)
        // a queued premove belongs to the live position, not to a review
        view.cancelMove()
        render()
    }

    const history = createMoveHistory({ showPly })

    /** the game moved on, so stop reviewing the past */
    const goLive = () => {
        reviewing = null
    }

    /** a one-off message under the move list, e.g. a declined draw or an error */
    let statusNote: string | undefined

    /** show the result, or the note while the game is still running */
    const renderResult = () => {
        const el = document.getElementById('game-status')
        if (!el) {
            return
        }
        const text = game.result() ?? statusNote
        el.textContent = text ?? ''
        el.hidden = !text
    }

    const setStatusNote = (note: string | undefined) => {
        statusNote = note
        renderResult()
    }

    /** the AI's draw offer stays on screen until the player answers it */
    let drawOfferOpen = false

    const showDrawOffer = () => {
        drawOfferOpen = true
        const el = document.getElementById('draw-offer')
        if (el) {
            el.hidden = false
        }
    }

    const hideDrawOffer = () => {
        drawOfferOpen = false
        const el = document.getElementById('draw-offer')
        if (el) {
            el.hidden = true
        }
    }

    const aiToMove = () => game.turn() !== playerSide() && !game.isOver()

    /** the player is to move, so the AI is the side that just moved */
    const aiJustMoved = () =>
        game.turn() === playerSide() && game.moves().length > 0

    const canRegenerate = () =>
        inProgress && !game.isOver() && (aiToMove() || aiJustMoved())

    const playerMoved = () => {
        const moves = game.moves()
        if (moves.length === 0) {
            return false
        }
        if (playingAs === 'black' && moves.length < 2) {
            return false
        }
        return true
    }

    /** tell the sidebar what it may show */
    const notifyState = () =>
        onStateChange?.({
            inProgress,
            over: game.isOver(),
            thinking,
            canRegenerate: canRegenerate(),
            playerMoved: playerMoved(),
        })

    /** a request is running; the sidebar shows Cancel only while it is */
    const setThinking = (value: boolean) => {
        if (thinking === value) {
            return
        }
        thinking = value
        notifyState()
    }

    const render = () => {
        const moves = game.moves()
        view.render(reviewing === null ? liveView() : pastView(reviewing))
        renderResult()
        history.render(moves, reviewing ?? moves.length)
        notifyState()
    }

    /** drop any queued bot reply, e.g. when a new game starts */
    const cancelBotMove = () => {
        botMoveToken++
    }

    const playBotMove = async (token: number) => {
        const controller = new AbortController()
        botAbort = controller
        try {
            if (game.isOver()) {
                return
            }
            let decision: TurnDecision
            try {
                decision = bot.turn
                    ? await bot.turn(game.chess(), controller.signal)
                    : {
                          move: await bot.pickMove(
                              game.chess(),
                              controller.signal
                          ),
                      }
            } catch (error) {
                if (token === botMoveToken) {
                    // a cancel is not a failure: say so plainly
                    setStatusNote(
                        controller.signal.aborted
                            ? 'AI move cancelled.'
                            : `AI error: ${errorMessage(error)}`
                    )
                }
                return
            }
            // a new game, a cancel or a draw offer took over while the AI
            // was thinking
            if (token !== botMoveToken || game.isOver()) {
                return
            }
            if (decision.resign) {
                game.conclude(
                    `${aiSide() === 'white' ? 'White' : 'Black'} resigned`
                )
                finish()
                return
            }
            // an empty or illegal reply leaves the board alone; Regenerate
            // is how the player asks the AI for another turn
            if (!decision.move || !game.playSan(decision.move)) {
                setStatusNote('AI did not make a valid move.')
                return
            }
            setStatusNote(undefined)
            goLive()
            render()
            // a premove queued during the bot's turn plays now: chessground
            // fires its move event, so the board, the game and the next reply
            // all follow. it also clears any premove the reply made illegal.
            view.playPremove()
            if (decision.offerDraw && !game.isOver()) {
                showDrawOffer()
            }
        } finally {
            if (botAbort === controller) {
                botAbort = null
            }
            if (token === botMoveToken) {
                setThinking(false)
            }
        }
    }

    const scheduleBotMove = () => {
        const token = ++botMoveToken
        setThinking(true)
        window.setTimeout(() => {
            if (token === botMoveToken) {
                void playBotMove(token)
            }
        }, BOT_MOVE_DELAY_MS)
    }

    const applyPlayerMove = (
        orig: Key,
        dest: Key,
        promotion?: PromotionPiece
    ) => {
        if (!game.play(orig, dest, promotion)) {
            // chessground should only hand over legal moves; snap back if not
            render()
            return
        }
        // moving past an offer counts as declining it
        hideDrawOffer()
        setStatusNote(undefined)
        goLive()
        render()
        if (!game.isOver()) {
            scheduleBotMove()
        }
    }

    const onPlayerMove = async (orig: Key, dest: Key) => {
        if (game.promotionPieces(orig, dest).length === 0) {
            applyPlayerMove(orig, dest)
            return
        }
        const chosen = await askPromotion({
            color: game.turn() === 'w' ? 'white' : 'black',
            key: dest,
            orientation: playingAs,
            board: element,
        })
        if (!chosen) {
            // cancelled — chessground already moved the pawn, so put it back
            render()
            return
        }
        applyPlayerMove(orig, dest, chosen)
    }

    /** stop the game where it stands: freeze the board, drop queued replies */
    const finish = () => {
        inProgress = false
        cancelBotMove()
        setThinking(false)
        hideDrawOffer()
        // drop any premove or selection along with the pending reply
        view.cancelMove()
        goLive()
        render()
    }

    const resign = () => {
        if (!inProgress || game.isOver()) {
            return
        }
        game.conclude(`${playingAs === 'white' ? 'White' : 'Black'} resigned`)
        finish()
    }

    const abort = () => {
        if (!inProgress || game.isOver()) {
            return
        }
        const moves = game.moves()
        if (moves.length === 0 || (playingAs === 'black' && moves.length < 2)) {
            game.conclude('game aborted')
            finish()
        }
    }

    /**
     * The player offers a draw. The AI answers with a decision and, when it
     * declines, the move it wants to play — so the offer replaces the reply
     * that was already scheduled.
     */
    const offerDraw = async () => {
        if (!inProgress || game.isOver() || drawOfferOpen) {
            return
        }
        const token = ++botMoveToken
        setStatusNote(undefined)
        let answer: DrawDecision | null = null
        try {
            answer = bot.respondToDraw
                ? await bot.respondToDraw(game.chess(), aiSide())
                : null
        } catch (error) {
            if (token === botMoveToken) {
                setStatusNote(`AI error: ${errorMessage(error)}`)
            }
            return
        }
        if (token !== botMoveToken || game.isOver()) {
            return
        }
        // a source with no opinion agrees, as it always did
        if (!answer || answer.accept) {
            game.conclude('Draw agreed')
            finish()
            return
        }
        setStatusNote('Draw declined')
        if (
            answer.move &&
            game.turn() !== playerSide() &&
            game.playSan(answer.move)
        ) {
            goLive()
            render()
            view.playPremove()
        }
    }

    /**
     * Ask the AI again: while it is its turn any pending reply is replaced,
     * and once it has moved its last move is taken back first.
     */
    const regenerate = () => {
        if (!inProgress || game.isOver()) {
            return
        }
        if (thinking) {
            // a reply is already on its way; drop it and start over
            botAbort?.abort()
            cancelBotMove()
            setThinking(false)
        }
        if (!aiToMove()) {
            if (!aiJustMoved() || !game.undo()) {
                return
            }
            // its move may have carried a draw offer or a stale note
            hideDrawOffer()
            goLive()
            render()
        }
        setStatusNote(undefined)
        scheduleBotMove()
    }

    /** drop the in-flight AI move, leaving it the AI's turn to regenerate */
    const cancelTurn = () => {
        if (!inProgress || !thinking) {
            return
        }
        botAbort?.abort()
        cancelBotMove()
        setThinking(false)
        setStatusNote('AI move cancelled.')
    }

    const answerDrawOffer = (accept: boolean) => {
        if (!drawOfferOpen) {
            return
        }
        hideDrawOffer()
        if (!accept || !inProgress || game.isOver()) {
            return
        }
        game.conclude('Draw agreed')
        finish()
    }

    const startGame = (side: Side) => {
        cancelBotMove()
        setThinking(false)
        hideDrawOffer()
        setStatusNote(undefined)
        // drop any premove or selection left over from the previous game
        view.cancelMove()
        inProgress = true
        playingAs = side
        goLive()
        game.reset()
        render()
        if (!isPlayerTurn()) {
            scheduleBotMove()
        }
    }

    // paint the controls for the pre-game state right away
    notifyState()

    return {
        startGame,
        abort,
        resign,
        offerDraw,
        answerDrawOffer,
        regenerate,
        cancelTurn,
    }
}
