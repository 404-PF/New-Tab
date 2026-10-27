import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const BUG_PATH = resolve(process.cwd(), '.github/workflows/bug-find.yml');
const FEATURE_PATH = resolve(process.cwd(), '.github/workflows/feature-find.yml');
const OLD_PATH = resolve(process.cwd(), '.github/workflows/issue-find.yml');

function readOpenCodePermission(wf) {
  const lines = wf.split('\n');
  const keyIndex = lines.findIndex((line) => /^\s*OPENCODE_PERMISSION: >-/.test(line));
  if (keyIndex === -1) {
    throw new Error('OPENCODE_PERMISSION block not found');
  }
  const keyIndent = lines[keyIndex].search(/\S/);
  const block = [];
  for (let i = keyIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== '' && line.search(/\S/) <= keyIndent) {
      break;
    }
    block.push(line.trim());
  }
  return JSON.parse(block.join('\n'));
}

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
    expect(bug).not.toMatch(/(?:RUNNER_TEMP\/issue-find|runner\.temp \}\}\/issue-find)/);

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
      // Subagents hung the agent step until its timeout (bug-find runs on
      // 2026-10-25); the agent must work alone.
      const permission = readOpenCodePermission(wf);
      expect(permission.task).toBe('deny');
      expect(wf).toContain('do NOT use the task tool or spawn subagents');
      expect(wf).toMatch(/timeout-minutes: 60/);
      expect(wf).toMatch(/job-timeout-minutes: \[75\]/);
      expect(wf).toMatch(/continue-on-error: true/);
      // OpenCode installs only from the reviewed lockfile: exact versions,
      // every tarball integrity-verified by npm ci, lifecycle scripts off.
      expect(wf).toMatch(/npm ci --ignore-scripts/);
      expect(wf).toContain('.github/opencode/package-lock.json');
      expect(wf).not.toMatch(/npm install -g opencode-ai/);
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

describe('find-workflows refill after mass-close (#1015)', () => {
  let bug;
  let feature;

  beforeAll(() => {
    bug = readFileSync(BUG_PATH, 'utf-8');
    feature = readFileSync(FEATURE_PATH, 'utf-8');
  });

  it('shortens the gate cooldown from 6h to 2h in both workflows', () => {
    [bug, feature].forEach((wf) => {
      expect(wf).toMatch(/COOLDOWN_SECONDS=\$\(\( 2 \* 3600 \)\)/);
      expect(wf).not.toMatch(/COOLDOWN_SECONDS=\$\(\( 6 \* 3600 \)\)/);
      // Manual dispatch still bypasses the cooldown.
      expect(wf).toMatch(/if \[ "\$EVENT_NAME" != 'workflow_dispatch' \]; then/);
    });
    // The legacy-marker counting that guards the first post-rename run stays.
    expect(bug).toMatch(/LEGACY_MARKER='<!-- issue-find -->'/);
  });

  it('recounts the open pool under the concurrency slot before the agent', () => {
    [bug, feature].forEach((wf) => {
      const recountToAgent = wf.match(
        /- name: Recount open issues before starting the agent[\s\S]*?- name: (?:Find issues|Find features) with OpenCode/
      );
      expect(recountToAgent).not.toBeNull();
      expect(recountToAgent[0]).toMatch(/id: recount/);
      expect(recountToAgent[0]).toContain('issues(states: OPEN) { totalCount }');
      expect(recountToAgent[0]).toMatch(/if \[ "\$CURRENT" -ge "\$TARGET" \]; then/);
      expect(recountToAgent[0]).toMatch(/echo 'skip=true' >> "\$GITHUB_OUTPUT"/);
      // The recount recomputes to_file from the fresh count (same caps as the
      // gate) and exports it so the agent prompt and validator cap are not the
      // stale gate-time value.
      expect(recountToAgent[0]).toMatch(/TO_FILE=\$\(\( TARGET - CURRENT \)\)/);
      expect(recountToAgent[0]).toMatch(/echo "TO_FILE=\$TO_FILE" >> "\$GITHUB_ENV"/);
      expect(wf).toMatch(/max_new: \$\{\{ steps\.plan\.outputs\.max_new \}\}/);
      // The agent must not run when the queue waited out a closure burst;
      // that was the "Accepted N ... Created 0" waste path. Assert the
      // executable if, not comment wording or indentation.
      expect(wf).toMatch(/id: agent\n(?: *#[^\n]*\n)* *if: steps\.recount\.outputs\.skip != 'true'/);
    });
  });

  it('keeps the create-step per-creation recount as defense in depth (#1015)', () => {
    [bug, feature].forEach((wf) => {
      const createStep = wf.match(/- name: Create issues[\s\S]*?- name: Report agent failure/);
      expect(createStep).not.toBeNull();
      expect(createStep[0]).toContain('issues(states: OPEN) { totalCount }');
      expect(createStep[0]).toMatch(/if \[ "\$CURRENT" -ge "\$TARGET" \]; then[\s\S]*?break/);
    });
  });
});
