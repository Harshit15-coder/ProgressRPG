# LLM Reference IDs

Machine lookup data for tool calls (GitHub Project IDs, Notion page IDs, etc.). Not maintainer documentation — see `docs/internal/` for that.

> **Staleness warning**: option/field IDs below break silently if the board schema changes. If a `gh project` command referencing these IDs fails or behaves unexpectedly, regenerate this section from `gh project field-list 3 --owner progressrpg` rather than trusting it blindly.

## GitHub Project — Backlog

The main project board is **Backlog** (org `progressrpg`, project number `3`), a holding space for everything not required for the MVP (see the project README for full philosophy — capture non-MVP ideas here, don't act on them immediately).

- **Project ID**: `PVT_kwDOD79Q6c4BVbBV`
- **URL**: https://github.com/orgs/progressrpg/projects/3
- **Owner**: `progressrpg` (organization) — use `--owner progressrpg` with `gh project` commands
- Repo `progressrpg/ProgressRPG` is a separate `gh` context; use `gh project item-add 3 --owner progressrpg --url <issue-url>` to add issues to this board.
- Note: `gh project list --owner progressrpg` only surfaces org-owned projects; there's also a personal-account project set under `--owner gaidheal1` (e.g. "Progress Phase 2", #7) — don't confuse the two when listing/searching projects.

### Fields (field-list output, `gh project field-list 3 --owner progressrpg`)

| Field | ID | Type | Options (id → name) |
|---|---|---|---|
| Title | `PVTF_lADOD79Q6c4BVbBVzhQ27hY` | text | — |
| Assignees | `PVTF_lADOD79Q6c4BVbBVzhQ27hc` | text | — |
| Status | `PVTSSF_lADOD79Q6c4BVbBVzhQ27hg` | single-select | `f75ad846`→Backlog, `e18bf179`→Ready, `47fc9ee4`→In progress, `aba860b9`→Staging review, `98236657`→Done |
| Labels | `PVTF_lADOD79Q6c4BVbBVzhQ27hk` | text | — |
| Linked pull requests | `PVTF_lADOD79Q6c4BVbBVzhQ27ho` | text | — |
| Milestone | `PVTF_lADOD79Q6c4BVbBVzhQ27hs` | text | — |
| Repository | `PVTF_lADOD79Q6c4BVbBVzhQ27hw` | text | — |
| Reviewers | `PVTF_lADOD79Q6c4BVbBVzhQ27h4` | text | — |
| Parent issue | `PVTF_lADOD79Q6c4BVbBVzhQ27h8` | text | — |
| Sub-issues progress | `PVTF_lADOD79Q6c4BVbBVzhQ27iA` | text | — |
| Created | `PVTF_lADOD79Q6c4BVbBVzhQ27iE` | date | — |
| Updated | `PVTF_lADOD79Q6c4BVbBVzhQ27iI` | date | — |
| Closed | `PVTF_lADOD79Q6c4BVbBVzhQ27iM` | date | — |
| Priority | `PVTSSF_lADOD79Q6c4BVbBVzhQ27lk` | single-select | `79628723`→P0, `0a877460`→P1, `da944a9c`→P2 |
| Size | `PVTSSF_lADOD79Q6c4BVbBVzhQ27lo` | single-select | `911790be`→XS, `b277fb01`→S, `86db8eb3`→M, `853c8207`→L, `2d0801e2`→XL |
| Estimate | `PVTF_lADOD79Q6c4BVbBVzhQ27ls` | number | — |
| Iteration | `PVTIF_lADOD79Q6c4BVbBVzhQ27lw` | iteration | — |

To set a single-select field on an item: `gh project item-edit --id <ITEM_ID> --field-id <FIELD_ID> --project-id PVT_kwDOD79Q6c4BVbBV --single-select-option-id <OPTION_ID>`. Get an item's ID via `gh project item-list 3 --owner progressrpg --format json`.

## Notion

_(placeholder — add page IDs here if/when Notion is referenced in workflows)_
