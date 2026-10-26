// src/core/languages.js - Internationalization support

const GAMES_TRANSLATION_KEYS = [
  'games',
  'enableGames',
  'gamesPlay',
  'gamesContinue',
  'gamesSaved',
  'gamesBack',
  'gamesScore',
  'gamesHighScore',
  'gamesBestMoves',
  'gamesMoves',
  'gamesTime',
  'gamesGameOver',
  'gamesYouWin',
  'gamesPaused',
  'gamesPressSpace',
  'gamesNoGames',
  'gamesDisabled',
  'gamesSnake',
  'gamesSnakeDesc',
  'gamesSnakeControls',
  'games2048',
  'games2048Desc',
  'games2048Controls',
  'gamesMemory',
  'gamesMemoryDesc',
  'gamesMemoryControls'
];

// Every games key a supported locale must resolve, including the keys that live
// in per-language maps (gamesLevel, gamesReady, gamesReadyStart, gamesStart)
// rather than in GAMES_TRANSLATION_KEYS. Exported as window.i18n.gamesTranslationKeys
// so completeness tests iterate the same list the source uses and cannot drift
// from it.
const GAMES_ALL_TRANSLATION_KEYS = GAMES_TRANSLATION_KEYS.concat([
  'gamesLevel',
  'gamesReady',
  'gamesReadyStart',
  'gamesStart',
  'gamesFlappyBird',
  'gamesFlappyBirdDesc',
  'gamesFlappyBirdControls',
  'gamesPacman',
  'gamesPacmanDesc',
  'gamesPacmanControls',
  'gamesLives'
]);

function createNoteTagTranslations(
  notesFilterAll,
  notesAddTag,
  notesTagPlaceholder,
  notesRemoveTag,
  notesDragToReorder
) {
  return {
    notesFilterAll,
    notesAddTag,
    notesTagPlaceholder,
    notesRemoveTag,
    notesDragToReorder
  };
}

function createGamesTranslations(values) {
  return Object.fromEntries(
    GAMES_TRANSLATION_KEYS.map((key, index) => [key, values[index]])
  );
}

