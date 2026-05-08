// src/core/languages.js - Internationalization support

const translations = {
  en: {
    // General UI
    searchPlaceholder: "Search or enter website",
    newApp: "New",
    feedback: "Feedback",
    settings: "Settings",
    simpleMode: "Simple",
    todoList: "Todo List",
    addTodoPlaceholder: "Add a new todo...",
    dueDate: "Due Date",
    todoSetDate: "Set date",
    todoEditTooltip: "Edit Todo",
    todoDeleteTooltip: "Delete Todo",
    todoInlinePrevMonth: "Previous month",
    todoInlineNextMonth: "Next month",
    addTodo: "Add Todo",
    noTodos: "No todos yet. Add one above!",
    noTodosHint: "Try adding due dates for better organization.",
    newAppTitle: "New App",
    newAppDescription: "Enter a website URL to add it to your apps",
    enterUrl: "Enter website URL",
    cancel: "Cancel",
    create: "Create",
    quickAdd: "Quick Add",
    quickAddDesc: "Popular apps to get you started",

    // URL Validation messages
    validationPleaseEnter: "Please enter a URL or search query",
    validationInvalidAppears: "This URL appears to be invalid. Press Enter to Create",
    validationMissingHostname: "Invalid URL: missing hostname",
    validationInvalidChars: "Invalid URL: hostname contains invalid characters",
    validationTldTooShort: "Invalid URL: top-level domain too short",
    validationIncompleteDomain: "Invalid URL: incomplete domain name",
    validationIpOutOfRange: "Invalid URL: IP address out of range",
    validationValid: "Valid URL",
    validationMalformed: "Malformed URL",

    refreshMotto: "Refresh motto",
    copyMotto: "Copy motto",
    copyMottoCopied: "Copied",
    renameApp: "Rename",
    changeThumbnail: "Change Thumbnail",
    deleteApp: "Delete",

    // Settings
    general: "General",
    background: "Background",
    apps: "Apps",
    clock: "Clock",
    date: "Date",
    themes: "Themes",
    language: "Language",
    about: "About",

    // General settings
    generalSettings: "General",
    generalSettingsDesc: "Configure basic app behavior",
    openNewTab: "Open apps in a new tab",
    enableTodoList: "Enable todo list",

    // Background settings
    backgroundSettings: "Background",
    backgroundSettingsDesc: "Choose your background image",
    interactiveBackground: "Interactive Background",
    interactiveBackgroundSettingsDesc: "Choose a subtle pointer-reactive background",
    liveBackground: "Live Background",
    liveBackgroundSettings: "Live Background",
    liveBackgroundSettingsDesc: "Choose an animated background video",
    uploadBackground: "Upload Background",
    uploadLiveBackground: "Upload Live Background",

    // Apps settings
    appsSettings: "Apps",
    appsSettingsDesc: "Customize app icons",
    iconStyle: "Icon Style",
    iconStyleDesc: "Choose the shape and appearance of your app icons",
    minimal: "Minimal",
    square: "Square",
    rounded: "Rounded",
    circle: "Circle",
    iconSize: "Icon Size",
    iconSizeDesc: "Adjust the size of your app icons",
    resetSize: "Reset Size",

    // Clock settings
    clockSettings: "Clock Style",
    clockSettingsDesc: "Customize the appearance of your clock display",
    clockFormat: "Time Format",
    clockFormatAuto: "Locale Default",
    clockFormat12Hour: "12-Hour",
    clockFormat24Hour: "24-Hour",
    color: "Color",
    font: "Font",
    size: "Size",
    resetStyle: "Reset Style",

    // Date settings
    dateSettings: "Date Style",
    dateSettingsDesc: "Customize the appearance of your date display",
    dateFormat: "Date Format",
    dateFormatAuto: "Locale Default",
    dateFormatLong: "Long",
    dateFormatCompact: "Compact",
    dateFormatNumeric: "Numeric",

    // Themes settings
    themeSettings: "Theme",
    themeSettingsDesc: "Choose your preferred interface theme",
    dark: "Dark",
    light: "Light",

    // Language settings
    languageSettings: "Language",
    languageSettingsDesc: "Choose your preferred language",
    english: "English",
    chinese: "中文",

    // About settings
    aboutSettings: "About New-Tab",
    aboutSettingsDesc: "Customize your new tab experience with beautiful backgrounds, apps, and settings",
    project: "Project",
    version: "Version",
    createdBy: "Created by",
    openSource: "Open source project",
    onboardingTour: "Onboarding Tour",
    restartTour: "Restart Tour",
    tourDesc: "Review the key features and customization options",
    startTour: "Start Tour",
    repository: "Repository",
    viewSource: "View source code & contribute",
    updates: "Updates",
    enableUpdates: "Enable automatic update checks",
    updateStatus: "Update checker not loaded",
    updateCheckerNotLoaded: "Update checker not loaded",
    checkNow: "Check for Updates Now",
    updateDesc: "Checks for new versions from GitHub releases once per day when enabled.",
    versionLabel: "Version",
    updateChecksDisabled: "Update checks disabled",
    updateChecksBrowserOnly: "Version checks are only available when the extension is loaded in the browser.",
    updateChecksUnavailableOutsideRuntime: "Update checks are unavailable outside the extension runtime.",
    updateCheckFailed: "Failed to check for updates. Please try again later.",
    updateCheckUnsupportedVersion: "Unable to compare version strings because the update metadata uses an unsupported format.",
    updateNotificationTitle: "New version available!",
    updateNotificationBody: "New-Tab v{version} is now available.",
    updateNotificationViewRelease: "View Release",
    updateManualNewVersion: "New version v{version} is available!",
    updateManualDevelopmentVersion: "You're running a development version (v{currentVersion}). Latest release is v{latestVersion}.",
    updateManualLatestVersion: "You're running the latest version!",
    dismiss: "Dismiss",
    neverChecked: "Never checked for updates",
    lastCheckedLessThanHour: "Last checked: less than an hour ago",
    lastCheckedHoursAgo: "Last checked: {n} hour ago",
    lastCheckedHoursAgoPlural: "Last checked: {n} hours ago",
    lastCheckedDaysAgo: "Last checked: {n} day ago",
    lastCheckedDaysAgoPlural: "Last checked: {n} days ago",
    checking: "Checking...",

    // Calendar
    clear: "Clear",
    today: "Today",

    // Days of week
    sunday: "Su",
    monday: "Mo",
    tuesday: "Tu",
    wednesday: "We",
    thursday: "Th",
    friday: "Fr",
    saturday: "Sa",

    // Months (for calendar)
    january: "January",
    february: "February",
    march: "March",
    april: "April",
    may: "May",
    june: "June",
    july: "July",
    august: "August",
    september: "September",
    october: "October",
    november: "November",
    december: "December",

    // Todo date picker
    clearDate: "Clear",
    todayDate: "Today",
    
    // Todo filters
    filterAll: "All",
    filterPending: "Pending",
    filterCompleted: "Completed",
    filterOverdue: "Overdue",
    clearCompletedText: "Clear Completed",
    clearCompletedConfirmTitle: "Clear Completed Todos?",
    clearCompletedConfirmMessage: "This will permanently remove all completed todos. This action cannot be undone.",
    clearCompletedConfirmButton: "Clear Completed",
    emptyStateTitle: "No todos yet. Add one above!",
    emptyStateDesc: "Try adding due dates for better organization.",

    // Onboarding
    onboardingLanguageTitle: "Choose Your Language 🌐",
    onboardingLanguageContent: "Select your preferred language for the interface. You can change this later in Settings.",
    onboardingThemeTitle: "Choose Your Theme 🌙",
    onboardingThemeContent: "Select your preferred interface theme. You can switch between dark and light modes anytime in Settings.",
    onboardingWelcomeTitle: "Welcome to New-Tab! 🎉",
    onboardingWelcomeContent: "Let's take a quick tour of the features to help you get started with personalizing your new tab page.",
    onboardingClockTitle: "Clock & Date Display",
    onboardingClockContent: "Your current time and date are displayed here. You can customize the appearance in Settings.",
    onboardingSearchTitle: "Web Search",
    onboardingSearchContent: "Search the web from your new tab using your browser's default search provider.",
    onboardingAppsTitle: "App Shortcuts",
    onboardingAppsContent: "Add your favorite websites as quick-launch icons. Drag and drop to reorder them.",
    onboardingBackgroundTitle: "Beautiful Backgrounds",
    onboardingBackgroundContent: "Choose from stunning built-in backgrounds or upload your own. Access this in Settings > Background.",
    onboardingMottoTitle: "Daily Inspiration",
    onboardingMottoContent: "Enjoy a new motivational quote each day. Click the refresh button to get a random quote or the copy button to copy it.",
    onboardingSettingsTitle: "Customization Center",
    onboardingSettingsContent: "Click the gear icon to access extensive customization options for themes, styling, and more.",
    onboardingCompleteTitle: "You're All Set! ✨",
    onboardingCompleteContent: "You now know the basics of New-Tab. Explore the settings to make it truly yours. You can always restart this tour from Settings > About.",

    // Onboarding navigation
    previous: "Previous",
    next: "Next",
    finish: "Finish",

    // AI Assistant
    ai: "AI Assistant",
    aiAssistant: "AI Assistant",
    aiWelcome: "Welcome to AI Assistant",
    aiWelcomeSubtitle: "Ask me anything!",
    aiPlaceholder: "Type your message...",
    aiError: "An error occurred. Please try again.",
    aiRateLimit: "Too many requests. Please wait.",
    aiRequestInProgress: "A request is already in progress. Please wait for it to complete.",
    aiClearConfirm: "Clear chat history?",
    aiAPIKeyMissing: "API key not configured",
    aiSearchEnabled: "Enable AI search",
    aiSearchConversations: "Search...",
    aiDeleteConfirmTitle: "Delete Conversation?",
    aiDeleteConfirmMessage: "This action cannot be undone. The entire conversation will be permanently removed.",
    aiNewChat: "New Chat",
    aiConversations: "Conversations",
    aiNoConversations: "No conversations yet",
    aiNewConversation: "New Conversation",
    aiDeleteConversation: "Ctrl+Click to delete without confirmation",
    aiDeleteConfirm: "Delete this conversation?",
    aiJustNow: "Just now",
    aiOnline: "Online",
    aiOffline: "Offline",
    aiThinking: "Thinking...",
    aiAuthError: "Invalid or missing API key",
    aiForbidden: "Access forbidden",
    aiServerError: "Service error. Please try again later.",
    aiNetworkError: "Network error occurred",
    aiInvalidResponse: "Invalid response format",
    aiNoContent: "No content in response",
    aiMessageRequired: "Message is required",
    aiMessageEmpty: "Message cannot be empty",
    aiMessageTooLong: "Message too long (max 2000 characters)",
    aiStopStreaming: "Stop",
    aiScrollToBottom: "Scroll to bottom"
  },

  zh: {
    // General UI
    searchPlaceholder: "搜索或输入网站",
    newApp: "新建",
    feedback: "反馈",
    settings: "设置",
    simpleMode: "简洁",
    todoList: "待办清单",
    addTodoPlaceholder: "添加新待办事项...",
    dueDate: "到期日期",
    todoSetDate: "设置日期",
    todoEditTooltip: "编辑待办",
    todoDeleteTooltip: "删除待办",
    todoInlinePrevMonth: "上个月",
    todoInlineNextMonth: "下个月",
    addTodo: "添加待办",
    noTodos: "还没有待办事项。在上方添加一个！",
    noTodosHint: "尝试添加到期日期以更好地组织。",
    newAppTitle: "新建应用",
    newAppDescription: "输入网站URL将其添加到您的应用",
    enterUrl: "输入网站URL",
    cancel: "取消",
    create: "创建",
    quickAdd: "快速添加",
    quickAddDesc: "热门应用让您快速上手",

    // URL Validation messages
    validationPleaseEnter: "请输入URL或搜索词",
    validationInvalidAppears: "此URL似乎无效。按回车键创建",
    validationMissingHostname: "无效URL：缺少主机名",
    validationInvalidChars: "无效URL：主机名包含无效字符",
    validationTldTooShort: "无效URL：顶级域名太短",
    validationIncompleteDomain: "无效URL：域名不完整",
    validationIpOutOfRange: "无效URL：IP地址超出范围",
    validationValid: "有效URL",
    validationMalformed: "格式错误的URL",

    refreshMotto: "刷新格言",
    copyMotto: "复制格言",
    copyMottoCopied: "已复制",
    renameApp: "重命名",
    changeThumbnail: "更改缩略图",
    deleteApp: "删除",

    // Settings
    general: "通用",
    background: "背景",
    apps: "应用",
    clock: "时钟",
    date: "日期",
    themes: "主题",
    language: "语言",
    about: "关于",

    // General settings
    generalSettings: "通用",
    generalSettingsDesc: "配置基本应用行为",
    openNewTab: "在新标签页中打开应用",
    enableTodoList: "启用待办清单",

    // Background settings
    backgroundSettings: "背景",
    backgroundSettingsDesc: "选择您的背景图片",
    interactiveBackground: "交互式背景",
    interactiveBackgroundSettingsDesc: "选择一个会轻微响应指针的背景",
    liveBackground: "动态背景",
    liveBackgroundSettings: "动态背景",
    liveBackgroundSettingsDesc: "选择动态背景视频",
    uploadBackground: "上传背景图片",
    uploadLiveBackground: "上传动态背景",

    // Apps settings
    appsSettings: "应用",
    appsSettingsDesc: "自定义应用图标",
    iconStyle: "图标样式",
    iconStyleDesc: "选择应用图标的形状和外观",
    minimal: "极简",
    square: "方形",
    rounded: "圆角",
    circle: "圆形",
    iconSize: "图标大小",
    iconSizeDesc: "调整应用图标的大小",
    resetSize: "重置大小",

    // Clock settings
    clockSettings: "时钟样式",
    clockSettingsDesc: "自定义时钟显示的外观",
    clockFormat: "时间格式",
    clockFormatAuto: "跟随地区",
    clockFormat12Hour: "12小时制",
    clockFormat24Hour: "24小时制",
    color: "颜色",
    font: "字体",
    size: "大小",
    resetStyle: "重置样式",

    // Date settings
    dateSettings: "日期样式",
    dateSettingsDesc: "自定义日期显示的外观",
    dateFormat: "日期格式",
    dateFormatAuto: "跟随地区",
    dateFormatLong: "长格式",
    dateFormatCompact: "紧凑格式",
    dateFormatNumeric: "数字格式",

    // Themes settings
    themeSettings: "主题",
    themeSettingsDesc: "选择您喜欢的界面主题",
    dark: "深色",
    light: "浅色",

    // Language settings
    languageSettings: "语言",
    languageSettingsDesc: "选择您喜欢的语言",
    english: "English",
    chinese: "中文",

    // About settings
    aboutSettings: "关于 New-Tab",
    aboutSettingsDesc: "使用美丽的背景、应用和设置自定义您的新标签页体验",
    project: "项目",
    version: "版本",
    createdBy: "创建者",
    openSource: "开源项目",
    onboardingTour: "引导之旅",
    restartTour: "重新开始",
    tourDesc: "查看关键功能和自定义选项",
    startTour: "开始之旅",
    repository: "代码库",
    viewSource: "查看源代码并贡献",
    updates: "更新",
    enableUpdates: "启用自动更新检查",
    updateStatus: "更新检查器未加载",
    updateCheckerNotLoaded: "更新检查器未加载",
    checkNow: "立即检查更新",
    updateDesc: "启用后，每天从 GitHub releases 检查新版本一次。",
    versionLabel: "版本",
    updateChecksDisabled: "更新检查已禁用",
    updateChecksBrowserOnly: "只有在浏览器中加载扩展时才能检查版本。",
    updateChecksUnavailableOutsideRuntime: "在扩展运行环境之外无法检查更新。",
    updateCheckFailed: "检查更新失败，请稍后重试。",
    updateCheckUnsupportedVersion: "无法比较版本字符串，因为更新元数据使用了不受支持的格式。",
    updateNotificationTitle: "发现新版本！",
    updateNotificationBody: "New-Tab v{version} 现已可用。",
    updateNotificationViewRelease: "查看发布",
    updateManualNewVersion: "发现新版本 v{version}！",
    updateManualDevelopmentVersion: "您正在运行开发版本（v{currentVersion}）。最新发布版本为 v{latestVersion}。",
    updateManualLatestVersion: "您正在运行最新版本！",
    dismiss: "关闭",
    neverChecked: "从未检查更新",
    lastCheckedLessThanHour: "上次检查：不到一小时前",
    lastCheckedHoursAgo: "上次检查：{n} 小时前",
    lastCheckedHoursAgoPlural: "上次检查：{n} 小时前",
    lastCheckedDaysAgo: "上次检查：{n} 天前",
    lastCheckedDaysAgoPlural: "上次检查：{n} 天前",
    checking: "检查中...",

    // Calendar
    clear: "清除",
    today: "今天",

    // Days of week
    sunday: "日",
    monday: "一",
    tuesday: "二",
    wednesday: "三",
    thursday: "四",
    friday: "五",
    saturday: "六",

    // Months (for calendar)
    january: "一月",
    february: "二月",
    march: "三月",
    april: "四月",
    may: "五月",
    june: "六月",
    july: "七月",
    august: "八月",
    september: "九月",
    october: "十月",
    november: "十一月",
    december: "十二月",

    // Todo date picker
    clearDate: "清除",
    todayDate: "今天",
    
    // Todo filters
    filterAll: "全部",
    filterPending: "待处理",
    filterCompleted: "已完成",
    filterOverdue: "已逾期",
    clearCompletedText: "清除已完成",
    clearCompletedConfirmTitle: "清除已完成的待办事项？",
    clearCompletedConfirmMessage: "这将永久删除所有已完成的待办事项。此操作无法撤消。",
    clearCompletedConfirmButton: "清除已完成",
    emptyStateTitle: "还没有待办事项。在上方添加一个！",
    emptyStateDesc: "尝试添加到期日期以更好地组织。",

    // Onboarding
    onboardingLanguageTitle: "选择您的语言 🌐",
    onboardingLanguageContent: "为界面选择您偏好的语言。您可以稍后在设置中更改此选项。",
    onboardingThemeTitle: "选择您的主题 🌙",
    onboardingThemeContent: "选择您偏好的界面主题。您可以随时在设置中在深色和浅色模式之间切换。",
    onboardingWelcomeTitle: "欢迎使用 New-Tab！🎉",
    onboardingWelcomeContent: "让我们快速浏览一下功能，帮助您开始个性化新标签页。",
    onboardingClockTitle: "时钟和日期显示",
    onboardingClockContent: "此处显示您当前的日期和时间。您可以在设置中自定义外观。",
    onboardingSearchTitle: "网页搜索",
    onboardingSearchContent: "通过浏览器默认搜索提供程序从新标签页搜索网络。",
    onboardingAppsTitle: "应用快捷方式",
    onboardingAppsContent: "将您最喜爱的网站添加为快速启动图标。拖拽重新排序。",
    onboardingBackgroundTitle: "美丽的背景",
    onboardingBackgroundContent: "从令人惊叹的内置背景中选择，或上传您自己的背景。在设置 > 背景中访问此功能。",
    onboardingMottoTitle: "每日灵感",
    onboardingMottoContent: "每天享受新的励志语录。点击刷新按钮获取随机语录或点击复制按钮复制它。",
    onboardingSettingsTitle: "自定义中心",
    onboardingSettingsContent: "点击齿轮图标访问主题、样式等方面的广泛自定义选项。",
    onboardingCompleteTitle: "您已准备就绪！✨",
    onboardingCompleteContent: "您现在知道了 New-Tab 的基础知识。探索设置以使其真正属于您。您可以随时从设置 > 关于中重新启动此之旅。",

    // Onboarding navigation
    previous: "上一步",
    next: "下一步",
    finish: "完成",

    // AI Assistant
    ai: "AI 助手",
    aiAssistant: "AI 助手",
    aiWelcome: "欢迎使用 AI 助手",
    aiWelcomeSubtitle: "问我任何问题！",
    aiPlaceholder: "输入您的消息...",
    aiError: "发生错误，请重试。",
    aiRateLimit: "请求过多，请稍后再试。",
    aiRequestInProgress: "请求正在进行中，请等待完成。",
    aiClearConfirm: "清除聊天历史？",
    aiAPIKeyMissing: "API 密钥未配置",
    aiSearchEnabled: "启用 AI 搜索",
    aiSearchConversations: "搜索...",
    aiDeleteConfirmTitle: "删除对话？",
    aiDeleteConfirmMessage: "此操作无法撤消。整个对话将被永久删除。",
    aiNewChat: "新对话",
    aiConversations: "对话列表",
    aiNoConversations: "暂无对话记录",
    aiNewConversation: "新对话",
    aiDeleteConversation: "Ctrl+点击直接删除",
    aiDeleteConfirm: "确定删除此对话？",
    aiJustNow: "刚刚",
    aiOnline: "在线",
    aiOffline: "离线",
    aiThinking: "思考中...",
    aiAuthError: "API 密钥无效或未配置",
    aiForbidden: "访问被拒绝",
    aiServerError: "服务错误，请稍后再试。",
    aiNetworkError: "网络错误",
    aiInvalidResponse: "响应格式无效",
    aiNoContent: "响应中没有内容",
    aiMessageRequired: "消息不能为空",
    aiMessageEmpty: "消息不能为空",
    aiMessageTooLong: "消息太长（最多2000个字符）",
    aiStopStreaming: "停止",
    aiScrollToBottom: "滚动到底部"
  }
};

