export function downloadFile(data: Uint8Array | string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * On phones, a blob link makes iOS Safari replace the app with its PDF viewer
 * (no way back, no save button). The share sheet offers "Save to Files" instead.
 * Returns the file when that route is available, else null (use downloadFile).
 */
export function shareableFile(data: Uint8Array, filename: string, type: string): File | null {
  const file = new File([data as BlobPart], filename, { type });
  const phone = window.matchMedia('(pointer: coarse)').matches;
  return phone && navigator.canShare?.({ files: [file] }) ? file : null;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/[\/:*?"<>|\u0000-\u001f]+/g, '_')
    .slice(0, 150);
  return cleaned || 'tai-lieu';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
