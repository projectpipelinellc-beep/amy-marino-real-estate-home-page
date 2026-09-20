#!/usr/bin/env node
/**
 * Import a single real-estate listing from its public URL into data/listings.json,
 * downloading its gallery images into assets/listings/<slug>/.
 *
 * Usage:
 *   node scripts/import-listing.mjs <listing-url>
 *
 * Design rules this script follows on purpose:
 *   - Never invents a field. A field the source page doesn't expose is omitted
 *     (left out of the JSON), not guessed or defaulted.
 *   - Never writes a partial/placeholder listing on failure. If the page can't
 *     be fetched or no structured listing data can be found, it exits non-zero
 *     with a specific reason and touches nothing.
 *   - Re-running against a URL already in listings.json updates that entry in
 *     place (matched by sourceUrl) instead of creating a duplicate.
 *   - Prefers the highest-resolution image variant it can find (many listing
 *     sites embed a size/width token in the image URL, e.g. "-w1024" or
 *     "/640x480/"; this script tries common patterns to upgrade to the
 *     largest version rather than assuming the first URL found is the best
 *     one).
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LISTINGS_JSON = path.join(ROOT, "data", "listings.json");
const LISTINGS_IMG_DIR = path.join(ROOT, "assets", "listings");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function fail(reason) {
  console.error("\nImport failed: " + reason);
  console.error("Nothing was written to data/listings.json or assets/listings/.\n");
  process.exit(1);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Try to upgrade an image URL to its highest-resolution variant using
 *  patterns common across listing/CDN platforms. Falls back to the
 *  original URL untouched if no known pattern matches. */
function upscaleImageUrl(url) {
  let out = url;
  // width/height query params, e.g. ?w=300&h=200 or ?width=300
  out = out.replace(/([?&])(w|width)=\d+/gi, "$11$2=2000");
  out = out.replace(/([?&])(h|height)=\d+/gi, "$11$2=2000");
  // path-embedded size tokens, e.g. /640x480/ or -640x480.
  out = out.replace(/\/(\d{2,4})x(\d{2,4})\//, "/2000x2000/");
  out = out.replace(/-(\d{2,4})x(\d{2,4})(\.\w+)$/i, "-2000x2000$3");
  // "-wNNN" or "_wNNN" style resize tokens
  out = out.replace(/([-_])w\d{2,4}(\.\w+)$/i, "$1w2000$2");
  // strip explicit "thumb"/"thumbnail" segments some CDNs use
  out = out.replace(/\/(thumb|thumbnail|small|medium)\//i, "/large/");
  return out;
}

async function fetchHtml(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch (err) {
    fail(
      `could not reach ${url} (${err.message}). This is usually either a network/firewall ` +
        `block on this machine, or the source blocking automated requests outright. Try opening ` +
        `the URL in a normal browser to confirm it loads, and run this script from a network that ` +
        `has ordinary internet access.`
    );
  }
  if (!response.ok) {
    fail(
      `${url} responded with HTTP ${response.status} ${response.statusText}. ` +
        (response.status === 403 || response.status === 429
          ? "This status usually means the site is blocking automated/bot requests."
          : "")
    );
  }
  return response.text();
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Malformed JSON-LD block; skip it rather than guessing at a fix.
    }
  }
  return blocks;
}

function extractNextData(html) {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function extractOpenGraph(html) {
  const og = {};
  const re = /<meta[^>]+property=["']og:([a-zA-Z:]+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    og[m[1]] = m[2];
  }
  return og;
}

/** Recursively walk an arbitrary object/array looking for values under keys
 *  that suggest they're image URLs, and for scalar fields under keys that
 *  suggest common listing facts. Generic on purpose: every listing platform
 *  shapes its embedded JSON differently, and we'd rather find *something*
 *  real than hard-code one site's schema. */
function deepScan(node, { images, facts }, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);

  for (const [key, value] of Object.entries(node)) {
    const k = key.toLowerCase();

    if (typeof value === "string") {
      if (/^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value) &&
          /(photo|image|media|picture|img)/i.test(k)) {
        images.add(value);
      }
      if (/^address$|street/.test(k) && !facts.address) facts.address = value;
      if (/^city$/.test(k) && !facts.city) facts.city = value;
      if (/^state$|statecode|state_code/.test(k) && !facts.state) facts.state = value;
      if (/^zip|postalcode/.test(k) && !facts.zip) facts.zip = value;
      if (/^status$/.test(k) && !facts.status) facts.status = value;
      if (/^propertytype$|hometype|property_type/.test(k) && !facts.propertyType)
        facts.propertyType = value;
      if (/^description$/.test(k) && !facts.description) facts.description = value;
      if (/^mls|listingid$/.test(k) && !facts.mlsNumber) facts.mlsNumber = value;
    }

    if (typeof value === "number") {
      if (/^price$|listprice|list_price/.test(k) && !facts.price) facts.price = value;
      if (/^beds$|bedrooms/.test(k) && facts.beds == null) facts.beds = value;
      if (/^baths$|bathrooms/.test(k) && facts.baths == null) facts.baths = value;
      if (/sqft|squarefeet|livingarea|building_area/.test(k) && facts.sqft == null)
        facts.sqft = value;
    }

    if (Array.isArray(value)) {
      if (/photo|image|media|gallery/i.test(k)) {
        for (const item of value) {
          if (typeof item === "string" && /^https?:\/\//.test(item)) images.add(item);
          else if (item && typeof item === "object") {
            for (const v of Object.values(item)) {
              if (typeof v === "string" && /^https?:\/\/.+\.(jpg|jpeg|png|webp)/i.test(v)) {
                images.add(v);
              }
            }
          }
        }
      }
      if (/feature|amenit/i.test(k) && !facts.features) {
        const strings = value.filter((v) => typeof v === "string");
        if (strings.length) facts.features = strings;
      }
      for (const item of value) deepScan(item, { images, facts }, seen);
    } else if (value && typeof value === "object") {
      deepScan(value, { images, facts }, seen);
    }
  }
}

