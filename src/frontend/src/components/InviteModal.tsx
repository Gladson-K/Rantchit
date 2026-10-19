import React, { useState } from 'react';
import { AccessibleModal } from './AccessibleModal';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteUrl: string;
}

export function InviteModal({ isOpen, onClose, inviteUrl }: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  return (
    <AccessibleModal isOpen={isOpen} onClose={onClose} title="Invite Peer to Private Room">
      <div className="space-y-5">
        <p className="text-sm text-slate-300">
          Share this single-use link with your peer. The cryptographic secret is contained strictly in the URL fragment (<code className="text-brand-300 font-mono">#secret</code>) and is never transmitted to the server.
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Secure Invitation URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              data-testid="invite-url-input"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 truncate select-all"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2.5 rounded-xl font-medium text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shadow-lg ${
                copied
                  ? 'bg-emerald-600 text-white shadow-emerald-900/30'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-900/40'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-400">
          <svg className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-semibold text-slate-300">Atomic 2-Party Limit:</span> Once your peer joins, the room slot is permanently locked. No third party or eavesdropper can intercept or enter the session.
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