const translations = {
  en: {
    // General UI
    searchPlaceholder: 'Search or enter website',
    searchWith: 'Search with',
    searchProviderGoogle: 'Google',
    searchProviderBing: 'Bing',
    searchProviderDuckDuckGo: 'DuckDuckGo',
    searchProviderWikipedia: 'Wikipedia',
    searchProviderYouTube: 'YouTube',
    searchProviders: 'Search providers',
    searchProvidersDesc: 'Add custom search engines with a name and URL template',
    searchProviderNamePlaceholder: 'Name (e.g. Kagi)',
    searchProviderUrlPlaceholder: 'https://example.com/search?q={query}',
    searchProviderAdd: 'Add',
    searchProvidersEmpty: 'No custom providers yet',
    searchProviderRemove: 'Remove',
    searchProviderRemoveLabel: 'Remove {name}',
    searchProviderInvalidName: 'Enter a name for the search provider.',
    searchProviderInvalidUrl: 'Enter a valid URL with {query} and http(s).',
    searchProviderSaveError: 'Failed to save search provider changes. Your last action was not saved.',
    searchProviderNameAriaLabel: 'Provider name',
    searchProviderUrlAriaLabel: 'Search URL template',
    searchProviderUnavailable: 'Provider API unavailable.',
    recentSearches: 'Recent searches',
    clearSearchHistory: 'Clear history',
    enableSearchHistory: 'Enable search history',
    searchSuggestionsAriaLabel: 'Search suggestions',
    newApp: 'New',
    feedback: 'Feedback',
    settings: 'Settings',
    simpleMode: 'Simple',
    focusMode: 'Focus',
    todoList: 'Todo List',
    addTodoPlaceholder: 'Add a new todo...',
    dueDate: 'Due Date',
    dueTime: 'Due Time',
    todoSetDate: 'Set date',
    dueDateUpdatedTo: 'Due date updated to {date}',
    dueDateCleared: 'Due date cleared',
    todoEditRecurrence: 'Repeat',
    recurrenceNone: 'None',
    recurrenceDaily: 'Daily',
    recurrenceWeekly: 'Weekly',
    recurrenceMonthly: 'Monthly',
    todoEditTooltip: 'Edit Todo',
    todoEditTitle: 'Edit Todo',
    todoEditText: 'Text',
    todoEditPriority: 'Priority',
    todoSubtasks: 'Subtasks',
    todoAddSubtask: 'Add subtask...',
    todoSubtaskDelete: 'Delete subtask',
    todoDeleteTooltip: 'Delete Todo',
    todoSaveError: 'Failed to save todo changes. Your last action was not saved.',
    todoInlinePrevMonth: 'Previous month',
    todoInlineNextMonth: 'Next month',
    addTodo: 'Add Todo',
    noTodos: 'No todos yet. Add one above!',
    noTodosHint: 'Try adding due dates for better organization.',
    notesTitle: 'Notes',
    notesEmpty: 'No notes yet. Click + to add one!',
    notesSearchPlaceholder: 'Search notes...',
    notesNoResults: 'No matching notes.',
    notesPlaceholder: 'Type your note here...',
    notesDeleteTooltip: 'Delete Note',
    notesEditTooltip: 'Edit',
    notesPreviewTooltip: 'Preview',
    notesSaveError: 'Failed to save note. Your changes were not saved.',
    ...createNoteTagTranslations('All', 'Add tag', 'Tag name...', 'Remove tag', 'Drag to reorder'),
    addNoteTooltip: 'Add note',
    newAppTitle: 'New App',
    newAppDescription: 'Enter a website URL to add it to your apps',
    enterUrl: 'Enter website URL',
    cancel: 'Cancel',
    save: 'Save',
    create: 'Create',
    quickAdd: 'Quick Add',
    quickAddDesc: 'Popular apps to get you started',
    renameAppTitle: 'Rename App',
    renameAppDescription: 'Enter a new name for this app',
    enterAppName: 'App name',
    changeThumbnailTitle: 'Change Thumbnail',
    changeThumbnailDescription: 'Enter an image URL for the app icon',
    enterIconUrl: 'https://example.com/icon.png',
    deleteAppTitle: 'Delete App?',
    deleteAppMessage: 'This app will be permanently removed from your list.',
    delete: 'Delete',
    customBackgroundDeleteConfirmTitle: 'Delete Background',
    customBackgroundDeleteConfirmMessage: 'This custom background will be permanently removed.',

    // URL Validation messages
    validationPleaseEnter: 'Please enter a URL or search query',
    validationInvalidAppears: 'This URL appears to be invalid. Press Enter to Create',
    validationMissingHostname: 'Invalid URL: missing hostname',
    validationInvalidChars: 'Invalid URL: hostname contains invalid characters',
    validationTldTooShort: 'Invalid URL: top-level domain too short',
    validationIncompleteDomain: 'Invalid URL: incomplete domain name',
    validationIpOutOfRange: 'Invalid URL: IP address out of range',
    validationValid: 'Valid URL',
    validationMalformed: 'Malformed URL',
    validationSearchUnavailable: 'Search is unavailable in this browser.',
    appAlreadyAdded: 'Already added',

    refreshMotto: 'Refresh motto',
    copyMotto: 'Copy motto',
    copyMottoCopied: 'Copied',
    copyMottoFailed: 'Failed to copy',
    copyFailed: 'Failed to copy text. Please select and copy manually.',
    copySuccess: 'Copied!',
    copyFailedShort: 'Failed',
    renameApp: 'Rename',
    changeThumbnail: 'Change Thumbnail',
    deleteApp: 'Delete',
    createFolder: 'Create Folder',
    renameFolder: 'Rename Folder',
    deleteFolder: 'Delete Folder',
    moveToFolder: 'Move to Folder',
    removeFromFolder: 'Remove from Folder',
    sortAlphabetically: 'Sort Alphabetically',
    hideDefaultApp: 'Hide from Grid',
    renameFolderPrompt: 'Enter new folder name:',
    createFolderPrompt: 'Enter folder name:',
    newFolder: 'New Folder',
    deleteFolderConfirm: 'Delete folder "{name}"? Apps inside will be moved back to the grid.',
    noFoldersCreate: 'No folders yet. Create one now?',
    folderEmpty: 'This folder is empty',

    // Settings
    general: 'General',
    background: 'Background',
    apps: 'Apps',
    clock: 'Clock',
    date: 'Date',
    themes: 'Themes',
    language: 'Language',
    about: 'About',

    // General settings
    generalSettings: 'General',
    generalSettingsDesc: 'Configure basic app behavior',
    openNewTab: 'Open apps in a new tab',
    enableTodoList: 'Enable todo list',
    enableReminders: 'Enable reminders',
    reminderLeadTime: 'Remind before due',
    reminderLeadTimeAtDue: 'At due time',
    reminderLeadTime5min: '5 minutes before',
    reminderLeadTime15min: '15 minutes before',
    reminderLeadTime30min: '30 minutes before',
    reminderLeadTime1hour: '1 hour before',
    reminderLeadTime1day: '1 day before',
    enableNotes: 'Enable notes scratchpad',
    enableFocusMode: 'Enable focus mode',
    focusModeExit: 'Exit Focus Mode',

    // Pomodoro settings
    enablePomodoro: 'Enable Pomodoro focus timer',
    pomodoroDurations: 'Focus Timer Durations',
    pomodoroDurationsDesc: 'Configure work and break durations (in minutes)',
    pomodoroWork: 'Work',
    pomodoroShortBreak: 'Short Break',
    pomodoroLongBreak: 'Long Break',
    pomodoroSessionsBeforeLong: 'Sessions before long break',

    // Background settings
    backgroundSettings: 'Background',
    backgroundSettingsDesc: 'Choose your background image',
    interactiveBackground: 'Interactive Background',
    interactiveBackgroundSettingsDesc: 'Choose a subtle pointer-reactive background',
    liveBackground: 'Live Background',
    liveBackgroundSettings: 'Live Background',
    liveBackgroundSettingsDesc: 'Choose an animated background video',
    playbackControls: 'Playback',
    uploadBackground: 'Upload Background',
    uploadLiveBackground: 'Upload Live Background',
    videoAutoplay: 'Autoplay live background',
    videoAutoplayDesc: 'Automatically play video backgrounds when selected',
    videoMuted: 'Mute live background',
    videoMutedDesc: 'Keep video backgrounds silent by default',
    videoPauseHidden: 'Pause when tab is hidden',
    videoPauseHiddenDesc: 'Save resources by pausing video when you switch tabs',

    // Background readability overlay
    bgOverlay: 'Readability',
    bgOverlayDesc: 'Dim, blur, or tint the background so text stays readable',
    bgOverlayDim: 'Dim',
    bgOverlayBlur: 'Blur',
    bgOverlayTint: 'Tint',
    bgOverlayTintStrength: 'Tint strength',
    bgOverlayReset: 'Reset overlay',

    // Background Rotation settings
    bgRotation: 'Rotation',
    bgRotationDesc: 'Automatically cycle through backgrounds',
    bgRotationToggle: 'Enable background rotation',
    bgRotationInterval: 'Change every',
    bgRotation5min: '5 minutes',
    bgRotation15min: '15 minutes',
    bgRotation30min: '30 minutes',
    bgRotation1hour: '1 hour',
    bgRotationHourly: 'Every hour on the hour',
    bgRotationDaily: 'Daily',
    bgRotationPicker: 'Select backgrounds to rotate',
    bgRotationUploads: 'Your uploads',
    bgRotationNext: 'Next Background',
    bgRotationSaveError: 'Failed to save background rotation settings. Your last action was not saved.',
    rotationOptions: 'Options',

    // Apps settings
    appsSettings: 'Apps',
    appGridSaveError: 'Failed to save app changes. Your last action was not saved.',
    gameStatsSaveError: 'Failed to save game statistics. Your latest score was not saved.',
    appsSettingsDesc: 'Customize app icons',
    iconStyle: 'Icon Style',
    iconStyleDesc: 'Choose the shape and appearance of your app icons',
    minimal: 'Minimal',
    square: 'Square',
    rounded: 'Rounded',
    circle: 'Circle',
    iconSize: 'Icon Size',
    iconSizeDesc: 'Adjust the size of your app icons',
    resetSize: 'Reset Size',
    visibleApps: 'Built-in Apps',
    visibleAppsDesc: 'Choose which built-in apps appear in the grid',

    // Clock settings
    clockSettings: 'Clock Style',
    clockSettingsDesc: 'Customize the appearance of your clock display',
    clockFormat: 'Time Format',
    clockFormatAuto: 'Locale Default',
    clockFormat12Hour: '12-Hour',
    clockFormat24Hour: '24-Hour',
    color: 'Color',
    font: 'Font',
    size: 'Size',
    resetStyle: 'Reset Style',

    // Date settings
    dateSettings: 'Date Style',
    dateSettingsDesc: 'Customize the appearance of your date display',
    dateFormat: 'Date Format',
    dateFormatAuto: 'Locale Default',
    dateFormatLong: 'Long',
    dateFormatCompact: 'Compact',
    dateFormatNumeric: 'Numeric',
    timezones: 'Time Zones',
    timezonesDesc: 'Add up to 5 additional time zone clocks below your main clock',
    selectTimezone: 'Select a time zone...',
    addTimezone: 'Add',
    removeTimezone: 'Remove',
    removeTimezoneLabel: 'Remove {city} time zone',

    // Weather settings
    weather: 'Weather',
    weatherSettings: 'Weather',
    weatherSettingsDesc: 'Configure weather widget display',
    enableWeatherWidget: 'Enable weather widget',
    weatherUnit: 'Temperature Unit',
    weatherCelsius: 'Celsius',
    weatherFahrenheit: 'Fahrenheit',
    weatherLocation: 'Location',
    weatherAutoDetect: 'Auto-detect',
    weatherManual: 'Manual',
    weatherCityPlaceholder: 'City name',
    weatherRefresh: 'Refresh Weather',
    weatherLoading: 'Loading...',
    weatherError: 'Unable to load weather',
    weatherEnterCity: 'Enter a city name',
    weatherUnknownLocation: 'Unknown location',
    weatherLocationUnavailable: 'Location unavailable',
    weatherLocationNotFound: 'City not found',
    weatherApp: 'Weather',
    weatherForecast: '7-Day Forecast',
    weatherFeelsLike: 'Feels like',
    weatherWind: 'Wind',
    weatherHumidity: 'Humidity',
    weatherHourly: 'Hourly Forecast',
    weatherNow: 'Now',

    // Themes settings
    themeSettings: 'Theme',
    themeSettingsDesc: 'Choose your preferred interface theme',
    dark: 'Dark',
    light: 'Light',
    autoTheme: 'Auto Theme',
    autoThemeDesc: 'Switch theme automatically by time of day',
    autoThemeToggle: 'Enable auto theme scheduling',
    autoThemeLightAt: 'Light theme at',
    autoThemeDarkAt: 'Dark theme at',

    // Language settings
    languageSettings: 'Language',
    languageSettingsDesc: 'Choose your preferred language',
    english: 'English',
    chinese: '中文',
    japanese: 'Japanese',
    korean: 'Korean',
    spanish: 'Spanish',
    french: 'French',
    german: 'German',
    portuguese: 'Portuguese',
    russian: 'Russian',

    // About settings
    aboutSettings: 'About New-Tab',
    aboutSettingsDesc: 'Customize your new tab experience with beautiful backgrounds, apps, and settings',
    project: 'Project',
    version: 'Version',
    createdBy: 'Created by',
    openSource: 'Open source project',
    onboardingTour: 'Onboarding Tour',
    restartTour: 'Restart Tour',
    tourDesc: 'Review the key features and customization options',
    startTour: 'Start Tour',
    repository: 'Repository',
    viewSource: 'View source code & contribute',
    updates: 'Updates',
    enableUpdates: 'Enable automatic update checks',
    updateStatus: 'Update checker not loaded',
    updateCheckerNotLoaded: 'Update checker not loaded',
    checkNow: 'Check for Updates Now',
    updateDesc: 'Checks for new versions from GitHub releases once per day when enabled.',
    versionLabel: 'Version',
    updateChecksDisabled: 'Update checks disabled',
    updateChecksBrowserOnly: 'Version checks are only available when the extension is loaded in the browser.',
    updateChecksUnavailableOutsideRuntime: 'Update checks are unavailable outside the extension runtime.',
    updateCheckFailed: 'Failed to check for updates. Please try again later.',
    updateCheckUnsupportedVersion: 'Unable to compare version strings because the update metadata uses an unsupported format.',
    updateNotificationBody: 'New-Tab v{version} is now available.',
    updateNotificationViewRelease: 'View Release',
    releaseNotesTitle: 'What\'s New',
    releaseNotesBody: 'New-Tab has been updated to v{version}. Here are the highlights:',
    releaseNotes054TodoMultiSelect: 'Added multi-select to the Todo list with bulk complete and delete',
    releaseNotes054ToolbarIcon: 'The toolbar extension icon now opens the new tab page',
    releaseNotes054GamesAppGrid: 'Games can now be configured in the app grid like any other app',
    releaseNotes054FasterStartup: 'Faster startup and smoother app-grid, clock, and stats updates',
    releaseNotes054AiChatHistory: 'AI chat history no longer gets wiped by a bad record, a full storage, or cross-tab saves',
    releaseNotes054ShortcutLabels: 'Fixed shortcut rebinding staying armed after closing Settings, and labels not updating after a language switch',
    releaseNotes054OnboardingFreeze: 'Fixed the onboarding tour freezing when it opens the Settings modal',
    releaseNotes054WeatherSpinner: 'Fixed the Weather app showing a permanent spinner after a failed refresh',
    releaseNotes053FasterAnimations: 'Sped up settings modal/tab animations and Games keyboard responsiveness',
    releaseNotes053UnifiedToasts: 'Unified in-app notifications into one top-middle toast style',
    releaseNotes053WeatherStandalone: 'The Weather app now works without the weather widget enabled',
    releaseNotes053OfflineChatFixes: 'Fixed offline chat misfires, crashes from certain words, and stuck streaming bubbles after a restart',
    releaseNotes053OpenRouterTimeouts: 'Fixed OpenRouter timeouts cutting off long AI answers mid-stream',
    releaseNotes053DuckDuckGoSuggestions: 'Fixed DuckDuckGo search suggestions never appearing',
    releaseNotes053UntranslatedLabels: 'Fixed untranslated Todo and app dialog labels on non-English languages',
    releaseNotes053ExportKeepsScheduling: 'Settings export/import now keeps focus mode and auto-theme scheduling',
    releaseNotes052PacmanGame: 'Added a Pac-Man maze game to the Games hub',
    releaseNotes052BackgroundOverlays: 'Added dim, blur, and tint background overlays for readability',
    releaseNotes052Glassmorphism: 'Applied glassmorphism styling to Todo and Notes in the light theme',
    releaseNotes052DeleteFromRow: 'Added the option to delete apps straight from the row',
    releaseNotes052SaveFailureFeedback: 'Fixed saves that reported success after storage failures',
    releaseNotes051SearchSuggestions: 'Added search suggestions with bang shortcuts and keyboard provider switching',
    releaseNotes051WebGroundedAi: 'Added web-grounded AI answers with cited sources',
    releaseNotes051TodoDueTimes: 'Added todo due times with timed reminders and minute-accurate overdue states',
    releaseNotes051CrossTabSync: 'Kept todos, notes, and AI data in sync across open tabs',
    releaseNotes051UnsafeUrlSchemes: 'Blocked unsafe custom app URL schemes',
    releaseNotes050GamesHub: 'Added a built-in Games hub with Snake, 2048, Memory Match, and Flappy Bird',
    releaseNotes050PomodoroTimer: 'Added a Pomodoro focus timer with configurable work and break durations',
    releaseNotes050FocusStats: 'Added focus-session statistics with weekly breakdowns and heatmaps',
    releaseNotes050MultiTimezoneClocks: 'Added support for multiple time zone clocks',
    releaseNotes050HourlyForecast: 'Added an hourly weather forecast with rain probabilities',
    releaseNotes048FocusModeLayout: 'Added a focus-mode layout and shortcut',
    releaseNotes048EyeCareReminders: 'Added configurable eye-care break reminders',
    releaseNotes048FocusStatsDashboard: 'Added a daily focus-stats dashboard for todos',
    releaseNotes048SearchQuickLaunch: 'Added a web-search quick-launch bar with keyboard shortcuts',
    releaseNotes048SearchHistoryToggle: 'Added a search-history toggle',
    releaseNotes048WhatsNewSummary: 'Added a What’s New summary after extension updates',
    releaseNotes047BackgroundTabCards: 'Redesigned the Background tab with a card-based layout',
    releaseNotes047TodoSubtasks: 'Added subtasks and checklists to todo items',
    releaseNotes047ThemeScheduling: 'Added automatic theme scheduling by time of day',
    releaseNotes047MarkdownPreview: 'Added a markdown preview toggle for notes',
    releaseNotes047SettingsImportExport: 'Added full settings import and export support',
    releaseNotes047MultiDayForecast: 'Added a multi-day weather forecast',
    releaseNotes047CustomShortcuts: 'Added customizable keyboard shortcuts',
    releaseNotes047BackgroundRotation: 'Added background rotation and scheduling',
    releaseNotes047TodoPriority: 'Added configurable todo priority levels',
    releaseNotesFallback: 'Check the full changelog for everything included in this update.',
    viewFullChangelog: 'View Full Changelog',
    whatsNew: 'What\'s New',
    updateManualNewVersion: 'New version v{version} is available!',
    updateManualDevelopmentVersion: 'You\'re running a development version (v{currentVersion}). Latest release is v{latestVersion}.',
    updateManualLatestVersion: 'You\'re running the latest version!',
    dismiss: 'Dismiss',
    neverChecked: 'Never checked for updates',
    lastCheckedLessThanHour: 'Last checked: less than an hour ago',
    lastCheckedHoursAgo: 'Last checked: {n} hour ago',
    lastCheckedHoursAgoPlural: 'Last checked: {n} hours ago',
    lastCheckedDaysAgo: 'Last checked: {n} day ago',
    lastCheckedDaysAgoPlural: 'Last checked: {n} days ago',
    checking: 'Checking...',

    // Calendar
    clear: 'Clear',
    today: 'Today',

    // Days of week
    sunday: 'Su',
    monday: 'Mo',
    tuesday: 'Tu',
    wednesday: 'We',
    thursday: 'Th',
    friday: 'Fr',
    saturday: 'Sa',

    // Months (for calendar)
    january: 'January',
    february: 'February',
    march: 'March',
    april: 'April',
    may: 'May',
    june: 'June',
    july: 'July',
    august: 'August',
    september: 'September',
    october: 'October',
    november: 'November',
    december: 'December',

    // Todo date picker
    clearDate: 'Clear',
    todayDate: 'Today',
    
    // Todo filters
    filterAll: 'All',
    filterPending: 'Pending',
    filterCompleted: 'Completed',
    filterOverdue: 'Overdue',
    priorityHigh: 'High',
    priorityMedium: 'Medium',
    priorityLow: 'Low',
    clearCompletedText: 'Clear Completed',
    clearCompletedConfirmTitle: 'Clear Completed Todos?',
    clearCompletedConfirmMessage: 'This will permanently remove all completed todos. This action cannot be undone.',
    clearCompletedConfirmButton: 'Clear Completed',
    emptyStateTitle: 'No todos yet. Add one above!',
    emptyStateDesc: 'Try adding due dates for better organization.',

    // Todo bulk selection toolbar (issue #942)
    bulkActionsLabel: 'Bulk todo actions',
    bulkComplete: 'Mark complete',
    bulkDelete: 'Delete',
    selectedCount: '{count} selected',
    todoSelectAria: 'Select todo: {text}',
    exportTodos: 'Export',
    importTodos: 'Import',
    importConfirmTitle: 'Import Todos',
    importConfirmMessage: 'How would you like to import? Merge adds new todos while keeping existing ones. Replace clears all current todos and imports the new list.',
    importMerge: 'Merge',
    importReplace: 'Replace',
    importInvalidData: 'Invalid todo data. Please select a valid JSON file.',
    importReadError: 'Failed to read the selected file.',
    importSuccess: 'Imported {count} todos successfully.',
    importNoNewTodos: 'No new todos to import.',

    // Data Manager
    data: 'Data',
    dataBackupTitle: 'Backup & Restore',
    dataBackupDesc: 'Export your settings or import from a backup file',
    exportData: 'Export Data',
    exportDataDesc: 'Download a JSON file with all your settings, todos, notes, and apps',
    exportDataBtn: 'Export Data',
    dataExportSuccess: 'Data exported successfully.',
    dataExportReadError: 'Export failed: could not read all settings.',
    importData: 'Import Data',
    importDataDesc: 'Restore settings from a previously exported backup file',
    importDataBtn: 'Import Data',
    dataImportConfirmTitle: 'Import Data',
    dataImportConfirmMessage: 'How would you like to import? Merge adds new items while keeping existing ones. Replace clears all current data and imports from the backup.',
    dataImportInvalidFile: 'Invalid file format.',
    dataImportInvalidStructure: 'Missing data section.',
    dataImportInvalidKeys: 'Disallowed keys found.',
    dataImportInvalidShape: 'Invalid value for key.',
    dataImportUnsupportedVersion: 'Unsupported backup version.',
    dataImportReadError: 'Failed to read the selected file.',
    dataImportParseError: 'Invalid JSON file.',
    dataImportMergeSuccess: 'Merged {count} settings successfully.',
    dataImportReplaceSuccess: 'Replaced all settings with imported data.',
    dataImportPartialSuccess: 'Import completed with some errors. Some old data could not be removed.',
    dataImportLateWriteFailure: 'Some imported data failed to save after the import finished.',
    dataLimitations: 'Limitations',
    dataLimitationsDesc: 'Custom background images/videos are stored locally and cannot be included in the export file.',

    // Onboarding
    onboardingLanguageTitle: 'Choose Your Language 🌐',
    onboardingLanguageContent: 'Select your preferred language for the interface. You can change this later in Settings.',
    onboardingThemeTitle: 'Choose Your Theme 🌙',
    onboardingThemeContent: 'Select your preferred interface theme. You can switch between dark and light modes anytime in Settings.',
    onboardingWelcomeTitle: 'Welcome to New-Tab! 🎉',
    onboardingWelcomeContent: 'Let\'s take a quick tour of the features to help you get started with personalizing your new tab page.',
    onboardingClockTitle: 'Clock & Date Display',
    onboardingClockContent: 'Your current time and date are displayed here. You can customize the appearance in Settings.',
    onboardingSearchTitle: 'Web Search',
    onboardingSearchContent: 'Search the web from your new tab using your browser\'s default search provider.',
    onboardingAppsTitle: 'App Shortcuts',
    onboardingAppsContent: 'Add your favorite websites as quick-launch icons. Drag and drop to reorder them.',
    onboardingBackgroundTitle: 'Beautiful Backgrounds',
    onboardingBackgroundContent: 'Choose from stunning built-in backgrounds or upload your own. Access this in Settings > Background.',
    onboardingMottoTitle: 'Daily Inspiration',
    onboardingMottoContent: 'Enjoy a new motivational quote each day. Click the refresh button to get a random quote or the copy button to copy it.',
    onboardingSettingsTitle: 'Customization Center',
    onboardingSettingsContent: 'Click the gear icon to access extensive customization options for themes, styling, and more.',
    onboardingCompleteTitle: 'You\'re All Set! ✨',
    onboardingCompleteContent: 'You now know the basics of New-Tab. Explore the settings to make it truly yours. You can always restart this tour from Settings > About.',
    onboardingSaveError: 'Failed to save onboarding completion. Your progress was kept so you can retry.',

    // Onboarding navigation
    previous: 'Previous',
    next: 'Next',
    finish: 'Finish',

    // Keyboard shortcuts
    shortcutFocusSearch: 'Focus Search',
    shortcutOpenSettings: 'Open Settings',
    shortcutToggleFocusMode: 'Toggle Focus Mode',
    shortcutToggleSimpleMode: 'Toggle Simple Mode',
    shortcutToggleTodo: 'Toggle Todo List',
    shortcutToggleNotes: 'Toggle Notes',
    shortcutCloseModal: 'Close Modal / Dialog',
    shortcutPressAKey: 'Press a key...',
    shortcutSaveError: 'Failed to save shortcut changes. Your last action was not saved.',

    // Shortcuts settings tab
    shortcuts: 'Shortcuts',
    keyboardShortcuts: 'Keyboard Shortcuts',
    keyboardShortcutsDesc: 'Customize keyboard shortcuts for quick actions',
    resetToDefaults: 'Reset to Defaults',
    resetShortcuts: 'Reset Shortcuts',

    // AI Assistant
    ai: 'AI Assistant',
    aiAssistant: 'AI Assistant',
    aiWelcome: 'Welcome to AI Assistant',
    aiWelcomeSubtitle: 'Ask me anything!',
    aiPlaceholder: 'Type your message...',
    aiError: 'An error occurred. Please try again.',
    aiRateLimit: 'Too many requests. Please wait.',
    aiRateLimitRetryAfter: 'Rate limited. Try again in {seconds} seconds',
    aiRequestInProgress: 'A request is already in progress. Please wait for it to complete.',
    aiClearConfirm: 'Clear chat history?',
    aiAPIKeyMissing: 'API key not configured',
    aiSearchEnabled: 'Enable AI search',
    aiSearchConversations: 'Search...',
    aiDeleteConfirmTitle: 'Delete Conversation?',
    aiDeleteConfirmMessage: 'This action cannot be undone. The entire conversation will be permanently removed.',
    aiCancel: 'Cancel',
    aiDelete: 'Delete',
    aiNewChat: 'New Chat',
    aiConversations: 'Conversations',
    aiNoConversations: 'No conversations yet',
    aiNoSearchResults: 'No matching conversations',
    aiNewConversation: 'New Conversation',
    aiDeleteConversation: 'Ctrl+Click to delete without confirmation',
    aiDeleteConfirm: 'Delete this conversation?',
    aiJustNow: 'Just now',
    aiOnline: 'Online',
    aiOffline: 'Offline',
    aiThinking: 'Thinking...',
    aiAuthError: 'Invalid or missing API key',
    aiForbidden: 'Access forbidden',
    aiServerError: 'Service error. Please try again later.',
    aiNetworkError: 'Network error occurred',
    aiInvalidResponse: 'Invalid response format',
    aiNoContent: 'No content in response',
    aiMessageRequired: 'Message is required',
    aiMessageEmpty: 'Message cannot be empty',
    aiMessageTooLong: 'Message too long (max 2000 characters)',
    aiMessageInvalidChars: 'Message contains invalid control characters',
    aiStopStreaming: 'Stop',
    aiScrollToBottom: 'Scroll to bottom',
    aiSaveError: 'Failed to save conversations. Your last action was not saved.',
    aiStorageFullError: 'Storage is full. Export or delete old conversations to free space.',
    aiConversationLoadError: 'Some saved conversations could not be loaded. A backup copy of the rejected data was kept.',

    // Bootstrap error overlay
    bootstrapErrorTitle: 'Extension failed to load',
    bootstrapErrorDesc: 'The following module(s) could not be loaded:',
    bootstrapErrorHint: 'If the problem persists, reinstall the extension.',
    bootstrapErrorReload: 'Reload',

    // Eye-care reminder
    eyeCareReminderEnabled: 'Enable eye-care reminder',
    eyeCareReminderDescription: 'Follow the 20-20-20 rule with a gentle break prompt while this tab is visible.',
    eyeCareReminderInterval: 'Break interval',
    eyeCareReminderInterval15: '15 minutes',
    eyeCareReminderInterval20: '20 minutes',
    eyeCareReminderInterval30: '30 minutes',
    eyeCareReminderInterval45: '45 minutes',
    eyeCareReminderInterval60: '60 minutes',
    eyeCareReminderBrowserNotification: 'Browser notification',
    eyeCareReminderTitle: 'Eye-care break',
    eyeCareReminderCountdown: 'Look at something 20 feet away for 20 seconds',
    eyeCareReminderFinished: 'Break complete. Ready when you are.',
    eyeCareReminderSkip: 'Skip',
    eyeCareReminderDone: 'Done',
    eyeCareReminderNotificationBody: 'Look at something 20 feet away for 20 seconds.',

    // Todo stats
    enableTodoStats: 'Enable daily stats',
    statsTitle: 'Stats',
    clearStats: 'Clear Stats',
    completedToday: 'Completed Today',
    completedThisWeek: 'This Week',
    currentStreak: 'Current Streak',
    longestStreak: 'Longest Streak',
    last30Days: 'Last 30 Days',
    statsToggle: 'Stats',
    statsToggleAriaLabel: 'Toggle statistics panel',
    heatmapCellTitle: '$1$: $2$ completed',

    // Pomodoro stats
    enablePomodoroStats: 'Enable focus stats',
    pomodoroStatsTitle: 'Focus Stats',
    pomodoroSessionsToday: 'Sessions Today',
    pomodoroSessionsThisWeek: 'Sessions This Week',
    pomodoroMinutesToday: 'Minutes Today',
    pomodoroMinutesThisWeek: 'Minutes This Week',
    pomodoroHeatmapCellTitle: '$1$: $2$ sessions',
    pomodoroStatsToggle: 'Focus stats',
    pomodoroStatsToggleAriaLabel: 'Toggle focus statistics panel',


    // Web grounding
    aiGroundWithWeb: 'Ground with web',
    aiGroundWithWebDescription: 'Use live web results for current answers.',
    aiSources: 'Sources',
    aiSearchingWeb: 'Searching the web…',
    aiGroundingFallback: 'Web search is unavailable. Answering without live web data.',
    // Games
    ...createGamesTranslations(['Games', 'Enable games', 'Play', 'Continue', 'Saved', 'Back', 'Score', 'High Score', 'Best Moves', 'Moves', 'Time', 'Game Over', 'You Win!', 'Paused', 'Press Space to restart', 'No games available', 'Games are disabled. Enable them in Settings.', 'Snake', 'Classic snake game. Eat food to grow!', 'Arrow keys or WASD to move, Space to pause', '2048', 'Merge tiles to reach 2048!', 'Arrow keys or WASD to merge tiles', 'Memory Match', 'Find matching pairs of cards!', 'Flip cards to find matching pairs'])
  }
};

