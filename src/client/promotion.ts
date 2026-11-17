import type { Color, Key } from '@lichess-org/chessground/types'

import type { PromotionPiece } from './game.ts'

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
