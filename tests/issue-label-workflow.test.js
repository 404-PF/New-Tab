import { readFileSync } from 'fs';
import { resolve } from 'path';

const LABEL_PATH = resolve(process.cwd(), '.github/workflows/issue-label.yml');

describe('issue-label guards the repo label registry (#879)', () => {
  let label;

  beforeAll(() => {
    label = readFileSync(LABEL_PATH, 'utf-8');
  });

  it('triggers on issues.opened, /label comments, and workflow_dispatch', () => {
    expect(label).toMatch(/^on:\n {2}issues:\n {4}types: \[opened\]\n {2}issue_comment:\n {4}types: \[created\]\n {2}workflow_dispatch:/m);
  });

  it('pins job permissions to contents: read and issues: write', () => {
    // Anchored past issues: write so extra scopes cannot slip in while
    // still matching; the next line must be the trigger-filter comment.
    expect(label).toMatch(/permissions:\n {6}contents: read\n {6}issues: write\n {4}# issues\.opened and workflow_dispatch always run\./);
  });

  it('documents the residual label-registry risk next to permissions', () => {
    const permissionsIdx = label.indexOf('    permissions:');
    expect(permissionsIdx).toBeGreaterThan(-1);
    const above = label.slice(Math.max(0, permissionsIdx - 600), permissionsIdx);
    expect(above).toMatch(/label-registry/);
    expect(above).toMatch(/filter_valid/);
    expect(above).toMatch(/registry integrity/);
  });

  it('never creates, renames, or deletes registry labels', () => {
    expect(label).not.toMatch(/gh label (create|edit|delete)/);
  });

  it('keeps the decision step credential-free', () => {
    const decideSection = label.match(/- name: Decide labels with OpenCode[\s\S]*?- name: Apply label decisions/);
    expect(decideSection).not.toBeNull();
    // Comments mention GH_TOKEN by name; only an env assignment would grant it.
    expect(decideSection[0]).not.toMatch(/^\s*GH_TOKEN:/m);
  });

  it('snapshots the label registry before applying and re-checks after', () => {
    const applySection = label.match(/- name: Apply label decisions[\s\S]*?(?=\n {6}- name: Report)/);
    expect(applySection).not.toBeNull();
    expect(applySection[0]).toMatch(/REGISTRY_BEFORE=/);
    expect(applySection[0]).toMatch(/REGISTRY_AFTER=/);
    expect(applySection[0]).toMatch(/if \[ "\$REGISTRY_BEFORE" != "\$REGISTRY_AFTER" \]; then/);
    expect(applySection[0]).toMatch(/Label registry changed during the run/);
    expect(applySection[0]).toMatch(/exit 1/);
    // Two registry fetches in Apply: the pre-edit snapshot and the post-edit re-check.
    const fetches = applySection[0].match(/gh label list --repo "\$GH_REPO" --limit 100 --json name --jq/g) || [];
    expect(fetches.length).toBe(2);
  });

  it('only writes via gh issue edit --add-label/--remove-label with filtered names', () => {
    const applySection = label.match(/- name: Apply label decisions[\s\S]*?(?=\n {6}- name: Report)/);
    expect(applySection).not.toBeNull();
    expect(applySection[0]).toMatch(/filter_valid "\$ADD" "\$REPO_LABELS"/);
    expect(applySection[0]).toMatch(/gh issue edit "\$ISSUE_NUMBER" --repo "\$GH_REPO" --add-label "\$ADD_VALID"/);
    expect(applySection[0]).toMatch(/gh issue edit "\$ISSUE_NUMBER" --repo "\$GH_REPO" --remove-label "\$REMOVE_VALID"/);
  });

  it('surfaces a guard trip through the existing failure-comment path', () => {
    expect(label).toMatch(/\(failure\(\) \|\| cancelled\(\)\)/);
    expect(label).toMatch(/Issue labeling failed or timed out/);
  });
});
