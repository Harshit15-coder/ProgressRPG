# Planning Template

Your task is to produce an implementation plan only.

Do **not** implement any code.

The goal is to understand the existing architecture, identify the simplest solution that fits it, and produce a plan suitable for implementation in a series of small commits.

---

# Before planning

First inspect all tagged files to understand:

- existing architecture
- existing patterns
- existing services
- existing models
- existing tests
- coding conventions

Prefer extending existing code over introducing new abstractions.

Do not recommend architectural changes unless there is a clear benefit.

---

# Planning principles

Optimise for:

- simplicity
- reuse
- maintainability
- consistency with the existing codebase
- small reviewable commits

Avoid unnecessary abstraction.

Avoid creating new services, endpoints, models or helper classes if existing ones can reasonably be extended.

Assume the existing architecture is preferred unless there is a compelling reason otherwise.

---

# Think before deciding

For each major design decision:

- explain the chosen approach
- briefly mention at least one alternative
- explain why the chosen approach is preferable

Avoid presenting the first solution as though it is obviously correct.

---

# Challenge your own design

Review the proposed solution as if you were the lead reviewer.

Look specifically for:

- unnecessary complexity
- hidden assumptions
- race conditions
- duplication
- architectural drift
- opportunities to reuse existing code

Simplify wherever possible.

---

# Consider concurrency

Where applicable, consider:

- duplicate requests
- concurrent workers
- transactions
- idempotency
- locking
- partial failures

Only introduce concurrency controls where they are genuinely needed.

Explain why they are necessary.

---

# Required output

Produce:

## 1. High-level strategy

A short explanation of the overall approach.

---

## 2. Files likely to change

For each file:

- why it changes
- whether it already exists
- whether a new file is required

---

## 3. Implementation plan

Describe the implementation in logical steps.

Prefer incremental changes suitable for small pull requests.

---

## 4. Design decisions

For each important decision:

- chosen approach
- alternatives considered
- reasoning

---

## 5. Edge cases

Identify:

- validation
- error cases
- concurrency issues
- data integrity concerns
- migration concerns
- backwards compatibility

---

## 6. Tests

Describe:

- new tests
- existing tests to modify
- important scenarios to cover

Do not write the tests.

---

## 7. Risks

Identify the most likely implementation mistakes another engineer could make.

---

## 8. Open questions

List anything that should be clarified before implementation.

---

# Keep plans concise

Do **not** include:

- full code examples
- long pseudocode
- implementation-level method bodies
- detailed serializers/views/models
- extensive API examples

Small snippets are acceptable only when they clarify a design decision.

The purpose of the plan is to explain **what** should be built and **why**, not exactly **how** every line should be be written.

---

# Token efficiency

To minimise context usage:

- avoid reproducing existing code
- avoid long code blocks
- avoid listing every field of existing models
- avoid describing existing functionality unless directly relevant
- prefer bullet points over prose
- keep explanations concise
- avoid repeating the issue description

Assume the implementation phase will inspect the code again.

---

# Final review

Before finishing, ask yourself:

- Is this the simplest solution?
- Am I reusing existing architecture wherever possible?
- Have I added anything not required by the acceptance criteria?
- Could this plan be implemented incrementally?
- Would another engineer understand the reasoning behind the decisions?

Revise the plan if the answer to any of these is "no".
