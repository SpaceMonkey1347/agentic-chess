import { Chessground } from '@lichess-org/chessground'

import type { Key } from '@lichess-org/chessground/types'

import { toGroundConfig } from './view.ts'
import type { PositionView } from './view.ts'

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
        drawable: { enabled: false },
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
