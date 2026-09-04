// Upload and removal endpoints for the Cloudflare Worker that commits
// images and attachments into the website repository.
export const WORKER_UPLOAD_URL =
  "https://autism-allyship-upload.kdmeco-dev.workers.dev/upload";

export const WORKER_REMOVE_URL =
  "https://autism-allyship-upload.kdmeco-dev.workers.dev/remove";

// Returns the git branch that uploads and removals should target. Always null
// since the production handover on 3 September 2026, which means the Worker
// uses its own default branch, main.
//
// Until then this read the hostname and returned "staging" or "dev" so each
// preview admin committed to its own branch. That is gone: after handover an
// admin page has no business writing anywhere but production, and the Worker
// now refuses every other branch anyway. Kept as a function rather than
// deleted so the sixteen call sites keep reading the same way, and so turning
// preview uploads back on later is one edit in one place.
export function uploadBranch() {
  return null;
}

// Turns a failed Worker response into a sentence an admin can act on.
//
// The Worker already answers with a specific reason in its JSON body, for
// example "One of the files is too large after resizing" or "Each file needs
// data and a type". Every call site used to throw that away and show "Try
// again" instead, which is the one instruction that cannot help when the
// file, the folder or the sign in is what is wrong. Diagnosing a failed
// gallery upload on 4 September 2026 took two rounds entirely because of it.
//
// Pass the status and the already parsed body, or null when the body was not
// JSON, so the caller reads the response once and this never has to.
export function uploadFailureMessage(status, body) {
  const reason = body && typeof body.error === "string" ? body.error : "";
  if (reason) {
    return reason + " (error " + status + ")";
  }

  // No JSON body to quote, so say what the status itself means. A Cloudflare
  // error page rather than the Worker's own reply lands here.
  if (status === 401) {
    return (
      "The upload service did not accept your sign in. Sign in again, and if " +
      "that does not help your account may not be on the upload service's " +
      "admin list, which is separate from the admin list on this site. (error 401)"
    );
  }
  if (status === 403) {
    return (
      "The upload service refused this page's address. Uploads work from the " +
      "live site, not from a file opened off the disk. (error 403)"
    );
  }
  if (status === 413) {
    return "The files were too large to upload. Try a smaller image. (error 413)";
  }
  if (status === 404 || status === 405) {
    return (
      "The upload service could not find its upload address. This is a fault " +
      "in the site rather than anything you did. (error " + status + ")"
    );
  }
  if (status >= 500) {
    return (
      "The upload service could not save the files. This is usually temporary, " +
      "so try once more, and report it if it keeps happening. (error " + status + ")"
    );
  }
  return "The upload failed with error " + status + ".";
}

// Reads a Worker response body without throwing when it is not JSON, so a
// caller can always reach uploadFailureMessage with whatever came back.
export async function readJsonBody(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}
