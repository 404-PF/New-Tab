import { readFileSync } from 'fs';
import { resolve } from 'path';

const MERGE_PATH = resolve(process.cwd(), '.github/workflows/pr-merge.yml');
const DRIVE_PATH = resolve(process.cwd(), '.github/workflows/pr-drive.yml');

describe('pr-merge auto-merges fully-satisfied PRs (#920)', () => {
  let merge;

  beforeAll(() => {
    merge = readFileSync(MERGE_PATH, 'utf-8');
  });

  it('triggers on label/ready PR events, check, CI completion, and dispatch events', () => {
    expect(merge).toMatch(/^on:\n {2}pull_request:\n(?: {4}#.*\n)* {4}types: \[ready_for_review, labeled, unlabeled\]\n/m);
    // Pushes evaluate via CI completion (workflow_run), and reviews are not
    // a trigger: a PR-head run there was cancelled by the merging re-entry
    // on main, leaving merged PRs with a red "cancelled" pr-merge check.
    expect(merge).not.toMatch(/^ {2}pull_request_review:/m);
    expect(merge).not.toMatch(/types: \[[^\]]*\b(opened|synchronize|reopened)\b/);
    expect(merge).toMatch(/^ {2}check_run:\n {4}types: \[completed\]\n {2}check_suite:\n {4}types: \[completed\]/m);
    expect(merge).toMatch(/^ {4}types: \[completed\]\n {2}workflow_dispatch:\n {4}inputs:/m);
    expect(merge).toMatch(/^ {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/m);
  });

  it('never uses the invalid pull_request_review_thread trigger', () => {
    // pull_request_review_thread is a webhook event, not an Actions trigger:
    // GitHub rejects the entire workflow file when it appears in `on:`.
    expect(merge).not.toMatch(/^ {2}pull_request_review_thread:/m);
    expect(merge).not.toMatch(/event_name == 'pull_request_review_thread'/);
  });

  it('exposes pr_number and dry_run inputs on workflow_dispatch', () => {
    expect(merge).toMatch(/pr_number:\n {8}description: 'Pull request number to evaluate for merge'\n {8}required: true\n {8}type: number/);
    expect(merge).toMatch(/dry_run:\n {8}description: 'Evaluate and comment the verdict without merging'\n {8}required: false\n {8}type: boolean\n {8}default: false/);
  });

  it('pre-filters events unrelated to a PR targeting main before a runner starts', () => {
    const jobIf = merge.match(/^ {4}if: >\n((?: {6}.*\n?)*)/m);
    expect(jobIf).not.toBeNull();
    expect(jobIf[1]).toMatch(/github\.event_name == 'workflow_dispatch'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'pull_request'/);
    expect(jobIf[1]).not.toMatch(/github\.event_name == 'pull_request_review'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'check_run'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'check_suite'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'workflow_run'/);
    expect(jobIf[1]).toContain('github.event.pull_request.base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.check_run.pull_requests[0].base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.check_suite.pull_requests[0].base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.workflow_run.pull_requests[0].base.ref == \'main\'');
  });

  it('pre-filters fork heads so no runner starts for a PR it can only block', () => {
    // GitHub downgrades GITHUB_TOKEN to read-only on pull_request events
    // when the PR's head is a fork, so such a run
    // can never merge and cannot even post its verdict comment. Without the
    // fork half of the filter, every fork PR burns a runner and then fails
    // the step on the comment write's 403 — a red check for a PR that was
    // correctly "blocked". The fork gate below still denies a dispatch run
    // that is pointed at a fork.
    const jobIf = merge.match(/^ {4}if: >\n((?: {6}.*\n?)*)/m);
    expect(jobIf).not.toBeNull();
    expect(jobIf[1]).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    // check_run / check_suite / workflow_run payloads carry a minimal PR
    // object whose head.repo has only id, url and name (no full_name), so
    // those events compare head.repo.id to repository_id instead.
    expect(jobIf[1]).toContain('github.event.check_run.pull_requests[0].head.repo.id == github.repository_id');
    expect(jobIf[1]).toContain('github.event.check_suite.pull_requests[0].head.repo.id == github.repository_id');
    expect(jobIf[1]).toContain('github.event.workflow_run.pull_requests[0].head.repo.id == github.repository_id');
    // Gate 2 is the enforcement point, so the dispatch escape hatch cannot
    // merge a fork either.
    expect(merge).toMatch(/if \[ -z "\$VERDICT" \] && \[ "\$HEAD_REPO" != "\$GH_REPO" \]; then/);
  });

  it('serializes evaluations per PR with cancel-in-progress', () => {
    // Job-level, not workflow-level: a job skipped by `if:` never joins the
    // group, so a re-entry that is about to be skipped cannot cancel an
    // in-progress evaluation.
    expect(merge).toMatch(/concurrency:\n {6}group: >-\n {8}\$\{\{ github\.event_name == 'workflow_dispatch'/);
    expect(merge).toContain('format(\'pr-merge-{0}\', github.event.inputs.pr_number)');
    expect(merge).toContain('github.event.pull_request.number');
    expect(merge).toContain('github.event.check_run.pull_requests[0].number');
    expect(merge).toContain('github.event.check_suite.pull_requests[0].number');
    expect(merge).toContain('github.event.workflow_run.pull_requests[0].number');
    expect(merge).toMatch(/cancel-in-progress: true/);
  });

  it('pins narrow permissions, uses GITHUB_TOKEN everywhere, and GH_PAT only for branch protection and the merge mutation', () => {
    // Parse the complete permissions mapping so a blank or comment line
    // cannot hide an extra scope anywhere inside the block: every scope
    // line the block contains must be one of the five expected entries.
    const perms = merge.match(/^ {4}permissions:\n((?:[ \t]*\n|[ \t]*#[^\n]*\n| {6}[\w-]+:[^\n]*\n)*)/m);
    expect(perms).not.toBeNull();
    const scopes = [...perms[1].matchAll(/^ {6}([\w-]+):\s*(\S+)\s*$/gm)].map((match) => `${match[1]}: ${match[2]}`);
    expect(scopes).toEqual([
      'contents: write',
      'pull-requests: write',
      'checks: read',
      'statuses: read',
      'actions: read',
    ]);
    // The protection endpoint requires Administration:read, and a merge
    // with GITHUB_TOKEN would not trigger post-merge workflows; GH_PAT is
    // scoped to those two calls via PAT_TOKEN and falls back to
    // GITHUB_TOKEN when the secret is unset.
    expect(merge).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(merge).toContain('GH_PAT: ${{ secrets.GH_PAT }}');
    expect(merge).toContain('PAT_TOKEN="${GH_PAT:-$GH_TOKEN}"');
    expect(merge).toContain('GH_TOKEN="$PAT_TOKEN" gh api "repos/$GH_REPO/branches/main/protection"');
    expect(merge).toContain('GH_TOKEN="$PAT_TOKEN" gh api graphql --input "$CTX/merge-request.json"');
    // No other gh call may override GH_TOKEN with the PAT.
    const patCalls = [...merge.matchAll(/GH_TOKEN="\$PAT_TOKEN" gh api [^\n]*/g)].map((match) => match[0]);
    expect(patCalls).toHaveLength(2);
    expect(patCalls[0]).toContain('repos/$GH_REPO/branches/main/protection');
    expect(patCalls[1]).toContain('--input "$CTX/merge-request.json"');
  });

  it('uses no external actions at all', () => {
    // Anchored to the step-level "- uses:" so substrings like "statuses:" do
    // not count as action references.
    const actionPins = [...merge.matchAll(/^\s*- uses: (\S+)/gm)].map((match) => match[1]);
    expect(actionPins).toEqual([]);
  });

  it('runs bash with set -euo pipefail', () => {
    expect(merge).toMatch(/run: \|\n {10}set -euo pipefail/);
  });

  it('gates on open state, same-repo head, and non-draft', () => {
    expect(merge).toMatch(/if \[ "\$STATE" != 'open' \]; then/);
    expect(merge).toMatch(/if \[ -z "\$VERDICT" \] && \[ "\$HEAD_REPO" != "\$GH_REPO" \]; then/);
    expect(merge).toMatch(/if \[ -z "\$VERDICT" \] && \[ "\$DRAFT" = 'true' \]; then/);
  });

  it('refuses the four blocking labels', () => {
    expect(merge).toMatch(/for label in do-not-merge hold wip blocked; do/);
    expect(merge).toMatch(/blocking label \\`\$\{label\}\\` is present/);
  });

  it('gates on CHANGES_REQUESTED and unresolved review threads', () => {
    expect(merge).toMatch(/--json reviewDecision --jq '\.reviewDecision \/\/ ""'/);
    expect(merge).toMatch(/\[ "\$REVIEW_DECISION" = 'CHANGES_REQUESTED' \]/);
    expect(merge).toContain('reviewThreads(first: 100, after: $endCursor)');
    expect(merge).toContain('pageInfo { hasNextPage endCursor }');
    expect(merge).toContain('select(.isResolved | not)');
    expect(merge).toMatch(/gh api graphql --paginate -F owner=/);
  });

  it('never merges while a pr-drive run is active, and fails closed on lookup errors', () => {
    // Active runs are queried server-side by status so the guard never
    // falls inside a bounded window of unrelated historical runs.
    expect(merge).toContain('gh api "repos/$GH_REPO/actions/workflows/pr-drive.yml/runs?status=$drive_status&per_page=100"');
    expect(merge).toMatch(/for drive_status in in_progress queued; do/);
    // The runs API leaves pull_requests empty for issue_comment and
    // workflow_dispatch runs (pr-drive's only triggers), so dispatch runs
    // are matched through the durable pr-drive run-name marker instead.
    expect(merge).toContain('any(.pull_requests[]?; .number == $n)');
    expect(merge).toContain('.display_title // ""');
    expect(merge).toContain('"pr-drive #" + ($n | tostring)');
    expect(merge).toContain('could not list pr-drive runs');
  });

  it('pr-drive publishes a per-PR run-name marker the active-drive guard can match', () => {
    // Without this marker, dispatch and comment runs (pr-drive's only
    // triggers) carry no pull_requests association and would be invisible
    // to pr-merge's active-drive guard.
    const drive = readFileSync(DRIVE_PATH, 'utf-8');
    expect(drive).toMatch(/^run-name: >-\n {2}pr-drive #\$\{\{ github\.event_name == 'workflow_dispatch'\n {4}&& github\.event\.inputs\.pr_number \|\| github\.event\.issue\.number \}\}/m);
  });

  it('requires mergeable != false and a non-blocking lowercase mergeable_state, with retries', () => {
    // mergeable/mergeable_state are computed asynchronously; poll briefly.
    // clean passes; unstable/has_hooks are still mergeable (unstable often
    // means this workflow's own in-progress check on the head SHA) and
    // pass only because the check-run gate below is independent. blocked,
    // behind, dirty, and unknown keep denying.
    expect(merge).toMatch(/for attempt in 1 2 3; do/);
    expect(merge).toMatch(/sleep 5/);
    expect(merge).toMatch(/if \[ "\$MERGEABLE" = 'false' \] \|\| \[ "\$MERGE_STATE" = 'dirty' \]; then/);
    expect(merge).toMatch(/\[ "\$MERGE_STATE" != 'clean' \]/);
    expect(merge).toMatch(/\[ "\$MERGE_STATE" != 'unstable' \]/);
    expect(merge).toMatch(/\[ "\$MERGE_STATE" != 'has_hooks' \]/);
    expect(merge).not.toMatch(/'CLEAN'|'DIRTY'/);
  });

  it('words the blocked merge state as pending instead of a hard blockage (#945)', () => {
    // `blocked` is GitHub's normal in-progress state for a fresh PR
    // (required checks or approval still pending), so the verdict must read
    // as waiting while the deny itself stays fail-closed. dirty/behind/
    // unknown keep their hard wording.
    const pending = 'merge state is blocked: required status check(s) or review approval still pending';
    expect(merge).toContain(pending);
    const gate8 = merge.match(/if \[ "\$MERGEABLE" = 'false' \] \|\| \[ "\$MERGE_STATE" = 'dirty' \]; then[\s\S]*?\n {12}fi/);
    expect(gate8).not.toBeNull();
    const branch = gate8[0];
    expect(branch).toMatch(/deny 'PR has merge conflicts'/);
    expect(branch).toMatch(/\[ "\$MERGE_STATE" = 'blocked' \]/);
    expect(branch).toContain(pending);
    // The dedicated blocked branch must deny before the generic catch-all,
    // which still exists for behind/unknown/other states.
    expect(branch.indexOf(pending)).toBeGreaterThan(branch.indexOf('PR has merge conflicts'));
    expect(branch).toContain('deny "merge state is ${MERGE_STATE}, which blocks merging"');
    expect(branch.indexOf('${MERGE_STATE}, which blocks merging')).toBeGreaterThan(branch.indexOf(pending));
    // Deny semantics unchanged: the blocked branch still records a denial,
    // and DECISION stays the stable decision word.
    expect(branch).toMatch(/deny 'merge state is blocked:/);
    expect(merge).toMatch(/DECISION='blocked'/);
  });

  it('requires every check run on the head SHA terminal and successful, excluding itself', () => {
    expect(merge).toContain('/commits/$HEAD_SHA/check-runs');
    expect(merge).toMatch(/\$2 != "completed" \|\| \(\$3 != "success" && \$3 != "neutral" && \$3 != "skipped"\)/);
    // The merge job is named after the workflow, so its check run name
    // equals WORKFLOW_NAME; the exact-name exclusion keeps it (in_progress
    // while evaluating) and prior cancelled evaluations from blocking.
    expect(merge).toMatch(/^ {2}merge:\n(?: {4}#[^\n]*\n)* {4}name: pr-merge\n/m);
    expect(merge).toContain('.name != env.WORKFLOW_NAME');
    expect(merge).toContain('WORKFLOW_NAME: ${{ github.workflow }}');
    expect(merge).toContain('gh api "repos/$GH_REPO/commits/$HEAD_SHA/check-runs" --paginate');
  });

  it('treats a missing or unreadable check set as not green (fail closed)', () => {
    // An empty set is not green: CI may not have started yet, and a fetch
    // error must block instead of skipping the gate.
    expect(merge).toContain('could not fetch check runs for the head SHA');
    expect(merge).toContain('no check runs found on the head SHA yet; waiting for CI');
    expect(merge).toMatch(/if ! gh api "repos\/\$GH_REPO\/commits\/\$HEAD_SHA\/check-runs" --paginate/);
  });

  it('reads required status checks from branch protection, never a hardcoded name', () => {
    expect(merge).toContain('repos/$GH_REPO/branches/main/protection');
    expect(merge).toContain('required_status_checks.checks // []');
    expect(merge).toContain('required_status_checks.contexts // []');
    expect(merge).toContain('/commits/$HEAD_SHA/status');
    // Required checks must come from the protection API file only.
    expect(merge).not.toMatch(/required_checks=/);
    expect(merge).not.toMatch(/SonarCloud/);
  });

  it('fails closed when branch protection or required statuses cannot be read', () => {
    // Only an explicit 404 means "intentionally unprotected"; any other
    // protection or status-fetch failure must block the merge.
    expect(merge).toMatch(/grep -q '404' "\$CTX\/protection\.err"/);
    expect(merge).toContain('could not read branch protection for main');
    expect(merge).toContain('could not parse branch protection for main');
    expect(merge).toContain('could not fetch commit statuses for the head SHA');
    expect(merge).toContain('gh api "repos/$GH_REPO/commits/$HEAD_SHA/status" --paginate');
  });

  it('merges via GraphQL mergePullRequest with expectedHeadOid and SQUASH', () => {
    // Plain `gh pr merge` cannot pass expectedHeadOid, so it must not appear.
    expect(merge).not.toMatch(/gh pr merge/);
    expect(merge).toContain('mergePullRequest(input: {pullRequestId: $id, expectedHeadOid: $oid, mergeMethod: $method})');
    expect(merge).toMatch(/--arg oid "\$HEAD_SHA" --arg method SQUASH/);
    expect(merge).toContain('{query: $q, variables: {id: $id, oid: $oid, method: $method}}');
  });

  it('revalidates every mutable merge predicate immediately before merging', () => {
    // The mutation also carries expectedHeadOid, but state, draft, base,
    // head SHA, labels, the review decision, unresolved review threads,
    // and the active pr-drive guard are re-checked so a change during
    // evaluation aborts instead of merging an unverified commit, a
    // CHANGES_REQUESTED review, or new unresolved thread, or merging a
    // pr-drive run out from under itself.
    expect(merge).toContain('FINAL_JSON="$(gh api "repos/$GH_REPO/pulls/$PR_NUMBER")"');
    expect(merge).toContain('[ "$FINAL_STATE" != \'open\' ]');
    expect(merge).toContain('[ "$FINAL_DRAFT" = \'true\' ]');
    expect(merge).toContain('[ "$FINAL_BASE" != \'main\' ]');
    expect(merge).toContain('[ "$FINAL_HEAD" != "$HEAD_SHA" ]');
    expect(merge).toContain('PR state changed during evaluation; merge aborted');
    expect(merge).toContain('a blocking label was added during evaluation; merge aborted');
    // Gate 7's active-drive guard is re-run immediately before the
    // mutation: a pr-drive run can start after gate 7 and before the
    // merge, so a fresh lookup failure or an active run must abort.
    expect(merge).toContain('FINAL_DRIVE_RUNS=');
    expect(merge).toContain('could not re-check active pr-drive runs before merge');
    expect(merge).toContain('a pr-drive run became active during evaluation; merge aborted');
    // Gates 5 and 6 are re-run alongside: a reviewer bot can open new
    // unresolved threads or flip the review decision to
    // CHANGES_REQUESTED after those gates pass and before the mutation,
    // which must abort instead of copying exactly that race.
    expect(merge).toContain('could not re-check unresolved review threads before merge');
    expect(merge).toContain('unresolved review thread(s) appeared during evaluation; merge aborted');
    expect(merge).toContain('could not re-check the review decision before merge');
    expect(merge).toContain('a review requested changes during evaluation; merge aborted');
    // The thread re-check must re-query GraphQL rather than trust the
    // gate-6 count, so the paginated reviewThreads query appears in both
    // places, and both re-checks fail closed on a lookup error.
    expect(merge.match(/reviewThreads\(first: 100, after: \$endCursor\)/g)).toHaveLength(2);
    expect(merge.match(/select\(\.isResolved \| not\)/g)).toHaveLength(2);
    expect(merge).toContain('FINAL_THREADS_LOOKUP_OK=0');
    expect(merge).toContain('FINAL_REVIEW_LOOKUP_OK=0');
    expect(merge).toContain('expectedHeadOid mismatch or permissions');
  });

  it('deletes the head ref re-read at merge time via the git refs endpoint', () => {
    // A rename during evaluation frees the pre-evaluation HEAD_REF, which an
    // unrelated branch may then occupy; cleanup must use FINAL_REF instead.
    expect(merge).toContain('FINAL_REF="$(jq -r .head.ref <<<"$FINAL_JSON")"');
    expect(merge).toMatch(/gh api -X DELETE "repos\/\$GH_REPO\/git\/refs\/heads\/\$FINAL_REF"/);
    expect(merge).toMatch(/Merged, but could not delete branch/);
    expect(merge).toMatch(/\[ "\$FINAL_REF" != 'main' \]/);
  });

  it('skips commenting when the PR is no longer open', () => {
    // A post-merge check completion must not overwrite the "merged"
    // verdict: the non-open path exits before any comment is posted.
    const notOpen = merge.match(/if \[ "\$STATE" != 'open' \]; then\n([\s\S]*?)fi/);
    expect(notOpen).not.toBeNull();
    expect(notOpen[1]).toMatch(/nothing to evaluate/);
    expect(notOpen[1]).not.toMatch(/pr-merge -->/);
  });

  it('keeps exactly one <!-- pr-merge --> sentinel comment, never spamming', () => {
    expect(merge).toContain('\'<!-- pr-merge -->\'');
    expect(merge).toMatch(/select\(\.user\.login == "github-actions\[bot\]" and \(\(\.body \/\/ ""\) \| startswith\("<!-- pr-merge -->"\)\)\) \| \.id/);
    expect(merge).toMatch(/gh api -X PATCH "repos\/\$GH_REPO\/issues\/comments\/\$LAST_ID" --input -/);
    // Older duplicate sentinels are removed so exactly one remains.
    expect(merge).toContain('head -n -1');
    expect(merge).toMatch(/gh api -X DELETE "repos\/\$GH_REPO\/issues\/comments\/\$dup" >\/dev\/null \|\| true/);
    expect(merge).toMatch(/gh pr comment "\$PR_NUMBER" --repo "\$GH_REPO" --body-file "\$BODY_FILE"/);
  });

  it('treats a verdict-comment failure as a warning, not a failed check', () => {
    // The verdict is the check's real output. A token that lost comment
    // access (fork-PR read-only downgrade, comment restriction, locked PR)
    // must not turn a correct "blocked" verdict into a red check, which
    // would report a merge problem where none exists. Every reporting write
    // is therefore guarded and downgraded to a warning.
    expect(merge).toMatch(/gh api -X PATCH "repos\/\$GH_REPO\/issues\/comments\/\$LAST_ID" --input - >\/dev\/null; then/);
    expect(merge).toMatch(/elif ! gh pr comment "\$PR_NUMBER" --repo "\$GH_REPO" --body-file "\$BODY_FILE" >\/dev\/null; then/);
    expect(merge).toContain('::warning::Could not update the pr-merge verdict comment on PR #$PR_NUMBER.');
    expect(merge).toContain('::warning::Could not post the pr-merge verdict comment on PR #$PR_NUMBER.');
    // The sentinel listing is read-only, so a failure there must not abort
    // the verdict either.
    expect(merge).toMatch(/--jq '\.\[\] \| select\(\.user\.login == "github-actions\[bot\]"[^\n]*\)\) \| \.id'\)" \|\| true/);
    // ...but the guards cover reporting only: the tail must not blanket-exit
    // success. A recorded denial is not a failure — it ends the step with
    // the shell's default status 0 and the posted verdict comment as the
    // check's real output, while an unexpected failure still propagates via
    // set -e.
    const tail = merge.slice(merge.indexOf('echo "Decision: $DECISION${VERDICT:+ ($VERDICT)}"'));
    expect(tail).not.toMatch(/exit 0/);
  });

  it('dry_run evaluates and comments the verdict without merging', () => {
    expect(merge).toContain('DRY_RUN: ${{ github.event_name == \'workflow_dispatch\' && github.event.inputs.dry_run || false }}');
    expect(merge).toMatch(/elif \[ "\$DRY_RUN" = 'true' \]; then/);
    expect(merge).toMatch(/dry run: every requirement holds; would squash-merge/);
  });
});