const customBackgroundErrorTranslations = {
  en: ['Failed to load custom backgrounds. Please try again.', 'Failed to load the custom background. Please try again.', 'Failed to delete the custom background. Please try again.', 'Failed to open the delete confirmation dialog. Please try again.', 'Please select a video file.', 'Please select an image file.', 'Failed to process the file. Please try a different file.'],
  zh: ['无法加载自定义背景。请重试。', '无法加载该自定义背景。请重试。', '无法删除自定义背景。请重试。', '无法打开删除确认对话框。请重试。', '请选择视频文件。', '请选择图片文件。', '处理文件失败。请尝试其他文件。'],
  ja: ['カスタム背景を読み込めませんでした。もう一度お試しください。', 'このカスタム背景を読み込めませんでした。もう一度お試しください。', 'カスタム背景を削除できませんでした。もう一度お試しください。', '削除の確認ダイアログを開けませんでした。もう一度お試しください。', '動画ファイルを選択してください。', '画像ファイルを選択してください。', 'ファイルの処理に失敗しました。別のファイルをお試しください。'],
  ko: ['사용자 지정 배경을 불러오지 못했습니다. 다시 시도해 주세요.', '이 사용자 지정 배경을 불러오지 못했습니다. 다시 시도해 주세요.', '사용자 지정 배경을 삭제하지 못했습니다. 다시 시도해 주세요.', '삭제 확인 대화 상자를 열지 못했습니다. 다시 시도해 주세요.', '동영상 파일을 선택해 주세요.', '이미지 파일을 선택해 주세요.', '파일을 처리하지 못했습니다. 다른 파일로 다시 시도해 주세요.'],
  es: ['No se pudieron cargar los fondos personalizados. Inténtalo de nuevo.', 'No se pudo cargar el fondo personalizado. Inténtalo de nuevo.', 'No se pudo eliminar el fondo personalizado. Inténtalo de nuevo.', 'No se pudo abrir el diálogo de confirmación de eliminación. Inténtalo de nuevo.', 'Selecciona un archivo de vídeo.', 'Selecciona un archivo de imagen.', 'No se pudo procesar el archivo. Inténtalo con un archivo diferente.'],
  fr: ['Impossible de charger les arrière-plans personnalisés. Veuillez réessayer.', 'Impossible de charger l’arrière-plan personnalisé. Veuillez réessayer.', 'Impossible de supprimer l’arrière-plan personnalisé. Veuillez réessayer.', 'Impossible d’ouvrir la boîte de dialogue de confirmation de suppression. Veuillez réessayer.', 'Veuillez sélectionner un fichier vidéo.', 'Veuillez sélectionner un fichier image.', 'Impossible de traiter le fichier. Veuillez essayer un autre fichier.'],
  de: ['Benutzerdefinierte Hintergründe konnten nicht geladen werden. Bitte versuche es erneut.', 'Der benutzerdefinierte Hintergrund konnte nicht geladen werden. Bitte versuche es erneut.', 'Der benutzerdefinierte Hintergrund konnte nicht gelöscht werden. Bitte versuche es erneut.', 'Der Bestätigungsdialog zum Löschen konnte nicht geöffnet werden. Bitte versuche es erneut.', 'Bitte wähle eine Videodatei aus.', 'Bitte wähle eine Bilddatei aus.', 'Die Datei konnte nicht verarbeitet werden. Bitte versuche es mit einer anderen Datei.'],
  pt: ['Não foi possível carregar os planos de fundo personalizados. Tente novamente.', 'Não foi possível carregar o plano de fundo personalizado. Tente novamente.', 'Não foi possível excluir o plano de fundo personalizado. Tente novamente.', 'Não foi possível abrir o diálogo de confirmação de exclusão. Tente novamente.', 'Selecione um arquivo de vídeo.', 'Selecione um arquivo de imagem.', 'Não foi possível processar o arquivo. Tente com um arquivo diferente.'],
  ru: ['Не удалось загрузить пользовательские фоны. Повторите попытку.', 'Не удалось загрузить пользовательский фон. Повторите попытку.', 'Не удалось удалить пользовательский фон. Повторите попытку.', 'Не удалось открыть диалог подтверждения удаления. Повторите попытку.', 'Выберите видеофайл.', 'Выберите файл изображения.', 'Не удалось обработать файл. Попробуйте другой файл.']
};

// Merge passes are applied per locale instead of once for every locale: en
// runs them at evaluation time below, and a lazily loaded locale runs them
// from registerLocale() so its table ends up exactly as complete as en.
function applyCustomBackgroundErrorMerges(code) {
  const target = translations[code];
  const messages = customBackgroundErrorTranslations[code];
  if (!target || !messages) return;
  target.customBackgroundsLoadError = messages[0];
  target.customBackgroundLoadError = messages[1];
  target.customBackgroundDeleteError = messages[2];
  target.customBackgroundDialogError = messages[3];
  target.customBgSelectVideo = messages[4];
  target.customBgSelectImage = messages[5];
  target.customBgProcessError = messages[6];
}

// The AI export strings are defined here rather than inline in each per-locale
// block. Those blocks are structurally identical across locales, so repeating
// the same five keys in every one would count as new duplication in
// SonarCloud's quality gate (same reason the gamesLevel map exists below).
const aiExportTranslations = {
  en: ['Export conversation as Markdown', 'Export All', 'Conversation exported.', 'Conversations exported.', 'Failed to export the conversation.'],
  zh: ['导出对话为 Markdown', '导出全部', '对话已导出。', '对话已全部导出。', '导出对话失败。'],
  ja: ['会話をMarkdownでエクスポート', 'すべてエクスポート', '会話をエクスポートしました。', '会話をすべてエクスポートしました。', '会話のエクスポートに失敗しました。'],
  ko: ['대화를 Markdown으로 내보내기', '모두 내보내기', '대화를 내보냈습니다.', '모든 대화를 내보냈습니다.', '대화를 내보내지 못했습니다.'],
  es: ['Exportar conversación como Markdown', 'Exportar todo', 'Conversación exportada.', 'Conversaciones exportadas.', 'No se pudo exportar la conversación.'],
  fr: ['Exporter la conversation en Markdown', 'Tout exporter', 'Conversation exportée.', 'Conversations exportées.', 'Échec de l\'export de la conversation.'],
  de: ['Unterhaltung als Markdown exportieren', 'Alle exportieren', 'Unterhaltung exportiert.', 'Unterhaltungen exportiert.', 'Export der Unterhaltung fehlgeschlagen.'],
  pt: ['Exportar conversa como Markdown', 'Exportar tudo', 'Conversa exportada.', 'Conversas exportadas.', 'Falha ao exportar a conversa.'],
  ru: ['Экспортировать беседу в Markdown', 'Экспортировать все', 'Беседа экспортирована.', 'Беседы экспортированы.', 'Не удалось экспортировать беседу.']
};

function applyAiExportMerges(code) {
  const target = translations[code];
  const messages = aiExportTranslations[code];
  if (!target || !messages) return;
  target.aiExportConversation = messages[0];
  target.aiExportAll = messages[1];
  target.aiExportSuccess = messages[2];
  target.aiExportAllSuccess = messages[3];
  target.aiExportError = messages[4];
}

// The games "Level" label is defined here rather than in the per-locale
// createGamesTranslations arrays. Those blocks are structurally identical across
// locales, so appending a string to each one would count every line as new
// duplication in SonarCloud's quality gate. Because it is no longer part of the
// positional arrays, the 'gamesLevel' key must stay out of GAMES_TRANSLATION_KEYS
// (that list drives createGamesTranslations one-to-one), and this map is the
// single source of truth for the key: every locale in SUPPORTED_LANGUAGES must
// have an entry here, or gamesLevel will be undefined for it.
const gamesLevelTranslations = {
  en: 'Level',
  zh: '等级',
  ja: 'レベル',
  ko: '레벨',
  es: 'Nivel',
  fr: 'Niveau',
  de: 'Level',
  pt: 'Nível',
  ru: 'Уровень'
};

function applyGamesLevelMerges(code) {
  const target = translations[code];
  if (!target || !gamesLevelTranslations[code]) return;
  target.gamesLevel = gamesLevelTranslations[code];
}

// Like gamesLevel, the ready-screen strings live in a per-language map instead
// of the positional createGamesTranslations arrays so they don't add duplicated
// lines to the SonarCloud quality gate. Each supported language must have an
// entry here, or the key resolves to the English fallback in the games.
const gamesReadyTranslations = {
  en: { gamesReady: 'Ready?', gamesReadyStart: 'Press Space or tap to start', gamesStart: 'Start' },
  zh: { gamesReady: '准备好了吗？', gamesReadyStart: '按空格键或轻触开始', gamesStart: '开始' },
  ja: { gamesReady: '準備はいいですか？', gamesReadyStart: 'スペースキーまたはタップで開始', gamesStart: '開始' },
  ko: { gamesReady: '준비됐나요?', gamesReadyStart: '스페이스바를 누르거나 탭하여 시작', gamesStart: '시작' },
  es: { gamesReady: '¿Listo?', gamesReadyStart: 'Presiona espacio o toca para comenzar', gamesStart: 'Comenzar' },
  fr: { gamesReady: 'Prêt ?', gamesReadyStart: 'Appuyez sur espace ou touchez pour commencer', gamesStart: 'Commencer' },
  de: { gamesReady: 'Bereit?', gamesReadyStart: 'Leertaste drücken oder antippen zum Starten', gamesStart: 'Starten' },
  pt: { gamesReady: 'Pronto?', gamesReadyStart: 'Pressione espaço ou toque para começar', gamesStart: 'Começar' },
  ru: { gamesReady: 'Готовы?', gamesReadyStart: 'Нажмите пробел или коснитесь, чтобы начать', gamesStart: 'Старт' }
};

function applyGamesReadyMerges(code) {
  const target = translations[code];
  const values = gamesReadyTranslations[code];
  if (!target || !values) return;
  Object.assign(target, values);
}
const flappyBirdTranslations = {
  en: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird game. Guide the bird through the pipes!',
    gamesFlappyBirdControls: 'Press ↑ / W or tap/click to flap; Space pauses/resumes'
  },
  zh: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird 遊戲。引導小鳥穿過水管！',
    gamesFlappyBirdControls: '按 ↑ / W 或點擊/觸摸拍翅；空格暫停/繼續'
  },
  ja: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird。鳥を操作してパイプの間を飛び抜けよう！',
    gamesFlappyBirdControls: '↑ / W またはタップ/クリックで羽ばたき、Space で一時停止/再開'
  },
  ko: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird 게임. 파이프 사이로 새를 안내하세요!',
    gamesFlappyBirdControls: '↑ / W 또는 탭/클릭으로 비행; Space로 일시정지/재개'
  },
  es: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Juego Flappy Bird. ¡Guía al pájaro entre las tuberías!',
    gamesFlappyBirdControls: 'Pulsa ↑ / W o toca/haz clic para aletear; Espacio pausa/reanuda'
  },
  fr: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Jeu Flappy Bird. Guidez l\'oiseau entre les tuyaux !',
    gamesFlappyBirdControls: '↑ / W ou toucher/cliquer pour battre des ailes ; Espace met en pause/reprend'
  },
  de: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy-Bird-Spiel. Führe den Vogel durch die Rohre!',
    gamesFlappyBirdControls: '↑ / W oder Tippen/Klicken zum Flattern; Leertaste pausiert/setzt fort'
  },
  pt: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Jogo Flappy Bird. Guie o pássaro entre os canos!',
    gamesFlappyBirdControls: 'Pressione ↑ / W ou toque/clique para bater as asas; Espaço pausa/retoma'
  },
  ru: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Игра Flappy Bird. Проведите птицу между трубами!',
    gamesFlappyBirdControls: 'Нажимайте ↑ / W или касайтесь/кликайте для взмаха; Пробел ставит на паузу/продолжает'
  },
  en_US: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird game. Guide the bird through the pipes!',
    gamesFlappyBirdControls: 'Press ↑ / W or tap/click to flap; Space pauses/resumes'
  },
  pt_BR: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Jogo Flappy Bird. Guie o pássaro entre os canos!',
    gamesFlappyBirdControls: 'Pressione ↑ / W ou toque/clique para bater as asas; Espaço pausa/retoma'
  },
  zh_CN: {
    gamesFlappyBird: 'Flappy Bird',
    gamesFlappyBirdDesc: 'Flappy Bird 游戏。引导小鸟穿过水管！',
    gamesFlappyBirdControls: '按 ↑ / W 或点击/触摸拍翅；空格暂停/继续'
  }
};

function applyFlappyBirdMerges(code) {
  const target = translations[code];
  const values = flappyBirdTranslations[code];
  if (!target || !values) return;
  Object.assign(target, values);
}

const pacmanTranslations = {
  en: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Pac-Man maze game. Eat every dot and dodge the ghosts!',
    gamesPacmanControls: 'Arrow keys or WASD to move, Space to pause',
    gamesLives: 'Lives'
  },
  zh: {
    gamesPacman: '吃豆人',
    gamesPacmanDesc: 'Pac-Man 迷宮遊戲。吃掉所有豆子並躲避鬼怪！',
    gamesPacmanControls: '方向鍵或 WASD 移動，空格鍵暫停',
    gamesLives: '生命'
  },
  ja: {
    gamesPacman: 'パックマン',
    gamesPacmanDesc: 'Pac-Manの迷路ゲーム。すべてのドットを食べてゴーストを避けよう！',
    gamesPacmanControls: '矢印キーまたはWASDで移動、スペースで一時停止',
    gamesLives: '残機'
  },
  ko: {
    gamesPacman: '팩맨',
    gamesPacmanDesc: 'Pac-Man 미로 게임. 모든 점을 먹고 유령을 피하세요!',
    gamesPacmanControls: '방향키 또는 WASD로 이동, 스페이스바로 일시정지',
    gamesLives: '남은 목숨'
  },
  es: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Juego de laberinto Pac-Man. ¡Come todos los puntos y esquiva a los fantasmas!',
    gamesPacmanControls: 'Flechas o WASD para mover, espacio para pausar',
    gamesLives: 'Vidas'
  },
  fr: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Jeu de labyrinthe Pac-Man. Mangez tous les points et évitez les fantômes !',
    gamesPacmanControls: 'Flèches ou ZQSD pour se déplacer, espace pour pause',
    gamesLives: 'Vies'
  },
  de: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Pac-Man-Labyrinth. Iss alle Punkte und meide die Geister!',
    gamesPacmanControls: 'Pfeile oder WASD zum Steuern, Leertaste zum Pausieren',
    gamesLives: 'Leben'
  },
  pt: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Jogo de labirinto Pac-Man. Coma todos os pontos e fuja dos fantasmas!',
    gamesPacmanControls: 'Setas ou WASD para mover, espaço para pausar',
    gamesLives: 'Vidas'
  },
  ru: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Лабиринт Pac-Man. Съешьте все точки и избегайте призраков!',
    gamesPacmanControls: 'Стрелки или WASD для движения, пробел для паузы',
    gamesLives: 'Жизни'
  },
  en_US: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Pac-Man maze game. Eat every dot and dodge the ghosts!',
    gamesPacmanControls: 'Arrow keys or WASD to move, Space to pause',
    gamesLives: 'Lives'
  },
  pt_BR: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Jogo de labirinto Pac-Man. Coma todos os pontos e fuja dos fantasmas!',
    gamesPacmanControls: 'Setas ou WASD para mover, espaço para pausar',
    gamesLives: 'Vidas'
  },
  zh_CN: {
    gamesPacman: 'Pac-Man',
    gamesPacmanDesc: 'Pac-Man 游戏。吃掉所有豆子并躲避幽灵！',
    gamesPacmanControls: '方向键或 WASD 移动，空格键暂停',
    gamesLives: '生命'
  }
};

