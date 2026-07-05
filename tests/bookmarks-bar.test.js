import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/bookmarks-bar.js');
});

beforeEach(() => {
  localStorage.removeItem('bookmarks');
  localStorage.removeItem('bookmarksBarEnabled');
  localStorage.removeItem('openAppsInNewTab');
  window.BookmarksBar.render();
});

describe('BookmarksBar', () => {
  it('loads empty data by default', () => {
    expect(window.BookmarksBar.loadData()).toEqual({ items: [], folders: [] });
  });

  it('renders empty state when enabled with no bookmarks', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    window.BookmarksBar.applyEnabled();

    expect(document.getElementById('bookmarks-bar').hidden).toBe(false);
    expect(document.getElementById('bookmarks-empty-state').hidden).toBe(false);
  });

  it('renders bookmarks and folders from localStorage', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'Docs', url: 'https://example.com/docs', faviconUrl: '', folderId: null },
        { id: 'bookmark-2', name: 'Inbox', url: 'https://example.com/inbox', faviconUrl: '', folderId: 'folder-1' }
      ],
      folders: [
        { id: 'folder-1', name: 'Work' }
      ]
    }));

    window.BookmarksBar.applyEnabled();

    expect(document.querySelectorAll('.bookmark-pill')).toHaveLength(1);
    expect(document.querySelector('.bookmark-folder-pill')?.textContent).toBe('Work');
  });

  it('applies open-in-new-tab preference to bookmark links', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    localStorage.setItem('openAppsInNewTab', 'false');
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'Docs', url: 'https://example.com/docs', faviconUrl: '', folderId: null }
      ],
      folders: []
    }));

    window.BookmarksBar.applyEnabled();

    const link = document.querySelector('.bookmark-pill');
    expect(link?.getAttribute('target')).toBeNull();

    localStorage.setItem('openAppsInNewTab', 'true');
    window.BookmarksBar.applyTargets();
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('reorders sibling bookmarks with moveBookmark', () => {
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'One', url: 'https://example.com/1', faviconUrl: '', folderId: null },
        { id: 'bookmark-2', name: 'Two', url: 'https://example.com/2', faviconUrl: '', folderId: null }
      ],
      folders: []
    }));

    window.BookmarksBar.moveBookmark('bookmark-2', -1);

    const stored = window.BookmarksBar.loadData();
    expect(stored.items.map(item => item.id)).toEqual(['bookmark-2', 'bookmark-1']);
  });

  it('deletes bookmarks and removes empty folders', () => {
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'One', url: 'https://example.com/1', faviconUrl: '', folderId: 'folder-1' }
      ],
      folders: [
        { id: 'folder-1', name: 'Work' }
      ]
    }));

    window.BookmarksBar.deleteBookmark('bookmark-1');

    expect(window.BookmarksBar.loadData()).toEqual({ items: [], folders: [] });
  });
});
