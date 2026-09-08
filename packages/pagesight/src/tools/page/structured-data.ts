export interface SchemaRule {
  source: string;
  required: string[];
  requiredAny?: string[];
  recommended: string[];
  imageFields: string[];
  nestedRequired?: Record<string, string[]>;
}

export interface ValidationIssue {
  type: string;
  level: "required" | "recommended";
  field: string;
}

export function formatJsonLd(data: unknown, indent = 0): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(indent);

  if (Array.isArray(data)) {
    for (const item of data) {
      lines.push(...formatJsonLd(item, indent));
    }
    return lines;
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const type = obj["@type"];
    if (type) lines.push(`${pad}@type: ${Array.isArray(type) ? type.join(", ") : type}`);

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("@") && key !== "@type") continue;
      if (key === "@type") continue;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        const str = String(val);
        lines.push(`${pad}${key}: ${str.length > 100 ? `${str.slice(0, 100)}...` : str}`);
      } else if (Array.isArray(val)) {
        lines.push(`${pad}${key}: [${val.length} items]`);
      } else if (val && typeof val === "object") {
        const nested = val as Record<string, unknown>;
        if (nested["@type"]) {
          lines.push(`${pad}${key}:`);
          lines.push(...formatJsonLd(nested, indent + 1));
        }
      }
    }
  }

  return lines;
}

// Presence checks for selected Google-documented fields, reviewed 2026-09-08.
// These do not cover every conditional requirement, value rule, or eligibility policy.
export const SCHEMA_RULES: Record<string, SchemaRule> = {
  WebSite: {
    source: "https://developers.google.com/search/docs/appearance/site-names",
    required: ["name", "url"],
    recommended: ["alternateName"],
    imageFields: [],
  },
  Organization: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/organization",
    required: [],
    recommended: ["name", "url", "logo", "sameAs", "contactPoint"],
    imageFields: ["logo"],
  },
  Article: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/article",
    required: [],
    recommended: ["headline", "image", "datePublished", "author", "dateModified"],
    imageFields: ["image"],
  },
  NewsArticle: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/article",
    required: [],
    recommended: ["headline", "image", "datePublished", "author", "dateModified"],
    imageFields: ["image"],
  },
  Product: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/product-snippet",
    required: ["name"],
    requiredAny: ["offers", "review", "aggregateRating"],
    recommended: ["offers", "review", "aggregateRating"],
    imageFields: ["image"],
  },
  LocalBusiness: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/local-business",
    required: ["name", "address"],
    recommended: ["telephone", "openingHoursSpecification", "url"],
    imageFields: ["image"],
  },
  BreadcrumbList: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/breadcrumb",
    required: ["itemListElement"],
    recommended: [],
    imageFields: [],
  },
  Event: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/event",
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "image", "description", "offers", "organizer"],
    imageFields: ["image"],
  },
  Recipe: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/recipe",
    required: ["name", "image"],
    recommended: ["author", "datePublished", "description", "recipeIngredient", "recipeInstructions"],
    imageFields: ["image"],
  },
  VideoObject: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/video",
    required: ["name", "thumbnailUrl", "uploadDate"],
    recommended: ["description", "duration", "contentUrl", "embedUrl"],
    imageFields: ["thumbnailUrl"],
  },
  SoftwareApplication: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/software-app",
    required: ["name", "offers"],
    requiredAny: ["review", "aggregateRating"],
    recommended: ["applicationCategory", "operatingSystem", "review", "aggregateRating"],
    imageFields: ["image"],
    nestedRequired: { offers: ["price"] },
  },
  Dataset: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/dataset",
    required: ["name", "description"],
    recommended: ["distribution", "creator", "license"],
    imageFields: [],
    nestedRequired: { distribution: ["contentUrl"] },
  },
  BlogPosting: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/article",
    required: [],
    recommended: ["headline", "image", "datePublished", "author", "dateModified"],
    imageFields: ["image"],
  },
  Course: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/course",
    required: ["name", "description"],
    recommended: ["provider"],
    imageFields: [],
  },
  JobPosting: {
    source: "https://developers.google.com/search/docs/appearance/structured-data/job-posting",
    required: ["title", "description", "datePosted", "hiringOrganization"],
    recommended: ["employmentType", "baseSalary"],
    imageFields: [],
  },
};

