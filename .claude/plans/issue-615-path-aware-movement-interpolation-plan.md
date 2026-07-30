# Issue #615: Path-aware movement interpolation

## 1. High-level strategy

Replace the naive two-point CSS tween with path-aware client-side interpolation:

- **Backend**: extend `CharacterPointFeatureSerializer` to include each character's active `Journey` (remaining path nodes from `current_index` onward, as coordinates) plus an `effective_speed` (`movement_speed * speed_modifier`), reusing the existing `Journey.serialize_for_client()` shape rather than inventing a new one. No new endpoint — this rides the existing `/population-centres/<pk>/map/` response the frontend already polls.
- **Frontend**: replace the CSS `transition: transform` tween with a `requestAnimationFrame` loop that walks each moving character along its actual remaining path segments at `effective_speed` units/sec, re-syncing to the authoritative polled position+path on every poll instead of just tweening between two absolute points. Idle characters (no active journey) keep today's behavior (scattered placement, no walk animation).

This is the same split already proposed in the issue; the only refinement is reusing `Journey`'s existing serialization logic instead of writing a new one, since `JourneySerializer`/`serialize_for_client()` already compute exactly "path + segment_distances + current_index" from `path_nodes`.

## 2. Files likely to change

| File | Exists? | Why |
|---|---|---|
| `locations/serializers.py` | yes | `CharacterPointFeatureSerializer.get_properties` gains `path` (remaining node coords from `current_index`) and `effective_speed`. |
| `locations/views.py` | yes | `PopulationCentreMapView.get` needs to prefetch each character's active journey (avoid N+1) before serializing. |
| `locations/models.py` | yes | Possibly add a small helper on `Journey` (e.g. `remaining_path_nodes()`) if the "from `current_index` onward" slice is more than a one-liner in the serializer — reuse over duplicating `serialize_for_client`'s node-lookup logic. |
| `frontend/src/pages/MapPage/MapPage.tsx` | yes | No change expected — polling stays as-is; the extra `path`/`movement_speed` fields just ride along in the same GeoJSON payload. |
| `frontend/src/components/Map/Map.tsx` | yes | Replace CSS-transition-driven marker positioning with an rAF-driven per-character walker; feed it `path`/`movement_speed` from character properties. |
| `frontend/src/components/Map/Map.module.scss` | yes | Remove (or keep only for idle-character placement changes) the `transition: transform` rule on `.characterMarker`, since position updates become JS-driven (`transform` set imperatively per frame) rather than CSS-animated. |
| `locations/tests.py` | yes | Add/extend tests for the serializer's new `path`/`effective_speed` properties. |
| `frontend/src/components/Map/Map.test.tsx` | yes | Add coverage for the new interpolation behavior. |

No new models, endpoints, or services — everything reuses `Journey`, `Movable.movement_speed`, and the existing map GeoJSON endpoint.

## 3. Implementation plan

