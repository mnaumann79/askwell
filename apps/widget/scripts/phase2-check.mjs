#!/usr/bin/env node
/**
 * The Phase 2 end-when, as a check that can be run again (docs/plan.md).
 *
 *   create a project → copy the snippet → a plain HTML page on another origin
 *   shows the button → the panel opens and shows a mock reply
 *
 * This is the last part of it, as a script. It serves the plain page from
 * 127.0.0.1 — another origin than the app — drives a browser through it, and
 * prints what the browser rendered: the button's HTML, the panel's HTML, and
 * the mock reply. It checks the things the phase says must hold and exits
 * non-zero when one of them does not.
 *
 * Before that, it reads the app's own landing page. The snippet the owner
 * copies comes from there, and a snippet that names another deployment is no
 * use: the check reads the origin out of the page the browser rendered and
 * fails when it is not the deployment under test.
 *
 * Usage:
 *   node apps/widget/scripts/phase2-check.mjs --origin https://<the app> --key pk_...
 *
 * `--origin` is the app the widget is loaded from: a preview deployment, never
 * the production alias. The Preview scope carries the dev Supabase keys and
 * the Production scope does not until Phase 6, so the config fetch would fail
 * there. `--key` is the `public_key` of a project that exists on dev: the
 * config route answers 404 for a key that belongs to no project, and the
 * widget then correctly renders nothing.
 *
 * A preview deployment is protected, so the check sends Vercel's bypass header
 * when VERCEL_AUTOMATION_BYPASS_SECRET is set in the environment.
 *
 * Playwright is not a dependency of this repo. Point PLAYWRIGHT_MODULE at it,
 * or install it where Node can find it:
 *   npm i playwright && npx playwright install chromium
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(scriptDir, "phase2-check.html");

/** How long the browser is given for each step, in milliseconds. */
const STEP_TIMEOUT = 20_000;

/** How long the app's landing page is given to fill its snippet in. */
const APP_SNIPPET_TIMEOUT = 10_000;

/** How long the app's landing page is given to go quiet, before it is read. */
const APP_PAGE_IDLE_TIMEOUT = 10_000;

/** The question the check asks, so the panel answers with its mock reply. */
const QUESTION = "What does this product do?";

/** The install snippet's script tag, and the src it points at. */
const SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>(?:\s*<\/script>)?/i;

/**
 * The src of the install snippet in a page's HTML.
 *
 * A page carries script tags of its own — the framework's chunks — so the
 * snippet is found by the file it points at and not by the tag alone.
 */
const SCRIPT_SRC_IN_HTML = /src\s*=\s*["']([^"']*\/widget\.js)["']/i;

/** The arguments. */
function parseArgs(argv) {
  const options = { origin: "", key: "", port: 4173, appPort: 4174, screenshot: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      index += 1;
      return argv[index];
    };

    switch (argument) {
      case "--origin":
        options.origin = next() ?? "";
        break;
      case "--key":
        options.key = next() ?? "";
        break;
      case "--port":
        options.port = Number(next());
        break;
      case "--app-port":
        options.appPort = Number(next());
        break;
      case "--screenshot":
        options.screenshot = next() ?? "";
        break;
      case "--help":
        console.log(
          "usage: phase2-check.mjs --origin <the app's origin> --key <public_key> [--port 4173] [--app-port 4174] [--screenshot <file>]",
        );
        process.exit(0);
        break;
      default:
        console.error(`phase2-check: unknown argument "${argument}".`);
        process.exit(2);
    }
  }

  if (!options.origin || !options.key) {
    console.error("phase2-check: --origin and --key are both needed.");
    process.exit(2);
  }

  return options;
}

/**
 * Playwright, from wherever it is.
 *
 * It is not a dependency of this repo — the check is a script, not a package —
 * so it is looked for in the places it can be: an explicit path, the module
 * resolver, and the npx cache.
 *
 * @returns {Promise<any>}
 */
