# Vayora — Portable All-in-One Personal Climate Comfort Device

**Designed for the Vayu You Live In**

A product launch website for Vayora: a compact, rechargeable device with a carry handle, combining personal air cooling, air purification, humidity management and MosquitoGuard active mosquito protection in one unit you can use at home, at work, while travelling and outdoors.

> This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.
> No performance figures are published: battery run time, noise and mosquito capture effectiveness will be measured in prototype testing.

---

## What's inside

| Page | URL | Job |
|---|---|---|
| Home | `index.html` | Hero ("Your Comfort. Anywhere."), five feature cards, "Comfort Wherever You Go" use cases, "Why Carry Multiple Devices When One Can Do More?", About Us with contact number, inline waitlist |
| Product | `product.html` | Overview, key features, How Vayora works (airflow stepper + interactive four-module view), air purification, cooling, MosquitoGuard technology (section-view diagram and 6-step mechanism), humidity, portability and design, where to use it, specifications, FAQ, waitlist |
| Checkout | `checkout.html` | Customer and address form, live order summary with quantity, Razorpay payment, Payment Unsuccessful screen with retry |
| Order confirmation | `order-success.html` | Shown only for orders the server has confirmed as paid |
| Unsubscribe | `unsubscribe.html` | Email field that sends a waitlist removal request; linked from both waitlist forms |
| Pricing | `pricing.html` | ₹4,999 price card, what the price covers, path to early access, price FAQ, "Be Among the First to Experience Vayora." |

**Checkout:** Buy Now buttons (Product page and Pricing card) lead to a full checkout backed by a Supabase backend (Razorpay order creation, signature verification, webhook, orders database, Brevo or Resend emails). It stays switched off until you configure it: see **[CHECKOUT.md](CHECKOUT.md)** for exactly what to set up.

**Interactive features**
- **Header:** rotating announcement strip with arrows and quick links; Home, Product (mega menu by section, function and setting), Features, About Us, Pricing, Contact and a Join Waitlist button; a responsive menu below 1100 px with an expandable sub-menu.
- **Site search:** opens with the Search button, <kbd>/</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>. It searches every section, feature and FAQ, with suggestions, highlighted matches and keyboard navigation.
- **Hero carousel:** 3 slides, starting on the core promise. It pauses on hover and focus, has a pause button, and doesn't autoplay for reduced-motion users.
- **Feature cards:** each of the five Home cards opens the matching Product section.
- **MosquitoGuard:** active attraction and capture module on the side of the device (scent lure, UV-A light, dedicated suction fan, one-way funnel, removable mesh chamber), with its own airflow kept separate from cooling.
- Interactive airflow stepper, clickable exploded product diagram, and FAQ accordions (deep-linkable, for example `product.html#faq-ac`).
- A floating Help button with search, FAQs, call, MosquitoGuard, waitlist and back-to-top.
- Two waitlist forms (a dialog on every page and an inline section on Home), each with Name and Email only and validation. Sign-ups are emailed to the Vayora team; the confirmation shows only after the email service accepts them.
- About Us section with mission, vision and a tap-to-call contact number, a light footer, and `prefers-reduced-motion` respected throughout.
- Product photos and animations supplied by the brand owner (black and silver finish): the table photo (Home hero, Product overview, checkout and menu close-ups, link preview), the picnic photo (Home Outdoors slide, Portability) and two clips from the studio video in `src/assets/video/` (Home Design slide; "How Vayora works"). The studio clips use only the fully assembled shots and the unlabelled airflow shot. The supplied spec infographic, filter-stack picture and the cream-coloured video are not used. Originals are kept in `media-source/`.
- SVG drawings in `src/art/`: use-case scenes and comparison graphic (device redrawn in black and silver), filter, cooling and humidity diagrams, the four-module internal view and the MosquitoGuard section view.

