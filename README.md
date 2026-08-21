# Autism Allyship Foundation website

The public website and staff-admin pages for the Autism Allyship Foundation. It is a static
Cloudflare Pages site backed by Firebase for content and two Cloudflare Workers for foundation
operations and managed image uploads.

## Related projects

- `../autism-allyship-api` — ticket, contact and donation Worker API.
- `../autism-allyship-upload` — authenticated gallery upload and removal Worker.
- `../autism-allyship-foundation-notes/autism-allyship-notes` — project handover, testing and
  delivery notes.

## Deployment branches

Cloudflare Pages deploys each environment from Git:

- `dev` — development integration
- `staging` — pre-production review
- `main` — production

Promote a tested change in that order. Gallery test albums must be removed through the staging
admin before promoting staging to `main`, so the Firestore record and its uploaded image files
are deleted together.

## Gallery behaviour

Albums are grouped by year. Selecting **View gallery** opens the keyboard-accessible viewer
directly; it loads the current full-size image only when the viewer opens, rather than rendering
every photo in a large page grid. Use the Previous, Next and Close controls, Escape, or the left
and right arrow keys to navigate.

The gallery editor accepts a large photo selection and processes it sequentially in groups of
five. Each source photo produces a full WebP and a thumbnail, keeping every request within the
upload Worker's ten-file limit. The editor checkpoints an album after each completed group so a
later failure does not discard earlier uploads. Enter the album title and year before selecting
photos.

For production gallery imports, sign in through
`https://autism-allyship.pages.dev/admin/login.html`. Uploading there commits media to `main`.
Because the environments share Firestore, merge the generated media commits back into `dev` and
`staging` after the import so their gallery documents never point at files missing from those
branches.

## Local check

Serve this folder with any static-file server, for example:

```powershell
npx --yes serve -l 8080 .
```

Then open `http://localhost:8080/gallery.html`. A deployed HTTPS URL is required to test
Firebase-backed data; opening the files directly with `file://` is blocked by browser security.
