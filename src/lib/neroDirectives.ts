// Nero's self-maintained "standing directives" — an editable slice of its own
// system prompt. Nero rewrites this via the update_directives tool; it is loaded
// into the system prompt on every turn and persists across restarts.
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "nero-directives.md");

export function getDirectives(): string {
  try {
    return fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").trim() : "";
  } catch {
    return "";
  }
}

export function setDirectives(text: string): { ok: boolean } {
  try {
    fs.writeFileSync(FILE, (text ?? "").trim() + "\n", "utf8");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}