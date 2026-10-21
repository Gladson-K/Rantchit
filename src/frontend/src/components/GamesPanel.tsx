import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RetroButton } from './RetroUI';
import { PixelSnake } from './games/PixelSnake';
import { Breakout } from './games/Breakout';
import { ExternalGameFrame } from './games/ExternalGameFrame';
import { RuffleFlash } from './games/RuffleFlash';
import { Cell, computeWinner, Mark, TicTacToe } from './games/TicTacToe';
import { GAME_CATALOG } from '../lib/constants';
import { GameId, GameMeta, Peer } from '../lib/types';

interface GamesPanelProps {
  selfId: string | null;
  peers: Peer[];
  sendGame: (to: string, payload: unknown) => void;
  subscribeGame: (handler: (from: string, payload: any) => void) => () => void;
}

const emptyBoard = (): Cell[] => Array(9).fill(null);

export function GamesPanel({ selfId, peers, sendGame, subscribeGame }: GamesPanelProps) {
  const [selected, setSelected] = useState<GameId | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [board, setBoard] = useState<Cell[]>(emptyBoard);
  const [turn, setTurn] = useState<Mark>('X');
  const [winner, setWinner] = useState<Mark | 'draw' | null>(null);

  const boardRef = useRef<Cell[]>(emptyBoard());
  const opponentRef = useRef<string | null>(null);
  const myMarkRef = useRef<Mark>('X');

  const others = useMemo(() => peers.filter((p) => p.peerId !== selfId), [peers, selfId]);

  const selectedMeta: GameMeta | undefined = useMemo(
    () => GAME_CATALOG.find((g) => g.id === selected),
    [selected]
  );

  const myMark: Mark = useMemo(() => {
    if (!selfId || !opponentId) return 'X';
    return selfId < opponentId ? 'X' : 'O';
  }, [selfId, opponentId]);

  useEffect(() => {
    opponentRef.current = opponentId;
  }, [opponentId]);
  useEffect(() => {
    myMarkRef.current = myMark;
  }, [myMark]);

  // Auto-pair when there is exactly one other participant.
  useEffect(() => {
    if (selected !== 'tictactoe') return;
    if (!opponentId && others.length === 1) {
      setOpponentId(others[0].peerId);
    }
  }, [selected, opponentId, others]);

  const resetBoard = useCallback(() => {
    const e = emptyBoard();
    boardRef.current = e;
    setBoard(e);
    setWinner(null);
    setTurn('X');
  }, []);

  const applyMove = useCallback((index: number, mark: Mark) => {
    const prev = boardRef.current;
    if (index < 0 || index > 8 || prev[index] !== null) return;
    const next = prev.slice();
    next[index] = mark;
    boardRef.current = next;
    setBoard(next);
    setWinner(computeWinner(next));
    setTurn(mark === 'X' ? 'O' : 'X');
  }, []);

  // Subscribe to relayed game frames.
  useEffect(() => {
    const unsub = subscribeGame((from, payload) => {
      if (!payload || payload.kind !== 'ttt') return;
      if (from !== opponentRef.current) return;
      if (payload.action === 'reset') {
        resetBoard();
      } else if (payload.action === 'move') {
        const oppMark: Mark = myMarkRef.current === 'X' ? 'O' : 'X';
        applyMove(payload.index, oppMark);
      }
    });
    return unsub;
  }, [subscribeGame, applyMove, resetBoard]);

  const handleMove = (index: number) => {
    if (!opponentId || winner || turn !== myMark || board[index] !== null) return;
    sendGame(opponentId, { kind: 'ttt', action: 'move', index, mark: myMark });
    applyMove(index, myMark);
  };

  const handleReset = () => {
    resetBoard();
    if (opponentId) sendGame(opponentId, { kind: 'ttt', action: 'reset' });
  };

  /* ---------------- catalog ---------------- */
  if (!selected) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GAME_CATALOG.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setSelected(g.id);
              if (g.id === 'tictactoe') resetBoard();
            }}
            className="retro-panel p-4 text-left hover:border-arcade-green transition-colors group"
          >
            <div className="text-3xl mb-2">{g.icon}</div>
            <div className="font-pixel text-[10px] text-arcade-text group-hover:text-arcade-green">
              {g.title}
            </div>
            <div className="font-pixel text-[8px] text-arcade-cyan mt-1">{g.players}</div>
            <p className="font-term text-base text-arcade-muted mt-2 leading-snug">{g.description}</p>
            <div className="mt-3 font-pixel text-[8px] text-arcade-green">PLAY &gt;&gt;</div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <RetroButton onClick={() => setSelected(null)}>&lt; BACK</RetroButton>
        <span className="font-pixel text-[9px] text-arcade-cyan">{selectedMeta?.title}</span>
      </div>

      {selected === 'snake' && <PixelSnake />}

      {selected === 'breakout' && <Breakout />}

      {selectedMeta?.kind === 'external' &&
        (selectedMeta.runtime === 'flash' ? (
          <RuffleFlash meta={selectedMeta} />
        ) : (
          <ExternalGameFrame meta={selectedMeta} />
        ))}

      {selected === 'tictactoe' && (
        <div className="space-y-4">
          {others.length > 1 && (
            <div className="retro-panel p-3 space-y-2">
              <span className="retro-label">Choose opponent</span>
              <div className="flex flex-wrap gap-2">
                {others.map((p) => (
                  <RetroButton
                    key={p.peerId}
                    variant={opponentId === p.peerId ? 'green' : 'default'}
                    onClick={() => {
                      setOpponentId(p.peerId);
                      resetBoard();
                    }}
                  >
                    {p.alias || p.peerId}
                  </RetroButton>
                ))}
              </div>
            </div>
          )}

          <TicTacToe
            board={board}
            myMark={myMark}
            turn={turn}
            winner={winner}
            opponentAlias={others.find((p) => p.peerId === opponentId)?.alias || 'Peer'}
            opponentPresent={!!opponentId && others.some((p) => p.peerId === opponentId)}
            onMove={handleMove}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}
