// Helper functions shared across the public pages. Imported as an ES module
// by each page script at the end of the body, after the classic translations.js
// and main.js deferred scripts have already run.

// The stored path points at the full image. The 400px thumbnail sits beside it
// with a -thumb suffix before the file extension.
export function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
}
