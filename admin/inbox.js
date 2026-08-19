// Admin inbox for contact form submissions. Fetches the collection once and
// filters by category in the browser so a category-plus-createdAt query does
// not need a composite Firestore index. Marking handled is a client write of
// that one field. Unhandled stays the obvious state; there is no reverse.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "../shared.js";

const categoryFilter = document.getElementById("inboxCategoryFilter");
const emptyState = document.getElementById("emptyState");
const filterEmptyState = document.getElementById("filterEmptyState");
const permissionState = document.getElementById("permissionState");
const inboxError = document.getElementById("inboxError");
const list = document.getElementById("inboxList");
const toolbar = document.querySelector(".inbox-toolbar");

const categoryKeys = {
  General: "contactCategoryGeneral",
  volunteer: "contactCategoryVolunteer",
  partnership: "contactCategoryPartnership",
  media: "contactCategoryMedia",
  "resource suggestion": "contactCategoryResourceSuggestion",
  accessibility: "contactCategoryAccessibilityFeedback",
};

let allSubmissions = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadSubmissions();
});

categoryFilter.addEventListener("change", renderList);

async function loadSubmissions() {
  try {
    const snapshot = await getDocs(collection(db, "submissions"));

    allSubmissions = snapshot.docs
      .map(function (docSnapshot) {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          category: data.category || "",
          message: data.message || "",
          handled: data.handled === true,
          createdAt:
            data.createdAt && typeof data.createdAt.toDate === "function"
              ? data.createdAt.toDate()
              : null,
        };
      })
      .sort(function (first, second) {
        const firstTime = first.createdAt ? first.createdAt.getTime() : 0;
        const secondTime = second.createdAt ? second.createdAt.getTime() : 0;
        return secondTime - firstTime;
      });

    renderList();
  } catch (error) {
    // POPIA: never log name, email, phone or message. A code is enough.
    console.error("Failed to load inbox:", error.code || "unknown");
    showLoadFailure(error);
  }
}

function showLoadFailure(error) {
  hideNotices();
  list.textContent = "";
  toolbar.hidden = true;

  if (error.code === "permission-denied") {
    permissionState.hidden = false;
    return;
  }

  inboxError.textContent = translated("adminInboxLoadFailed");
  inboxError.hidden = false;
}

function hideNotices() {
  emptyState.hidden = true;
  filterEmptyState.hidden = true;
  permissionState.hidden = true;
  inboxError.hidden = true;
  inboxError.textContent = "";
}

function visibleSubmissions() {
  const category = categoryFilter.value;
  if (!category) {
    return allSubmissions;
  }
  return allSubmissions.filter(function (item) {
    return item.category === category;
  });
}

function renderList() {
  hideNotices();
  list.textContent = "";
  toolbar.hidden = false;

  if (allSubmissions.length === 0) {
    emptyState.hidden = false;
    return;
  }

  const visible = visibleSubmissions();
  if (visible.length === 0) {
    filterEmptyState.hidden = false;
    return;
  }

  visible.forEach(function (item) {
    list.appendChild(buildRow(item));
  });
}

function buildRow(item) {
  const li = document.createElement("li");
  li.className = "admin-list-item inbox-item";
  if (!item.handled) {
    li.classList.add("inbox-item-unhandled");
  }

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = item.name;

  const emailLine = document.createElement("p");
  emailLine.className = "admin-list-meta";
  emailLine.textContent = item.email;

  info.append(title, emailLine);

  if (item.phone) {
    const phoneLine = document.createElement("p");
    phoneLine.className = "admin-list-meta";
    phoneLine.textContent = item.phone;
    info.appendChild(phoneLine);
  }

  const metaLine = document.createElement("p");
  metaLine.className = "admin-list-meta";
  const categoryText = categoryLabel(item.category);
  const dateText = formatCreatedAt(item.createdAt);
  metaLine.textContent = [categoryText, dateText].filter(Boolean).join(" | ");

  const statusLine = document.createElement("p");
  statusLine.className = "admin-list-meta inbox-status";
  if (item.handled) {
    statusLine.textContent = translated("adminInboxHandled");
  } else {
    statusLine.textContent = translated("adminInboxUnhandled");
    statusLine.classList.add("inbox-status-unhandled");
  }

  const messageLine = document.createElement("p");
  messageLine.className = "inbox-message";
  messageLine.textContent = item.message;

  info.append(metaLine, statusLine, messageLine);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  if (!item.handled) {
    actions.appendChild(buildMarkHandledButton(item));
  }

  li.append(info, actions);
  return li;
}

function categoryLabel(category) {
  const key = categoryKeys[category];
  if (!key) {
    return category;
  }
  return translated(key) || category;
}

function formatCreatedAt(date) {
  if (!date) {
    return "";
  }
  return (
    date.toLocaleDateString("en-ZA") +
    " " +
    date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
  );
}

function buildMarkHandledButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.textContent = translated("adminInboxMarkHandled");
  button.addEventListener("click", async function () {
    button.disabled = true;
    try {
      await updateDoc(doc(db, "submissions", item.id), { handled: true });
      item.handled = true;
      renderList();
    } catch (error) {
      console.error("Failed to mark handled:", error.code || "unknown");
      inboxError.textContent = translated("adminInboxMarkFailed");
      inboxError.hidden = false;
      button.disabled = false;
    }
  });
  return button;
}
