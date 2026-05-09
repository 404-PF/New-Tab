import { describe, it, expect } from 'vitest';

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
});