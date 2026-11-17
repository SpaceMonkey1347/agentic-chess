import type { Chess } from 'chess.js'

/**
 * Supplies a move for the AI side, as SAN. The endpoint-backed player will
 * implement this same interface, so the game loop won't have to change.
 */
export interface MoveSource {
    pickMove(game: Chess): Promise<string | null>
}

/** Placeholder player: plays a random legal move. */
export const randomBot: MoveSource = {
    async pickMove(game: Chess): Promise<string | null> {
        const moves = game.moves()
        if (moves.length === 0) {
            return null
        }
        return moves[Math.floor(Math.random() * moves.length)] ?? null
    },
}
