---
name: create-issue
description: 'Create a GitHub issue with proper structure and metadata. Use when the user asks to create an issue, open a ticket, report a bug, or request a feature. Supports labels, assignees, milestones, and templates.'
user-invocable: true
argument-hint: '[optional: issue title or description]'
---

# Create Issue

Create a well-structured GitHub issue with appropriate metadata.

## When to Use
- User asks to "create an issue", "open a ticket", or "report a bug"
- User wants to track a task, bug, or feature request
- After discovering a problem that needs documentation

## Procedure

### 1. Determine Repository Context
- Try to infer the repository from `git remote -v`
- If no remote or multiple remotes exist, ask the user for the target `owner/repo`

### 2. Gather Issue Details

**Auto-detect issue type** from the title/description using these heuristics:
| Keywords | Type |
|----------|------|
| `fail`, `error`, `crash`, `broken`, `doesn't work`, `bug`, `wrong`, `regression` | Bug |
| `add`, `support`, `implement`, `feature`, `new`, `enhance`, `improve`, `request` | Feature |
| `fix typo`, `update docs`, `refactor`, `clean up`, `rename`, `move`, `migrate` | Task |

If the type is ambiguous, ask the user to confirm. If confident, proceed without asking.

**Infer from context** (don't ask if already known):
- **Title**: Use the provided argument or derive from description
- **Description**: Expand on the title with relevant details
- **Labels**: Query existing repository labels and pick matching ones automatically (see Step 3)

**Only ask if missing** (don't prompt for optional fields the user didn't mention):
- Assignee(s)
- Milestone
- Priority
- Additional context or details

### 3. Structure the Issue Body

Use this template based on issue type:

**Bug Report:**
```markdown
## Description
[Clear description of the bug]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- OS: [e.g., Windows 11, macOS 14]
- Browser: [if applicable]
- Version: [e.g., v1.2.3]

## Additional Context
[Any other relevant information, screenshots, logs]
```

**Feature Request:**
```markdown
## Description
[Clear description of the feature]

## Problem Statement
[What problem does this solve?]

## Proposed Solution
[How should this work?]

## Alternatives Considered
[Other approaches considered]

## Additional Context
[Any mockups, examples, or references]
```

**Task:**
```markdown
## Description
[What needs to be done]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Dependencies
[Any blockers or related issues]

## Timeline
[Expected completion, if applicable]
```

### 4. Confirm with User
Before creating, redact secrets, credentials, tokens, API keys, and personal identifiers from the generated title and body (replace with `[REDACTED]`). Then present:
- Generated title (redacted)
- Detected type (if inferred)
- Labels to be applied
- Assignees (if any)
- Milestone (if any)
- Final redacted body — the full text that will be published (with redactions applied)
- Disclosure of any sensitive content that was redacted, if detected

Ask: **"Create this issue?"** — show the final body before asking, so the user reviews exactly what will be sent to GitHub.

> **Suggestions are optional.** Only present labels/assignees/milestones that were explicitly requested or automatically inferred. Don't add extra fields the user didn't ask for.

### 5. Create the Issue

Use **GitHub MCP tools** (`mcp_github_mcp_se_issue_write`) to create the issue:
- `method`: "create"
- `owner`: Repository owner
- `repo`: Repository name
- `title`: Generated title
- `body`: Generated description
- `labels`: Array of label names
- `assignees`: Array of usernames
- `milestone`: Milestone number (if provided)

If MCP tools are unavailable, fall back to **`gh` CLI** — pass the selected repository with `--repo`, resolve a milestone number to its name first (`gh api repos/<owner>/<repo>/milestones/<number> --jq .title` → `--milestone "<milestone-name>"`), and stream the body without shell interpolation:

```bash
# Resolve milestone name first if you have a number:
# milestone_name=$(gh api repos/<owner>/<repo>/milestones/<number> --jq .title)
tmp=$(mktemp -t issue-body-XXXXXX.md) && trap 'rm -f "$tmp"' EXIT
printf '%s' "$body" > "$tmp"
gh issue create --repo "<owner>/<repo>" --title "$title" --body-file "$tmp" --label "<label1>,<label2>" --assignee "<user1>,<user2>" --milestone "$milestone_name"
# alternative: stream body via stdin — title/labels/assignees/milestone as separate args, body via --body-file -
# printf '%s' "$body" | gh issue create --repo "<owner>/<repo>" --title "$title" --body-file - --label "<label1>,<label2>" --assignee "<user1>,<user2>" --milestone "$milestone_name"
```

### 6. Report Result
- Display the created issue URL
- Suggest next steps (e.g., add to project board, link to PR)

## Example Interactions

| User says | Action |
|-----------|--------|
| `/create-issue` | Interactive: gather all details step-by-step |
| `/create-issue Login fails with SSO` | Create bug report with provided title |
| `/create-issue Add dark mode support` | Create feature request |
| `/create-issue Fix typo in README` | Create simple task issue |

## Edge Cases

- **No repository context**: Fall back to `git remote -v`; ask only if inference fails
- **Missing title**: Prompt for a title; infer type automatically
- **Invalid labels**: Only use existing repository labels — skip labels that don't exist rather than creating new ones
- **Issue already exists**: Search for similar open issues first, suggest linking if found
- **Rate limits**: Handle GitHub API rate limits gracefully, suggest waiting or using CLI

## Integration with Other Skills

This skill works well with:
- `checkout-branch`: After creating an issue, **optionally** suggest creating a branch with `/checkout-branch <issue-number>`
- `commit`: **Optionally** mention referencing the issue with `Closes #<number>` in commits
- `create-pr`: **Optionally** suggest linking a PR to close the issue

> Keep all integration suggestions brief and non-intrusive. Only mention them once, not repeatedly.