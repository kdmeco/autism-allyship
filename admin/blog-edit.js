// Admin blog post create and edit. Reads the id from the URL if present and
// loads that post, otherwise shows an empty form for a new post. Saves to the
// posts collection in Firestore. An optional featured image is resized in the
// browser and committed to the repo via the upload Worker, which only accepts
// requests that carry a signed in admin's Firebase ID token.

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

// The Worker serves its placeholder page at the root, so the upload endpoint
// answers at /upload.
const WORKER_URL = "https://autism-allyship-upload.kdmeco-dev.workers.dev/upload";

const form = document.getElementById("blogForm");
const titleInput = document.getElementById("title");
const categoryInput = document.getElementById("category");
const bodyInput = document.getElementById("body");
const publishedInput = document.getElementById("published");
const imageInput = document.getElementById("image");
const imageAltInput = document.getElementById("imageAlt");
const imagePreview = document.getElementById("imagePreview");
const imageUploadStatus = document.getElementById("imageUploadStatus");
const titleError = document.getElementById("titleError");
const bodyError = document.getElementById("bodyError");
const imageError = document.getElementById("imageError");
const formError = document.getElementById("formError");
const heading = document.getElementById("blogEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;
let uploadedImageUrl = "";

const urlParams = new URLSearchParams(window.location.search);
editingId = urlParams.get("id");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (editingId) {
    loadPost(editingId);
  } else {
    heading.textContent = "New post";
  }
});

async function loadPost(id) {
  try {
    const docSnapshot = await getDoc(doc(db, "posts", id));
    if (!docSnapshot.exists()) {
      window.location.href = "blog.html";
      return;
    }

    const data = docSnapshot.data();
    titleInput.value = data.title || "";
    categoryInput.value = data.category || "";
    bodyInput.value = data.body || "";
    publishedInput.checked = data.published === true;
    uploadedImageUrl = data.imageUrl || "";
    imageAltInput.value = data.imageAlt || "";
  } catch (error) {
    console.error("Failed to load post:", error);
    showFormError("Failed to load the post. Go back and try again.");
  }
}

// Images should land on the branch this page was served from, so an upload
// tested on staging appears on staging and not only on the live site.
function uploadBranch() {
  const host = window.location.hostname;
  if (host === "staging.autism-allyship.pages.dev") return "staging";
  if (host === "dev.autism-allyship.pages.dev") return "dev";
  if (host === "localhost" || host === "127.0.0.1") return "dev";
  return null;
}

// When an image is selected, resize it in the browser and send it to the
// upload Worker with the admin's ID token. The committed path is remembered
// and stored on save.
imageInput.addEventListener("change", async function () {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  clearImageError();
  imageUploadStatus.hidden = false;
  imageUploadStatus.textContent = "Uploading image...";
  imagePreview.hidden = false;

  try {
    const resized = await resizeImage(file);
    const token = await auth.currentUser.getIdToken();
    const branch = uploadBranch();

    // Send the full image and its thumbnail in one commit.
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        folder: "assets/uploads/blog/",
        commitMessage: "Upload blog image",
        files: [
          { data: resized.fullBase64, type: "image/webp" },
          { data: resized.thumbBase64, type: "image/webp", thumb: true },
        ],
        branch: branch,
      }),
    });

    if (response.status === 401) {
      showImageError("Your session has expired. Sign in again and retry.");
      imageUploadStatus.hidden = true;
      imagePreview.hidden = true;
      return;
    }

    if (!response.ok) {
      throw new Error("Upload failed with status " + response.status);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Upload failed");
    }

    // The Worker returns the path relative to the repository root, which is
    // how the public pages use it.
    uploadedImageUrl = result.files[0].path;

    // Show a preview of the selected image (the resized thumbnail). Built
    // here rather than shipped empty in the page, because an img with no src
    // is invalid HTML.
    const previousPreview = imagePreview.querySelector("img");
    if (previousPreview) {
      previousPreview.remove();
    }
    const previewImage = document.createElement("img");
    previewImage.src = "data:image/webp;base64," + resized.thumbBase64;
    previewImage.alt = file.name || "Featured image";
    imagePreview.insertBefore(previewImage, imageUploadStatus);
    imageUploadStatus.textContent =
      "Image uploaded. It will appear on the site in about a minute.";
  } catch (error) {
    console.error("Image upload failed:", error);
    showImageError("Failed to upload the image. Try again.");
    imageUploadStatus.hidden = true;
    imagePreview.hidden = true;
  }
});

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  titleError.hidden = true;
  bodyError.hidden = true;
  formError.hidden = true;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function showImageError(message) {
  imageError.textContent = message;
  imageError.hidden = false;
}

function clearImageError() {
  imageError.hidden = true;
  imageError.textContent = "";
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const title = titleInput.value.trim();
  const category = categoryInput.value.trim();
  const body = bodyInput.value.trim();

  let valid = true;

  if (!title) {
    showError(titleError, "Enter a title for the post.");
    valid = false;
  }

  if (!body) {
    showError(bodyError, "Write some content for the post.");
    valid = false;
  }

  if (!valid) {
    return;
  }

  const postData = {
    title: title,
    body: body,
    category: category,
    imageAlt: imageAltInput.value.trim(),
    published: publishedInput.checked,
  };

  if (uploadedImageUrl) {
    postData.imageUrl = uploadedImageUrl;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId) {
      // Keep the original publishedAt when editing.
      const existing = await getDoc(doc(db, "posts", editingId));
      const existingData = existing.exists() ? existing.data() : {};
      postData.publishedAt =
        existingData.publishedAt ||
        (publishedInput.checked ? new Date() : null);
      await setDoc(doc(db, "posts", editingId), postData, { merge: true });
    } else {
      const ref = await addDoc(collection(db, "posts"), {
        ...postData,
        publishedAt: publishedInput.checked ? new Date() : null,
      });
      editingId = ref.id;
    }

    window.location.href = "blog.html";
  } catch (error) {
    console.error("Failed to save post:", error);
    showFormError("Failed to save the post. Try again.");
    saveButton.disabled = false;
    saveButton.textContent = "Save post";
  }
});
