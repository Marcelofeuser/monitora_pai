---
name: PWA service worker cache
description: Preview and shell-cache behavior to remember when changing the PWA frontend.
---

When the PWA shell changes, update both the service-worker cache version and the registered worker URL so existing preview clients can load the new HTML and JavaScript.

**Why:** A previously installed worker can cache the worker script and app shell itself, making a successful rebuild appear unchanged in the proxied preview.

**How to apply:** Keep service-worker registration cache-busting explicit during shell changes, then restart the PWA workflow and verify the preview after the worker activates.