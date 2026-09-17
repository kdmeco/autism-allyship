// Admin media list. Loads every interview and appearance from Firestore and
// shows them in two collapsible groups, published and not published. Sorted
// in the browser the same way the public gallery sorts, so the list reads the
// way the page will. Deleting asks for a second click on an inline
// confirmation rather than a browser dialog.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { chevronSvg } from "../shared.js";

const groups = document.getElementById("mediaGroups");
const emptyState = document.getElementById("emptyState");

let allMedia = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadMedia();
});

// Dated entries newest first, then undated entries. String comparison works
// because every date is YYYY-MM-DD: the same characters in the same order
// sort the way the calendar does, and no composite index is needed.
function sortMedia(entries) {
  return entries.slice().sort(function (first, second) {
    if (first.date && second.date) {
      if (first.date !== second.date) {
        return first.date < second.date ? 1 : -1;
      }
      return 0;
    }
    if (first.date) {
      return -1;
    }
    if (second.date) {
      return 1;
    }
    return 0;
  });
}

async function loadMedia() {
  try {
    const snapshot = await getDocs(collection(db, "media"));

    allMedia = sortMedia(
      snapshot.docs.map(function (docSnapshot) {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          outlet: data.outlet || "Untitled",
          type: data.type || "",
          date: typeof data.date === "string" ? data.date : "",
          published: data.published === true,
        };
      }),
    );

    renderGroups();
  } catch (error) {
    console.error("Failed to load media:", error);
    emptyState.textContent = "Failed to load media. Try again.";
    emptyState.hidden = false;
  }
}

function renderGroups() {
  groups.textContent = "";

  if (allMedia.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  const published = allMedia.filter(function (entry) {
    return entry.published;
  });
  const notPublished = allMedia.filter(function (entry) {
    return !entry.published;
  });

  groups.appendChild(buildGroup("Published", published));
  groups.appendChild(buildGroup("Not published", notPublished));
}

function buildGroup(name, entries) {
  const group = document.createElement("details");
  group.className = "admin-group";
  if (entries.length > 0) {
    group.open = true;
  }

  const summary = document.createElement("summary");

  const title = document.createElement("span");
  title.textContent = name;

  const count = document.createElement("span");
  count.className = "admin-group-count";
  count.textContent = "(" + entries.length + ")";

  summary.appendChild(chevronSvg());
  summary.appendChild(title);
  summary.appendChild(count);

  const list = document.createElement("ul");
  list.className = "admin-list";

  if (entries.length === 0) {
    const none = document.createElement("li");
    none.className = "admin-list-meta";
    none.textContent = "None yet";
    list.appendChild(none);
  } else {
    entries.forEach(function (entry) {
      list.appendChild(buildRow(entry));
    });
  }

  group.appendChild(summary);
  group.appendChild(list);
  return group;
}

function buildRow(entry) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = entry.outlet;

  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  meta.textContent = [entry.date || "Undated", entry.type]
    .filter(Boolean)
    .join(" | ");

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  actions.appendChild(buildEditLink(entry));
  actions.appendChild(buildDeleteButton(actions, entry));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildEditLink(entry) {
  const editLink = document.createElement("a");
  editLink.className = "button button-secondary";
  editLink.href = "media-edit.html?id=" + encodeURIComponent(entry.id);
  editLink.textContent = "Edit";
  return editLink;
}

function buildDeleteButton(actions, entry) {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", function () {
    askToDelete(actions, entry);
  });
  return deleteButton;
}

// The row's buttons give way to a question and two answers. Escape and Cancel
// put the row back the way it was.
function askToDelete(actions, entry) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "admin-list-meta";
  question.textContent = "Delete this media entry? This cannot be undone.";

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
    actions.appendChild(buildEditLink(entry));
    actions.appendChild(buildDeleteButton(actions, entry));
  }

  function deleteEntry() {
    deleteDoc(doc(db, "media", entry.id))
      .then(function () {
        allMedia = allMedia.filter(function (other) {
          return other.id !== entry.id;
        });
        renderGroups();
      })
      .catch(function (error) {
        console.error("Failed to delete media entry:", error);
        question.textContent = "Failed to delete. Try again.";
      });
  }

  yes.addEventListener("click", deleteEntry);
  cancel.addEventListener("click", restore);
  actions.addEventListener("keydown", function (domEvent) {
    if (domEvent.key === "Escape") {
      restore();
    }
  });
}
