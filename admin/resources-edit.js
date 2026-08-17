// Admin resource create and edit. Reads the id from the URL if present and
// loads that resource, otherwise shows an empty form for a new entry. Saves to
// the resources collection in Firestore. The website field is normalised on
// save: an address without a scheme gets https:// added, and anything that is
// not a plain http or https address is refused in words next to the field.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDoc,
  setDoc,
  addDoc,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const form = document.getElementById("resourceForm");
const nameInput = document.getElementById("name");
const descriptionInput = document.getElementById("description");
const categoryInput = document.getElementById("category");
const provinceBoxes = Array.from(
  document.querySelectorAll("#provinceOptions input[type='checkbox']"),
);
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const websiteInput = document.getElementById("website");
const publishedInput = document.getElementById("published");
const nameError = document.getElementById("nameError");
const descriptionError = document.getElementById("descriptionError");
const websiteError = document.getElementById("websiteError");
const formError = document.getElementById("formError");
const heading = document.getElementById("resourceEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;

editingId = new URLSearchParams(window.location.search).get("id");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (editingId) {
    loadResource(editingId);
  } else {
    heading.textContent = "New resource";
  }
});

async function loadResource(id) {
  try {
    const docSnapshot = await getDoc(doc(db, "resources", id));
    if (!docSnapshot.exists()) {
      window.location.href = "resources.html";
      return;
    }

    const data = docSnapshot.data();
    nameInput.value = data.name || "";
    descriptionInput.value = data.description || "";
    categoryInput.value = data.category || "";
    // Older test entries hold a single province string. Reading them back as a
    // one item list keeps the form working until they are replaced.
    const savedProvinces = Array.isArray(data.provinces)
      ? data.provinces
      : data.province
        ? [data.province]
        : [];
    provinceBoxes.forEach(function (box) {
      box.checked = savedProvinces.includes(box.value);
    });
    phoneInput.value = data.phone || "";
    emailInput.value = data.email || "";
    websiteInput.value = data.website || "";
    publishedInput.checked = data.published === true;
  } catch (error) {
    console.error("Failed to load resource:", error);
    showFormError("Failed to load the resource. Go back and try again.");
  }
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  nameError.hidden = true;
  descriptionError.hidden = true;
  websiteError.hidden = true;
  formError.hidden = true;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function normaliseWebsite(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return "https://" + trimmed;
  }
  return trimmed;
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();

  let valid = true;

  if (!name) {
    showError(nameError, "Enter a name for the resource.");
    valid = false;
  }

  if (!description) {
    showError(descriptionError, "Write a description for the resource.");
    valid = false;
  }

  const website = normaliseWebsite(websiteInput.value);
  if (website) {
    // Chrome's URL parser happily encodes a space instead of rejecting the
    // address, so "not a url" would otherwise save. Whitespace is never
    // valid in a web address; refuse it here.
    if (/\s/.test(website)) {
      showError(websiteError, "That web address does not look right.");
      valid = false;
    } else {
      try {
        const parsed = new URL(website);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("Not a web address.");
        }
      } catch (error) {
        showError(websiteError, "That web address does not look right.");
        valid = false;
      }
    }
  }

  if (!valid) {
    return;
  }

  const resourceData = {
    name: name,
    description: description,
    category: categoryInput.value.trim(),
    provinces: provinceBoxes
      .filter(function (box) {
        return box.checked;
      })
      .map(function (box) {
        return box.value;
      }),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
    website: website,
    published: publishedInput.checked,
  };

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId) {
      await setDoc(doc(db, "resources", editingId), resourceData, {
        merge: true,
      });
    } else {
      await addDoc(collection(db, "resources"), resourceData);
    }
    window.location.href = "resources.html";
  } catch (error) {
    console.error("Failed to save resource:", error);
    showFormError("Failed to save the resource. Try again.");
    saveButton.disabled = false;
    saveButton.textContent = "Save resource";
  }
});
