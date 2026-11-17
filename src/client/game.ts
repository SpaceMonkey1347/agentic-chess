import { Chess } from 'chess.js'

import type { Key } from '@lichess-org/chessground/types'

/** the promotion choices, using the role letters chess.js reports */
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface MoveRecord {
    san: string
    from: Key
    to: Key
    color: 'white' | 'black'
    promotion?: PromotionPiece
    /** the position after the move — enough to show any past ply */
    after: string
}

/** The game: rules, move list and outcome. Knows nothing about rendering. */
export interface Game {
    /** the underlying chess.js game, for move sources and prompt templates */
    chess(): Chess
    turn(): 'w' | 'b'
    fen(): string
    /** every move played so far, in order */
    moves(): MoveRecord[]
    /** play a move; false when it is not legal */
    play(from: Key, to: Key, promotion?: PromotionPiece): boolean
    /** play a move given in standard algebraic notation; false when illegal */
    playSan(san: string): boolean
    /** the promotion choices for this move, empty when it is not a promotion */
    promotionPieces(from: Key, to: Key): PromotionPiece[]
    /** the legal destinations, in the shape chessground wants them */
    legalDests(): Map<Key, Key[]>
    lastMove(): [Key, Key] | undefined
    isCheck(): boolean
    isOver(): boolean
    /** the result, once the game is over */
    result(): string | undefined
    /** record an ending that did not happen on the board (resign, agreed draw) */
    conclude(text: string): void
    reset(): void
}

export function createGame(): Game {
    const game = new Chess()

    /** set when the game ended off the board, so result() can report it */
    let endedBy: string | undefined

    const isOver = () => game.isGameOver() || endedBy !== undefined

    const result = (): string | undefined => {
        if (endedBy) {
            return endedBy
        }
        const winner = game.turn() === 'w' ? 'Black' : 'White'
        if (game.isCheckmate()) {
            return `${winner} wins by checkmate`
        }
        if (game.isStalemate()) {
            return 'Draw by stalemate'
        }
        if (game.isInsufficientMaterial()) {
            return 'Insufficient material'
        }
        if (game.isThreefoldRepetition()) {
            return 'Draw by repetition'
        }
        if (game.isDraw()) {
            return 'Draw'
        }
        return undefined
    }

    const legalDests = (): Map<Key, Key[]> => {
        const dests = new Map<Key, Key[]>()
        for (const { from, to } of game.moves({ verbose: true })) {
            const fromDests = dests.get(from)
            if (fromDests) {
                fromDests.push(to)
            } else {
                dests.set(from, [to])
            }
        }
        return dests
    }

    const lastMove = (): [Key, Key] | undefined => {
        const last = game.history({ verbose: true }).at(-1)
        return last ? [last.from, last.to] : undefined
    }

    const promotionPieces = (from: Key, to: Key): PromotionPiece[] =>
        game
            .moves({ verbose: true })
            .filter(
                (move) => move.from === from && move.to === to && move.promotion
            )
            .map((move) => move.promotion as PromotionPiece)

    const play = (from: Key, to: Key, promotion?: PromotionPiece): boolean => {
        try {
            game.move(promotion ? { from, to, promotion } : { from, to })
            return true
        } catch {
            return false
        }
    }

    const playSan = (san: string): boolean => {
        try {
            game.move(san)
            return true
        } catch {
            return false
        }
    }

    const moves = (): MoveRecord[] =>
        game.history({ verbose: true }).map((move) => ({
            san: move.san,
            from: move.from,
            to: move.to,
            color: move.color === 'w' ? 'white' : 'black',
            promotion: (move.promotion as PromotionPiece) || undefined,
            after: move.after,
        }))

    return {
        chess: () => game,
        turn: () => game.turn(),
        fen: () => game.fen(),
        moves,
        play,
        playSan,
        promotionPieces,
        legalDests,
        lastMove,
        isCheck: () => game.isCheck(),
        isOver,
        result,
        conclude: (text: string) => {
            endedBy = text
        },
        reset: () => {
            endedBy = undefined
            game.reset()
        },
    }
}
