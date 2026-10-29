import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const BUG_PATH = resolve(process.cwd(), '.github/ISSUE_TEMPLATE/bug_report.md');
const FEATURE_PATH = resolve(process.cwd(), '.github/ISSUE_TEMPLATE/feature_request.md');
const PR_PATH = resolve(process.cwd(), '.github/pull_request_template.md');
const TRIAGE_PATH = resolve(process.cwd(), '.github/workflows/issue-triage.yml');
const LABEL_PATH = resolve(process.cwd(), '.github/workflows/issue-label.yml');
const BUG_FIND_PATH = resolve(process.cwd(), '.github/workflows/bug-find.yml');
const FEATURE_FIND_PATH = resolve(process.cwd(), '.github/workflows/feature-find.yml');
const CONTRIBUTING_PATH = resolve(process.cwd(), 'CONTRIBUTING.md');
const CONTRIBUTING_EN_PATH = resolve(process.cwd(), 'docs/CONTRIBUTING.en.md');
const CONTRIBUTING_ZH_PATH = resolve(process.cwd(), 'docs/CONTRIBUTING.zh-CN.md');

// Templates share a fixed section set. Generated issues are free-form and end
// with an ### Evidence block appended by bug-find/feature-find, which the
// templates' Evidence section matches. issue-triage and issue-label pass the
// raw body through and do not parse headings.
const ISSUE_HEADINGS = [
  '## Description',
  '## Problem Statement',
  '## Expected Behavior',
  '## Proposed Solution',
  '## Acceptance Criteria',
  '### Evidence',
];

function frontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  expect(match).not.toBeNull();
  return match[1];
}

describe('issue and PR templates (#1032)', () => {
  let bug;
  let feature;
  let pr;

  beforeAll(() => {
    bug = readFileSync(BUG_PATH, 'utf-8');
    feature = readFileSync(FEATURE_PATH, 'utf-8');
    pr = readFileSync(PR_PATH, 'utf-8');
  });

  it('adds bug and feature issue templates with valid front matter', () => {
    expect(existsSync(BUG_PATH)).toBe(true);
    expect(existsSync(FEATURE_PATH)).toBe(true);

    const bugFm = frontMatter(bug);
    expect(bugFm).toMatch(/^name: /m);
    expect(bugFm).toMatch(/^about: /m);
    expect(bugFm).toMatch(/^labels: /m);
    // Only labels that already exist in the repo label registry.
    expect(bugFm).toMatch(/^labels: bug$/m);

    const featureFm = frontMatter(feature);
    expect(featureFm).toMatch(/^name: /m);
    expect(featureFm).toMatch(/^about: /m);
    expect(featureFm).toMatch(/^labels: enhancement$/m);
  });

  it('uses the shared section headings in both templates', () => {
    [bug, feature].forEach((template) => {
      ISSUE_HEADINGS.forEach((heading) => {
        expect(template).toContain(heading);
      });
      // Each heading appears exactly once, in order.
      let lastIndex = -1;
      ISSUE_HEADINGS.forEach((heading) => {
        const index = template.indexOf(heading);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
        expect(template.indexOf(heading, index + 1)).toBe(-1);
      });
    });
  });

  it('adds a PR template with the tests/translations/screenshots checklist', () => {
    expect(existsSync(PR_PATH)).toBe(true);
    ISSUE_HEADINGS.forEach((heading) => {
      expect(pr).toContain(heading);
    });
    expect(pr).toContain('- [ ] `npm run lint` passes');
    expect(pr).toContain('- [ ] `npm test` passes');
    expect(pr).toMatch(/- \[ \] translations\/i18n keys added if UI strings changed/);
    expect(pr).toMatch(/- \[ \] screenshots attached for UI changes/);
  });

  it('keeps workflow sentinels out of the PR and issue templates', () => {
    [bug, feature, pr].forEach((template) => {
      expect(template).not.toContain('<!-- pr-merge -->');
      expect(template).not.toContain('<!-- pr-drive -->');
      expect(template).not.toContain('<!-- issue-triage -->');
      expect(template).not.toContain('<!-- bug-find -->');
      expect(template).not.toContain('<!-- feature-find -->');
    });
  });

  it('mentions the templates in CONTRIBUTING.md and its localized variants', () => {
    [CONTRIBUTING_PATH, CONTRIBUTING_EN_PATH, CONTRIBUTING_ZH_PATH].forEach((path) => {
      expect(existsSync(path)).toBe(true);
      const doc = readFileSync(path, 'utf-8');
      expect(doc).toContain('.github/ISSUE_TEMPLATE/');
      expect(doc).toContain('.github/pull_request_template.md');
    });
  });
});

describe('workflows stay compatible with templated issues (#1032)', () => {
  let triage;
  let label;
  let bugFind;
  let featureFind;

  beforeAll(() => {
    triage = readFileSync(TRIAGE_PATH, 'utf-8');
    label = readFileSync(LABEL_PATH, 'utf-8');
    bugFind = readFileSync(BUG_FIND_PATH, 'utf-8');
    featureFind = readFileSync(FEATURE_FIND_PATH, 'utf-8');
  });

  it('runs issue-triage and issue-label on every opened issue', () => {
    [triage, label].forEach((wf) => {
      expect(wf).toMatch(/^on:\n {2}issues:\n {4}types: \[opened\]/m);
    });
  });

  it('feeds the raw issue body to the prompts without heading parsing', () => {
    // Both workflows render the body verbatim into the context file, so a
    // templated body with the shared headings needs no workflow changes.
    [triage, label].forEach((wf) => {
      expect(wf).toContain('"## Body"');
      expect(wf).toContain('then (.body | wrap) else "_No description provided._"');
      expect(wf).not.toMatch(/## Description|## Problem Statement|## Expected Behavior/);
    });
  });

  it('still appends the ### Evidence block to generated issues', () => {
    [bugFind, featureFind].forEach((wf) => {
      expect(wf).toContain('.body, "", "### Evidence",');
    });
  });
});
