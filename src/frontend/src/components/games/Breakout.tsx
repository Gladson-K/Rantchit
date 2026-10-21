import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RetroButton } from '../RetroUI';

const W = 480;
const H = 360;
const PADDLE_W = 72;
const PADDLE_H = 10;
const BALL_R = 6;
const BRICK_ROWS = 5;
const BRICK_COLS = 9;
const BRICK_W = W / BRICK_COLS;
const BRICK_H = 18;
const BRICK_TOP = 48;

interface Brick {
  x: number;
  y: number;
  alive: boolean;
  hue: string;
}

const ROW_HUES = ['#ff4d6d', '#ffb703', '#8ac926', '#4cc9f0', '#c77dff'];

function freshBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({ x: c * BRICK_W, y: BRICK_TOP + r * BRICK_H, alive: true, hue: ROW_HUES[r] });
    }
  }
  return bricks;
}

export function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paddleX = useRef((W - PADDLE_W) / 2);
  const ball = useRef({ x: W / 2, y: H - 40, vx: 3, vy: -3.2 });
  const bricks = useRef<Brick[]>(freshBricks());
  const left = useRef(false);
  const right = useRef(false);
  const raf = useRef<number>(0);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [status, setStatus] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready');

  const resetBall = useCallback(() => {
    paddleX.current = (W - PADDLE_W) / 2;
    ball.current = { x: W / 2, y: H - 40, vx: Math.random() > 0.5 ? 3 : -3, vy: -3.2 };
  }, []);

  const newGame = useCallback(() => {
    bricks.current = freshBricks();
    setScore(0);
    setLives(3);
    resetBall();
    setStatus('ready');
  }, [resetBall]);

  useEffect(() => {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') left.current = down;
      if (e.key === 'ArrowRight' || e.key === 'd') right.current = down;
      if (down && (e.key === ' ' || e.key === 'Enter')) {
        setStatus((s) => (s === 'ready' ? 'playing' : s));
      }
      if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(e.key)) e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    let last = performance.now();

    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - last, 40);
      last = now;

      if (status === 'playing') {
        if (left.current) paddleX.current -= 0.55 * dt;
        if (right.current) paddleX.current += 0.55 * dt;
        paddleX.current = Math.max(0, Math.min(W - PADDLE_W, paddleX.current));

        const b = ball.current;
        b.x += b.vx;
        b.y += b.vy;

        if (b.x - BALL_R < 0) {
          b.x = BALL_R;
          b.vx *= -1;
        }
        if (b.x + BALL_R > W) {
          b.x = W - BALL_R;
          b.vx *= -1;
        }
        if (b.y - BALL_R < 0) {
          b.y = BALL_R;
          b.vy *= -1;
        }

        // Paddle collision.
        if (
          b.vy > 0 &&
          b.y + BALL_R >= H - PADDLE_H - 6 &&
          b.y + BALL_R <= H - 6 &&
          b.x >= paddleX.current &&
          b.x <= paddleX.current + PADDLE_W
        ) {
          const hit = (b.x - (paddleX.current + PADDLE_W / 2)) / (PADDLE_W / 2);
          b.vy = -Math.abs(b.vy);
          b.vx = hit * 4;
          b.y = H - PADDLE_H - 6 - BALL_R;
        }

        // Brick collisions.
        for (const brick of bricks.current) {
          if (!brick.alive) continue;
          if (
            b.x + BALL_R > brick.x &&
            b.x - BALL_R < brick.x + BRICK_W &&
            b.y + BALL_R > brick.y &&
            b.y - BALL_R < brick.y + BRICK_H
          ) {
            brick.alive = false;
            b.vy *= -1;
            setScore((s) => s + 10);
            break;
          }
        }

        if (bricks.current.every((br) => !br.alive)) {
          setStatus('won');
        }

        if (b.y - BALL_R > H) {
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) setStatus('lost');
            else {
              resetBall();
              setStatus('ready');
            }
            return next;
          });
        }
      }

      // Render
      ctx.fillStyle = '#0b0b12';
      ctx.fillRect(0, 0, W, H);
      for (const brick of bricks.current) {
        if (!brick.alive) continue;
        ctx.fillStyle = brick.hue;
        ctx.fillRect(brick.x + 1, brick.y + 1, BRICK_W - 2, BRICK_H - 2);
      }
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(paddleX.current, H - PADDLE_H - 6, PADDLE_W, PADDLE_H);
      ctx.beginPath();
      ctx.arc(ball.current.x, ball.current.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#f8f8ff';
      ctx.fill();

      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [status, resetBall]);

  return (
    <div className="retro-panel p-4 space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-arcade-amber">SCORE {score}</span>
        <span className="text-arcade-red">LIVES {lives}</span>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full border-2 border-arcade-border bg-black"
        />
        {(status === 'ready' || status === 'won' || status === 'lost') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <div className="font-pixel text-[12px] text-arcade-cyan">
              {status === 'ready' && 'READY?'}
              {status === 'won' && 'YOU WIN!'}
              {status === 'lost' && 'GAME OVER'}
            </div>
            {status === 'ready' ? (
              <RetroButton variant="green" onClick={() => setStatus('playing')}>
                LAUNCH
              </RetroButton>
            ) : (
              <RetroButton variant="cyan" onClick={newGame}>
                PLAY AGAIN
              </RetroButton>
            )}
          </div>
        )}
      </div>

      <p className="font-term text-base text-arcade-muted text-center">
        Move with ← → or A / D. Space launches the ball.
      </p>
    </div>
  );
}