async function loadPlaywright() {
  const attempts = [];

  if (process.env.PLAYWRIGHT_MODULE) {
    attempts.push(process.env.PLAYWRIGHT_MODULE);
  }

  attempts.push("playwright");

  const cache = path.join(os.homedir(), ".npm", "_npx");
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache)) {
      attempts.push(path.join(cache, entry, "node_modules", "playwright", "index.mjs"));
    }
  }

  for (const attempt of attempts) {
    try {
      const loaded = await import(attempt);
      if (loaded.chromium) {
        return loaded;
      }
    } catch {
      // Try the next one.
    }
  }

  console.error(
    "phase2-check: Playwright was not found. Install it with\n" +
      "  npm i playwright && npx playwright install chromium\n" +
      "or point PLAYWRIGHT_MODULE at the module.",
  );
  process.exit(2);
  return undefined;
}

/** A hex colour as the browser writes it, so a rendered colour can be compared. */
function hexToRgb(hex) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) {
    return null;
  }

  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : match[1];

  const value = Number.parseInt(digits, 16);

  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/** Waits for something to become true. */
async function waitFor(find, what, timeout = STEP_TIMEOUT) {
  const deadline = Date.now() + timeout;

  for (;;) {
    const value = await find();
    if (value) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The origin of a URL, or null when the value is not one. */
function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * The src of the install snippet in a page's HTML, or null when there is none.
 *
 * The HTML carries the snippet as text, so the entities the renderer escapes
 * are decoded first and the snippet reads the way the browser shows it.
 */
function snippetSrcFromHtml(html) {
  const decoded = html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

  const match = SCRIPT_SRC_IN_HTML.exec(decoded);
  return match ? match[1] : null;
}

/**
 * The install snippet on the page, as the browser rendered it.
 *
 * The install section's rendered text is read, and the snippet is found in
 * it: the text of a script element is not rendered, so the only script tag in
 * the rendered text is the one the page shows. The whole page is read when
 * the section is not there.
 */
async function readRenderedSnippet(page) {
  const install = page.locator("#install");
  const text =
    (await install.count()) > 0
      ? await install.innerText()
      : await page.locator("body").innerText();

  const match = SCRIPT_TAG.exec(text);

  return match ? { snippet: match[0].trim(), src: match[1] } : null;
}

/**
 * The app's own landing page, and the origin its snippet names.
 *
 * The landing page is public and static, so reading it needs no session and
 * no credential — the protection's header is all it takes. The page is
 * opened in a browser of its own: the browser that loads the widget must not
 * carry the header, or the browser would send a preflight the config route
 * does not answer.
 *
 * The snippet is read from the **rendered** page, not from the HTML. The
 * server's HTML carries the fallback — the env var, or `your-app.example` —
 * and the browser fills in the origin the page was served from. So the page
 * is read until the snippet differs from the server's, which is the moment
 * the browser has filled it in. The wait ends early when the snippet already
 * names this deployment: there is nothing left to fill in.
 *
 * @returns {Promise<{ snippet: string, src: string, origin: string | null } | null>}
 */
async function readAppSnippet(browser, origin, deploymentOrigin, headers) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 720 },
    extraHTTPHeaders: headers,
  });

  try {
    const page = await context.newPage();

    // The server's own HTML, and the fallback that is in it.
    let serverSrc = null;
    try {
      const response = await fetch(`${origin}/`, { headers });
      serverSrc = snippetSrcFromHtml(await response.text());
    } catch {
      // The page below has the last word.
    }

    await page.goto(`${origin}/`, { waitUntil: "load", timeout: STEP_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: APP_PAGE_IDLE_TIMEOUT }).catch(() => {});

    const deadline = Date.now() + APP_SNIPPET_TIMEOUT;
    let last = null;

    for (;;) {
      const rendered = await readRenderedSnippet(page);

      if (rendered) {
        last = rendered;
        const reported = originOf(rendered.src);

        if ((serverSrc !== null && rendered.src !== serverSrc) || reported === deploymentOrigin) {
          return { ...rendered, origin: reported };
        }
      }

      if (Date.now() >= deadline) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return last ? { ...last, origin: originOf(last.src) } : null;
  } finally {
    await context.close();
  }
}

