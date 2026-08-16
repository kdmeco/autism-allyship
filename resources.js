// Public resource directory. Reads published resources from Firestore once,
// then searches and filters them in the browser. Firestore cannot search
// inside text fields, so the list is fetched whole (published entries only)
// and the search box, category pills and province dropdown narrow it down on
// the page. If the filtering pass ever fails, the full list simply stays
// visible.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "./shared.js";

const toolbar = document.getElementById("resourcesToolbar");
const list = document.getElementById("resourceList");
const pillBar = document.getElementById("categoryPills");
const searchBox = document.getElementById("resourceSearch");
const provinceSelect = document.getElementById("provinceFilter");
const countLine = document.getElementById("resourceCount");
const filterEmpty = document.getElementById("resourcesEmpty");
const clearRow = document.getElementById("clearFilters");
const clearLink = document.getElementById("clearFiltersLink");
const noneEmpty = document.getElementById("resourcesNone");

let totalResources = 0;
let activeCategory = "";

function excerpt(description) {
  const flat = description.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) {
    return flat;
  }
  return flat.slice(0, 157).trimEnd() + "...";
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

function contactLink(kind, value) {
  const link = document.createElement("a");

  if (kind === "phone") {
    link.href = "tel:" + value.replace(/\s+/g, "");
    link.textContent = value;
  } else if (kind === "email") {
    link.href = "mailto:" + value;
    link.textContent = value;
  } else {
    link.href = value;
    link.textContent = new URL(value).hostname;
    link.target = "_blank";
    link.rel = "noopener";
  }

  return link;
}

function buildCard(resource) {
  const card = document.createElement("details");
  card.className = "resource-card";
  card.dataset.category = resource.category;
  card.dataset.provinces = resource.provinces.join(",");
  card.dataset.searchText = (
    resource.name +
    " " +
    resource.description
  ).toLowerCase();

  const summary = document.createElement("summary");

  const name = document.createElement("span");
  name.className = "resource-name";
  name.textContent = resource.name;

  const metaParts = [resource.category, resource.provinces.join(" \u00b7 ")].filter(Boolean);
  let meta = null;
  if (metaParts.length > 0) {
    meta = document.createElement("span");
    meta.className = "resource-meta";
    meta.textContent = metaParts.join(" \u00b7 ");
  }

  const summaryExcerpt = document.createElement("p");
  summaryExcerpt.className = "resource-excerpt";
  summaryExcerpt.textContent = excerpt(resource.description);

  summary.appendChild(chevronSvg());
  summary.appendChild(name);
  if (meta) {
    summary.appendChild(meta);
  }
  summary.appendChild(summaryExcerpt);

  const details = document.createElement("div");
  details.className = "resource-details";

  const fullDescription = document.createElement("p");
  fullDescription.textContent = resource.description;
  details.appendChild(fullDescription);

  const hasContact =
    resource.phone || resource.email || resource.website;
  if (hasContact) {
    const contact = document.createElement("div");
    contact.className = "resource-contact";
    if (resource.phone) {
      contact.appendChild(contactLink("phone", resource.phone));
    }
    if (resource.email) {
      contact.appendChild(contactLink("email", resource.email));
    }
    if (resource.website) {
      contact.appendChild(contactLink("website", resource.website));
    }
    details.appendChild(contact);
  }

  card.appendChild(summary);
  card.appendChild(details);
  return card;
}

function buildPill(category) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "filter-pill";
  pill.textContent = category;
  pill.setAttribute(
    "aria-pressed",
    String(category === activeCategory),
  );
  pill.addEventListener("click", function () {
    activeCategory = category;
    pillBar.querySelectorAll(".filter-pill").forEach(function (other) {
      other.setAttribute(
        "aria-pressed",
        String(other === pill),
      );
    });
    applyFilters();
  });
  return pill;
}

