# ClimaPod website: ready for GitHub Pages and climapod.com

This folder is the complete ClimaPod website, written in plain HTML, CSS and JavaScript. It needs no build step, framework or server code, and nothing in it depends on Claude or any other platform. Upload these files to a GitHub repository and the site goes live.

> This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.

---

## What's in this folder

```
index.html          Home
product.html        Product
pricing.html        Pricing
inside.html         Inside (consumer behaviour strategy)
404.html            Shown for any address that doesn't exist
CNAME               Tells GitHub Pages to serve this site at climapod.com
.nojekyll           Tells GitHub Pages to publish the files exactly as they are (hidden file)
robots.txt          Search engine instructions
sitemap.xml         Page list for search engines (uses https://climapod.com)
README.md           This guide
assets/
  css/styles.css    All styles, with the Inter and Manrope fonts embedded
  js/config.js      Settings: connect a waitlist backend here
  js/waitlist-store.js   Saves sign-ups (prototype or real backend)
  js/search-index.js     Data for the site search
  js/main.js        All interactions (menus, search, carousel, tabs, forms…)
  img/favicon.svg   Browser tab icon
  img/og-image.png  Preview image when the link is shared
  fonts/            Font licences (SIL Open Font License)
```

All links between pages are relative, such as `product.html` and `pricing.html#compare`, so they work on GitHub Pages, on climapod.com, and when you open `index.html` straight from your computer.

---

## Part 1: Put the site on GitHub Pages

You only need a free GitHub account and a web browser.

1. **Create a repository.** On github.com, click **New repository**. Give it any name (for example `climapod-website`), set it to **Public**, and leave "Add a README" unticked. Click **Create repository**.

2. **Upload the files.** On the new repository page, click **uploading an existing file**, or use **Add file → Upload files**.
   - Open this folder on your computer, select **everything inside it**, and drag it into the browser. Folders such as `assets` upload with their contents.
   - Don't upload the folder itself or the zip file. `index.html` must sit at the top level of the repository.
   - Click **Commit changes**.

3. **Check that `CNAME` is there.** It should appear in the file list. `.nojekyll` is a hidden file, so your computer may skip it. That's fine: the site works without it. To add it anyway, use **Add file → Create new file**, name it `.nojekyll`, leave it empty and commit.

4. **Turn on GitHub Pages.** Go to **Settings → Pages**. Under **Build and deployment**, set:
   - **Source:** Deploy from a branch
   - **Branch:** `main`, folder **`/ (root)`**, then click **Save**

5. **Wait a minute or two.** The **Actions** tab shows a "pages build and deployment" run. When it has a green tick, the site is published.

Because the repository contains the `CNAME` file, GitHub fills in **climapod.com** as the custom domain automatically. Part 2 connects the domain itself.

> **Want to preview on github.io first?** Delete the `CNAME` file from the repository. The site then appears at `https://<your-username>.github.io/<repository-name>/`, and all pages, links and images work there too. Add `CNAME` back (it contains one line: `climapod.com`) when you're ready to switch.

---

## Part 2: Connect climapod.com

Sign in to the company where you bought climapod.com (GoDaddy, Namecheap, Hostinger, Google/Squarespace Domains, Cloudflare, etc.) and open its **DNS settings** for the domain.

### 1. Add these DNS records

| Type | Name / Host | Value | Purpose |
|---|---|---|---|
| A | `@` | `185.199.108.153` | climapod.com → GitHub Pages |
| A | `@` | `185.199.109.153` | |
| A | `@` | `185.199.110.153` | |
| A | `@` | `185.199.111.153` | |
| AAAA | `@` | `2606:50c0:8000::153` | IPv6 (recommended) |
| AAAA | `@` | `2606:50c0:8001::153` | |
| AAAA | `@` | `2606:50c0:8002::153` | |
| AAAA | `@` | `2606:50c0:8003::153` | |
| CNAME | `www` | `<your-username>.github.io` | www.climapod.com → GitHub Pages |

- Replace `<your-username>` with your GitHub username. Don't add the repository name.
- **Delete any other A, AAAA or CNAME records for `@` or `www`**, such as the registrar's "parking page" records. Old records are the most common reason a custom domain doesn't work.
- Some registrars write the host as blank or as `climapod.com` instead of `@`. They all mean the root domain.

