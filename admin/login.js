// Admin sign in. Uses Firebase Auth with email and password. On success the
// user is sent to the dashboard. Errors are shown next to the fields in words,
// not just with a red border.

import { auth } from "../firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const formError = document.getElementById("formError");
const submitButton = document.getElementById("submitButton");

// If someone is already signed in, skip the form and go straight to the
// dashboard. This also covers the case where they land here by accident.
onAuthStateChanged(auth, function (user) {
  if (user) {
    window.location.href = "index.html";
  }
});

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  emailError.hidden = true;
  passwordError.hidden = true;
  formError.hidden = true;
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let valid = true;

  if (!email) {
    showError(emailError, "Enter your email address.");
    valid = false;
  }

  if (!password) {
    showError(passwordError, "Enter your password.");
    valid = false;
  }

  if (!valid) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged above handles the redirect.
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";

    if (error.code === "auth/invalid-credential") {
      showError(
        formError,
        "Sign in failed. Check your email and password and try again.",
      );
    } else if (error.code === "auth/too-many-requests") {
      showError(
        formError,
        "Too many failed attempts. Wait a moment and try again.",
      );
    } else {
      showError(formError, "Sign in failed. Try again in a moment.");
    }
  }
});