export function getNestedValue(obj: Record<string, unknown>, field: string): unknown {
  const val = obj[field];
  if (val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)) return val;
  return undefined;
}

export function validateJsonLd(blocks: unknown[]): {
  issues: ValidationIssue[];
  imageUrls: string[];
  validatedTypes: Set<string>;
} {
  const issues: ValidationIssue[] = [];
  const imageUrls: string[] = [];
  const validatedTypes = new Set<string>();

  function validateBlock(data: unknown) {
    if (Array.isArray(data)) {
      for (const item of data) validateBlock(item);
      return;
    }
    if (!data || typeof data !== "object") return;

    const obj = data as Record<string, unknown>;
    const rawType = obj["@type"];
    const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];

    for (const type of types) {
      const rule = SCHEMA_RULES[String(type)];
      if (!rule) continue;
      validatedTypes.add(String(type));

      for (const field of rule.required) {
        if (getNestedValue(obj, field) === undefined) {
          issues.push({ type: String(type), level: "required", field });
        }
      }

      if (rule.requiredAny && !rule.requiredAny.some((field) => getNestedValue(obj, field) !== undefined)) {
        issues.push({ type: String(type), level: "required", field: rule.requiredAny.join(" or ") });
      }

      for (const field of rule.recommended) {
        if (getNestedValue(obj, field) === undefined) {
          issues.push({ type: String(type), level: "recommended", field });
        }
      }

      // Check each nested object; one complete entry cannot hide an incomplete sibling.
      if (rule.nestedRequired) {
        for (const [parent, fields] of Object.entries(rule.nestedRequired)) {
          const parentVal = obj[parent];
          if (parentVal && typeof parentVal === "object") {
            const targets = Array.isArray(parentVal) ? parentVal : [parentVal];
            for (const target of targets) {
              if (target && typeof target === "object") {
                const nested = target as Record<string, unknown>;
                for (const field of fields) {
                  if (nested[field] === undefined || nested[field] === null || nested[field] === "") {
                    issues.push({ type: String(type), level: "required", field: `${parent}.${field}` });
                  }
                }
              }
            }
          }
        }
      }

      // Collect image URLs for validation
      for (const field of rule.imageFields) {
        const val = obj[field];
        if (typeof val === "string" && val.startsWith("http")) {
          imageUrls.push(val);
        } else if (val && typeof val === "object") {
          const nested = val as Record<string, unknown>;
          const url = nested.url ?? nested.contentUrl;
          if (typeof url === "string" && url.startsWith("http")) {
            imageUrls.push(url);
          }
        }
      }
    }

    // Recurse into nested objects and arrays (e.g., @graph)
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) validateBlock(item);
      } else if (val && typeof val === "object") {
        validateBlock(val);
      }
    }
  }

  for (const block of blocks) validateBlock(block);
  return { issues, imageUrls, validatedTypes };
}

export function formatValidation(issues: ValidationIssue[], validatedTypes: Set<string>): string[] {
  const lines: string[] = [
    "Selected field-presence checks only; values, conditional rules, and Google eligibility are not fully checked.",
  ];

  // Report only the subset checked here, not complete rich-result eligibility.
  const typesWithRequiredIssues = new Set(issues.filter((i) => i.level === "required").map((i) => i.type));
  for (const type of validatedTypes) {
    if (!typesWithRequiredIssues.has(type)) {
      lines.push(`CHECKED  ${type} — no missing required fields in the checked subset`);
    }
  }

  for (const type of validatedTypes) lines.push(`Source (${type}): ${SCHEMA_RULES[type].source}`);

  const required = issues.filter((i) => i.level === "required");
  const recommended = issues.filter((i) => i.level === "recommended");

  if (required.length > 0) {
    for (const i of required) {
      lines.push(`MISSING  ${i.type}.${i.field} (required in checked subset)`);
    }
  }
  if (recommended.length > 0) {
    for (const i of recommended) {
      lines.push(`OPTIONAL ${i.type}.${i.field}`);
    }
  }

  return lines;
}
