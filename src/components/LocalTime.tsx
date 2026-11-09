"use client";

import { useEffect, useState } from "react";

function format(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Renders a timestamp in the viewer's locale. Rendered after mount to avoid hydration mismatches. */
export function LocalTime({ ts }: { ts: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- locale formatting must happen client-side, after hydration
    setText(format(ts));
    const t = setInterval(() => setText(format(ts)), 30_000);
    return () => clearInterval(t);
  }, [ts]);
  return <time dateTime={new Date(ts).toISOString()}>{text}</time>;
}