/** The checks the phase says must hold, and what the browser rendered. */
class Report {
  constructor() {
    this.failures = [];
    this.markers = [];
  }

  /** Records what the browser rendered. */
  marker(name, html) {
    this.markers.push({ name, html });
  }

  /** Checks one thing. */
  check(name, ok, detail) {
    if (!ok) {
      this.failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    }
    return ok;
  }

  /** Records something that went wrong before a check could be made. */
  error(error) {
    this.failures.push(error instanceof Error ? error.message : String(error));
  }
}

/**
 * The loader keeps everything in a **closed** shadow root, so no selector can
 * reach the button: `host.shadowRoot` is null and the browser automation's
 * locators only pierce open roots. The browser's own protocol pierces a
 * closed one, so the button is read and clicked through it.
 */
async function readWidget(client, hostSelector) {
  const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });

  const nodes = [];
  const walk = (node) => {
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
    for (const child of node.shadowRoots ?? []) walk(child);
  };
  walk(root);

  const attribute = (node, name) => {
    const attributes = node.attributes ?? [];
    const index = attributes.indexOf(name);
    return index === -1 ? null : attributes[index + 1];
  };

  const host = nodes.find((node) => attribute(node, "id") === hostSelector);

  if (!host) {
    return null;
  }

  const shadow = (host.shadowRoots ?? [])[0];

  if (!shadow) {
    return null;
  }

  const button = await client.send("DOM.querySelector", {
    nodeId: shadow.nodeId,
    selector: "button.btn",
  });

  if (!button.nodeId) {
    return null;
  }

  const outer = await client.send("DOM.getOuterHTML", { nodeId: button.nodeId });
  const { object } = await client.send("DOM.resolveNode", { nodeId: button.nodeId });

  const computed = await client.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration:
      "function () { const style = getComputedStyle(this); return { background: style.backgroundColor, color: style.color }; }",
    returnByValue: true,
  });

  return {
    host,
    shadow,
    buttonObjectId: object.objectId,
    buttonHtml: outer.outerHTML,
    computed: computed.result.value,
    position: attribute(host, "class"),
  };
}

/**
 * The app, in front of the preview.
 *
 * A preview deployment is protected, and the way past the protection is a
 * header — `x-vercel-protection-bypass`. The browser would have to send that
 * header with the config fetch, and a header the browser does not send by
 * itself makes it send a preflight first. The route answers a preflight with
 * `Access-Control-Allow-Headers: Content-Type`, so the browser refuses the
 * request and the widget never gets its config.
 *
 * So the app is put behind a local proxy: the proxy adds the header, where
 * there is no preflight to answer, and the browser talks to the proxy on its
 * own port. The page is served from a different port still, so the widget is
 * on another origin than the page, which is the thing the check is about.
 *
 * The proxy is not the app: it forwards every request and every answer, the
 * CORS headers included.
 *
 * It follows the redirects itself and keeps the cookies. A Clerk development
 * instance answers a document request with a redirect to its handshake, which
 * redirects back with a token in the URL; the app answers that with the
 * cookie that says the dev browser is set up, and then asks for the page
 * again. Following the chain here, with the cookies kept, is what makes the
 * panel load: in the browser the way back would leave the proxy and hit the
 * protection's login page, which cannot be framed.
 */
