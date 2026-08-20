// Home Instagram section. Loads every instagram_posts document once, sorts by
// order in the browser, and builds official embed blockquotes. The embed
// script is only fetched when the section enters the viewport. Sensory mode
// and embed-script failure both fall back to a plain profile link.

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const PROFILE_URL = "https://www.instagram.com/autismallyship/";
const EMBED_SCRIPT_SRC = "https://www.instagram.com/embed.js";

const grid = document.getElementById("homeInstagramGrid");
const fallback = document.getElementById("homeInstagramFallback");
const section = grid ? grid.closest(".home-section") : null;

let embedScriptRequested = false;
let posts = [];

function isSensoryMode() {
  return document.documentElement.classList.contains("sensory-mode");
}

function showFallback() {
  if (grid) {
    grid.hidden = true;
    grid.textContent = "";
  }
  if (fallback) {
    fallback.hidden = false;
  }
}

function showEmbeds() {
  if (!grid || posts.length === 0) {
    showFallback();
    return;
  }

  if (fallback) {
    fallback.hidden = true;
  }

  grid.textContent = "";
  posts.forEach(function (post) {
    const wrap = document.createElement("div");
    wrap.className = "instagram-embed-item";

    const blockquote = document.createElement("blockquote");
    blockquote.className = "instagram-media";
    blockquote.setAttribute("data-instgrm-permalink", post.url);
    blockquote.setAttribute("data-instgrm-version", "14");
    blockquote.style.cssText =
      "background:#FFF; border:0; margin:0; max-width:540px; min-width:280px; padding:0; width:100%;";

    const link = document.createElement("a");
    link.href = post.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = post.url;
    blockquote.appendChild(link);

    wrap.appendChild(blockquote);
    grid.appendChild(wrap);
  });

  grid.hidden = false;
  loadEmbedScript();
}

function loadEmbedScript() {
  if (embedScriptRequested || isSensoryMode()) {
    return;
  }
  embedScriptRequested = true;

  const existing = document.querySelector(
    'script[src="' + EMBED_SCRIPT_SRC + '"]',
  );
  if (existing) {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
    }
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = EMBED_SCRIPT_SRC;
  script.onload = function () {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
    } else {
      showFallback();
    }
  };
  script.onerror = function () {
    showFallback();
  };
  document.body.appendChild(script);
}

function applyMode() {
  if (isSensoryMode() || posts.length === 0) {
    showFallback();
    return;
  }
  showEmbeds();
}

function watchSensoryMode() {
  const observer = new MutationObserver(function () {
    applyMode();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function watchViewport() {
  if (!section || typeof IntersectionObserver !== "function") {
    applyMode();
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          applyMode();
          observer.disconnect();
        }
      });
    },
    { rootMargin: "200px 0px" },
  );
  observer.observe(section);
}

async function loadPosts() {
  if (!grid || !fallback) {
    return;
  }

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
      .filter(function (post) {
        return Boolean(post.url);
      })
      .sort(function (first, second) {
        return first.order - second.order;
      });

    if (posts.length === 0) {
      // No posts configured yet: leave the section quiet rather than forcing
      // a profile link that looks like an error.
      if (section) {
        section.hidden = true;
      }
      return;
    }

    watchSensoryMode();
    watchViewport();
  } catch (error) {
    console.error("Failed to load Instagram posts:", error);
    if (section) {
      section.hidden = false;
    }
    const link = fallback ? fallback.querySelector("a") : null;
    if (link && !link.getAttribute("href")) {
      link.href = PROFILE_URL;
    }
    showFallback();
  }
}

loadPosts();
