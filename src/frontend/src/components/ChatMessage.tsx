import React, { useState } from 'react';
import { ChatMessage as MessageType } from '../lib/types';

interface ChatMessageProps {
  message: MessageType;
  peerAlias?: string;
  isPeerVerified?: boolean;
}

export function ChatMessage({ message, peerAlias = 'Peer', isPeerVerified = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isMe = message.sender === 'me';
  const isSystem = message.sender === 'system';

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleCopy = async () => {
    if (message.text) {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{message.text}</span>
          <span className="text-[10px] text-slate-500">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col mb-3 group ${isMe ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span className="text-[11px] font-medium text-slate-400">
          {isMe ? 'You' : (message.senderAlias || peerAlias)}
        </span>
        {!isMe && isPeerVerified && (
          <span title="Peer identity verified via SAS" className="text-emerald-400">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        <span className="text-[10px] text-slate-500">
          {formatTime(message.timestamp)}
        </span>
      </div>

      <div className="relative max-w-[85%] sm:max-w-[70%]">
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm ${
            isMe
              ? 'bg-brand-600 text-white rounded-br-none shadow-brand-950/20'
              : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-none shadow-slate-950/20'
          }`}
        >
          {message.text}
        </div>

        {/* Action tooltip on hover */}
        <button
          onClick={handleCopy}
          title="Copy message"
          className={`absolute top-1 ${
            isMe ? '-left-8' : '-right-8'
          } p-1.5 bg-slate-800/90 border border-slate-700 rounded-lg text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity`}
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}