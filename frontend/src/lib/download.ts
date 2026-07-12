import JSZip from 'jszip';

/** Trigger a browser download of a single text file. */
export function downloadText(filename: string, content: string, mime = 'text/calendar'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  triggerDownload(filename, blob);
}

/** Bundle multiple named files into a .zip and download it. */
export async function downloadZip(
  zipName: string,
  files: { filename: string; content: string }[],
): Promise<void> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipName, blob);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
