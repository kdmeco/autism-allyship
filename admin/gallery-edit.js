// Admin gallery album create and edit. Reads the id from the URL if present
// and loads that album, otherwise shows an empty form for a new album. A
// cover image and any number of photos are resized in the browser and
// committed to the repo via the upload Worker, which only accepts requests
// that carry a signed in admin's Firebase ID token.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDoc,
  setDoc,
  addDoc,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { resizeImage } from "./resize-helper.js";
import {
  WORKER_UPLOAD_URL,
  WORKER_REMOVE_URL,
  uploadBranch,
  uploadFailureMessage,
  readJsonBody,
} from "./upload.js";

const form = document.getElementById("galleryForm");
const titleInput = document.getElementById("title");
const eventNameInput = document.getElementById("eventName");
const yearInput = document.getElementById("year");
const coverImageInput = document.getElementById("coverImage");
const coverImagePreview = document.getElementById("coverImagePreview");
const coverImageUploadStatus = document.getElementById(
  "coverImageUploadStatus",
);
const photosInput = document.getElementById("photos");
const photosUploadStatus = document.getElementById("photosUploadStatus");
const photoList = document.getElementById("photoList");
const noPhotosNote = document.getElementById("noPhotosNote");
const titleError = document.getElementById("titleError");
const yearError = document.getElementById("yearError");
const coverImageError = document.getElementById("coverImageError");
const photosError = document.getElementById("photosError");
const formError = document.getElementById("formError");
const heading = document.getElementById("galleryEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;
let uploadedCoverImageUrl = "";
let images = [];
let coverUploadInFlight = false;
let photosUploadInFlight = false;
const PHOTOS_PER_UPLOAD = 5;

function setCoverUploadBusy(busy) {
  coverUploadInFlight = busy;
  photosInput.disabled = busy || photosUploadInFlight;
  coverImageInput.disabled = busy;
  saveButton.disabled = busy || photosUploadInFlight;
}

function setPhotosUploadBusy(busy) {
  photosUploadInFlight = busy;
  photosInput.disabled = busy || coverUploadInFlight;
  coverImageInput.disabled = busy || coverUploadInFlight;
  saveButton.disabled = busy || coverUploadInFlight;
}

editingId = new URLSearchParams(window.location.search).get("id");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (editingId) {
    loadAlbum(editingId);
  } else {
    heading.textContent = "New album";
    renderPhotoList();
  }
});

async function loadAlbum(id) {
  try {
    const docSnapshot = await getDoc(doc(db, "galleries", id));
    if (!docSnapshot.exists()) {
      window.location.href = "gallery.html";
      return;
    }

    const data = docSnapshot.data();
    titleInput.value = data.title || "";
    eventNameInput.value = data.eventName || "";
    yearInput.value = typeof data.year === "number" ? data.year : "";
    uploadedCoverImageUrl = data.coverImageUrl || "";
    images = Array.isArray(data.images)
      ? data.images.map(function (image) {
          return {
            url: image.url || "",
            thumbUrl: image.thumbUrl || "",
            alt: image.alt || "",
          };
        })
      : [];
    renderPhotoList();
  } catch (error) {
    console.error("Failed to load album:", error);
    showFormError("Failed to load the album. Go back and try again.");
  }
}

