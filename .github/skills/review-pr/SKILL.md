---
name: review-pr
description: 'Review pull requests for bugs, regressions, missing tests, unclear behavior, and maintainability risks. Use when the task is to inspect a branch or diff, prioritize findings by severity, and report concrete review comments.'
argument-hint: 'pull request, branch, or diff to review'
user-invocable: true
disable-model-invocation: false
---

# Review Pull Request

## When to Use
- Review a pull request, branch, or change set before merge.
- Find correctness issues, regressions, test gaps, and risky behavior changes.
- Use when the user wants a code review, not implementation or a summary only.

## Workflow
1. Anchor on the change under review.
   - Identify the PR, branch, or diff scope.
   - Read the changed files first, then step into nearby code only when needed to verify behavior.
   - Prefer the owning code path, tests, and call sites over broad repository exploration.

2. Build a local review hypothesis.
   - Ask what could break, what assumptions changed, and what behavior is now newly possible.
   - Check the cheapest nearby evidence that could disprove the concern.
   - Keep the review narrow until the issue is either confirmed or ruled out.

3. Review for concrete risk categories.
   - Correctness: logic errors, missing branches, invalid edge cases.
   - Regression risk: behavior changes, compatibility breaks, hidden side effects.
   - Test coverage: missing or weak tests for the changed path.
   - Maintainability: unclear naming, duplicated logic, fragile structure, unnecessary complexity.
   - Security or data integrity: trust boundaries, unsafe parsing, persistence issues, accidental exposure.

4. Triage findings by severity.
   - Start with issues that can break behavior, lose data, or block users.
   - Follow with medium-risk issues that are likely to cause maintenance or edge-case problems.
   - Keep cosmetic comments separate unless they materially affect readability or correctness.

5. Write review output in findings-first order.
   - Lead with the most important findings.
   - Reference exact files and lines when possible.
   - Explain why the issue matters and what scenario triggers it.
   - State open questions only when they are needed to judge the change.
   - If no issues are found, say that explicitly and mention any residual risks or untested areas.

## Review Checklist
- The change does what it claims without breaking existing behavior.
- Edge cases and empty states are handled deliberately.
- Tests cover the new or altered behavior.
- Error handling is appropriate for the code path.
- Data flow, permissions, and persistence remain safe.
- The change is not larger or more coupled than necessary.

## Output Format

```markdown
## Findings

1. Severity: short summary
   - File: path/to/file.ts:line
   - Why it matters: explanation of the risk or bug.

## Open Questions

- Any points that need clarification before approval.

## Summary

Brief statement of overall review outcome.
```

## Completion Checks
- The review names the most important issues first.
- Each finding is tied to a concrete code location or behavior.
- The review distinguishes true bugs from style preferences.
- The final response makes approval, caution, or rejection clear.