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
    expect(milestone).toMatch(/permissions:\n {6}contents: read\n {6}issues: write/);
  });

  it('serializes runs in a shared group so concurrent opens re-read counts', () => {
    // A per-issue group would let two near-simultaneous opens both read the
    // count before either writes; one shared group serializes assignment.
    expect(milestone).toMatch(/concurrency:\n {2}group: issue-milestone\n {2}cancel-in-progress: false/);
    expect(milestone).not.toMatch(/group: issue-milestone-/);
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
  });

  it('resolves closest as the lowest still-open version', () => {
    expect(milestone).toMatch(/map\(select\(\.state == "open"\)\) \| first \| \.title \/\/ empty/);
  });

  it('rolls over to the next patch once the target holds 30 or more issues', () => {
    expect(milestone).toMatch(/MILESTONE_LIMIT: 30/);
    expect(milestone).toMatch(/open_issues \+ \.closed_issues/);
    expect(milestone).toMatch(/-ge "\$MILESTONE_LIMIT"/);
    // Overflow bumps one patch segment, e.g. v0.5.3 -> v0.5.4.
    expect(milestone).toMatch(/\.\[2\] = \(\(\.\[2\] \| tonumber\) \+ 1 \| tostring\)/);
  });

  it('creates the next milestone on demand when it does not exist', () => {
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
