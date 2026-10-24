import { readFileSync } from 'fs';
import { resolve } from 'path';

const MERGE_PATH = resolve(process.cwd(), '.github/workflows/pr-merge.yml');

describe('pr-merge auto-merges fully-satisfied PRs (#920)', () => {
  let merge;

  beforeAll(() => {
    merge = readFileSync(MERGE_PATH, 'utf-8');
  });

  it('triggers on PR lifecycle, review, check, CI completion, and dispatch events', () => {
    expect(merge).toMatch(/^on:\n {2}pull_request:\n {4}types: \[opened, synchronize, reopened, ready_for_review, labeled, unlabeled\]\n {2}pull_request_review:\n {4}types: \[submitted, edited, dismissed\]/m);
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
    expect(jobIf[1]).toMatch(/github\.event_name == 'pull_request_review'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'check_run'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'check_suite'/);
    expect(jobIf[1]).toMatch(/github\.event_name == 'workflow_run'/);
    expect(jobIf[1]).toContain('github.event.pull_request.base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.check_run.pull_requests[0].base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.check_suite.pull_requests[0].base.ref == \'main\'');
    expect(jobIf[1]).toContain('github.event.workflow_run.pull_requests[0].base.ref == \'main\'');
  });

  it('serializes evaluations per PR with cancel-in-progress', () => {
    expect(merge).toMatch(/concurrency:\n {2}group: >-\n {4}\$\{\{ github\.event_name == 'workflow_dispatch'/);
    expect(merge).toContain('format(\'pr-merge-{0}\', github.event.inputs.pr_number)');
    expect(merge).toContain('github.event.pull_request.number');
    expect(merge).toContain('github.event.check_run.pull_requests[0].number');
    expect(merge).toContain('github.event.check_suite.pull_requests[0].number');
    expect(merge).toContain('github.event.workflow_run.pull_requests[0].number');
    expect(merge).toMatch(/cancel-in-progress: true/);
  });

  it('pins narrow permissions and never uses GH_PAT', () => {
    // Anchored to the closing blank line so an extra scope cannot slip in
    // after actions: read while still matching.
    expect(merge).toMatch(/permissions:\n {6}contents: write\n {6}pull-requests: write\n {6}checks: read\n {6}statuses: read\n {6}actions: read\n/);
    expect(merge).not.toMatch(/GH_PAT/);
    expect(merge).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
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
    expect(merge).toContain('any(.workflow_runs[]?; any(.pull_requests[]?; .number == $n))');
    expect(merge).toContain('could not list pr-drive runs');
  });

  it('requires mergeable != false and lowercase mergeable_state == clean, with retries', () => {
    // mergeable/mergeable_state are computed asynchronously; poll briefly.
    // The REST API reports lowercase values (clean, dirty, unknown).
    expect(merge).toMatch(/for attempt in 1 2 3; do/);
    expect(merge).toMatch(/sleep 5/);
    expect(merge).toMatch(/if \[ "\$MERGEABLE" = 'false' \] \|\| \[ "\$MERGE_STATE" = 'dirty' \]; then/);
    expect(merge).toMatch(/\[ "\$MERGE_STATE" != 'clean' \]/);
    expect(merge).not.toMatch(/'CLEAN'|'DIRTY'/);
  });

  it('requires every check run on the head SHA terminal and successful, excluding itself', () => {
    expect(merge).toContain('/commits/$HEAD_SHA/check-runs');
    expect(merge).toMatch(/\$2 != "completed" \|\| \(\$3 != "success" && \$3 != "neutral" && \$3 != "skipped"\)/);
    // This workflow's own check is in_progress while evaluating; the name
    // prefix exclusion keeps it from blocking every evaluation forever.
    expect(merge).toContain('startswith(env.WORKFLOW_NAME) | not');
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
    // head SHA, and labels are re-checked so a change during evaluation
    // aborts instead of merging an unverified commit.
    expect(merge).toContain('FINAL_JSON="$(gh api "repos/$GH_REPO/pulls/$PR_NUMBER")"');
    expect(merge).toContain('[ "$FINAL_STATE" != \'open\' ]');
    expect(merge).toContain('[ "$FINAL_DRAFT" = \'true\' ]');
    expect(merge).toContain('[ "$FINAL_BASE" != \'main\' ]');
    expect(merge).toContain('[ "$FINAL_HEAD" != "$HEAD_SHA" ]');
    expect(merge).toContain('PR state changed during evaluation; merge aborted');
    expect(merge).toContain('a blocking label was added during evaluation; merge aborted');
    expect(merge).toContain('expectedHeadOid mismatch or permissions');
  });

  it('deletes the branch after a successful merge via the git refs endpoint', () => {
    expect(merge).toMatch(/gh api -X DELETE "repos\/\$GH_REPO\/git\/refs\/heads\/\$HEAD_REF"/);
    expect(merge).toMatch(/Merged, but could not delete branch/);
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

  it('dry_run evaluates and comments the verdict without merging', () => {
    expect(merge).toContain('DRY_RUN: ${{ github.event_name == \'workflow_dispatch\' && github.event.inputs.dry_run || false }}');
    expect(merge).toMatch(/elif \[ "\$DRY_RUN" = 'true' \]; then/);
    expect(merge).toMatch(/dry run: every requirement holds; would squash-merge/);
  });
});
