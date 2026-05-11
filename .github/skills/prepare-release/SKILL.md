---
name: prepare-release
description: 'Prepare a release for the New-Tab extension. Use when bumping versions, updating the changelog, checking manifest and package metadata, validating release notes, and running final pre-publish verification.'
argument-hint: 'target version or release notes'
user-invocable: true
disable-model-invocation: false
---

# Prepare Release

## When to Use
- Package a release candidate for the extension.
- Update version metadata and release notes.
- Verify the tree is ready to publish, tag, or hand off.
- Use when the goal is a stable Chrome or Edge store release, not a feature branch.

## Workflow
1. Confirm release scope.
   - Identify the target version.
   - Classify the release as a bug fix, feature, docs, or maintenance update.
   - Note any unfinished work that must stay out of the release.

2. Sync versioned files.
   - Update `package.json` and `manifest.json` versions together.
   - Keep `package-lock.json` aligned if it records the package version.
   - Update version badges or release references in docs when they are pinned.
   - Keep store listing copy and locale-facing release text consistent when the release changes user-visible messaging.

3. Refresh the changelog.
   - Move completed items into the correct release section or release the current unreleased section.
   - Group entries by category when the repo already uses categories.
   - Keep bullets short, factual, and user-facing.
   - Exclude work that is not part of the release.

4. Run release checks.
   - Run the test suite.
   - Check for version mismatches across metadata files.
   - Inspect the diff for accidental content changes.
   - Confirm there are no unrelated edits that should not ship.

5. Decide readiness.
   - If tests fail, fix the release-blocking issue first.
   - If the changelog or version target is unclear, ask for the missing release decision.
   - If everything is aligned, prepare the final release summary and publish notes.

## Completion Checks
- Version numbers match everywhere they should.
- Changelog entries describe the shipped change set.
- Tests or verification commands have been run.
- The release is ready to tag, publish, or hand off.