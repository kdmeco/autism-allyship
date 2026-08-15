// Browser-side image resize helper.
// Resizes an image file to about 1600px on the long edge and re-encodes as
// WebP. Also produces a 400px thumbnail. Both come back as base64 strings
// ready to send to the upload Worker.
//
// A raw phone photo is 4 to 8MB. Resized to WebP it becomes about 250KB,
// which means it uploads quickly and still looks good on the site.

const MAX_LONG_EDGE = 1600;
const THUMB_LONG_EDGE = 400;
const QUALITY = 0.85;

// Takes a File object and returns an object with full and thumb base64 strings.
// Rejects if the file is not an image or cannot be decoded.
export async function resizeImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selected file is not an image.");
  }

  const original = await readImage(file);
  const full = await scaleToWebP(original, MAX_LONG_EDGE, QUALITY);
  const thumb = await scaleToWebP(original, THUMB_LONG_EDGE, QUALITY);

  return {
    fullBase64: full,
    thumbBase64: thumb,
  };
}

// Loads a File into an HTMLImageElement so we can read its natural size.
function readImage(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image file."));
    };

    img.src = url;
  });
}

// Draws the image scaled to the given long edge and returns the WebP base64.
function scaleToWebP(img, longEdge, quality) {
  return new Promise(function (resolve, reject) {
    const scale = Math.min(1, longEdge / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas not supported."));
      return;
    }

    ctx.drawImage(img, 0, 0, width, height);

    try {
      const dataUrl = canvas.toDataURL("image/webp", quality);
      // Strip the "data:image/webp;base64," prefix so we send pure base64.
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    } catch (error) {
      reject(new Error("WebP encoding not supported in this browser."));
    }
  });
}