function applyPacmanMerges(code) {
  const target = translations[code];
  const values = pacmanTranslations[code];
  if (!target || !values) return;
  Object.assign(target, values);
}

const pomodoroTranslations = {
  en: {
    enablePomodoro: 'Enable Pomodoro focus timer', pomodoroDurations: 'Focus Timer Durations', pomodoroDurationsDesc: 'Configure work and break durations (in minutes)', pomodoroWork: 'Work', pomodoroShortBreak: 'Short Break', pomodoroLongBreak: 'Long Break', pomodoroSessionsBeforeLong: 'Sessions before long break', pomodoroPhaseWork: 'Focus', pomodoroPhaseShortBreak: 'Short Break', pomodoroPhaseLongBreak: 'Long Break', pomodoroSessionLabel: 'Session {number}', pomodoroPause: 'Pause', pomodoroResume: 'Resume', pomodoroSkip: 'Skip', pomodoroReset: 'Reset', pomodoroStartFocus: 'Start Focus', pomodoroStopFocus: 'Stop Focus', pomodoroWorkComplete: 'Focus session complete!', pomodoroWorkCompleteBody: 'Task: {task}', pomodoroWorkCompleteNoTaskBody: 'Time for a break.', pomodoroBreakComplete: 'Break over!', pomodoroBreakCompleteBody: 'Ready to focus again?', enablePomodoroStats: 'Enable focus stats', pomodoroStatsTitle: 'Focus Stats', pomodoroSessionsToday: 'Sessions Today', pomodoroSessionsThisWeek: 'This Week', pomodoroMinutesToday: 'Minutes Today', pomodoroMinutesThisWeek: 'Minutes This Week', pomodoroHeatmapCellTitle: '$1$: $2$ sessions', pomodoroStatsToggle: 'Focus stats', pomodoroStatsToggleAriaLabel: 'Toggle focus statistics panel'
  },
  zh: {
    enablePomodoro: '啟用番茄鐘專注計時器', pomodoroDurations: '專注計時器時長', pomodoroDurationsDesc: '配置工作和休息時長（分鐘）', pomodoroWork: '專注', pomodoroShortBreak: '短休息', pomodoroLongBreak: '長休息', pomodoroSessionsBeforeLong: '長休息前的專注次數', pomodoroPhaseWork: '專注', pomodoroPhaseShortBreak: '短休息', pomodoroPhaseLongBreak: '長休息', pomodoroSessionLabel: '第 {number} 次', pomodoroPause: '暫停', pomodoroResume: '繼續', pomodoroSkip: '跳過', pomodoroReset: '重置', pomodoroStartFocus: '開始專注', pomodoroStopFocus: '停止專注', pomodoroWorkComplete: '專注完成！', pomodoroWorkCompleteBody: '任務：{task}', pomodoroWorkCompleteNoTaskBody: '該休息一下了。', pomodoroBreakComplete: '休息結束！', pomodoroBreakCompleteBody: '準備好重新專注了嗎？', enablePomodoroStats: '启用专注统计', pomodoroStatsTitle: '专注统计', pomodoroSessionsToday: '今日专注次数', pomodoroSessionsThisWeek: '本周专注次数', pomodoroMinutesToday: '今日专注时长', pomodoroMinutesThisWeek: '本周专注时长', pomodoroHeatmapCellTitle: '$1$：$2$ 次专注', pomodoroStatsToggle: '专注统计', pomodoroStatsToggleAriaLabel: '切换专注统计面板'
  },
  ja: {
    enablePomodoro: 'ポモドーロ集中タイマーを有効にする', pomodoroDurations: '集中タイマーの時間', pomodoroDurationsDesc: '作業時間と休憩時間を設定します（分）', pomodoroWork: '作業', pomodoroShortBreak: '短い休憩', pomodoroLongBreak: '長い休憩', pomodoroSessionsBeforeLong: '長い休憩までのセッション数', pomodoroPhaseWork: '集中', pomodoroPhaseShortBreak: '短い休憩', pomodoroPhaseLongBreak: '長い休憩', pomodoroSessionLabel: 'セッション {number}', pomodoroPause: '一時停止', pomodoroResume: '再開', pomodoroSkip: 'スキップ', pomodoroReset: 'リセット', pomodoroStartFocus: '集中を開始', pomodoroStopFocus: '集中を停止', pomodoroWorkComplete: '集中セッションが完了しました！', pomodoroWorkCompleteBody: 'タスク: {task}', pomodoroWorkCompleteNoTaskBody: '休憩の時間です。', pomodoroBreakComplete: '休憩終了！', pomodoroBreakCompleteBody: '再び集中する準備はできましたか？', enablePomodoroStats: '集中統計を有効にする', pomodoroStatsTitle: '集中統計', pomodoroSessionsToday: '今日のセッション', pomodoroSessionsThisWeek: '今週のセッション', pomodoroMinutesToday: '今日の集中時間', pomodoroMinutesThisWeek: '今週の集中時間', pomodoroHeatmapCellTitle: '$1$：$2$ セッション', pomodoroStatsToggle: '集中統計', pomodoroStatsToggleAriaLabel: '集中統計パネルを切り替える'
  },
  ko: {
    enablePomodoro: '포모도로 집중 타이머 사용', pomodoroDurations: '집중 타이머 시간', pomodoroDurationsDesc: '작업 및 휴식 시간을 설정하세요(분)', pomodoroWork: '작업', pomodoroShortBreak: '짧은 휴식', pomodoroLongBreak: '긴 휴식', pomodoroSessionsBeforeLong: '긴 휴식 전 세션 수', pomodoroPhaseWork: '집중', pomodoroPhaseShortBreak: '짧은 휴식', pomodoroPhaseLongBreak: '긴 휴식', pomodoroSessionLabel: '세션 {number}', pomodoroPause: '일시 정지', pomodoroResume: '재개', pomodoroSkip: '건너뛰기', pomodoroReset: '재설정', pomodoroStartFocus: '집중 시작', pomodoroStopFocus: '집중 중지', pomodoroWorkComplete: '집중 세션이 완료되었습니다!', pomodoroWorkCompleteBody: '작업: {task}', pomodoroWorkCompleteNoTaskBody: '휴식 시간입니다.', pomodoroBreakComplete: '휴식 종료!', pomodoroBreakCompleteBody: '다시 집중할 준비가 되었나요?', enablePomodoroStats: '집중 통계 사용', pomodoroStatsTitle: '집중 통계', pomodoroSessionsToday: '오늘 세션', pomodoroSessionsThisWeek: '이번 주 세션', pomodoroMinutesToday: '오늘 집중 시간', pomodoroMinutesThisWeek: '이번 주 집중 시간', pomodoroHeatmapCellTitle: '$1$: $2$ 세션', pomodoroStatsToggle: '집중 통계', pomodoroStatsToggleAriaLabel: '집중 통계 패널 전환'
  },
  es: {
    enablePomodoro: 'Activar temporizador Pomodoro', pomodoroDurations: 'Duraciones del temporizador', pomodoroDurationsDesc: 'Configura las duraciones de trabajo y descanso (en minutos)', pomodoroWork: 'Trabajo', pomodoroShortBreak: 'Descanso corto', pomodoroLongBreak: 'Descanso largo', pomodoroSessionsBeforeLong: 'Sesiones antes del descanso largo', pomodoroPhaseWork: 'Enfoque', pomodoroPhaseShortBreak: 'Descanso corto', pomodoroPhaseLongBreak: 'Descanso largo', pomodoroSessionLabel: 'Sesión {number}', pomodoroPause: 'Pausar', pomodoroResume: 'Reanudar', pomodoroSkip: 'Saltar', pomodoroReset: 'Restablecer', pomodoroStartFocus: 'Iniciar enfoque', pomodoroStopFocus: 'Detener enfoque', pomodoroWorkComplete: '¡Sesión de enfoque completada!', pomodoroWorkCompleteBody: 'Tarea: {task}', pomodoroWorkCompleteNoTaskBody: 'Hora de tomar un descanso.', pomodoroBreakComplete: '¡Fin del descanso!', pomodoroBreakCompleteBody: '¿Listo para volver a concentrarte?', enablePomodoroStats: 'Activar estadísticas de enfoque', pomodoroStatsTitle: 'Estadísticas de enfoque', pomodoroSessionsToday: 'Sesiones hoy', pomodoroSessionsThisWeek: 'Sesiones esta semana', pomodoroMinutesToday: 'Minutos hoy', pomodoroMinutesThisWeek: 'Minutos esta semana', pomodoroHeatmapCellTitle: '$1$: $2$ sesiones', pomodoroStatsToggle: 'Estadísticas de enfoque', pomodoroStatsToggleAriaLabel: 'Alternar panel de estadísticas de enfoque'
  },
  fr: {
    enablePomodoro: 'Activer le minuteur Pomodoro', pomodoroDurations: 'Durées du minuteur', pomodoroDurationsDesc: 'Configurez les durées de travail et de pause (en minutes)', pomodoroWork: 'Travail', pomodoroShortBreak: 'Pause courte', pomodoroLongBreak: 'Pause longue', pomodoroSessionsBeforeLong: 'Sessions avant la pause longue', pomodoroPhaseWork: 'Concentration', pomodoroPhaseShortBreak: 'Pause courte', pomodoroPhaseLongBreak: 'Pause longue', pomodoroSessionLabel: 'Session {number}', pomodoroPause: 'Mettre en pause', pomodoroResume: 'Reprendre', pomodoroSkip: 'Passer', pomodoroReset: 'Réinitialiser', pomodoroStartFocus: 'Commencer à se concentrer', pomodoroStopFocus: 'Arrêter la concentration', pomodoroWorkComplete: 'Session de concentration terminée !', pomodoroWorkCompleteBody: 'Tâche : {task}', pomodoroWorkCompleteNoTaskBody: 'Il est temps de faire une pause.', pomodoroBreakComplete: 'Fin de la pause !', pomodoroBreakCompleteBody: 'Prêt à vous concentrer à nouveau ?', enablePomodoroStats: 'Activer les statistiques de concentration', pomodoroStatsTitle: 'Statistiques de concentration', pomodoroSessionsToday: 'Sessions aujourd\'hui', pomodoroSessionsThisWeek: 'Sessions cette semaine', pomodoroMinutesToday: 'Minutes aujourd\'hui', pomodoroMinutesThisWeek: 'Minutes cette semaine', pomodoroHeatmapCellTitle: '$1$ : $2$ sessions', pomodoroStatsToggle: 'Statistiques de concentration', pomodoroStatsToggleAriaLabel: 'Basculer le panneau de statistiques de concentration'
  },
  de: {
    enablePomodoro: 'Pomodoro-Fokus-Timer aktivieren', pomodoroDurations: 'Fokus-Timer-Dauern', pomodoroDurationsDesc: 'Arbeits- und Pausenzeiten konfigurieren (in Minuten)', pomodoroWork: 'Arbeit', pomodoroShortBreak: 'Kurze Pause', pomodoroLongBreak: 'Lange Pause', pomodoroSessionsBeforeLong: 'Sitzungen vor langer Pause', pomodoroPhaseWork: 'Fokus', pomodoroPhaseShortBreak: 'Kurze Pause', pomodoroPhaseLongBreak: 'Lange Pause', pomodoroSessionLabel: 'Sitzung {number}', pomodoroPause: 'Pausieren', pomodoroResume: 'Fortsetzen', pomodoroSkip: 'Überspringen', pomodoroReset: 'Zurücksetzen', pomodoroStartFocus: 'Fokus starten', pomodoroStopFocus: 'Fokus beenden', pomodoroWorkComplete: 'Fokus-Sitzung abgeschlossen!', pomodoroWorkCompleteBody: 'Aufgabe: {task}', pomodoroWorkCompleteNoTaskBody: 'Zeit für eine Pause.', pomodoroBreakComplete: 'Pause beendet!', pomodoroBreakCompleteBody: 'Bereit, wieder zu fokussieren?', enablePomodoroStats: 'Fokus-Statistiken aktivieren', pomodoroStatsTitle: 'Fokus-Statistiken', pomodoroSessionsToday: 'Sitzungen heute', pomodoroSessionsThisWeek: 'Sitzungen diese Woche', pomodoroMinutesToday: 'Minuten heute', pomodoroMinutesThisWeek: 'Minuten diese Woche', pomodoroHeatmapCellTitle: '$1$: $2$ Sitzungen', pomodoroStatsToggle: 'Fokus-Statistiken', pomodoroStatsToggleAriaLabel: 'Fokus-Statistik-Panel umschalten'
  },
  pt: {
    enablePomodoro: 'Ativar temporizador Pomodoro', pomodoroDurations: 'Durações do temporizador', pomodoroDurationsDesc: 'Configure as durações de trabalho e pausa (em minutos)', pomodoroWork: 'Trabalho', pomodoroShortBreak: 'Pausa curta', pomodoroLongBreak: 'Pausa longa', pomodoroSessionsBeforeLong: 'Sessões antes da pausa longa', pomodoroPhaseWork: 'Foco', pomodoroPhaseShortBreak: 'Pausa curta', pomodoroPhaseLongBreak: 'Pausa longa', pomodoroSessionLabel: 'Sessão {number}', pomodoroPause: 'Pausar', pomodoroResume: 'Retomar', pomodoroSkip: 'Pular', pomodoroReset: 'Redefinir', pomodoroStartFocus: 'Iniciar foco', pomodoroStopFocus: 'Parar foco', pomodoroWorkComplete: 'Sessão de foco concluída!', pomodoroWorkCompleteBody: 'Tarefa: {task}', pomodoroWorkCompleteNoTaskBody: 'Hora de fazer uma pausa.', pomodoroBreakComplete: 'Pausa terminada!', pomodoroBreakCompleteBody: 'Pronto para focar novamente?', enablePomodoroStats: 'Ativar estatísticas de foco', pomodoroStatsTitle: 'Estatísticas de foco', pomodoroSessionsToday: 'Sessões hoje', pomodoroSessionsThisWeek: 'Sessões esta semana', pomodoroMinutesToday: 'Minutos hoje', pomodoroMinutesThisWeek: 'Minutos esta semana', pomodoroHeatmapCellTitle: '$1$: $2$ sessões', pomodoroStatsToggle: 'Estatísticas de foco', pomodoroStatsToggleAriaLabel: 'Alternar painel de estatísticas de foco'
  },
  ru: {
    enablePomodoro: 'Включить таймер «Помодоро»', pomodoroDurations: 'Длительность таймера', pomodoroDurationsDesc: 'Настройте длительность работы и перерывов (в минутах)', pomodoroWork: 'Работа', pomodoroShortBreak: 'Короткий перерыв', pomodoroLongBreak: 'Длинный перерыв', pomodoroSessionsBeforeLong: 'Сессий до длинного перерыва', pomodoroPhaseWork: 'Фокус', pomodoroPhaseShortBreak: 'Короткий перерыв', pomodoroPhaseLongBreak: 'Длинный перерыв', pomodoroSessionLabel: 'Сессия {number}', pomodoroPause: 'Пауза', pomodoroResume: 'Продолжить', pomodoroSkip: 'Пропустить', pomodoroReset: 'Сбросить', pomodoroStartFocus: 'Начать фокус', pomodoroStopFocus: 'Остановить фокус', pomodoroWorkComplete: 'Фокус-сессия завершена!', pomodoroWorkCompleteBody: 'Задача: {task}', pomodoroWorkCompleteNoTaskBody: 'Время для перерыва.', pomodoroBreakComplete: 'Перерыв окончен!', pomodoroBreakCompleteBody: 'Готовы снова сосредоточиться?', enablePomodoroStats: 'Включить статистику фокуса', pomodoroStatsTitle: 'Статистика фокуса', pomodoroSessionsToday: 'Сессий сегодня', pomodoroSessionsThisWeek: 'Сессий на этой неделе', pomodoroMinutesToday: 'Минут сегодня', pomodoroMinutesThisWeek: 'Минут на этой неделе', pomodoroHeatmapCellTitle: '$1$: $2$ сессий', pomodoroStatsToggle: 'Статистика фокуса', pomodoroStatsToggleAriaLabel: 'Переключить панель статистики фокуса'
  },
  en_US: {
    enablePomodoro: 'Enable Pomodoro focus timer', pomodoroDurations: 'Focus Timer Durations', pomodoroDurationsDesc: 'Configure work and break durations (in minutes)', pomodoroWork: 'Work', pomodoroShortBreak: 'Short Break', pomodoroLongBreak: 'Long Break', pomodoroSessionsBeforeLong: 'Sessions before long break', pomodoroPhaseWork: 'Focus', pomodoroPhaseShortBreak: 'Short Break', pomodoroPhaseLongBreak: 'Long Break', pomodoroSessionLabel: 'Session {number}', pomodoroPause: 'Pause', pomodoroResume: 'Resume', pomodoroSkip: 'Skip', pomodoroReset: 'Reset', pomodoroStartFocus: 'Start Focus', pomodoroStopFocus: 'Stop Focus', pomodoroWorkComplete: 'Focus session complete!', pomodoroWorkCompleteBody: 'Task: {task}', pomodoroWorkCompleteNoTaskBody: 'Time for a break.', pomodoroBreakComplete: 'Break over!', pomodoroBreakCompleteBody: 'Ready to focus again?', enablePomodoroStats: 'Enable focus stats', pomodoroStatsTitle: 'Focus Stats', pomodoroSessionsToday: 'Sessions Today', pomodoroSessionsThisWeek: 'Sessions This Week', pomodoroMinutesToday: 'Minutes Today', pomodoroMinutesThisWeek: 'Minutes This Week', pomodoroHeatmapCellTitle: '$1$: $2$ sessions', pomodoroStatsToggle: 'Focus stats', pomodoroStatsToggleAriaLabel: 'Toggle focus statistics panel'
  },
  pt_BR: {
    enablePomodoro: 'Ativar temporizador Pomodoro', pomodoroDurations: 'Durações do temporizador', pomodoroDurationsDesc: 'Configure as durações de trabalho e pausa (em minutos)', pomodoroWork: 'Trabalho', pomodoroShortBreak: 'Pausa curta', pomodoroLongBreak: 'Pausa longa', pomodoroSessionsBeforeLong: 'Sessões antes da pausa longa', pomodoroPhaseWork: 'Foco', pomodoroPhaseShortBreak: 'Pausa curta', pomodoroPhaseLongBreak: 'Pausa longa', pomodoroSessionLabel: 'Sessão {number}', pomodoroPause: 'Pausar', pomodoroResume: 'Retomar', pomodoroSkip: 'Pular', pomodoroReset: 'Redefinir', pomodoroStartFocus: 'Iniciar foco', pomodoroStopFocus: 'Parar foco', pomodoroWorkComplete: 'Sessão de foco concluída!', pomodoroWorkCompleteBody: 'Tarefa: {task}', pomodoroWorkCompleteNoTaskBody: 'Hora de fazer uma pausa.', pomodoroBreakComplete: 'Pausa terminada!', pomodoroBreakCompleteBody: 'Pronto para focar novamente?', enablePomodoroStats: 'Ativar estatísticas de foco', pomodoroStatsTitle: 'Estatísticas de foco', pomodoroSessionsToday: 'Sessões hoje', pomodoroSessionsThisWeek: 'Sessões esta semana', pomodoroMinutesToday: 'Minutos hoje', pomodoroMinutesThisWeek: 'Minutos esta semana', pomodoroHeatmapCellTitle: '$1$: $2$ sessões', pomodoroStatsToggle: 'Estatísticas de foco', pomodoroStatsToggleAriaLabel: 'Alternar painel de estatísticas de foco'
  },
  zh_CN: {
    enablePomodoro: '启用番茄钟专注计时器', pomodoroDurations: '专注计时器时长', pomodoroDurationsDesc: '配置工作和休息时长（分钟）', pomodoroWork: '专注', pomodoroShortBreak: '短休息', pomodoroLongBreak: '长休息', pomodoroSessionsBeforeLong: '长休息前的专注次数', pomodoroPhaseWork: '专注', pomodoroPhaseShortBreak: '短休息', pomodoroPhaseLongBreak: '长休息', pomodoroSessionLabel: '第 {number} 次', pomodoroPause: '暂停', pomodoroResume: '继续', pomodoroSkip: '跳过', pomodoroReset: '重置', pomodoroStartFocus: '开始专注', pomodoroStopFocus: '停止专注', pomodoroWorkComplete: '专注完成！', pomodoroWorkCompleteBody: '任务：{task}', pomodoroWorkCompleteNoTaskBody: '该休息一下了。', pomodoroBreakComplete: '休息结束！', pomodoroBreakCompleteBody: '准备好重新专注了吗？', enablePomodoroStats: '启用专注统计', pomodoroStatsTitle: '专注统计', pomodoroSessionsToday: '今日专注次数', pomodoroSessionsThisWeek: '本周专注次数', pomodoroMinutesToday: '今日专注时长', pomodoroMinutesThisWeek: '本周专注时长', pomodoroHeatmapCellTitle: '$1$：$2$ 次专注', pomodoroStatsToggle: '专注统计', pomodoroStatsToggleAriaLabel: '切换专注统计面板'
  }
};

