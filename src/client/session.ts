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
    /** the player gives up */
    resign(): void
    /** the player offers a draw */
    offerDraw(): void
    /** the player answers the AI's draw offer */
    answerDrawOffer(accept: boolean): void
    /** ask the AI for its turn again after a failed reply */
    retryTurn(): void
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Runs a game against `bot` on the board in `element`: the player moves with
 * the mouse, the bot answers, and promotions go through the promotion dialog.
 */
export function createSession(element: HTMLElement, bot: MoveSource): Session {
    const game = createGame()
    const view = createBoardView(element, {
        onMove: (orig: Key, dest: Key) => onPlayerMove(orig, dest),
    })

    let inProgress = false
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

    /** the AI's turn failed, so offer a way to ask it again */
    const setRetryVisible = (visible: boolean) => {
        const el = document.getElementById('turn-retry')
        if (el) {
            el.hidden = !visible
        }
    }

    const aiToMove = () => game.turn() !== playerSide() && !game.isOver()

    const render = () => {
        const moves = game.moves()
        view.render(reviewing === null ? liveView() : pastView(reviewing))
        renderResult()
        history.render(moves, reviewing ?? moves.length)
    }

    /** drop any queued bot reply, e.g. when a new game starts */
    const cancelBotMove = () => {
        botMoveToken++
    }

    const playBotMove = async (token: number) => {
        if (game.isOver()) {
            return
        }
        let decision: TurnDecision
        try {
            decision = bot.turn
                ? await bot.turn(game.chess())
                : { move: await bot.pickMove(game.chess()) }
        } catch (error) {
            if (token === botMoveToken) {
                setStatusNote(`AI error: ${errorMessage(error)}`)
                setRetryVisible(true)
            }
            return
        }
        // a new game or a draw offer took over while the AI was thinking
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
        // an empty or illegal reply leaves the board alone; the player can
        // ask the AI for another turn instead of being stuck
        if (!decision.move || !game.playSan(decision.move)) {
            setStatusNote('AI did not make a valid move.')
            setRetryVisible(true)
            return
        }
        setRetryVisible(false)
        setStatusNote(undefined)
        goLive()
        render()
        // a premove queued during the bot's turn plays now: chessground
        // fires its move event, so the board, the game and the next reply
        // all follow. it also clears any premove that the reply made illegal.
        view.playPremove()
        if (decision.offerDraw && !game.isOver()) {
            showDrawOffer()
        }
    }

    const scheduleBotMove = () => {
        const token = ++botMoveToken
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
        hideDrawOffer()
        setRetryVisible(false)
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
                // the offer replaced the scheduled reply, so the AI is stuck
                setRetryVisible(aiToMove())
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

    /** ask the AI for its turn again after a failed reply */
    const retryTurn = () => {
        if (!inProgress || !aiToMove()) {
            return
        }
        setRetryVisible(false)
        setStatusNote(undefined)
        scheduleBotMove()
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
        hideDrawOffer()
        setRetryVisible(false)
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

    return { startGame, resign, offerDraw, answerDrawOffer, retryTurn }
}
