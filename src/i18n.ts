export type Language = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'md-view-language';

export type AppText = {
  languageName: string;
  dropText: string;
  actions: {
    openFolder: string;
    refresh: string;
    save: string;
    setDefault: string;
    setting: string;
    autoSave: string;
    theme: string;
    clearImage: string;
    chooseImage: string;
    immersive: string;
    exitImmersive: string;
    toggleLanguage: string;
    languageButton: string;
  };
  modes: Record<'read' | 'edit' | 'visual' | 'split', string>;
  panels: {
    folder: string;
    outline: string;
    noFolder: string;
    emptyTitle: string;
    emptyState: string;
    expandFolder: string;
    collapseFolder: string;
    expandOutline: string;
    collapseOutline: string;
    linePrefix: string;
    lineSuffix: string;
  };
  dialogs: Record<
    | 'chooseMarkdownDir'
    | 'openFailed'
    | 'refreshFailed'
    | 'unsavedTitle'
    | 'unsavedMessage'
    | 'readFailed'
    | 'restoreDraftTitle'
    | 'restoreDraftMessage'
    | 'saveConflictTitle'
    | 'diskChanged'
    | 'saveFailed'
    | 'chooseBackgroundImage'
    | 'imageFilter'
    | 'settingsFailed'
    | 'immersiveFailed'
    | 'closeFailed',
    string
  >;
  buttons: Record<'yes' | 'no' | 'cancel', string>;
  status: Record<
    | 'ready'
    | 'opening'
    | 'folderOpened'
    | 'openFailed'
    | 'folderRefreshed'
    | 'refreshFailed'
    | 'readingFile'
    | 'readFailed'
    | 'draftRestored'
    | 'fileOpened'
    | 'draftSaved'
    | 'draftFailed'
    | 'saving'
    | 'saveCancelled'
    | 'saved'
    | 'saveFailed'
    | 'autoSaveOn'
    | 'autoSaveOff'
    | 'autoSaveOffWithRemoved'
    | 'themeChanged'
    | 'backgroundApplied'
    | 'backgroundUnavailable'
    | 'backgroundCleared'
    | 'openingDefaultSettings'
    | 'openedDefaultSettings'
    | 'defaultSettingsFailed'
    | 'immersiveOn'
    | 'immersiveOff'
    | 'immersiveOnFailed'
    | 'immersiveOffFailed'
    | 'closeFailed'
    | 'languageChanged',
    string
  >;
  labels: {
    defaultAppTitle: string;
    autoSaveTitle: string;
    viewMode: string;
    clearBackground: string;
    chooseBackground: string;
    immersiveMode: string;
    dark: string;
    light: string;
  };
  themeNames: Record<string, string>;
  visual: {
    toolbar: string;
    paragraphStyle: string;
    paragraph: string;
    quote: string;
    codeBlock: string;
    bold: string;
    italic: string;
    link: string;
    unorderedList: string;
    orderedList: string;
    bulletList: string;
    numberList: string;
    insertCodeBlock: string;
    insertRule: string;
    insertTable: string;
    code: string;
    rule: string;
    table: string;
    linkPrompt: string;
    codePlaceholder: string;
    tableHeaders: [string, string, string];
  };
};

export type VisualText = AppText['visual'];