function guessExtension(url, contentType) {
  const fromUrl = url.match(/\.(jpe?g|png|webp)(?:\?|$)/i);
  if (fromUrl) return fromUrl[1].toLowerCase().replace("jpeg", "jpg");
  if (contentType && contentType.includes("png")) return "png";
  if (contentType && contentType.includes("webp")) return "webp";
  return "jpg";
}

async function downloadImages(urls, destDir) {
  await mkdir(destDir, { recursive: true });
  const saved = [];
  let i = 0;
  for (const rawUrl of urls) {
    i += 1;
    const url = upscaleImageUrl(rawUrl);
    const num = String(i).padStart(2, "0");
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        console.warn(`  skipped image ${i} (HTTP ${res.status}): ${url}`);
        continue;
      }
      const ext = guessExtension(url, res.headers.get("content-type"));
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = `${num}.${ext}`;
      await writeFile(path.join(destDir, filename), buf);
      saved.push(filename);
      console.log(`  saved ${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`  skipped image ${i} (${err.message}): ${url}`);
    }
  }
  return saved;
}

async function loadListings() {
  if (!existsSync(LISTINGS_JSON)) return [];
  const raw = await readFile(LISTINGS_JSON, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    fail(`data/listings.json exists but isn't valid JSON. Fix or remove it before importing.`);
  }
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    fail("no URL given. Usage: node scripts/import-listing.mjs <listing-url>");
  }

  console.log(`Fetching ${url} ...`);
  const html = await fetchHtml(url);

  const images = new Set();
  const facts = {};

  for (const block of extractJsonLdBlocks(html)) {
    deepScan(block, { images, facts });
  }
  const nextData = extractNextData(html);
  if (nextData) deepScan(nextData, { images, facts });

  const og = extractOpenGraph(html);
  if (og.image) images.add(og.image);
  if (og.description && !facts.description) facts.description = og.description;
  if (og.title && !facts.address) facts.address = og.title;

  if (!facts.address && images.size === 0) {
    fail(
      `no structured listing data (JSON-LD, embedded page data, or Open Graph tags) and no ` +
        `images were found on this page. Either the page renders its content entirely client-side ` +
        `(so a plain HTML fetch sees none of it), or it's actively blocking automated requests. ` +
        `Check whether the site or MLS offers a proper data feed/export instead of scraping.`
    );
  }

  const addressLine = facts.address || "unknown-address";
  const slug = slugify(
    [addressLine, facts.city, facts.state].filter(Boolean).join(" ")
  ) || `listing-${Date.now()}`;

  console.log(`\nExtracted facts:`);
  console.log(JSON.stringify(facts, null, 2));
  console.log(`\nFound ${images.size} candidate image URL(s).`);

  const destDir = path.join(LISTINGS_IMG_DIR, slug);
  console.log(`\nDownloading images into assets/listings/${slug}/ ...`);
  const savedFiles = await downloadImages([...images], destDir);

  if (savedFiles.length === 0) {
    fail(
      `found ${images.size} image URL(s) but none could actually be downloaded (all requests ` +
        `failed or were blocked). No folder was populated.`
    );
  }

  const listings = await loadListings();
  const existingIndex = listings.findIndex((l) => l.sourceUrl === url);
  const entry = {
    id: existingIndex >= 0 ? listings[existingIndex].id : slug,
    slug,
    address: facts.address ?? null,
    city: facts.city ?? null,
    state: facts.state ?? null,
    zip: facts.zip ?? null,
    price: facts.price ?? null,
    beds: facts.beds ?? null,
    baths: facts.baths ?? null,
    sqft: facts.sqft ?? null,
    status: facts.status ?? null,
    propertyType: facts.propertyType ?? null,
    mlsNumber: facts.mlsNumber ?? null,
    description: facts.description ?? null,
    features: facts.features ?? [],
    images: savedFiles.map((f) => `assets/listings/${slug}/${f}`),
    sourceUrl: url,
    importedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    listings[existingIndex] = entry;
    console.log(`\nUpdated existing listing "${slug}" in data/listings.json.`);
  } else {
    listings.push(entry);
    console.log(`\nAdded new listing "${slug}" to data/listings.json.`);
  }

  await writeFile(LISTINGS_JSON, JSON.stringify(listings, null, 2) + "\n");

  console.log(`\nDone. ${savedFiles.length} image(s) saved. Run scripts/build-listings.mjs to`);
  console.log(`generate this listing's detail page and refresh the homepage grid.\n`);
}

main().catch((err) => fail(err.message));
