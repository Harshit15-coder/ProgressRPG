# Issue #615: Path-aware movement interpolation

## 1. High-level strategy

Replace the naive two-point CSS tween with path-aware client-side interpolation:

- **Backend**: extend `CharacterPointFeatureSerializer` to include each character's active `Journey` (remaining path nodes from `current_index` onward, as coordinates) plus `movement_speed`, reusing the existing `Journey.serialize_for_client()` shape rather than inventing a new one. No new endpoint — this rides the existing `/population-centres/<pk>/map/` response the frontend already polls.
- **Frontend**: replace the CSS `transition: transform` tween with a `requestAnimationFrame` loop that walks each moving character along its actual remaining path segments at `movement_speed` units/sec, re-syncing to the authoritative polled position+path on every poll instead of just tweening between two absolute points. Idle characters (no active journey) keep today's behavior (scattered placement, no walk animation).

This is the same split already proposed in the issue; the only refinement is reusing `Journey`'s existing serialization logic instead of writing a new one, since `JourneySerializer`/`serialize_for_client()` already compute exactly "path + segment_distances + current_index" from `path_nodes`.

## 2. Files likely to change

| File | Exists? | Why |
|---|---|---|
| `locations/serializers.py` | yes | `CharacterPointFeatureSerializer.get_properties` gains `path` (remaining node coords from `current_index`) and `movement_speed`. |
| `locations/views.py` | yes | `PopulationCentreMapView.get` needs to prefetch each character's active journey (avoid N+1) before serializing. |
| `locations/models.py` | yes | Possibly add a small helper on `Journey` (e.g. `remaining_path_nodes()`) if the "from `current_index` onward" slice is more than a one-liner in the serializer — reuse over duplicating `serialize_for_client`'s node-lookup logic. |
| `frontend/src/pages/MapPage/MapPage.tsx` | yes | No change expected — polling stays as-is; the extra `path`/`movement_speed` fields just ride along in the same GeoJSON payload. |
| `frontend/src/components/Map/Map.tsx` | yes | Replace CSS-transition-driven marker positioning with an rAF-driven per-character walker; feed it `path`/`movement_speed` from character properties. |
| `frontend/src/components/Map/Map.module.scss` | yes | Remove (or keep only for idle-character placement changes) the `transition: transform` rule on `.characterMarker`, since position updates become JS-driven (`transform` set imperatively per frame) rather than CSS-animated. |
| `locations/tests.py` | yes | Add/extend tests for the serializer's new `path`/`movement_speed` properties. |
| `frontend/src/components/Map/Map.test.tsx` (if present) | check | Add coverage for the new interpolation behavior if a test file already exists for `Map.tsx`. |

No new models, endpoints, or services — everything reuses `Journey`, `Movable.movement_speed`, and the existing map GeoJSON endpoint.

## 3. Implementation plan

