// Public blog index. Reads published posts from Firestore, newest first, with
// category filter pills and numbered pagination. The category and the page
// number both live in the URL, so a filtered page can be shared, bookmarked
// and refreshed.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const PAGE_SIZE = 9;

const grid = document.getElementById("blogGrid");
const pillBar = document.getElementById("categoryPills");
const pagination = document.getElementById("blogPagination");
const emptyState = document.getElementById("blogEmpty");

const urlParams = new URLSearchParams(window.location.search);
const activeCategory = urlParams.get("category") || "";
const requestedPage = parseInt(urlParams.get("page"), 10) || 1;

// Strings built in JavaScript miss applyLanguage, so they are looked up here
// for the language already resolved by main.js.
function translated(key) {
  const language = document.documentElement.getAttribute("lang") || "en";
  const dictionary = translations[language] || translations.en;
  return dictionary[key] || translations.en[key];
}

function pageLink(pageNumber, category) {
  const params = new URLSearchParams();
  params.set("page", String(pageNumber));
  if (category) {
    params.set("category", category);
  }
  return "blog.html?" + params.toString();
}

// The stored path points at the full image. The 400px thumbnail sits beside it
// with a -thumb suffix before the file extension.
function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
}

function excerpt(body) {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) {
    return flat;
  }
  return flat.slice(0, 157).trimEnd() + "...";
}

function buildCard(post) {
  const card = document.createElement("article");
  card.className = "card";

  if (post.imageUrl) {
    const image = document.createElement("img");
    image.className = "card-image";
    image.src = thumbPath(post.imageUrl);
    image.alt = post.imageAlt || "";
    image.width = 400;
    image.height = 267;
    card.appendChild(image);
  }

  const heading = document.createElement("h3");
  const headingLink = document.createElement("a");
  headingLink.href = "blog-post.html?id=" + encodeURIComponent(post.id);
  headingLink.textContent = post.title;
  heading.appendChild(headingLink);
  card.appendChild(heading);

  if (post.category) {
    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = post.category;
    card.appendChild(meta);
  }

  const summary = document.createElement("p");
  summary.textContent = excerpt(post.body);
  card.appendChild(summary);

  const dateLine = document.createElement("p");
  dateLine.className = "card-date";
  if (post.publishedAt) {
    dateLine.textContent = post.publishedAt.toLocaleDateString("en-ZA");
  }
  card.appendChild(dateLine);

  return card;
}

// The categories are whatever admins have typed on posts, so they are read
// straight from the published posts rather than kept in a second list.
async function loadCategories() {
  const snapshot = await getDocs(
    query(collection(db, "posts"), where("published", "==", true)),
  );

  const categories = [
    ...new Set(
      snapshot.docs
        .map(function (docSnapshot) {
          return (docSnapshot.data().category || "").trim();
        })
        .filter(Boolean),
    ),
  ].sort(function (first, second) {
    return first.localeCompare(second);
  });

  if (categories.length === 0) {
    return;
  }

  const all = document.createElement("a");
  all.className = "filter-pill";
  all.href = activeCategory ? "blog.html" : pageLink(1, "");
  all.textContent = translated("blogFilterAll");
  if (!activeCategory) {
    all.setAttribute("aria-current", "page");
  }
  pillBar.appendChild(all);

  categories.forEach(function (category) {
    const pill = document.createElement("a");
    pill.className = "filter-pill";
    pill.href = pageLink(1, category);
    pill.textContent = category;
    if (category === activeCategory) {
      pill.setAttribute("aria-current", "page");
    }
    pillBar.appendChild(pill);
  });

  pillBar.hidden = false;
}

function buildPagination(pageNumber, pageCount) {
  if (pageCount <= 1) {
    return;
  }

  if (pageNumber > 1) {
    const previous = document.createElement("a");
    previous.href = pageLink(pageNumber - 1, activeCategory);
    previous.textContent = translated("blogPreviousPage");
    pagination.appendChild(previous);
  }

  for (let number = 1; number <= pageCount; number++) {
    if (number === pageNumber) {
      const current = document.createElement("span");
      current.setAttribute("aria-current", "page");
      current.textContent = String(number);
      pagination.appendChild(current);
    } else {
      const link = document.createElement("a");
      link.href = pageLink(number, activeCategory);
      link.textContent = String(number);
      pagination.appendChild(link);
    }
  }

  if (pageNumber < pageCount) {
    const next = document.createElement("a");
    next.href = pageLink(pageNumber + 1, activeCategory);
    next.textContent = translated("blogNextPage");
    pagination.appendChild(next);
  }

  pagination.hidden = false;
}

async function loadPosts() {
  const conditions = [where("published", "==", true)];
  if (activeCategory) {
    conditions.push(where("category", "==", activeCategory));
  }
  conditions.push(orderBy("publishedAt", "desc"));

  const postsQuery = query(collection(db, "posts"), ...conditions);

  // Firestore has no way to jump straight to a page, so a deep page is built
  // by reading up to that point and keeping the last page worth of posts.
  // Plenty for a blog that publishes a few posts a month.
  const countSnapshot = await getCountFromServer(postsQuery);
  const totalPosts = countSnapshot.data().count;
  const pageCount = Math.max(1, Math.ceil(totalPosts / PAGE_SIZE));
  const pageNumber = Math.min(requestedPage, pageCount);

  const snapshot = await getDocs(query(postsQuery, limit(pageNumber * PAGE_SIZE)));
  const pagePosts = snapshot.docs.slice(-PAGE_SIZE).map(function (docSnapshot) {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      title: data.title || "Untitled",
      body: data.body || "",
      category: data.category || "",
      imageAlt: data.imageAlt || "",
      imageUrl: data.imageUrl || "",
      publishedAt: data.publishedAt ? data.publishedAt.toDate() : null,
    };
  });

  pagePosts.forEach(function (post) {
    grid.appendChild(buildCard(post));
  });

  if (totalPosts === 0) {
    emptyState.hidden = false;
  }

  buildPagination(pageNumber, pageCount);
}

loadCategories();
loadPosts().catch(function (error) {
  // The two posts queries need composite indexes. Until they exist Firestore
  // refuses the query and logs a console error holding a direct link to
  // create each one. That link is the fastest way through this.
  console.error("Failed to load posts:", error);
  emptyState.hidden = false;
});
