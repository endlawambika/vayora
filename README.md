# Vayora website: ready for GitHub Pages

This folder is the complete Vayora website, written in plain HTML, CSS and JavaScript. It needs no build step, framework or server code, and nothing in it depends on Claude or any other platform. Upload these files to a GitHub repository and it goes live at a free GitHub address:

**`https://<your-username>.github.io/<repository-name>/`**

> This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.

---

## What's in this folder

```
index.html          Home
product.html        Product
pricing.html        Pricing
checkout.html       Checkout (Buy Now)
order-success.html  Order confirmation
unsubscribe.html    Leave the waitlist
warranty.html       Warranty, replacement and servicing
404.html            Shown for any address that doesn't exist
.nojekyll           Tells GitHub Pages to publish files exactly as they are (hidden file, optional)
robots.txt          Search engine instructions
README.md           This guide
assets/
  css/styles.css    All styles, with the Inter and Manrope fonts embedded
  js/config.js      Settings: where waitlist sign-ups are sent
  js/waitlist-store.js   Sends sign-ups to the waitlist email service
  js/search-index.js     Data for the site search
  js/main.js        All interactions (menus, search, carousel, diagrams, forms…)
  js/checkout.js    Checkout, Razorpay payment window and order confirmation
  img/              Favicon and link-preview image (illustrations are built into the pages)
  fonts/            Font licences (SIL Open Font License)
```

All links are relative (`product.html`, `index.html#contact`), so the site works inside a github.io repository folder, on any domain, and when you open `index.html` straight from your computer.

---

## Part 1: Upload to GitHub

1. **Create a repository.** On github.com, click **New repository**. Give it a name such as `vayora-website`, choose **Public**, and leave "Add a README" unticked. Click **Create repository**.
2. **Upload the files.** Click **uploading an existing file**. Open this folder on your computer, select **everything inside it**, drag it into the browser, and click **Commit changes**.
   - Upload the *contents*, not the folder itself and not the zip. `index.html` must appear at the top level of the repository.
3. **Turn on GitHub Pages.** Go to **Settings → Pages**, and under **Build and deployment** set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**. Click **Save**.
4. **Wait 1–2 minutes**, then refresh **Settings → Pages**. A box appears saying *Your site is live at…* with a **Visit site** button.

Your site is at `https://<your-username>.github.io/<repository-name>/`.

> **Seeing code instead of a website?** That's GitHub showing you the file. Clicking `index.html` in the repository always shows its code. Open the **Visit site** link instead.

**Tip:** name the repository exactly `<your-username>.github.io` and the site appears at `https://<your-username>.github.io/`, with no folder name on the end.

---

## Part 2: Check it works

- [ ] The **Visit site** link opens the Vayora home page with its full design
- [ ] Home, Product, Features, About Us, Pricing and Contact all open from the menu
- [ ] The Product menu opens its drop-down panel, and Search opens with the `/` key
- [ ] The illustrations show on every page, and the phone number link opens your dialler on a mobile
- [ ] Both waitlist forms (the Join Waitlist dialog and the one at the bottom of Home) show errors when empty; after activation (see "The waitlist form"), a filled-in form shows "You're on the waitlist" and the sign-up arrives by email
- [ ] A made-up address such as `…/vayora-website/test` shows the "This page isn't here" page
- [ ] The footer of every page shows the student-project statement

---

## Part 3 (optional): Use a domain you own

You need a domain registered in your name, for example from GoDaddy, Namecheap or Hostinger. Check availability at the registrar first.

1. In the repository, use **Add file → Create new file**. Name it `CNAME` and type your domain on one line (e.g. `yourdomain.com`). Commit.
2. At your registrar's DNS settings, add:

| Type | Host | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA (optional) | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `<your-username>.github.io` |

   Remove any old A/AAAA/CNAME records for `@` and `www`.
3. In **Settings → Pages → Custom domain**, confirm the domain and click **Save**. Wait for "DNS check successful", which can take from minutes to a day.
4. Tick **Enforce HTTPS**.

---

## The waitlist form

Both waitlist forms email each sign-up (name and email) to **sayantani.pgpm27g@greatlakes.edu.in** through FormSubmit, a free form-to-email service.

**Do this once after publishing:** open the live site, join the waitlist yourself, then check that inbox (and spam) for an email from FormSubmit with an **Activate Form** link, and click it. Until you do, sign-ups are held and visitors see "We couldn't add you to the waitlist just now". After activating, join once more to confirm the sign-up email arrives.

**Unsubscribe requests** come to the same inbox with the subject "Vayora waitlist: unsubscribe request from <email>". Remove that address from your list and stop emailing it. The site can only pass the request on; it doesn't delete anything by itself.

After activating, FormSubmit also offers a random-string alias. To keep the address out of the page source, edit `assets/js/config.js` on GitHub (pencil icon) and replace the address in `waitlistEndpoint` with that alias.

To use a different service instead, set `waitlistEndpoint` in `assets/js/config.js`:

**Formspree:** create a form at formspree.io, then set:

```js
waitlistEndpoint: 'https://formspree.io/f/your-form-id',
```

**Google Sheets:** in a Google Sheet, open **Extensions → Apps Script** and paste the script below. Then choose **Deploy → New deployment → Web app**, set **Who has access: Anyone**, and copy the web app URL.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSheet().appendRow([d.joinedAt, d.name, d.email, d.source]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

```js
waitlistEndpoint: 'https://script.google.com/macros/s/…/exec',
waitlistContentType: 'text/plain',
```

The confirmation "You're on the waitlist" appears only after the service accepts the sign-up.

---

## Checkout and payments

Buy Now opens `checkout.html`. Until the payment backend is set up, checkout runs as a labelled demo (see "Demo checkout" below) and no money is taken. To switch it on, follow **CHECKOUT.md** in the source zip (Supabase, Razorpay and an email service). The last step is setting `checkout.apiBase` in `assets/js/config.js`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "404 – There isn't a GitHub Pages site here" | Pages isn't switched on yet (Part 1, step 3), or it's still publishing. Wait 2 minutes. |
| The whole site 404s, but Pages is on | `index.html` is inside a sub-folder. Move the files to the top level of the repository. |
| You see HTML code | You're viewing the file on github.com. Use the **Visit site** link. |
| No colours or layout | The `assets` folder is missing or incomplete. It must sit next to `index.html`, with `css`, `js` and `img` inside. |
| The site jumps to another website | A `CNAME` file points at a domain you don't control. Delete it. |

---

Fonts: Inter and Manrope (SIL Open Font License). Icons: Lucide (ISC licence). Illustrations: original artwork made for this project.

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
