---
name: prepare-release
description: 'Bump display version to user-provided version and push tag. Update bundled What's New notes before tagging.'
user-invocable: true
argument-hint: '[version] e.g. 1.2.0'
---

# Prepare Release

Bumps `manifest.json` + `package.json` to the version provided by the user, updates the bundled What's New entry for that version, and pushes the `vX.Y.Z` tag. No GitHub Release is created by this skill.

## Procedure

### 1. Get Version

- If user provided arg, use it. Else ask: `What version? (e.g. 1.2.0)`
- Strip leading `v`, validate shape `^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$` — one to four dot-separated integers (Chrome manifest `version` range), no leading zeros unless the component is exactly `0`, no prerelease suffix. Then verify each component is `0`–`65535` and reject all-zero versions (e.g. `0`, `0.0.0`). For prerelease display text like `-beta.1`, set `version_name` in `manifest.json` separately — `src/core/version.js` displays `version_name` when present. Reject if tag `v$VERSION` already exists locally (`git tag -l "v$VERSION"` should be empty) or remotely (`git ls-remote --tags origin "refs/tags/v$VERSION"` should be empty; run `git fetch --tags` first if needed).

  ```bash
  VERSION="${VERSION#v}"
  if ! printf '%s' "$VERSION" | grep -Eq '^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}$'; then
    echo "Invalid version: $VERSION" >&2; exit 1
  fi
  IFS='.' read -ra PARTS <<< "$VERSION"
  for n in "${PARTS[@]}"; do
    if [ "${#n}" -gt 5 ] || { [ "${#n}" -eq 5 ] && [ "$n" -gt 65535 ]; }; then echo "Component $n exceeds 65535" >&2; exit 1; fi
  done
  ALL_ZERO=1
  for n in "${PARTS[@]}"; do
    if [ "$n" != "0" ]; then ALL_ZERO=0; break; fi
  done
  if [ "$ALL_ZERO" = 1 ]; then
    echo "Version $VERSION is not allowed (all zero)" >&2; exit 1
  fi
  if [ -n "$(git tag -l "v$VERSION")" ]; then echo "Tag v$VERSION already exists locally" >&2; exit 1; fi
  remote_tags=$(git ls-remote --tags origin "refs/tags/v$VERSION") || { echo "Unable to verify remote tag v$VERSION" >&2; exit 1; }
  if printf '%s\n' "$remote_tags" | grep -q "refs/tags/v$VERSION"; then
    echo "Tag v$VERSION already exists on origin" >&2; exit 1
  fi
  ```

Verify you are on `main` before making any version changes:

```bash
test "$(git branch --show-current)" = "main" || { echo "Release must be prepared from main" >&2; exit 1; }
```

### 2. Bump In-App Version

Update all version files — must stay in sync, show diff, confirm:

- `manifest.json` `"version": "$VERSION"`
- `package.json` `"version": "$VERSION"`
- `package-lock.json` `"version": "$VERSION"` (run `npm install --package-lock-only` if needed to sync lockfile)

### 3. Update What's New

Before committing or tagging, add a `RELEASE_NOTES` entry in `src/features/release-notes.js` for `$VERSION`.

- The key must exactly match `$VERSION` (no leading `v`)
- Add 3–8 concise, user-facing highlights from the release
- Keep each highlight short enough for the modal
- Do not add fixes or internal maintenance details unless they are meaningful to users
- Keep the newest release entry at the top of `RELEASE_NOTES`

Show the diff and verify the new version key is present:

```bash
grep -nF "'$VERSION':" src/features/release-notes.js
```

The release workflow also validates this entry before packaging.

### 4. Commit

Verify only intended files will be committed:

```bash
# fail if there are already staged changes — avoids including unrelated work
if [ -n "$(git diff --cached --name-only)" ]; then
  echo "Unexpected staged changes — stash or commit them first" >&2
  git diff --cached --name-only >&2
  exit 1
fi
git status --porcelain
git add manifest.json package.json package-lock.json src/features/release-notes.js
git diff --cached --name-only  # should list only version/release-note files
# verify only release files are staged
for f in $(git diff --cached --name-only); do
  case "$f" in manifest.json|package.json|package-lock.json|src/features/release-notes.js) ;;
    *) echo "Unexpected staged file: $f" >&2; exit 1;;
  esac
done
git commit -m "chore: release v$VERSION" manifest.json package.json package-lock.json src/features/release-notes.js
```

### 5. Tag & Push

```bash
test "$(git branch --show-current)" = "main" || { echo "Release must be prepared from main" >&2; exit 1; }
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin HEAD --follow-tags
```

## Checklist

- [ ] Version from user, valid semver, tag not exists
- [ ] manifest.json + package.json + package-lock.json synced
- [ ] src/features/release-notes.js contains the matching version entry
- [ ] Tag pushed
