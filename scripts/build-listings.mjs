#!/usr/bin/env node
/**
 * Generate a static detail page (/listings/<slug>/index.html) for every entry
 * in data/listings.json, in the site's existing design system.
 *
 * Usage:
 *   node scripts/build-listings.mjs
 *
 * This never invents content: any field missing from a listing's JSON entry
 * is simply omitted from the generated page instead of being defaulted or
 * guessed.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LISTINGS_JSON = path.join(ROOT, "data", "listings.json");
const OUT_DIR = path.join(ROOT, "listings");

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(price) {
  if (typeof price !== "number") return "Price upon request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(price);
}

function addressLine(listing) {
  return [listing.address, listing.city, listing.state, listing.zip]
    .filter(Boolean)
    .join(", ");
}

function metaLine(listing) {
  const parts = [];
  if (listing.beds != null) parts.push(`${listing.beds} bd`);
  if (listing.baths != null) parts.push(`${listing.baths} ba`);
  if (listing.sqft != null) parts.push(`${Number(listing.sqft).toLocaleString()} sq ft`);
  if (listing.propertyType) parts.push(listing.propertyType);
  return parts;
}

function factsList(listing) {
  const facts = [];
  if (listing.propertyType) facts.push(["Property Type", listing.propertyType]);
  if (listing.beds != null) facts.push(["Bedrooms", listing.beds]);
  if (listing.baths != null) facts.push(["Bathrooms", listing.baths]);
  if (listing.sqft != null) facts.push(["Square Feet", Number(listing.sqft).toLocaleString()]);
  if (listing.status) facts.push(["Status", listing.status]);
  if (listing.mlsNumber) facts.push(["MLS #", listing.mlsNumber]);
  return facts;
}

function galleryMarkup(listing) {
  if (!listing.images || listing.images.length === 0) return "";
  return listing.images
    .map((img, i) => {
      const src = `../../${img}`;
      const alt = escapeHtml(`${addressLine(listing)} — photo ${i + 1}`);
      return (
        `<button type="button" class="listing-gallery-item" data-full="${src}">` +
        `<img src="${src}" alt="${alt}" loading="${i === 0 ? "eager" : "lazy"}" />` +
        `</button>`
      );
    })
    .join("\n            ");
}

function featuresMarkup(listing) {
  if (!listing.features || listing.features.length === 0) return "";
  const items = listing.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("\n              ");
  return `
          <h3 class="listing-features-heading">Features</h3>
          <ul class="listing-features-list">
              ${items}
          </ul>`;
}

function factsMarkup(listing) {
  const facts = factsList(listing);
  if (facts.length === 0) return "";
  const rows = facts
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("\n            ");
  return `<dl class="listing-facts">\n            ${rows}\n          </dl>`;
}

function renderPage(listing) {
  const title = `${addressLine(listing) || "Property"} | Amy Marino, REALTOR`;
  const description = listing.description
    ? listing.description.slice(0, 155)
    : `${addressLine(listing)} — listed with Amy Marino, REALTOR at Coldwell Banker Realty.`;
  const heroImage = listing.images && listing.images[0] ? `../../${listing.images[0]}` : null;
  const meta = metaLine(listing);
  const addr = addressLine(listing);
  const addrAttr = escapeHtml(addr);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="icon" type="image/svg+xml" href="../../assets/img/favicon.svg" />
  <link rel="stylesheet" href="../../assets/css/style.css" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  ${heroImage ? `<meta property="og:image" content="${heroImage}" />` : ""}
  <meta property="og:type" content="website" />
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header">
    <div class="container nav">
      <a class="nav-brand" href="../../index.html">
        <span class="nav-brand-name">Amy Marino</span>
        <span class="nav-brand-tag">REALTOR &middot; COLDWELL BANKER REALTY</span>
      </a>
      <ul class="nav-links">
        <li><a href="../../index.html#about">About</a></li>
        <li><a href="../../index.html#buyers">Buyers</a></li>
        <li><a href="../../index.html#sellers">Sellers</a></li>
        <li><a href="../../index.html#areas">Areas</a></li>
        <li><a href="../../index.html#listings">Listings</a></li>
        <li><a href="../../index.html#contact">Contact</a></li>
      </ul>
      <div class="nav-actions">
        <a class="btn btn-primary" href="tel:19149669494">Call Amy</a>
        <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navMobilePanel" aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    <nav class="nav-mobile-panel" id="navMobilePanel" aria-label="Mobile">
      <a href="../../index.html#about">About</a>
      <a href="../../index.html#buyers">Buyers</a>
      <a href="../../index.html#sellers">Sellers</a>
      <a href="../../index.html#areas">Areas Served</a>
      <a href="../../index.html#listings">Listings</a>
      <a href="../../index.html#contact">Contact</a>
      <div class="nav-mobile-actions">
        <a class="btn btn-primary" href="tel:19149669494">Call Amy</a>
        <a class="btn btn-ghost-light" href="mailto:amy.marino@cbrealty.com">Email Amy</a>
      </div>
    </nav>
  </header>

  <main id="main">
    <section class="listing-hero">
      <div class="container">
        ${listing.status ? `<span class="listing-hero-status">${escapeHtml(listing.status)}</span>` : ""}
        <h1 class="listing-hero-price">${formatPrice(listing.price)}</h1>
        <p class="listing-hero-address">${escapeHtml(addr)}</p>
        ${meta.length ? `<p class="listing-hero-meta">${meta.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="listing-gallery-grid">
            ${galleryMarkup(listing)}
        </div>
      </div>
    </section>

    <section class="section section-paper-alt">
      <div class="container listing-info-grid">
        <div>
          <h2 class="section-title">About This Home</h2>
          ${listing.description ? `<p>${escapeHtml(listing.description)}</p>` : ""}
          ${factsMarkup(listing)}
          ${featuresMarkup(listing)}
          ${listing.sourceUrl ? `<p class="listing-source-note">Originally listed at <a href="${escapeHtml(listing.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(listing.sourceUrl)}</a></p>` : ""}
        </div>

        <div class="listing-cta-panel">
          <h3>Interested in this home?</h3>
          <div class="hero-ctas">
            <button type="button" class="btn btn-primary" data-inquiry="showing" data-address="${addrAttr}">Schedule a Showing</button>
            <a class="btn btn-outline" href="tel:19149669494">Call Amy</a>
            <a class="btn btn-outline" href="mailto:amy.marino@cbrealty.com">Email Amy</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <img class="cb-logo" src="../../assets/img/coldwell-banker-logo.png" alt="Coldwell Banker Realty" width="447" height="447" loading="lazy" />
        <p>Amy Marino, REALTOR<br />Real Estate Salesperson<br />Coldwell Banker Realty</p>
      </div>
      <div>
        <h3 class="footer-heading">Contact</h3>
        <ul class="footer-list">
          <li><a href="tel:19149669494">Cell: (914) 966-9494</a></li>
          <li><a href="tel:19149970097">Office: (914) 997-0097</a></li>
          <li><a href="mailto:amy.marino@cbrealty.com">amy.marino@cbrealty.com</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer-heading">Office</h3>
        <ul class="footer-list">
          <li>278 Mamaroneck Ave</li>
          <li>White Plains, NY 10605</li>
          <li>NY License #10401350070</li>
        </ul>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>&copy; <span id="year">2026</span> Amy Marino, REALTOR &mdash; Coldwell Banker Realty.</span>
      <span class="eq-housing">Equal Housing Opportunity</span>
    </div>
  </footer>

  <dialog id="inquiryDialog" class="inquiry-dialog" aria-labelledby="inquiryTitle">
    <button type="button" class="inquiry-close" id="inquiryClose" aria-label="Close">&times;</button>
    <h2 id="inquiryTitle" class="inquiry-title"></h2>
    <p id="inquiryBody" class="inquiry-body"></p>
    <form class="inquiry-form" data-inquiry-form action="https://formsubmit.co/ajax/amy.marino@cbrealty.com" method="POST">
      <input type="hidden" name="_subject" value="New inquiry from AmyMarinoRealty.com" />
      <input type="hidden" name="_template" value="table" />
      <input type="hidden" name="_captcha" value="false" />
      <input type="text" name="_honey" class="inquiry-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <div class="form-field">
        <label for="inquiryName">Name</label>
        <input type="text" id="inquiryName" name="name" required autocomplete="name" />
      </div>
      <div class="form-field">
        <label for="inquiryPhone">Phone number</label>
        <input type="tel" id="inquiryPhone" name="phone" required autocomplete="tel" />
      </div>
      <div class="form-field">
        <label for="inquiryAddress">Property address <span class="optional">(optional)</span></label>
        <input type="text" id="inquiryAddress" name="address" autocomplete="street-address" value="${addrAttr}" />
      </div>
      <div class="form-field">
        <label for="inquiryMessage">Your inquiry</label>
        <textarea id="inquiryMessage" name="message" rows="4" required></textarea>
      </div>
      <button type="submit" class="btn btn-primary inquiry-submit">Send Inquiry</button>
      <p class="inquiry-status" role="status" aria-live="polite"></p>
    </form>
    <div class="inquiry-alt">
      <p>Prefer to reach Amy directly?</p>
      <div class="hero-ctas">
        <a id="inquiryCall" class="btn btn-outline" href="tel:19149669494">Call &mdash; (914) 966-9494</a>
        <a id="inquiryEmail" class="btn btn-outline" href="mailto:amy.marino@cbrealty.com">Email Amy</a>
      </div>
    </div>
  </dialog>

  <dialog id="propertyLightbox" class="lightbox" aria-label="Property photo viewer">
    <div class="lightbox-frame">
      <img src="" alt="" />
      <button type="button" class="lightbox-prev" aria-label="Previous photo">&#8249;</button>
      <button type="button" class="lightbox-next" aria-label="Next photo">&#8250;</button>
      <button type="button" class="lightbox-close" aria-label="Close">&times;</button>
      <span class="lightbox-counter"></span>
    </div>
  </dialog>

  <script src="../../assets/js/main.js"></script>
</body>
</html>
`;
}

async function main() {
  if (!existsSync(LISTINGS_JSON)) {
    console.log("No data/listings.json found — nothing to build.");
    return;
  }
  const listings = JSON.parse(await readFile(LISTINGS_JSON, "utf8"));

  if (!Array.isArray(listings) || listings.length === 0) {
    console.log("data/listings.json is empty — no detail pages to generate.");
    return;
  }

  if (existsSync(OUT_DIR)) {
    await rm(OUT_DIR, { recursive: true });
  }
  await mkdir(OUT_DIR, { recursive: true });

  for (const listing of listings) {
    if (!listing.slug) {
      console.warn(`Skipping a listing with no slug: ${JSON.stringify(listing).slice(0, 80)}...`);
      continue;
    }
    const dir = path.join(OUT_DIR, listing.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderPage(listing));
    console.log(`Generated listings/${listing.slug}/index.html`);
  }

  console.log(`\nDone. ${listings.length} detail page(s) generated.`);
}

main().catch((err) => {
  console.error("Build failed:", err.message);
  process.exit(1);
});
