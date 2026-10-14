import React, { useState, useEffect } from 'react';

interface TypingBubbleProps {
  text: string;
  speed: number;
  onComplete: () => void;
  textDisplayMode: 'audio' | 'text';
}

export default function TypingBubble({ text, speed, onComplete, textDisplayMode }: TypingBubbleProps) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index++;
      if (index <= text.length) {
        setDisplayedText(text.slice(0, index));
      } else {
        clearInterval(interval);
        // Add a very small buffer before firing onComplete to make it feel natural
        const timer = setTimeout(() => {
          onComplete();
        }, 50);
        return () => clearTimeout(timer);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  if (textDisplayMode === 'audio') {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-classic-gold italic">
        <span className="animate-pulse">🔊</span>
        <span>Escutando fala...</span>
      </div>
    );
  }

  return <p className="font-serif leading-relaxed text-classic-ink">{displayedText}</p>;
}