// Current language
let currentLanguage = 'en';

function getTranslation(lang, key) {
  const localeTranslations = translations[lang];
  if (localeTranslations && Object.prototype.hasOwnProperty.call(localeTranslations, key)) {
    const translation = localeTranslations[key];
    if (translation !== "") {
      return translation;
    }
  }

  const englishTranslations = translations.en;
  if (englishTranslations && Object.prototype.hasOwnProperty.call(englishTranslations, key)) {
    const translation = englishTranslations[key];
    if (translation !== "") {
      return translation;
    }
  }

  return key;
}

// Load language from localStorage
function loadLanguage() {
  return localStorage.getItem("language") || "en";
}

// Save language to localStorage
function saveLanguage(lang) {
  localStorage.setItem("language", lang);
}

// Apply language to UI
function applyLanguage(lang) {
  currentLanguage = lang;
  saveLanguage(lang);

  // Update document lang attribute
  document.documentElement.lang = lang;

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
  
  // Update filter pills
  const filterAll = document.querySelector('.filter-pill[data-filter="all"]');
  const filterPending = document.querySelector('.filter-pill[data-filter="pending"]');
  const filterCompleted = document.querySelector('.filter-pill[data-filter="completed"]');
  const filterOverdue = document.querySelector('.filter-pill[data-filter="overdue"]');
  
  if (filterAll) filterAll.childNodes[0].textContent = getTranslation(currentLanguage, 'filterAll') + ' ';
  if (filterPending) filterPending.childNodes[0].textContent = getTranslation(currentLanguage, 'filterPending') + ' ';
  if (filterCompleted) filterCompleted.childNodes[0].textContent = getTranslation(currentLanguage, 'filterCompleted') + ' ';
  if (filterOverdue) filterOverdue.childNodes[0].textContent = getTranslation(currentLanguage, 'filterOverdue') + ' ';
  
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

  // Update upload button titles
  const uploadBgBtn = document.querySelector('.upload-bg-btn[data-upload-type="image"]');
  const uploadLiveBtn = document.querySelector('.upload-bg-btn[data-upload-type="video"]');
  if (uploadBgBtn) {
    uploadBgBtn.title = getTranslation(currentLanguage, 'uploadBackground');
  }
  if (uploadLiveBtn) {
    uploadLiveBtn.title = getTranslation(currentLanguage, 'uploadLiveBackground');
  }
}

// Get translated text
function t(key) {
  return getTranslation(currentLanguage, key);
}

// Initialize language system
function initLanguage() {
  const lang = loadLanguage();
  applyLanguage(lang);
}

// Export functions for global use
window.i18n = {
  applyLanguage,
  t,
  currentLanguage: () => currentLanguage
};