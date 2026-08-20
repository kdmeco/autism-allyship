// Admin attendee list for one event. Reads the event id from the URL and
// lists every ticket booked against it. The list itself is a plain
// Firestore query: the security rules already allow an admin to list
// tickets (`allow list: if isAdmin()`), so this needs no Worker round trip.
//
// Every action below the list is different: resending an email, correcting
// an address, and marking a ticket used are none of them things the
// tickets collection's own update rule permits from here. That rule only
// ever allows one thing, a staff member flipping their own scan from
// unredeemed to redeemed, so all three actions go through the
// autism-allyship-api Worker instead, authenticated with the signed in
// admin's Firebase ID token, and performed there with the service account's
// privileges.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { translated } from "../shared.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  API_RESEND_URL,
  API_EDIT_EMAIL_URL,
  API_MARK_USED_URL,
} from "../api.js";

const eventTitleSlot = document.getElementById("attendeesEventTitle");
const missingEventState = document.getElementById("missingEventState");
const emptyState = document.getElementById("emptyState");
const errorSlot = document.getElementById("attendeesError");
const list = document.getElementById("attendeesList");
const exportCsvButton = document.getElementById("exportCsvButton");
const filters = document.getElementById("attendeeFilters");
const searchInput = document.getElementById("attendeeSearch");
const statusFilter = document.getElementById("attendeeStatusFilter");
const loadingState = document.getElementById("attendeesLoading");

const eventId = new URLSearchParams(window.location.search).get("id");

let attendees = [];

searchInput.addEventListener("input", renderList);
statusFilter.addEventListener("change", renderList);

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!eventId) {
    missingEventState.hidden = false;
    loadingState.hidden = true;
    exportCsvButton.hidden = true;
    return;
  }
  loadAttendees();
});

function showError(message) {
  errorSlot.textContent = message;
  errorSlot.hidden = false;
}

function clearError() {
  errorSlot.hidden = true;
  errorSlot.textContent = "";
}

async function loadAttendees() {
  loadingState.hidden = false;
  filters.hidden = true;
  list.hidden = true;
  clearError();
  try {
    const eventSnapshot = await getDoc(doc(db, "events", eventId));
    if (eventSnapshot.exists()) {
      const title = eventSnapshot.data().title || "Untitled";
      eventTitleSlot.textContent = "Everyone registered for " + title + ".";
    }

    const ticketsQuery = query(
      collection(db, "tickets"),
      where("eventId", "==", eventId),
    );
    const snapshot = await getDocs(ticketsQuery);

    attendees = snapshot.docs.map(function (docSnapshot) {
      const data = docSnapshot.data();
      return {
        token: docSnapshot.id,
        attendeeName: data.attendeeName || "",
        attendeeEmail: data.attendeeEmail || "",
        quantity: typeof data.quantity === "number" ? data.quantity : 1,
        redeemed: data.redeemed === true,
        redeemedAt: data.redeemedAt ? data.redeemedAt.toDate() : null,
      };
    });

    renderList();
  } catch (error) {
    console.error("Failed to load attendees:", error);
    showError("Could not load attendees. Try again.");
  } finally {
    loadingState.hidden = true;
    list.hidden = false;
  }
}

function formatRedeemedAt(date) {
  if (!date) {
    return "";
  }
  return (
    date.toLocaleDateString("en-ZA") +
    " " +
    date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
  );
}

function renderList() {
  list.textContent = "";

  const searchTerm = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const visibleAttendees = attendees.filter(function (attendee) {
    const matchesSearch =
      !searchTerm ||
      attendee.attendeeName.toLowerCase().includes(searchTerm) ||
      attendee.attendeeEmail.toLowerCase().includes(searchTerm);
    const matchesStatus =
      status === "all" ||
      (status === "used" && attendee.redeemed) ||
      (status === "unused" && !attendee.redeemed);
    return matchesSearch && matchesStatus;
  });

  if (attendees.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = translated("adminAttendeesEmpty");
    exportCsvButton.hidden = true;
    filters.hidden = true;
    return;
  }
  filters.hidden = false;
  exportCsvButton.hidden = false;

  if (visibleAttendees.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = translated("adminAttendeesNoMatches");
    return;
  }

  emptyState.hidden = true;

  visibleAttendees.forEach(function (attendee) {
    list.appendChild(buildRow(attendee));
  });
}