**Design:** colours taken from the logo (teal, blue and navy on white) (tokens at the top of `styles.css`), with teal for actions and icons, blue for headings, and teal-to-blue gradients. The retail-style layout (announcement strip, mega menu, carousel, category tiles, tabs, help widget) follows familiar Indian consumer-electronics sites.

**Archived:** the earlier Consumer Behaviour strategy page is kept in `archive/inside.html` but is no longer built or linked.

**Quality checks run before delivery:**
- 145 automated functional tests covering:
  - every nav and mega-menu link from every page, and every waitlist button
  - both waitlist forms: validation, honest confirmation, storage, duplicates
  - search, carousel, module view and deep links
  - MosquitoGuard steps, diagram labels and effectiveness note
  - FAQ, stepper and exploded view
  - Help widget, mobile menu and the 404 page
  - a content sweep for window/mounting wording, "proposed"/status labels, prices and invented figures
- 14 tests on the single-file preview.
- 43 browser tests of the checkout (success, failed, cancelled, forged signature, retries, double clicks, email reporting, mobile layout) against the real backend code and a real Postgres, with Razorpay simulated.
- 18 backend tests of the order functions on a real Postgres (validation, server-side pricing, duplicate prevention, signature and amount checks, webhooks, emails sent exactly once).
- All internal links and anchors verified, with zero console errors.
- Zero axe-core accessibility violations (WCAG 2 A/AA plus best practice) at desktop and mobile widths, including with menus and search open.
- No horizontal overflow at 390 px, 768 px or 1440 px, and the full desktop nav fits from 1101 px.

---

## Quick start

You need **Node.js 18 or newer**. There are no npm dependencies to install.

```bash
npm run dev        # builds the site, then serves it at http://localhost:4173
```

Other commands:

```bash
npm run build      # writes dist/ (upload-ready site) and preview/index.html (single file)
npm run serve      # serves the existing dist/ at http://localhost:4173
npm run check      # builds, then verifies every internal link, asset and #anchor
```

Prefer not to run anything? Open **`preview/index.html`** directly in a browser. It's the whole site in one self-contained file (fonts and images included) that switches pages with `#product` and `#pricing`.

You can also open `dist/index.html` directly: every link is relative and the fonts are embedded, so it works straight from disk.

---

## Project structure

```
vayora/
├── build.mjs                 Zero-dependency builder (partials, icons, artwork, links)
├── serve.mjs                 Tiny local server with clean-URL support
├── scripts/check-links.mjs   Link/anchor checker for dist/
├── src/
│   ├── site.json             Page list: slug, route, <title>, meta description
│   ├── pages/                Page content (home, product, pricing, 404)
│   ├── partials/             layout, announce, header (mega menus), footer, search,
│   │                         help, waitlist-modal, logo
│   ├── art/                  Hand-drawn SVG illustrations (inlined at build time)
│   └── assets/
│       ├── css/styles.css    Design tokens + all component styles
│       ├── js/config.js      Site settings (waitlist backend lives here)
│       ├── js/waitlist-store.js  Sends sign-ups to the configured endpoint (FormSubmit) or, if none, keeps them in the browser
│       ├── js/main.js        All interactions
│       ├── icons/            Lucide icons (ISC licence), inlined at build time
│       ├── fonts/            Inter + Manrope variable fonts (SIL OFL), self-hosted
│       └── img/              favicon.svg, og-image.png (social share image)
├── supabase/                 Checkout backend: orders table, Edge Functions, tests (see CHECKOUT.md)
├── CHECKOUT.md               Checkout setup guide
├── deploy/README.md          GitHub Pages + custom-domain guide (used when a domain is set)
├── dist/                     ← generated: upload the CONTENTS of this folder
├── preview/index.html        ← generated: single-file version
├── netlify.toml, vercel.json Hosting configs
└── .github/workflows/pages.yml  GitHub Pages deployment
```

### How the build works

Pages in `src/pages/` are plain HTML with a few tokens:

