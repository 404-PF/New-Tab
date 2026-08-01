import { readFileSync, realpathSync } from 'fs';
import { resolve, sep } from 'path';
import vm from 'vm';

const PROJECT_ROOT = realpathSync(process.cwd());
const TRUSTED_SCRIPT_PATH = /^(?:src|background|tests)(?:\/[A-Za-z0-9._-]+)+\.js$/;

function resolveTrustedScriptPath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    !TRUSTED_SCRIPT_PATH.test(relativePath) ||
    relativePath.split('/').includes('..')
  ) {
    throw new TypeError('injectScript requires a trusted repository .js path.');
  }

  const scriptPath = realpathSync(resolve(PROJECT_ROOT, relativePath));
  if (!scriptPath.startsWith(PROJECT_ROOT + sep)) {
    throw new TypeError('injectScript path must remain inside the repository.');
  }
  return scriptPath;
}

export function injectScript(relativePath, vmContext) {
  const scriptPath = resolveTrustedScriptPath(relativePath);
  const source = readFileSync(scriptPath, 'utf-8');
  const script = new vm.Script(source, { filename: scriptPath });

  if (vmContext) {
    script.runInContext(vmContext);
    return;
  }

  // source only comes from resolveTrustedScriptPath(), never caller-supplied code.
  globalThis.eval(source);
}
