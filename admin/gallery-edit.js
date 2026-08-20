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
import { WORKER_UPLOAD_URL, WORKER_REMOVE_URL, uploadBranch } from "./upload.js";

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

// When a cover image is selected, resize it in the browser and send it to
// the upload Worker with the admin's ID token. The committed path is
// remembered and stored on save.
coverImageInput.addEventListener("change", async function () {
  const file = coverImageInput.files && coverImageInput.files[0];
  if (!file) {
    return;
  }

  clearCoverImageError();
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

    if (response.status === 401) {
      showCoverImageError(
        "Your session has expired. Sign in again and retry.",
      );
      coverImageUploadStatus.hidden = true;
      coverImagePreview.hidden = true;
      return;
    }

    if (!response.ok) {
      throw new Error("Upload failed with status " + response.status);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Upload failed");
    }

    uploadedCoverImageUrl = result.files[0].path;

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
    showCoverImageError("Failed to upload the cover image. Try again.");
    coverImageUploadStatus.hidden = true;
    coverImagePreview.hidden = true;
  }
});

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
  thumb.src = image.thumbUrl || image.url;
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

// Every photo selected in one go is resized and sent to the Worker as a
// single commit, the same batching rule the cover image and every other
// upload on this site follows, so an album of twenty photos does not spend
// twenty of the free tier's 500 monthly builds.
photosInput.addEventListener("change", async function () {
  const files = Array.from(photosInput.files || []);
  if (files.length === 0) {
    return;
  }

  clearPhotosError();
  photosUploadStatus.hidden = false;
  photosUploadStatus.textContent =
    "Uploading your photos... they will appear on the site in about a minute.";

  try {
    const resized = await Promise.all(
      files.map(function (file) {
        return resizeImage(file);
      }),
    );
    const token = await auth.currentUser.getIdToken();
    const branch = uploadBranch();

    const uploadFiles = [];
    resized.forEach(function (image) {
      uploadFiles.push({ data: image.fullBase64, type: "image/webp" });
      uploadFiles.push({
        data: image.thumbBase64,
        type: "image/webp",
        thumb: true,
      });
    });

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

    if (response.status === 401) {
      showPhotosError("Your session has expired. Sign in again and retry.");
      photosUploadStatus.hidden = true;
      photosInput.value = "";
      return;
    }

    if (!response.ok) {
      throw new Error("Upload failed with status " + response.status);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Upload failed");
    }

    // The Worker returns paths in the order the files were sent: full,
    // thumb, full, thumb, matching how uploadFiles was built above.
    files.forEach(function (file, index) {
      images.push({
        url: result.files[index * 2].path,
        thumbUrl: result.files[index * 2 + 1].path,
        alt: "",
      });
    });
    renderPhotoList();
    photosUploadStatus.textContent =
      "Photos uploaded. They will appear on the site in about a minute.";
  } catch (error) {
    console.error("Photo upload failed:", error);
    showPhotosError("Failed to upload the photos. Try again.");
    photosUploadStatus.hidden = true;
  } finally {
    photosInput.value = "";
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

  const albumData = {
    title: title,
    eventName: eventName,
    year: year,
    coverImageUrl: uploadedCoverImageUrl,
    images: images,
  };

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
