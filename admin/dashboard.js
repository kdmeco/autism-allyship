// Admin dashboard guard. If nobody is signed in, send them to the login page.
// Also handles the sign out button.

import { auth } from "../firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const signOutButton = document.getElementById("signOutButton");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
  }
});

if (signOutButton) {
  signOutButton.addEventListener("click", async function () {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (error) {
      // Nothing useful to show here. The user can try again.
    }
  });
}
