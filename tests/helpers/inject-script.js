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
  // Safe: `source` is read from a trusted, allowlisted repo file
  // (resolveTrustedScriptPath: regex allowlist + .. rejection + realpath containment)
  // and executed in an isolated vm sandbox, not globalThis.eval.
  const script = new vm.Script(source, { filename: scriptPath }); // NOSONAR

  if (vmContext) {
    script.runInContext(vmContext);
    return;
  }

  const sandbox = Object.create(globalThis);
  sandbox.window = globalThis.window;
  Object.defineProperty(sandbox, 'crypto', { get: () => globalThis.crypto });
  const initialSandboxKeys = new Set(Reflect.ownKeys(sandbox));
  script.runInNewContext(sandbox);

  Reflect.ownKeys(sandbox).forEach((key) => {
    if (!initialSandboxKeys.has(key)) {
      globalThis[key] = sandbox[key];
    }
  });
}
