# Auth/Session Architecture Cleanup — Implementation Plan

Scope: the three architecture-level findings from the auth/session cluster review that were deliberately deferred out of the prior cleanup pass (commit-level dedup already done in `AuthContext.tsx`, `authStorage.ts`, `api.ts`):

1. Token storage model (two `Storage` objects + a mode marker, reconciled ad hoc on every read)
2. Cross-module auth-expiry signaling (`api.ts` → `window` `CustomEvent` → `AuthContext.tsx`)
3. `apiFetch` hardcoding navigation side effects (401/503/network) instead of throwing typed errors

These are related: (2) and (3) both stem from `api.ts` being a plain module with no direct line into React state, and (1) is what (2)/(3)'s callers (`getStoredAuthTokens`, `updateStoredAccessToken`, `clearAuthStorage`) are built on top of.

---

## 1. High-level strategy

Do these as **three separate, independently-shippable changes**, not one big rewrite, in this order:

1. **Storage model** — replace the two-`Storage`-plus-marker scheme in `authStorage.ts` with one atomic session descriptor (`{accessToken, refreshToken, persistence}`) written/read as a single JSON blob under one key, chosen per-tab (`localStorage` vs `sessionStorage`) the same way as today. This is the lowest-risk change (pure data-layer, well covered by existing tests) and simplifies the ground the other two changes sit on.
2. **Typed fetch errors** — give `apiFetch` a small set of typed errors (`UnauthorizedError`, `ServiceUnavailableError`, `NetworkError`) instead of inline `window.location.href` assignments, and move the three navigation decisions to one place.
3. **Explicit auth-expiry callback** — replace the `window.dispatchEvent(new CustomEvent("auth:expired"))` / `window.addEventListener` pair with a plain registration function (`setUnauthorizedHandler(fn)`) that `AuthProvider` calls once on mount, matching the existing app-init pattern rather than inventing a second one.

(2) and (3) are sequenced together because the typed-error change is what lets the 401 case stop hardcoding `clearAuthAndRedirect()` directly — it becomes "throw `UnauthorizedError`", and the *handler* for that error (registered once) does the same work `logout()` already does.

---

## 2. Files likely to change

| File | Change | Exists? |
|---|---|---|
| `frontend/src/utils/authStorage.ts` | Replace dual-storage+marker with single descriptor read/write | yes |
| `frontend/src/utils/authStorage.test.ts` | Update to assert on the new single-key shape; existing behavioral assertions (remember-me vs session, no-clobber-across-tabs) should still pass conceptually | yes |
| `frontend/src/utils/api.ts` | Add typed error classes; `apiFetch` throws instead of redirecting; register/invoke the auth-expiry callback instead of a `CustomEvent` | yes |
| `frontend/src/utils/api.test.ts` | Update the `"auth:expired"` listener-based test to use the new registration API | yes |
| `frontend/src/context/AuthContext.tsx` | Register the unauthorized-handler on mount (replacing the `window.addEventListener` effect); `verifyUser`'s catch discriminates on error type | yes |
| `frontend/src/context/MaintenanceContext.tsx` / `frontend/src/components/MaintenanceWatcher.tsx` | Investigate whether `ServiceUnavailableError` should feed into the *existing* WebSocket-driven maintenance state instead of a fresh `window.location.href` — see Design Decisions | yes (no change expected, just a decision point) |
| New: `frontend/src/utils/apiErrors.ts` (or inline in `api.ts`) | Typed error classes | new, small — inline in `api.ts` is also fine given its current size |

No new services, contexts, or endpoints are needed — the existing `AuthContext`/`MaintenanceContext` split already covers the two "something ended my session" cases; this plan makes `api.ts` talk to them explicitly instead of through the DOM.

---

## 3. Implementation plan

### Step 1 — Storage model (`authStorage.ts`)
- Replace `ACCESS_TOKEN_KEY`/`REFRESH_TOKEN_KEY`/`SESSION_MODE_KEY` (3 keys, 2 storages) with one `AUTH_SESSION_KEY` holding `JSON.stringify({ accessToken, refreshToken, persistence: 'local' | 'session' })`.
- `persistence` replaces the separate `SESSION_MODE_KEY` marker — it's now part of the same atomic value, so there's no way for "marker present, tokens missing" to occur.
- Which `Storage` object holds the *current tab's* descriptor is still decided by `persistence` — but the multi-tab fallback behavior (a `sessionStorage`-scoped tab still reading a `localStorage`-remembered session) must be preserved: `getStoredAuthTokens()` reads sessionStorage's descriptor first, then localStorage's, exactly as today, just deserializing one blob per storage instead of assembling one from two keys.
- `storeAuthTokens`/`updateStoredAccessToken`/`clearAuthStorage` become read-descriptor → mutate field → write-descriptor, single call each.
- Ship this alone first — it's invisible to every other file (same exported function signatures), so it's a safe, self-contained PR.