function applyPomodoroMerges(code) {
  Object.keys(pomodoroTranslations).forEach(function (language) {
    if (language !== code && language.split('_')[0] !== code) return;
    const target = translations[language] || translations[language.split('_')[0]];
    if (target) {
      Object.assign(target, pomodoroTranslations[language]);
    }
  });
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8', nativeName: 'English', nameKey: 'english' },
  { code: 'zh', flag: '\uD83C\uDDE8\uD83C\uDDF3', nativeName: '中文', nameKey: 'chinese' },
  { code: 'ja', flag: '\uD83C\uDDEF\uD83C\uDDF5', nativeName: '日本語', nameKey: 'japanese' },
  { code: 'ko', flag: '\uD83C\uDDF0\uD83C\uDDF7', nativeName: '한국어', nameKey: 'korean' },
  { code: 'es', flag: '\uD83C\uDDEA\uD83C\uDDF8', nativeName: 'Español', nameKey: 'spanish' },
  { code: 'fr', flag: '\uD83C\uDDEB\uD83C\uDDF7', nativeName: 'Français', nameKey: 'french' },
  { code: 'de', flag: '\uD83C\uDDE9\uD83C\uDDEA', nativeName: 'Deutsch', nameKey: 'german' },
  { code: 'pt', flag: '\uD83C\uDDE7\uD83C\uDDF7', nativeName: 'Português', nameKey: 'portuguese' },
  { code: 'ru', flag: '\uD83C\uDDF7\uD83C\uDDFA', nativeName: 'Русский', nameKey: 'russian' }
];

function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

const ACCESSIBILITY_TRANSLATIONS = {
  en: {
    accessibilityCalendar: 'Calendar',
    accessibilityApp: 'App',
    accessibilityAppActions: 'App actions',
    accessibilitySelected: 'selected',
    accessibilityPickedUp: '{name} picked up.',
    accessibilityMoved: '{name} moved.',
    accessibilityNotMoved: '{name} was not moved.',
    accessibilityMoveCancelled: 'Move cancelled.',
    accessibilityFilter: 'Filter: {label}.',
    accessibilityTodoListUpdated: 'Todo list updated. {count} items shown.',
    accessibilityTodoListUpdatedOne: 'Todo list updated. {count} item shown.'
  },
  zh: {
    accessibilityCalendar: '日曆',
    accessibilityApp: '應用程式',
    accessibilityAppActions: '應用程式操作',
    accessibilitySelected: '已選取',
    accessibilityPickedUp: '{name} 已選為移動對象。',
    accessibilityMoved: '{name} 已移動。',
    accessibilityNotMoved: '{name} 未移動。',
    accessibilityMoveCancelled: '已取消移動。',
    accessibilityFilter: '篩選：{label}。',
    accessibilityTodoListUpdated: '待辦清單已更新。已顯示 {count} 項。',
    accessibilityTodoListUpdatedOne: '待辦清單已更新。已顯示 {count} 項。'
  },
  ja: {
    accessibilityCalendar: 'カレンダー',
    accessibilityApp: 'アプリ',
    accessibilityAppActions: 'アプリの操作',
    accessibilitySelected: '選択済み',
    accessibilityPickedUp: '{name} を移動対象にしました。',
    accessibilityMoved: '{name} を移動しました。',
    accessibilityNotMoved: '{name} は移動されませんでした。',
    accessibilityMoveCancelled: '移動をキャンセルしました。',
    accessibilityFilter: 'フィルター：{label}。',
    accessibilityTodoListUpdated: 'ToDoリストを更新しました。{count}件を表示しています。',
    accessibilityTodoListUpdatedOne: 'ToDoリストを更新しました。{count}件を表示しています。'
  },
  ko: {
    accessibilityCalendar: '캘린더',
    accessibilityApp: '앱',
    accessibilityAppActions: '앱 작업',
    accessibilitySelected: '선택됨',
    accessibilityPickedUp: '{name}을(를) 이동 대상으로 선택했습니다.',
    accessibilityMoved: '{name}을(를) 이동했습니다.',
    accessibilityNotMoved: '{name}을(를) 이동하지 못했습니다.',
    accessibilityMoveCancelled: '이동을 취소했습니다.',
    accessibilityFilter: '필터: {label}.',
    accessibilityTodoListUpdated: '할 일 목록이 업데이트되었습니다. {count}개 항목을 표시합니다.',
    accessibilityTodoListUpdatedOne: '할 일 목록이 업데이트되었습니다. {count}개 항목을 표시합니다.'
  },
  es: {
    accessibilityCalendar: 'Calendario',
    accessibilityApp: 'Aplicación',
    accessibilityAppActions: 'Acciones de la aplicación',
    accessibilitySelected: 'seleccionado',
    accessibilityPickedUp: '{name} seleccionado para mover.',
    accessibilityMoved: '{name} movido.',
    accessibilityNotMoved: '{name} no se movió.',
    accessibilityMoveCancelled: 'Movimiento cancelado.',
    accessibilityFilter: 'Filtro: {label}.',
    accessibilityTodoListUpdated: 'Lista de tareas actualizada. Se muestran {count} elementos.',
    accessibilityTodoListUpdatedOne: 'Lista de tareas actualizada. Se muestra {count} elemento.'
  },
  fr: {
    accessibilityCalendar: 'Calendrier',
    accessibilityApp: 'Application',
    accessibilityAppActions: 'Actions de l’application',
    accessibilitySelected: 'sélectionné',
    accessibilityPickedUp: '{name} sélectionnée pour le déplacement.',
    accessibilityMoved: '{name} déplacée.',
    accessibilityNotMoved: '{name} n’a pas été déplacée.',
    accessibilityMoveCancelled: 'Déplacement annulé.',
    accessibilityFilter: 'Filtre : {label}.',
    accessibilityTodoListUpdated: 'Liste de tâches mise à jour. {count} éléments affichés.',
    accessibilityTodoListUpdatedOne: 'Liste de tâches mise à jour. {count} élément affiché.'
  },
  de: {
    accessibilityCalendar: 'Kalender',
    accessibilityApp: 'App',
    accessibilityAppActions: 'App-Aktionen',
    accessibilitySelected: 'ausgewählt',
    accessibilityPickedUp: '{name} zum Verschieben ausgewählt.',
    accessibilityMoved: '{name} verschoben.',
    accessibilityNotMoved: '{name} wurde nicht verschoben.',
    accessibilityMoveCancelled: 'Verschieben abgebrochen.',
    accessibilityFilter: 'Filter: {label}.',
    accessibilityTodoListUpdated: 'Aufgabenliste aktualisiert. {count} Elemente angezeigt.',
    accessibilityTodoListUpdatedOne: 'Aufgabenliste aktualisiert. {count} Element angezeigt.'
  },
  pt: {
    accessibilityCalendar: 'Calendário',
    accessibilityApp: 'Aplicativo',
    accessibilityAppActions: 'Ações do aplicativo',
    accessibilitySelected: 'selecionado',
    accessibilityPickedUp: '{name} selecionado para mover.',
    accessibilityMoved: '{name} movido.',
    accessibilityNotMoved: '{name} não foi movido.',
    accessibilityMoveCancelled: 'Movimentação cancelada.',
    accessibilityFilter: 'Filtro: {label}.',
    accessibilityTodoListUpdated: 'Lista de tarefas atualizada. {count} itens exibidos.',
    accessibilityTodoListUpdatedOne: 'Lista de tarefas atualizada. {count} item exibido.'
  },
  ru: {
    accessibilityCalendar: 'Календарь',
    accessibilityApp: 'Приложение',
    accessibilityAppActions: 'Действия с приложением',
    accessibilitySelected: 'выбрано',
    accessibilityPickedUp: '{name} выбрано для перемещения.',
    accessibilityMoved: '{name} перемещено.',
    accessibilityNotMoved: '{name} не перемещено.',
    accessibilityMoveCancelled: 'Перемещение отменено.',
    accessibilityFilter: 'Фильтр: {label}.',
    accessibilityTodoListUpdated: 'Список задач обновлён. Показано элементов: {count}.',
    accessibilityTodoListUpdatedOne: 'Список задач обновлён. Показан элемент: {count}.'
  }
};

function applyAccessibilityMerges(code) {
  const target = translations[code];
  const values = ACCESSIBILITY_TRANSLATIONS[code];
  if (!target || !values) return;
  Object.assign(target, values);
}

