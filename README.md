# ClimaPod website: ready for GitHub Pages

This folder is the complete ClimaPod website, written in plain HTML, CSS and JavaScript. It needs no build step, framework or server code, and nothing in it depends on Claude or any other platform. Upload these files to a GitHub repository and it goes live at a free GitHub address:

**`https://<your-username>.github.io/<repository-name>/`**

> This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.

> **Note on climapod.com:** that domain already belongs to another company (a greenhouse brand), so this version has no custom domain. To use a domain you own later, see Part 3.

---

## What's in this folder

```
index.html          Home
product.html        Product
pricing.html        Pricing
inside.html         Inside (consumer behaviour strategy)
404.html            Shown for any address that doesn't exist
.nojekyll           Tells GitHub Pages to publish files exactly as they are (hidden file, optional)
robots.txt          Search engine instructions
README.md           This guide
assets/
  css/styles.css    All styles, with the Inter and Manrope fonts embedded
  js/config.js      Settings: connect a waitlist backend here
  js/waitlist-store.js   Saves sign-ups (prototype or real backend)
  js/search-index.js     Data for the site search
  js/main.js        All interactions (menus, search, carousel, tabs, forms…)
  img/              Favicon and link-preview image
  fonts/            Font licences (SIL Open Font License)
```

All links are relative (`product.html`, `pricing.html#compare`), so the site works inside a github.io repository folder, on any domain, and when you open `index.html` straight from your computer.

---

## Part 1: Upload to GitHub

1. **Create a repository.** On github.com, click **New repository**. Give it a name such as `climapod-website`, choose **Public**, and leave "Add a README" unticked. Click **Create repository**.
2. **Upload the files.** Click **uploading an existing file**. Open this folder on your computer, select **everything inside it**, drag it into the browser, and click **Commit changes**.
   - Upload the *contents*, not the folder itself and not the zip. `index.html` must appear at the top level of the repository.
3. **Turn on GitHub Pages.** Go to **Settings → Pages**, and under **Build and deployment** set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**. Click **Save**.
4. **Wait 1–2 minutes**, then refresh **Settings → Pages**. A box appears saying *Your site is live at…* with a **Visit site** button.

Your site is at `https://<your-username>.github.io/<repository-name>/`.

> **Seeing code instead of a website?** That's GitHub showing you the file. Clicking `index.html` in the repository always shows its code. Open the **Visit site** link instead.

**Tip:** name the repository exactly `<your-username>.github.io` and the site appears at `https://<your-username>.github.io/`, with no folder name on the end.

---

## Part 2: Check it works

- [ ] The **Visit site** link opens the ClimaPod home page with its full design
- [ ] Home, Product, Pricing and Inside all open from the menu
- [ ] The Product and Inside menus open their drop-down panels, and Search opens with the `/` key
- [ ] The waitlist form shows errors when empty and a confirmation when filled in
- [ ] A made-up address such as `…/climapod-website/test` shows the "This page isn't here" page
- [ ] The footer of every page shows the student-project statement

---

## Part 3 (optional): Use a domain you own

You need a domain registered in your name, for example from GoDaddy, Namecheap or Hostinger. Check availability at the registrar: `climapod.com` is taken, so you'd need a different name.

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

As delivered, the form is an honest **front-end prototype**:
- It checks every field and shows clear errors.
- It says plainly that details are **not sent** to the ClimaPod team and that no emails will follow.
- Answers stay only in the visitor's own browser.

To collect real sign-ups, edit `assets/js/config.js` on GitHub (pencil icon) and set `waitlistEndpoint`.

**Formspree:** create a form at formspree.io, then set:

```js
waitlistEndpoint: 'https://formspree.io/f/your-form-id',
```

**Google Sheets:** in a Google Sheet, open **Extensions → Apps Script** and paste the script below. Then choose **Deploy → New deployment → Web app**, set **Who has access: Anyone**, and copy the web app URL.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSheet().appendRow([d.joinedAt, d.name, d.email, d.city, d.housing, d.concern, d.prototypeTester, d.source]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

```js
waitlistEndpoint: 'https://script.google.com/macros/s/…/exec',
waitlistContentType: 'text/plain',
```

Once an endpoint is set, the prototype notices disappear and the confirmation becomes "You're on the waitlist".

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "404 – There isn't a GitHub Pages site here" | Pages isn't switched on yet (Part 1, step 3), or it's still publishing. Wait 2 minutes. |
| The whole site 404s, but Pages is on | `index.html` is inside a sub-folder. Move the files to the top level of the repository. |
| You see HTML code | You're viewing the file on github.com. Use the **Visit site** link. |
| No colours or layout | The `assets` folder is missing or misplaced. It must sit next to `index.html`. |
| The site jumps to another website | A `CNAME` file points at a domain you don't control. Delete it. |

---

Fonts: Inter and Manrope (SIL Open Font License). Icons: Lucide (ISC licence). Illustrations: original artwork made for this project.
