import React from 'react';

export function ChatMessage({ message }: { message: any }) {
  const isMe = message.sender === 'me';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] px-4 py-2 rounded-lg ${isMe ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-900'}`}>
        {message.text}
      </div>
    </div>
  );
}