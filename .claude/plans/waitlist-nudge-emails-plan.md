# Plan: Waitlist Nudge & Removal Emails — Issues #499 + #500

Combined plan. #499 (3-day / 7-day nudges) and #500 (1-month reminder, 2-month final notice + removal) are folded into one implementation because they share the exact same mechanism — a periodic scan of `INVITED` `Waitlist` entries by age — and generalizing the dispatch logic once costs nothing extra while making #500 a small addition rather than a second implementation.

## 1. High-level strategy

Both issues deviate from their literal specs (#499's `apply_async(eta=...)`, #500's "monthly cron") in favour of one Celery Beat task running every 2 hours, driven entirely by a small config list of milestones rather than per-entry scheduled tasks or a separate monthly job.

**Why deviate from both:**
- #499's eta-task approach depends on a worker holding a task in memory for up to 7 days; prod Redis is configured with `maxmemoryPolicy: allkeys-lru` ([render.yaml:63](render.yaml:63)/`render-staging.yaml`), which can evict arbitrary unexpired keys under memory pressure — a real risk for anything an ETA task relies on surviving that long.
- #500's "monthly cron" framing already tolerates drift of "a few weeks" past the nominal mark (per the issue's own notes), so evaluating the same condition every 2 hours instead of monthly satisfies the acceptance criteria strictly better (entries are caught sooner, never later), at negligible cost — the query is cheap and will simply no-op on almost every tick for the 30/60-day checks. A 2-hour interval was chosen over a tighter one (e.g. 30 min) since the 30-min figure wasn't load-bearing to begin with — it was only loosely matched to an unrelated existing task's cadence — and even the tightest milestone (3-day) tolerates a couple of hours of drift trivially (~2.8%). Fewer runs means less log noise and fewer no-op queries for no correctness cost, since the guarded `.update()` (not the interval) is what actually prevents double-sends.
- Reusing one task/schedule for all four milestones (rather than splitting nudges from monthly review into separate tasks) was considered and rejected in favour of unifying, once it was clear the "monthly cron" constraint itself was already being relaxed — see Design Decision (b).

A single Beat-scheduled task runs every 2 hours, iterates a small `NUDGE_SCHEDULE` list of milestones (3 days, 7 days, 30 days, 60 days), and for each: queries `Waitlist` for `INVITED` entries past that milestone's age that haven't received that milestone's email yet, sends the email, and marks it sent via a guarded `.update()`. The 60-day milestone is marked `terminal`: its email is a different ("you've been removed, re-register at your leisure") template, and its guarded update also flips `status` to `REMOVED`.

Reuses: `Waitlist` model (5 new fields, no task-ID tracking), `waitlist_service.py`, `users/tasks.py`, `progress_rpg/celery.py`'s existing `beat_schedule` dict, existing email-sending pattern (`send_email_to_users`). No new Celery mechanism, no `revoke()`, no per-entry task IDs.

## 2. Files likely to change

| File | Change | New/Existing |
|---|---|---|
| [users/models.py](users/models.py) | Add 4 nullable `DateTimeField`s to `Waitlist`: `nudge_3day_sent_at`, `nudge_7day_sent_at`, `nudge_30day_sent_at`, `nudge_removal_sent_at` | Existing |
| `users/migrations/0012_*.py` | Migration for the above | New |
| [users/services/waitlist_service.py](users/services/waitlist_service.py) | Add `NUDGE_SCHEDULE` list and `send_due_nudges()` — iterates the list, queries and dispatches due milestones | Existing |
| [users/tasks.py](users/tasks.py) | Add `send_waitlist_nudges` Celery task calling `waitlist_service.send_due_nudges()` (matches the existing `invite_waitlist_entries` task shape) | Existing |
| [progress_rpg/celery.py](progress_rpg/celery.py) | Add one entry to `beat_schedule` for the new task (every 2 hours) | Existing |
| [core/models.py](core/models.py) | Add `waitlist_nudges_enabled_from` (nullable `DateTimeField`) to `GameSettings` — the cutoff | Existing |
| `core/migrations/00XX_*.py` | Schema migration for the new field, plus a data migration setting it to `timezone.now()` for the existing (singleton) `GameSettings` row so the cutoff defaults to "rollout time" without manual admin action | New |
| `templates/emails/waitlist_nudge_message.txt` / `.html` | Shared nudge template for the 3/7/30-day milestones, parameterised by day count | New |
| `templates/emails/waitlist_removed_message.txt` / `.html` | Separate template for the 60-day terminal notice ("removed, re-register at your leisure") | New |
| [users/tests/test_waitlist.py](users/tests/test_waitlist.py) | New tests — see §6 | Existing |

No changes needed to `invite_entry`/`invite_up_to_headroom`, `api/serializers.py`, or `users/admin.py`:
- Redemption/manual removal are handled for free — both flip `status` away from `INVITED`, so the scan's query simply excludes them going forward.
- #500's "removed entries excluded from future invite headroom" and "can't be redeemed afterward" acceptance criteria are already satisfied by existing code with no change: `invite_up_to_headroom()` only ever selects `status=WAITING` rows, and `custom_signup`'s redemption path only matches `status=INVITED` — a `REMOVED` row already fails both filters. Similarly the `unique_active_waitlist_email` constraint only covers `waiting`/`invited`, so a removed entry's email is already free to re-signup, per #500's "frees up a waitlist slot" requirement.

## 3. Implementation plan

1. **Model fields** — add the 4 nullable `sent_at` fields to `Waitlist`, migrate. Idempotency markers only, no task IDs.
2. **Schedule config** (`waitlist_service.py`) — define:
   ```python
   NUDGE_SCHEDULE = [
       {"days": 3,  "field": "nudge_3day_sent_at",   "template": "waitlist_nudge_message"},
       {"days": 7,  "field": "nudge_7day_sent_at",   "template": "waitlist_nudge_message"},
       {"days": 30, "field": "nudge_30day_sent_at",  "template": "waitlist_nudge_message"},
       {"days": 60, "field": "nudge_removal_sent_at","template": "waitlist_removed_message", "terminal": True},
   ]
   ```
3. **Query + dispatch** (`waitlist_service.send_due_nudges()`) — for each entry in `NUDGE_SCHEDULE`: select `Waitlist` rows where `status=INVITED`, `invited_at >= waitlist_nudges_enabled_from`, `invited_at <= now - timedelta(days=milestone["days"])`, and `milestone["field"]` is null. For each match: send the email using `milestone["template"]`; then do a guarded `.update()` filtered on `pk`, `status=INVITED`, `{field}__isnull=True`, setting `{field: now}` and — only if `milestone["terminal"]` — also `status=Waitlist.Status.REMOVED` in the same call (single atomic update, so a redemption racing in at the same instant can't be clobbered: the filter still requires `status=INVITED` to match).
4. **Task** (`users/tasks.py`) — `send_waitlist_nudges` thin wrapper around `send_due_nudges()`, following the existing `invite_waitlist_entries` task's shape (log count sent, return it).
5. **Beat schedule** — one entry in `app.conf.beat_schedule` in `progress_rpg/celery.py`, every 2 hours (`schedule: 7200.0`).
6. **Cutoff** — add `waitlist_nudges_enabled_from` to `GameSettings`, backfilled to `timezone.now()` at migration time via a data migration; filtered in the query so entries invited before rollout are never nudged/removed by this mechanism (see Design Decision c).
7. **Templates** — shared nudge template parameterised by `{{ day }}` for the three non-terminal milestones; a distinct removal template for the terminal one.
8. **Tests** — see §6.

## 4. Design decisions

**a. Beat-driven reconciliation vs. per-entry `apply_async(eta=...)` / a separate monthly cron**
- Chosen: one periodic query-and-dispatch task, config-driven by a list of milestones.
- Alternatives: (i) #499's literal per-entry eta tasks with `revoke()` on redemption; (ii) #500's literal separate monthly cron, decoupled from the nudge task.
- Reasoning: (i) is fragile against prod's `allkeys-lru` Redis policy for multi-day-held tasks (see §1). (ii) was seriously considered — see decision (b) below — but rejected once it was clear "monthly cron" already tolerates weeks of drift, making a shared, more-frequent task strictly better (faster detection) at no real cost.

**b. One unified task/schedule for all four milestones vs. two tasks (nudges @ tight interval, monthly-review @ daily/monthly)**
- Chosen: one `NUDGE_SCHEDULE` list, one task, one Beat entry, all four milestones.
- Alternative: split into a fast task for {3,7}-day nudges and a slower task for {30,60}-day review, matching the issue's original framing of "nudges" vs. "monthly review" as conceptually separate.
- Reasoning: the split was the initial recommendation, on the grounds that it keeps concerns from coupling (a bug in the removal branch showing up in the same task/logs as the nudge branch) and stays closer to #500's literal "monthly cron" ask. Once it was agreed that further deviation from #500's literal spec is acceptable (consistent with #499's own deviation), the coupling concern is mitigated by the list-driven design itself — each milestone's query/send/update is fully isolated per loop iteration, so a bug in the terminal branch doesn't affect the others' logic paths. One task is simply less to build and maintain, and the query cost of checking all four milestones every 2 hours is negligible at this table's scale.

**e. 2-hour Beat interval vs. a tighter one (e.g. 30 min)**
- Chosen: 2 hours (`schedule: 7200.0`).
- Alternative: 30 minutes, loosely matching the cadence of the unrelated `reconcile_stale_online_players` entry already in `beat_schedule`.
- Reasoning: the 30-min figure was never load-bearing — it wasn't derived from any actual timing requirement. Given even the tightest milestone (3-day) already tolerates drift on the order of a poll interval, 2 hours (~2.8% of 3 days) is negligible drift, while cutting the task from 48 to 12 runs/day reduces log noise and no-op queries for zero correctness cost — correctness comes entirely from the guarded `.update()`, not the polling frequency. Confirmed acceptable given Django test coverage (§6) exercises the milestone logic directly rather than depending on real wall-clock Beat ticks, so the longer interval doesn't slow down verifying correctness in tests; it only affects how fresh production data can look between runs, which is an accepted trade-off here.

**c. Cutoff via `GameSettings.waitlist_nudges_enabled_from` vs. immediate backfill nudging**
- Chosen: entries invited before rollout are never nudged or auto-removed — only `invited_at >= waitlist_nudges_enabled_from` is eligible, with the field defaulted to rollout time via a data migration.
- Alternative: apply the new milestones immediately to everyone currently `INVITED`, regardless of how long ago they were invited.
- Reasoning: nudge/removal copy implies recency ("you were invited a few days/weeks ago"), which is false and potentially confusing for long-standing invited entries. Without a cutoff, a routine deploy would also auto-remove (not just email) anyone already past 60 days old in one batch — a much bigger unintended side effect than #499 alone had, since #500 adds an actual status mutation. Storing the cutoff on `GameSettings` matches the existing `registration_cap`/admin-editable pattern.

**d. Single "terminal" flag on the schedule entry vs. a separate removal code path**
- Chosen: the 60-day milestone is just another `NUDGE_SCHEDULE` entry, distinguished only by `template` and a `terminal: True` flag that adds `status=REMOVED` to its guarded update.
- Alternative: write `send_due_nudges()` to only handle non-terminal nudges, with a second dedicated function (`process_stale_removals()`) for the 60-day case.
- Reasoning: the removal case differs from the others only in "what email template to use" and "does this also end the entry" — both are cleanly expressed as data on the schedule entry rather than a structurally different code path, keeping the loop body identical for all four milestones.

## 5. Edge cases

- **Resend invite** (`resend_invite_email`) doesn't touch `invited_at`, so milestone timing is unaffected — no change needed there.
- **Admin `invite_selected_now`** goes through `invite_entry`, which sets `invited_at` normally — entries are picked up by the scan automatically.
- **Admin `mark_as_removed` / redemption**: handled for free — both flip `status` away from `INVITED` before the next scan runs, so the query excludes them; no explicit cancellation code needed anywhere, including for the terminal milestone (a manually-removed or redeemed entry simply never reaches the 60-day terminal branch).
- **Overlapping task runs**: guarded by the conditional `.update(..., {field}__isnull=True)` per milestone, so a slow run can't double-send (or double-remove) even if two runs briefly overlap.
- **Race between redemption and the terminal removal update**: the terminal update's `.update()` call filters on `status=INVITED`; if a redemption flips status to `REDEEMED` in between the scan's read and its write, the filtered update simply matches zero rows and no-ops — the entry is correctly left `REDEEMED`, not clobbered to `REMOVED`.
- **Backfill / already-invited entries at migration time**: handled by the `waitlist_nudges_enabled_from` cutoff (Design Decision c) — entries invited before rollout are permanently excluded, so no burst-send-or-remove on first deploy.
- **#500's headroom/redemption acceptance criteria**: already satisfied by existing code with zero changes needed — see §2.
- **Migration**: `Waitlist`'s 4 new fields are purely additive/nullable, no backfill needed. `GameSettings`'s new field needs a one-row data migration to set the cutoff to `timezone.now()`.

## 6. Tests

- `send_due_nudges()` sends the 3-day nudge to an entry with `invited_at` exactly 3+ days ago, `status=INVITED`, `nudge_3day_sent_at=None`, and sets `nudge_3day_sent_at`.
- Same shape, independently, for the 7-day and 30-day milestones (each field tracked separately, no interference between milestones on the same entry).
- `send_due_nudges()` does not send to an entry whose next milestone hasn't arrived yet.
- `send_due_nudges()` does not re-send a milestone whose `sent_at` field is already set.
- `send_due_nudges()` skips entries whose `status` is `REDEEMED` or `REMOVED`, even if past a milestone's age threshold.
- **Terminal milestone**: at 60 days, `send_due_nudges()` sends the removal email, sets `nudge_removal_sent_at`, and flips `status` to `REMOVED`.
- **Terminal race**: an entry redeemed concurrently with the terminal update is left `REDEEMED`, not overwritten to `REMOVED` (simulate via a pre-flipped status before calling the guarded update, or test the filtered `.update()` directly).
- Entries invited before `waitlist_nudges_enabled_from` are excluded from all four milestones.
- `send_waitlist_nudges` task (thin wrapper) delegates to `send_due_nudges()` and returns/logs the count.
- Confirm (regression) that a `REMOVED` entry is excluded from `invite_up_to_headroom()`'s candidate query and that its email can be re-submitted via waitlist join / can't be redeemed via its old invite token — these should already pass against existing code, included here to lock in #500's stated acceptance criteria.

## 7. Risks

- Forgetting the `{field}__isnull=True` + `status=INVITED` guard on the update and instead doing a plain `entry.save()` — reopens the double-send/double-remove race on overlapping runs, and removes the redemption-race protection for the terminal milestone specifically.
- Forgetting the `waitlist_nudges_enabled_from` filter in the query — reintroduces the backfill burst edge case (§5), now with the added severity of auto-removing long-invited entries on first deploy, not just emailing them.
- Forgetting the data migration that backfills `waitlist_nudges_enabled_from` to `timezone.now()` — leaves the cutoff unset, which the query must treat correctly (unset should not mean "nudge/remove everyone").
- Using the wrong template for the terminal milestone (i.e. sending the generic "nudge" copy instead of the "you've been removed" copy) since it now shares a loop with the other three.

## 8. Open questions

- Confirm nudge and removal email copy/subject with product — not specified in either issue.
