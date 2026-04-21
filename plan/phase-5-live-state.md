# Phase 5 — Live "last checked" / "swap in progress"

**Status:** not started
**Blocked by:** phase 3

## Why

The original motivation for this whole refactor. Make it impossible for the UI to show stale ticket-availability info or miss a swap that's actively running.

## Scope

### Schema additions

- [ ] `trips.last_checked_at timestamptz NULL` — updated by worker at the end of every check pass for this trip.
- [ ] `trips.swap_in_progress boolean DEFAULT false NOT NULL` — flipped true when worker starts a swap for the trip, false when it finishes or times out.
- [ ] `trip_options.last_capacity_checked_at timestamptz NULL` — per-option timestamp for the availability badge.
- [ ] Migration + denorm considerations (ensure replication captures the columns).

### Worker changes

- [ ] `lib/worker.ts` (or wherever the poller lives): write `last_checked_at` at the end of each cycle, inside the same transaction that writes capacity.
- [ ] Swap path: `UPDATE trips SET swap_in_progress = true` at start, `false` on completion (success, failure, or cancellation — wrap with try/finally).
- [ ] Add an audit log entry whenever `swap_in_progress` flips, for debugging stuck states.

### UI

- [ ] Trip card: relative timestamp badge ("checked 12s ago") driven by `last_checked_at`; re-render every second using a small ticker hook so the label stays fresh without new data.
- [ ] Trip card: spinner/indicator while `swap_in_progress = true`.
- [ ] Option row: per-option checked-at timestamp, colour-coded if stale beyond `pollIntervalMs`.

### Edge cases

- [ ] Worker crash with `swap_in_progress = true` → add a recovery check at boot that clears stuck flags older than some threshold (e.g. 5 minutes).
- [ ] Race: UI sees `swap_in_progress=false` but the next check hasn't happened yet → the "12s ago" ticker already handles this fine; no extra work.

## Definition of done

- Open a trip page. Touch nothing. Watch the "checked Ns ago" counter tick. Watch the number reset when the poller cycles.
- Trigger a swap. Trip card shows the spinner live without refresh.
- Kill the worker mid-swap, restart. Stuck flag clears within 5 minutes.
