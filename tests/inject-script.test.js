import { injectScript } from './helpers/inject-script.js';

describe('injectScript', () => {
  it('rejects inline code and paths outside trusted repository directories', () => {
    expect(() => injectScript('globalThis.executed = true;')).toThrow(
      'trusted repository .js path'
    );
    expect(() => injectScript('../src/core/storage.js')).toThrow(
      'trusted repository .js path'
    );
  });
});