import type { MoveRecord } from './game.ts'

export interface MoveHistoryOptions {
    /** show the position after `ply` moves; `moves.length` goes back to live */
    showPly(ply: number): void
}

export interface MoveHistory {
    /** redraw the list; `shownPly` is the ply currently on the board */
    render(moves: MoveRecord[], shownPly: number): void
}

/**
 * The move-history panel: lists the moves played and drives the review buttons
 * (first / previous / next / last). Picking a move shows the position after it.
 */
export function createMoveHistory({
    showPly,
}: MoveHistoryOptions): MoveHistory {
    const listEl = document.querySelector<HTMLOListElement>(
        '#panel-session .move-history'
    )
    const nav: Record<
        'first' | 'prev' | 'next' | 'last',
        HTMLButtonElement | null
    > = {
        first: document.getElementById(
            'move-first'
        ) as HTMLButtonElement | null,
        prev: document.getElementById('move-prev') as HTMLButtonElement | null,
        next: document.getElementById('move-next') as HTMLButtonElement | null,
        last: document.getElementById('move-last') as HTMLButtonElement | null,
    }

    /** the list as it was last drawn, so the buttons know what to step through */
    let total = 0
    let shown = 0

    const goTo = (ply: number) => {
        showPly(Math.max(0, Math.min(ply, total)))
    }

    nav.first?.addEventListener('click', () => goTo(0))
    nav.prev?.addEventListener('click', () => goTo(shown - 1))
    nav.next?.addEventListener('click', () => goTo(shown + 1))
    nav.last?.addEventListener('click', () => goTo(total))

    /** one move in the list; `ply` is the position it leads to */
    const moveEl = (move: MoveRecord, ply: number) => {
        const span = document.createElement('span')
        span.className = ply === shown ? 'move is-current' : 'move'
        span.textContent = move.san
        span.addEventListener('click', () => goTo(ply))
        return span
    }

    const render = (moves: MoveRecord[], shownPly: number) => {
        total = moves.length
        shown = shownPly

        if (listEl) {
            listEl.replaceChildren()
            // two plies to a row, so the numbers only land on white's move
            for (let index = 0; index < moves.length; index += 2) {
                const row = document.createElement('li')
                const number = document.createElement('span')
                number.className = 'move-no'
                number.textContent = `${index / 2 + 1}.`
                row.append(number, moveEl(moves[index]!, index + 1))
                const black = moves[index + 1]
                if (black) {
                    row.append(moveEl(black, index + 2))
                }
                listEl.append(row)
            }
        }

        const atStart = total === 0 || shown === 0
        const atEnd = total === 0 || shown === total
        if (nav.first) nav.first.disabled = atStart
        if (nav.prev) nav.prev.disabled = atStart
        if (nav.next) nav.next.disabled = atEnd
        if (nav.last) nav.last.disabled = atEnd

        listEl?.querySelector('.is-current')?.scrollIntoView({
            block: 'nearest',
        })
    }

    return { render }
}
