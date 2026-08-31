import { useState, useEffect, useMemo } from 'react';

export function useCountdown(expiresAt: string | null | undefined, onExpire?: () => void) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;

    const calculateRemaining = () => {
      const targetTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
      setRemainingSeconds(diffSeconds);

      if (diffSeconds <= 0 && onExpire) {
        onExpire();
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const formattedTime = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingSeconds]);

  const isExpired = remainingSeconds <= 0 && Boolean(expiresAt);
  const isUrgent = remainingSeconds > 0 && remainingSeconds < 300; // less than 5 minutes

  return {
    remainingSeconds,
    formattedTime,
    isExpired,
    isUrgent
  };
}
