import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const SCOPE_PATH = resolve(process.cwd(), 'docs/SCOPE.md');
// Root files link to docs/SCOPE.md; the docs/ mirrors link to the sibling SCOPE.md.
const LINKED_FROM = [
  ['README.md', '](docs/SCOPE.md)'],
  ['CONTRIBUTING.md', '](docs/SCOPE.md)'],
  ['docs/README.en-US.md', '](SCOPE.md)'],
  ['docs/README.zh-CN.md', '](SCOPE.md)'],
  ['docs/CONTRIBUTING.en.md', '](SCOPE.md)'],
  ['docs/CONTRIBUTING.zh-CN.md', '](SCOPE.md)']
];

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('product scope note (#1031)', () => {
  let scope;

  beforeAll(() => {
    scope = readFileSync(SCOPE_PATH, 'utf-8');
  });

  it('exists under docs/', () => {
    expect(existsSync(SCOPE_PATH)).toBe(true);
  });

  it('names the core user, the three dashboard jobs, the games hub, and out-of-scope items', () => {
    expect(scope).toMatch(/^## Core user$/m);
    expect(scope).toMatch(/^## Top three dashboard jobs$/m);
    expect(scope).toMatch(/^## Games hub$/m);
    expect(scope).toMatch(/^## Out of scope$/m);
    expect(scope).toMatch(/optional extra/);
    // Exactly the three numbered dashboard jobs; the out-of-scope list uses dashes.
    const jobs = scope.match(/^\d+\. /gm) || [];
    expect(jobs.length).toBe(3);
  });

  it('is linked from README and CONTRIBUTING, including their en/zh mirrors', () => {
    LINKED_FROM.forEach(([rel, target]) => {
      expect(read(rel)).toContain(target);
    });
  });
});
