import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { RetroButton } from '../components/RetroUI';

export function ErrorScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { title?: string; message?: string; type?: string } | undefined;

  const title = state?.title || 'Unable to Connect to Room';
  const message = state?.message || 'The room may have expired, reached its maximum capacity, or been permanently destroyed.';

  return (
    <div className="min-h-screen bg-arcade-bg text-arcade-text flex flex-col justify-between items-center p-4">
      <div className="w-full max-w-6xl py-4">
        <Link to="/" className="font-pixel text-[13px] neon-green">
          RANTCHIT
        </Link>
      </div>

      <div className="max-w-md w-full retro-window p-6 text-center space-y-5 animate-pop">
        <div className="text-5xl">💀</div>

        <div className="space-y-2">
          <h1 className="font-pixel text-[11px] text-arcade-red uppercase leading-relaxed">{title}</h1>
          <p className="text-sm text-arcade-muted font-term text-base leading-snug">{message}</p>
        </div>

        <div className="retro-inset p-4 text-left space-y-2">
          <div className="font-pixel text-[8px] text-arcade-yellow uppercase">Why might this happen?</div>
          <ul className="list-disc list-inside space-y-1 text-arcade-muted font-term text-base">
            <li>Rooms enforce their participant limit.</li>
            <li>Rooms expire automatically based on creator TTL.</li>
            <li>Any participant can nuke and destroy the session instantly.</li>
          </ul>
        </div>

        <div className="pt-1 flex flex-col gap-2.5">
          <RetroButton variant="green" className="w-full !py-3" onClick={() => navigate('/')}>
            CREATE A NEW ROOM
          </RetroButton>
          <RetroButton className="w-full !py-3" onClick={() => navigate('/')}>
            RETURN TO HOMEPAGE
          </RetroButton>
        </div>
      </div>

      <div className="font-pixel text-[8px] text-arcade-muted py-4">
        ZERO-KNOWLEDGE EPHEMERAL ARCHITECTURE
      </div>
    </div>
  );
}
