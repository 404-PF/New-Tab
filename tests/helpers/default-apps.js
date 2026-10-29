// Default-app catalog shared by specs that bootstrap AppGridState with the
// built-in apps the extension ships, so the array is not copied per file.
export const DEFAULT_APPS = [
  { id: 'ai-app', nameKey: 'ai', url: '#', className: 'default-app' },
  { id: 'weather-app', nameKey: 'weather', url: '#', className: 'default-app' },
  { id: 'games-app', nameKey: 'games', url: '#', className: 'default-app' },
  { id: 'todo-app', nameKey: 'todoApp', url: '#', className: 'default-app' },
  { id: 'feedback-app', nameKey: 'feedback', url: 'https://example.com/feedback', className: 'default-app' },
  { id: 'settings-app', nameKey: 'settings', url: '#', className: 'default-app' }
];
