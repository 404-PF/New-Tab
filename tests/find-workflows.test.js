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

  it('keeps markers, concurrency groups, and state dirs independent', () => {
    expect(bug).toMatch(/MARKER='<!-- bug-find -->'/);
    expect(bug).toMatch(/MARKER: '<!-- bug-find -->'/);
    expect(bug).toMatch(/group: bug-find/);
    expect(bug).toContain('$RUNNER_TEMP/bug-find');
    expect(bug).toContain('${{ runner.temp }}/bug-find');
    expect(bug).not.toMatch(/issue-find|feature-find/);

    expect(feature).toMatch(/MARKER='<!-- feature-find -->'/);
    expect(feature).toMatch(/MARKER: '<!-- feature-find -->'/);
    expect(feature).toMatch(/group: feature-find/);
    expect(feature).toContain('$RUNNER_TEMP/feature-find');
    expect(feature).toContain('${{ runner.temp }}/feature-find');
    expect(feature).not.toMatch(/issue-find|bug-find/);
  });

  it('offsets the schedules so runs never overlap', () => {
    expect(bug).toMatch(/cron: '17 \*\/6 \* \* \*'/);
    expect(feature).toMatch(/cron: '47 \*\/6 \* \* \*'/);
  });

  it('preserves the inputs and issues trigger in both workflows', () => {
    [bug, feature].forEach((wf) => {
      expect(wf).toMatch(/types: \[closed, deleted, transferred\]/);
      expect(wf).toMatch(/target_count:/);
      expect(wf).toMatch(/max_new:/);
      expect(wf).toMatch(/dry_run:/);
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
