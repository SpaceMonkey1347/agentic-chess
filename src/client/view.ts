import type { Config } from '@lichess-org/chessground/config'
import type { Key } from '@lichess-org/chessground/types'

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
        draggable: { enabled: view.interactive },
        selectable: { enabled: view.interactive },
    }
}
