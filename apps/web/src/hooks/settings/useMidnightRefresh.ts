import { useEffect, useState } from 'react';

/**
 * Force a re-render at the next local midnight, then again each following midnight, so the
 * transcript's date-relative timestamps stay correct when the calendar day rolls over during a
 * long-lived, idle session: a message shown as a bare clock time (because it is "today") flips to its
 * full weekday-and-date form once it is no longer today. During active use the list already
 * re-renders often enough to stay fresh; this only covers the idle-across-midnight gap. The
 * transcript is not a live region, so the refresh is silent - it announces nothing.
 */
export function useMidnightRefresh(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextMidnight = (): void => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      timer = setTimeout(() => {
        setTick((t) => t + 1);
        scheduleNextMidnight();
      }, nextMidnight - now.getTime());
    };
    scheduleNextMidnight();
    return () => clearTimeout(timer);
  }, []);
}