### Step 2 — Typed errors from `apiFetch` (`api.ts`)
- Add three error classes (or one `ApiFetchError` with a `kind` discriminant — see Design Decisions).
- `apiFetch`:
  - 401 → throw `UnauthorizedError` (no more inline `clearAuthAndRedirect()` call inside `apiFetch` itself).
  - 503 → throw `ServiceUnavailableError` (no more inline `window.location.href = "/maintenance"`).
  - `TypeError` (network failure) → throw `NetworkError` (no more inline `window.location.href = "/unavailable"`).
- Introduce one registration point for "what happens on `UnauthorizedError`" — see Step 3. For `ServiceUnavailableError`/`NetworkError`, decide (Design Decisions) whether `apiFetch` still performs the redirect itself (simplest, least behavior change) or whether those also go through a registered handler.

### Step 3 — Explicit auth-expiry callback
- `api.ts` exports `setUnauthorizedHandler(fn: () => void)`; `apiFetch`'s `UnauthorizedError` path calls the currently-registered handler (a no-op if none registered, e.g. before `AuthProvider` mounts).
- `AuthContext.tsx`'s `AuthProvider` calls `setUnauthorizedHandler(logout)` once on mount (replacing the `window.addEventListener("auth:expired", ...)` effect) and clears it on unmount (`setUnauthorizedHandler(null)` or a no-op) — the provider is mounted once for the app's lifetime, same as today's listener effect.
- `verifyUser`'s catch block can now discriminate: `UnauthorizedError` → the registered handler already ran `logout()`, so nothing more to do (or explicitly call `logout()` if we decide *not* to double up via the handler); anything else (network blip) → leave state alone / surface a retry instead of always logging out. This directly resolves altitude finding #10 from the review.

---

## 4. Design decisions

**A. One session descriptor vs. keeping two storages "reconciled at read time."**
- Chosen: single JSON descriptor per storage, atomic read/write.
- Alternative: keep the current two-storage-plus-marker shape but centralize the fallback logic in one helper (smaller diff).
- Reasoning: the marker-plus-fallback shape is what the altitude review flagged as the root cause — it can't drift once there's one value instead of three. The alternative only hides the duplication, it doesn't remove the drift risk.

**B. Typed error classes vs. a single error with a `kind`/`code` field.**
- Chosen: leaning toward one `ApiFetchError extends Error` with a `kind: "unauthorized" | "service_unavailable" | "network"` field, rather than three subclasses.
- Alternative: three subclasses (`UnauthorizedError`, etc.) and `instanceof` checks.
- Reasoning: this codebase doesn't use custom error class hierarchies elsewhere (checked `frontend/src/utils`, `frontend/src/hooks` — errors are plain `Error` throughout); a single class with a discriminant field is more consistent with existing conventions and avoids `instanceof` across module boundaries (which can misbehave with some bundler/HMR setups). Final call is open — see Open Questions.

**C. Where do 503/network navigation decisions live after typed errors land?**
- Chosen (tentative): `apiFetch` still performs the `window.location.href` redirect for `ServiceUnavailableError`/`NetworkError` internally — only the 401/`UnauthorizedError` path moves to the registered-callback pattern.
- Alternative: move all three to registered handlers, or (bigger alternative) have `ServiceUnavailableError` feed the *existing* `MaintenanceContext`/`MaintenanceWatcher` state instead of a hard page navigation, since that WebSocket-driven mechanism already exists and presumably gives a better UX (in-app banner vs. full reload) — worth checking with whoever owns that flow before assuming REST-triggered 503 should behave identically to the WS-driven path.
- Reasoning: 401 is the one case with real duplication today (two different "log out" implementations partially converging via a DOM event) and a real React consumer (`AuthContext`) waiting to own it. 503/network don't have an equivalent React owner already reacting to them via `apiFetch` specifically — touching those is a UX decision, not just a cleanup, so it's flagged as an open question rather than decided here.

---

## 5. Edge cases

