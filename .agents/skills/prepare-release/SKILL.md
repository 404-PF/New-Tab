---
name: prepare-release
description: 'Bump display version to user-provided version and push tag. No changelog, no GitHub Release.'
user-invocable: true
argument-hint: '[version] e.g. 1.2.0'
---

# Prepare Release

Bumps `manifest.json` + `package.json` to version provided by user (`src/core/version.js` reads manifest for `version-display`) and pushes `vX.Y.Z` tag.

## Procedure

### 1. Get Version

- If user provided arg, use it. Else ask: `What version? (e.g. 1.2.0)`
- Strip leading `v`, validate `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` — three dot-separated integers, each `0`–`65535`, no leading zeros unless the component is exactly `0`, not all zero, and no prerelease suffix (use `version_name` for display text like `-beta.1`). Reject if tag `v$VERSION` already exists (`git tag -l "v$VERSION"` should be empty).

### 2. Bump In-App Version

Update all version files — must stay in sync, show diff, confirm:

- `manifest.json` `"version": "$VERSION"`
- `package.json` `"version": "$VERSION"`
- `package-lock.json` `"version": "$VERSION"` (run `npm install --package-lock-only` if needed to sync lockfile)

### 3. Commit

Verify only intended files will be committed:

```bash
git status --porcelain
git diff --cached --name-only  # should be empty before staging
git add manifest.json package.json package-lock.json
git diff --cached --name-only  # should list only version files
git commit -m "chore: release v$VERSION" manifest.json package.json package-lock.json
```

### 4. Tag & Push

```bash
git branch --show-current  # must be 'main'; merge to main first if not
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin HEAD --follow-tags
```

## Checklist

- [ ] Version from user, valid semver, tag not exists
- [ ] manifest.json + package.json synced (and package-lock.json if present)
- [ ] Tag pushed
