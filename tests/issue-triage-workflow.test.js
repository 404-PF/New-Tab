import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const TRIAGE_PATH = resolve(process.cwd(), '.github/workflows/issue-triage.yml');

// The disposition rule is bash, so behavioral tests execute the extracted
// block. It avoids bash-4-only constructs, so it also runs under macOS's
// default bash 3.2; Windows contributors still get the structural suite,
// and CI re-runs the behavioral one on Linux.
const CAN_RUN_BASH = process.platform !== 'win32';

const workflow = readFileSync(TRIAGE_PATH, 'utf-8');

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

function extractDispositionRule(wf) {
  const match = wf.match(/# --- BEGIN disposition rule ---[\s\S]*?# --- END disposition rule ---/);
  if (!match) {
    throw new Error('disposition rule block not found in issue-triage.yml');
  }
  return match[0];
}

describe('issue-triage verifies claims and disposes via #1026', () => {
  it('keeps the three triggers and adds a workflow_dispatch dispose input', () => {
    expect(workflow).toMatch(/^on:\n {2}issues:\n {4}types: \[opened\]\n {2}issue_comment:\n {4}types: \[created\]\n {2}workflow_dispatch:\n {4}inputs:/m);
    expect(workflow).toMatch(/dispose:\n {8}description: 'Honor close:\*\/needs-info dispositions from the triage draft'\n {8}required: false\n {8}type: boolean\n {8}default: false/);
  });

  it('replaces Repro / Evidence with a Verification section that demands real checks', () => {
    expect(workflow).not.toMatch(/Repro \/ Evidence/);
    expect(workflow).toContain('### Verification');
    expect(workflow).toContain('Status: verified | not-reproducible | by-inspection-only | not-applicable');
    expect(workflow).toContain('claim checked -> command or file inspected -> result');
    expect(workflow).toContain('Every Verification claim must name the concrete check performed');
    expect(workflow).toContain('never restate the issue text as evidence');
  });

  it('keeps the honest about-inspection and manual-steps rules', () => {
    expect(workflow).toContain('by-inspection-only is the honest Status');
    expect(workflow).toContain('never imply you launched the extension');
    expect(workflow).toContain('clearly marked as manual');
    expect(workflow).toContain('the full suite may not fit the generation timeout');
    expect(workflow).toContain('npx vitest run tests/<file>.test.js');
  });

  it('renders Disposition as the final comment section with a strict ACTION allowlist', () => {
    const formatIdx = workflow.indexOf('Comment format (GitHub-flavored Markdown');
    const questionsIdx = workflow.indexOf('### Open questions / Risks', formatIdx);
    const dispositionIdx = workflow.indexOf('\n          ### Disposition\n', questionsIdx);
    const rulesIdx = workflow.indexOf('\n          Rules:\n', dispositionIdx);
    expect(formatIdx).toBeGreaterThan(-1);
    expect(questionsIdx).toBeGreaterThan(formatIdx);
    expect(dispositionIdx).toBeGreaterThan(questionsIdx);
    expect(rulesIdx).toBeGreaterThan(dispositionIdx);
    expect(workflow).toContain('ACTION: none | close:duplicate | close:already-fixed | close:invalid | close:not-planned | needs-info | keep-open');
    expect(workflow).toContain('the workflow executes the Disposition after posting');
    // The downstream marker contract (issue-implement.yml selects on it) and
    // the prompt's marker-as-first-line requirement stay intact.
    expect(workflow).toContain('marker verbatim as the first line');
    expect(workflow).toContain('<!-- issue-triage -->\n          ## Triage');
  });

  it('widens OPENCODE_PERMISSION to read-only verification commands only', () => {
    const perm = readOpenCodePermission(workflow);
    expect(perm.edit).toBe('deny');
    expect(perm.webfetch).toBe('deny');
    expect(perm.external_directory).toBe('deny');
    // Deny-first: the wildcard deny must be the first bash entry so writes,
    // network, and mutating gh stay blocked behind explicit allows.
    expect(Object.keys(perm.bash)[0]).toBe('*');
    expect(perm.bash['*']).toBe('deny');
    expect(perm.bash['gh issue *']).toBe('deny');
    expect(perm.bash['gh label *']).toBe('deny');
    const readOnly = [
      'grep *', 'rg *', 'ls *', 'cat *', 'head *', 'tail *', 'wc *', 'find *',
      'git log *', 'git blame *', 'git grep *', 'git show *', 'git diff *',
      'node --version', 'npm test', 'npx vitest run *',
    ];
    readOnly.forEach((key) => {
      expect(perm.bash[key]).toBe('allow');
    });
    // Every allow is one of the sanctioned read-only patterns (the gh allows
    // stay the pre-existing read/single-comment paths, with ${{ }} templated
    // issue numbers normalized out), so no write or network command can slip in.
    const allowedShape = /^(?:gh issue view N --json title,body,labels,comments|gh issue comment N --body-file \*|gh label list \*|(?:grep|rg|ls|cat|head|tail|wc|find) \*|git (?:log|blame|grep|show|diff) \*|node --version|npm test|npx vitest run \*)$/;
    Object.entries(perm.bash)
      .filter(([, verdict]) => verdict === 'allow')
      .map(([command]) => command.replace(/\$\{\{[^}]*\}\}/g, 'N'))
      .forEach((command) => {
        expect(command).toMatch(allowedShape);
      });
    // bash must stay present: the free-tier gate rejects tool arrays without it.
    expect(workflow).toContain('free-tier gate rejects requests whose tools array lacks');
  });

  it('keeps generation credential-free', () => {
    const generate = workflow.match(/- name: Generate triage draft with OpenCode[\s\S]*?- name: Post triage comment/);
    expect(generate).not.toBeNull();
    // Comments mention GH_TOKEN by name; only an env assignment would grant it.
    expect(generate[0]).not.toMatch(/^\s*GH_TOKEN:/m);
  });

  it('rejects drafts missing the marker, Verification, or Disposition before posting', () => {
    const post = workflow.match(/- name: Post triage comment[\s\S]*?(?=\n {6}- name: Apply triage disposition)/);
    expect(post).not.toBeNull();
    expect(post[0]).toContain('[ "$FIRST_LINE" = \'<!-- issue-triage -->\' ]');
    expect(post[0]).toMatch(/secret material/);
    expect(post[0]).toContain('grep -q -E \'^### Verification[[:space:]]*$\' "$BODY_FILE"');
    expect(post[0]).toContain('grep -q -E \'^### Disposition[[:space:]]*$\' "$BODY_FILE"');
    // Exactly one publication path: the failure report uses --body, so only
    // the Post step may ever post the draft itself.
    const publications = [...workflow.matchAll(/gh issue comment "\$ISSUE_NUMBER" --repo "\$GH_REPO" --body-file/g)];
    expect(publications.length).toBe(1);
  });

  it('runs the disposition step after publication and before the failure report', () => {
    const postIdx = workflow.indexOf('- name: Post triage comment');
    const dispositionIdx = workflow.indexOf('- name: Apply triage disposition');
    const failureIdx = workflow.indexOf('- name: Report triage failure on issue');
    expect(postIdx).toBeGreaterThan(-1);
    expect(dispositionIdx).toBeGreaterThan(postIdx);
    expect(failureIdx).toBeGreaterThan(dispositionIdx);
    // Same gating as the Post step, so the disposition only ever sees a
    // comment this run actually posted.
    const postIf = workflow.match(/- name: Post triage comment\n {8}if: (.+)\n/);
    const dispositionIf = workflow.match(/- name: Apply triage disposition\n {8}if: (.+)\n/);
    expect(postIf).not.toBeNull();
    expect(dispositionIf).not.toBeNull();
    expect(dispositionIf[1]).toBe(postIf[1]);
  });

  it('parses ACTION strictly and falls back to none with a logged reason', () => {
    const disposition = workflow.match(/- name: Apply triage disposition[\s\S]*?(?=\n {6}- name: Report triage failure on issue)/);
    expect(disposition).not.toBeNull();
    expect(disposition[0]).toContain('close:duplicate|close:already-fixed|close:invalid|close:not-planned|needs-info)');
    expect(disposition[0]).toContain('no ACTION line in the draft; falling back to none');
    expect(disposition[0]).toContain('is not in the allowlist; falling back to none');
    expect(disposition[0]).toContain('echo "$DISPOSITION_LOG"');
    expect(disposition[0]).toContain('[ "$DECISION" != \'none\' ] || exit 0');
    // A close also requires Verification evidence that supports closing.
    expect(disposition[0]).toContain('\'verified\' \'not-reproducible\' \'not-applicable\'');
    expect(disposition[0]).toContain('refusing to close: Verification status');
  });

  it('never closes or labels on the automatic issues.opened path', () => {
    const disposition = workflow.match(/- name: Apply triage disposition[\s\S]*?(?=\n {6}- name: Report triage failure on issue)/);
    expect(disposition).not.toBeNull();
    // Only an authorized /triage comment (EVENT_NAME == issue_comment, which
    // the step's if: already gated) or an explicit dispose dispatch passes.
    expect(disposition[0]).toContain('if [ "$EVENT_NAME" != \'issue_comment\' ] && [ "$DISPOSE" != \'true\' ]; then');
    expect(disposition[0]).toContain('requires an explicit /triage comment or workflow_dispatch dispose: true; falling back to none');
    // DISPOSE only ever reads the dispatch input, and only from workflow_dispatch.
    expect(disposition[0]).toContain('DISPOSE: ${{ github.event_name == \'workflow_dispatch\' && github.event.inputs.dispose || false }}');
    expect(disposition[0]).toMatch(/EVENT_NAME: \$\{\{ github\.event_name \}\}/);
    expect(disposition[0]).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  });

  it('applies only registry labels and closes with a fixed evidence link', () => {
    const disposition = workflow.match(/- name: Apply triage disposition[\s\S]*?(?=\n {6}- name: Report triage failure on issue)/);
    expect(disposition).not.toBeNull();
    expect(disposition[0]).not.toMatch(/gh label create/);
    expect(disposition[0]).toContain('gh api --paginate "repos/$GH_REPO/labels?per_page=100"');
    expect(disposition[0]).toContain('grep -Fxq -- "$LABEL"');
    expect(disposition[0]).toContain('gh issue edit "$ISSUE_NUMBER" --repo "$GH_REPO" --add-label "$LABEL"');
    expect(disposition[0]).toContain('LABEL=\'duplicate\'');
    expect(disposition[0]).toContain('LABEL=\'invalid\'');
    expect(disposition[0]).toContain('LABEL=\'wontfix\'');
    expect(disposition[0]).toContain('LABEL=\'question\'');
    expect(disposition[0]).toMatch(/gh issue close "\$ISSUE_NUMBER" --repo "\$GH_REPO" --reason "\$GH_REASON"/);
    expect(disposition[0]).toContain('Evidence: see the issue-triage comment above');
    // needs-info labels but never closes.
    expect(disposition[0]).toContain('issue left open pending information');
  });

  it('leaves idempotency, failure reporting, and the timeouts unchanged', () => {
    expect(workflow).toMatch(/contains\("<!-- issue-triage -->"\)/);
    expect(workflow).toMatch(/Existing issue-triage comment found; skipping auto-triage to stay idempotent\./);
    expect(workflow).toMatch(/\(failure\(\) \|\| cancelled\(\)\)/);
    expect(workflow).toContain('Issue triage failed or timed out');
    expect(workflow).toMatch(/timeout-minutes: 12/);
    expect(workflow).toMatch(/job-timeout-minutes: \[20\]/);
  });
});

