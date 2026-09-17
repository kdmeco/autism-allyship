// Admin media create and edit. Reads the id from the URL if present and
// loads that entry, otherwise shows an empty form for a new one. Saves to
// the media collection in Firestore. The web address is not normalised: the
// public list links straight out to the recording or article, so only a
// full https address is accepted.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDoc,
  setDoc,
  addDoc,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const form = document.getElementById("mediaForm");
const outletInput = document.getElementById("outlet");
const typeInput = document.getElementById("type");
const dateInput = document.getElementById("date");
const panelInput = document.getElementById("panel");
const topicInput = document.getElementById("topic");
const urlInput = document.getElementById("url");
const publishedInput = document.getElementById("published");
const outletError = document.getElementById("outletError");
const typeError = document.getElementById("typeError");
const urlError = document.getElementById("urlError");
const formError = document.getElementById("formError");
const heading = document.getElementById("mediaEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;

editingId = new URLSearchParams(window.location.search).get("id");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (editingId) {
    loadMediaEntry(editingId);
  } else {
    heading.textContent = "New media entry";
  }
});

async function loadMediaEntry(id) {
  try {
    const docSnapshot = await getDoc(doc(db, "media", id));
    if (!docSnapshot.exists()) {
      window.location.href = "media.html";
      return;
    }

    const data = docSnapshot.data();
    outletInput.value = data.outlet || "";
    typeInput.value = data.type || "";
    dateInput.value = typeof data.date === "string" ? data.date : "";
    panelInput.value = data.panel || "";
    topicInput.value = data.topic || "";
    urlInput.value = data.url || "";
    publishedInput.checked = data.published === true;
  } catch (error) {
    console.error("Failed to load media entry:", error);
    showFormError("Failed to load the media entry. Go back and try again.");
  }
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  outletError.hidden = true;
  typeError.hidden = true;
  urlError.hidden = true;
  formError.hidden = true;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const outlet = outletInput.value.trim();
  const type = typeInput.value;
  const url = urlInput.value.trim();

  let valid = true;

  if (!outlet) {
    showError(outletError, "Enter an outlet for the media entry.");
    valid = false;
  }

  if (!type) {
    showError(typeError, "Choose a type for the media entry.");
    valid = false;
  }

  // Not normalised the way the resource form normalises its website field:
  // the public list links straight out, so a plain http address or anything
  // without a scheme is refused in words rather than guessed at.
  if (url && !url.startsWith("https://")) {
    showError(urlError, "That web address must start with https://.");
    valid = false;
  }

  if (!valid) {
    return;
  }

  // An input type date field yields YYYY-MM-DD or nothing, which is exactly
  // what the schema stores, so it is saved untouched.
  const mediaData = {
    outlet: outlet,
    type: type,
    date: dateInput.value,
    panel: panelInput.value.trim(),
    topic: topicInput.value.trim(),
    url: url,
    published: publishedInput.checked,
  };

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId) {
      await setDoc(doc(db, "media", editingId), mediaData, {
        merge: true,
      });
    } else {
      await addDoc(collection(db, "media"), mediaData);
    }
    window.location.href = "media.html";
  } catch (error) {
    console.error("Failed to save media entry:", error);
    showFormError("Failed to save the media entry. Try again.");
    saveButton.disabled = false;
    saveButton.textContent = "Save media entry";
  }
});
