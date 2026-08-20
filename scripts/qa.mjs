/**
 * End-to-end QA pass (PR-14): the checks that only a real browser against a
 * real database can make — login, every screen rendering seeded data, the
 * immutability of an issued invoice, the PDF and the buyer link with no
 * session, the CSV export, a viewer seeing no mutating forms, and no
 * horizontal scroll anywhere at 390 px.
 *
 * It is not part of the pre-push gate: it needs a running server, a seeded
 * database and a browser, none of which belong in a hook. Run it by hand
 * before a release:
 *
 *   npm run db:seed -- --reset
 *   npm run build && npm run start &
 *   npx playwright@1 install-deps 2>/dev/null || true
 *   node scripts/qa.mjs
 *
 * `playwright` is deliberately **not** a dependency of this app — it would
 * add hundreds of megabytes to a Hostinger deploy for a script nobody runs in
 * production. Install it in a scratch directory, or set PLAYWRIGHT_BROWSER to
 * point at a Chromium you already have.
 *
 * Assertions are scoped to rendered elements rather than page text: Next's RSC
 * payload embeds the whole message catalogue in the DOM, so matching against
 * the body would pass for any string in either language (Phase A finding).
 */
// Resolved at runtime so the module can live in a scratch install rather than
// in this app's node_modules: point PLAYWRIGHT_MODULE at it, e.g.
//   PLAYWRIGHT_MODULE=/tmp/qa/node_modules/playwright/index.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const results = [];
const fail = (name, detail) => results.push(`FAIL ${name}: ${detail}`);
const pass = (name) => results.push(`ok   ${name}`);

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

// Scope assertions to rendered elements: the RSC flight payload embeds the
// whole message catalogue, so matching on body text passes for anything.
const mainText = async (target = page) => {
  // Wait out the loading skeleton, which is now a real render state.
  await target
    .locator('[role="status"][aria-busy="true"]')
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
  return (await target.locator("main").innerText()).replace(/\s+/g, " ");
};

// The public landing page, before any session exists (decision 22).
await page.goto(BASE, { waitUntil: "networkidle" });
const landing = await mainText();
if (!/WhatsApp/.test(landing)) fail("landing", landing.slice(0, 200));
else pass("landing renders with no session");

const landingCtas = await page.locator("a[data-ev]").count();
if (landingCtas < 2) fail("landing CTAs", `${landingCtas} tagged CTAs`);
else pass(`landing CTAs tagged for analytics (${landingCtas})`);

const landingCookies = await context.cookies();
if (landingCookies.length > 0) fail("landing cookies", JSON.stringify(landingCookies.map((c) => c.name)));
else pass("landing sets no cookies");

const landingOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (landingOverflow > 1) fail("landing overflow at 390px", `${landingOverflow}px`);
else pass("no horizontal scroll at 390px /");

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@sanblas.com.py");
await page.fill("#password", "FerreteriaDemo2026");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
pass("login");

let text = await mainText();
if (!/vencid/i.test(text)) fail("dashboard overdue", text.slice(0, 300));
else pass("dashboard shows overdue work");
if (!/₲/.test(text)) fail("dashboard money", text.slice(0, 200)); else pass("dashboard money formatting");

for (const [name, path, expect] of [
  ["customers", "/admin/clientes", /Talleres Guaraní/],
  ["products", "/admin/productos", /Chapa galvanizada/],
  ["quotes", "/admin/presupuestos", /Constructora/],
  ["invoices", "/admin/facturas", /001-001-0000001/],
  ["payments", "/admin/pagos", /Transferencia|Efectivo/],
  ["reports", "/admin/informes", /IVA/],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const body = await mainText();
  if (!expect.test(body)) fail(name, body.slice(0, 300));
  else pass(name);
}

// An issued invoice must be read-only.
await page.goto(`${BASE}/admin/facturas`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "001-001-0000001" }).click();
await page.waitForURL(/\/admin\/facturas\/\d+$/, { timeout: 15000 });
await page.waitForLoadState("networkidle");
const invoice = await mainText();
if (/Editar el borrador/.test(invoice)) fail("immutability", "edit form shown on an issued invoice");
else pass("issued invoice is read-only");
if (!/HISTORIAL/i.test(invoice)) fail("history panel", invoice.slice(-300)); else pass("history panel");

