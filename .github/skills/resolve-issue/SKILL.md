---
name: resolve-issue
description: 'Resolve bugs, failures, regressions, and other code issues using a narrow evidence-first fix loop. Use when the task is to inspect a failing behavior, form a local hypothesis, make the smallest safe change, validate it immediately, and report the result.'
argument-hint: 'issue description, failing command, or broken behavior'
user-invocable: true
disable-model-invocation: false
---

# Resolve Issue

## When to Use
- Fix a bug, regression, crash, test failure, or incorrect behavior.
- Investigate a problem in the codebase and turn it into a concrete repair.
- Use when the request is about making something work, not writing a proposal or filing a ticket.

## Workflow
1. Anchor on the clearest failure.
   - Start from the reported symptom, failing test, error message, or user-visible breakage.
   - Prefer the owning file, nearby call site, or a matching test over broad exploration.

2. Gather only the minimum local evidence.
   - Read the code path that directly controls the behavior.
   - Check the nearest test, log, or call site that could confirm or disprove the suspected cause.
   - Keep the search narrow until one falsifiable hypothesis is available.

3. Form one local hypothesis.
   - State the most likely reason the issue exists.
   - Identify the cheapest check that could prove the hypothesis wrong.
   - If the issue is underspecified, ask for the expected behavior, repro steps, or affected scope before editing.

4. Make the smallest meaningful fix.
   - Change the code that actually decides the behavior.
   - Prefer a reversible, targeted edit over a broad refactor.
   - Preserve existing conventions and avoid unrelated cleanup.

5. Validate immediately.
   - Run the narrowest relevant test, command, or typecheck.
   - If the first check fails, repair the same slice and rerun the same check before widening scope.
   - If the hypothesis is wrong, move one step closer to the real control point and repeat.

6. Finish with a clear outcome.
   - Summarize what was broken, what changed, and how it was verified.
   - Note any remaining risks, follow-up work, or unverified behavior.

## Issue Resolution Template

```markdown
## Symptom

What is broken or failing.

## Hypothesis

What appears to be causing the issue and why.

## Fix

What changed in the code.

## Validation

- command or test run
- observed result

## Notes

Risks, follow-ups, or anything still unverified.
```

## Completion Checks
- The issue is resolved at the actual control point, not just masked.
- The fix was validated with the narrowest useful check.
- The final summary explains the change and any remaining caveats.