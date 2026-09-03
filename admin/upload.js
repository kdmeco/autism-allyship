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