// The What's New bullets (src/features/release-notes.js) are keyed per release
// rather than stored as English literals, and the translated copies for every
// non-English locale live here instead of in src/core/locales/<code>.js. Those
// eight files hold one structurally identical block each, so repeating 39 key
// lines per locale there would trip SonarCloud's copy-paste gate the same way
// the parallel locale blocks do (languages.js and the locale files are CPD-
// excluded for exactly that reason — see .sonarcloud.properties). English
// strings stay in the inline en table above; this map only carries the
// eight translations, so a locale entry is optional and a missing one degrades
// to English via getTranslation() instead of showing a raw key.
const releaseNotesTranslations = {
  zh: {
    releaseNotes053FasterAnimations: '加快了设置弹窗与标签页动画以及游戏的键盘响应速度',
    releaseNotes053UnifiedToasts: '将应用内通知统一为顶部居中的提示样式',
    releaseNotes053WeatherStandalone: '天气应用现在无需启用天气小部件即可使用',
    releaseNotes053OfflineChatFixes: '修复了离线聊天误响应、特定词语导致的崩溃，以及重启后流式输出气泡卡住的问题',
    releaseNotes053OpenRouterTimeouts: '修复了 OpenRouter 超时导致长篇 AI 回答中途被截断的问题',
    releaseNotes053DuckDuckGoSuggestions: '修复了 DuckDuckGo 搜索建议从不显示的问题',
    releaseNotes053UntranslatedLabels: '修复了非英语环境下 Todo 和应用对话框标签未翻译的问题',
    releaseNotes053ExportKeepsScheduling: '设置导出/导入现在会保留专注模式和自动主题的定时配置',
    releaseNotes052PacmanGame: '在游戏中心新增吃豆人迷宫游戏',
    releaseNotes052BackgroundOverlays: '新增背景调暗、模糊和着色叠加层以提升可读性',
    releaseNotes052Glassmorphism: '在浅色主题下为 Todo 和笔记应用了玻璃拟态样式',
    releaseNotes052DeleteFromRow: '新增直接从应用行中删除应用的选项',
    releaseNotes052SaveFailureFeedback: '修复了存储失败后仍提示保存成功的问题',
    releaseNotes051SearchSuggestions: '新增带 bang 快捷指令的搜索建议，并支持用键盘切换搜索提供商',
    releaseNotes051WebGroundedAi: '新增基于网络的 AI 回答并附引用来源',
    releaseNotes051TodoDueTimes: '新增 Todo 截止时间，支持定时提醒和精确到分钟的逾期状态',
    releaseNotes051CrossTabSync: 'Todo、笔记和 AI 数据现在会在打开的多个标签页之间保持同步',
    releaseNotes051UnsafeUrlSchemes: '拦截不安全的自定义应用 URL 协议',
    releaseNotes050GamesHub: '新增内置游戏中心，包含贪吃蛇、2048、记忆翻牌和 Flappy Bird',
    releaseNotes050PomodoroTimer: '新增番茄钟专注计时器，可配置工作和休息时长',
    releaseNotes050FocusStats: '新增专注会话统计，包含每周明细和热力图',
    releaseNotes050MultiTimezoneClocks: '新增多时区时钟支持',
    releaseNotes050HourlyForecast: '新增按小时的天气预报及降雨概率',
    releaseNotes048FocusModeLayout: '新增专注模式布局和快捷键',
    releaseNotes048EyeCareReminders: '新增可配置的护眼休息提醒',
    releaseNotes048FocusStatsDashboard: '新增 Todo 的每日专注统计面板',
    releaseNotes048SearchQuickLaunch: '新增带键盘快捷键的网页搜索快速启动栏',
    releaseNotes048SearchHistoryToggle: '新增搜索历史开关',
    releaseNotes048WhatsNewSummary: '扩展更新后新增"更新内容"摘要',
    releaseNotes047BackgroundTabCards: '重新设计了背景标签页，采用卡片式布局',
    releaseNotes047TodoSubtasks: 'Todo 项目新增子任务和清单',
    releaseNotes047ThemeScheduling: '新增按一天中的时间段自动切换主题的调度',
    releaseNotes047MarkdownPreview: '笔记新增 Markdown 预览开关',
    releaseNotes047SettingsImportExport: '新增完整的设置导入和导出支持',
    releaseNotes047MultiDayForecast: '新增多日天气预报',
    releaseNotes047CustomShortcuts: '新增可自定义的键盘快捷键',
    releaseNotes047BackgroundRotation: '新增背景轮换和调度',
    releaseNotes047TodoPriority: '新增可配置的 Todo 优先级',
    releaseNotesFallback: '查看完整更新日志，了解本次更新包含的全部内容。'
  },
  ja: {
    releaseNotes053FasterAnimations: '設定モーダル・タブのアニメーションとゲームのキーボード応答が高速化',
    releaseNotes053UnifiedToasts: 'アプリ内通知を上部中央のトースト形式に統合',
    releaseNotes053WeatherStandalone: '天気ウィジェットを有効にしなくても天気アプリが動作するようになりました',
    releaseNotes053OfflineChatFixes: 'オフライン時のチャット誤応答、特定の単語によるクラッシュ、再起動後のストリーミング表示の固まりを修正',
    releaseNotes053OpenRouterTimeouts: 'OpenRouter のタイムアウトで長い AI 回答が途中で切れる問題を修正',
    releaseNotes053DuckDuckGoSuggestions: 'DuckDuckGo の検索候補が表示されなかった問題を修正',
    releaseNotes053UntranslatedLabels: '英語以外の環境で Todo やアプリダイアログのラベルが未翻訳だった問題を修正',
    releaseNotes053ExportKeepsScheduling: '設定のエクスポート・インポートでフォーカスモードと自動テーマのスケジュールが保持されるようになりました',
    releaseNotes052PacmanGame: 'ゲームハブにパックマンの迷路ゲームを追加',
    releaseNotes052BackgroundOverlays: '可読性向上のための背景の調光・ぼかし・色調オーバーレイを追加',
    releaseNotes052Glassmorphism: 'ライトテーマで Todo とノートにグラスモーフィズムを適用',
    releaseNotes052DeleteFromRow: '行から直接アプリを削除できるオプションを追加',
    releaseNotes052SaveFailureFeedback: '保存に失敗しても成功として報告されていた問題を修正',
    releaseNotes051SearchSuggestions: 'bang ショートカット付きの検索候補とキーボードでの検索プロバイダー切り替えを追加',
    releaseNotes051WebGroundedAi: '出典を引用したウェブに基づく AI 回答を追加',
    releaseNotes051TodoDueTimes: '期限時刻、時刻指定リマインダー、分単位の期限超過状態に対応した Todo の期限を追加',
    releaseNotes051CrossTabSync: 'Todo・ノート・AI データを開いている複数のタブ間で同期するようになりました',
    releaseNotes051UnsafeUrlSchemes: '安全でないカスタムアプリの URL スキームをブロック',
    releaseNotes050GamesHub: 'スネーク、2048、記憶マッチ、Flappy Bird を備えたゲームハブを追加',
    releaseNotes050PomodoroTimer: '作業・休憩時間を設定できるポモドーロタイマーを追加',
    releaseNotes050FocusStats: '週別内訳とヒートマップを含むフォーカスセッション統計を追加',
    releaseNotes050MultiTimezoneClocks: '複数のタイムゾーン時計に対応',
    releaseNotes050HourlyForecast: '降水確率付きの時間別天気予報を追加',
    releaseNotes048FocusModeLayout: 'フォーカスモードのレイアウトとショートカットを追加',
    releaseNotes048EyeCareReminders: '目の疲れ対策の休憩リマインダーを設定可能に',
    releaseNotes048FocusStatsDashboard: 'Todo の日別フォーカス統計ダッシュボードを追加',
    releaseNotes048SearchQuickLaunch: 'キーボードショートカット付きのウェブ検索クイック起動バーを追加',
    releaseNotes048SearchHistoryToggle: '検索履歴の切り替えを追加',
    releaseNotes048WhatsNewSummary: '拡張機能の更新後に「新機能」サマリーを表示',
    releaseNotes047BackgroundTabCards: '背景タブをカードベースのレイアウトに刷新',
    releaseNotes047TodoSubtasks: 'Todo にサブタスクとチェックリストを追加',
    releaseNotes047ThemeScheduling: '時間帯による自動テーマ切替を追加',
    releaseNotes047MarkdownPreview: 'ノートに Markdown プレビュー切り替えを追加',
    releaseNotes047SettingsImportExport: '設定の完全なインポート・エクスポートに対応',
    releaseNotes047MultiDayForecast: '複数日間の天気予報を追加',
    releaseNotes047CustomShortcuts: 'カスタマイズ可能なキーボードショートカットを追加',
    releaseNotes047BackgroundRotation: '背景の切り替えとスケジュール設定を追加',
    releaseNotes047TodoPriority: '設定可能な Todo の優先度レベルを追加',
    releaseNotesFallback: 'この更新のすべての内容は、完全なチェンジログでご確認ください。'
  },
  ko: {
    releaseNotes053FasterAnimations: '설정 모달/탭 애니메이션과 게임의 키보드 반응 속도를 높였습니다',
    releaseNotes053UnifiedToasts: '앱 내 알림을 상단 중앙 토스트 방식으로 통합했습니다',
    releaseNotes053WeatherStandalone: '날씨 위젯을 켜지 않아도 날씨 앱이 작동합니다',
    releaseNotes053OfflineChatFixes: '오프라인 채팅의 오반응, 특정 단어로 인한 충돌, 재시작 후 스트리밍 말풍선이 멈추던 문제를 수정했습니다',
    releaseNotes053OpenRouterTimeouts: 'OpenRouter 시간 초과로 긴 AI 답변이 중간에 끊기던 문제를 수정했습니다',
    releaseNotes053DuckDuckGoSuggestions: 'DuckDuckGo 검색 제안이 나타나지 않던 문제를 수정했습니다',
    releaseNotes053UntranslatedLabels: '영어가 아닌 언어에서 할 일 및 앱 대화 상자의 라벨이 번역되지 않던 문제를 수정했습니다',
    releaseNotes053ExportKeepsScheduling: '설정 내보내기/가져오기에서 집중 모드와 자동 테마 예약이 유지됩니다',
    releaseNotes052PacmanGame: '게임 허브에 팩맨 미로 게임을 추가했습니다',
    releaseNotes052BackgroundOverlays: '가독성을 위한 배경 어둡게, 흐리게, 색조 오버레이를 추가했습니다',
    releaseNotes052Glassmorphism: '라이트 테마에서 할 일과 메모에 글래스모피즘 스타일을 적용했습니다',
    releaseNotes052DeleteFromRow: '행에서 바로 앱을 삭제하는 옵션을 추가했습니다',
    releaseNotes052SaveFailureFeedback: '저장에 실패했는데 성공으로 표시되던 문제를 수정했습니다',
    releaseNotes051SearchSuggestions: 'bang 단축어와 키보드 검색 공급자 전환을 지원하는 검색 제안을 추가했습니다',
    releaseNotes051WebGroundedAi: '출처를 인용한 웹 기반 AI 답변을 추가했습니다',
    releaseNotes051TodoDueTimes: '시각 알림과 분 단위로 정확한 지연 상태를 지원하는 할 일 마감 시각을 추가했습니다',
    releaseNotes051CrossTabSync: '할 일, 메모, AI 데이터를 열려 있는 탭 간에 동기화합니다',
    releaseNotes051UnsafeUrlSchemes: '안전하지 않은 사용자 지정 앱 URL 스킴을 차단했습니다',
    releaseNotes050GamesHub: '스네이크, 2048, 메모리 매치, 플래피 버드가 있는 게임 허브를 추가했습니다',
    releaseNotes050PomodoroTimer: '작업 및 휴식 시간을 설정할 수 있는 포모도로 집중 타이머를 추가했습니다',
    releaseNotes050FocusStats: '주간 내역과 히트맵을 포함한 집중 세션 통계를 추가했습니다',
    releaseNotes050MultiTimezoneClocks: '여러 시간대 시계를 지원합니다',
    releaseNotes050HourlyForecast: '강수 확률이 포함된 시간별 일기예보를 추가했습니다',
    releaseNotes048FocusModeLayout: '집중 모드 레이아웃과 단축키를 추가했습니다',
    releaseNotes048EyeCareReminders: '눈 건강을 위한 휴식 알림을 설정할 수 있습니다',
    releaseNotes048FocusStatsDashboard: '할 일의 일일 집중 통계 대시보드를 추가했습니다',
    releaseNotes048SearchQuickLaunch: '키보드 단축키가 있는 웹 검색 빠른 실행 표시줄을 추가했습니다',
    releaseNotes048SearchHistoryToggle: '검색 기록 토글을 추가했습니다',
    releaseNotes048WhatsNewSummary: '확장 프로그램 업데이트 후 새로운 기능 요약을 표시합니다',
    releaseNotes047BackgroundTabCards: '배경 탭을 카드 기반 레이아웃으로 다시 디자인했습니다',
    releaseNotes047TodoSubtasks: '할 일 항목에 하위 작업과 체크리스트를 추가했습니다',
    releaseNotes047ThemeScheduling: '시간대에 따른 자동 테마 예약을 추가했습니다',
    releaseNotes047MarkdownPreview: '메모에 마크다운 미리보기 토글을 추가했습니다',
    releaseNotes047SettingsImportExport: '설정의 전체 가져오기 및 내보내기를 지원합니다',
    releaseNotes047MultiDayForecast: '여러 날짜의 일기예보를 추가했습니다',
    releaseNotes047CustomShortcuts: '사용자 지정 키보드 단축키를 추가했습니다',
    releaseNotes047BackgroundRotation: '배경 회전 및 예약을 추가했습니다',
    releaseNotes047TodoPriority: '할 일 우선순위 수준을 설정할 수 있습니다',
    releaseNotesFallback: '이번 업데이트의 전체 내용은 전체 변경 로그에서 확인하세요.'
  },
  es: {
    releaseNotes053FasterAnimations: 'Se aceleraron las animaciones de los diálogos y pestañas de Configuración y la respuesta del teclado en Juegos',
    releaseNotes053UnifiedToasts: 'Se unificaron las notificaciones de la app en un único aviso en la parte superior central',
    releaseNotes053WeatherStandalone: 'La app del Clima ahora funciona sin tener activado el widget del clima',
    releaseNotes053OfflineChatFixes: 'Se corrigieron respuestas erróneas del chat sin conexión, fallos causados por ciertas palabras y burbujas de streaming atascadas tras reiniciar',
    releaseNotes053OpenRouterTimeouts: 'Se corrigieron los tiempos de espera de OpenRouter que cortaban las respuestas largas de la IA a mitad de transmisión',
    releaseNotes053DuckDuckGoSuggestions: 'Se corrigió que las sugerencias de búsqueda de DuckDuckGo nunca aparecieran',
    releaseNotes053UntranslatedLabels: 'Se corrigieron etiquetas sin traducir de Tareas y de los diálogos de las apps en idiomas distintos al inglés',
    releaseNotes053ExportKeepsScheduling: 'La exportación e importación de Configuración ahora conserva el modo concentración y la programación del tema automático',
    releaseNotes052PacmanGame: 'Se añadió el laberinto de Pac-Man al centro de juegos',
    releaseNotes052BackgroundOverlays: 'Se añadieron superposiciones de oscurecido, desenfoque y tinte del fondo para mejorar la legibilidad',
    releaseNotes052Glassmorphism: 'Se aplicó estilo glassmorphism a Tareas y Notas en el tema claro',
    releaseNotes052DeleteFromRow: 'Se añadió la opción de eliminar apps directamente desde la fila',
    releaseNotes052SaveFailureFeedback: 'Se corrigieron guardados que informaban éxito tras fallos de almacenamiento',
    releaseNotes051SearchSuggestions: 'Se añadieron sugerencias de búsqueda con atajos bang y cambio de proveedor con el teclado',
    releaseNotes051WebGroundedAi: 'Se añadieron respuestas de IA fundamentadas en la web con fuentes citadas',
    releaseNotes051TodoDueTimes: 'Se añadieron horas límite de tareas con recordatorios programados y estados de vencimiento precisos al minuto',
    releaseNotes051CrossTabSync: 'Tareas, notas y datos de IA se mantienen sincronizados entre las pestañas abiertas',
    releaseNotes051UnsafeUrlSchemes: 'Se bloquearon esquemas de URL no seguros de las apps personalizadas',
    releaseNotes050GamesHub: 'Se añadió un centro de juegos integrado con Snake, 2048, Memory Match y Flappy Bird',
    releaseNotes050PomodoroTimer: 'Se añadió un temporizador Pomodoro con duraciones configurables de trabajo y descanso',
    releaseNotes050FocusStats: 'Se añadieron estadísticas de sesiones de concentración con desgloses semanales y mapas de calor',
    releaseNotes050MultiTimezoneClocks: 'Se añadió soporte para relojes de múltiples zonas horarias',
    releaseNotes050HourlyForecast: 'Se añadió una previsión por horas con probabilidades de lluvia',
    releaseNotes048FocusModeLayout: 'Se añadió un diseño y un atajo para el modo concentración',
    releaseNotes048EyeCareReminders: 'Se añadieron recordatorios de descanso para la vista configurables',
    releaseNotes048FocusStatsDashboard: 'Se añadió un panel diario de estadísticas de concentración para las tareas',
    releaseNotes048SearchQuickLaunch: 'Se añadió una barra de lanzamiento rápido de búsqueda web con atajos de teclado',
    releaseNotes048SearchHistoryToggle: 'Se añadió un interruptor del historial de búsqueda',
    releaseNotes048WhatsNewSummary: 'Se añadió un resumen de Novedades tras las actualizaciones de la extensión',
    releaseNotes047BackgroundTabCards: 'Se rediseñó la pestaña de Fondo con un diseño basado en tarjetas',
    releaseNotes047TodoSubtasks: 'Se añadieron subtareas y listas de verificación a los elementos de tarea',
    releaseNotes047ThemeScheduling: 'Se añadió programación automática del tema según la hora del día',
    releaseNotes047MarkdownPreview: 'Se añadió un interruptor de vista previa de Markdown para las notas',
    releaseNotes047SettingsImportExport: 'Se añadió soporte completo de importación y exportación de la configuración',
    releaseNotes047MultiDayForecast: 'Se añadió una previsión meteorológica de varios días',
    releaseNotes047CustomShortcuts: 'Se añadieron atajos de teclado personalizables',
    releaseNotes047BackgroundRotation: 'Se añadió rotación y programación del fondo',
    releaseNotes047TodoPriority: 'Se añadieron niveles de prioridad configurables para las tareas',
    releaseNotesFallback: 'Consulta el changelog completo para ver todo lo incluido en esta actualización.'
  },
  fr: {
    releaseNotes053FasterAnimations: 'Animations des fenêtres et onglets de Réglages et réactivité du clavier dans Games accélérées',
    releaseNotes053UnifiedToasts: 'Notifications de l\'appli regroupées en un seul toast en haut au centre',
    releaseNotes053WeatherStandalone: 'L\'appli Météo fonctionne désormais sans activer le widget météo',
    releaseNotes053OfflineChatFixes: 'Correction des réponses erronées du chat hors ligne, des plantages liés à certains mots et des bulles de diffusion bloquées après un redémarrage',
    releaseNotes053OpenRouterTimeouts: 'Correction des délais d\'attente d\'OpenRouter qui coupaient les longues réponses IA en plein streaming',
    releaseNotes053DuckDuckGoSuggestions: 'Correction des suggestions de recherche DuckDuckGo qui n\'apparaissaient jamais',
    releaseNotes053UntranslatedLabels: 'Correction des libellés non traduits des tâches et des fenêtres d\'apps dans les langues autres que l\'anglais',
    releaseNotes053ExportKeepsScheduling: 'L\'export/import des réglages conserve désormais le mode concentration et la programmation du thème automatique',
    releaseNotes052PacmanGame: 'Ajout du labyrinthe Pac-Man au centre de jeux',
    releaseNotes052BackgroundOverlays: 'Ajout d\'options d\'assombrissement, de flou et de teinte de l\'arrière-plan pour la lisibilité',
    releaseNotes052Glassmorphism: 'Style glassmorphism appliqué aux tâches et aux notes dans le thème clair',
    releaseNotes052DeleteFromRow: 'Ajout de la possibilité de supprimer des apps directement depuis la ligne',
    releaseNotes052SaveFailureFeedback: 'Correction des sauvegardes qui annonçaient un succès après des échecs de stockage',
    releaseNotes051SearchSuggestions: 'Ajout de suggestions de recherche avec raccourcis bang et changement de fournisseur au clavier',
    releaseNotes051WebGroundedAi: 'Ajout de réponses IA fondées sur le web avec sources citées',
    releaseNotes051TodoDueTimes: 'Ajout d\'échéances pour les tâches avec rappels programmés et états de retard précis à la minute',
    releaseNotes051CrossTabSync: 'Tâches, notes et données IA restent synchronisés entre les onglets ouverts',
    releaseNotes051UnsafeUrlSchemes: 'Blocage des schémas d\'URL non sûrs des apps personnalisées',
    releaseNotes050GamesHub: 'Ajout d\'un centre de jeux intégré avec Snake, 2048, Memory Match et Flappy Bird',
    releaseNotes050PomodoroTimer: 'Ajout d\'un minuteur Pomodoro avec durées de travail et de pause configurables',
    releaseNotes050FocusStats: 'Ajout de statistiques de sessions de concentration avec répartitions hebdomadaires et cartes de chaleur',
    releaseNotes050MultiTimezoneClocks: 'Prise en charge de plusieurs horloges de fuseaux horaires',
    releaseNotes050HourlyForecast: 'Ajout d\'une prévision horaire avec probabilités de pluie',
    releaseNotes048FocusModeLayout: 'Ajout d\'une disposition et d\'un raccourci pour le mode concentration',
    releaseNotes048EyeCareReminders: 'Ajout de rappels de pause pour les yeux configurables',
    releaseNotes048FocusStatsDashboard: 'Ajout d\'un tableau de bord quotidien des statistiques de concentration pour les tâches',
    releaseNotes048SearchQuickLaunch: 'Ajout d\'une barre de lancement rapide de recherche web avec raccourcis clavier',
    releaseNotes048SearchHistoryToggle: 'Ajout d\'un activateur pour l\'historique de recherche',
    releaseNotes048WhatsNewSummary: 'Ajout d\'un résumé Nouveautés après les mises à jour de l\'extension',
    releaseNotes047BackgroundTabCards: 'Redesign de l\'onglet Arrière-plan avec une disposition en cartes',
    releaseNotes047TodoSubtasks: 'Ajout de sous-tâches et de listes de contrôle aux tâches',
    releaseNotes047ThemeScheduling: 'Ajout de la programmation automatique du thème selon l\'heure de la journée',
    releaseNotes047MarkdownPreview: 'Ajout d\'un bouton d\'aperçu Markdown pour les notes',
    releaseNotes047SettingsImportExport: 'Ajout de la prise en charge complète de l\'import/export des réglages',
    releaseNotes047MultiDayForecast: 'Ajout d\'une prévision météo sur plusieurs jours',
    releaseNotes047CustomShortcuts: 'Ajout de raccourcis clavier personnalisables',
    releaseNotes047BackgroundRotation: 'Ajout de la rotation et de la programmation de l\'arrière-plan',
    releaseNotes047TodoPriority: 'Ajout de niveaux de priorité configurables pour les tâches',
    releaseNotesFallback: 'Consultez le journal des modifications complet pour tout ce que contient cette mise à jour.'
  },
  de: {
    releaseNotes053FasterAnimations: 'Animationen der Einstellungsdialoge und -reiter sowie die Tastaturansprache bei Spielen beschleunigt',
    releaseNotes053UnifiedToasts: 'In-App-Benachrichtigungen in einem einheitlichen Toast oben in der Mitte zusammengefasst',
    releaseNotes053WeatherStandalone: 'Die Wetter-App funktioniert jetzt ohne aktiviertes Wetter-Widget',
    releaseNotes053OfflineChatFixes: 'Behoben: Fehlreaktionen im Offline-Chat, Abstürze durch bestimmte Wörter und hängende Streaming-Blasen nach einem Neustart',
    releaseNotes053OpenRouterTimeouts: 'Behoben: OpenRouter-Timeouts kürzten lange KI-Antworten mitten im Stream ab',
    releaseNotes053DuckDuckGoSuggestions: 'Behoben: DuckDuckGo-Suchvorschläge erschienen nie',
    releaseNotes053UntranslatedLabels: 'Behoben: Nicht übersetzte Beschriftungen von Todo- und App-Dialogen in nicht englischen Sprachen',
    releaseNotes053ExportKeepsScheduling: 'Der Export und Import von Einstellungen behält jetzt den Fokusmodus und die automatische Theme-Planung',
    releaseNotes052PacmanGame: 'Ein Pac-Man-Labyrinthspiel zum Spielhub hinzugefügt',
    releaseNotes052BackgroundOverlays: 'Abdunkelungs-, Weichzeichnungs- und Farbüberlagerungen des Hintergrunds für bessere Lesbarkeit hinzugefügt',
    releaseNotes052Glassmorphism: 'Glassmorphism-Stil für Todo und Notizen im hellen Theme angewendet',
    releaseNotes052DeleteFromRow: 'Option zum Löschen von Apps direkt aus der Zeile hinzugefügt',
    releaseNotes052SaveFailureFeedback: 'Behoben: Speichervorgänge meldeten trotz Speicherfehler Erfolg',
    releaseNotes051SearchSuggestions: 'Suchvorschläge mit Bang-Kürzeln und Tastaturwechsel der Suchmaschine hinzugefügt',
    releaseNotes051WebGroundedAi: 'Web-basierte KI-Antworten mit zitierten Quellen hinzugefügt',
    releaseNotes051TodoDueTimes: 'Todo-Fälligkeitszeiten mit zeitgesteuerten Erinnerungen und fälligkeitsgenauen Zuständen bis zur Minute hinzugefügt',
    releaseNotes051CrossTabSync: 'Todos, Notizen und KI-Daten bleiben zwischen offenen Tabs synchron',
    releaseNotes051UnsafeUrlSchemes: 'Unsichere benutzerdefinierte App-URL-Schemata blockiert',
    releaseNotes050GamesHub: 'Ein integrierter Spielhub mit Snake, 2048, Memory Match und Flappy Bird hinzugefügt',
    releaseNotes050PomodoroTimer: 'Ein Pomodoro-Fokus-Timer mit konfigurierbaren Arbeits- und Pausenzeiten hinzugefügt',
    releaseNotes050FocusStats: 'Fokus-Session-Statistiken mit Wochenaufschlüsselungen und Heatmaps hinzugefügt',
    releaseNotes050MultiTimezoneClocks: 'Unterstützung für Uhren in mehreren Zeitzonen hinzugefügt',
    releaseNotes050HourlyForecast: 'Eine Stundenwettervorhersage mit Regenwahrscheinlichkeiten hinzugefügt',
    releaseNotes048FocusModeLayout: 'Ein Fokusmodus-Layout und ein Tastenkürzel hinzugefügt',
    releaseNotes048EyeCareReminders: 'Konfigurierbare Augenpflege-Pausenerinnerungen hinzugefügt',
    releaseNotes048FocusStatsDashboard: 'Ein tägliches Fokus-Statistik-Dashboard für Todos hinzugefügt',
    releaseNotes048SearchQuickLaunch: 'Eine Schnellstart-Leiste für Websuchen mit Tastenkürzeln hinzugefügt',
    releaseNotes048SearchHistoryToggle: 'Einen Schalter für den Suchverlauf hinzugefügt',
    releaseNotes048WhatsNewSummary: 'Eine Neuheiten-Zusammenfassung nach Erweiterungsaktualisierungen hinzugefügt',
    releaseNotes047BackgroundTabCards: 'Den Hintergrund-Reiter mit einem kartenbasierten Layout neu gestaltet',
    releaseNotes047TodoSubtasks: 'Unteraufgaben und Checklisten für Todo-Einträge hinzugefügt',
    releaseNotes047ThemeScheduling: 'Automatische Theme-Planung nach Tageszeit hinzugefügt',
    releaseNotes047MarkdownPreview: 'Eine Markdown-Vorschau-Umschaltung für Notizen hinzugefügt',
    releaseNotes047SettingsImportExport: 'Vollständige Unterstützung für den Import und Export von Einstellungen hinzugefügt',
    releaseNotes047MultiDayForecast: 'Eine Mehr-Tage-Wettervorhersage hinzugefügt',
    releaseNotes047CustomShortcuts: 'Anpassbare Tastenkürzel hinzugefügt',
    releaseNotes047BackgroundRotation: 'Hintergrundrotation und -planung hinzugefügt',
    releaseNotes047TodoPriority: 'Konfigurierbare Todo-Prioritätsstufen hinzugefügt',
    releaseNotesFallback: 'Die vollständige Änderungsliste zeigt alle Neuerungen dieses Updates.'
  },
  pt: {
    releaseNotes053FasterAnimations: 'Animações do modal e das abas de Configurações e resposta do teclado nos Jogos mais rápidas',
    releaseNotes053UnifiedToasts: 'Notificações no app unificadas em um único aviso no topo ao centro',
    releaseNotes053WeatherStandalone: 'O app de Clima agora funciona sem o widget de clima ativado',
    releaseNotes053OfflineChatFixes: 'Corrigidas respostas erradas do chat offline, travamentos causados por certas palavras e balões de streaming travados após reiniciar',
    releaseNotes053OpenRouterTimeouts: 'Corrigidos os tempos de espera do OpenRouter que cortavam respostas longas de IA no meio da transmissão',
    releaseNotes053DuckDuckGoSuggestions: 'Corrigidas as sugestões de busca do DuckDuckGo que nunca apareciam',
    releaseNotes053UntranslatedLabels: 'Corrigidos rótulos não traduzidos da lista de Tarefas e dos diálogos de apps em idiomas diferentes do inglês',
    releaseNotes053ExportKeepsScheduling: 'A exportação e importação de Configurações agora mantém o modo foco e o agendamento automático de tema',
    releaseNotes052PacmanGame: 'Adicionado o jogo de labirinto do Pac-Man à central de jogos',
    releaseNotes052BackgroundOverlays: 'Adicionadas sobreposições de escurecimento, desfoque e tom no fundo para melhor legibilidade',
    releaseNotes052Glassmorphism: 'Estilo glassmorphism aplicado às Tarefas e Notas no tema claro',
    releaseNotes052DeleteFromRow: 'Adicionada a opção de excluir apps diretamente da linha',
    releaseNotes052SaveFailureFeedback: 'Corrigidos salvamentos que informavam sucesso após falhas de armazenamento',
    releaseNotes051SearchSuggestions: 'Adicionadas sugestões de busca com atalhos bang e troca de provedor pelo teclado',
    releaseNotes051WebGroundedAi: 'Adicionadas respostas de IA baseadas na web com fontes citadas',
    releaseNotes051TodoDueTimes: 'Adicionados horários de vencimento de tarefas com lembretes agendados e estados de atraso precisos ao minuto',
    releaseNotes051CrossTabSync: 'Tarefas, notas e dados de IA são sincronizados entre as abas abertas',
    releaseNotes051UnsafeUrlSchemes: 'Bloqueados esquemas de URL inseguros de apps personalizados',
    releaseNotes050GamesHub: 'Adicionada uma central de jogos integrada com Snake, 2048, Memory Match e Flappy Bird',
    releaseNotes050PomodoroTimer: 'Adicionado um temporizador Pomodoro com durações configuráveis de trabalho e pausa',
    releaseNotes050FocusStats: 'Adicionadas estatísticas de sessões de foco com detalhes semanais e mapas de calor',
    releaseNotes050MultiTimezoneClocks: 'Adicionado suporte a relógios de múltiplos fusos horários',
    releaseNotes050HourlyForecast: 'Adicionada uma previsão por hora com probabilidades de chuva',
    releaseNotes048FocusModeLayout: 'Adicionado um layout e um atalho para o modo foco',
    releaseNotes048EyeCareReminders: 'Adicionados lembretes de pausa para os olhos configuráveis',
    releaseNotes048FocusStatsDashboard: 'Adicionado um painel diário de estatísticas de foco para as tarefas',
    releaseNotes048SearchQuickLaunch: 'Adicionada uma barra de lançamento rápido de busca web com atalhos de teclado',
    releaseNotes048SearchHistoryToggle: 'Adicionada uma alternância do histórico de busca',
    releaseNotes048WhatsNewSummary: 'Adicionado um resumo de Novidades após as atualizações da extensão',
    releaseNotes047BackgroundTabCards: 'Redesenhada a aba de Fundo com um layout baseado em cartões',
    releaseNotes047TodoSubtasks: 'Adicionadas subtarefas e listas de verificação aos itens de tarefa',
    releaseNotes047ThemeScheduling: 'Adicionado agendamento automático de tema pelo horário do dia',
    releaseNotes047MarkdownPreview: 'Adicionada uma alternância de visualização de Markdown para as notas',
    releaseNotes047SettingsImportExport: 'Adicionado suporte completo à importação e exportação de configurações',
    releaseNotes047MultiDayForecast: 'Adicionada uma previsão meteorológica de vários dias',
    releaseNotes047CustomShortcuts: 'Adicionados atalhos de teclado personalizáveis',
    releaseNotes047BackgroundRotation: 'Adicionada rotação e agendamento do fundo',
    releaseNotes047TodoPriority: 'Adicionados níveis de prioridade configuráveis para as tarefas',
    releaseNotesFallback: 'Confira o changelog completo para tudo o que foi incluído nesta atualização.'
  },
  ru: {
    releaseNotes053FasterAnimations: 'Ускорены анимации окна и вкладок настроек, а также отклик клавиатуры в Играх',
    releaseNotes053UnifiedToasts: 'Внутренние уведомления объединены в единый тост в верхней части экрана',
    releaseNotes053WeatherStandalone: 'Приложение Погода теперь работает без включённого виджета погоды',
    releaseNotes053OfflineChatFixes: 'Исправлены ложные ответы офлайн-чата, сбои от некоторых слов и зависшие пузыри потоковой передачи после перезапуска',
    releaseNotes053OpenRouterTimeouts: 'Исправлено обрывание длинных ответов ИИ из-за тайм-аутов OpenRouter',
    releaseNotes053DuckDuckGoSuggestions: 'Исправлено отсутствие подсказок поиска DuckDuckGo',
    releaseNotes053UntranslatedLabels: 'Исправлены непереведённые подписи задач и диалогов приложений в неанглийских языках',
    releaseNotes053ExportKeepsScheduling: 'Экспорт и импорт настроек теперь сохраняют режим фокуса и расписание автотемы',
    releaseNotes052PacmanGame: 'Добавлено лабиринтное приложение Пак-Ман в игровой хаб',
    releaseNotes052BackgroundOverlays: 'Добавлены оверлеи затемнения, размытия и оттенка фона для удобства чтения',
    releaseNotes052Glassmorphism: 'Стиль стеклянной морфологии применён к Задачам и Заметкам в светлой теме',
    releaseNotes052DeleteFromRow: 'Добавлена возможность удалять приложения прямо из строки',
    releaseNotes052SaveFailureFeedback: 'Исправлено ложное «успешное» сохранение при сбоях хранилища',
    releaseNotes051SearchSuggestions: 'Добавлены подсказки поиска с bang-командами и переключением поисковика с клавиатуры',
    releaseNotes051WebGroundedAi: 'Добавлены ответы ИИ на основе веба с указанием источников',
    releaseNotes051TodoDueTimes: 'Добавлены сроки выполнения задач с напоминаниями и статусом просрочки с точностью до минуты',
    releaseNotes051CrossTabSync: 'Задачи, заметки и данные ИИ синхронизируются между открытыми вкладками',
    releaseNotes051UnsafeUrlSchemes: 'Небезопасные пользовательские URL-схемы приложений блокируются',
    releaseNotes050GamesHub: 'Добавлен игровой хаб со Змейкой, 2048, Memory Match и Flappy Bird',
    releaseNotes050PomodoroTimer: 'Добавлен таймер Помодоро с настраиваемой длительностью работы и перерыва',
    releaseNotes050FocusStats: 'Добавлена статистика сессий фокуса с разбивкой по неделям и тепловыми картами',
    releaseNotes050MultiTimezoneClocks: 'Добавлена поддержка нескольких часовых поясов',
    releaseNotes050HourlyForecast: 'Добавлен почасовой прогноз погоды с вероятностью осадков',
    releaseNotes048FocusModeLayout: 'Добавлена раскладка и горячая клавиша режима фокуса',
    releaseNotes048EyeCareReminders: 'Добавлены настраиваемые напоминания о перерывах для глаз',
    releaseNotes048FocusStatsDashboard: 'Добавлена ежедневная панель статистики фокуса для задач',
    releaseNotes048SearchQuickLaunch: 'Добавлена панель быстрого запуска веб-поиска с горячими клавишами',
    releaseNotes048SearchHistoryToggle: 'Добавлен переключатель истории поиска',
    releaseNotes048WhatsNewSummary: 'Добавлена сводка «Что нового» после обновлений расширения',
    releaseNotes047BackgroundTabCards: 'Вкладка Фон переверстана с макетом на основе карточек',
    releaseNotes047TodoSubtasks: 'В задачи добавлены подзадачи и чек-листы',
    releaseNotes047ThemeScheduling: 'Добавлено автоматическое расписание темы по времени суток',
    releaseNotes047MarkdownPreview: 'В заметках добавлен переключатель предпросмотра Markdown',
    releaseNotes047SettingsImportExport: 'Добавлена полная поддержка импорта и экспорта настроек',
    releaseNotes047MultiDayForecast: 'Добавлен многосуточный прогноз погоды',
    releaseNotes047CustomShortcuts: 'Добавлены настраиваемые горячие клавиши',
    releaseNotes047BackgroundRotation: 'Добавлено чередование и расписание фона',
    releaseNotes047TodoPriority: 'Добавлены настраиваемые уровни приоритета задач',
    releaseNotesFallback: 'Полный список изменений этого обновления смотрите в журнале изменений.'
  }
};

