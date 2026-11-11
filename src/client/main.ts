import './htmx.ts'
// import './play.ts'

import { Chessground } from '@lichess-org/chessground'

import type { Config } from '@lichess-org/chessground/config'

const config: Config = {
    movable: {
        free: true,
        color: 'both',
    },
}

const board = document.getElementById('board-1')!

const ground = Chessground(board, config)
