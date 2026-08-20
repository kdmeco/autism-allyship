// Admin Instagram posts. Paste a permalink, extract the shortcode, and save
// to instagram_posts/{shortcode}. Order is edited in the browser and written
// back as a number on each document. Public pages read the collection once
// and sort by order themselves.

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const form = document.getElementById("instagramAddForm");
const urlInput = document.getElementById("instagramUrl");
const urlError = document.getElementById("instagramUrlError");
const formError = document.getElementById("instagramFormError");
const addButton = document.getElementById("instagramAddButton");
const emptyState = document.getElementById("emptyState");
const list = document.getElementById("instagramList");

let posts = [];

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadPosts();
});

function extractShortcode(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (error) {
    return null;
  }

  if (
    parsed.hostname !== "www.instagram.com" &&
    parsed.hostname !== "instagram.com"
  ) {
    return null;
  }

  const match = parsed.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?/);
  return match ? match[2] : null;
}

function showUrlError() {
  urlError.hidden = false;
}

function clearErrors() {
  urlError.hidden = true;
  formError.hidden = true;
  formError.textContent = "";
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

async function loadPosts() {
  try {
    const snapshot = await getDocs(collection(db, "instagram_posts"));
    posts = snapshot.docs
      .map(function (docSnapshot) {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          url: data.url || "",
          order: typeof data.order === "number" ? data.order : 0,
        };
      })
      .sort(function (first, second) {
        return first.order - second.order;
      });
    renderList();
  } catch (error) {
    console.error("Failed to load Instagram posts:", error);
    showFormError("Failed to load posts. Try again.");
  }
}

function renderList() {
  list.textContent = "";

  if (posts.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  posts.forEach(function (post, index) {
    list.appendChild(buildItem(post, index));
  });
}

function buildItem(post, index) {
  const item = document.createElement("li");
  item.className = "admin-list-item";

  const main = document.createElement("div");
  main.className = "admin-list-info";

  const link = document.createElement("a");
  link.className = "admin-list-title";
  link.href = post.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = post.url;

  const meta = document.createElement("p");
  meta.className = "admin-list-meta";
  meta.textContent = "Shortcode " + post.id;

  main.appendChild(link);
  main.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "admin-list-actions";

  const moveUp = document.createElement("button");
  moveUp.type = "button";
  moveUp.className = "button button-secondary";
  moveUp.textContent = "Move up";
  moveUp.disabled = index === 0;
  moveUp.addEventListener("click", function () {
    movePost(index, index - 1);
  });

  const moveDown = document.createElement("button");
  moveDown.type = "button";
  moveDown.className = "button button-secondary";
  moveDown.textContent = "Move down";
  moveDown.disabled = index === posts.length - 1;
  moveDown.addEventListener("click", function () {
    movePost(index, index + 1);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", function () {
    confirmRemove(post, actions);
  });

  actions.appendChild(moveUp);
  actions.appendChild(moveDown);
  actions.appendChild(remove);

  item.appendChild(main);
  item.appendChild(actions);
  return item;
}

function confirmRemove(post, actions) {
  actions.textContent = "";

  const question = document.createElement("span");
  question.className = "form-field-note";
  question.textContent = "Remove this post from the home page?";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "button button-danger";
  yes.textContent = "Yes, remove";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Cancel";

  actions.appendChild(question);
  actions.appendChild(yes);
  actions.appendChild(cancel);
  cancel.focus();

  yes.addEventListener("click", async function () {
    try {
      await deleteDoc(doc(db, "instagram_posts", post.id));
      posts = posts.filter(function (other) {
        return other.id !== post.id;
      });
      await writeOrders();
      renderList();
    } catch (error) {
      console.error("Failed to remove Instagram post:", error);
      showFormError("Failed to remove the post. Try again.");
      renderList();
    }
  });

  cancel.addEventListener("click", renderList);
}

async function movePost(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= posts.length) {
    return;
  }
  const moved = posts.splice(fromIndex, 1)[0];
  posts.splice(toIndex, 0, moved);
  renderList();
  try {
    await writeOrders();
  } catch (error) {
    console.error("Failed to reorder Instagram posts:", error);
    showFormError("Failed to save the new order. Try again.");
    loadPosts();
  }
}

async function writeOrders() {
  const batch = writeBatch(db);
  posts.forEach(function (post, index) {
    post.order = index;
    batch.update(doc(db, "instagram_posts", post.id), { order: index });
  });
  await batch.commit();
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const url = urlInput.value.trim();
  const shortcode = extractShortcode(url);
  if (!shortcode) {
    showUrlError();
    return;
  }

  const nextOrder =
    posts.reduce(function (highest, post) {
      return Math.max(highest, post.order);
    }, -1) + 1;

  addButton.disabled = true;
  addButton.textContent = "Saving...";

  try {
    await setDoc(doc(db, "instagram_posts", shortcode), {
      url: url,
      order: nextOrder,
    });
    urlInput.value = "";
    await loadPosts();
  } catch (error) {
    console.error("Failed to save Instagram post:", error);
    showFormError("Failed to save the post. Try again.");
  } finally {
    addButton.disabled = false;
    addButton.textContent = "Add post";
  }
});
