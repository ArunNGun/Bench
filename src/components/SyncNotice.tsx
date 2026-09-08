"use client";

/**
 * Says so, on every page, when syncing has stopped.
 *
 * This exists because of a bug in the first version of automatic sync, and the
 * bug is worth recording rather than quietly fixing. A conflict halts the
 * engine, deliberately: with both sides changed, continuing means destroying
 * one of them. But the question was drawn on a card on the settings page, and
 * nowhere else. So a phone could sit for hours showing a perfectly normal
 * Today screen while transferring nothing at all, and the only hint was on a
 * page nobody visits.
 *
 * Silence plus a normal-looking app is the worst state an automatic sync can be
 * in. Manual sync could not reach it, because the person pressing the button
 * was looking right at the result. So anything that stops the flow has to
 * interrupt, wherever the person happens to be.
 *
 * Ordinary states stay quiet. "Syncing" and "up to date" say nothing here; they
 * belong on the settings card, where someone has gone looking.
 */

import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Callout } from "./ui";
import { useSyncState } from "@/lib/sync/state";
import { formatDateTime } from "@/lib/format";
import { useLang } from "@/lib/i18n";

/** The two answers to a conflict, usable from the frame or from Settings. */
export function ConflictChoices({ compact = false }: { compact?: boolean }) {
  const { t } = useLang();
  const engine = useSyncState((s) => s.engine);
  const conflict = useSyncState((s) => s.status.conflict);

  return (
    <>
      {conflict != null && (
        <p className={`${compact ? "mt-1" : "mt-1.5"} text-[12.5px]`}>
          {t("notice_server_copy_written", { when: formatDateTime(conflict.updatedAt) })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button variant="primary" onClick={() => void engine?.resolveConflict("keep-mine")}>
          {t("notice_keep_device")}
        </Button>
        <Button onClick={() => void engine?.resolveConflict("take-theirs")}>
          {t("notice_take_server")}
        </Button>
      </div>
    </>
  );
}

/**
 * The banner in the frame.
 *
 * Three states earn one. A conflict, because nothing moves until it is
 * answered. A failure, because it will not clear itself. And being offline,
 * but only after long enough that it is no longer a passing thing: a phone
 * changing cell towers should not put a warning on the screen, a phone that has
 * not reached the server since this morning should.
 */
export function SyncNotice() {
  const { t } = useLang();
  const status = useSyncState((s) => s.status);
  const engine = useSyncState((s) => s.engine);
  const connected = useSyncState((s) => s.key != null);

  if (!connected || engine == null) return null;

  if (status.phase === "conflict") {
    return (
      <div className="mb-4">
        <Callout tone="danger" title={t("notice_sync_stopped")}>
          <p>
            {t("notice_conflict")}
          </p>
          <ConflictChoices />
        </Callout>
      </div>
    );
  }

  /*
   * Its own banner rather than the failure one, because the failure one offers
   * Try again, and trying again with no session is the one thing guaranteed not
   * to help. This says what happened and points at the only control that can
   * fix it.
   */
  if (status.phase === "signedout") {
    return (
      <div className="mb-4">
        <Callout tone="warn" title={t("notice_signed_out")}>
          <p className="flex items-start gap-2">
            <CloudOff size={15} className="mt-0.5 shrink-0" />
            <span>
              {t("notice_expired")}
            </span>
          </p>
          <div className="mt-3">
            <Link href="/settings">
              <Button>{t("notice_go_settings")}</Button>
            </Link>
          </div>
        </Callout>
      </div>
    );
  }

  if (status.phase === "error") {
    return (
      <div className="mb-4">
        <Callout tone="danger" title={t("sync_error")}>
          <p className="flex items-start gap-2">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>{status.message}</span>
          </p>
          <div className="mt-3">
            <Button onClick={() => engine.request("now")}>
              <RefreshCw size={15} /> {t("notice_try_again")}
            </Button>
          </div>
        </Callout>
      </div>
    );
  }

  /*
   * Offline is normal and usually brief, so it earns a banner only once it has
   * lasted. A lift, a tunnel or a train is not news. An hour is.
   */
  const staleFor =
    status.phase === "offline" && status.lastSyncedAt != null
      ? Date.now() - status.lastSyncedAt
      : 0;

  if (status.phase === "offline" && staleFor > 60 * 60_000) {
    return (
      <div className="mb-4">
        <Callout tone="warn" title={t("notice_not_reaching")}>
          <p className="flex items-start gap-2">
            <CloudOff size={15} className="mt-0.5 shrink-0" />
            <span>
              {t("notice_nothing_reached", { when: formatDateTime(status.lastSyncedAt!) })}
            </span>
          </p>
        </Callout>
      </div>
    );
  }

  return null;
}
