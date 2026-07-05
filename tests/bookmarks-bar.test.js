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

  it('creates a bookmark through the modal flow', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    window.BookmarksBar.applyEnabled();

    window.BookmarksBar.openModal(null);

    const modal = document.getElementById('bookmark-modal');
    expect(modal.classList.contains('modal-open')).toBe(true);

    document.getElementById('bookmark-name-input').value = 'Test Site';
    document.getElementById('bookmark-url-input').value = 'https://test.example.com';
    document.getElementById('bookmark-favicon-input').value = '';
    document.getElementById('bookmark-folder-input').value = '';

    document.getElementById('bookmark-modal-save').click();

    const data = window.BookmarksBar.loadData();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].name).toBe('Test Site');
    expect(data.items[0].url).toBe('https://test.example.com/');
    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('updates an existing bookmark through the modal flow', () => {
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'Old Name', url: 'https://old.example.com', faviconUrl: '', folderId: null }
      ],
      folders: []
    }));

    window.BookmarksBar.openModal('bookmark-1');

    document.getElementById('bookmark-name-input').value = 'New Name';
    document.getElementById('bookmark-url-input').value = 'https://new.example.com';
    document.getElementById('bookmark-favicon-input').value = '';
    document.getElementById('bookmark-folder-input').value = '';

    document.getElementById('bookmark-modal-save').click();

    const data = window.BookmarksBar.loadData();
    expect(data.items[0].name).toBe('New Name');
    expect(data.items[0].url).toBe('https://new.example.com/');
  });

  it('shows validation when bookmark name is empty', () => {
    window.BookmarksBar.openModal(null);

    document.getElementById('bookmark-name-input').value = '';
    document.getElementById('bookmark-url-input').value = 'https://example.com';
    document.getElementById('bookmark-favicon-input').value = '';
    document.getElementById('bookmark-folder-input').value = '';

    document.getElementById('bookmark-modal-save').click();

    const msg = document.getElementById('bookmark-validation-message');
    expect(msg.classList.contains('show')).toBe(true);
    expect(msg.textContent).toBeTruthy();

    const data = window.BookmarksBar.loadData();
    expect(data.items).toHaveLength(0);
  });

  it('shows validation when bookmark URL is empty', () => {
    window.BookmarksBar.openModal(null);

    document.getElementById('bookmark-name-input').value = 'Test';
    document.getElementById('bookmark-url-input').value = '';
    document.getElementById('bookmark-favicon-input').value = '';
    document.getElementById('bookmark-folder-input').value = '';

    document.getElementById('bookmark-modal-save').click();

    const msg = document.getElementById('bookmark-validation-message');
    expect(msg.classList.contains('show')).toBe(true);
  });

  it('rejects non-http URLs', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'Bad', url: 'javascript:alert(1)', faviconUrl: '', folderId: null }
      ],
      folders: []
    }));

    window.BookmarksBar.applyEnabled();

    expect(document.querySelectorAll('.bookmark-pill')).toHaveLength(0);
  });

  it('closes modal on Escape key', () => {
    window.BookmarksBar.openModal(null);

    const modal = document.getElementById('bookmark-modal');
    expect(modal.classList.contains('modal-open')).toBe(true);

    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('opens the context menu for bookmarks inside folder menus', () => {
    localStorage.setItem('bookmarksBarEnabled', 'true');
    localStorage.setItem('bookmarks', JSON.stringify({
      items: [
        { id: 'bookmark-1', name: 'Docs', url: 'https://example.com/docs', faviconUrl: '', folderId: 'folder-1' }
      ],
      folders: [
        { id: 'folder-1', name: 'Work' }
      ]
    }));

    window.BookmarksBar.applyEnabled();

    document.querySelector('.bookmark-folder-pill').click();

    const folderBookmark = document.querySelector('#bookmarks-folder-menu .bookmark-pill');
    folderBookmark.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      pageX: 20,
      pageY: 30
    }));

    const menu = document.getElementById('bookmarks-context-menu');
    expect(menu).not.toBeNull();
    expect(menu.style.display).toBe('block');
  });
});
