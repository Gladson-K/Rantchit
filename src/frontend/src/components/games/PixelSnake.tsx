import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RetroButton } from '../RetroUI';

const GRID = 20;
const CELL = 16;
const SPEED_MS = 130;

type Pt = { x: number; y: number };
type Phase = 'idle' | 'running' | 'over';

export function PixelSnake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const snakeRef = useRef<Pt[]>([]);
  const dirRef = useRef<Pt>({ x: 1, y: 0 });
  const nextDirRef = useRef<Pt>({ x: 1, y: 0 });
  const foodRef = useRef<Pt>({ x: 10, y: 10 });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');

  const placeFood = useCallback(() => {
    const snake = snakeRef.current;
    let p: Pt;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === p.x && s.y === p.y));
    foodRef.current = p;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#07070f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = 'rgba(51,51,95,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, GRID * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(GRID * CELL, i * CELL + 0.5);
      ctx.stroke();
    }

    // food
    const f = foodRef.current;
    ctx.fillStyle = '#ff2e88';
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = 10;
    ctx.fillRect(f.x * CELL + 3, f.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.shadowBlur = 0;

    // snake
    const snake = snakeRef.current;
    snake.forEach((s, idx) => {
      ctx.fillStyle = idx === 0 ? '#39ff14' : '#1fbf00';
      if (idx === 0) {
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 12;
      }
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      ctx.shadowBlur = 0;
    });
  }, []);

  const gameOver = useCallback(() => {
    phaseRef.current = 'over';
    setPhase('over');
    setScore((s) => {
      setBest((b) => Math.max(b, s));
      return s;
    });
  }, []);

  const step = useCallback(() => {
    const dir = nextDirRef.current;
    dirRef.current = dir;
    const snake = snakeRef.current.slice();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      gameOver();
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      snakeRef.current = snake;
      setScore((s) => s + 10);
      placeFood();
    } else {
      snake.pop();
      snakeRef.current = snake;
    }
    draw();
  }, [draw, gameOver, placeFood]);

  const loop = useCallback(
    (t: number) => {
      if (phaseRef.current !== 'running') return;
      if (t - lastRef.current >= SPEED_MS) {
        lastRef.current = t;
        step();
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [step]
  );

  const start = useCallback(() => {
    snakeRef.current = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    setScore(0);
    placeFood();
    phaseRef.current = 'running';
    setPhase('running');
    lastRef.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    draw();
  }, [draw, loop, placeFood]);

  const turn = useCallback(
    (d: Pt) => {
      const cur = dirRef.current;
      if (cur.x === -d.x && cur.y === -d.y) return; // no 180 reversal
      nextDirRef.current = d;
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Pt> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const d = map[e.key] || map[e.key.toLowerCase()];
      if (d) {
        e.preventDefault();
        if (phaseRef.current === 'running') turn(d);
      }
      if (e.key === ' ' && phaseRef.current !== 'running') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start, turn]);

  useEffect(() => {
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  const pad = (label: string, d: Pt, cls = '') => (
    <button
      className={`retro-btn ${cls} !px-3 !py-2`}
      onClick={() => turn(d)}
      aria-label={label}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 font-pixel text-[10px]">
        <span className="text-arcade-green">SCORE {score}</span>
        <span className="text-arcade-yellow">BEST {best}</span>
      </div>

      <div className="relative retro-inset p-2">
        <canvas ref={canvasRef} width={GRID * CELL} height={GRID * CELL} className="block" />
        {phase !== 'running' && (
          <div className="absolute inset-2 flex flex-col items-center justify-center gap-3 bg-black/70 text-center px-4">
            {phase === 'over' && (
              <span className="font-pixel text-[12px] text-arcade-magenta">GAME OVER</span>
            )}
            {phase === 'idle' && (
              <span className="font-pixel text-[10px] text-arcade-cyan">PIXEL SNAKE</span>
            )}
            <span className="font-term text-base text-arcade-muted">
              Arrows / WASD to move
            </span>
            <RetroButton variant="green" onClick={start}>
              {phase === 'over' ? 'RETRY' : 'START'}
            </RetroButton>
          </div>
        )}
      </div>

      {/* Mobile d-pad */}
      <div className="grid grid-cols-3 gap-1 sm:hidden">
        <span />
        {pad('UP', { x: 0, y: -1 })}
        <span />
        {pad('LT', { x: -1, y: 0 })}
        {pad('DN', { x: 0, y: 1 })}
        {pad('RT', { x: 1, y: 0 })}
      </div>
    </div>
  );
}
