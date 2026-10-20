import { readFileSync } from 'fs';
import { resolve } from 'path';

const MILESTONE_PATH = resolve(process.cwd(), '.github/workflows/issue-milestone.yml');

describe('issue-milestone assigns closest [v*.*.*] milestone (#880)', () => {
  let milestone;

  beforeAll(() => {
    milestone = readFileSync(MILESTONE_PATH, 'utf-8');
  });

  it('triggers on every newly opened issue and on manual dispatch', () => {
    expect(milestone).toMatch(/^on:\n {2}issues:\n {4}types: \[opened\]\n {2}workflow_dispatch:/m);
  });

  it('grants issues: write and nothing more', () => {
    // Anchored to the following steps: key so extra scopes cannot slip in
    // after issues: write while still matching.
    expect(milestone).toMatch(/permissions:\n {6}contents: read\n {6}issues: write\n {4}steps:/);
  });

  it('serializes runs in a shared group so concurrent opens re-read counts', () => {
    // A per-issue group would let two near-simultaneous opens both read the
    // count before either writes; one shared group serializes assignment.
    expect(milestone).toMatch(/concurrency:\n {2}group: issue-milestone\n {2}cancel-in-progress: false/);
    expect(milestone).not.toMatch(/group: issue-milestone-/);
    // queue: max keeps every waiting run; the default single-slot queue
    // would drop issue events that arrive during a burst.
    expect(milestone).toMatch(/\n {2}queue: max\n/);
  });

  it('skips bot-created issues and issues that already have a milestone', () => {
    expect(milestone).toMatch(/ISSUE_USER_TYPE/);
    expect(milestone).toMatch(/\[ "\$ISSUE_USER_TYPE" = 'Bot' \]/);
    expect(milestone).toMatch(/\.milestone\.number \/\/ 0/);
    expect(milestone).toMatch(/already has milestone/);
  });

  it('filters milestone titles to strict v*.*.* and sorts them as semver', () => {
    // jq regex source in the workflow file (shell-escaped backslashes).
    expect(milestone).toContain('test("^v[0-9]+\\\\.[0-9]+\\\\.[0-9]+$")');
    expect(milestone).toContain('sort_by(.title | ltrimstr("v") | split(".") | map(tonumber))');
    // --slurp flattens paginated pages into one array before the jq queries.
    expect(milestone).toMatch(/gh api --paginate --slurp "repos\/\$GH_REPO\/milestones\?state=all&per_page=100"/);
    expect(milestone).toContain('[.[][] | select(');
  });

  it('resolves closest as the lowest still-open version', () => {
    expect(milestone).toMatch(/map\(select\(\.state == "open"\)\) \| first \| \.title \/\/ empty/);
  });

  it('rolls over to the next patch once the target holds 30 or more issues', () => {
    expect(milestone).toMatch(/MILESTONE_LIMIT: 30/);
    expect(milestone).toMatch(/open_issues \+ \.closed_issues/);
    expect(milestone).toMatch(/-ge "\$MILESTONE_LIMIT"/);
    // Overflow bumps one patch segment, e.g. v0.5.3 -> v0.5.4, and keeps
    // advancing while the next title is itself already full.
    expect(milestone).toMatch(/\.\[2\] = \(\(\.\[2\] \| tonumber\) \+ 1 \| tostring\)/);
    expect(milestone).toMatch(/while \[ "\$TOTAL" -ge "\$MILESTONE_LIMIT" \]; do/);
  });

  it('creates the next milestone on demand when it does not exist', () => {
    // Only open milestones are reused; a closed one with the same title is
    // reopened instead of being assigned to as-is.
    expect(milestone).toMatch(/select\(\.title == \$t and \.state == "open"\)/);
    expect(milestone).toMatch(/Reopening closed milestone/);
    expect(milestone).toMatch(/Creating milestone \$TITLE/);
    expect(milestone).toMatch(/gh api "repos\/\$GH_REPO\/milestones" -f title="\$TITLE" -f state=open --jq \.number/);
  });

  it('assigns the milestone number via PATCH to the issue', () => {
    expect(milestone).toMatch(/gh api -X PATCH "repos\/\$GH_REPO\/issues\/\$ISSUE_NUMBER" -F milestone="\$NUMBER"/);
  });

  it('reports failures only for manually dispatched runs', () => {
    expect(milestone).toMatch(/if: failure\(\) && github\.event_name == 'workflow_dispatch'/);
    expect(milestone).toMatch(/Issue milestone assignment failed/);
  });
});