// PDF of an issued invoice.
const invoiceUrl = page.url();
const id = invoiceUrl.split("/").pop();
const pdf = await context.request.get(`${BASE}/admin/facturas/${id}/pdf`);
const pdfBody = await pdf.body();
if (pdf.status() !== 200 || pdfBody.subarray(0, 4).toString() !== "%PDF") {
  fail("invoice pdf", `${pdf.status()} ${pdfBody.subarray(0, 20).toString()}`);
} else pass(`invoice pdf (${pdfBody.length} bytes)`);

// The public buyer link, with no session at all.
const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const publicHref = await page.locator('a:has-text("Abrir el enlace del cliente")').getAttribute("href");
if (!publicHref) fail("public link", "no link rendered");
else {
  const anonPage = await anon.newPage();
  const response = await anonPage.goto(publicHref, { waitUntil: "networkidle" });
  const anonText = (await anonPage.locator("main").innerText()).replace(/\s+/g, " ");
  if (response.status() !== 200 || !/Factura/.test(anonText)) {
    fail("public document", `${response.status()} ${anonText.slice(0, 200)}`);
  } else pass("public document with no session");

  const anonPdf = await anon.request.get(`${publicHref}/pdf`);
  const anonPdfBody = await anonPdf.body();
  if (anonPdf.status() !== 200 || anonPdfBody.subarray(0, 4).toString() !== "%PDF") {
    fail("public pdf", String(anonPdf.status()));
  } else pass("public pdf with no session");
}

// CSV export.
const csv = await context.request.get(`${BASE}/admin/informes/csv?kind=iva&from=2026-01-01&to=2026-12-31`);
const csvText = await csv.text();
if (csv.status() !== 200 || !csvText.includes(";")) fail("csv", `${csv.status()} ${csvText.slice(0, 120)}`);
else pass(`csv export (${csvText.split("\r\n").length - 1} rows)`);

// Viewer must not see mutating forms.
const viewer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const viewerPage = await viewer.newPage();
await viewerPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await viewerPage.fill("#email", "contador@sanblas.com.py");
await viewerPage.fill("#password", "FerreteriaDemo2026");
await viewerPage.click('button[type="submit"]');
await viewerPage.waitForURL(`${BASE}/admin`, { timeout: 15000 });
await viewerPage.goto(`${BASE}/admin/clientes`, { waitUntil: "networkidle" });
const viewerText = (await viewerPage.locator("main").innerText()).replace(/\s+/g, " ");
if (/Agregá el cliente/.test(viewerText)) fail("viewer read-only", "create form offered to a viewer");
else pass("viewer sees no create form");

// Mobile screenshots for the QA pass.
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await page.screenshot({ path: "qa-mobile-dashboard.png", fullPage: true });
await page.goto(`${BASE}/admin/facturas`, { waitUntil: "networkidle" });
await page.screenshot({ path: "qa-mobile-invoices.png", fullPage: true });

// Horizontal overflow check at 390px — the design system's hard rule.
for (const path of ["/admin", "/admin/clientes", "/admin/productos", "/admin/facturas", "/admin/informes", "/admin/presupuestos", "/admin/presupuestos/nuevo", "/admin/pagos", "/admin/ajustes", "/admin/ajustes/timbrados"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const slack = doc.scrollWidth - doc.clientWidth;
    if (slack <= 1) return { slack, culprit: null };
    // Name the widest offender so the fix is not a guessing game.
    let culprit = null;
    let widest = 0;
    for (const element of document.querySelectorAll("main *")) {
      const rect = element.getBoundingClientRect();
      if (rect.right > doc.clientWidth + 1 && rect.width > widest) {
        widest = rect.width;
        culprit = `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)} w=${Math.round(rect.width)}`;
      }
    }
    return { slack, culprit };
  });
  if (overflow.slack > 1) fail(`no horizontal scroll at 390px ${path}`, `${overflow.slack}px ${overflow.culprit}`);
  else pass(`no horizontal scroll at 390px ${path}`);
}

if (errors.length) fail("console/network", errors.slice(0, 3).join(" | "));
else pass("no page errors or 5xx");

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