- **Migrating existing sessions**: users with tokens already stored under the old 3-key shape will hit the new code expecting the single-descriptor key on their next load. Need either (a) a one-time read-old-keys-if-new-key-absent fallback in `getStoredAuthTokens`, or (b) accept that existing sessions log out once after deploy (tokens are short-lived and this is a refresh-triggering event anyway, so probably acceptable — confirm with the team).
- **Registration timing**: if any code calls `apiFetch` before `AuthProvider` mounts (unlikely given `AuthProvider` wraps the app root, but check `AppContent.tsx`/`App.tsx` mount order), `setUnauthorizedHandler` must default to a safe no-op, not throw.
- **Multiple `AuthProvider` instances** (e.g. in tests that mount several providers): the module-level handler registration is global, so the *last* mounted provider "wins." Existing tests mock `authStorage`/`api` per-file already, so this is likely fine, but worth an explicit test for provider unmount clearing its own handler.
- **`clearAuthStorage()` double-call**: today `clearAuthAndRedirect` and `logout()` both call it. Once 401 flows entirely through the registered `logout` handler, confirm `clearAuthAndRedirect` (or its typed-error replacement) doesn't still call `clearAuthStorage()` itself — that duplication should disappear as a side effect of this change, not persist alongside it.
- **Backwards compatibility of exported functions**: `getStoredAuthTokens`, `storeAuthTokens`, `updateStoredAccessToken`, `clearAuthStorage`, `getStoredAccessToken` are called from `api.ts` and `AuthContext.tsx` only (confirmed) — their signatures should stay identical so Step 1 has zero blast radius outside `authStorage.ts` + its test.

---

## 6. Tests

- **`authStorage.test.ts`**: existing tests (remember-me → localStorage, session → sessionStorage, no-clobber across tabs, update-in-active-storage, clear-without-clobbering) all describe *behavior*, not the storage shape — they should be portable to the new descriptor format with the same assertions (reading via `localStorage.getItem`/`sessionStorage.getItem` on the new single key and `JSON.parse`-ing, instead of reading two separate keys). No new scenarios needed unless the migration fallback (Edge Cases) is implemented, which would need its own "reads an old-shape session on first load" test.
- **`api.test.ts`**: replace the `window.addEventListener("auth:expired", ...)` assertion with one that registers a handler via `setUnauthorizedHandler` and asserts it's called on a 401/failed-refresh. Add a test that two concurrent `apiFetch` 401s only trigger the handler once each (not compounding) if that's a realistic path.
- **New**: a test that `AuthProvider` registers and unregisters its handler on mount/unmount (guards against the "last provider wins" edge case above).
- **`PrivateRoute`, `LoginPage`**: no expected behavior change; existing tests should keep passing unmodified — worth a regression run, not new tests.

---

## 7. Risks

- **Silent behavior drift in the 401 path**: the current `verifyUser` catch calls `logout()` unconditionally; once it discriminates by error kind, it's easy to accidentally leave a real "token invalid" case unhandled if the discriminant check is inverted or the typed error isn't thrown consistently from every code path that used to redirect on 401.
- **Losing the "which tab" fallback semantics** during the storage-descriptor migration — the two-storage fallback exists specifically to fix a prior cross-tab clobbering bug (see `28e92f4` in history); a careless single-descriptor implementation could silently reintroduce it if the "check sessionStorage first, then localStorage" order isn't preserved exactly.
- **Forgetting a call site** that still expects `window.location.href` side effects from `apiFetch` itself (e.g. a component that never actually catches the promise rejection because it currently relies on `apiFetch` navigating away for it) — moving navigation out of `apiFetch` means those call sites now see a rejected promise they didn't handle before. Needs a grep of all `apiFetch`/wrapper-function call sites for bare `.catch(() => {})` or unhandled promises before Step 2 ships.
- **Scope creep into `MaintenanceContext`**: Design Decision C flags a possible deeper integration with the existing WebSocket-driven maintenance flow — it would be easy to let Step 2 balloon into "also rebuild how maintenance mode works," which is out of scope for this plan.

---

## 8. Open questions

1. Single `ApiFetchError` with a `kind` field, or three distinct classes — final call before Step 2 starts (Design Decision B).
2. Should `ServiceUnavailableError`/`NetworkError` also route through a registered handler (for consistency with the 401 case), or is direct `window.location.href` acceptable to leave as-is for those two (Design Decision C)?
3. Is a silent one-time logout acceptable for existing sessions across the storage-format migration, or is a read-compatibility shim required (Edge Cases)?
4. Should the 503 path be merged into the existing `MaintenanceContext`/`MaintenanceWatcher` WebSocket-driven flow instead of keeping a separate REST-triggered hard navigation? This looks like the "right" fix architecturally but changes UX and is bigger than a pure refactor — needs a product/UX decision, not just an engineering one.