function buildRow(attendee) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent =
    attendee.attendeeName +
    (attendee.quantity > 1 ? " (" + attendee.quantity + " people)" : "");

  const emailLine = document.createElement("p");
  emailLine.className = "admin-list-meta";
  emailLine.textContent = attendee.attendeeEmail;

  const statusLine = document.createElement("p");
  statusLine.className = "admin-list-meta";
  statusLine.textContent = attendee.redeemed
    ? "Used" + (attendee.redeemedAt ? " " + formatRedeemedAt(attendee.redeemedAt) : "")
    : "Not used yet";
  if (attendee.redeemed) {
    statusLine.classList.add("attendee-status-used");
  }

  info.append(title, emailLine, statusLine);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  renderActions(actions, attendee);

  li.append(info, actions);
  return li;
}

function renderActions(actions, attendee) {
  actions.textContent = "";
  actions.appendChild(buildViewTicketButton(attendee));
  actions.appendChild(buildResendButton(attendee));
  actions.appendChild(buildEditEmailButton(actions, attendee));
  if (!attendee.redeemed) {
    actions.appendChild(buildMarkUsedButton(actions, attendee));
  }
}

function buildViewTicketButton(attendee) {
  const link = document.createElement("a");
  link.className = "button button-secondary";
  link.href = "../ticket.html?token=" + encodeURIComponent(attendee.token);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = translated("adminAttendeesViewTicket");
  return link;
}

function buildResendButton(attendee) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.textContent = "Resend email";
  button.addEventListener("click", async function () {
    clearError();
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      const result = await callAdminEndpoint(API_RESEND_URL, {
        token: attendee.token,
      });
      button.textContent = result.emailSent ? "Sent" : "Could not send";
    } catch (error) {
      showError(error.message);
      button.textContent = "Resend email";
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function buildEditEmailButton(actions, attendee) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.textContent = "Edit email";
  button.addEventListener("click", function () {
    showEditEmailForm(actions, attendee);
  });
  return button;
}

// Swaps the row's actions for an inline input and two buttons, the same
// shape the events list uses for its inline delete confirmation. Escape
// and Cancel put the row back the way it was.
function showEditEmailForm(actions, attendee) {
  actions.textContent = "";

  const input = document.createElement("input");
  input.type = "email";
  input.className = "attendee-edit-email-input";
  input.value = attendee.attendeeEmail;
  input.setAttribute("aria-label", "New email address");

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      renderActions(actions, attendee);
    }
  });

  const save = document.createElement("button");
  save.type = "button";
  save.className = "button button-primary";
  save.textContent = "Save and resend";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", function () {
    renderActions(actions, attendee);
  });

  save.addEventListener("click", async function () {
    clearError();
    const newEmail = input.value.trim();
    if (!newEmail) {
      return;
    }
    save.disabled = true;
    save.textContent = "Saving...";
    try {
      const result = await callAdminEndpoint(API_EDIT_EMAIL_URL, {
        token: attendee.token,
        newEmail: newEmail,
      });
      attendee.attendeeEmail = newEmail;
      renderList();
      if (!result.emailSent) {
        showError(
          "The email address was updated, but the confirmation email could not be sent.",
        );
      }
    } catch (error) {
      showError(error.message);
      save.disabled = false;
      save.textContent = "Save and resend";
    }
  });

  actions.append(input, save, cancel);
  input.focus();
}

function buildMarkUsedButton(actions, attendee) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.textContent = "Mark used";
  button.addEventListener("click", async function () {
    clearError();
    button.disabled = true;
    button.textContent = "Marking...";
    try {
      await callAdminEndpoint(API_MARK_USED_URL, { token: attendee.token });
      attendee.redeemed = true;
      attendee.redeemedAt = new Date();
      renderList();
    } catch (error) {
      showError(error.message);
      button.disabled = false;
      button.textContent = "Mark used";
    }
  });
  return button;
}

async function callAdminEndpoint(url, body) {
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + idToken,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    throw new Error("Your session has expired. Sign in again and retry.");
  }

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "That did not work. Try again.");
  }
  return result;
}

// One row per booking, not one row per person: a booking of four is one
// line with quantity 4, matching how the ticket itself works.
function buildCsv() {
  const header = ["Name", "Email", "Quantity", "Used", "Used at"];
  const rows = attendees.map(function (attendee) {
    return [
      attendee.attendeeName,
      attendee.attendeeEmail,
      String(attendee.quantity),
      attendee.redeemed ? "Yes" : "No",
      attendee.redeemedAt ? formatRedeemedAt(attendee.redeemedAt) : "",
    ];
  });
  return [header, ...rows]
    .map(function (row) {
      return row
        .map(function (cell) {
          // Quoting every field, always, is simpler and just as correct as
          // quoting only the ones that need it, and it avoids a name or
          // email with a stray comma quietly shifting every column after it.
          return '"' + String(cell).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
}

exportCsvButton.addEventListener("click", function () {
  const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "attendees-" + eventId + ".csv";
  link.click();
  URL.revokeObjectURL(url);
});
