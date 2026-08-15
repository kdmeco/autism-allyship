// Admin blog post create and edit. Reads the id from the URL if present and
// loads that post, otherwise shows an empty form for a new post. Saves to the
// posts collection in Firestore.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDoc,
  setDoc,
  addDoc,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const form = document.getElementById("blogForm");
const titleInput = document.getElementById("title");
const categoryInput = document.getElementById("category");
const bodyInput = document.getElementById("body");
const publishedInput = document.getElementById("published");
const titleError = document.getElementById("titleError");
const bodyError = document.getElementById("bodyError");
const formError = document.getElementById("formError");
const heading = document.getElementById("blogEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;

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
  } catch (error) {
    console.error("Failed to load post:", error);
    showFormError("Failed to load the post. Go back and try again.");
  }
}

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
    published: publishedInput.checked,
  };

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
