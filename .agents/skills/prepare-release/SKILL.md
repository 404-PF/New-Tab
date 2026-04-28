---
name: prepare-release
description: Prepare and manage releases
---

## Available Tools

| Tool | Purpose |
|------|---------|
| `github_list_pull_requests` | List merged PRs for release notes |
| `github_list_commits` | Verify CHANGELOG entries |
| `github_get_pull_request_files` | Review changes in release PR |
| `github_merge_pull_request` | Merge release PR |
| `github_create_pull_request` | Create release branch PR |

## Creating a Release

Use GitHub CLI to create a draft release:
```bash
gh release create <tag> --title "<title>" --notes "<notes>" --draft
```

## Workflow

1. **Review merged PRs** - List merged PRs since last release
2. **Update CHANGELOG** - Add entries for each significant change
3. **Prepare version bump** - CRITICAL: Update version on a release branch, since `main` is protected and only accepts merged PRs:
   - Update `manifest.json` version field
   - Update version in all README files: `README.md`, `docs/README.en-US.md`, `docs/README.zh-CN.md`
   - Commit with message "chore: bump version to v<x.y.z>"
4. **Create release PR** - Open a PR from the release branch with the CHANGELOG and version updates
5. **Acknowledge contributors** - Credit contributors in release notes
6. **Review changes** - Verify files changed match expectations
7. **Merge PR** - Use squash merge for clean history
8. **Create tag** - Tag the merged release commit
9. **Create GitHub release** - Create draft release with `gh release create --draft`

## Tips

- Update version in `manifest.json` and all README files (README.md, docs/README.en-US.md, docs/README.zh-CN.md) on the release branch before creating the release PR; `src/core/version.js` reads the manifest version automatically
- Use semantic versioning (e.g., v1.2.0)
- Include breaking changes in release notes
- Reference PR numbers in CHANGELOG for context
- Credit contributors in release notes using `gh pr list --merged`