| Token | Becomes |
|---|---|
| `{{> header}}` | contents of `src/partials/header.html` |
| `{{icon:wind}}` | inline Lucide SVG from `src/assets/icons/wind.svg` |
| `{{art:product-hero}}` | inline illustration from `src/art/product-hero.svg` |
| `{{link:product#faq}}` | `product.html#faq` in `dist/`, `#faq` in the preview |
| `{{current:product}}` | `aria-current="page"` on the matching nav link |

**Site address and domain** live in `src/site.json` as `siteUrl`, which is empty by default. Without one, the site is built for a github.io address. If you own a domain, set `"siteUrl": "https://yourdomain.com"` (or run `SITE_URL=https://yourdomain.com node build.mjs`). The build then adds canonical links, absolute share-image URLs, `sitemap.xml` and a `CNAME` file, and uses `deploy/README.md` as the package guide instead of `deploy/README-github-io.md`.

**Search** is generated automatically at build time (`assets/js/search-index.js`). Every `<section>`, `<article>` or `<details>` with an `id` becomes a result: its heading is the title and its first paragraph the snippet. To help a section match extra words, add `data-keywords="…"` to it.

To **add a page**: create `src/pages/new.html`, add an entry to `src/site.json`, add a nav link in `src/partials/header.html`, then `npm run build`.

To **change colours or type**, edit the tokens at the top of `src/assets/css/styles.css`.

---

## The waitlist form

There are two forms: the dialog opened by every "Join Waitlist" button, and the inline section at the bottom of Home. Each collects **Name** and **Email** only, with inline validation, an error summary, duplicate-email detection and a confirmation screen.

### Where sign-ups go