export const text: Record<Language, AppText> = {
  zh: {
    languageName: '中文',
    dropText: '松开以打开文本文件',
    actions: {
      openFolder: '打开目录',
      refresh: '刷新',
      save: '保存',
      setDefault: '设为默认',
      setting: '设置中',
      autoSave: '自动保存',
      theme: '主题',
      clearImage: '清除图',
      chooseImage: '背景图',
      immersive: '沉浸',
      exitImmersive: '退出沉浸',
      toggleLanguage: '切换语言',
      languageButton: 'EN'
    },
    modes: {
      read: '阅读',
      edit: '源码',
      visual: '编辑',
      split: '分屏'
    },
    panels: {
      folder: '目录',
      outline: '大纲',
      noFolder: '未打开目录',
      emptyTitle: '无标题',
      emptyState: '打开目录、打开文件或拖入文本文件。',
      expandFolder: '展开目录',
      collapseFolder: '收起目录',
      expandOutline: '展开大纲',
      collapseOutline: '收起大纲',
      linePrefix: '第',
      lineSuffix: '行'
    },
    dialogs: {
      chooseMarkdownDir: '选择 Markdown 目录',
      openFailed: '打开失败',
      refreshFailed: '刷新失败',
      unsavedTitle: '未保存修改',
      unsavedMessage: '当前文件有未保存修改，是否保存到原文件？',
      readFailed: '读取失败',
      restoreDraftTitle: '草稿恢复',
      restoreDraftMessage: '发现未保存草稿，是否恢复？',
      saveConflictTitle: '保存冲突',
      diskChanged: '磁盘文件已被外部修改，是否覆盖？',
      saveFailed: '保存失败',
      chooseBackgroundImage: '选择阅读区背景图片',
      imageFilter: '图片',
      settingsFailed: '设置失败',
      immersiveFailed: '沉浸模式失败',
      closeFailed: '关闭失败'
    },
    buttons: {
      yes: '保存',
      no: '不保存',
      cancel: '取消'
    },
    status: {
      ready: 'md-view 就绪',
      opening: '正在打开',
      folderOpened: '目录已打开',
      openFailed: '打开失败',
      folderRefreshed: '目录已刷新',
      refreshFailed: '刷新失败',
      readingFile: '正在读取文件',
      readFailed: '文件读取失败',
      draftRestored: '草稿已恢复',
      fileOpened: '文件已打开',
      draftSaved: '草稿已保存',
      draftFailed: '草稿失败',
      saving: '正在保存',
      saveCancelled: '保存已取消',
      saved: '已保存',
      saveFailed: '保存失败',
      autoSaveOn: '自动保存已开启',
      autoSaveOff: '自动保存已关闭',
      autoSaveOffWithRemoved: '自动保存已关闭，已清理 {count} 个草稿',
      themeChanged: '主题已切换为 {theme}',
      backgroundApplied: '背景图已应用',
      backgroundUnavailable: '背景图无法访问，已恢复纯色',
      backgroundCleared: '背景图已清除',
      openingDefaultSettings: '正在打开默认应用设置',
      openedDefaultSettings: '已打开默认应用设置',
      defaultSettingsFailed: '默认应用设置打开失败',
      immersiveOn: '沉浸模式已开启',
      immersiveOff: '沉浸模式已关闭',
      immersiveOnFailed: '沉浸模式开启失败',
      immersiveOffFailed: '沉浸模式关闭失败',
      closeFailed: '关闭失败',
      languageChanged: '已切换为中文'
    },
    labels: {
      defaultAppTitle: '设为默认应用',
      autoSaveTitle: '开启后自动写入草稿，并在切换或关闭时询问是否保存到原文件',
      viewMode: '视图模式',
      clearBackground: '清除背景图',
      chooseBackground: '选择背景图',
      immersiveMode: 'F11 沉浸模式',
      dark: '深色',
      light: '亮色'
    },
    themeNames: {
      'tea-light': '清茶 Light',
      'ink-light': '墨蓝 Light',
      'paper-light': '暖纸 Light',
      'night-dark': '夜航 Dark',
      'wisteria-dark': '紫藤 Dark',
      'amber-dark': '琥珀 Dark'
    },
    visual: {
      toolbar: '所见即所得格式工具',
      paragraphStyle: '段落样式',
      paragraph: '正文',
      quote: '引用',
      codeBlock: '代码块',
      bold: '加粗',
      italic: '斜体',
      link: '链接',
      unorderedList: '无序列表',
      orderedList: '有序列表',
      bulletList: '• 列表',
      numberList: '1. 列表',
      insertCodeBlock: '插入代码块',
      insertRule: '插入分隔线',
      insertTable: '插入表格',
      code: '代码',
      rule: '分隔线',
      table: '表格',
      linkPrompt: '链接地址',
      codePlaceholder: '代码',
      tableHeaders: ['列 1', '列 2', '列 3']
    }
  },
  en: {
    languageName: 'English',
    dropText: 'Release to open text file',
    actions: {
      openFolder: 'Open',
      refresh: 'Refresh',
      save: 'Save',
      setDefault: 'Default',
      setting: 'Setting',
      autoSave: 'Autosave',
      theme: 'Theme',
      clearImage: 'Clear',
      chooseImage: 'Image',
      immersive: 'Focus',
      exitImmersive: 'Exit',
      toggleLanguage: 'Switch language',
      languageButton: '中'
    },
    modes: {
      read: 'Read',
      edit: 'Source',
      visual: 'Edit',
      split: 'Split'
    },
    panels: {
      folder: 'Files',
      outline: 'Outline',
      noFolder: 'No folder opened',
      emptyTitle: 'No headings',
      emptyState: 'Open a folder, open a file, or drop a text file.',
      expandFolder: 'Expand files',
      collapseFolder: 'Collapse files',
      expandOutline: 'Expand outline',
      collapseOutline: 'Collapse outline',
      linePrefix: 'Line',
      lineSuffix: ''
    },
    dialogs: {
      chooseMarkdownDir: 'Choose Markdown folder',
      openFailed: 'Open failed',
      refreshFailed: 'Refresh failed',
      unsavedTitle: 'Unsaved changes',
      unsavedMessage: 'Save current changes to the original file?',
      readFailed: 'Read failed',
      restoreDraftTitle: 'Restore draft',
      restoreDraftMessage: 'Unsaved draft found. Restore it?',
      saveConflictTitle: 'Save conflict',
      diskChanged: 'The file changed on disk. Overwrite it?',
      saveFailed: 'Save failed',
      chooseBackgroundImage: 'Choose reader background image',
      imageFilter: 'Images',
      settingsFailed: 'Settings failed',
      immersiveFailed: 'Focus mode failed',
      closeFailed: 'Close failed'
    },
    buttons: {
      yes: 'Save',
      no: 'Discard',
      cancel: 'Cancel'
    },
    status: {
      ready: 'md-view ready',
      opening: 'Opening',
      folderOpened: 'Folder opened',
      openFailed: 'Open failed',
      folderRefreshed: 'Folder refreshed',
      refreshFailed: 'Refresh failed',
      readingFile: 'Reading file',
      readFailed: 'File read failed',
      draftRestored: 'Draft restored',
      fileOpened: 'File opened',
      draftSaved: 'Draft saved',
      draftFailed: 'Draft failed',
      saving: 'Saving',
      saveCancelled: 'Save cancelled',
      saved: 'Saved',
      saveFailed: 'Save failed',
      autoSaveOn: 'Autosave enabled',
      autoSaveOff: 'Autosave disabled',
      autoSaveOffWithRemoved: 'Autosave disabled, removed {count} drafts',
      themeChanged: 'Theme switched to {theme}',
      backgroundApplied: 'Background applied',
      backgroundUnavailable: 'Background unavailable, restored solid color',
      backgroundCleared: 'Background cleared',
      openingDefaultSettings: 'Opening default app settings',
      openedDefaultSettings: 'Default app settings opened',
      defaultSettingsFailed: 'Failed to open default app settings',
      immersiveOn: 'Focus mode on',
      immersiveOff: 'Focus mode off',
      immersiveOnFailed: 'Failed to enter focus mode',
      immersiveOffFailed: 'Failed to exit focus mode',
      closeFailed: 'Close failed',
      languageChanged: 'Switched to English'
    },
    labels: {
      defaultAppTitle: 'Set as default app',
      autoSaveTitle: 'Writes drafts automatically and asks before leaving unsaved changes',
      viewMode: 'View mode',
      clearBackground: 'Clear background image',
      chooseBackground: 'Choose background image',
      immersiveMode: 'F11 focus mode',
      dark: 'Dark',
      light: 'Light'
    },
    themeNames: {
      'tea-light': 'Tea Light',
      'ink-light': 'Ink Light',
      'paper-light': 'Warm Paper',
      'night-dark': 'Night Dark',
      'wisteria-dark': 'Wisteria Dark',
      'amber-dark': 'Amber Dark'
    },
    visual: {
      toolbar: 'Visual formatting tools',
      paragraphStyle: 'Paragraph style',
      paragraph: 'Paragraph',
      quote: 'Quote',
      codeBlock: 'Code block',
      bold: 'Bold',
      italic: 'Italic',
      link: 'Link',
      unorderedList: 'Bullet list',
      orderedList: 'Numbered list',
      bulletList: '• List',
      numberList: '1. List',
      insertCodeBlock: 'Insert code block',
      insertRule: 'Insert rule',
      insertTable: 'Insert table',
      code: 'Code',
      rule: 'Rule',
      table: 'Table',
      linkPrompt: 'Link URL',
      codePlaceholder: 'code',
      tableHeaders: ['Column 1', 'Column 2', 'Column 3']
    }
  }
};

export function loadLanguage(): Language {
  if (typeof localStorage === 'undefined') return 'zh';
  return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
}

export function saveLanguage(language: Language) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}

export function nextLanguage(language: Language): Language {
  return language === 'zh' ? 'en' : 'zh';
}

export function formatText(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