### 2. Confirm the domain in GitHub

Go to **Settings → Pages → Custom domain**, make sure it says `climapod.com`, and click **Save**. GitHub runs a DNS check. It shows a green "DNS check successful" once your records are visible.

DNS changes usually take a few minutes to a few hours, occasionally up to a day. If the check fails at first, wait and click **Check again**.

### 3. Turn on HTTPS

Once the DNS check passes, tick **Enforce HTTPS** on the same page. If the box is greyed out, GitHub is still issuing the security certificate. Come back in a little while.

Your site is now live at **https://climapod.com**, and **www.climapod.com** redirects to it.

### 4. Recommended: verify the domain

On your GitHub **profile settings → Pages**, choose **Add a domain**, enter `climapod.com`, and add the TXT record GitHub shows you to your DNS. This stops anyone else from pointing a GitHub site at your domain.

---

## Part 3: After it goes live, check

- [ ] https://climapod.com opens with the padlock (HTTPS) showing
- [ ] Home, Product, Pricing and Inside all open from the menu
- [ ] The Product and Inside menus open their drop-down panels
- [ ] Search opens with the Search button or the `/` key
- [ ] The waitlist form shows errors when left empty, and a confirmation when filled in
- [ ] https://climapod.com/anything-made-up shows the custom "This page isn't here" page
- [ ] The footer of every page shows the student-project statement
- [ ] Pasting the link into WhatsApp or LinkedIn shows the ClimaPod preview image

---

## The waitlist form

### As delivered: an honest prototype

No backend is connected, so the form works as a front-end prototype only:
- It checks every field and shows clear errors.
- The form itself says nothing is sent to the ClimaPod team.
- The confirmation says plainly that the details were **not sent** and no emails will follow.
- Answers are kept only in the visitor's own browser, to spot duplicate sign-ups on that device. Nobody else, including you, can see them.

### Collecting real sign-ups

Open `assets/js/config.js` on GitHub (click the file, then the pencil icon to edit) and set `waitlistEndpoint`. When it's set, the form sends each sign-up as JSON. The prototype notices disappear, and the confirmation switches to "You're on the waitlist".

**Formspree (easiest, free tier):** create a form at formspree.io and copy its endpoint.

```js
waitlistEndpoint: 'https://formspree.io/f/your-form-id',
```

**Google Sheets (free):** in a Google Sheet, open **Extensions → Apps Script** and paste the script below. Then choose **Deploy → New deployment → Web app**, set **Who has access: Anyone**, and copy the web app URL.

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

Commit the change. The live site updates within a minute or two. Before collecting real personal data, add a short privacy note saying what you collect and how people can ask for it to be deleted.

---

## Making changes

**Small text changes:** edit the `.html` file on GitHub with the pencil icon and commit. Note:
- The header, footer and pop-ups are repeated in each of the four pages, so change all four for anything that appears site-wide.
- Site search reads from `assets/js/search-index.js`. If you rename a section, update its title there too.

**Bigger changes:** use the editable source project, `climapod-source.zip`, which has the template-based builder. Edit the shared header or footer once, run `node build.mjs`, and upload the new contents of its `dist/` folder.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| GitHub shows a 404 for the whole site | `index.html` isn't at the top of the repository. You probably uploaded the folder instead of its contents. Move the files to the root. |
| Pages open but have no styling | The `assets` folder is missing or in the wrong place. It must sit next to `index.html`. |
| "DNS check unsuccessful" | Wait (DNS can take hours), and make sure there are no leftover A/AAAA/CNAME records for `@` or `www` at your registrar. |
| "Enforce HTTPS" is greyed out | The certificate is still being issued after the DNS check passes. Wait and refresh. |
| The custom domain disappears from Settings | The `CNAME` file was deleted or renamed. Re-create it containing `climapod.com`. |
| The site redirects to climapod.com before DNS is ready | That's the `CNAME` file working. Delete it temporarily to preview on github.io. |

---

© ClimaPod student concept. This is a student project for a Consumer Behavior course at Great Lakes Institute of Management.
Fonts: Inter and Manrope (SIL Open Font License). Icons: Lucide (ISC licence). Illustrations: original artwork made for this project.
