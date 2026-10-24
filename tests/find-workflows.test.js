import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const BUG_PATH = resolve(process.cwd(), '.github/workflows/bug-find.yml');
const FEATURE_PATH = resolve(process.cwd(), '.github/workflows/feature-find.yml');
const OLD_PATH = resolve(process.cwd(), '.github/workflows/issue-find.yml');

describe('bug-find/feature-find split (#921)', () => {
  let bug;
  let feature;

  beforeAll(() => {
    bug = readFileSync(BUG_PATH, 'utf-8');
    feature = readFileSync(FEATURE_PATH, 'utf-8');
  });

  it('replaces issue-find.yml with bug-find.yml and feature-find.yml', () => {
    expect(existsSync(OLD_PATH)).toBe(false);
    expect(bug).toMatch(/^name: bug-find$/m);
    expect(feature).toMatch(/^name: feature-find$/m);
  });

  it('keeps markers and state dirs independent with one shared concurrency group', () => {
    expect(bug).toMatch(/MARKER='<!-- bug-find -->'/);
    expect(bug).toMatch(/MARKER: '<!-- bug-find -->'/);
    expect(bug).toContain('$RUNNER_TEMP/bug-find');
    expect(bug).toContain('${{ runner.temp }}/bug-find');
    expect(bug).not.toMatch(/feature-find/);
    expect(bug).toMatch(/LEGACY_MARKER='<!-- issue-find -->'/);
    expect(bug).not.toMatch(/group: issue-find/);
    expect(bug).not.toMatch(/RUNNER_TEMP\/issue-find/);

    expect(feature).toMatch(/MARKER='<!-- feature-find -->'/);
    expect(feature).toMatch(/MARKER: '<!-- feature-find -->'/);
    expect(feature).toContain('$RUNNER_TEMP/feature-find');
    expect(feature).toContain('${{ runner.temp }}/feature-find');
    expect(feature).not.toMatch(/issue-find|bug-find/);

    // Both find jobs share one group (they refill the same open-issue target)
    // and queue every pending run instead of letting a burst replace it.
    [bug, feature].forEach((wf) => {
      expect(wf).toMatch(/concurrency:\n {6}group: find-issues\n {6}cancel-in-progress: false\n {6}queue: max/);
    });
  });

  it('offsets the schedules and serializes both find jobs through the shared group', () => {
    expect(bug).toMatch(/cron: '17 \*\/6 \* \* \*'/);
    expect(feature).toMatch(/cron: '47 \*\/6 \* \* \*'/);
    expect(bug).toMatch(/group: find-issues/);
    expect(feature).toMatch(/group: find-issues/);
  });

  it('preserves the inputs and issues trigger in both workflows', () => {
    [bug, feature].forEach((wf) => {
      expect(wf).toMatch(/types: \[closed, deleted, transferred\]/);
      expect(wf).toMatch(/target_count:/);
      expect(wf).toMatch(/max_new:/);
      expect(wf).toMatch(/dry_run:/);
      // Manual-dispatch values must be read from the event, not hardcoded.
      expect(wf).toMatch(/INPUT_TARGET: \$\{\{ github\.event\.inputs\.target_count \}\}/);
      expect(wf).toMatch(/INPUT_MAX_NEW: \$\{\{ github\.event\.inputs\.max_new \}\}/);
      expect(wf).toMatch(/DRY_RUN: \$\{\{ github\.event\.inputs\.dry_run \|\| 'false' \}\}/);
    });
  });

  it('scopes the feature-find prompt to feature gaps, not bugs', () => {
    expect(feature).toContain('missing features, feature gaps, and unimplemented ideas');
    expect(feature).toContain('Feature suggestions only');
    expect(feature).not.toMatch(/Find REAL bugs or clear gaps/);
    expect(feature).toContain('"labels": ["enhancement"]');
    expect(bug).toContain('Find REAL bugs or clear gaps');
    expect(bug).toContain('"labels": ["bug"]');
  });

  it('gives the feature-find validator enhancement and feature fallback labels', () => {
    expect(feature).toMatch(/FALLBACK_LABELS = \{[^}]*'enhancement'[^}]*'feature'[^}]*\}/);
    expect(feature).toMatch(/re\.sub\(r'feature-find', 'feature find'/);
    expect(bug).toMatch(/re\.sub\(r'bug-find', 'bug find'/);
  });

  it('keeps the evidence contract and title dedupe in both validators', () => {
    [bug, feature].forEach((wf) => {
      expect(wf).toContain('HEAD:{path}');
      expect(wf).toContain('SIM = 0.6');
      expect(wf).toContain('existing-titles.json');
    });
  });

  it('keeps every safety rail identical in both workflows', () => {
    [bug, feature].forEach((wf) => {
      expect(wf).toMatch(/persist-credentials: false/);
      expect(wf).toMatch(/"git \*": "deny"/);
      expect(wf).toMatch(/"date -u": "allow"/);
      expect(wf).not.toMatch(/"date(?: \*|)": "allow"/);
      expect(wf).toMatch(/"gh \*": "deny"/);
      expect(wf).toMatch(/timeout-minutes: 60/);
      expect(wf).toMatch(/job-timeout-minutes: \[75\]/);
      expect(wf).toMatch(/continue-on-error: true/);
      // The agent step must stay token-free; GH_PAT only in the create step.
      const agentSection = wf.match(/- name: Find (?:issues|features) with OpenCode[\s\S]*?- name: Validate proposed issues/);
      expect(agentSection).not.toBeNull();
      expect(agentSection[0]).not.toMatch(/GH_TOKEN:|GH_PAT:/);
      const patSections = wf.match(/secrets\.GH_PAT/g) || [];
      expect(patSections.length).toBe(1);
      expect(wf).toContain('GH_PAT secret is not set');
    });
  });
});
