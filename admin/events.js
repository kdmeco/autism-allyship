// Admin event list. Loads every event from Firestore and shows them in two
// collapsible groups, upcoming and past, split on startsAt against now. No
// orderBy on the query: an orderBy silently drops any document missing that
// field, and sorting the small result set in the browser costs nothing.
// Deleting asks for a second click on an inline confirmation rather than a
// browser dialog.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { WORKER_REMOVE_URL, uploadBranch } from "./upload.js";
import { chevronSvg } from "../shared.js";

const groups = document.getElementById("eventGroups");
const emptyState = document.getElementById("emptyState");

let allEvents = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadEvents();
});

function formatDateTime(date) {
  if (!date) {
    return "No date";
  }
  return (
    date.toLocaleDateString("en-ZA") +
    " " +
    date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatPrice(eventItem) {
  return eventItem.isTicketed ? "R" + eventItem.price : "Free";
}

async function loadEvents() {
  try {
    const snapshot = await getDocs(collection(db, "events"));

    allEvents = snapshot.docs
      .map(function (docSnapshot) {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          title: data.title || "Untitled",
          description: data.description || "",
          // A document missing startsAt sorts to the very start of time
          // rather than crashing the list. The form requires it, so this
          // only matters for data edited by hand.
          startsAt: data.startsAt ? data.startsAt.toDate() : new Date(0),
          isTicketed: data.isTicketed === true,
          price: typeof data.price === "number" ? data.price : 0,
          capacity: typeof data.capacity === "number" ? data.capacity : 0,
          ticketsSold:
            typeof data.ticketsSold === "number" ? data.ticketsSold : 0,
          imageUrl: data.imageUrl || "",
          imageAlt: data.imageAlt || "",
          attachments: Array.isArray(data.attachments)
            ? data.attachments
            : [],
          published: data.published === true,
        };
      })
      .sort(function (first, second) {
        return first.startsAt - second.startsAt;
      });

    renderGroups();
  } catch (error) {
    console.error("Failed to load events:", error);
    emptyState.textContent = "Failed to load events. Try again.";
    emptyState.hidden = false;
  }
}

function renderGroups() {
  groups.textContent = "";

  if (allEvents.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const now = new Date();
  const upcoming = allEvents.filter(function (eventItem) {
    return eventItem.startsAt >= now;
  });
  const past = allEvents
    .filter(function (eventItem) {
      return eventItem.startsAt < now;
    })
    .slice()
    .reverse();

  groups.appendChild(buildGroup("Upcoming", upcoming));
  groups.appendChild(buildGroup("Past", past));
}

function buildGroup(name, events) {
  const group = document.createElement("details");
  group.className = "admin-group";
  if (events.length > 0) {
    group.open = true;
  }

  const summary = document.createElement("summary");

  const title = document.createElement("span");
  title.textContent = name;

  const count = document.createElement("span");
  count.className = "admin-group-count";
  count.textContent = "(" + events.length + ")";

  summary.appendChild(chevronSvg());
  summary.appendChild(title);
  summary.appendChild(count);

  const list = document.createElement("ul");
  list.className = "admin-list";

  if (events.length === 0) {
    const none = document.createElement("li");
    none.className = "admin-list-meta";
    none.textContent = "None yet";
    list.appendChild(none);
  } else {
    events.forEach(function (eventItem) {
      list.appendChild(buildRow(eventItem));
    });
  }

  group.appendChild(summary);
  group.appendChild(list);
  return group;
}

function buildRow(eventItem) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = eventItem.title;

  const metaParts = [formatDateTime(eventItem.startsAt), formatPrice(eventItem)];
  if (!eventItem.published) {
    metaParts.push("Draft");
  }
  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  meta.textContent = metaParts.join(" | ");

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  actions.appendChild(buildAttendeesLink(eventItem));
  actions.appendChild(buildEditLink(eventItem));
  actions.appendChild(buildDeleteButton(actions, eventItem));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildAttendeesLink(eventItem) {
  const attendeesLink = document.createElement("a");
  attendeesLink.className = "button button-secondary";
  attendeesLink.href =
    "event-attendees.html?id=" + encodeURIComponent(eventItem.id);
  attendeesLink.textContent = "Attendees";
  return attendeesLink;
}

function buildEditLink(eventItem) {
  const editLink = document.createElement("a");
  editLink.className = "button button-secondary";
  editLink.href = "events-edit.html?id=" + encodeURIComponent(eventItem.id);
  editLink.textContent = "Edit";
  return editLink;
}

function buildDeleteButton(actions, eventItem) {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", function () {
    askToDelete(actions, eventItem);
  });
  return deleteButton;
}

// The row's buttons give way to a question and two answers. Escape and
// Cancel put the row back the way it was.
function askToDelete(actions, eventItem) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "admin-list-meta";
  // A booked ticket outlives its event, so an admin about to delete one that
  // has bookings needs to know both halves: how many tickets, and that
  // deleting does not cancel them.
  const ticketsSold =
    typeof eventItem.ticketsSold === "number" ? eventItem.ticketsSold : 0;
  question.textContent =
    ticketsSold > 0
      ? "Delete this event? " +
        ticketsSold +
        (ticketsSold === 1 ? " ticket has" : " tickets have") +
        " been booked, and those tickets stay valid after the event is " +
        "deleted. This cannot be undone."
      : "Delete this event? This cannot be undone.";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "button button-danger";
  yes.textContent = "Yes, delete";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Cancel";

  actions.appendChild(question);
  actions.appendChild(yes);
  actions.appendChild(cancel);

  cancel.focus();

  function restore() {
    actions.textContent = "";
    actions.appendChild(buildAttendeesLink(eventItem));
    actions.appendChild(buildEditLink(eventItem));
    actions.appendChild(buildDeleteButton(actions, eventItem));
  }

  function deleteEvent() {
    deleteDoc(doc(db, "events", eventItem.id))
      .then(function () {
        allEvents = allEvents.filter(function (other) {
          return other.id !== eventItem.id;
        });
        renderGroups();
        removeUploadedFiles(eventItem);
      })
      .catch(function (error) {
        console.error("Failed to delete event:", error);
        question.textContent = "Failed to delete. Try again.";
      });
  }

  yes.addEventListener("click", deleteEvent);
  cancel.addEventListener("click", restore);
  actions.addEventListener("keydown", function (domEvent) {
    if (domEvent.key === "Escape") {
      restore();
    }
  });
}

// After an event is deleted, its poster, thumbnail and every attachment are
// removed from the repository through the upload Worker. Best effort only:
// if this fails the event is still gone, and a leftover file is the smaller
// problem.
function removeUploadedFiles(eventItem) {
  const paths = [];

  if (eventItem.imageUrl) {
    const fullPath = eventItem.imageUrl.replace(/^\//, "");
    paths.push(fullPath);
    const dot = fullPath.lastIndexOf(".");
    if (dot !== -1) {
      paths.push(fullPath.slice(0, dot) + "-thumb" + fullPath.slice(dot));
    }
  }

  eventItem.attachments.forEach(function (attachment) {
    if (attachment.url) {
      paths.push(attachment.url.replace(/^\//, ""));
    }
  });

  if (paths.length === 0) {
    return;
  }

  const branch = uploadBranch();

  auth.currentUser
    .getIdToken()
    .then(function (token) {
      return fetch(WORKER_REMOVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ paths: paths, branch: branch }),
      });
    })
    .catch(function (error) {
      console.error("Failed to remove the uploaded files:", error);
    });
}

