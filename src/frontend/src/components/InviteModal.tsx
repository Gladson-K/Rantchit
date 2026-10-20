import React, { useState } from 'react';
import { AccessibleModal } from './AccessibleModal';
import { RetroButton } from './RetroUI';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteUrl: string;
  maxParticipants?: number;
}

export function InviteModal({ isOpen, onClose, inviteUrl, maxParticipants = 2 }: InviteModalProps) {
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
    <AccessibleModal isOpen={isOpen} onClose={onClose} title="Invite Players">
      <div className="space-y-5">
        <p className="text-sm text-arcade-text/80 leading-relaxed font-term text-lg">
          Share this link. The room key lives only in the URL fragment (
          <code className="text-arcade-green">#secret</code>) and is never sent to the server.
        </p>

        <div>
          <label className="block retro-label mb-2">Secure Invitation URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              data-testid="invite-url-input"
              className="retro-input text-xs font-mono truncate select-all"
            />
            <RetroButton
              type="button"
              variant={copied ? 'green' : 'cyan'}
              onClick={handleCopy}
              className="whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </RetroButton>
          </div>
        </div>

        <div className="retro-inset p-3.5 flex items-start gap-3 text-xs text-arcade-muted">
          <span className="text-arcade-yellow text-lg leading-none">i</span>
          <div className="font-term text-base leading-snug">
            <span className="text-arcade-text font-bold">
              Room capacity: {maxParticipants} player{maxParticipants === 1 ? '' : 's'}.
            </span>{' '}
            {maxParticipants > 2
              ? 'Everyone in the room shares one group key derived from the room secret and the participants\u2019 ephemeral keys.'
              : 'Once your peer joins, the slot locks. No third party can enter.'}
          </div>
        </div>

        <div className="pt-1 flex justify-end">
          <RetroButton type="button" onClick={onClose}>
            Done
          </RetroButton>
        </div>
      </div>
    </AccessibleModal>
  );
}
