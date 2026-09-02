// Public donation page. Donations are made by EFT straight into the
// foundation's bank account, so this script never touches money and there is
// no payment gateway behind it. All it does is let a donor optionally tell the
// foundation that a transfer is on its way, which is what makes an anonymous
// line on a bank statement matchable to a person.
//
// That notification is written to the submissions collection, not to
// donations. SCHEMA.md gives donations `allow write: if false` precisely so a
// browser can never assert that money arrived, and an EFT notification is a
// claim of intent rather than proof of payment. The foundation creates the
// real donations record from their statement. Same reasoning, same rule, so
// the rule did not need weakening.
//
// The POPIA checkbox is a gate only: SCHEMA.md has no consent field, so it is
// never stored. Matches contact.js.

import { db } from "./firebase.js";
import { API_CONTACT_NOTIFY_URL } from "./api.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "./shared.js";

const donateForm = document.getElementById("donateForm");
const amountInput = document.getElementById("donateAmount");
const amountOptions = document.querySelectorAll('input[name="amountChoice"]');
const submitButton = document.getElementById("donateSubmitButton");
const submitError = document.getElementById("donateSubmitError");
const submitSuccess = document.getElementById("donateSubmitSuccess");

const fields = {
  amount: amountInput,
  name: document.getElementById("donorName"),
  email: document.getElementById("donorEmail"),
  popia: document.getElementById("donorPopia"),
};
const errors = {
  amount: document.getElementById("donateAmountError"),
  name: document.getElementById("donorNameError"),
  email: document.getElementById("donorEmailError"),
  popia: document.getElementById("donorPopiaError"),
};

amountOptions.forEach(function (option) {
  option.addEventListener("change", function () {
    if (option.value !== "custom") {
      amountInput.value = option.value;
    }
    amountInput.focus();
  });
});

function clearErrors() {
  Object.values(errors).forEach(function (error) {
    error.hidden = true;
  });
  Object.values(fields).forEach(function (field) {
    field.removeAttribute("aria-invalid");
  });
  submitError.hidden = true;
}

// The amount is optional now. Nothing here collects payment, so an amount is
// only ever a hint to help the foundation match a statement line. A blank one
// is fine; a nonsense one is not.
function validateForm() {
  let valid = true;
  const amount = fields.amount.value.trim();

  if (amount && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
    errors.amount.hidden = false;
    fields.amount.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.name.value.trim()) {
    errors.name.hidden = false;
    fields.name.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.email.validity.valid || !fields.email.value.trim()) {
    errors.email.hidden = false;
    fields.email.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.popia.checked) {
    errors.popia.hidden = false;
    fields.popia.setAttribute("aria-invalid", "true");
    valid = false;
  }

  return valid;
}

function showSubmitFailure() {
  submitError.textContent = translated("donateSubmitError");
  submitError.hidden = false;
  submitButton.disabled = false;
  submitButton.textContent = translated("donateSubmitButton");
}

// The amount and the donor's own words are folded into the message body
// because submissions has no amount field and SCHEMA.md is shared with the
// app. One collection, one shape, nothing new to migrate.
function buildMessage(amount, note) {
  const lines = [];
  lines.push(
    amount
      ? translated("donateNotifyAmountLine").replace("{amount}", amount)
      : translated("donateNotifyAmountUnknown"),
  );
  if (note) {
    lines.push(note);
  }
  return lines.join("\n\n");
}

donateForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  if (!validateForm()) {
    const firstInvalid = donateForm.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  // Firestore queues writes when the tab is offline and never rejects, which
  // would leave the button disabled and hide the connection error. Refuse
  // before we call addDoc, so nothing is queued. Matches contact.js.
  if (navigator.onLine === false) {
    showSubmitFailure();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = translated("donateSubmitting");

  try {
    const submission = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: "",
      category: "Donation",
      message: buildMessage(
        fields.amount.value.trim(),
        document.getElementById("donorMessage").value.trim(),
      ),
    };

    await addDoc(collection(db, "submissions"), {
      ...submission,
      handled: false,
      createdAt: serverTimestamp(),
    });

    try {
      const response = await fetch(API_CONTACT_NOTIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!response.ok) {
        console.error("Donation notify failed:", response.status);
      }
    } catch (notifyError) {
      console.error(
        "Donation notify failed:",
        notifyError.code || notifyError.name || "unknown",
      );
    }

    donateForm.hidden = true;
    submitSuccess.hidden = false;
    submitSuccess.focus();
  } catch (error) {
    // Log a code, never the form values. POPIA: no personal information in
    // the console, even while debugging.
    console.error("Donation notify submit failed:", error.code || "unknown");
    showSubmitFailure();
  }
});
