---
name: create-pr
description: 'Create well-scoped GitHub pull requests from completed work. Use when preparing a branch for review, summarizing changes, writing the PR title/body, listing tests, or deciding whether the work is ready to merge.'
argument-hint: 'branch or change summary'
user-invocable: true
disable-model-invocation: false
---

# Create Pull Request

## When to Use
- Turn completed work into a clear GitHub pull request.
- Summarize the change, the reason for it, and how to verify it.
- Use when the code is ready for review or close to ready and needs a reviewable package.

## Workflow
1. Identify the pull request shape.
   - Feature: new behavior or capability.
   - Fix: bug repair or regression fix.
   - Refactor: internal cleanup without intended behavior change.
   - Docs: documentation, examples, or wording updates.

2. Gather the minimum useful facts.
   - What changed.
   - Why it changed.
   - Which branch contains the work.
   - Whether the change is draft-only or review-ready.
   - What tests or checks were run.
   - Any risks, follow-ups, or known gaps.

3. Turn the work into a reviewable PR.
   - Write a specific title that matches the user-visible outcome.
   - Summarize the change in one short paragraph.
   - Call out the main implementation points.
   - List verification steps and commands.
   - Note any behavior changes, migration needs, or follow-up work.

4. Choose metadata deliberately.
   - Target the correct base branch.
   - Mark the PR as draft if the work is incomplete.
   - Add labels only when they help triage or release tracking.
   - Link the related issue, task, or bug if one exists.

5. Check before publishing.
   - The title should tell a reviewer what to expect.
   - The body should explain both the change and the verification.
   - The PR should make review easy without requiring extra context.
   - The PR should not promise tests or behavior that were not actually checked.

## PR Draft Template

```markdown
## Summary

What changed and why.

## What Changed

- Main change one
- Main change two
- Main change three

## Verification

- `command or test`
- `command or test`

## Notes

Add risks, follow-ups, rollout notes, or related links here.
```

## Completion Checks
- The PR title is specific and search-friendly.
- The PR body explains the change in plain language.
- The verification section lists what was actually run.
- The PR is ready to open, or it is clearly marked draft if not.
