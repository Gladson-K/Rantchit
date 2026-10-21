import React, { useState } from 'react';
import { RetroButton } from '../RetroUI';
import { EXTERNAL_GAME_HOSTS } from '../../lib/constants';
import { GameMeta } from '../../lib/types';

interface ExternalGameFrameProps {
  meta: GameMeta;
}

function validateUrl(raw: string): { ok: boolean; reason?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a game URL to load.' };
  if (trimmed.startsWith('//')) {
    return { ok: false, reason: 'Protocol-relative URLs are not allowed.' };
  }
  if (trimmed.startsWith('/')) return { ok: true };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Only https:// URLs are allowed.' };
  }
  if (!EXTERNAL_GAME_HOSTS.includes(url.hostname)) {
    return {
      ok: false,
      reason: `Host "${url.hostname}" is not allow-listed. Add it to EXTERNAL_GAME_HOSTS.`,
    };
  }
  return { ok: true };
}

/**
 * Renders an internet HTML5 game inside a locked-down iframe.
 *
 * The frame is sandboxed WITHOUT `allow-same-origin`, so it runs in an opaque
 * origin: it cannot read our DOM, localStorage, IndexedDB, or the room secret /
 * session key. `referrerPolicy="no-referrer"` avoids leaking the room URL.
 */
export function ExternalGameFrame({ meta }: ExternalGameFrameProps) {
  const [input, setInput] = useState(meta.url ?? '');
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const result = validateUrl(input);
    if (!result.ok) {
      setError(result.reason ?? 'Invalid URL.');
      setSrc(null);
      return;
    }
    setError(null);
    setSrc(input.trim());
  };

  return (
    <div className="space-y-3">
      <div className="retro-inset border-2 border-arcade-amber/60 p-3">
        <p className="font-term text-base text-arcade-amber leading-snug">
          Heads up: a third-party game loads from another origin and is <strong>outside</strong> the
          end-to-end encrypted boundary. It never sees your messages or room key (it runs in a
          sandboxed, opaque-origin frame), but its host can see your IP and set its own cookies.
          Only open games you trust.
        </p>
      </div>

      <div className="retro-panel p-3 space-y-2">
        <span className="retro-label">Game URL</span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="retro-input flex-1"
            placeholder="https://www.example-game-host.com/game.html"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <RetroButton variant="green" onClick={load}>
            LOAD
          </RetroButton>
        </div>
        <p className="font-term text-sm text-arcade-muted">
          Allow-listed hosts: {EXTERNAL_GAME_HOSTS.join(', ')}
        </p>
        {error && <p className="font-term text-base text-arcade-red">{error}</p>}
      </div>

      {src ? (
        <iframe
          key={src}
          title={meta.title}
          src={src}
          className="w-full h-[480px] border-2 border-arcade-border bg-black"
          sandbox="allow-scripts allow-pointer-lock"
          referrerPolicy="no-referrer"
          loading="lazy"
          allow="fullscreen; gamepad"
        />
      ) : (
        <div className="retro-inset border-2 border-arcade-border p-8 text-center font-term text-base text-arcade-muted">
          Load a game to start playing.
        </div>
      )}
    </div>
  );
}
