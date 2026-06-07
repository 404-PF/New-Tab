import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

export function injectScript(relativePathOrCode, vmContext) {
  // If a VM context is provided, run in that context.
  // If the argument looks like a file path (ends with .js), read it first;
  // otherwise treat it as raw code.
  if (vmContext) {
    const source = relativePathOrCode.endsWith('.js')
      ? readFileSync(resolve(process.cwd(), relativePathOrCode), 'utf-8')
      : relativePathOrCode;
    const script = new vm.Script(source);
    script.runInContext(vmContext);
    return;
  }

  // Otherwise, treat first arg as a file path and eval in globalThis (original behavior)
  const absolutePath = resolve(process.cwd(), relativePathOrCode);
  const code = readFileSync(absolutePath, 'utf-8');
  globalThis.eval(code);
}
