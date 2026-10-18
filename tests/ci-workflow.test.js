import { readFileSync } from 'fs';
import { resolve } from 'path';

const CI_PATH = resolve(process.cwd(), '.github/workflows/ci.yml');
const RELEASE_PATH = resolve(process.cwd(), '.github/workflows/release.yml');

describe('PR/push CI runs lint and the test suite (#846)', () => {
  let ci;
  let release;

  beforeAll(() => {
    ci = readFileSync(CI_PATH, 'utf-8');
    release = readFileSync(RELEASE_PATH, 'utf-8');
  });

  it('triggers on every pull request and on pushes to main', () => {
    expect(ci).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches:\n {6}- main$/m);
    expect(ci).not.toMatch(/branches:\n\s+- (?!\s*main\b)\S/);
  });

  it('runs exactly npm ci --ignore-scripts, npm run lint, npm test in order', () => {
    const commands = [...ci.matchAll(/run:\s*(.+)/g)].map((match) => match[1].trim());

    expect(commands).toEqual(['npm ci --ignore-scripts', 'npm run lint', 'npm test']);
  });

  it('exposes a single stable `test` job for branch protection', () => {
    const jobsBlock = ci.match(/^jobs:\n([\s\S]*)$/m);
    expect(jobsBlock).not.toBeNull();

    const jobIds = [...jobsBlock[1].matchAll(/^ {2}(\w[\w-]*):$/gm)].map((match) => match[1]);

    expect(jobIds).toEqual(['test']);
    expect(ci).not.toMatch(/strategy:|matrix:/);
  });

  it('pins Node from .nvmrc with npm caching, mirroring release.yml', () => {
    expect(ci).toMatch(/node-version-file:\s*'\.nvmrc'/);
    expect(ci).toMatch(/cache:\s*'npm'/);

    const actionPins = [...ci.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(actionPins.length).toBeGreaterThan(0);
    actionPins.forEach((pin) => {
      expect(release).toContain(pin);
    });
  });
});
