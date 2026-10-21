<script lang="ts">
  import PlusSettingsPanel from './components/PlusSettingsPanel.svelte';
  import AppShell from './AppShell.svelte';
  import { editionDisplayName, plusMarkdownStatus } from './edition';
  import { exportHtml } from './api';
  import type { HtmlExportOptions } from './markdown/exportHtml';
  import {
    defaultPlusPreferences,
    loadPlusPreferences,
    plusReaderStyle,
    savePlusPreferences
  } from './plusPreferences';

  async function exportHtmlFile(path: string, options: HtmlExportOptions) {
    const { createExportHtml } = await import('./markdown/exportHtml');
    await exportHtml(path, await createExportHtml(options));
  }
</script>

<AppShell
  {editionDisplayName}
  defaultPreviewPreferences={defaultPlusPreferences}
  loadPreviewPreferences={loadPlusPreferences}
  savePreviewPreferences={savePlusPreferences}
  previewReaderStyle={plusReaderStyle}
  markdownStatus={plusMarkdownStatus}
  settingsPanelComponent={PlusSettingsPanel}
  enableHeadingSearch={true}
  {exportHtmlFile}
/>
