---
name: review-changes
description: 'Review staged and unstaged changes before committing. Use for: code review, pre-commit checks, validating changes, checking diff quality, linting, test verification, security scan. Trigger phrases: review changes, review my changes, check changes, pre-commit review, review diff.'
user-invocable: true
argument-hint: '[optional: --staged | file path | branch]'
---

# Review Changes

Systematic pre-commit code review checklist for staged and unstaged changes.

## When to Use
- Before committing code to verify quality
- When asked to review local changes
- To validate a diff before creating a PR
- After making multiple edits to ensure nothing was missed

## Procedure

### 1. Identify Changes
- Determine input type before running git (when argument is not `--staged` or empty): check whether it resolves to a tracked path (`git ls-files --error-unmatch -- <arg>` or `test -e <arg>`) vs a ref (`git rev-parse --verify --quiet <arg>`); if both match, prefer file-path handling and ask the user to disambiguate with `--` or a full ref. If neither matches, report that the argument matches neither a path nor a ref and ask the user to clarify. Route to the matching branch below.
- If the argument is `--staged`, review only staged changes (`git diff --staged`); skip unstaged and untracked.
- If the argument is a file path, scope all diffs to that path (`git diff --staged -- <path>`, `git diff -- <path>`, `git status -- <path>`). If `git status -- <path>` shows the file as untracked, read its contents (`cat <path>` or `git diff --no-index /dev/null <path>`), since the diff commands provide nothing for untracked files.
- If the argument is a branch name, compare against it (`git diff <branch>...HEAD`, `git diff <branch>...HEAD --name-only`).
- Otherwise (no argument), run the full scan:
  - `git diff --staged` to see staged changes
  - `git diff` to see unstaged changes
  - `git status -uall` (or `git ls-files --others --exclude-standard`) to list untracked files without collapsing directories into a single `dir/` entry — enumerate each file before reading
  - Read every untracked file listed (e.g., `cat <file>` or `git diff --no-index /dev/null <file>`) — diff commands alone do not provide their contents
- Summarize the scope: which files changed, what the changes accomplish

### 2. Correctness Check
For each changed file, verify:
- [ ] Logic is correct — no off-by-one errors, null/undefined gaps, or broken control flow
- [ ] Edge cases are handled — empty inputs, error states, boundary conditions
- [ ] Return values and types are consistent with existing patterns
- [ ] No leftover debug code (`console.log`, `print()`, `TODO`, `FIXME`, `HACK`)
- [ ] No accidental deletions or commented-out code blocks

### 3. Style & Consistency
- [ ] Code follows existing project conventions (naming, formatting, patterns)
- [ ] Imports are organized and unused imports are removed
- [ ] Error messages are descriptive and actionable
- [ ] Function and variable names clearly convey purpose

### 4. Security Scan
- [ ] No hardcoded secrets, API keys, tokens, or credentials
- [ ] No unsanitized user input used in queries, commands, or HTML rendering
- [ ] Authentication/authorization logic is not weakened
- [ ] Sensitive data is not logged

### 5. Tests
- [ ] New or changed behavior has corresponding tests
- [ ] Existing tests still pass (run the test suite)
- [ ] Test names and assertions clearly describe expected behavior

### 6. Documentation
- [ ] Public API changes include updated docstrings/comments
- [ ] Breaking changes are noted
- [ ] README or config changes are included if dependencies or setup changed

### 7. Final Summary
After completing the checklist, provide a concise summary:
- **Verdict**: Ready to commit / Needs changes / Needs discussion
- **Issues found**: List any problems with severity (blocking / warning / suggestion)
- **Positive notes**: What was done well

## Example Prompts
- `/review-changes` — review all staged and unstaged changes
- `/review-changes src/api/handler.ts` — review changes in a specific file
- `/review-changes --staged` — review only staged changes
- `/review-changes main` — review committed changes against a branch (`git diff main...HEAD`)
