import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimeoutOptions {
  /** Idle time in milliseconds before showing the warning (default: 15 minutes) */
  idleTimeout?: number;
  /** Time in milliseconds the warning is shown before auto-logout (default: 2 minutes) */
  warningDuration?: number;
  /** Called when the user is logged out due to inactivity */
  onTimeout: () => void;
  /** Whether the hook is active (set to false when user is not authenticated) */
  enabled?: boolean;
}

export function useIdleTimeout({
  idleTimeout = 15 * 60 * 1000,   // 15 minutes
  warningDuration = 2 * 60 * 1000, // 2 minutes
  onTimeout,
  enabled = true,
}: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningEndRef = useRef<number>(0);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    idleTimerRef.current = null;
    warningTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const startWarningCountdown = useCallback(() => {
    setShowWarning(true);
    warningEndRef.current = Date.now() + warningDuration;
    setRemainingSeconds(Math.ceil(warningDuration / 1000));

    countdownRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((warningEndRef.current - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 1000);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(false);
      clearAllTimers();
      onTimeout();
    }, warningDuration);
  }, [warningDuration, onTimeout, clearAllTimers]);

  const resetIdleTimer = useCallback(() => {
    if (!enabled) return;

    // If warning is showing, user activity dismisses it
    if (showWarning) {
      setShowWarning(false);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      warningTimerRef.current = null;
      countdownRef.current = null;
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      startWarningCountdown();
    }, idleTimeout);
  }, [enabled, showWarning, idleTimeout, startWarningCountdown]);

  /** Explicitly dismiss the warning and reset the idle timer. */
  const stayLoggedIn = useCallback(() => {
    setShowWarning(false);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    warningTimerRef.current = null;
    countdownRef.current = null;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      startWarningCountdown();
    }, idleTimeout);
  }, [idleTimeout, startWarningCountdown]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    // Start the initial idle timer
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearAllTimers();
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { showWarning, remainingSeconds, stayLoggedIn };
}
