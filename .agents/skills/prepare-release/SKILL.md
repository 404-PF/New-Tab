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
- Strip leading `v`, validate `^\d+\.\d+\.\d+` (allow `-beta.1`), reject if tag `v$VERSION` already exists.

### 2. Bump In-App Version
Update both - must stay in sync, show diff, confirm:
- `manifest.json` `"version": "$VERSION"`
- `package.json` `"version": "$VERSION"`

### 3. Commit
```bash
git add manifest.json package.json
git commit -m "chore: release v$VERSION"
```

### 4. Tag & Push
```bash
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main --follow-tags
```

## Checklist
- [ ] Version from user, valid semver, tag not exists
- [ ] manifest.json + package.json synced
- [ ] Tag pushed
