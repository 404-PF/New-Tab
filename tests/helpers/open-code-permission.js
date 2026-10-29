// Parses a workflow's OPENCODE_PERMISSION: >- JSON block out of the YAML.
// Shared by find-workflows.test.js and issue-triage-workflow.test.js so the
// identical copy does not trip SonarCloud's new-code duplication gate.
export function readOpenCodePermission(wf) {
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
