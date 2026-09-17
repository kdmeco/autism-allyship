// Public resource directory. Reads published resources from Firestore once,
// then searches and filters them in the browser. Firestore cannot search
// inside text fields, so the list is fetched whole (published entries only)
// and the search box, category pills and province dropdown narrow it down on
// the page. Nothing is listed until a category is chosen: the foundation
// asked for the pills up front and the resources behind them, rather than
// every entry poured out in one alphabetical list. Typing in the search box
// without choosing a category searches everything. If the filtering pass
// ever fails, the page keeps showing nothing rather than falling back to the
// full list the foundation asked us not to pour out.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocsFromServer,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated, chevronSvg } from "./shared.js";

const toolbar = document.getElementById("resourcesToolbar");
const list = document.getElementById("resourceList");
const pillBar = document.getElementById("categoryPills");
const searchBox = document.getElementById("resourceSearch");
const provinceSelect = document.getElementById("provinceFilter");
const countLine = document.getElementById("resourceCount");
const choosePrompt = document.getElementById("resourcesChoosePrompt");
const filterEmpty = document.getElementById("resourcesEmpty");
const clearRow = document.getElementById("clearFilters");
const clearLink = document.getElementById("clearFiltersLink");
const noneEmpty = document.getElementById("resourcesNone");
const loadingState = document.getElementById("resourcesLoading");
const errorState = document.getElementById("resourcesError");
const retryButton = document.getElementById("resourcesRetry");

// The groups are fixed in code and the stored category values never change
// shape: a group is one label sitting over one or more of those values, in
// the order the foundation's own list uses. Anything outside the map lands
// in Other, which only appears when something is in it.
const CATEGORY_GROUPS = [
  { key: "schools", labelKey: "resourcesGroupSchools", categories: ["School"] },
  {
    key: "specialists",
    labelKey: "resourcesGroupSpecialists",
    categories: ["Diagnosis & assessment", "Therapy", "Early intervention"],
  },
  {
    key: "support",
    labelKey: "resourcesGroupSupport",
    categories: ["Support group"],
  },
  {
    key: "recreation",
    labelKey: "resourcesGroupRecreation",
    categories: ["Recreation"],
  },
  {
    key: "organisations",
    labelKey: "resourcesGroupOrganisations",
    categories: ["National organisation", "Helpline"],
  },
  {
    key: "adults",
    labelKey: "resourcesGroupAdults",
    categories: ["Adult services"],
  },
  {
    key: "grants",
    labelKey: "resourcesGroupGrants",
    categories: ["Grants & financial", "Sensory & equipment"],
  },
];
const OTHER_GROUP_KEY = "other";

let totalResources = 0;
let activeGroup = "";
const groupPills = new Map();

function groupOfCategory(category) {
  return CATEGORY_GROUPS.find(function (group) {
    return group.categories.includes(category);
  });
}

function cardInGroup(card, groupKey) {
  if (groupKey === OTHER_GROUP_KEY) {
    return !groupOfCategory(card.dataset.category);
  }
  const group = CATEGORY_GROUPS.find(function (candidate) {
    return candidate.key === groupKey;
  });
  return group ? group.categories.includes(card.dataset.category) : false;
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

  // The collapsed card carries the name, the category as a pill and the
  // provinces. The description waits until the card is opened, so it is
  // never shown twice.
  const pillRow = document.createElement("span");
  pillRow.className = "resource-pill-row";
  if (resource.category) {
    const pill = document.createElement("span");
    pill.className = "resource-pill";
    pill.textContent = resource.category;
    pillRow.appendChild(pill);
  }

  const provinceText = resource.provinces.join(" \u00b7 ");
  let meta = null;
  if (provinceText) {
    meta = document.createElement("span");
    meta.className = "resource-meta";
    meta.textContent = provinceText;
  }

  summary.appendChild(chevronSvg());
  summary.appendChild(name);
  if (pillRow.childNodes.length > 0) {
    summary.appendChild(pillRow);
  }
  if (meta) {
    summary.appendChild(meta);
  }

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

  // Native details/summary already toggles on Enter and Space when the summary
  // is focused. This handler keeps that behaviour explicit so RES-09 stays
  // reliable if a browser quirks out of the default.
  summary.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    card.open = !card.open;
  });

  return card;
}