describe.skipIf(!CAN_RUN_BASH)('issue-triage disposition rule behavior (#1026)', () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'triage-rule-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Mirrors the prompt's comment shape: marker first line, Verification with
  // a Status line, then Disposition last. status === false omits the whole
  // Verification section; status === null keeps the section but drops Status.
  function draft({ action = 'none', status = 'verified', includeDisposition = true } = {}) {
    const lines = ['<!-- issue-triage -->', '## Triage', '', '### Summary', 'Example summary.'];
    if (status !== false) {
      lines.push('', '### Verification');
      if (status !== null) {
        lines.push(`Status: ${status}`);
      }
      lines.push('- claim -> grep -n foo src/core/utils.js -> found');
    }
    lines.push(
      '', '### Scope / Likely files', '- src/core/utils.js',
      '', '### Suggested implementation', '1. Example step.',
      '', '### Acceptance criteria', '- [ ] npm test',
      '', '### Open questions / Risks', 'none'
    );
    if (includeDisposition) {
      lines.push('', '### Disposition', `ACTION: ${action}`, 'REASON: Example reason.', 'RELATED: #1');
    }
    return `${lines.join('\n')}\n`;
  }

  function decide({ draft: draftText, eventName = 'issues', dispose = 'false' }) {
    const bodyFile = join(dir, 'body.md');
    writeFileSync(bodyFile, draftText);
    const script = [
      'set -euo pipefail',
      `BODY_FILE=${JSON.stringify(bodyFile)}`,
      extractDispositionRule(workflow),
      'echo "DECISION=$DECISION"',
      'echo "LOG=$DISPOSITION_LOG"',
      'echo "ACTION=$ACTION"',
      'echo "STATUS=$VERIFICATION_STATUS"',
      'echo "REASON=$REASON"',
      'echo "RELATED=$RELATED"',
    ].join('\n');
    const output = execFileSync('bash', ['-c', script], {
      encoding: 'utf-8',
      env: { ...process.env, EVENT_NAME: eventName, DISPOSE: dispose },
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

  it('honors a verified close on an authorized /triage run and parses the block', () => {
    const result = decide({ draft: draft({ action: 'close:duplicate', status: 'verified' }), eventName: 'issue_comment' });
    expect(result.ACTION).toBe('close:duplicate');
    expect(result.STATUS).toBe('verified');
    expect(result.REASON).toBe('Example reason.');
    expect(result.RELATED).toBe('#1');
    expect(result.DECISION).toBe('close:duplicate');
    expect(result.LOG).toBe('ACTION=close:duplicate');
  });

  it('never disposes on the automatic issues.opened path', () => {
    const result = decide({ draft: draft({ action: 'close:duplicate', status: 'verified' }), eventName: 'issues' });
    expect(result.DECISION).toBe('none');
    expect(result.LOG).toContain('explicit /triage comment or workflow_dispatch dispose: true');
  });

  it('honors close on workflow_dispatch only when dispose: true', () => {
    const granted = decide({
      draft: draft({ action: 'close:not-planned', status: 'not-reproducible' }),
      eventName: 'workflow_dispatch',
      dispose: 'true',
    });
    expect(granted.DECISION).toBe('close:not-planned');
    const denied = decide({
      draft: draft({ action: 'close:not-planned', status: 'not-reproducible' }),
      eventName: 'workflow_dispatch',
      dispose: 'false',
    });
    expect(denied.DECISION).toBe('none');
    expect(denied.LOG).toContain('falling back to none');
  });

  it('refuses to close without supporting Verification evidence', () => {
    const byInspection = decide({ draft: draft({ action: 'close:invalid', status: 'by-inspection-only' }), eventName: 'issue_comment' });
    expect(byInspection.DECISION).toBe('none');
    expect(byInspection.LOG).toContain('refusing to close');
    expect(byInspection.STATUS).toBe('by-inspection-only');
    const missingStatus = decide({ draft: draft({ action: 'close:invalid', status: null }), eventName: 'issue_comment' });
    expect(missingStatus.DECISION).toBe('none');
    expect(missingStatus.LOG).toContain('refusing to close');
    const missingSection = decide({ draft: draft({ action: 'close:invalid', status: false }), eventName: 'issue_comment' });
    expect(missingSection.DECISION).toBe('none');
    expect(missingSection.LOG).toContain('refusing to close');
  });

  it('still allows needs-info without close-grade evidence', () => {
    const result = decide({ draft: draft({ action: 'needs-info', status: 'by-inspection-only' }), eventName: 'issue_comment' });
    expect(result.DECISION).toBe('needs-info');
    expect(result.LOG).toBe('ACTION=needs-info');
    const gated = decide({ draft: draft({ action: 'needs-info', status: 'by-inspection-only' }), eventName: 'issues' });
    expect(gated.DECISION).toBe('none');
    expect(gated.LOG).toContain('falling back to none');
  });

  it('falls back to none for unknown or missing ACTION values', () => {
    const unknown = decide({ draft: draft({ action: 'close:spam' }), eventName: 'issue_comment' });
    expect(unknown.DECISION).toBe('none');
    expect(unknown.LOG).toContain('not in the allowlist');
    const missing = decide({ draft: draft({ includeDisposition: false }), eventName: 'issue_comment' });
    expect(missing.DECISION).toBe('none');
    expect(missing.LOG).toContain('no ACTION line');
  });

  it('treats none and keep-open as comment-only dispositions', () => {
    ['none', 'keep-open'].forEach((action) => {
      const result = decide({ draft: draft({ action }), eventName: 'issue_comment' });
      expect(result.DECISION).toBe('none');
      expect(result.LOG).toContain('leaving the issue open');
    });
  });

  it('reads Status only from the Verification section', () => {
    // A Status: line under a later heading must not flip the decision.
    const polluted = draft({ action: 'close:invalid', status: 'verified' })
      .replace('### Scope / Likely files', '### Scope / Likely files\nStatus: by-inspection-only');
    const result = decide({ draft: polluted, eventName: 'issue_comment' });
    expect(result.STATUS).toBe('verified');
    expect(result.DECISION).toBe('close:invalid');
  });
});
