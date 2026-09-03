// Home Instagram section. Loads every instagram_posts document once, sorts by
// order in the browser, and builds official embed blockquotes. The embed
// script is only fetched when the section enters the viewport. Sensory mode
// and embed-script failure both fall back to a plain profile link.

import { db } from "./firebase.js";
import { translated } from "./shared.js";
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
      "background:#FFF; border:0; margin:0; max-width:540px; padding:0; width:100%;";

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
  // Also title anything already present, so a re-render that skips the script
  // path above still leaves no frame without a name.
  titleEmbedFrames();
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
      watchForEmbedFrames();
    }
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = EMBED_SCRIPT_SRC;
  script.onload = function () {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
      watchForEmbedFrames();
    } else {
      showFallback();
    }
  };
  script.onerror = function () {
    showFallback();
  };
  document.body.appendChild(script);
}

// Instagram's embed script swaps each blockquote for an iframe of its own
// making, and those arrive with no title attribute, which axe reports as a
// serious frame-title failure. We cannot set it at creation because we do not
// create them, so watch the grid and title each one as it appears.
function titleEmbedFrames() {
  if (!grid) {
    return;
  }

  // Index across every frame, not just the untitled ones. The frames arrive one
  // at a time, so numbering the untitled ones alone would start again at 1 for
  // each late arrival and hand two posts the same accessible name.
  grid.querySelectorAll("iframe").forEach(function (frame, index) {
    if (frame.hasAttribute("title")) {
      return;
    }

    frame.setAttribute(
      "title",
      translated("homeInstagramEmbedTitle").replace(
        "{number}",
        String(index + 1),
      ),
    );
  });
}

// process() replaces the blockquotes asynchronously, so there is nothing to
// title at the moment it returns. Ten seconds is long enough for a slow
// connection and short enough that the observer does not outlive the page.
function watchForEmbedFrames() {
  if (!grid) {
    return;
  }

  titleEmbedFrames();

  const observer = new MutationObserver(titleEmbedFrames);
  observer.observe(grid, { childList: true, subtree: true });
  window.setTimeout(function () {
    observer.disconnect();
  }, 10000);
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
