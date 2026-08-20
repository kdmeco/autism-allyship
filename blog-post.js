// Single blog post. Reads the post id from the URL and renders the title,
// meta line, featured image and body. Anything that cannot be shown, a
// missing id, a deleted post or a draft the security rules rightly refuse,
// lands on the same plain message rather than a broken page.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "./shared.js";

const article = document.getElementById("blogArticle");
const titleSlot = document.getElementById("postTitle");
const metaSlot = document.getElementById("postMeta");
const bodySlot = document.getElementById("postBody");
const missing = document.getElementById("postMissing");
const shareButton = document.getElementById("shareButton");
const whatsappShare = document.getElementById("whatsappShare");
const copyLinkButton = document.getElementById("copyLinkButton");
const copyConfirmation = document.getElementById("copyConfirmation");

const params = new URLSearchParams(window.location.search);
const postId = params.get("id");

// The Android app opens this page inside a WebView and adds app=1. The site's
// own header and footer are hidden there because the app already provides
// navigation, settings and a back control, and a second set inside the article
// makes the app read as a wrapper around the website. Theme and sensory mode
// arrive as parameters because the WebView keeps its own storage and cannot see
// what was chosen on the website. A normal visitor never sends any of this, so
// nothing below runs for them.
if (params.get("app") === "1") {
  const root = document.documentElement;
  root.classList.add("app-embed");

  const theme = params.get("theme");
  if (theme === "dark" || theme === "light") {
    root.setAttribute("data-theme", theme);
  }

  if (params.get("sensory") === "on") {
    root.classList.add("sensory-mode");
  }
}

function showMissing() {
  article.hidden = true;
  missing.hidden = false;
}

function renderPost(data) {
  titleSlot.textContent = data.title || "Untitled";
  document.title =
    (data.title || "Blog post") + " | Autism Allyship Foundation";

  const metaParts = [];
  if (data.publishedAt) {
    metaParts.push(data.publishedAt.toDate().toLocaleDateString("en-ZA"));
  }
  if (data.category) {
    metaParts.push(data.category);
  }
  metaSlot.textContent = metaParts.join(" \u00b7 ");

  if (data.imageUrl) {
    // Built here rather than shipped empty in the page, because an img with
    // no src is invalid HTML.
    const image = document.createElement("img");
    image.className = "blog-image";
    image.src = data.imageUrl;
    image.alt = data.imageAlt || "";
    image.width = 1600;
    image.height = 1067;
    article.insertBefore(image, bodySlot);
  }

  // Each line break in the textarea becomes its own paragraph, and the text
  // goes in through textContent so nothing in a post can run as markup.
  data.body
    .split(/\n+/)
    .map(function (chunk) {
      return chunk.trim();
    })
    .filter(Boolean)
    .forEach(function (chunk) {
      const paragraph = document.createElement("p");
      paragraph.textContent = chunk;
      bodySlot.appendChild(paragraph);
    });

  article.hidden = false;
  setUpShareButtons(data.title || "");
}

function setUpShareButtons(title) {
  const shareData = {
    title: title,
    text: title,
    url: window.location.href,
  };

  // The system share sheet only exists on some browsers, so the button is
  // hidden in the markup and unhidden here.
  if (navigator.share) {
    shareButton.hidden = false;
    shareButton.addEventListener("click", function () {
      navigator.share(shareData).catch(function () {
        // Somebody closing the share sheet is not an error worth showing.
      });
    });
  }

  whatsappShare.href =
    "https://wa.me/?text=" +
    encodeURIComponent(title + " " + window.location.href);

  copyLinkButton.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyConfirmation.hidden = false;
      setTimeout(function () {
        copyConfirmation.hidden = true;
      }, 4000);
    } catch (error) {
      console.error("Could not copy the link:", error);
    }
  });
}

if (!postId) {
  showMissing();
} else {
  getDoc(doc(db, "posts", postId))
    .then(function (snapshot) {
      if (!snapshot.exists()) {
        showMissing();
        return;
      }
      renderPost(snapshot.data());
    })
    .catch(function (error) {
      console.error("Failed to load the post:", error);
      showMissing();
    });
}
