These small PDFs contain only synthetic English page labels, red rectangles and four green corner marks. They are generated from the first four pages of `scripts/test-pdf.mjs`'s mixed-orientation fixture using pypdf.

- `rc4-readable.pdf`: RC4-128, empty opening password.
- `aes128-readable.pdf`: AES-128, empty opening password.
- `aes256-readable.pdf`: AES-256, empty opening password.
- `requires-password.pdf`: AES-128, opening password `fixture-password`.

The owner password is `synthetic-test-owner`; these are test values, not user credentials. No source learning materials or account data are included.

Open `tests/pdf-encryption-qa.html` in the development server or an isolated Android QA build. It calls the real local conversion code, renders the encrypted original and converted PDF, compares every page's pixels and bounds, checks source preservation, and checks the locked-file message. No cloud uploads occur.

The QA also removes `Promise.withResolvers` from both the page and a separate module worker before loading PDF.js. It checks that the official legacy bundles restore the missing API and still render every page. This simulates the missing API reported by older Android WebViews; it is not a claim that every older browser feature is tested.
