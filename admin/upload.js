// Upload and removal endpoints for the Cloudflare Worker that commits
// images and attachments into the website repository.
export const WORKER_UPLOAD_URL =
  "https://autism-allyship-upload.kdmeco-dev.workers.dev/upload";

export const WORKER_REMOVE_URL =
  "https://autism-allyship-upload.kdmeco-dev.workers.dev/remove";

// Returns the git branch that uploads and removals should target, based on
// the hostname that served this page. Returns null for production, where
// the Worker uses its own default branch.
export function uploadBranch() {
  const host = window.location.hostname;
  if (host === "staging.autism-allyship.pages.dev") {
    return "staging";
  }
  if (host === "dev.autism-allyship.pages.dev") {
    return "dev";
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return "dev";
  }
  return null;
}
