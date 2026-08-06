"use client";

/**
 * Shows the unique install count returned by the ping hook.
 * Renders nothing until the count is known, so the layout never jumps.
 */

import { Users } from "lucide-react";
import { usePing } from "@/lib/usePing";

export function UserCountBadge() {
  const { users } = usePing();
  if (users == null) return null;

  return (
    <p className="flex items-center gap-1.5 text-[12px] text-[var(--faint)]">
      <Users size={12} strokeWidth={2} />
      <span>
        <span className="tnum font-mono font-semibold text-[var(--muted)]">
          {users.toLocaleString()}
        </span>{" "}
        people tracking with Bench
      </span>
    </p>
  );
}
