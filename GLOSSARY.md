# Glossary

Terms used in code, tests and the UI. Prefer these words over synonyms.

**praamid.ee** — the ferry operator's booking site (TS Laevad). Source of truth for tickets, departures and prices.

**Direction** — a route and its way of travel, by praamid.ee code: `VK` Virtsu → Kuivastu, `KV` Kuivastu → Virtsu, `RH` Rohuküla → Heltermaa, `HR` Heltermaa → Rohuküla.

**Departure** (`event` in the praamid.ee API) — one sailing in one direction at one time, identified by `eventUid`. Has a ship, a start time (`dtstart`) and free **capacity** per measurement unit.

**Measurement unit** — what a ticket occupies on board: `sv` small vehicle, `bv` large vehicle, `pcs` passenger, `mc` motorcycle, `bc` bicycle. Capacity is checked in the ticket's unit only.

**Ticket** — a booked place on one departure, as it exists on praamid.ee. Every swap produces a new ticket with a new id that points back to the old one through `parentTicketId`. Our `tickets` table is a copy of the user's active, future tickets.

**Option** — a departure the user would rather be on than their ticket's current one. Each option has a **priority** (1 is the most wanted) and a **cutoff**.

**Cutoff** — how many minutes before an option's departure we stop trying to move onto it (`stopBeforeMinutes`, default 60).

**Open** — an option's departure has at least one free unit in the ticket's measurement unit.

**Better option** — an option with a lower priority number than the option matching the ticket's current departure. When the current departure is not an option at all, every option is better.

**Swap** — moving a ticket to a better, open option before its cutoff, at no extra cost. On praamid.ee this is: edit the ticket, check the booking balance, commit with a zero-sum invoice. Anything owed means the edit is reverted. We never pay.

**Sync** — fetching a user's tickets from praamid.ee and updating our copy: new tickets are added, gone tickets removed, options follow a ticket to its successor, and the option a ticket now sits on (and every worse one) is dropped.

**Cycle** — one pass of the worker, every 10 seconds: sync users whose copy is stale, check which better options are open, and schedule a swap for each such ticket.

**praamid.ee login** — the user's praamid.ee session, captured through Smart-ID by the login bot and stored as an encrypted refresh token. A swap is only started while the login has at least 15 minutes left.
