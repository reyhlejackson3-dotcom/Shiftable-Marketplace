# getshiftable.com

A static site. No build step, no dependencies to install.

## Structure

```
index.html                     Home: dot hero, "Our work" cards, "Packages", "Start yours"
packages/index.html            Buy page: pick a plan, fill the form (posts to Formspree)
work/
  denver-dustless/index.html   Each demo is its own self-contained page
  maiz-y-fuego/index.html
  treeline-candle-co/index.html
  foundry-athletic-club/index.html
  maison-perle/index.html
assets/
  css/site.css                 Shared styles for the home and buy pages
  js/dots.js                   The dot system (dots that form the headers)
  covers/*.webp                The five card images
  img/favicon.svg
```

## Deploy

Upload the whole folder to any static host. With Vercel: drag the folder into a new project (or push to GitHub and import it),
then add `getshiftable.com` under Project Settings > Domains. Every page lives at a clean URL:

- `/`  `/packages/`  `/work/denver-dustless/`  `/work/maiz-y-fuego/`  `/work/treeline-candle-co/`  `/work/foundry-athletic-club/`  `/work/maison-perle/`

To preview locally, run `python3 -m http.server 8000` inside this folder and open http://localhost:8000
(opening the files directly from disk will not resolve the folder links).

## Things to know

- **Form:** the buy page posts to `https://formspree.io/f/xoejqzvz`. Submissions arrive in your Formspree inbox with the
  chosen package in the subject line. Confirm the form in your Formspree dashboard if you have not already.
- **Prices and package copy** live in two places: the `.plans` block in `index.html` and the `#plansel` block in `packages/index.html`.
- **Stripe later:** in `packages/index.html`, replace the form submit with a Stripe Payment Link or Checkout call per plan,
  or keep the form and add a payment button after it. The plan values are `website` and `monthly`.
- **The five demos** each carry `noindex`, so search engines will not list the fictional businesses. The home and buy pages are indexable.
  Each demo has a small circle button in the bottom-left that returns to "Our work".
- **Add a sixth demo:** copy a folder in `work/`, add a card in the `.cards` block of `index.html`, and add a cover image to `assets/covers/`.
- The two 3D demos (Foundry and Maison Perle) load Three.js from a CDN, so they need an internet connection.
