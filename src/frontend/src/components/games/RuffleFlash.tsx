import React, { useEffect, useRef, useState } from 'react';
import { RetroButton } from '../RetroUI';
import { EXTERNAL_GAME_HOSTS, RUFFLE_URL } from '../../lib/constants';
import { GameMeta } from '../../lib/types';

declare global {
  interface Window {
    RufflePlayer?: any;
    __ruffleLoading?: Promise<any>;
  }
}

const RUFFLE_BASE = RUFFLE_URL.replace(/ruffle\.js$/, '');

interface RuffleFlashProps {
  meta: GameMeta;
}

function validateSwf(raw: string): { ok: boolean; reason?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a .swf URL to load.' };
  if (trimmed.startsWith('//')) return { ok: false, reason: 'Protocol-relative URLs are not allowed.' };
  if (trimmed.startsWith('/')) return { ok: true };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Only https:// URLs are allowed.' };
  if (!EXTERNAL_GAME_HOSTS.includes(url.hostname)) {
    return { ok: false, reason: `Host "${url.hostname}" is not allow-listed.` };
  }
  return { ok: true };
}

function loadRuffle(): Promise<any> {
  if (window.RufflePlayer?.newest) return Promise.resolve(window.RufflePlayer);
  if (window.__ruffleLoading) return window.__ruffleLoading;

  window.__ruffleLoading = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.RufflePlayer?.newest) resolve(window.RufflePlayer);
      else reject(new Error('Ruffle loaded but did not initialise.'));
    };
    const fail = () =>
      reject(new Error(`Could not load ${RUFFLE_URL}. Is Ruffle installed in public/ruffle/?`));

    const existing = document.querySelector<HTMLScriptElement>('script[data-ruffle]');
    if (existing) {
      existing.addEventListener('load', finish);
      existing.addEventListener('error', fail);
      if (window.RufflePlayer?.newest) finish();
      return;
    }
    const script = document.createElement('script');
    script.src = RUFFLE_URL;
    script.dataset.ruffle = 'true';
    script.addEventListener('load', finish);
    script.addEventListener('error', fail);
    document.head.appendChild(script);
  });
  return window.__ruffleLoading;
}

/**
 * Plays a `.swf` using the self-hosted Ruffle WebAssembly runtime.
 *
 * Flash is end-of-life, so this never relies on a third-party CDN: Ruffle is
 * served from our own origin and the `.swf` may be bundled under `/games/` or
 * loaded from an allow-listed https host.
 */
export function RuffleFlash({ meta }: RuffleFlashProps) {
  const [input, setInput] = useState(meta.url ?? '');
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const load = () => {
    const result = validateSwf(input);
    if (!result.ok) {
      setError(result.reason ?? 'Invalid .swf URL.');
      return;
    }
    setError(null);
    setStatus('loading');
    setActive(input.trim());
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    loadRuffle()
      .then((ruffle) => {
        if (cancelled) return;
        const player = ruffle.newest().createPlayer();
        host.replaceChildren(player);
        player.ruffle().load({ url: active, base: RUFFLE_BASE });
        setStatus('ready');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      host?.replaceChildren();
    };
  }, [active]);

  return (
    <div className="space-y-3">
      <div className="retro-inset border-2 border-arcade-amber/60 p-3">
        <p className="font-term text-base text-arcade-amber leading-snug">
          Flash is end-of-life; this plays `.swf` files through the self-hosted Ruffle WASM runtime.
          A loaded `.swf` is guest code — only run files you trust.
        </p>
      </div>

      <div className="retro-panel p-3 space-y-2">
        <span className="retro-label">.SWF URL</span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="retro-input flex-1"
            placeholder="/games/your-game.swf"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <RetroButton variant="red" onClick={load}>
            BOOT
          </RetroButton>
        </div>
        <p className="font-term text-sm text-arcade-muted">
          Bundle `.swf` files in <code>public/games/</code> or use an allow-listed https host.
        </p>
        {error && <p className="font-term text-base text-arcade-red">{error}</p>}
        {status === 'loading' && (
          <p className="font-term text-base text-arcade-cyan">Booting Ruffle runtime...</p>
        )}
      </div>

      <div
        ref={hostRef}
        className="w-full min-h-[480px] border-2 border-arcade-border bg-black flex items-center justify-center"
      >
        {status !== 'ready' && (
          <span className="font-term text-base text-arcade-muted">Ruffle screen</span>
        )}
      </div>
    </div>
  );
}
