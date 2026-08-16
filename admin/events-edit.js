// Admin event create and edit. Reads the id from the URL if present and loads
// that event, otherwise shows an empty form for a new entry. Saves to the
// events collection in Firestore.
//
// ticketsSold is never part of this form. It is set to 0 once, when the
// event is created, and every edit after that uses setDoc with merge so the
// field is left alone. Section 6 is the only thing allowed to change it,
// inside a Firestore transaction when a ticket is scanned.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDoc,
  setDoc,
  addDoc,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const form = document.getElementById("eventForm");
const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const startsAtInput = document.getElementById("startsAt");
const isTicketedInput = document.getElementById("isTicketed");
const priceInput = document.getElementById("price");
const capacityInput = document.getElementById("capacity");
const publishedInput = document.getElementById("published");
const titleError = document.getElementById("titleError");
const descriptionError = document.getElementById("descriptionError");
const startsAtError = document.getElementById("startsAtError");
const formError = document.getElementById("formError");
const heading = document.getElementById("eventEditHeading");
const saveButton = form.querySelector('button[type="submit"]');

let editingId = null;

editingId = new URLSearchParams(window.location.search).get("id");

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (editingId) {
    loadEvent(editingId);
  } else {
    heading.textContent = "New event";
  }
});

// datetime-local speaks local time and toISOString speaks UTC, so the value
// has to be built by hand or every event shifts by the timezone offset.
function toDateTimeLocal(date) {
  const pad = function (number) {
    return String(number).padStart(2, "0");
  };
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

// new Date("2026-09-12T10:00") parses as local time, which is what we want.
function fromDateTimeLocal(value) {
  return new Date(value);
}

async function loadEvent(id) {
  try {
    const docSnapshot = await getDoc(doc(db, "events", id));
    if (!docSnapshot.exists()) {
      window.location.href = "events.html";
      return;
    }

    const data = docSnapshot.data();
    titleInput.value = data.title || "";
    descriptionInput.value = data.description || "";
    startsAtInput.value = data.startsAt
      ? toDateTimeLocal(data.startsAt.toDate())
      : "";
    isTicketedInput.checked = data.isTicketed === true;
    priceInput.value = typeof data.price === "number" ? data.price : 0;
    capacityInput.value =
      typeof data.capacity === "number" ? data.capacity : 0;
    publishedInput.checked = data.published === true;
  } catch (error) {
    console.error("Failed to load event:", error);
    showFormError("Failed to load the event. Go back and try again.");
  }
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearErrors() {
  titleError.hidden = true;
  descriptionError.hidden = true;
  startsAtError.hidden = true;
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
  const description = descriptionInput.value.trim();
  const startsAtValue = startsAtInput.value;

  let valid = true;

  if (!title) {
    showError(titleError, "Enter a title for the event.");
    valid = false;
  }

  if (!description) {
    showError(descriptionError, "Write a description for the event.");
    valid = false;
  }

  if (!startsAtValue) {
    showError(startsAtError, "Choose a date and time for the event to start.");
    valid = false;
  }

  if (!valid) {
    return;
  }

  const isTicketed = isTicketedInput.checked;
  // Price only means something for a ticketed event. A free event is always
  // R0, no matter what was left in the field.
  const price = isTicketed ? parseFloat(priceInput.value) || 0 : 0;
  const capacity = parseInt(capacityInput.value, 10) || 0;

  const eventData = {
    title: title,
    description: description,
    startsAt: fromDateTimeLocal(startsAtValue),
    isTicketed: isTicketed,
    price: price,
    capacity: capacity,
    published: publishedInput.checked,
  };

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId) {
      await setDoc(doc(db, "events", editingId), eventData, { merge: true });
    } else {
      const ref = await addDoc(collection(db, "events"), {
        ...eventData,
        ticketsSold: 0,
      });
      editingId = ref.id;
    }

    window.location.href = "events.html";
  } catch (error) {
    console.error("Failed to save event:", error);
    showFormError("Failed to save the event. Try again.");
    saveButton.disabled = false;
    saveButton.textContent = "Save event";
  }
});