function buildPills(resources) {
  const categories = [
    ...new Set(
      resources
        .map(function (resource) {
          return (resource.category || "").trim();
        })
        .filter(Boolean),
    ),
  ].sort(function (first, second) {
    return first.localeCompare(second);
  });

  if (categories.length === 0) {
    return;
  }

  const all = document.createElement("button");
  all.type = "button";
  all.className = "filter-pill";
  all.textContent = translated("resourcesFilterAll");
  all.setAttribute("aria-pressed", String(activeCategory === ""));
  all.addEventListener("click", function () {
    activeCategory = "";
    pillBar.querySelectorAll(".filter-pill").forEach(function (other) {
      other.setAttribute("aria-pressed", String(other === all));
    });
    applyFilters();
  });
  pillBar.appendChild(all);

  categories.forEach(function (category) {
    pillBar.appendChild(buildPill(category));
  });

  pillBar.hidden = false;
}

// Hiding and unhiding cards, never removing them, so a failure in here can
// only ever leave the full list showing.
function applyFilters() {
  try {
    const term = searchBox.value.trim().toLowerCase();
    const province = provinceSelect.value;
    const filtersActive = Boolean(term) || Boolean(activeCategory) || Boolean(province);

    let shown = 0;
    list.querySelectorAll(".resource-card").forEach(function (card) {
      const matches =
        (!term || card.dataset.searchText.includes(term)) &&
        (!activeCategory || card.dataset.category === activeCategory) &&
        (!province || card.dataset.provinces.split(",").includes(province));

      card.hidden = !matches;
      if (matches) {
        shown = shown + 1;
      }
    });

    countLine.textContent =
      shown === 1
        ? translated("resourcesCountSingular")
        : translated("resourcesCountPlural")
            .replace("{shown}", String(shown))
            .replace("{total}", String(totalResources));

    filterEmpty.hidden = !(filtersActive && shown === 0);
    clearRow.hidden = !filtersActive;

    // A filter can hide the card the keyboard focus was inside. Move focus to
    // the search box rather than let it fall back to the top of the page.
    const focusInsideHidden =
      document.activeElement &&
      document.activeElement.closest &&
      document.activeElement.closest("[hidden]");
    if (focusInsideHidden) {
      searchBox.focus();
    }
  } catch (error) {
    console.error("Filtering failed, showing the full list:", error);
    list.querySelectorAll(".resource-card").forEach(function (card) {
      card.hidden = false;
    });
  }
}

function clearEverything(event) {
  event.preventDefault();
  searchBox.value = "";
  provinceSelect.value = "";
  activeCategory = "";
  pillBar.querySelectorAll(".filter-pill").forEach(function (pill, position) {
    pill.setAttribute("aria-pressed", String(position === 0));
  });
  applyFilters();
  searchBox.focus();
}

searchBox.addEventListener("input", applyFilters);
provinceSelect.addEventListener("change", applyFilters);
clearLink.addEventListener("click", clearEverything);

async function loadResources() {
  const snapshot = await getDocs(
    query(collection(db, "resources"), where("published", "==", true)),
  );

  const resources = snapshot.docs
    .map(function (docSnapshot) {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        name: data.name || "Untitled",
        description: data.description || "",
        category: (data.category || "").trim(),
        provinces: Array.isArray(data.provinces)
          ? data.provinces
          : data.province
            ? [data.province]
            : [],
        phone: data.phone || "",
        email: data.email || "",
        website: data.website || "",
      };
    })
    .sort(function (first, second) {
      return first.name.localeCompare(second.name);
    });

  totalResources = resources.length;

  if (resources.length === 0) {
    noneEmpty.hidden = false;
    toolbar.hidden = true;
    return;
  }

  buildPills(resources);
  resources.forEach(function (resource) {
    list.appendChild(buildCard(resource));
  });
  applyFilters();
}

loadResources().catch(function (error) {
  console.error("Failed to load resources:", error);
  noneEmpty.hidden = false;
});
