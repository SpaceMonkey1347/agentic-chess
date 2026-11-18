import type { Key } from '@lichess-org/chessground/types'

import { askPromotion, createBoardView } from './board.ts'
import type { PositionView } from './board.ts'
import { createGame } from './game.ts'
import type { MoveSource, PromotionPiece, Side } from './game.ts'
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
}

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

    /** show the result under the move list */
    const renderResult = () => {
        const el = document.getElementById('game-status')
        if (!el) {
            return
        }
        const text = game.result()
        el.textContent = text ?? ''
        el.hidden = !text
    }

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

    const playBotMove = async () => {
        if (game.isOver()) {
            return
        }
        const san = await bot.pickMove(game.chess())
        // an empty or illegal reply leaves the board alone
        if (!san || !game.playSan(san)) {
            return
        }
        goLive()
        render()
        // a premove queued during the bot's turn plays now: chessground fires
        // its move event, so the board, the game and the next reply all follow.
        // it also clears any premove that the reply made illegal.
        view.playPremove()
    }

    const scheduleBotMove = () => {
        const token = ++botMoveToken
        window.setTimeout(() => {
            if (token === botMoveToken) {
                void playBotMove()
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

    const offerDraw = () => {
        if (!inProgress || game.isOver()) {
            return
        }
        // the move source has no opinion on draws yet, so an offer is accepted
        game.conclude('Draw agreed')
        finish()
    }

    const startGame = (side: Side) => {
        cancelBotMove()
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

    return { startGame, resign, offerDraw }
}
