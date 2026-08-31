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
    <form 
      onSubmit={handleSubmit} 
      className="p-3 sm:p-4 bg-[#111827]/90 border-t border-slate-800 backdrop-blur-md"
    >
      <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            maxLength={4000}
            placeholder={
              disabled 
                ? 'Waiting for peer or cryptographic handshake...' 
                : placeholder || 'Type an encrypted message...'
            }
            className="w-full px-4 py-3 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          {text.length > 3000 && (
            <span className="absolute right-3 top-3.5 text-[10px] text-slate-400 font-mono">
              {text.length}/4000
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="p-3 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-brand-950/30 disabled:shadow-none flex items-center justify-center shrink-0"
          aria-label="Send encrypted message"
        >
          <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </form>
  );
}