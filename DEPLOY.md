# Deploying the Vayora website

The site is a static website, so any static host works. Each option below is free for a project this size. Pick one.

Before any option, build the site:

```bash
npm run build        # creates the dist/ folder
```

By default the build has no custom domain. To build for a domain you own, use `SITE_URL=https://yourdomain.com npm run build`. On Windows PowerShell: `$env:SITE_URL="https://yourdomain.com"; npm run build`. That adds a `CNAME` file and switches the package guide to `deploy/README.md`.

**For GitHub Pages, follow `deploy/README-github-io.md`** (or `deploy/README.md` with your own domain).

---

## Option 1: Netlify Drop (fastest, no account setup beyond sign-in)

1. Run `npm run build`.
2. Open **https://app.netlify.com/drop** and sign in.
3. Drag the **`dist`** folder onto the page.
4. Netlify gives you a URL like `https://random-name.netlify.app`. Rename it under *Site configuration → Change site name* (e.g. `vayora-glim`).
5. To update the site later, rebuild and drag `dist` onto the site's *Deploys* tab.

The pages (`/product.html`, `/pricing.html`, `/inside.html`) and the custom 404 page work automatically.

## Option 2: Netlify from GitHub (auto-deploys on every push)

1. Push this project to a GitHub repository.
2. In Netlify: *Add new site → Import an existing project → GitHub* and choose the repo.
3. The included `netlify.toml` sets everything: build command `node build.mjs`, publish directory `dist`.
4. Optional: under *Site configuration → Environment variables*, add `SITE_URL` = your Netlify URL, then redeploy.

## Option 3: Vercel

1. Push the project to GitHub.
2. In Vercel: *Add New → Project*, import the repo.
3. Framework preset: **Other**. The included `vercel.json` sets the build command (`npm run build`), output directory (`dist`) and clean URLs.
4. Click **Deploy**.

## Option 4: GitHub Pages

**A. Automatic (recommended):** GitHub builds the site for you on every change.

1. Create a **public** repository on github.com (e.g. `vayora`). Don't add a README.
2. Upload the **contents** of the unzipped `vayora` folder, not the folder itself or the zip. Use *Add file → Upload files* and commit to `main`.
3. Hidden-folder check: your computer hides the `.github` folder, so it may not upload. If the repo has no `.github/workflows/pages.yml` file, create it with *Add file → Create new file*, type that exact name, paste in the contents of the file from this project, and commit.
4. Go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**.
5. Open the *Actions* tab and wait for "Deploy to GitHub Pages" to show a green tick (about a minute).
6. The site is live at `https://<username>.github.io/<repo>/`. To use a domain you own, enter it under Settings → Pages → Custom domain and add the DNS records from `deploy/README.md`.

To update the site, edit or upload files and commit. It redeploys on its own.

**B. Manual (no workflow):** upload the built site directly.

1. On your computer, run `npm run build`.
2. Create a public repository and upload the **contents of `dist/`** to it.
3. Go to *Settings → Pages → Source: Deploy from a branch*, choose `main` and `/ (root)`, then click **Save**.
4. To update, rebuild and upload `dist/` again.

**Command line (if you use git):**

```bash
cd vayora
git init -b main
git add .
git commit -m "Vayora website"
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Then do step A4.

**Tip:** name the repository `<username>.github.io` and the site appears at `https://<username>.github.io/` with no sub-folder.

## Option 5: Cloudflare Pages

1. Push to GitHub, then in Cloudflare: *Workers & Pages → Create → Pages → Connect to Git*.
2. Build command: `node build.mjs` · Build output directory: `dist`.

---

## After deploying: checklist

- [ ] Open `/`, `/product`, `/pricing` and `/inside` and check the nav highlights the right page.
- [ ] Open a made-up URL such as `/test` and confirm the custom 404 page appears.
- [ ] Submit the waitlist form once. In prototype mode the confirmation says it's stored in your browser only.
- [ ] If you connected a backend (see README › "Connecting a real backend"), confirm the test entry arrived.
- [ ] Paste your URL into a messaging app to check the share preview (title, description, image).
- [ ] Check the student-project statement appears in the footer of every page.

## Custom domain (optional)

Every host above supports a custom domain under its domain settings. After switching, rebuild with `SITE_URL` set to the new domain and redeploy.