async function startAppProxy(targetOrigin, port, bypassHeaders) {
  /** The cookies the upstream set, by name, with the host they belong to. */
  const jar = new Map();

  /** The cookies to send to a host. */
  function cookiesFor(host) {
    const pairs = [];
    for (const [name, cookie] of jar) {
      if (host === cookie.host || host.endsWith(`.${cookie.host}`)) {
        pairs.push(`${name}=${cookie.value}`);
      }
    }
    return pairs.join("; ");
  }

  /** Keeps what the upstream set, and forgets what it cleared. */
  function remember(response, host) {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const pair = raw.split(";")[0];
      const index = pair.indexOf("=");
      if (index === -1) {
        continue;
      }
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "" || /expires=thu, 01 jan 1970/i.test(raw)) {
        jar.delete(name);
      } else {
        jar.set(name, { value, host });
      }
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const headers = { ...bypassHeaders };
      for (const [name, value] of Object.entries(request.headers)) {
        if (name === "host" || value === undefined) {
          continue;
        }

        // A Clerk development instance answers a browser navigation with a
        // redirect to its handshake, which is there to set up the dev browser.
        // The answer the app gives does not depend on these headers, so they
        // are left out of the request the proxy makes.
        if (name.startsWith("sec-fetch-")) {
          continue;
        }

        headers[name] = value;
      }

      let url = `${targetOrigin}${request.url}`;
      let upstream = null;

      for (let hop = 0; hop < 10; hop += 1) {
        const target = new URL(url);
        const cookie = cookiesFor(target.host);
        if (cookie) {
          headers.cookie = cookie;
        }

        upstream = await fetch(url, {
          method: request.method,
          headers,
          redirect: "manual",
          body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        });

        remember(upstream, target.host);

        const location = upstream.headers.get("location");
        if (upstream.status >= 300 && upstream.status < 400 && location) {
          url = new URL(location, url).toString();
          continue;
        }
        break;
      }

      const out = {};
      upstream.headers.forEach((value, name) => {
        // Hop-by-hop headers, the ones that describe a body this proxy is about
        // to write itself, and the encoding: the body has already been decoded.
        if (
          ![
            "connection",
            "keep-alive",
            "transfer-encoding",
            "content-length",
            "content-encoding",
          ].includes(name)
        ) {
          out[name] = value;
        }
      });

      response.writeHead(upstream.status, out);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(`the proxy could not reach ${targetOrigin}: ${error.message}`);
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  return server;
}

