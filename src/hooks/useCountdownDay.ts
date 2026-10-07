import { useEffect, useState } from "react";
import { getCountdownToday, getNextCountdownDayDelay } from "../utils/countdownDate";

/** Recompute at midnight, and on waking a suspended/backgrounded page. No polling. */
export function useCountdownDay() {
  const [day, setDay] = useState(() => getCountdownToday());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date(); setDay(getCountdownToday(now));
      timer = setTimeout(refresh, getNextCountdownDayDelay(now));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  return day;
}
