# The Phase 2 end-when, as a check that can be run again

Phase 2's done-when, in one line (docs/plan.md):

> create a project → copy the snippet → a plain HTML page on another origin shows the button → the panel opens and shows a mock reply

The first two steps are a person with the dashboard and the install page. The
last two are a script, and this is it.

## What it does

`apps/widget/scripts/phase2-check.mjs` serves a plain HTML page from
`127.0.0.1`, drives a browser through it, and prints what the browser
rendered: the button's HTML, the panel's HTML, and the mock reply. It checks
the things the phase says must hold, and exits non-zero when one of them does
not.

The page is `apps/widget/scripts/phase2-check.html`: the install snippet and
nothing else — no framework, no bundler, no script of its own.

Before that, the check reads the app's own landing page. That is where the
snippet the owner copies comes from, and a snippet that names another
deployment is no use: the check reads the origin out of the page the browser
rendered and fails when it is not the deployment under test.

## The app's own landing page

The landing page is public and statically prerendered, so reading it needs
**no session and no credential** — only the protection's header, which the run
needs anyway for the config route.

The snippet is read from the **rendered** page, not from the HTML. The
server's HTML carries the fallback — the env var, or `your-app.example` — and
the browser fills in the origin the page was served from. So the check reads
the page until the snippet differs from the server's, which is the moment the
browser has filled it in. The wait ends early when the snippet already names
this deployment: there is nothing left to fill in.

The landing page's snippet is **never** used for the load. Its key is the
illustrative `pk_...`, and a bad key renders nothing. The load keeps the key
the check was given, and the proxy origin — a protected deployment cannot be
loaded straight from a browser on another origin, which is why the proxy is
there.

Every run says which origin the app's page reported, next to the deployment
under test:

```
- The app's own landing page reported **https://your-app.example** as the snippet's origin.
- The deployment under test is **https://askwell-git-check-phase2-preview-mnaumann79s-projects.vercel.app**.
```

## How to run it

```bash
node apps/widget/scripts/phase2-check.mjs \
  --origin https://<the app's origin> \
  --key pk_<the project's public key>
```

- **`--origin`** is the app the widget is loaded from: **a preview deployment,
  never the production alias.** The Preview scope carries the dev Supabase keys
  and the Production scope does not until Phase 6, so the widget's config
  fetch would fail there.
- **`--key`** is the `public_key` of a project that exists on dev. The config
  route answers 404 for a key that belongs to no project, and the widget then
  correctly renders nothing — which makes for a useless check.

Two more things the run needs:

- **The secret.** A preview deployment is protected, so the run needs
  `VERCEL_AUTOMATION_BYPASS_SECRET` in the environment. Without it the
  requests answer with the protection page instead of the app.
- **A browser.** Playwright is not a dependency of this repo — the check is a
  script, not a package. Either install it where Node can find it:

  ```bash
  npm i playwright && npx playwright install chromium
  ```

  or point `PLAYWRIGHT_MODULE` at the module. The script also looks in the
  npx cache, so a `npx playwright` that is already there is found.

### What it needs from the deployment

| The deployment must have | Or the check fails with                                      |
| ------------------------ | ------------------------------------------------------------ |
| `GET /`                  | "the app's own landing page shows an install snippet"        |
| `GET /api/widget/config` | "the config route answers 200 for the key — it answered 404" |
| `GET /widget.js`         | "the widget renders a button"                                |
| `GET /embed?key=…`       | "the click opens the panel"                                  |

## The proxy, and why there is one

The page is served from `127.0.0.1:<port>` and the widget is loaded from
`127.0.0.1:<another port>`, in front of the deployment. Two reasons:

**The protection's header would make the browser send a preflight.** A preview
deployment is protected, and the way past the protection is a header,
`x-vercel-protection-bypass`. A header the browser does not send by itself
makes it send a preflight first, and the config route answers a preflight with
`Access-Control-Allow-Headers: Content-Type` — so the browser refuses the
request and the widget never gets its config. The proxy adds the header,
where there is no preflight to answer.