/** Runs the check. */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const playwright = await loadPlaywright();
  const report = new Report();

  const origin = options.origin.replace(/\/+$/, "");
  const key = options.key;
  const deploymentOrigin = originOf(origin);

  // The app, in front of the preview: a protected deployment cannot be read
  // by a browser on another origin, and the proxy is where the protection's
  // header is added.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const bypassHeaders = bypass ? { "x-vercel-protection-bypass": bypass } : {};

  // The browser that reads the app's own landing page carries the cookie as
  // well: the page is a document request, and the protection answers that
  // with its handshake.
  const browserHeaders = bypass
    ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" }
    : {};

  const appProxy = await startAppProxy(origin, options.appPort, bypassHeaders);
  const appOrigin = `http://127.0.0.1:${options.appPort}`;

  // The page, as the browser will get it.
  const template = await readFile(TEMPLATE, "utf8");
  const pageHtml = template
    .replaceAll("{{WIDGET_ORIGIN}}", appOrigin)
    .replaceAll("{{PUBLIC_KEY}}", key);

  // The config route, asked directly: the key has to belong to a project. A
  // preview deployment is protected, so this call needs the bypass header too —
  // without it the answer is the protection page, which is a 200 and not the
  // route's answer.
  let configStatus = 0;
  let configText = "";
  try {
    const response = await fetch(`${origin}/api/widget/config?key=${encodeURIComponent(key)}`, {
      headers: bypassHeaders,
    });
    configStatus = response.status;
    configText = await response.text();
  } catch (error) {
    report.error(`the config route could not be asked: ${error.message}`);
  }

  report.check(
    "the config route answers 200 for the key",
    configStatus === 200,
    `it answered ${configStatus}`,
  );

  let config = null;
  try {
    config = JSON.parse(configText);
  } catch {
    // Not JSON: the answer is not the route's answer.
  }

  const settings = config && typeof config === "object" ? config.config : null;
  report.check("the config route answers a config", settings !== null, configText.slice(0, 200));

  // The page, on another origin.
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pageHtml);
  });

  await new Promise((resolve) => server.listen(options.port, "127.0.0.1", resolve));

  const servedFrom = `http://127.0.0.1:${options.port}/`;

  const browser = await playwright.chromium.launch();

  // The app's own landing page, and the snippet the owner copies. The snippet
  // has to name the deployment under test: a snippet that names another
  // deployment is no use, and no check of the widget can tell.
  let appSnippet = null;
  let appSnippetError = null;

  try {
    appSnippet = await readAppSnippet(browser, origin, deploymentOrigin, browserHeaders);
  } catch (error) {
    appSnippetError = error instanceof Error ? error.message : String(error);
  }

  if (appSnippetError) {
    report.error(`the app's own landing page could not be read: ${appSnippetError}`);
  } else if (!appSnippet) {
    report.check(
      "the app's own landing page shows an install snippet",
      false,
      "no snippet was found on the page",
    );
  } else {
    report.marker("The app's own install snippet, as the browser rendered it", appSnippet.snippet);

    report.check(
      "the app's own landing page shows a snippet for this deployment",
      appSnippet.origin === deploymentOrigin,
      appSnippet.origin
        ? `the app's page reported ${appSnippet.origin}, the deployment under test is ${deploymentOrigin}`
        : `the snippet's src is "${appSnippet.src}", which is not an origin`,
    );
  }

  // No bypass header from the browser: the proxy adds it. A header the browser
  // does not send by itself would make it send a preflight first, and the
  // route's preflight answer does not allow it.
  const context = await browser.newContext({ viewport: { width: 375, height: 720 } });
  const page = await context.newPage();

  const client = await context.newCDPSession(page);

  let screenshot = options.screenshot;
  if (!screenshot) {
    const directory = path.join(os.tmpdir(), "askwell-phase2-check");
    await mkdir(directory, { recursive: true });
    screenshot = path.join(directory, "widget.png");
  }

  try {
    await page.goto(servedFrom, { waitUntil: "domcontentloaded" });

    // The button. The host is looked for as "attached": it is in the light DOM
    // even though what is inside it is not reachable from the page.
    const host = await waitFor(() => page.$("#askwell-widget"), "the widget host to appear").catch(
      () => null,
    );

    const widget = host ? await readWidget(client, "askwell-widget") : null;

    if (!report.check("the widget renders a button", widget !== null)) {
      throw new Error(
        "the widget rendered no button: an unknown key renders nothing, and that is correct — but this key must belong to a project",
      );
    }

    report.marker("The button, as the browser rendered it", widget.buttonHtml);
    report.marker(
      "The host of the widget, as the browser rendered it",
      await client
        .send("DOM.getOuterHTML", { nodeId: widget.host.nodeId })
        .then((r) => r.outerHTML),
    );

    if (settings) {
      report.check(
        "the button carries the label of the config",
        widget.buttonHtml.includes(settings.label),
        `the config says "${settings.label}"`,
      );
      report.check(
        "the button carries the colour of the config",
        widget.computed.background === hexToRgb(settings.buttonColor),
        `the config says ${settings.buttonColor}, the button is ${widget.computed.background}`,
      );
      report.check(
        "the button sits where the config says",
        widget.position === settings.position,
        `the config says ${settings.position}, the host says ${widget.position}`,
      );
    }

    // The click.
    await client.send("Runtime.callFunctionOn", {
      objectId: widget.buttonObjectId,
      functionDeclaration: "function () { this.click(); }",
    });

    const panelFrame = await waitFor(
      () => page.frames().find((candidate) => candidate.url().includes("/embed?key=")),
      "the panel frame",
    ).catch(() => null);

    if (!report.check("the click opens the panel", panelFrame !== null)) {
      throw new Error("the click opened no panel");
    }

    // The panel has to be *on the page*, not only in the document: a frame that
    // sits outside the viewport is a panel the visitor never sees.
    const panelNode = await client.send("DOM.querySelector", {
      nodeId: widget.shadow.nodeId,
      selector: "iframe.frame",
    });

    if (panelNode.nodeId) {
      const { object } = await client.send("DOM.resolveNode", { nodeId: panelNode.nodeId });
      const geometry = await client.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration:
          "function () { const r = this.getBoundingClientRect(); const s = getComputedStyle(this); return { x: r.x, y: r.y, width: r.width, height: r.height, position: s.position, bottom: s.bottom, right: s.right }; }",
        returnByValue: true,
      });

      const box = geometry.result.value;
      const viewport = page.viewportSize();
      const onScreen =
        box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height;

      report.check(
        "the panel is on the screen",
        onScreen,
        `the frame sits at x ${Math.round(box.x)}, y ${Math.round(box.y)}, ${Math.round(box.width)} by ${Math.round(box.height)} — the screen is ${viewport.width} by ${viewport.height}`,
      );

      report.marker("The panel's frame, as the browser placed it", JSON.stringify(box));
    }

    const panel = panelFrame.locator("[data-open]");
    await panel.waitFor({ timeout: STEP_TIMEOUT });

    report.marker(
      "The panel, as the browser rendered it",
      await panel.evaluate((node) => node.outerHTML),
    );

    const empty = panelFrame.locator('[data-state="empty"]');
    report.check(
      "the panel shows its first state",
      (await empty.count()) > 0,
      "the empty state is not there",
    );

    if (settings && settings.headerText) {
      const header = await panelFrame.locator("h1").first().innerText();
      report.check(
        "the panel carries the header of the config",
        header.trim() === String(settings.headerText).trim(),
        `the config says "${settings.headerText}", the panel says "${header.trim()}"`,
      );
    }

    // The question, and the mock reply.
    const input = panelFrame.locator('input[aria-label="Your question"]');
    await input.fill(QUESTION);
    await input.press("Enter");

    const reply = panelFrame.locator('p[data-role="bot"]');
    await reply.waitFor({ timeout: STEP_TIMEOUT });

    report.marker(
      "The exchange, as the browser rendered it",
      await panelFrame
        .locator('[data-open] div[class*="gap-3"]')
        .first()
        .evaluate((node) => node.outerHTML),
    );

    const visitorText = await panelFrame.locator('p[data-role="visitor"]').first().innerText();
    report.check("the visitor's message is shown", visitorText.trim() === QUESTION, visitorText);
  } catch (error) {
    report.error(error);
  } finally {
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);
    await browser.close();
    server.close();
    appProxy.close();
  }

  // The report: the markers first, the screenshot second.
  console.log("");
  console.log("# The Phase 2 end-when");
  console.log("");
  console.log(`- The page was served from **${servedFrom}**.`);
  console.log(
    `- The widget was loaded from **${appOrigin}/widget.js** — another origin than the page.`,
  );
  console.log(
    `- That origin is a local proxy in front of **${origin}**, the deployment under test.`,
  );
  console.log(`- The key was **${key}**.`);
  console.log(`- The config route answered **${configStatus}**: ${configText.slice(0, 300)}`);

  if (appSnippetError) {
    console.log(`- The app's own landing page could not be read: **${appSnippetError}**.`);
  } else {
    console.log(
      `- The app's own landing page reported **${appSnippet?.origin ?? "no snippet at all"}** as the snippet's origin.`,
    );
  }

  console.log(`- The deployment under test is **${deploymentOrigin}**.`);
  console.log("");

  for (const marker of report.markers) {
    console.log(`## ${marker.name}`);
    console.log("");
    console.log("```html");
    console.log(marker.html);
    console.log("```");
    console.log("");
  }

  console.log("## The screenshot");
  console.log("");
  console.log(`- ${screenshot}`);
  console.log(`- Chromium headless, 375 px wide, on ${servedFrom}.`);
  console.log("");

  if (report.failures.length > 0) {
    console.log("## What did not hold");
    console.log("");
    for (const failure of report.failures) {
      console.log(`- ${failure}`);
    }
    console.log("");
    process.exitCode = 1;
    return;
  }

  console.log("## What held");
  console.log("");
  console.log("- The button rendered with the label, the colour and the position of the config.");
  console.log("- A click opened the panel, and the panel showed its first state.");
  console.log("- The question was shown, and the mock reply came back.");
  console.log("");
}

await main();