function buildPill(group) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "filter-pill";

  // The label carries a data-i18n key so a language switch retranslates it in
  // place, and the count lives in its own span so it survives that swap.
  const label = document.createElement("span");
  label.setAttribute("data-i18n", group.labelKey);
  label.textContent = translated(group.labelKey);

  const count = document.createElement("span");
  count.className = "filter-pill-count";

  pill.append(label, count);
  pill.setAttribute("aria-pressed", "false");
  pill.addEventListener("click", function () {
    selectGroup(activeGroup === group.key ? "" : group.key);
  });
  groupPills.set(group.key, pill);
  return pill;
}

function buildPills(resources) {
  const hasOther = resources.some(function (resource) {
    return !groupOfCategory(resource.category);
  });

  CATEGORY_GROUPS.forEach(function (group) {
    pillBar.appendChild(buildPill(group));
  });
  if (hasOther) {
    pillBar.appendChild(
      buildPill({ key: OTHER_GROUP_KEY, labelKey: "resourcesGroupOther" }),
    );
  }

  pillBar.hidden = false;
}

// The chosen group rides in the URL hash, so a filtered view can be shared,
// and a hashchange on an open page selects its group the same way a click
// does.
function selectGroup(groupKey) {
  activeGroup = groupKey;
  groupPills.forEach(function (pill, key) {
    pill.setAttribute("aria-pressed", String(key === groupKey));
  });
  if (groupKey) {
    history.replaceState(null, "", "#" + groupKey);
  } else if (window.location.hash) {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  applyFilters();
}

function updatePillCounts(term, province) {
  groupPills.forEach(function (pill, key) {
    let matching = 0;
    list.querySelectorAll(".resource-card").forEach(function (card) {
      if (
        cardInGroup(card, key) &&
        (!term || card.dataset.searchText.includes(term)) &&
        (!province || card.dataset.provinces.split(",").includes(province))
      ) {
        matching = matching + 1;
      }
    });
    pill.querySelector(".filter-pill-count").textContent =
      " (" + matching + ")";
  });
}

// Hiding and unhiding cards, never removing them, so a failure in here can
// only ever leave the prompt showing.
function applyFilters() {
  try {
    const term = searchBox.value.trim().toLowerCase();
    const province = provinceSelect.value;
    const showingList = Boolean(activeGroup) || Boolean(term);
    const filtersActive = Boolean(term) || Boolean(activeGroup) || Boolean(province);

    let shown = 0;
    list.querySelectorAll(".resource-card").forEach(function (card) {
      const matches =
        showingList &&
        (!term || card.dataset.searchText.includes(term)) &&
        (!activeGroup || cardInGroup(card, activeGroup)) &&
        (!province || card.dataset.provinces.split(",").includes(province));

      card.hidden = !matches;
      if (matches) {
        shown = shown + 1;
      }
    });

    choosePrompt.hidden = showingList;
    countLine.hidden = !showingList;
    countLine.textContent =
      shown === 1
        ? translated("resourcesCountSingular")
        : translated("resourcesCountPlural")
            .replace("{shown}", String(shown))
            .replace("{total}", String(totalResources));

    filterEmpty.hidden = !(showingList && shown === 0);
    clearRow.hidden = !filtersActive;

    updatePillCounts(term, province);

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
    console.error("Filtering failed, keeping the prompt showing:", error);
    choosePrompt.hidden = false;
    list.querySelectorAll(".resource-card").forEach(function (card) {
      card.hidden = true;
    });
  }
}

function clearEverything(event) {
  event.preventDefault();
  searchBox.value = "";
  provinceSelect.value = "";
  selectGroup("");
  searchBox.focus();
}

searchBox.addEventListener("input", applyFilters);
provinceSelect.addEventListener("change", applyFilters);
clearLink.addEventListener("click", clearEverything);
window.addEventListener("hashchange", function () {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash && groupPills.has(hash) && hash !== activeGroup) {
    selectGroup(hash);
  }
});

async function loadResources() {
  loadingState.hidden = false;
  errorState.hidden = true;
  noneEmpty.hidden = true;

  try {
    const snapshot = await getDocsFromServer(
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
    loadingState.hidden = true;

    if (resources.length === 0) {
      noneEmpty.hidden = false;
      toolbar.hidden = true;
      return;
    }

    toolbar.hidden = false;
    buildPills(resources);
    resources.forEach(function (resource) {
      list.appendChild(buildCard(resource));
    });

    const hash = window.location.hash.replace(/^#/, "");
    if (hash && groupPills.has(hash)) {
      selectGroup(hash);
    } else {
      applyFilters();
    }
  } catch (error) {
    loadingState.hidden = true;
    toolbar.hidden = true;
    errorState.hidden = false;
    console.error("Failed to load resources:", error);
  }
}

retryButton.addEventListener("click", loadResources);
loadResources();