**Clerk's development instance answers a document request with a redirect.**
The panel is an iframe, and an iframe's request is a document request. A Clerk
development instance answers that with a redirect to its handshake, which
redirects back with a token in the URL; the app answers that with the cookie
that says the dev browser is set up, and then asks for the page again. The
proxy follows the chain and keeps the cookies. In the browser the way back
would leave the proxy and hit the protection's login page, which cannot be
framed.

The proxy forwards every request and every answer, the CORS headers included,
so the cross-origin path is still the one under test: the page's origin and
the app's origin are different, and the browser checks the answer's
`Access-Control-Allow-Origin` on the config fetch.

## The closed shadow root

The loader keeps everything in a **closed** shadow root, so no selector can
reach the button: `host.shadowRoot` is null, and the browser automation's
locators only pierce open roots. The script reads and clicks the button
through the browser's own protocol, which pierces a closed one.

## The run of 2026-11-10

Against `https://askwell-git-check-phase2-preview-mnaumann79s-projects.vercel.app`,
a plain preview built from `main`, with the key
`pk_8ef8ea2f81ae46d88fcb81cd47c83526`.

The config route answered **200**:

```json
{
  "config": {
    "buttonColor": "#111111",
    "position": "bottom-right",
    "label": "Chat",
    "animation": "fade",
    "headerText": "Askwell",
    "showBadge": true
  }
}
```

The button, as the browser rendered it:

```html
<button class="btn" type="button" style="background: rgb(17, 17, 17);">
  Chat<span class="dot"></span>
</button>
```

The host of the widget, as the browser rendered it:

```html
<div
  id="askwell-widget"
  class="bottom-right"
  style="position: fixed; z-index: 2147483647; bottom: 16px; right: 16px;"
></div>
```

The panel's frame, as the browser placed it — the rectangle, and the offsets
the rule gave it:

```json
{
  "x": 16,
  "y": 224,
  "width": 343,
  "height": 480,
  "position": "absolute",
  "bottom": "0px",
  "right": "0px"
}
```

The panel, as the browser rendered it:

```html
<div data-open="true" class="theme-light flex h-dvh flex-col bg-background text-foreground">
  <header class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
    <h1 class="truncate text-sm font-semibold tracking-tight">Askwell</h1>
    <button
      type="button"
      aria-label="Close the chat"
      class="rounded-full p-1 text-muted transition hover:bg-surface hover:text-foreground"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        ></path>
      </svg>
    </button>
  </header>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <div class="flex flex-col gap-3 px-4 py-4">
      <div
        data-state="empty"
        class="flex flex-col items-center gap-2 rounded-card border border-border px-4 py-6 text-center bg-surface"
      >
        <p class="text-sm font-medium text-foreground">Ask a question</p>
        <p class="text-sm leading-relaxed text-muted">
          The answers come from the product information of this project.
        </p>
      </div>
    </div>
  </div>
  <form class="border-t border-border p-3">
    <div class="flex items-center gap-2">
      <input
        placeholder="Ask a question…"
        maxlength="1000"
        aria-label="Your question"
        class="min-w-0 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent"
        value=""
      /><button
        type="submit"
        disabled=""
        class="rounded-card bg-accent px-4 py-2 text-sm font-medium text-background transition disabled:opacity-40"
      >
        Send
      </button>
    </div>
  </form>
  <p class="px-4 pb-3 text-center text-[11px] text-muted">Powered by Askwell</p>
</div>
```

The exchange, as the browser rendered it:

```html
<div class="flex flex-col gap-3 px-4 py-4">
  <p
    data-role="visitor"
    class="max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed ml-auto bg-surface-strong text-foreground"
  >
    What does this product do?
  </p>
  <p
    data-role="bot"
    class="max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed bg-surface text-foreground"
  >
    Thanks for your message! This is a demo reply — the real answers arrive with the chat route in a
    later phase.
  </p>
</div>
```

The screenshot is at `/tmp/askwell-phase2-check/widget.png` — Chromium, headless,
375 px wide, the page at `http://127.0.0.1:4173/`.

