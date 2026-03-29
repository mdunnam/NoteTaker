const fs = require("node:fs");
const path = require("node:path");

/**
 * Vercel build compatibility patch:
 * Some Next.js builds do not emit app/(app)/page_client-reference-manifest.js,
 * but deployment expects it. If missing, copy root app manifest as fallback.
 */
function ensureAppGroupManifest() {
  const rootManifest = path.join(process.cwd(), ".next", "server", "app", "page_client-reference-manifest.js");
  const groupedManifest = path.join(process.cwd(), ".next", "server", "app", "(app)", "page_client-reference-manifest.js");

  if (!fs.existsSync(rootManifest)) {
    console.warn("[fix-next-manifest] Root manifest not found, skipping patch.");
    return;
  }

  if (!fs.existsSync(path.dirname(groupedManifest))) {
    fs.mkdirSync(path.dirname(groupedManifest), { recursive: true });
  }

  if (!fs.existsSync(groupedManifest)) {
    fs.copyFileSync(rootManifest, groupedManifest);
    console.log("[fix-next-manifest] Created fallback grouped page manifest.");
  } else {
    console.log("[fix-next-manifest] Grouped page manifest already exists.");
  }
}

ensureAppGroupManifest();