// Builds a folder name from the year and a short slug of the title, so an
// album with no linked event still gets a sensible folder rather than one
// forced to look like an event name.
function albumSlug() {
  const year = parseInt(yearInput.value, 10) || new Date().getFullYear();
  const titleSlug = titleInput.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return year + "-" + (titleSlug || "album");
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  titleError.hidden = true;
  yearError.hidden = true;
  formError.hidden = true;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function showCoverImageError(message) {
  coverImageError.textContent = message;
  coverImageError.hidden = false;
}

function clearCoverImageError() {
  coverImageError.hidden = true;
  coverImageError.textContent = "";
}

function showPhotosError(message) {
  photosError.textContent = message;
  photosError.hidden = false;
}

function clearPhotosError() {
  photosError.hidden = true;
  photosError.textContent = "";
}

function currentAlbumData() {
  return {
    title: titleInput.value.trim(),
    eventName: eventNameInput.value.trim(),
    year: parseInt(yearInput.value, 10),
    coverImageUrl: uploadedCoverImageUrl,
    images: images,
  };
}

function validateAlbumForUpload() {
  clearErrors();
  const data = currentAlbumData();
  let valid = true;

  if (!data.title) {
    showError(titleError, "Enter a title before uploading photos.");
    valid = false;
  }
  if (!yearInput.value || !Number.isFinite(data.year)) {
    showError(yearError, "Enter the year before uploading photos.");
    valid = false;
  }
  return valid;
}

// A large import must survive a refresh or a failed later batch. Create the
// album once its required fields are present, then checkpoint its image list
// after every successful five-photo Worker request.
async function ensureAlbumCheckpoint() {
  const data = currentAlbumData();
  if (editingId) {
    await setDoc(doc(db, "galleries", editingId), data, { merge: true });
    return;
  }

  const ref = await addDoc(collection(db, "galleries"), data);
  editingId = ref.id;
  const url = new URL(window.location.href);
  url.searchParams.set("id", editingId);
  window.history.replaceState({}, "", url);
  heading.textContent = "Edit album";
}

// When a cover image is selected, resize it in the browser and send it to
// the upload Worker with the admin's ID token. The committed path is
// remembered and stored on save.
coverImageInput.addEventListener("change", async function () {
  const file = coverImageInput.files && coverImageInput.files[0];
  if (!file || coverUploadInFlight || photosUploadInFlight) {
    return;
  }

  clearCoverImageError();

  // The photo picker has always checked this and the cover picker never did,
  // which is how a cover uploaded before the title and year were typed ended up
  // in "2026-album": albumSlug() falls back to the current year and the word
  // album when both fields are empty, so the cover landed in a folder that
  // belonged to no album while the photos went to the real one. Same check as
  // the photos, same reason.
  if (!validateAlbumForUpload()) {
    coverImageInput.value = "";
    return;
  }

  setCoverUploadBusy(true);
  coverImageUploadStatus.hidden = false;
  coverImageUploadStatus.textContent = "Uploading image...";
  coverImagePreview.hidden = false;

  try {
    const resized = await resizeImage(file);
    const token = await auth.currentUser.getIdToken();
    const branch = uploadBranch();

    const response = await fetch(WORKER_UPLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        folder: "assets/uploads/gallery/" + albumSlug() + "/",
        commitMessage: "Upload gallery cover image",
        files: [
          { data: resized.fullBase64, type: "image/webp" },
          { data: resized.thumbBase64, type: "image/webp", thumb: true },
        ],
        branch: branch,
      }),
    });

    // Read the body once, then let one branch handle every kind of failure.
    // The Worker says exactly what was wrong, so that reason is what gets
    // shown instead of a generic retry prompt.
    const result = await readJsonBody(response);
    if (!response.ok || !result || !result.ok) {
      throw new Error(uploadFailureMessage(response.status, result));
    }

    uploadedCoverImageUrl = result.files[0].path;

    // Record it straight away, the way a finished photo batch is recorded. The
    // file is already committed to the repository at this point, so leaving it
    // only in a page variable means a refresh before Save loses the reference
    // while the image itself stays in the repository forever.
    try {
      await ensureAlbumCheckpoint();
    } catch (error) {
      console.error("Cover image checkpoint failed:", error);
    }

    const previousPreview = coverImagePreview.querySelector("img");
    if (previousPreview) {
      previousPreview.remove();
    }
    const previewImage = document.createElement("img");
    previewImage.src = "data:image/webp;base64," + resized.thumbBase64;
    previewImage.alt = file.name || "Cover image";
    coverImagePreview.insertBefore(previewImage, coverImageUploadStatus);
    coverImageUploadStatus.textContent =
      "Image uploaded. It will appear on the site in about a minute.";
  } catch (error) {
    console.error("Cover image upload failed:", error);
    // error.message is either the reason the Worker gave or the reason the
    // browser gave while resizing. Both name a cause; neither says "try again"
    // unless trying again is genuinely the right advice.
    showCoverImageError(
      error.message || "Failed to upload the cover image. Try again.",
    );
    coverImageUploadStatus.hidden = true;
    coverImagePreview.hidden = true;
  } finally {
    setCoverUploadBusy(false);
  }
});

// Stored media paths are relative to the site root, because the public pages
// that read them sit at the root. Every admin page is one level down in
// /admin/, so the same string resolves to /admin/assets/uploads/... and comes
// back 404, which is why the photo previews rendered as empty boxes. One level
// up is the whole fix. Data URLs and absolute paths are passed through
// untouched, so a just-resized preview still works.
function mediaSrc(path) {
  if (!path) {
    return "";
  }
  if (/^(data:|https?:|\/)/.test(path)) {
    return path;
  }
  return "../" + path;
}