1. **Backend: expose path + speed on character features**
   - In `PopulationCentreMapView.get`, prefetch each resident's active journey (`Prefetch("journeys", queryset=Journey.objects.filter(status="active"), to_attr="active_journey_list")` or similar) alongside the existing `select_related`/`prefetch_related`, so `CharacterPointFeatureSerializer` doesn't issue one query per character.
   - In `CharacterPointFeatureSerializer.get_properties`, add:
     - `effective_speed`: `obj.movement_speed * speed_modifier` — currently always equal to `movement_speed` (`move_characters_tick` calls `step_toward(time_delta)` with the default `speed_modifier=1.0`; nothing in the codebase passes a non-default value today), but named/computed this way so it stays correct if a modifier (hunger, buffs, etc.) is wired up later without another round of frontend/backend changes.
     - `path`: `None` if no active journey; otherwise the list of `[x, y]` coords for the next `JOURNEY_PATH_PREVIEW_LIMIT` nodes from `current_index` onward (character's current position is already the first point via its own `location`, so the path only needs to start at the *next* node the character hasn't reached — avoid duplicating the character's own current point). Capped rather than the full remaining route — see payload-size design decision below — and simply re-extended on the following poll as the character advances.
   - Reuse `Journey`'s node-lookup pattern (`Node.objects.in_bulk(...)`) rather than re-deriving it; if reused in more than one place, factor it into a small `Journey` method instead of copy-pasting (the capped-slice logic is a good candidate for a `Journey.remaining_path_nodes(limit=...)` helper, shared between this serializer and any future use).

2. **Backend tests**
   - Extend `locations/tests.py` (or add to the existing map-view test, if one exists) to assert: idle character → `path` is `None`/absent; character with an active journey → `path` starts from the correct remaining node and `effective_speed` is present.

3. **Frontend: rAF-based path walker**
   - In `Map.tsx`, for each positioned character with a non-null `path` in its properties, maintain per-character animation state (current interpolated `[x, y]`, target path + speed from the latest poll) in a ref (not React state, to avoid re-rendering every frame).
   - Add a `requestAnimationFrame` loop (started once, cleaned up on unmount) that, each frame:
     - For each character currently walking, advances along its stored path by `effective_speed * deltaSeconds`, consuming path segments the same way the backend's `step_toward` does (carry leftover distance across short segments).
     - Writes the resulting `[x, y]` into a small position map that drives the marker's SVG `transform`, imperatively (e.g. via a ref to the `<g>` element, or a lightweight state update batched per animation tick) rather than via CSS transition.
   - On each new poll, resync: replace the stored path/speed with the freshly-polled values and snap-correct only if the drift between the locally-interpolated position and the authoritative polled position exceeds a small threshold (avoids visible "rubber-banding" on every poll while still not drifting unbounded if a tick was missed).
   - Idle characters (no `path`) keep the current instant-placement behavior (`scatterCharacters`), unaffected by the rAF loop.

4. **Frontend: styling**
   - Drop `transition: transform 2s linear` from `.characterMarker` (position is now set every frame by JS, so a CSS transition would fight the rAF updates). Keep `.noTransition`/`suppressTransition` only if still needed for any remaining CSS-animated aspect (likely no longer needed once transform is fully JS-driven — remove if unused).

5. **Frontend tests**
   - In `Map.test.tsx`, add cases: a character with a `path` moves smoothly frame-to-frame (mock `requestAnimationFrame`); a character without a `path` still renders at its scattered placement; resync on a new poll doesn't cause a visible jump beyond the drift threshold.

## 4. Design decisions

- **Reuse `Journey.serialize_for_client()` shape instead of a new format.** Alternative: invent a fresh minimal shape (e.g. just `next_node` + `movement_speed`) with less payload. Chosen approach (list of remaining coords) is preferred because it already exists, is tested, and gives the frontend everything needed to walk multi-segment paths in one poll instead of only the next single hop — a minimal "next node only" shape would require re-deriving segments after each node, adding frontend complexity for a marginal payload saving on villages that are already small.
- **Piggyback on the existing map endpoint rather than a separate journeys endpoint.** `JourneyViewSet` already exists (`/journeys/`) but is keyed by journey/character, not by population centre, and the frontend only ever needs "what's on this map right now" — a second request per poll would double API calls for no benefit. Embedding path data in the existing per-character map feature keeps one request per poll, consistent with how `home`/`work`/`hunger_label` are already embedded.
- **rAF loop with authoritative resync vs. pure client-side prediction.** Alternative: trust the client-side walk indefinitely between polls without ever correcting from the server. Rejected because clock drift, missed ticks, or a character re-routing (schedule-driven commute reversal, discussed earlier) would leave the client walking a stale path with no correction. Resyncing (with a small drift threshold to avoid visible snapping) keeps the server as ground truth while still animating smoothly.
- **Imperative transform updates vs. React state per frame.** Running `setState` 60x/sec per character would cause excessive re-renders. Using refs and writing directly to the DOM node's `transform` attribute (or a `requestAnimationFrame`-batched single state update per frame for all characters) avoids this — consistent with how the codebase already avoids unnecessary re-renders elsewhere in `Map.tsx` (e.g. `useMemo` for `positionedCharacters`).
- **Payload size as villages/characters scale.** The map endpoint is currently scoped per population centre, but that scoping is a temporary simplification — the map is expected to eventually show ~10 surrounding villages at once (fog-of-war style reveal), so "only one village's residents per response" can't be relied on as the long-term size bound. What *does* still hold regardless of how many villages a future multi-village endpoint covers: only characters with an active `path` (`is_moving=True`) carry the extra coordinate list at all (idle/majority of residents cost nothing extra), and each one's `path` is capped to the next `JOURNEY_PATH_PREVIEW_LIMIT` (e.g. 10) remaining nodes rather than the full remaining route — plenty for the rAF walker to bridge one poll interval, re-extended automatically on the next poll. This cap is added now, in this issue, precisely because it's cheap today and removes the dependency on the single-village assumption the user's flagged as temporary, rather than leaving it as deferred follow-up work.

## 5. Edge cases

- **Character has no active journey** (idle, home, at work): `path` must be `None`/omitted; frontend must not attempt to animate these and must fall back to the existing `scatterCharacters` placement untouched.
- **Journey completes mid-poll-interval**: the character arrives and `is_moving` becomes `False` server-side before the next poll; the rAF walker must stop cleanly once it reaches the end of its locally-tracked path rather than waiting for the next poll to notice arrival (otherwise it'll sit mid-path for up to one poll interval).
- **Journey re-routes** (e.g. `commute_tick` reverses a character's destination): the poll after a reroute will show a brand new `path` from a possibly different current position — resync logic must handle "path start point differs from where the client currently has the character" gracefully (snap or fast-glide, not extrapolate the old path).
- **Missed/slow poll** (network hiccup, tab backgrounded): rAF may run the character off the end of its known path before a new poll arrives. Walker should stop at the last known node and hold position rather than extrapolating indefinitely past the data it has. This is more likely now that `path` is capped to `JOURNEY_PATH_PREVIEW_LIMIT` nodes rather than the full route — the cap must comfortably cover the distance a character can travel in one poll interval (2s at typical `effective_speed`) plus margin, or the walker will legitimately run out of path before every single poll under normal conditions, not just on a missed one.
- **Multiple characters converging/idle at the same building**: unaffected — only characters with an active `path` use the new walker; idle scatter logic is unchanged.
- **`speed_modifier`**: confirmed no current caller of `step_toward` passes a non-default value (`move_characters_tick` always calls it with `speed_modifier=1.0`), so `effective_speed` equals `movement_speed` today — exposing `effective_speed` rather than raw `movement_speed` is just future-proofing, not fixing an active drift.

## 6. Tests

- **New backend tests** (`locations/tests.py`): `CharacterPointFeatureSerializer`/`PopulationCentreMapView` returns `path: None` for idle characters and a correct remaining-node coordinate list + `effective_speed` for characters with an active journey; a journey longer than `JOURNEY_PATH_PREVIEW_LIMIT` nodes is truncated to the cap rather than serializing the full route.
- **Existing backend tests to check**: any existing map-view test asserting the exact shape of character feature properties will need updating to account for the new fields.
- **New frontend tests** (`Map.test.tsx`): rAF-driven walking advances position frame-to-frame at the expected rate; idle characters unaffected; resync-on-poll doesn't produce a visible jump within the drift threshold; walker stops cleanly at path end.
- **Manual verification**: since this sandbox can't run the Django test suite or `npm install`/Playwright here (noted limitation from earlier in this work), the person implementing needs to actually run `docker compose run --rm web python manage.py test locations` and the frontend dev server + `/map` page locally before merging, watching a multi-segment journey for smooth, path-following motion at a constant visual speed.

## 7. Risks

- Getting the "remaining path from `current_index`" slice off-by-one (including vs. excluding the character's current position as the first path point) — easy to duplicate the character's own point or skip the first real waypoint.
- Forgetting to prefetch journeys in the map view, reintroducing an N+1 query per character on every 2s poll.
- Frontend rAF loop not being cleaned up on unmount / village switch, leaking timers or animating stale characters after `geojson` changes.
- Drift-correction threshold picked too tight (visible snapping every poll, reintroducing jerkiness) or too loose (client silently diverges from server truth, e.g. character appears to walk through a wall after a reroute).
- `JOURNEY_PATH_PREVIEW_LIMIT` set too low relative to poll interval and typical `effective_speed`/node spacing, causing the walker to legitimately exhaust its path before the next poll under normal conditions (not just on a missed poll) — reintroducing a stop-and-wait stutter this issue is meant to fix.

## 8. Open questions

None outstanding — `effective_speed` naming/computation, the existing `Map.test.tsx` test file, and the payload-size concern (mitigated by per-village endpoint scoping + only-moving-characters-carry-a-path) are resolved above.
