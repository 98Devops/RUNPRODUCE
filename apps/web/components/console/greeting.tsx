'use client';

import { useEffect, useState } from 'react';

function forHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning.';
  if (hour >= 12 && hour < 17) return 'Good afternoon.';
  return 'Good evening.';
}

/**
 * The page is built once, ahead of time, so the server cannot know the
 * reader's time of day. The greeting is the reader's own clock, set after load;
 * until then it says "Hello." rather than guessing.
 */
export function Greeting({ className }: { readonly className?: string }) {
  const [text, setText] = useState('Hello.');
  useEffect(() => {
    setText(forHour(new Date().getHours()));
  }, []);
  return <h1 className={className}>{text}</h1>;
}
