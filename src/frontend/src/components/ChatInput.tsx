import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 sm:p-4 bg-arcade-deep border-t-3 border-arcade-border">
      <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-arcade-green font-pixel text-[10px] pointer-events-none">
            &gt;_
          </span>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            maxLength={4000}
            data-testid="chat-input"
            placeholder={
              disabled
                ? placeholder || 'Waiting for handshake...'
                : placeholder || 'Type an encrypted message...'
            }
            className="retro-input pl-10 font-term text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {text.length > 3000 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-arcade-muted font-mono">
              {text.length}/4000
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || !text.trim()}
          data-testid="chat-send"
          className="retro-btn retro-btn-green h-[46px] flex items-center justify-center shrink-0"
          aria-label="Send encrypted message"
        >
          SEND
        </button>
      </div>
    </form>
  );
}
