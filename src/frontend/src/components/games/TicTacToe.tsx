import React from 'react';
import { RetroButton } from '../RetroUI';

export type Mark = 'X' | 'O';
export type Cell = Mark | null;

interface TicTacToeProps {
  board: Cell[];
  myMark: Mark;
  turn: Mark;
  winner: Mark | 'draw' | null;
  opponentAlias: string;
  opponentPresent: boolean;
  onMove: (index: number) => void;
  onReset: () => void;
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function computeWinner(board: Cell[]): Mark | 'draw' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Mark;
    }
  }
  return board.every((c) => c !== null) ? 'draw' : null;
}

export function TicTacToe({
  board,
  myMark,
  turn,
  winner,
  opponentAlias,
  opponentPresent,
  onMove,
  onReset,
}: TicTacToeProps) {
  const myTurn = !winner && turn === myMark && opponentPresent;

  const status = winner
    ? winner === 'draw'
      ? 'DRAW - nobody wins'
      : winner === myMark
        ? 'YOU WIN!'
        : `${opponentAlias} WINS`
    : !opponentPresent
      ? 'Waiting for an opponent...'
      : myTurn
        ? `Your turn (${myMark})`
        : `${opponentAlias}'s turn (${turn})`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 font-pixel text-[10px]">
        <span className={myMark === 'X' ? 'text-arcade-cyan' : 'text-arcade-magenta'}>
          YOU ARE {myMark}
        </span>
        <span className={myTurn ? 'text-arcade-green animate-blink' : 'text-arcade-muted'}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 retro-inset p-2">
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => onMove(i)}
            disabled={!myTurn || cell !== null}
            className={`w-16 h-16 sm:w-20 sm:h-20 border-2 font-pixel text-2xl flex items-center justify-center transition-colors ${
              cell === 'X'
                ? 'text-arcade-cyan border-arcade-cyan/50'
                : cell === 'O'
                  ? 'text-arcade-magenta border-arcade-magenta/50'
                  : 'border-arcade-border bg-arcade-deep text-arcade-muted'
            } ${myTurn && !cell ? 'hover:border-arcade-green hover:bg-arcade-green/10 cursor-pointer' : ''}`}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-term text-base text-arcade-muted">
          vs {opponentPresent ? opponentAlias : '(no peer)'}
        </span>
        <RetroButton variant="cyan" onClick={onReset}>
          NEW GAME
        </RetroButton>
      </div>
    </div>
  );
}
