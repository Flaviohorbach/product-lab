import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const CACHE_DIR = ".cache/images";
const MIME_BY_EXTENSION: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * Downloads a product photo once and keeps it on disk, so a benchmark that
 * calls the model dozens of times does not hit the image host dozens of times.
 */
export async function loadImage(url: string): Promise<{ mimeType: string; base64: string }> {
  const extension = extname(new URL(url).pathname).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error(`Unsupported image type "${extension}" in ${url}`);

  const file = join(CACHE_DIR, createHash("sha1").update(url).digest("hex") + extension);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, bytes);
  }
  return { mimeType, base64: bytes.toString("base64") };
}