Sign-ups are emailed to **sayantani.pgpm27g@greatlakes.edu.in** through [FormSubmit](https://formsubmit.co), a free form-to-email service (set in `src/assets/js/config.js` as `waitlistEndpoint`). Each email has the subject "New Vayora waitlist sign-up: <name>", a table with the name, email, time and page, and the subscriber's address as reply-to. No pre-orders or payments are taken.

**One-time activation (required).** The first sign-up on the live site makes FormSubmit send an "Activate Form" email to that address. Click the link once. Until then, sign-ups are held and visitors see "We couldn't add you to the waitlist just now", never a false confirmation. The confirmation ("You're on the waitlist") appears only when FormSubmit reports that the sign-up was accepted.

**Unsubscribe requests.** The waitlist forms link to `unsubscribe.html`. A request arrives in the same inbox with the subject "Vayora waitlist: unsubscribe request from <email>". Remove that address from your list by hand; the site only passes the request on.

**Optional: hide the address.** After activating, FormSubmit gives a random-string alias for the address. Put it in `waitlistEndpoint` in place of the email so the address no longer appears in the page source.

**Notes:** a hidden spam-trap field is sent with every sign-up. The browser remembers addresses it has already sent so the same person isn't sent twice from one device. To go back to a browser-only prototype, set `waitlistEndpoint: null`.

### Connecting a real backend

To use a different service instead, edit `src/assets/js/config.js`, set `waitlistEndpoint`, then rebuild. Entries are POSTed as JSON:

```json
{ "name": "…", "email": "…", "joinedAt": "ISO date", "source": "/pricing.html" }
```

**Option A: Formspree (no code).** Create a form at formspree.io and paste its endpoint:

```js
waitlistEndpoint: 'https://formspree.io/f/your-form-id',
```

**Option B: Google Sheets via Apps Script (free).** In a Google Sheet: *Extensions → Apps Script*, paste the script below, then *Deploy → New deployment → Web app*, with access set to *Anyone*. Copy the URL.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSheet().appendRow([d.joinedAt, d.name, d.email, d.source]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

```js
waitlistEndpoint: 'https://script.google.com/macros/s/…/exec',
waitlistContentType: 'text/plain',   // Apps Script needs this
```

**Option C: your own API.** Any endpoint that accepts a JSON POST and returns a 2xx status works.

Before collecting real personal data, add a short privacy notice explaining what's collected and how to request deletion.

---

## Deploying publicly

`dist/` is ready for **GitHub Pages**. Upload its contents to a public repository, then go to Settings → Pages → Deploy from a branch → `main` / root. The site appears at `https://<username>.github.io/<repo>/`. The step-by-step guide is `dist/README.md` (from `deploy/README-github-io.md`).

Other hosts (Netlify, Vercel, Cloudflare Pages) are covered in [DEPLOY.md](DEPLOY.md). To have GitHub build from this source repository instead, use `.github/workflows/pages.yml` with *Source: GitHub Actions*.

## Content and credibility rules

The copy follows the brief's credibility rules. It contains no testimonials, sales figures, certifications, filtration efficiency figures, battery life, cooling temperatures, humidity-reduction percentages or disease-prevention claims, and it doesn't claim MosquitoGuard attracts every species or removes every mosquito: effectiveness depends on species, conditions, lure formulation and prototype testing. Features are described without status labels.

---

## Credits and licences

- Logo: the official Vayora logo supplied by the brand owner. `src/assets/img/brand/` holds versions cut from that image without redrawing: `vayora-logo.webp` (symbol and wordmark, used in the header, hero and footer) and `vayora-logo-tagline.webp` (full logo with tagline). The favicons (`favicon-32.png`, `icon-192.png`, `apple-touch-icon.png`) use the airflow symbol from the same image. Replace these files if a vector (SVG) master becomes available.
- Illustrations and product renders: original SVG artwork made for this project, coloured to match the logo.
- Icons: [Lucide](https://lucide.dev) (ISC licence), `src/assets/icons/LICENSE-lucide.txt`.
- Fonts: Inter and Manrope (SIL Open Font License), `src/assets/fonts/`.

© Vayora. This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.

## Customer reviews

The Product page has a **Customer ratings and reviews** section (`product.html#reviews`). It shows only reviews you publish. Nothing is made up, so until you add one it shows "No reviews yet" and a **Write a review** button.

**When a customer writes a review**, it is emailed to the waitlist inbox (sayantani.pgpm27g@greatlakes.edu.in) with the subject "New Vayora review: 4/5 from <name>". The customer is told it will appear after it's checked. Nothing goes on the site automatically.

**To publish a review**, open `assets/js/reviews-data.js` and add one line inside the brackets, copying the customer's words exactly:

```js
window.VAYORA_REVIEWS = [
  { name: 'Asha K.', city: 'Kolkata', rating: 5, title: 'Great on my desk', text: 'Their review, word for word.', date: '2026-12-01' },
];
```

- Add `verified: true` only if that person's order is marked paid in your Orders table.
- The average, the count and the star bars update by themselves.
- Only publish reviews from people who have really used Vayora and ticked the box agreeing to publication. Don't write or edit reviews yourself.
- If your repository builds from source (the `src` folder), make the same edit in `src/assets/js/reviews-data.js` too.

## Demo checkout (while payments aren't connected)

Until `checkout.apiBase` is set in `assets/js/config.js`, the checkout runs as a **clearly labelled demo**:

- Visitors choose **UPI, Credit Card, Debit Card or Net Banking** and see the details screen for that method, filled with sample data (a sample UPI ID, test card numbers, a list of banks). The fields are read-only, so no real card, UPI or bank details can be typed in.
- A yellow note says "Demo checkout – no money is taken".
- **Pay Now** shows "Processing demo payment…", then "Demo payment successful – Booking taken", then a **Booking Taken!** page. That page shows "Time to enjoy breezy air!", "Get your product delivered in 7 days" with the expected date, and the booking details, and it is marked "Demo – no money was taken".
- Nothing is sent anywhere: no order is saved, no email goes out and nothing ships.

The demo switches itself off as soon as you connect Razorpay (set `apiBase`). From then on, customers pay in Razorpay's real window and see the real confirmation page, which also shows the happy message and the 7-day delivery date. To turn the demo off before that, set `demoPayments: false`. To change the delivery promise, edit `deliveryDays` (7).
