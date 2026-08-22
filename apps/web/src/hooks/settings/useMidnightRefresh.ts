import { useEffect, useState } from 'react';

/**
 * Force a re-render at the next local midnight, then again each following midnight, so the
 * transcript's date-relative timestamps stay correct when the calendar day rolls over during a
 * long-lived, idle session: a message shown as a bare clock time (because it is "today") flips to its
 * full weekday-and-date form once it is no longer today. During active use the list already
 * re-renders often enough to stay fresh; this only covers the idle-across-midnight gap. The
 * transcript is not a live region, so the refresh is silent - it announces nothing.
 */
export function useMidnightRefresh(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextMidnight = (): void => {
      const current = new Date();
      const nextMidnight = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
      ).getTime();
      timer = setTimeout(() => {
        setNow(Date.now());
        scheduleNextMidnight();
      }, nextMidnight - current.getTime());
    };
    scheduleNextMidnight();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