## The run of 2026-11-11

Two runs, against two deployments, with the key
`pk_8ef8ea2f81ae46d88fcb81cd47c83526`.

### Against a preview built from `main`

`https://askwell-git-check-phase2-preview-mnaumann79s-projects.vercel.app`.

The config route answered **200**, the button rendered with the config's
label, colour and position, the click opened the panel, and the mock reply
came back. One thing did not hold:

```
## What did not hold

- the app's own landing page shows a snippet for this deployment — the app's page reported https://your-app.example, the deployment under test is https://askwell-git-check-phase2-preview-mnaumann79s-projects.vercel.app
```

The snippet, as the browser rendered it:

```html
<script src="https://your-app.example/widget.js" data-key="pk_..."></script>
```

That deployment was built before the Preview scope had `NEXT_PUBLIC_APP_URL`,
so the snippet fell back to `https://your-app.example` — the placeholder. That
is what an owner copies, and the check now says so instead of letting it
through.

### Against a preview whose snippet comes from the runtime origin

`https://askwell-git-feature-b1-t12-mnaumann79s-projects.vercel.app`, this
branch's preview, built from `main` with the snippet built from the origin the
page is served from. The same run against the preview of that change,
`https://askwell-git-feature-b1-t11-mnaumann79s-projects.vercel.app`, held the
same way.

The two answers are different, and the gap between them is the thing the check
exists to catch. The HTML the deployment served carried the fallback — the
Preview scope's `NEXT_PUBLIC_APP_URL`, which names another deployment:

```console
$ curl -sSL -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
    https://askwell-git-feature-b1-t11-mnaumann79s-projects.vercel.app/ \
  | grep -o 'src=[^ ]\{0,70\}widget\.js' | head -1
src=&quot;https://askwell-mnaumann79s-projects.vercel.app/widget.js
```

and the browser, once the page had hydrated, showed the origin the page was
served from:

```html
<script src="https://askwell-git-feature-b1-t12-mnaumann79s-projects.vercel.app/widget.js" data-key="pk_..."></script>
```

The check read the browser's answer, not the HTML's, and held:

```
- The app's own landing page reported **https://askwell-git-feature-b1-t12-mnaumann79s-projects.vercel.app** as the snippet's origin.
- The deployment under test is **https://askwell-git-feature-b1-t12-mnaumann79s-projects.vercel.app**.
```

Nothing failed, and the run ended with exit code 0.

A deployment whose snippet is a build-time constant that names another
deployment still fails — that is the bug the check is for, not a defect in the
check.

## What the run found, and what was done about it

The first run of this check failed on one thing: **the panel opened, and it was
rendered outside the viewport.** The frame sat at `x 359, y 704`, 343 by 480, on
a screen of 375 by 720 — so the visitor saw a sliver of it and nothing else.
The screenshot showed it: the page, and a white corner at the bottom right.

The reason was in the loader's stylesheet (`apps/widget/src/loader.ts`). The
position rules were written as

```css
.bottom-right .frame {
  bottom: 0;
  right: 0;
}
```

and they never matched. Inside a shadow root a selector is matched against the
shadow tree, and the host element is not part of it: the host has the class
`bottom-right`, but the class is on the _outside_ of the shadow root. With no
`bottom` and no `right`, the frame was placed at its static position — the
host's origin, which is the bottom right corner of the screen — and it hung off
the screen to the right and below.

The proof, in one page: a host with the class `bottom-right` and two frames in
its shadow root, one under each rule.

```text
.bottom-right .frame         -> bottom: auto   right: auto
:host(.bottom-right) .frame2 -> bottom: 0px    right: 0px
```

**The fix is PR #29**, which the four rules address as `:host(.bottom-right)`
and the three other corners. It is merged: the run above is against a preview
built from `main` with it, and the frame now sits at `x 16, y 224` with
`bottom: 0px` and `right: 0px` — inside the viewport, 16px from the edge, the
margin the button has.

The check asserts it, so the next run says so in one line rather than in a
screenshot: "the panel is on the screen".
