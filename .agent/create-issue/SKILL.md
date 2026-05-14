---
name: create-issue
description: 'Create well-scoped GitHub issues. Use when drafting bug reports, feature requests, tasks, or docs work with clear title, context, acceptance criteria, and metadata.'
argument-hint: 'issue goal or rough description'
user-invocable: true
disable-model-invocation: false
---

# Create Issue

## When to Use
- Turn a bug, enhancement, task, or documentation request into a clear GitHub issue.
- Capture the problem, expected outcome, and ownership in a form someone else can act on.
- Use when the request is still rough and needs shaping before filing.

## Workflow
1. Identify the issue type.
   - Bug: something is broken or behaving unexpectedly.
   - Feature: new capability or behavior change.
   - Task: maintenance, cleanup, or implementation work.
   - Docs: documentation, examples, or wording updates.

2. Gather the minimum useful facts.
   - What happened or what is wanted.
   - Where it happens.
   - Impact or priority.
   - Reproduction steps if applicable.
   - Expected result.
   - Relevant screenshots, logs, or links.

3. Turn the request into an actionable issue.
   - Write a specific title.
   - Summarize the problem in one short paragraph.
   - Add numbered repro steps for bugs.
   - Add acceptance criteria for features and tasks.
   - Include environment details only when they change the behavior.

4. Choose metadata deliberately.
   - Apply labels that match the work.
   - Assign an owner if one is known.
   - Set a milestone only when it is meaningful.
   - Link related issues, PRs, or source notes when they help triage.

5. Check before publishing.
   - A reader should not need to ask what is broken or what success looks like.
   - The title should be specific enough to search later.
   - The body should distinguish symptoms from root cause when known.
   - The issue should have a clear next action.

## Issue Draft Template

```markdown
## Summary

What needs to change and why.

## Problem

Describe the current behavior or gap.

## Expected

Describe the desired outcome.

## Steps to Reproduce

1. First step
2. Second step
3. Observe the failure

## Acceptance Criteria

- [ ] Criterion one
- [ ] Criterion two
- [ ] Criterion three

## Notes

Add logs, screenshots, links, or constraints here.
```

## Completion Checks
- The issue can be understood without extra context.
- The issue has a concrete outcome, not just a vague complaint.
- The title and body are aligned.
- The issue is ready to be filed or handed off.
