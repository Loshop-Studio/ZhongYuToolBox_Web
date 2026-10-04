# ezy-board-viewer 0.1.1 compatibility patch

The application continues to import the upstream npm package and its public API.
`npm ci` applies `ezy-board-viewer+0.1.1.patch` through `patch-package`.
No deleted `packages/ezy-board-viewer` source tree is restored.

The patch carries the export fixes from the previous application PR:

- Cancel before encoding and during mixing/backpressure; close audio/video encoders
  after success, cancellation or failure, and release the external abort listener.
- Clear the full video frame and center pages with different dimensions.
- Try supported H.264 profiles and validate recording/quality parameters.
- Use the existing JSZip dependency when `deflate-raw` is unavailable.
- Retain page-local binary assets (including text and matrix resources) in note previews.
- Ignore stale component loads and avoid restarting playback after cancellation.

It does not replace the package's new note viewer, MDB parser or PDF APIs.
The patch targets the locked 0.1.1 distribution; when upgrading the dependency,
check whether these fixes are included and remove or regenerate the patch.

Run `/tests/board-export.html` under `npm run dev` for synthetic SVG/MP4,
audio, cancellation/retry and actual Fabric editing checks. These tests do not
write to a school account.
