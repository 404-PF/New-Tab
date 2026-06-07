import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

export function injectScript(relativePathOrCode, vmContext) {
  // If a VM context is provided, treat first arg as code and run in that context
  if (vmContext) {
    const script = new vm.Script(relativePathOrCode);
    script.runInContext(vmContext);
    return;
  }

  // Otherwise, treat first arg as a file path and eval in globalThis (original behavior)
  const absolutePath = resolve(process.cwd(), relativePathOrCode);
  const code = readFileSync(absolutePath, 'utf-8');
  globalThis.eval(code);
}
