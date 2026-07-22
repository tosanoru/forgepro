const SHORT_SECTIONS = ["HOOK", "BODY", "CTA"] as const;
const LONG_SECTIONS = ["HOOK", "BODY 1", "PROMO", "BODY 2", "CTA", "CLOSING"] as const;

export type ShortSection = (typeof SHORT_SECTIONS)[number];
export type LongSection = (typeof LONG_SECTIONS)[number];
export type ScriptSection = ShortSection | LongSection;

export type Section = {
  label: string;
  content: string;
};

const SECTION_RE = /^\[([^\]]+)\]/m;

export function getScriptSections(format: "short" | "long"): readonly string[] {
  return format === "short" ? SHORT_SECTIONS : LONG_SECTIONS;
}

export function parseSections(raw: string, format: "short" | "long"): Section[] {
  const expected = getScriptSections(format);
  const lines = raw.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const m = line.match(SECTION_RE);
    if (m) {
      const label = m[1].trim();
      if (expected.includes(label)) {
        if (current) sections.push(current);
        current = { label, content: "" };
        continue;
      }
    }
    if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);

  return sections;
}
