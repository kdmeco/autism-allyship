// Admin gallery album list. Loads every album from Firestore and groups them
// by year, newest first, since galleries have no published or draft state to
// group by the way blog posts do. Deleting asks for a second click on an
// inline confirmation rather than a browser dialog, which the browser can
// silence and which would then block deleting entirely.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { WORKER_REMOVE_URL, uploadBranch } from "./upload.js";
import { chevronSvg } from "../shared.js";

const groups = document.getElementById("albumGroups");
const emptyState = document.getElementById("emptyState");

let allAlbums = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadAlbums();
});

async function loadAlbums() {
  try {
    const albumsQuery = query(
      collection(db, "galleries"),
      orderBy("year", "desc"),
    );
    const snapshot = await getDocs(albumsQuery);

    allAlbums = snapshot.docs.map(function (docSnapshot) {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title || "Untitled",
        eventName: data.eventName || "",
        year: typeof data.year === "number" ? data.year : 0,
        coverImageUrl: data.coverImageUrl || "",
        images: Array.isArray(data.images) ? data.images : [],
      };
    });

    renderGroups();
  } catch (error) {
    console.error("Failed to load albums:", error);
    emptyState.textContent = "Failed to load albums. Try again.";
    emptyState.hidden = false;
  }
}

function renderGroups() {
  groups.textContent = "";

  if (allAlbums.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  const albumsByYear = new Map();
  allAlbums.forEach(function (album) {
    if (!albumsByYear.has(album.year)) {
      albumsByYear.set(album.year, []);
    }
    albumsByYear.get(album.year).push(album);
  });

  [...albumsByYear.keys()]
    .sort(function (first, second) {
      return second - first;
    })
    .forEach(function (year) {
      groups.appendChild(buildGroup(year, albumsByYear.get(year)));
    });
}

function buildGroup(year, albums) {
  const group = document.createElement("details");
  group.className = "admin-group";
  group.open = true;

  const summary = document.createElement("summary");

  const title = document.createElement("span");
  title.textContent = year || "No year";

  const count = document.createElement("span");
  count.className = "admin-group-count";
  count.textContent = "(" + albums.length + ")";

  summary.appendChild(chevronSvg());
  summary.appendChild(title);
  summary.appendChild(count);

  const list = document.createElement("ul");
  list.className = "admin-list";

  albums.forEach(function (album) {
    list.appendChild(buildRow(album));
  });

  group.appendChild(summary);
  group.appendChild(list);
  return group;
}

function photoCountText(count) {
  return count === 1 ? "1 photo" : count + " photos";
}

function buildRow(album) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = album.title;

  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  meta.textContent =
    (album.eventName ? album.eventName + " | " : "") +
    photoCountText(album.images.length);

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  actions.appendChild(buildEditLink(album));
  actions.appendChild(buildDeleteButton(actions, album));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildEditLink(album) {
  const editLink = document.createElement("a");
  editLink.className = "button button-secondary";
  editLink.href = "gallery-edit.html?id=" + encodeURIComponent(album.id);
  editLink.textContent = "Edit";
  return editLink;
}

function buildDeleteButton(actions, album) {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", function () {
    askToDelete(actions, album);
  });
  return deleteButton;
}

// The row's buttons give way to a question and two answers. Escape and Cancel
// put the row back the way it was.
function askToDelete(actions, album) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "admin-list-meta";
  question.textContent = "Delete this album? This cannot be undone.";

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
    actions.appendChild(buildEditLink(album));
    actions.appendChild(buildDeleteButton(actions, album));
  }

  function deleteAlbum() {
    deleteDoc(doc(db, "galleries", album.id))
      .then(function () {
        allAlbums = allAlbums.filter(function (other) {
          return other.id !== album.id;
        });
        renderGroups();
        removeUploadedFiles(album);
      })
      .catch(function (error) {
        console.error("Failed to delete album:", error);
        question.textContent = "Failed to delete. Try again.";
      });
  }

  yes.addEventListener("click", deleteAlbum);
  cancel.addEventListener("click", restore);
  actions.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      restore();
    }
  });
}

// After an album is deleted, its cover image and every photo it held are
// removed from the repository through the upload Worker, best effort only:
// if this fails the album is still gone, and leftover files are the smaller
// problem.
function removeUploadedFiles(album) {
  const paths = [];

  if (album.coverImageUrl) {
    const fullPath = album.coverImageUrl.replace(/^\//, "");
    paths.push(fullPath);
    const dot = fullPath.lastIndexOf(".");
    if (dot !== -1) {
      paths.push(fullPath.slice(0, dot) + "-thumb" + fullPath.slice(dot));
    }
  }

  album.images.forEach(function (image) {
    if (image.url) {
      paths.push(image.url.replace(/^\//, ""));
    }
    if (image.thumbUrl) {
      paths.push(image.thumbUrl.replace(/^\//, ""));
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
