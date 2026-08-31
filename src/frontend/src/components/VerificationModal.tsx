import React from 'react';
import { AccessibleModal } from './AccessibleModal';
import { SASData } from '../lib/types';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sasData: SASData | null;
  isVerified: boolean;
  onVerify: () => void;
}

export function VerificationModal({
  isOpen,
  onClose,
  sasData,
  isVerified,
  onVerify
}: VerificationModalProps) {
  if (!sasData) return null;

  return (
    <AccessibleModal isOpen={isOpen} onClose={onClose} title="Peer Cryptographic Verification (SAS)">
      <div className="space-y-6">
        <p className="text-sm text-slate-300">
          Compare this <strong>Short Authentication String (SAS)</strong> with your peer via an out-of-band channel (e.g., voice or in person). If both match, it mathematically guarantees no Man-in-the-Middle (MITM) attack is occurring.
        </p>

        {/* Visual Emoji Fingerprint */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-center space-y-3">
          <div className="text-xs uppercase font-semibold tracking-wider text-slate-400">
            Emoji Fingerprint
          </div>
          <div className="flex justify-center items-center gap-4 text-3xl sm:text-4xl py-1 select-none">
            {sasData.emojis.map((emoji, idx) => (
              <span 
                key={idx} 
                className="p-2 bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-inner transform hover:scale-110 transition-transform"
              >
                {emoji}
              </span>
            ))}
          </div>

          {/* Hex & Word Mnemonic */}
          <div className="pt-2 border-t border-slate-800">
            <div className="text-xs uppercase font-semibold tracking-wider text-slate-400 mb-1">
              Security Code & Phrase
            </div>
            <div className="text-xl font-mono font-bold tracking-widest text-brand-400">
              {sasData.code.slice(0, 3)} {sasData.code.slice(3)}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-1">
              {sasData.words}
            </div>
          </div>
        </div>

        {/* Verification Status Action */}
        <div className="pt-2">
          {isVerified ? (
            <div className="flex items-center justify-between p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Peer Identity Confirmed
              </div>
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                onVerify();
                onClose();
              }}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Confirm Match & Mark Verified
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}