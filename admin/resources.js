// Admin resource list. Loads every resource from Firestore and shows them in
// two collapsible groups, published and not published. There is no timestamp
// field on resources, so the list is sorted by name in the browser instead of
// by a Firestore order. Deleting asks for a second click on an inline
// confirmation rather than a browser dialog.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const groups = document.getElementById("resourceGroups");
const emptyState = document.getElementById("emptyState");

let allResources = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadResources();
});

async function loadResources() {
  try {
    const snapshot = await getDocs(collection(db, "resources"));

    allResources = snapshot.docs
      .map(function (docSnapshot) {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          name: data.name || "Untitled",
          category: data.category || "",
          province: data.province || "",
          published: data.published === true,
        };
      })
      .sort(function (first, second) {
        return first.name.localeCompare(second.name);
      });

    renderGroups();
  } catch (error) {
    console.error("Failed to load resources:", error);
    emptyState.textContent = "Failed to load resources. Try again.";
    emptyState.hidden = false;
  }
}

function renderGroups() {
  groups.textContent = "";

  if (allResources.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  const published = allResources.filter(function (resource) {
    return resource.published;
  });
  const notPublished = allResources.filter(function (resource) {
    return !resource.published;
  });

  groups.appendChild(buildGroup("Published", published));
  groups.appendChild(buildGroup("Not published", notPublished));
}

function buildGroup(name, resources) {
  const group = document.createElement("details");
  group.className = "admin-group";
  if (resources.length > 0) {
    group.open = true;
  }

  const summary = document.createElement("summary");

  const title = document.createElement("span");
  title.textContent = name;

  const count = document.createElement("span");
  count.className = "admin-group-count";
  count.textContent = "(" + resources.length + ")";

  summary.appendChild(chevronSvg());
  summary.appendChild(title);
  summary.appendChild(count);

  const list = document.createElement("ul");
  list.className = "admin-list";

  if (resources.length === 0) {
    const none = document.createElement("li");
    none.className = "admin-list-meta";
    none.textContent = "None yet";
    list.appendChild(none);
  } else {
    resources.forEach(function (resource) {
      list.appendChild(buildRow(resource));
    });
  }

  group.appendChild(summary);
  group.appendChild(list);
  return group;
}

function buildRow(resource) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = resource.name;

  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  meta.textContent = [resource.category, resource.province]
    .filter(Boolean)
    .join(" | ");

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  actions.appendChild(buildEditLink(resource));
  actions.appendChild(buildDeleteButton(actions, resource));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildEditLink(resource) {
  const editLink = document.createElement("a");
  editLink.className = "button button-secondary";
  editLink.href = "resources-edit.html?id=" + encodeURIComponent(resource.id);
  editLink.textContent = "Edit";
  return editLink;
}

function buildDeleteButton(actions, resource) {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", function () {
    askToDelete(actions, resource);
  });
  return deleteButton;
}

// The row's buttons give way to a question and two answers. Escape and Cancel
// put the row back the way it was.
function askToDelete(actions, resource) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "admin-list-meta";
  question.textContent = "Delete this resource? This cannot be undone.";

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
    actions.appendChild(buildEditLink(resource));
    actions.appendChild(buildDeleteButton(actions, resource));
  }

  function deleteResource() {
    deleteDoc(doc(db, "resources", resource.id))
      .then(function () {
        allResources = allResources.filter(function (other) {
          return other.id !== resource.id;
        });
        renderGroups();
      })
      .catch(function (error) {
        console.error("Failed to delete resource:", error);
        question.textContent = "Failed to delete. Try again.";
      });
  }

  yes.addEventListener("click", deleteResource);
  cancel.addEventListener("click", restore);
  actions.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      restore();
    }
  });
}

function chevronSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "chevron");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 6l5 5 5-5");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}
