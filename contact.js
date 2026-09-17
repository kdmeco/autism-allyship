// Public contact form. Validates in the browser, then writes one document to
// the submissions collection. The POPIA checkbox is a gate only: SCHEMA.md
// has no consent field, so it is never stored. After a successful write the
// page asks the api Worker to email the foundation. Thank-you means the
// document exists: mail failure must not hide it. The admin inbox is a
// later task.

import { db } from "./firebase.js";
import { API_CONTACT_NOTIFY_URL } from "./api.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "./shared.js";

const contactForm = document.getElementById("contactForm");
const successSection = document.querySelector(".contact-success");
const categorySelect = document.getElementById("contactCategory");
const nameInput = document.getElementById("contactName");
const emailInput = document.getElementById("contactEmail");
const phoneInput = document.getElementById("contactPhone");
const messageField = document.getElementById("contactMessage");
const consentInput = document.getElementById("contactPopiaConsent");
const submitButton = document.getElementById("contactSubmitButton");
const submitError = document.getElementById("contactSubmitError");

const fieldErrors = {
  category: document.getElementById("contactCategoryError"),
  name: document.getElementById("contactNameError"),
  email: document.getElementById("contactEmailError"),
  phone: document.getElementById("contactPhoneError"),
  message: document.getElementById("contactMessageError"),
  consent: document.getElementById("contactPopiaError"),
};

const categoryPlaceholders = {
  volunteer: "contactPlaceholderVolunteer",
  partnership: "contactPlaceholderPartnership",
  media: "contactPlaceholderMedia",
  "resource suggestion": "contactPlaceholderResourceSuggestion",
  accessibility: "contactPlaceholderAccessibilityFeedback",
  "speaking engagement": "contactPlaceholderSpeakingEngagement",
};

function updateMessagePlaceholder() {
  const key =
    categoryPlaceholders[categorySelect.value] || "contactPlaceholderGeneral";
  const text = translated(key);
  if (text) {
    messageField.placeholder = text;
  }
}

function clearErrors() {
  Object.keys(fieldErrors).forEach(function (key) {
    fieldErrors[key].hidden = true;
  });
  submitError.hidden = true;
}

function showError(element) {
  element.hidden = false;
}

function showSubmitFailure() {
  submitError.textContent = translated("contactSubmitError");
  submitError.hidden = false;
  submitButton.disabled = false;
}

function validateForm() {
  let valid = true;

  if (!categorySelect.value) {
    showError(fieldErrors.category);
    valid = false;
  }

  if (!nameInput.value.trim()) {
    showError(fieldErrors.name);
    valid = false;
  }

  if (
    !emailInput.value.trim() ||
    !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(emailInput.value.trim())
  ) {
    showError(fieldErrors.email);
    valid = false;
  }

  if (phoneInput.value.trim() && !/^[0-9 +()-]+$/.test(phoneInput.value.trim())) {
    showError(fieldErrors.phone);
    valid = false;
  }

  if (!messageField.value.trim()) {
    showError(fieldErrors.message);
    valid = false;
  }

  if (!consentInput.checked) {
    showError(fieldErrors.consent);
    valid = false;
  }

  return valid;
}

updateMessagePlaceholder();
categorySelect.addEventListener("change", updateMessagePlaceholder);

contactForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  if (!validateForm()) {
    return;
  }

  // Firestore queues writes when the tab is offline and never rejects, which
  // left the button disabled and hid the connection error. Refuse before we
  // call addDoc, so nothing is queued.
  if (navigator.onLine === false) {
    showSubmitFailure();
    return;
  }

  submitButton.disabled = true;

  try {
    const submission = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      category: categorySelect.value,
      message: messageField.value.trim(),
    };

    await addDoc(collection(db, "submissions"), {
      ...submission,
      handled: false,
      createdAt: serverTimestamp(),
    });

    try {
      const response = await fetch(API_CONTACT_NOTIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!response.ok) {
        console.error("Contact notify failed:", response.status);
      }
    } catch (notifyError) {
      console.error("Contact notify failed:", notifyError.code || notifyError.name || "unknown");
    }

    contactForm.hidden = true;
    successSection.hidden = false;
  } catch (error) {
    // Log a code, never the form values. POPIA: no personal information in
    // the console, even while debugging.
    console.error("Contact submit failed:", error.code || "unknown");
    showSubmitFailure();
  }
});
