import { beforeEach, describe, it, expect } from 'vitest';

beforeEach(() => {
  localStorage.clear();
});

describe('storage bridge', () => {
  it('persists localStorage writes to chrome.storage.local', async () => {
    localStorage.setItem('theme', 'light');

    const stored = await chrome.storage.local.get('theme');
    expect(stored.theme).toBe('light');
  });

  it('reflects direct chrome.storage.local writes back into localStorage', async () => {
    await chrome.storage.local.set({ language: 'zh' });

    expect(localStorage.getItem('language')).toBe('zh');
  });

  it('clears chrome.storage.local when localStorage.clear is called', async () => {
    localStorage.setItem('language', 'zh');
    localStorage.clear();

    const stored = await chrome.storage.local.get(null);
    expect(stored.language).toBeUndefined();
  });

  it('exposes length and key ordering', () => {
    localStorage.setItem('first', '1');
    localStorage.setItem('second', '2');

    expect(localStorage.length).toBe(2);
    expect(localStorage.key(0)).toBe('first');
    expect(localStorage.key(1)).toBe('second');
  });

  it('returns empty-string keys without coercing them to null', () => {
    localStorage.setItem('', 'empty');

    expect(localStorage.key(0)).toBe('');
  });
});