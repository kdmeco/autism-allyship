// Fills the latest posts section on the home page with the three newest
// published posts. Until there are any, the placeholder card stays in place.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const grid = document.getElementById("homeBlogGrid");
const placeholder = document.getElementById("homeBlogPlaceholder");

// Same thumbnail rule as the blog page: the stored path points at the full
// image and the 400px copy sits beside it with a -thumb suffix.
function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
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

  if (post.publishedAt) {
    const dateLine = document.createElement("p");
    dateLine.className = "card-date";
    dateLine.textContent = post.publishedAt.toLocaleDateString("en-ZA");
    card.appendChild(dateLine);
  }

  return card;
}

async function loadLatestPosts() {
  const snapshot = await getDocs(
    query(
      collection(db, "posts"),
      where("published", "==", true),
      orderBy("publishedAt", "desc"),
      limit(3),
    ),
  );

  if (snapshot.empty) {
    return;
  }

  placeholder.hidden = true;

  snapshot.docs.forEach(function (docSnapshot) {
    const data = docSnapshot.data();
    grid.appendChild(
      buildCard({
        id: docSnapshot.id,
        title: data.title || "Untitled",
        imageAlt: data.imageAlt || "",
        imageUrl: data.imageUrl || "",
        publishedAt: data.publishedAt ? data.publishedAt.toDate() : null,
      }),
    );
  });
}

loadLatestPosts().catch(function (error) {
  console.error("Failed to load the latest posts:", error);
});