function applyReleaseNotesMerges(code) {
  const target = translations[code];
  const messages = releaseNotesTranslations[code];
  if (!target || !messages) return;
  Object.assign(target, messages);
}

// Runs every feature-string merge pass for a single locale. en runs it at
// evaluation time; registerLocale() runs it again for a locale whose table
// arrives from src/core/locales/<code>.js so lazily loaded locales get the
// same games/Pomodoro/accessibility/AI-export/release-notes keys as the inline
// en table.
function applyLocaleMerges(code) {
  applyCustomBackgroundErrorMerges(code);
  applyAiExportMerges(code);
  applyGamesLevelMerges(code);
  applyGamesReadyMerges(code);
  applyFlappyBirdMerges(code);
  applyPacmanMerges(code);
  applyPomodoroMerges(code);
  applyAccessibilityMerges(code);
  applyReleaseNotesMerges(code);
}

applyLocaleMerges('en');

// Current language
let currentLanguage = 'en';

function getOwnNonEmptyTranslation(dict, key) {
  if (dict && Object.hasOwn(dict, key)) {
    const value = dict[key];
    if (value !== '') {
      return value;
    }
  }
  return null;
}

function getTranslation(lang, key) {
  const direct = getOwnNonEmptyTranslation(translations[lang], key);
  if (direct !== null) {
    return direct;
  }
  const baseLang = lang ? lang.split('_')[0] : '';
  if (baseLang && baseLang !== lang) {
    const base = getOwnNonEmptyTranslation(translations[baseLang], key);
    if (base !== null) {
      return base;
    }
  }
  const fallback = getOwnNonEmptyTranslation(translations.en, key);
  if (fallback !== null) {
    return fallback;
  }
  return key;
}

