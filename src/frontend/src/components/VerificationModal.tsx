import React from 'react';
import { AccessibleModal } from './AccessibleModal';
import { RetroButton } from './RetroUI';
import { MkcStatus, SASData } from '../lib/types';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sasData: SASData | null;
  isVerified: boolean;
  mkcStatus: MkcStatus;
  onVerify: () => void;
  isGroup?: boolean;
  participantCount?: number;
}

export function VerificationModal({
  isOpen,
  onClose,
  sasData,
  isVerified,
  mkcStatus,
  onVerify,
  isGroup = false,
  participantCount = 2,
}: VerificationModalProps) {
  if (!sasData) return null;

  const badgeClass =
    mkcStatus === 'confirmed' || mkcStatus === 'group'
      ? 'border-arcade-green/50 text-arcade-green'
      : mkcStatus === 'failed'
        ? 'border-arcade-red/60 text-arcade-red'
        : 'border-arcade-yellow/50 text-arcade-yellow';

  const badgeText =
    mkcStatus === 'confirmed'
      ? 'OK Mutual Key Confirmation: PASSED'
      : mkcStatus === 'group'
        ? `OK Group key derived for ${participantCount} players`
        : mkcStatus === 'failed'
          ? '!! Mutual Key Confirmation: FAILED - MITM'
          : '.. Mutual Key Confirmation: waiting for peer';

  return (
    <AccessibleModal isOpen={isOpen} onClose={onClose} title="Verify Fingerprint (SAS)">
      <div className="space-y-5">
        <p className="text-sm text-arcade-text/80 leading-relaxed font-term text-base">
          {isGroup
            ? `Compare this fingerprint with everyone in the room over voice or in person. All ${participantCount} players see the same code, derived from the shared key transcript. If it matches, nobody is eavesdropping.`
            : 'Compare this Short Authentication String with your peer over an out-of-band channel. Both sides show the identical code because it is derived from the shared channel transcript. If they match, no Man-in-the-Middle is present.'}
        </p>

        <div data-testid="mkc-badge" className={`retro-inset flex items-center justify-between p-3.5 text-xs font-pixel uppercase tracking-wider ${badgeClass}`}>
          <span>{badgeText}</span>
        </div>

        <div className="retro-inset p-5 text-center space-y-3">
          <div className="retro-label">Emoji Fingerprint</div>
          <div className="flex justify-center items-center gap-3 text-3xl sm:text-4xl py-1 select-none" data-testid="sas-emojis">
            {sasData.emojis.map((emoji, idx) => (
              <span key={idx} className="p-2 bg-arcade-deep border-2 border-arcade-border">
                {emoji}
              </span>
            ))}
          </div>

          <div className="pt-3 border-t-2 border-arcade-border">
            <div className="retro-label mb-1">Security Code &amp; Phrase</div>
            <div className="text-2xl font-mono font-bold tracking-widest neon-green" data-testid="sas-code">
              {sasData.code.slice(0, 3)} {sasData.code.slice(3)}
            </div>
            <div className="text-sm font-mono text-arcade-cyan mt-1" data-testid="sas-words">
              {sasData.words}
            </div>
          </div>
        </div>

        <div className="pt-1">
          {isVerified ? (
            <div className="flex items-center justify-between p-3.5 border-2 border-arcade-green/50 text-arcade-green text-xs font-pixel uppercase">
              <span>Peer Identity Confirmed</span>
              <RetroButton type="button" variant="green" onClick={onClose}>
                Done
              </RetroButton>
            </div>
          ) : (
            <RetroButton
              type="button"
              variant="green"
              className="w-full"
              onClick={() => {
                onVerify();
                onClose();
              }}
            >
              Confirm Codes Match &amp; Mark Verified
            </RetroButton>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}