function renderPhotoList() {
  photoList.textContent = "";
  noPhotosNote.hidden = images.length > 0;

  images.forEach(function (image, index) {
    photoList.appendChild(buildPhotoItem(image, index));
  });
}

function buildPhotoItem(image, index) {
  const item = document.createElement("li");
  item.className = "gallery-photo-item";

  const thumb = document.createElement("img");
  thumb.className = "gallery-photo-thumb";
  thumb.src = mediaSrc(image.thumbUrl || image.url);
  thumb.alt = "";
  thumb.width = 200;
  thumb.height = 133;
  item.appendChild(thumb);

  const altId = "photoAlt" + index;
  const altLabel = document.createElement("label");
  altLabel.className = "gallery-photo-alt-label";
  altLabel.setAttribute("for", altId);
  altLabel.textContent = "Description (optional)";
  item.appendChild(altLabel);

  const altInput = document.createElement("input");
  altInput.type = "text";
  altInput.id = altId;
  altInput.className = "gallery-photo-alt-input";
  altInput.value = image.alt || "";
  altInput.addEventListener("input", function () {
    image.alt = altInput.value;
  });
  item.appendChild(altInput);

  const actions = document.createElement("div");
  actions.className = "gallery-photo-actions";

  const moveUp = document.createElement("button");
  moveUp.type = "button";
  moveUp.className = "button button-secondary";
  moveUp.textContent = "Move up";
  moveUp.disabled = index === 0;
  moveUp.addEventListener("click", function () {
    moveImage(index, -1);
  });

  const moveDown = document.createElement("button");
  moveDown.type = "button";
  moveDown.className = "button button-secondary";
  moveDown.textContent = "Move down";
  moveDown.disabled = index === images.length - 1;
  moveDown.addEventListener("click", function () {
    moveImage(index, 1);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", function () {
    askToRemovePhoto(actions, image);
  });

  actions.appendChild(moveUp);
  actions.appendChild(moveDown);
  actions.appendChild(remove);
  item.appendChild(actions);

  return item;
}

function moveImage(index, step) {
  const targetIndex = index + step;
  if (targetIndex < 0 || targetIndex >= images.length) {
    return;
  }
  const moved = images.splice(index, 1)[0];
  images.splice(targetIndex, 0, moved);
  renderPhotoList();
}

// The photo was already committed to the repository the moment it was
// selected, so removing it here also asks the Worker to delete the file,
// rather than leaving an orphaned image nobody links to.
function askToRemovePhoto(actions, image) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "form-field-note";
  question.textContent = "Remove this photo? This cannot be undone.";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "button button-danger";
  yes.textContent = "Yes, remove";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Cancel";

  actions.appendChild(question);
  actions.appendChild(yes);
  actions.appendChild(cancel);
  cancel.focus();

  yes.addEventListener("click", function () {
    images = images.filter(function (other) {
      return other !== image;
    });
    renderPhotoList();
    removeUploadedPhoto(image);
  });

  cancel.addEventListener("click", renderPhotoList);
  actions.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      renderPhotoList();
    }
  });
}

function removeUploadedPhoto(image) {
  const paths = [image.url, image.thumbUrl]
    .filter(Boolean)
    .map(function (path) {
      return path.replace(/^\//, "");
    });
  if (paths.length === 0) {
    return;
  }

  const branch = uploadBranch();

  auth.currentUser
    .getIdToken()
    .then(function (token) {
      return fetch(WORKER_REMOVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ paths: paths, branch: branch }),
      });
    })
    .catch(function (error) {
      console.error("Failed to remove the uploaded photo:", error);
    });
}