// Save language to localStorage
function saveLanguage(lang) {
  localStorage.setItem('language', lang);
}

// --- Lazy locale loading (issue #927) -------------------------------------
// Only the en table is inline. Every other table lives in
// src/core/locales/<code>.js and is appended on demand, so a new tab never
// parses or builds the eight locales it is not using. The files register
// through window.i18n.__registerLocale() below.
const LOCALE_SCRIPT_DIR = 'src/core/locales/';
const pendingLocaleLoads = {};
const localeLoadSettlers = {};

function getLocaleBaseCode(lang) {
  return typeof lang === 'string' && lang ? lang.split('_')[0] : '';
}

function isLocaleRegistered(lang) {
  return Boolean(translations[getLocaleBaseCode(lang)]);
}

function isSupportedLocaleCode(code) {
  return SUPPORTED_LANGUAGES.some(function (language) {
    return language.code === code;
  });
}

// Appends the locale script with the same pattern bootstrap.js uses for
// scriptSources (extension-page CSP allows same-origin 'self' scripts).
function loadLocaleScript(source) {
  return new Promise(function (resolve, reject) {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = function () {
      reject(new Error('Failed to load ' + source));
    };
    document.body.appendChild(script);
  });
}

function settleLocaleLoad(code) {
  const settle = localeLoadSettlers[code];
  delete localeLoadSettlers[code];
  if (settle) {
    settle();
  }
}

// Resolves once the table for lang is registered — immediately for en (and
// for any unsupported code, which falls back to English), otherwise when
// src/core/locales/<code>.js registers. The promise is cached per locale so
// Settings and onboarding can both trigger it and only one script request is
// ever made.
function ensureLocale(lang) {
  const code = getLocaleBaseCode(lang);
  if (!code || !isSupportedLocaleCode(code) || isLocaleRegistered(code)) {
    return Promise.resolve();
  }
  if (pendingLocaleLoads[code]) {
    return pendingLocaleLoads[code];
  }
  const pending = new Promise(function (resolve) {
    localeLoadSettlers[code] = resolve;
    loadLocaleScript(LOCALE_SCRIPT_DIR + code + '.js').then(function () {
      if (!translations[code]) {
        console.warn('[i18n] Locale script for "' + code + '" loaded without registering a table.');
        settleLocaleLoad(code);
      }
    }, function (error) {
      console.warn('[i18n] Failed to load locale script for "' + code + '".', error);
      // Drop the cache so a later applyLanguage() call can retry the fetch.
      delete pendingLocaleLoads[code];
      settleLocaleLoad(code);
    });
  });
  pendingLocaleLoads[code] = pending;
  return pending;
}

// Called by src/core/locales/<code>.js with its raw table; applies the same
// feature-string merge passes en runs at evaluation time, then releases any
// applyLanguage() call waiting on this locale.
function registerLocale(code, table) {
  if (typeof code === 'string' && code && table && typeof table === 'object') {
    translations[code] = table;
    applyLocaleMerges(code);
  }
  settleLocaleLoad(code);
}

// Apply language to UI. Returns a promise that settles after the
// [data-i18n] sweep has run. When the locale table is already registered
// (always the case for en) the sweep stays synchronous, so the default
// profile keeps its previous behavior and makes no extra requests.
function applyLanguage(lang) {
  currentLanguage = lang;
  saveLanguage(lang);

  // Update document lang attribute
  document.documentElement.lang = lang;

  if (isLocaleRegistered(lang) || !isSupportedLocaleCode(getLocaleBaseCode(lang))) {
    sweepLanguage(lang);
    return Promise.resolve();
  }

  // Sweep only once the locale script registers its table, so non-English
  // users see real strings instead of an English flash. getTranslation keeps
  // falling back to en until then for anything rendered in the meantime.
  return ensureLocale(lang).then(function () {
    if (currentLanguage === lang) {
      sweepLanguage(lang);
    }
  });
}

function sweepLanguage(lang) {
  // Update all elements with data-i18n attribute
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = getTranslation(lang, key);

    // Different handling based on element type
    if (element.tagName === 'INPUT' && element.placeholder) {
      element.placeholder = translation;
    } else if (element.tagName === 'OPTION') {
      element.textContent = translation;
    } else if (element.hasAttribute('title')) {
      element.title = translation;
      if (element.hasAttribute('aria-label')) {
        element.setAttribute('aria-label', translation);
      }
    } else if (element.children.length > 0) {
      // Preserve child elements by updating only the text node.
      // This is a generic safeguard for any [data-i18n] container that nests children
      // (historically the todo filter pills with badge spans). If the element has
      // only element children (e.g., icon-only controls like #folder-popup-rename-btn),
      // try to update a nested label before falling back to aria-label.
      let textNode = null;
      for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
          textNode = node;
          break;
        }
      }
      if (textNode) {
        textNode.textContent = translation;
      } else {
        let descendantText = null;
        try {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
              if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
              if (node.parentElement && node.parentElement.closest('.filter-badge')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          descendantText = walker.nextNode();
        } catch (e) { void e; }
        if (descendantText) {
          descendantText.textContent = translation;
        } else {
          element.setAttribute('aria-label', translation);
        }
      }
    } else {
      element.textContent = translation;
    }
  });

  // Update all elements with data-i18n-placeholder attribute
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = getTranslation(lang, key);
  });

  // Update all elements with data-i18n-title attribute
  const titleElements = document.querySelectorAll('[data-i18n-title]');
  titleElements.forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.setAttribute('title', getTranslation(lang, key));
  });

  // Update all elements with data-i18n-aria-label attribute
  const ariaLabelElements = document.querySelectorAll('[data-i18n-aria-label]');
  ariaLabelElements.forEach(element => {
    const key = element.getAttribute('data-i18n-aria-label');
    element.setAttribute('aria-label', getTranslation(lang, key));
  });

  // Update any dynamic content that might have been added after initial load
  updateDynamicTranslations();
}

// Update dynamic translations (for content added after initial load)
function updateDynamicTranslations() {
  // Update todo section if it exists
  const todoTitle = document.querySelector('.todo-title');
  if (todoTitle) {
    todoTitle.textContent = getTranslation(currentLanguage, 'todoList');
  }

  // Update empty state messages
  const emptyStateP = document.querySelector('.empty-state p');
  if (emptyStateP) {
    emptyStateP.textContent = getTranslation(currentLanguage, 'emptyStateTitle');
  }

  const emptyStateSmall = document.querySelector('.empty-state small');
  if (emptyStateSmall) {
    emptyStateSmall.textContent = getTranslation(currentLanguage, 'emptyStateDesc');
  }
  
  // Update filter pills - legacy text-node markup only; new inner-span markup
  // is already handled by the generic [data-i18n] loop in applyLanguage
  function updateFilterPillLabel(pill, key) {
    if (!pill) return;
    const label = pill.querySelector('.filter-label');
    if (label) {
      return;
    }
    const firstTextNode = Array.from(pill.childNodes).find(function (node) {
      return node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0;
    });
    if (firstTextNode) {
      firstTextNode.textContent = getTranslation(currentLanguage, key) + ' ';
    } else if (pill.childNodes[0] && pill.childNodes[0].nodeType === Node.TEXT_NODE) {
      pill.childNodes[0].textContent = getTranslation(currentLanguage, key) + ' ';
    } else {
      const firstElement = pill.firstElementChild;
      if (firstElement) {
        pill.insertBefore(document.createTextNode(getTranslation(currentLanguage, key) + ' '), firstElement);
      }
    }
  }

  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="all"]'), 'filterAll');
  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="pending"]'), 'filterPending');
  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="completed"]'), 'filterCompleted');
  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="overdue"]'), 'filterOverdue');
  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="high"]'), 'priorityHigh');
  updateFilterPillLabel(document.querySelector('.filter-pill[data-filter="low"]'), 'priorityLow');
  
  // Update quick action button text
  const clearCompletedBtn = document.getElementById('clear-completed');
  
  if (clearCompletedBtn) {
    const span = clearCompletedBtn.querySelector('span');
    if (span) span.textContent = getTranslation(currentLanguage, 'clearCompletedText');
  }

  // Update clear completed confirmation dialog
  const clearCompletedDialog = document.getElementById('clear-completed-dialog');
  if (clearCompletedDialog) {
    const titleEl = clearCompletedDialog.querySelector('.ai-confirm-title');
    const messageEl = clearCompletedDialog.querySelector('.ai-confirm-message');
    const confirmBtn = clearCompletedDialog.querySelector('.ai-confirm-delete');
    const cancelBtn = clearCompletedDialog.querySelector('.ai-confirm-cancel');
    
    if (titleEl) titleEl.textContent = getTranslation(currentLanguage, 'clearCompletedConfirmTitle');
    if (messageEl) messageEl.textContent = getTranslation(currentLanguage, 'clearCompletedConfirmMessage');
    if (confirmBtn) confirmBtn.textContent = getTranslation(currentLanguage, 'clearCompletedConfirmButton');
    if (cancelBtn) cancelBtn.textContent = getTranslation(currentLanguage, 'cancel');
  }

  // Notify other modules that language has changed so they can re-render
  window.dispatchEvent(new CustomEvent('languageChanged', {
    detail: { language: currentLanguage }
  }));

  // Update background section headers if they exist
  const bgStaticHeader = document.querySelector('#bg-static-section .bg-subsection-header');
  const bgInteractiveHeader = document.querySelector('#bg-interactive-section .bg-subsection-header');
  const bgLiveHeader = document.querySelector('#bg-live-section .bg-subsection-header');
  const bgStaticDesc = document.querySelector('#bg-static-section .bg-subsection-desc');
  const bgInteractiveDesc = document.querySelector('#bg-interactive-section .bg-subsection-desc');
  const bgLiveDesc = document.querySelector('#bg-live-section .bg-subsection-desc');
  
  if (bgStaticHeader) {
    bgStaticHeader.textContent = getTranslation(currentLanguage, 'background');
  }
  if (bgInteractiveHeader) {
    bgInteractiveHeader.textContent = getTranslation(currentLanguage, 'interactiveBackground');
  }
  if (bgLiveHeader) {
    bgLiveHeader.textContent = getTranslation(currentLanguage, 'liveBackground');
  }
  if (bgStaticDesc) {
    bgStaticDesc.textContent = getTranslation(currentLanguage, 'backgroundSettingsDesc');
  }
  if (bgInteractiveDesc) {
    bgInteractiveDesc.textContent = getTranslation(currentLanguage, 'interactiveBackgroundSettingsDesc');
  }
  if (bgLiveDesc) {
    bgLiveDesc.textContent = getTranslation(currentLanguage, 'liveBackgroundSettingsDesc');
  }

  // Update background rotation section header and description
  const bgRotationHeader = document.querySelector('#bg-rotation-section .bg-subsection-header');
  const bgRotationDesc = document.querySelector('#bg-rotation-section .bg-subsection-desc');
  if (bgRotationHeader) {
    bgRotationHeader.textContent = getTranslation(currentLanguage, 'bgRotation');
  }
  if (bgRotationDesc) {
    bgRotationDesc.textContent = getTranslation(currentLanguage, 'bgRotationDesc');
  }

}

// Get translated text with optional placeholder replacement
function t(key, replacements) {
  let message = getTranslation(currentLanguage, key);
  if (replacements && typeof replacements === 'object') {
    Object.entries(replacements).forEach(([placeholder, value]) => {
      message = message.replaceAll(`{${placeholder}}`, value);
    });
  }
  return message;
}

// Export functions for global use
window.i18n = {
  applyLanguage,
  t,
  currentLanguage: () => currentLanguage,
  getSupportedLanguages,
  getTranslations: (code) => ({ ...translations[code] }),
  gamesTranslationKeys: GAMES_ALL_TRANSLATION_KEYS,
  ensureLocale,
  // Registration hook for src/core/locales/<code>.js — not public API.
  __registerLocale: registerLocale
};
