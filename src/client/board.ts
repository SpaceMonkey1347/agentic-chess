import { Chessground } from '@lichess-org/chessground'

import type { Config } from '@lichess-org/chessground/config'
import type { Color, Key } from '@lichess-org/chessground/types'

import type { PromotionPiece } from './game.ts'

/* ------------------------------------------------------------------ *
 * the position, as the board needs to see it
 * ------------------------------------------------------------------ */

/** Everything the board needs to draw one position. Plain data, no DOM. */
export interface PositionView {
    fen: string
    /** whose turn it is in this position */
    turn: 'w' | 'b'
    /** the side shown at the bottom */
    orientation: 'white' | 'black'
    /** the side allowed to pick pieces up */
    movableColor: 'white' | 'black'
    /** destinations for the side to move; empty leaves only premoves */
    legalDests: Map<Key, Key[]>
    lastMove?: [Key, Key]
    check: boolean
    /** false freezes the board (game over, or showing an old position) */
    interactive: boolean
}

/** The single place that knows chessground's config shape. */
export function toGroundConfig(view: PositionView): Config {
    return {
        fen: view.fen,
        orientation: view.orientation,
        turnColor: view.turn === 'w' ? 'white' : 'black',
        check: view.check,
        // always passed, even as undefined, so a stale highlight is cleared
        lastMove: view.lastMove,
        movable: {
            free: false,
            color: view.movableColor,
            dests: view.legalDests,
        },
        // premoves belong to the live position; a reviewed one must not take them
        premovable: { enabled: view.interactive },
        draggable: { enabled: view.interactive },
        selectable: { enabled: view.interactive },
    }
}

/* ------------------------------------------------------------------ *
 * the chessground instance
 * ------------------------------------------------------------------ */

export interface BoardView {
    /** draw a position */
    render(view: PositionView): void
    /** drop any selection or queued premove */
    cancelMove(): void
    /** play a queued premove, if the position allows it */
    playPremove(): void
}

export interface BoardViewOptions {
    /** the player dropped a piece somewhere */
    onMove(orig: Key, dest: Key): void
}

/** The only module that talks to chessground. */
export function createBoardView(
    element: HTMLElement,
    { onMove }: BoardViewOptions
): BoardView {
    // chessground empties the board element when it renders, so the promotion
    // dialog (which sits inside .cg-wrap to reuse the board's piece art) is
    // grabbed first and put back once the board has been built
    const promotionEl = document.getElementById('promotion')

    const ground = Chessground(element, {
        draggable: { enabled: false },
        selectable: { enabled: false },
        drawable: { enabled: true },
        // let the player queue a premove while the bot is thinking; the session
        // plays it back with playPremove() once a reply lands
        premovable: { enabled: true },
        movable: {
            free: false,
            dests: new Map(),
            events: {
                after: (orig: Key, dest: Key) => onMove(orig, dest),
            },
        },
    })

    if (promotionEl) {
        element.appendChild(promotionEl)
    }

    return {
        render: (view: PositionView) => ground.set(toGroundConfig(view)),
        cancelMove: () => ground.cancelMove(),
        playPremove: () => ground.playPremove(),
    }
}

/* ------------------------------------------------------------------ *
 * the promotion dialog
 * ------------------------------------------------------------------ */

/** chess.js role letter -> the piece class painted by the board stylesheet */
const ROLE_NAMES: Record<PromotionPiece, string> = {
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
}

export interface PromotionRequest {
    /** the side whose pawn is promoting */
    color: Color
    /** the square the pawn lands on */
    key: Key
    /** the side the board is shown from */
    orientation: Color
    /** the board element the dialog is drawn over */
    board: HTMLElement
}

/**
 * Asks the player which piece to promote to. Resolves with a chess.js role
 * letter, or null when the promotion is cancelled (click outside / escape).
 */
export function askPromotion({
    color,
    key,
    orientation,
    board,
}: PromotionRequest): Promise<PromotionPiece | null> {
    const dialog = document.getElementById('promotion')
    const column = dialog?.querySelector<HTMLElement>('.promotion-column')
    if (!dialog || !column) {
        return Promise.resolve(null)
    }

    // chessground empties the board element on a full redraw, so make sure the
    // dialog is still where the stylesheet expects it
    if (dialog.parentElement !== board) {
        board.appendChild(dialog)
    }

    const file = key.charCodeAt(0) - 97
    const rank = Number(key[1])
    const flipped = orientation === 'black'
    const row = flipped ? rank - 1 : 8 - rank
    const square = 100 / 8

    // the column covers four squares and sits against the promoting rank, with
    // the queen next to the pawn — lichess' layout
    const downward = row < 4
    column.style.setProperty(
        '--promotion-left',
        `${(flipped ? 7 - file : file) * square}%`
    )
    column.style.setProperty(
        '--promotion-top',
        `${(downward ? row : row - 3) * square}%`
    )
    column.style.setProperty(
        '--promotion-flow',
        downward ? 'column' : 'column-reverse'
    )

    for (const choice of dialog.querySelectorAll<HTMLElement>(
        '.promotion-choice'
    )) {
        const role = choice.dataset.role as PromotionPiece
        const piece = choice.querySelector('piece')
        if (piece) {
            piece.className = `${color} ${ROLE_NAMES[role]}`
        }
    }

    dialog.hidden = false
    dialog.querySelector<HTMLButtonElement>('.promotion-choice')?.focus()

    return new Promise((resolve) => {
        const close = (choice: PromotionPiece | null) => {
            dialog.hidden = true
            dialog.removeEventListener('click', onClick)
            document.removeEventListener('keydown', onKey)
            resolve(choice)
        }
        const onClick = (event: MouseEvent) => {
            const button = (
                event.target as HTMLElement
            ).closest<HTMLButtonElement>('.promotion-choice')
            close(button ? (button.dataset.role as PromotionPiece) : null)
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close(null)
            }
        }
        dialog.addEventListener('click', onClick)
        document.addEventListener('keydown', onKey)
    })
}