1. **Backend: expose path + speed on character features**
   - In `PopulationCentreMapView.get`, prefetch each resident's active journey (`Prefetch("journeys", queryset=Journey.objects.filter(status="active"), to_attr="active_journey_list")` or similar) alongside the existing `select_related`/`prefetch_related`, so `CharacterPointFeatureSerializer` doesn't issue one query per character.
   - In `CharacterPointFeatureSerializer.get_properties`, add:
     - `movement_speed`: `obj.movement_speed`.
     - `path`: `None` if no active journey; otherwise the list of `[x, y]` coords for nodes from `current_index` onward (character's current position is already the first point via its own `location`, so the path only needs to start at the *next* node the character hasn't reached — avoid duplicating the character's own current point).
   - Reuse `Journey`'s node-lookup pattern (`Node.objects.in_bulk(...)`) rather than re-deriving it; if reused in more than one place, factor it into a small `Journey` method instead of copy-pasting.

2. **Backend tests**
   - Extend `locations/tests.py` (or add to the existing map-view test, if one exists) to assert: idle character → `path` is `None`/absent; character with an active journey → `path` starts from the correct remaining node and `movement_speed` is present.

3. **Frontend: rAF-based path walker**
   - In `Map.tsx`, for each positioned character with a non-null `path` in its properties, maintain per-character animation state (current interpolated `[x, y]`, target path + speed from the latest poll) in a ref (not React state, to avoid re-rendering every frame).
   - Add a `requestAnimationFrame` loop (started once, cleaned up on unmount) that, each frame:
     - For each character currently walking, advances along its stored path by `movement_speed * deltaSeconds`, consuming path segments the same way the backend's `step_toward` does (carry leftover distance across short segments).
     - Writes the resulting `[x, y]` into a small position map that drives the marker's SVG `transform`, imperatively (e.g. via a ref to the `<g>` element, or a lightweight state update batched per animation tick) rather than via CSS transition.
   - On each new poll, resync: replace the stored path/speed with the freshly-polled values and snap-correct only if the drift between the locally-interpolated position and the authoritative polled position exceeds a small threshold (avoids visible "rubber-banding" on every poll while still not drifting unbounded if a tick was missed).
   - Idle characters (no `path`) keep the current instant-placement behavior (`scatterCharacters`), unaffected by the rAF loop.

4. **Frontend: styling**
   - Drop `transition: transform 2s linear` from `.characterMarker` (position is now set every frame by JS, so a CSS transition would fight the rAF updates). Keep `.noTransition`/`suppressTransition` only if still needed for any remaining CSS-animated aspect (likely no longer needed once transform is fully JS-driven — remove if unused).

5. **Frontend tests**
   - If `Map.test.tsx` exists, add cases: a character with a `path` moves smoothly frame-to-frame (mock `requestAnimationFrame`); a character without a `path` still renders at its scattered placement; resync on a new poll doesn't cause a visible jump beyond the drift threshold.

## 4. Design decisions

- **Reuse `Journey.serialize_for_client()` shape instead of a new format.** Alternative: invent a fresh minimal shape (e.g. just `next_node` + `movement_speed`) with less payload. Chosen approach (list of remaining coords) is preferred because it already exists, is tested, and gives the frontend everything needed to walk multi-segment paths in one poll instead of only the next single hop — a minimal "next node only" shape would require re-deriving segments after each node, adding frontend complexity for a marginal payload saving on villages that are already small.
- **Piggyback on the existing map endpoint rather than a separate journeys endpoint.** `JourneyViewSet` already exists (`/journeys/`) but is keyed by journey/character, not by population centre, and the frontend only ever needs "what's on this map right now" — a second request per poll would double API calls for no benefit. Embedding path data in the existing per-character map feature keeps one request per poll, consistent with how `home`/`work`/`hunger_label` are already embedded.
- **rAF loop with authoritative resync vs. pure client-side prediction.** Alternative: trust the client-side walk indefinitely between polls without ever correcting from the server. Rejected because clock drift, missed ticks, or a character re-routing (schedule-driven commute reversal, discussed earlier) would leave the client walking a stale path with no correction. Resyncing (with a small drift threshold to avoid visible snapping) keeps the server as ground truth while still animating smoothly.
- **Imperative transform updates vs. React state per frame.** Running `setState` 60x/sec per character would cause excessive re-renders. Using refs and writing directly to the DOM node's `transform` attribute (or a `requestAnimationFrame`-batched single state update per frame for all characters) avoids this — consistent with how the codebase already avoids unnecessary re-renders elsewhere in `Map.tsx` (e.g. `useMemo` for `positionedCharacters`).

## 5. Edge cases

- **Character has no active journey** (idle, home, at work): `path` must be `None`/omitted; frontend must not attempt to animate these and must fall back to the existing `scatterCharacters` placement untouched.
- **Journey completes mid-poll-interval**: the character arrives and `is_moving` becomes `False` server-side before the next poll; the rAF walker must stop cleanly once it reaches the end of its locally-tracked path rather than waiting for the next poll to notice arrival (otherwise it'll sit mid-path for up to one poll interval).
- **Journey re-routes** (e.g. `commute_tick` reverses a character's destination): the poll after a reroute will show a brand new `path` from a possibly different current position — resync logic must handle "path start point differs from where the client currently has the character" gracefully (snap or fast-glide, not extrapolate the old path).
- **Missed/slow poll** (network hiccup, tab backgrounded): rAF may run the character off the end of its known path before a new poll arrives. Walker should stop at the last known node and hold position rather than extrapolating indefinitely past the data it has.
- **Multiple characters converging/idle at the same building**: unaffected — only characters with an active `path` use the new walker; idle scatter logic is unchanged.
- **`speed_modifier`** (used server-side by `step_toward`, e.g. hunger effects) is not currently exposed — if it affects the *effective* speed a character moves at, the frontend needs the effective speed, not the base `movement_speed`, or animation will drift from the server's true pace. Needs confirming during implementation (see Open Questions).

## 6. Tests

- **New backend tests** (`locations/tests.py`): `CharacterPointFeatureSerializer`/`PopulationCentreMapView` returns `path: None` for idle characters and a correct remaining-node coordinate list + `movement_speed` for characters with an active journey.
- **Existing backend tests to check**: any existing map-view test asserting the exact shape of character feature properties will need updating to account for the new fields.
- **New frontend tests** (if `Map.test.tsx` exists): rAF-driven walking advances position frame-to-frame at the expected rate; idle characters unaffected; resync-on-poll doesn't produce a visible jump within the drift threshold; walker stops cleanly at path end.
- **Manual verification**: since this sandbox can't run the Django test suite or `npm install`/Playwright here (noted limitation from earlier in this work), the person implementing needs to actually run `docker compose run --rm web python manage.py test locations` and the frontend dev server + `/map` page locally before merging, watching a multi-segment journey for smooth, path-following motion at a constant visual speed.

## 7. Risks

- Getting the "remaining path from `current_index`" slice off-by-one (including vs. excluding the character's current position as the first path point) — easy to duplicate the character's own point or skip the first real waypoint.
- Forgetting to prefetch journeys in the map view, reintroducing an N+1 query per character on every 2s poll.
- Frontend rAF loop not being cleaned up on unmount / village switch, leaking timers or animating stale characters after `geojson` changes.
- Drift-correction threshold picked too tight (visible snapping every poll, reintroducing jerkiness) or too loose (client silently diverges from server truth, e.g. character appears to walk through a wall after a reroute).
- If `speed_modifier` does affect real movement speed but isn't exposed, frontend animation speed will visibly mismatch backend pacing over a long journey (see open question below).

## 8. Open questions

- Does anything currently apply a non-1.0 `speed_modifier` to `step_toward` in practice (e.g. hunger-based slowdown)? If so, the map response needs to expose the *effective* speed, not just `movement_speed`, or interpolation will drift from the true server pace over a long journey.
- Is there an existing `Map.test.tsx` / frontend test file for this component? (Could not run `npm install` in this environment to check `frontend/node_modules` or execute tests — implementer should confirm test file location before writing new frontend tests.)
- Any payload-size concern for villages with many concurrently-moving characters, each now carrying a full remaining-path coordinate list every 2s poll? Likely fine at current (small, single-village) scale, but worth a quick gut-check if villages are expected to grow significantly.
