import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

const WORKFLOW_PATH = resolve(process.cwd(), '.github/workflows/issue-implement.yml');
const DRIVE_PATH = resolve(process.cwd(), '.github/workflows/pr-drive.yml');

// The naming rule is bash, so behavioral tests execute the extracted block.
// The rule avoids bash-4-only constructs (e.g. ${var,,}), so it runs under
// macOS's default bash 3.2; Windows contributors still get the structural
// suite below, and CI re-runs the behavioral one on Linux.
const CAN_RUN_BASH = process.platform !== 'win32';

const workflow = readFileSync(WORKFLOW_PATH, 'utf-8');

function extractNamingRule() {
  const match = workflow.match(/# --- BEGIN naming rule ---[\s\S]*?# --- END naming rule ---/);
  if (!match) {
    throw new Error('naming rule block not found in issue-implement.yml');
  }
  return match[0];
}

function derive({ title, labels = '', files = [], issueNumber = 966 }) {
  const script = [
    'set -euo pipefail',
    extractNamingRule(),
    'echo "TYPE=$TYPE"; echo "SCOPE=$SCOPE"; echo "SUBJECT=$SUBJECT"; echo "SLUG=$SLUG"',
  ].join('\n');
  const output = execFileSync('bash', ['-c', script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      TITLE: title,
      LABELS: labels,
      STAGED_FILES: files.join('\n'),
      ISSUE_NUMBER: String(issueNumber),
    },
  });
  const parsed = {};
  for (const line of output.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      parsed[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return parsed;
}

describe('issue-implement derives one bounded Conventional Commits name (#966)', () => {
  it('stages first, then feeds a single SUBJECT into both the commit and the PR title', () => {
    // The staged diff drives the naming rule, so git add must run before it.
    const addIdx = workflow.indexOf('git add -A -- . \':(exclude).tmp\'');
    const stagedIdx = workflow.indexOf('STAGED_FILES="$(git diff --cached --name-only)"');
    expect(addIdx).toBeGreaterThan(-1);
    expect(stagedIdx).toBeGreaterThan(addIdx);

    // Single source of truth: the same $SUBJECT variable feeds the commit
    // subject and `gh pr create --title`; no duplicated format string.
    expect(workflow).toMatch(/commit -m "\$SUBJECT" -m "Fixes #\$ISSUE_NUMBER"/);
    expect(workflow).toMatch(/--title "\$SUBJECT" \\/);
    expect(workflow).not.toMatch(/implement #\$ISSUE_NUMBER/);
    expect(workflow).not.toMatch(/\$PREFIX/);
    expect(workflow).not.toMatch(/commit -m "\$[A-Z_]+[^"]*#\$ISSUE_NUMBER/);
  });

  it('keeps Fixes #issue in the body and the Opened comment unchanged', () => {
    expect(workflow).toMatch(/commit -m "\$SUBJECT" -m "Fixes #\$ISSUE_NUMBER"/);
    expect(workflow).toContain('echo "Fixes #$ISSUE_NUMBER"');
    expect(workflow).toContain('"Opened $PR_URL for this issue (lint: $LINT_OUTCOME, tests: $TEST_OUTCOME)."');
  });

  it('keeps the branch format type/N-slug, the collision suffix, and the 40-char slug', () => {
    expect(workflow).toMatch(/BRANCH="\$TYPE\/\$ISSUE_NUMBER-\$SLUG"/);
    expect(workflow).toMatch(/BRANCH="\$BRANCH-r\$GITHUB_RUN_ID"/);
    const naming = extractNamingRule();
    expect(naming).toMatch(/cut -c1-40/);
    expect(naming).toMatch(/SLUG="issue-\$ISSUE_NUMBER"/);
  });

  it('hard-caps the subject at 72 chars with a word-boundary trim inside the naming rule', () => {
    const naming = extractNamingRule();
    expect(naming).toMatch(/\[ "\$\{#SUBJECT\}" -gt 72 \]/);
    expect(naming).toMatch(/SUBJECT="\$\{SUBJECT:0:72\}"/);
    expect(naming).toMatch(/s\/ \[\^ \]\*\$\//);
    expect(naming).toMatch(/s\/\[\^A-Za-z0-9\)\]\+\$\//);
  });

  it('keeps the naming rule runnable under macOS bash 3.2', () => {
    // ${var,,} is bash 4+; the behavioral suite runs on contributor machines.
    const naming = extractNamingRule();
    expect(naming).not.toMatch(/\$\{[^}]*,,/);
  });
});

describe.skipIf(!CAN_RUN_BASH)('issue-implement naming rule behavior (#966)', () => {
  it('caps a 162-char title at 72 chars on a word boundary and keeps the 40-char slug', () => {
    const longTitle = 'fix(settings): correct the interaction between the search-history dropdown, the background rotation timer, and the focus-mode pomodoro sync for long lists (#933)';
    expect(longTitle.length).toBeGreaterThanOrEqual(150);

    const result = derive({ title: longTitle, files: ['src/ui/settings.js'] });
    expect(result.TYPE).toBe('fix');
    expect(result.SCOPE).toBe('settings');
    expect(result.SUBJECT.length).toBeLessThanOrEqual(72);
    expect(result.SUBJECT.startsWith('fix(settings): ')).toBe(true);
    // Word boundary: ends on a full word, no dangling partial word or punctuation.
    expect(result.SUBJECT).toMatch(/[A-Za-z0-9)]$/);
    expect(result.SUBJECT).not.toMatch(/ {2}/);
    expect(result.SUBJECT).not.toMatch(/\(#[0-9]/);
    // 40-char branch slug behavior is unchanged.
    expect(result.SLUG.length).toBeLessThanOrEqual(40);
    expect(result.SLUG).not.toMatch(/-$/);
  });

  it('reuses an existing perf(startup): prefix without doubling it', () => {
    const result = derive({
      title: 'perf(startup): color/font pickers block first paint',
      files: ['src/core/font-picker.js', 'src/ui/font-picker.js'],
    });
    expect(result.TYPE).toBe('perf');
    expect(result.SCOPE).toBe('startup');
    expect(result.SUBJECT).toBe('perf(startup): color/font pickers block first paint');
  });

  it('derives the type from the staged diff instead of guessing from labels', () => {
    expect(derive({ title: 'cover drag-drop edge cases', files: ['tests/drag-drop.test.js'] }).SUBJECT)
      .toBe('test: cover drag-drop edge cases');
    expect(derive({ title: 'tighten the merge gate', files: ['.github/workflows/pr-merge.yml'] }).SUBJECT)
      .toBe('ci: tighten the merge gate');
    expect(derive({ title: 'refresh the store listing copy', files: ['docs/store/listing.md'] }).SUBJECT)
      .toBe('docs: refresh the store listing copy');
    // src/** wins over tests/**, and title keywords pick the type.
    const mixed = derive({ title: 'fix the settings layout glitch', files: ['tests/settings.test.js', 'src/ui/settings.js'] });
    expect(mixed.TYPE).toBe('fix');
    expect(mixed.SCOPE).toBe('ui');
    // src/** with no keyword and no labels keeps the legacy fix default.
    expect(derive({ title: 'polish internal comments', files: ['src/core/utils.js'] }).TYPE).toBe('fix');
    // src/** with no keyword falls back through the full label mapping,
    // not just enhancement/feature, before the fix default.
    expect(derive({ title: 'polish internal comments', files: ['src/core/utils.js'], labels: 'performance' }).TYPE).toBe('perf');
    expect(derive({ title: 'polish internal comments', files: ['src/core/utils.js'], labels: 'refactor' }).TYPE).toBe('refactor');
    expect(derive({ title: 'polish internal comments', files: ['src/core/utils.js'], labels: 'documentation' }).TYPE).toBe('docs');
    // src/** keyword heuristics: feat and perf are recognized too.
    expect(derive({ title: 'add offline fallback for weather', files: ['src/features/weather/app.js'] }).SUBJECT)
      .toBe('feat(weather): add offline fallback for weather');
    expect(derive({ title: 'optimize boot with lazy locale load', files: ['src/core/languages.js'] }).TYPE)
      .toBe('perf');
  });

  it('uses labels only when the diff is ambiguous, and never forces everything to fix', () => {
    const ambiguous = { title: 'Polish the settings layout', files: ['README.md'] };
    expect(derive({ ...ambiguous, labels: 'enhancement' }).SUBJECT).toBe('feat: Polish the settings layout');
    expect(derive({ ...ambiguous, labels: 'refactor' }).SUBJECT).toBe('refactor: Polish the settings layout');
    expect(derive({ ...ambiguous, labels: 'maintenance' }).SUBJECT).toBe('chore: Polish the settings layout');
    expect(derive({ ...ambiguous, labels: 'documentation' }).SUBJECT).toBe('docs: Polish the settings layout');
    expect(derive({ ...ambiguous, labels: 'tests' }).SUBJECT).toBe('test: Polish the settings layout');
    // Unlabeled and ambiguous no longer degrades to fix.
    expect(derive(ambiguous).SUBJECT).toBe('chore: Polish the settings layout');
  });

  it('normalizes legacy tags, trailing refs, backticks, quotes, dashes, and emoji', () => {
    const bug = derive({ title: '[Bug] crash when opening the `games` app (#625)', files: ['src/features/games/app.js'] });
    expect(bug.SUBJECT).toBe('fix(games): crash when opening the games app');

    const security = derive({ title: '[Security] "token" leak — fix storage', files: ['src/core/storage.js'] });
    expect(security.SUBJECT).toBe('fix(core): token leak fix storage');

    const emoji = derive({ title: '🚀 speed up boot🐛', files: ['src/core/bootstrap.js'] });
    expect(emoji.SUBJECT).toBe('fix(core): speed up boot');

    // A bare trailing #N reference is stripped too, not just (#N).
    const bare = derive({ title: 'Polish the settings layout #966', files: ['src/ui/settings.js'] });
    expect(bare.SUBJECT).toBe('fix(ui): Polish the settings layout');

    // A punctuation-only title still yields a valid slug fallback.
    expect(derive({ title: '!!!', files: [], issueNumber: 42 }).SLUG).toBe('issue-42');
  });

  it('reuses a capitalized or unspaced type prefix without doubling it', () => {
    expect(derive({ title: 'Feat: add dark mode', files: ['src/ui/theme.js'] }).SUBJECT)
      .toBe('feat(ui): add dark mode');
    expect(derive({ title: 'Fix(ui):resolve layout glitch', files: ['src/ui/settings.js'] }).SUBJECT)
      .toBe('fix(ui): resolve layout glitch');
  });

  it('keeps the type(scope): prefix when the first word alone overflows the cap', () => {
    const result = derive({ title: `fix(ui): ${'a'.repeat(100)}`, files: [] });
    expect(result.SUBJECT.startsWith('fix(ui): ')).toBe(true);
    expect(result.SUBJECT.length).toBe(72);
    expect(result.SUBJECT).toMatch(/^fix\(ui\): a+$/);
  });

  it('never doubles the prefix for any backfilled title shape', () => {
    const titles = [
      'fix(settings): correct the interaction between the search-history dropdown, the background rotation timer, and the focus-mode pomododo sync for long lists',
      'perf(startup): color/font pickers block first paint',
      'Polish the settings layout',
      '[Bug] crash when opening the games app',
    ];
    for (const title of titles) {
      const { SUBJECT: subject } = derive({ title, files: ['src/ui/settings.js'] });
      expect(subject.length).toBeLessThanOrEqual(72);
      const prefixes = subject.match(/\b(feat|fix|perf|refactor|docs|test|chore|ci|build|style|revert)\b/g) || [];
      expect(prefixes.length).toBeLessThanOrEqual(1);
      expect(subject).toMatch(/^(feat|fix|perf|refactor|docs|test|chore|ci|build|style|revert)(\([a-z0-9-]+\))?: /);
    }
  });
});

describe('issue-implement commits as the PAT owner (#1113)', () => {
  // Branch commits authored as github-actions[bot] while pr-merge squashes
  // as the GH_PAT owner make GitHub append a
  // Co-authored-by: github-actions[bot] trailer to the squash commit on
  // main. Aligning the commit identity with the PAT owner — the same
  // derivation pr-drive already uses — removes the mismatch.
  const identityLines = [
    'USER_JSON="$(GH_TOKEN="$GH_PAT" gh api user)"',
    'LOGIN="$(jq -r .login <<<"$USER_JSON")"',
    'UID_NUM="$(jq -r .id <<<"$USER_JSON")"',
    'EMAIL="$(jq -r \'.email // empty\' <<<"$USER_JSON")"',
    '[ -n "$EMAIL" ] || EMAIL="${UID_NUM}+${LOGIN}@users.noreply.github.com"',
    'NAME="$(jq -r \'.name // empty\' <<<"$USER_JSON")"',
    '[ -n "$NAME" ] || NAME="$LOGIN"',
    'git config user.name "$NAME"',
    'git config user.email "$EMAIL"',
  ];

  it('derives the git identity from gh api user instead of hardcoding the bot', () => {
    expect(workflow).not.toMatch(/git config user\.name 'github-actions\[bot\]'/);
    expect(workflow).not.toMatch(/git config user\.email '41898282\+github-actions\[bot\]@users\.noreply\.github\.com'/);
    for (const line of identityLines) {
      expect(workflow).toContain(line);
    }
  });

  it('retries the identity lookup and falls back to the bot identity so a failed lookup cannot abort the run', () => {
    // A transient gh api failure must not stop the run before the PR
    // opens: retry, then fall back to the static bot identity. pr-merge
    // supplies the squash message verbatim, so the fallback author
    // mismatch still yields no Co-authored-by trailer on main.
    expect(workflow).toContain('for _attempt in 1 2 3; do');
    expect(workflow).toContain('USER_JSON="$(GH_TOKEN="$GH_PAT" gh api user)" && break');
    expect(workflow).toContain('sleep 5');
    expect(workflow).toMatch(
      /if \[ -z "\$LOGIN" \] \|\| \[ "\$LOGIN" = 'null' \]; then\s+NAME='github-actions\[bot\]'\s+EMAIL='41898282\+github-actions\[bot\]@users\.noreply\.github\.com'\s+fi/,
    );
    const configIdx = workflow.indexOf('git config user.name "$NAME"');
    expect(configIdx).toBeGreaterThan(workflow.indexOf('if [ -z "$LOGIN" ]'));
  });

  it('mirrors the identity-derivation lines in pr-drive exactly', () => {
    // Same fallbacks (public email, else id+login noreply; name, else
    // login) so both PAT-authored commits share one identity regardless of
    // the account profile state.
    const drive = readFileSync(DRIVE_PATH, 'utf-8');
    for (const line of identityLines) {
      expect(drive).toContain(line);
    }
  });

  it('looks up the identity only after the GH_PAT hard-error guarantees the token', () => {
    const patErrorIdx = workflow.indexOf('GH_PAT secret is not set');
    const identityIdx = workflow.indexOf('gh api user');
    expect(patErrorIdx).toBeGreaterThan(-1);
    expect(identityIdx).toBeGreaterThan(patErrorIdx);
    // The token stays a plain shell variable (export -n); gh receives it
    // only through the one-call env prefix above.
    expect(workflow).toContain('export -n GH_PAT');
  });
});
