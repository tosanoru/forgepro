import templatesJson from "./script-templates.json";

export interface TemplateSection {
  key: string;
  label: string;
  purpose: string;
  promptGuidance: string;
  repeatable?: boolean;
}

export interface Template {
  id: string;
  name: string;
  shortCode: string;
  description: string;
  estimatedLength: { min: number; max: number; unit: string };
  sections: TemplateSection[];
}

export interface TemplateCategory {
  description: string;
  templates: Template[];
}

export interface TemplatesData {
  schemaVersion: string;
  description: string;
  shortform: TemplateCategory;
  longform: TemplateCategory;
}

export function getTemplateData(): TemplatesData {
  return templatesJson as TemplatesData;
}

export function getTemplates(format: "short" | "long"): Template[] {
  const data = getTemplateData();
  return format === "short" ? data.shortform.templates : data.longform.templates;
}

export function getTemplate(format: "short" | "long", id: string): Template | undefined {
  return getTemplates(format).find((t) => t.id === id);
}

export function buildTemplateContent(template: Template): string {
  return template.sections
    .map((s) => `[${s.label}]\n${s.promptGuidance ? `// ${s.promptGuidance}` : ""}\n`)
    .join("\n");
}
