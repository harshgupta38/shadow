// Triggers the browser's save dialog for an already-fetched Blob — the
// standard object-URL-then-click-a-hidden-anchor trick, since there's no
// direct "save this blob as a file" browser API.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
