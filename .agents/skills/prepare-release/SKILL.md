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
- Strip leading `v`, validate shape `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` — three dot-separated integers, no leading zeros unless the component is exactly `0`, no prerelease suffix. Then verify each component is `0`–`65535` and reject `0.0.0`. For prerelease display text like `-beta.1`, set `version_name` in `manifest.json` separately — `src/core/version.js` displays `version_name` when present. Reject if tag `v$VERSION` already exists locally (`git tag -l "v$VERSION"` should be empty) or remotely (`git ls-remote --tags origin "refs/tags/v$VERSION"` should be empty; run `git fetch --tags` first if needed).

  ```bash
  VERSION="${VERSION#v}"
  if ! printf '%s' "$VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
    echo "Invalid version: $VERSION" >&2; exit 1
  fi
  IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"
  for n in "$MAJOR" "$MINOR" "$PATCH"; do
    if [ "$n" -gt 65535 ]; then echo "Component $n exceeds 65535" >&2; exit 1; fi
  done
  if [ "$MAJOR" = 0 ] && [ "$MINOR" = 0 ] && [ "$PATCH" = 0 ]; then
    echo "Version 0.0.0 is not allowed" >&2; exit 1
  fi
  if [ -n "$(git tag -l "v$VERSION")" ]; then echo "Tag v$VERSION already exists locally" >&2; exit 1; fi
  if git ls-remote --tags origin "refs/tags/v$VERSION" | grep -q "refs/tags/v$VERSION"; then
    echo "Tag v$VERSION already exists on origin" >&2; exit 1
  fi
  ```

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
test "$(git branch --show-current)" = "main" || { echo "Release must be prepared from main" >&2; exit 1; }
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin HEAD --follow-tags
```

## Checklist

- [ ] Version from user, valid semver, tag not exists
- [ ] manifest.json + package.json synced (and package-lock.json if present)
- [ ] Tag pushed
