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
  // Windows reports an empty type for some camera files, so say which file and
  // what it came through as. "Not an image" on its own sends someone looking
  // for a corrupt photo when the photo is fine and only the type is missing.
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error(
      'The browser did not recognise "' +
        (file.name || "that file") +
        '" as an image. It came through as ' +
        (file.type ? '"' + file.type + '"' : "no file type at all") +
        ". Re-saving it from an image editor usually fixes this.",
    );
  }

  const original = await readImage(file);
  const full = await scaleToWebP(original, MAX_LONG_EDGE, QUALITY);
  const thumb = await scaleToWebP(original, THUMB_LONG_EDGE, QUALITY);

  return {
    fullBase64: full,
    thumbBase64: thumb,
  };
}

// Reads a file exactly as it is and returns its base64 content, for files
// that cannot be put through a canvas, such as a PDF attachment.
export function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      // reader.result is a data URL, so only the part after the comma is
      // the base64 payload the Worker expects.
      resolve(reader.result.split(",")[1]);
    };

    reader.onerror = function () {
      reject(new Error("Failed to read the file."));
    };

    reader.readAsDataURL(file);
  });
}

// Loads a File into an HTMLImageElement so we can read its natural size.
function readImage(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(url);

      // A browser that cannot decode a file sometimes fires load anyway and
      // reports no size, which used to produce a zero by zero canvas, an empty
      // base64 string, and a confusing "Each file needs data and a type" from
      // the Worker. Caught here instead, where the real cause is still visible.
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(
          new Error(
            'The browser loaded "' +
              (file.name || "that file") +
              '" but could not decode it, so it has no size. It may be a raw ' +
              "camera file renamed to .jpg, or saved in a format this browser " +
              "cannot read. Re-save it as a normal JPEG or PNG and try again.",
          ),
        );
        return;
      }

      resolve(img);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          'The browser could not read "' +
            (file.name || "that file") +
            '". The file may be damaged, or in a format it cannot open.',
        ),
      );
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

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/webp", quality);
    } catch (error) {
      reject(new Error("This browser could not encode the image as WebP."));
      return;
    }

    // toDataURL does not throw when it cannot honour the type asked for. It
    // quietly returns PNG instead, and a PNG of a photograph is several times
    // the size of the WebP, which is enough to push a large picture past the
    // Worker's five megabyte limit. Worth naming rather than letting it come
    // back as an unexplained 413.
    if (!dataUrl.startsWith("data:image/webp")) {
      reject(
        new Error(
          "This browser cannot save images as WebP, so it fell back to a much " +
            "larger format. Try Chrome, Edge or Firefox.",
        ),
      );
      return;
    }

    // Strip the "data:image/webp;base64," prefix so we send pure base64.
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      reject(
        new Error(
          "The resized image came out empty at " +
            width +
            " by " +
            height +
            " pixels. The original may be damaged.",
        ),
      );
      return;
    }

    resolve(base64);
  });
}
