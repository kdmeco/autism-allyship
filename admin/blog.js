// Admin blog post list. Loads all posts from Firestore, shows published and
// draft, filters by status, and handles delete. Edit links go to blog-edit.html.

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

const postList = document.getElementById("postList");
const emptyState = document.getElementById("emptyState");
const filterSelect = document.getElementById("postFilter");

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
        published: data.published === true,
        publishedAt: data.publishedAt ? data.publishedAt.toDate() : null,
      };
    });

    renderPosts();
  } catch (error) {
    console.error("Failed to load posts:", error);
    emptyState.textContent = "Failed to load posts. Try again.";
    emptyState.hidden = false;
  }
}

function renderPosts() {
  const filter = filterSelect.value;
  const visiblePosts = allPosts.filter(function (post) {
    if (filter === "published") return post.published;
    if (filter === "draft") return !post.published;
    return true;
  });

  postList.innerHTML = "";

  if (visiblePosts.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  visiblePosts.forEach(function (post) {
    const li = document.createElement("li");
    li.className = "admin-list-item";

    const info = document.createElement("div");
    info.className = "admin-list-info";

    const title = document.createElement("h2");
    title.className = "admin-list-title";
    title.textContent = post.title;

    const meta = document.createElement("p");
    meta.className = "admin-list-meta";
    const status = post.published ? "Published" : "Draft";
    const date = post.publishedAt
      ? post.publishedAt.toLocaleDateString("en-ZA")
      : "No date";
    meta.textContent =
      status + " | " + date + (post.category ? " | " + post.category : "");

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "admin-list-actions";

    const editLink = document.createElement("a");
    editLink.className = "button button-secondary";
    editLink.href = "blog-edit.html?id=" + encodeURIComponent(post.id);
    editLink.textContent = "Edit";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", function () {
      confirmDelete(post);
    });

    actions.appendChild(editLink);
    actions.appendChild(deleteButton);

    li.appendChild(info);
    li.appendChild(actions);
    postList.appendChild(li);
  });
}

async function confirmDelete(post) {
  const confirmed = window.confirm(
    'Delete "' + post.title + '"? This cannot be undone.',
  );
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "posts", post.id));
    allPosts = allPosts.filter(function (p) {
      return p.id !== post.id;
    });
    renderPosts();
  } catch (error) {
    console.error("Failed to delete post:", error);
    window.alert("Failed to delete the post. Try again.");
  }
}

filterSelect.addEventListener("change", renderPosts);
