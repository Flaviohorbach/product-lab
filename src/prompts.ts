import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PromptTemplate {
  /** File name without extension, e.g. "v2-grounded". */
  version: string;
  system: string;
  user: string;
}

/**
 * Parses a prompt file with a `# system` and a `# user` section.
 * Keeping prompts in Markdown files (instead of strings in code) makes them
 * reviewable in pull requests and lets each benchmark name the exact version used.
 */
export function parsePrompt(version: string, source: string): PromptTemplate {
  const match = /^# system\s*\n([\s\S]*?)^# user\s*\n([\s\S]*)$/m.exec(source);
  if (!match) throw new Error(`Prompt "${version}" needs a "# system" and a "# user" section.`);
  return { version, system: match[1]!.trim(), user: match[2]!.trim() };
}

export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Missing value for {{${key}}}`);
    return values[key]!;
  });
}

export async function loadPrompt(version: string, dir = "prompts"): Promise<PromptTemplate> {
  return parsePrompt(version, await readFile(join(dir, `${version}.md`), "utf8"));
}

export async function listPromptVersions(dir = "prompts"): Promise<string[]> {
  return (await readdir(dir))
    .filter((file) => /^v\d+.*\.md$/.test(file))
    .map((file) => file.replace(/\.md$/, ""))
    .sort();
}
