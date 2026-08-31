import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';

export function ErrorScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { title?: string; message?: string; type?: string } | undefined;

  const title = state?.title || 'Unable to Connect to Room';
  const message = state?.message || 'The room may have expired, reached its 2-participant capacity, or been permanently destroyed.';

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between items-center p-4 selection:bg-brand-500 selection:text-white">
      <div className="w-full max-w-6xl py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white font-bold tracking-tight">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
          <span>Rantchit</span>
        </Link>
      </div>

      <div className="max-w-md w-full glass-panel p-8 rounded-3xl border border-slate-800 text-center space-y-6 shadow-2xl animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto glow-rose">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{message}</p>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs text-slate-400 text-left space-y-2">
          <div className="font-semibold text-slate-300">Why might this happen?</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400">
            <li>Rooms enforce an exact 2-person limit.</li>
            <li>Rooms expire automatically based on creator TTL.</li>
            <li>Any participant can nuke and destroy the session instantly.</li>
          </ul>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-brand-950/30"
          >
            Create a New Room
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-sm border border-slate-700 transition-colors"
          >
            Return to Homepage
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-600 py-4">
        Zero-Knowledge Ephemeral Architecture
      </div>
    </div>
  );
}
