// Shared Firebase connection. Every page that reads or writes data imports from
// here rather than initialising its own. The config below is public by design:
// it identifies the project, it is not a credential. The security rules in the
// Firebase console are what actually protect the data.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCkzGeXR5kcQllimtGZMQMYHPXtGjg4GSg",
  authDomain: "autism-allyship.firebaseapp.com",
  projectId: "autism-allyship",
  storageBucket: "autism-allyship.firebasestorage.app",
  messagingSenderId: "615500105354",
  appId: "1:615500105354:web:92218b69ffa8057ab4cf73",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
