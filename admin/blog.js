// Admin blog post list. Loads all posts from Firestore and shows them in two
// collapsible groups, published and draft. Deleting asks for a second click
// on an inline confirmation rather than a browser dialog, which the browser
// can silence and which would then block deleting entirely.

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

const groups = document.getElementById("postGroups");
const emptyState = document.getElementById("emptyState");

let allPosts = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadPosts();
});

async function loadPosts() {
  try {
    const postsQuery = query(
      collection(db, "posts"),
      orderBy("publishedAt", "desc"),
    );
    const snapshot = await getDocs(postsQuery);

    allPosts = snapshot.docs.map(function (docSnapshot) {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title || "Untitled",
        category: data.category || "",
        imageUrl: data.imageUrl || "",
        published: data.published === true,
        publishedAt: data.publishedAt ? data.publishedAt.toDate() : null,
      };
    });

    renderGroups();
  } catch (error) {
    console.error("Failed to load posts:", error);
    emptyState.textContent = "Failed to load posts. Try again.";
    emptyState.hidden = false;
  }
}

function renderGroups() {
  groups.textContent = "";

  if (allPosts.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  const published = allPosts.filter(function (post) {
    return post.published;
  });
  const drafts = allPosts.filter(function (post) {
    return !post.published;
  });

  groups.appendChild(buildGroup("Published", published));
  groups.appendChild(buildGroup("Drafts", drafts));
}

function buildGroup(name, posts) {
  const group = document.createElement("details");
  group.className = "admin-group";
  if (posts.length > 0) {
    group.open = true;
  }

  const summary = document.createElement("summary");

  const title = document.createElement("span");
  title.textContent = name;

  const count = document.createElement("span");
  count.className = "admin-group-count";
  count.textContent = "(" + posts.length + ")";

  summary.appendChild(chevronSvg());
  summary.appendChild(title);
  summary.appendChild(count);

  const list = document.createElement("ul");
  list.className = "admin-list";

  if (posts.length === 0) {
    const none = document.createElement("li");
    none.className = "admin-list-meta";
    none.textContent = "None yet";
    list.appendChild(none);
  } else {
    posts.forEach(function (post) {
      list.appendChild(buildRow(post));
    });
  }

  group.appendChild(summary);
  group.appendChild(list);
  return group;
}

function buildRow(post) {
  const li = document.createElement("li");
  li.className = "admin-list-item";

  const info = document.createElement("div");
  info.className = "admin-list-info";

  const title = document.createElement("h2");
  title.className = "admin-list-title";
  title.textContent = post.title;

  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  const date = post.publishedAt
    ? post.publishedAt.toLocaleDateString("en-ZA")
    : "No date";
  meta.textContent = date + (post.category ? " | " + post.category : "");

  info.appendChild(title);
  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";
  actions.appendChild(buildEditLink(post));
  actions.appendChild(buildDeleteButton(actions, post));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildEditLink(post) {
  const editLink = document.createElement("a");
  editLink.className = "button button-secondary";
  editLink.href = "blog-edit.html?id=" + encodeURIComponent(post.id);
  editLink.textContent = "Edit";
  return editLink;
}

function buildDeleteButton(actions, post) {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", function () {
    askToDelete(actions, post);
  });
  return deleteButton;
}

// The row's buttons give way to a question and two answers. Escape and Cancel
// put the row back the way it was.
function askToDelete(actions, post) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "admin-list-meta";
  question.textContent = "Delete this post? This cannot be undone.";

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
    actions.appendChild(buildEditLink(post));
    actions.appendChild(buildDeleteButton(actions, post));
  }

  function deletePost() {
    deleteDoc(doc(db, "posts", post.id))
      .then(function () {
        allPosts = allPosts.filter(function (other) {
          return other.id !== post.id;
        });
        renderGroups();
        removeUploadedImages(post.imageUrl);
      })
      .catch(function (error) {
        console.error("Failed to delete post:", error);
        question.textContent = "Failed to delete. Try again.";
      });
  }

  yes.addEventListener("click", deletePost);
  cancel.addEventListener("click", restore);
  actions.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      restore();
    }
  });
}

// After a post is deleted, its committed image and thumbnail are removed
// from the repository through the upload Worker. Best effort only: if this
// fails the post is still gone, and a leftover file is the smaller problem.
function removeUploadedImages(imageUrl) {
  if (!imageUrl) {
    return;
  }

  const fullPath = imageUrl.replace(/^\//, "");
  const dot = fullPath.lastIndexOf(".");
  const paths = [fullPath];
  if (dot !== -1) {
    paths.push(fullPath.slice(0, dot) + "-thumb" + fullPath.slice(dot));
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
      console.error("Failed to remove the uploaded image:", error);
    });
}