// The Worker accepts ten files per request. Each source photo creates a full
// image and a thumbnail, so process at most five photos at a time. Only the
// current batch is held in memory and every completed batch is checkpointed.
photosInput.addEventListener("change", async function () {
  const files = Array.from(photosInput.files || []);
  if (files.length === 0 || coverUploadInFlight || photosUploadInFlight) {
    return;
  }

  clearPhotosError();
  if (!validateAlbumForUpload()) {
    photosInput.value = "";
    return;
  }

  setPhotosUploadBusy(true);
  photosUploadStatus.hidden = false;
  photosUploadStatus.textContent = "Preparing " + files.length + " photos...";

  let uploadedCount = 0;

  try {
    const token = await auth.currentUser.getIdToken();
    const branch = uploadBranch();

    await ensureAlbumCheckpoint();

    for (let start = 0; start < files.length; start += PHOTOS_PER_UPLOAD) {
      const batch = files.slice(start, start + PHOTOS_PER_UPLOAD);
      photosUploadStatus.textContent =
        "Resizing photos " +
        (start + 1) +
        " to " +
        (start + batch.length) +
        " of " +
        files.length +
        "...";

      const resized = await Promise.all(
        batch.map(function (file) {
          return resizeImage(file);
        }),
      );
      const uploadFiles = [];
      resized.forEach(function (image) {
        uploadFiles.push({ data: image.fullBase64, type: "image/webp" });
        uploadFiles.push({
          data: image.thumbBase64,
          type: "image/webp",
          thumb: true,
        });
      });

      photosUploadStatus.textContent =
        "Uploading " +
        (start + 1) +
        " to " +
        (start + batch.length) +
        " of " +
        files.length +
        "...";

      const response = await fetch(WORKER_UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          folder: "assets/uploads/gallery/" + albumSlug() + "/",
          commitMessage: "Upload gallery photos",
          files: uploadFiles,
          branch: branch,
        }),
      });

      const result = await readJsonBody(response);
      if (response.status === 401) {
        throw new Error("SESSION_EXPIRED");
      }
      if (!response.ok || !result || !result.ok) {
        throw new Error(uploadFailureMessage(response.status, result));
      }
      if (!Array.isArray(result.files) || result.files.length !== batch.length * 2) {
        throw new Error(
          "The upload service saved " +
            (Array.isArray(result.files) ? result.files.length : 0) +
            " files when " +
            batch.length * 2 +
            " were expected, so this batch was not recorded.",
        );
      }

      batch.forEach(function (_file, index) {
        images.push({
          url: result.files[index * 2].path,
          thumbUrl: result.files[index * 2 + 1].path,
          alt: "",
        });
      });
      uploadedCount += batch.length;
      renderPhotoList();
      try {
        await ensureAlbumCheckpoint();
      } catch (error) {
        console.error("Gallery checkpoint failed:", error);
        throw new Error("CHECKPOINT_FAILED");
      }
      photosUploadStatus.textContent =
        "Uploaded " + uploadedCount + " of " + files.length + " photos.";
    }

    photosUploadStatus.textContent =
      "Uploaded " + files.length + " photos. The album has been saved.";
  } catch (error) {
    console.error("Photo upload failed:", error);
    const remaining = files.length - uploadedCount;
    if (error.message === "SESSION_EXPIRED") {
      showPhotosError(
        "The upload service did not accept your sign in. Sign in again, then " +
          "select the remaining photos. If that does not help, your account may " +
          "not be on the upload service's admin list, which is separate from the " +
          "admin list on this site.",
      );
    } else if (error.message === "CHECKPOINT_FAILED") {
      showPhotosError(
        "The photos were uploaded, but the album checkpoint failed. Do not select them again. Choose Save album to keep the uploaded paths.",
      );
    } else {
      // The count tells them what to re-select; error.message tells them why it
      // stopped. Without the second half a size or format problem looks like a
      // random failure and gets retried forever.
      showPhotosError(
        "Uploaded " +
          uploadedCount +
          " of " +
          files.length +
          ". " +
          remaining +
          " photos were not uploaded. " +
          (error.message || "") +
          " Select the remaining photos and try again.",
      );
    }
    photosUploadStatus.textContent =
      error.message === "CHECKPOINT_FAILED"
        ? "Uploaded " + uploadedCount + " photos. Save the album before leaving this page."
        : "The " + uploadedCount + " completed photos are saved in this album.";
  } finally {
    photosInput.value = "";
    setPhotosUploadBusy(false);
  }
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const title = titleInput.value.trim();
  const eventName = eventNameInput.value.trim();
  const year = parseInt(yearInput.value, 10);

  let valid = true;

  if (!title) {
    showError(titleError, "Enter a title for the album.");
    valid = false;
  }

  if (!yearInput.value || !Number.isFinite(year)) {
    showError(yearError, "Enter the year this album is from.");
    valid = false;
  }

  if (!valid) {
    return;
  }

  const albumData = currentAlbumData();

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId) {
      await setDoc(doc(db, "galleries", editingId), albumData, {
        merge: true,
      });
    } else {
      const ref = await addDoc(collection(db, "galleries"), albumData);
      editingId = ref.id;
    }

    window.location.href = "gallery.html";
  } catch (error) {
    console.error("Failed to save album:", error);
    showFormError("Failed to save the album. Try again.");
    saveButton.disabled = false;
    saveButton.textContent = "Save album";
  }
});
