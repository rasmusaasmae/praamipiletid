# Phase 5 — Live "last checked" / "swap in progress"

**Status:** done (pending server verify)
**Blocked by:** phase 3

## Why

The original motivation for this whole refactor. Make it impossible for the UI to show stale ticket-availability info or miss a swap that's actively running.

## Scope

### Schema additions

- [x] `trips.last_checked_at timestamptz NULL` — updated by worker at the end of every check pass for this trip.
- [x] `trips.swap_in_progress boolean DEFAULT false NOT NULL` — flipped true when worker starts a swap for the trip, false when it finishes or times out.
- [x] `trip_options.last_capacity_checked_at timestamptz NULL` — per-option timestamp for the availability badge.
- [x] Migration `drizzle/0001_rich_maggott.sql` generated. Electric shape route has no column whitelist, so new columns flow through automatically.

### Worker changes

- [x] `lib/poller.ts`: writes `lastCapacityCheckedAt` per option and `lastCheckedAt` per trip inside the tick, using a single `checkedAt = new Date()` captured before processing the batch.
- [x] Swap path: `swapInProgress` flipped `true` before `processEditForTrip`, `false` in `finally`. Audit entries `swap.started` / `swap.finished` bracket each swap.
- [x] Audit: `swap.recovered` entries emitted on boot when stuck flags are cleared.

### UI

- [x] Trip card: "checked Ns ago" relative timestamp in the header, re-rendered every 1s via local `useNow` ticker.
- [x] Trip card: animated spinner badge (`Loader2`) shown while `swap_in_progress = true`.
- [x] Option row: per-option checked-at relative label, amber-coloured when stale beyond `pollIntervalMs * 2`.
- [x] `pollIntervalMs` fetched once server-side in `app/[locale]/(app)/page.tsx` and passed down (settings shape is admin-only; no live updates needed for the home page).

### Edge cases

- [x] Worker crash with `swap_in_progress = true` → `recoverStuckSwaps()` runs before the poll loop boots. It clears ALL stuck rows — only the worker writes this flag, so if the worker is booting nothing is in flight. Simpler than a time-threshold check. Each recovery row gets a `swap.recovered` audit.
- [x] Race: UI sees `swap_in_progress=false` but next check hasn't happened → 1s ticker handles this naturally.

### i18n

- [x] Added `Trips.checkedAgo`, `Trips.notYetChecked`, `Trips.swapping` (en + et).
- [x] Added `Relative.secondsAgo`, `Relative.minutesAgo`, `Relative.hoursAgo` (en + et).

### Audit type additions

- [x] `swap.started`, `swap.finished`, `swap.recovered` added to `AuditPayload` in `lib/audit.ts`.

## Local verification

- [x] `bun run typecheck` — clean.
- [x] `bun run lint` — clean.

## Server verification

- [ ] Boot full stack. Open home page, watch "checked Ns ago" counter tick each second.
- [ ] Wait through a poller cycle. Counter should reset to `0s ago` without a page refresh.
- [ ] Trigger a swap (auto or manual). Trip card shows the `swapping` spinner badge live.
- [ ] Kill the worker mid-swap, restart. `swap_in_progress` clears on boot via `recoverStuckSwaps()` and a `swap.recovered` audit lands.

## Definition of done

- [x] Schema + migration.
- [x] Poller writes trip-level + per-option timestamps and toggles `swap_in_progress` safely.
- [x] Crash-recovery path on boot.
- [x] UI renders live "checked Ns ago" + swap spinner + stale per-option colour cue.
- [x] i18n strings + audit types added.
- [ ] Server walkthrough (above).
