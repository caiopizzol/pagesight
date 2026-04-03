---
name: "Pagesight"
tagline: "See your site the way search engines and AI see it."
version: 3
language: en
---

# Pagesight

## Strategy

### Essence

Your AI assistant can write your code. Now it can see your site.

Pagesight gives AI assistants sight into the systems that evaluate your site. One npm package. Ask your assistant about your site and get answers direct from the source.

Before Pagesight, an AI assistant could refactor your codebase but couldn't tell you if your homepage was indexed. It could review your PR but couldn't see that your performance regressed last week. It could write your meta tags but couldn't check if they actually work. The assistant was blind to search.

Pagesight is sight.

### What it does

Five questions, five tools, unified in one package:

**What's on this page?** Meta tags, Open Graph, structured data validation (19 schema types with nested field checks), internal link health, redirect chains, WCAG contrast checking. Batch across multiple URLs.

**How fast is it?** Lab scores from Lighthouse (single, batch, side-by-side compare), real-user metrics from Chrome UX Report (snapshot + 10-month trends). Shared accessibility issues deduplicated across pages.

**How's Google seeing me?** Index status, sitemap health with auto-drill-down, search analytics with period-over-period comparison. Sample-inspect from sitemaps to diagnose indexing patterns.

**How's AI seeing me?** 139+ AI crawlers audited by category (training, search, assistant, agent). robots.txt validation per RFC 9309. llms.txt and llms-full.txt detection.

**How's my site overall?** One call runs everything in parallel. Findings ranked by severity. Errors surfaced first. Auto-drill-down when indexing is low.

```
=== Site Audit: https://example.com ===

HIGH    Missing canonical URL
HIGH    7,772 sitemap URLs submitted, 0 indexed
MEDIUM  Missing og:image — no social preview image
MEDIUM  Accessibility score: 89/100
LOW     Missing Twitter Card tags
LOW     No structured data (JSON-LD) found
```

### Positioning

**Category:** Search visibility for AI assistants.

**One-liner:** Your AI assistant's sight into how search engines and AI crawlers evaluate your site.

**What it replaces:**
- Opening search consoles in a browser tab
- Running performance audits in DevTools and reading the report yourself
- Checking robots.txt manually
- Validating meta tags with browser extensions
- Stitching together 5+ tools to diagnose one site
- Ignoring search visibility entirely because it's too much friction

**Why it's trustworthy:** Every data point comes from a verifiable source. Official APIs, real user data, published standards, community-maintained registries. Nothing is invented. No proprietary scores. No thresholds without citation.

**Structural differentials:**
- AI-native: designed to be used by AI assistants, not by humans clicking a dashboard
- Intent-based: 6 tools named for what you're trying to do (page, speed, search, ai, audit, setup), not which API to call
- Unified: indexing + performance + meta tags + structured data + link health + bot access + accessibility in one package
- One-call audit: parallel execution, prioritized findings, auto-drill-down, seconds not minutes
- AI crawler awareness: live community registry of 139+ bots, categorized by function, checked against your robots.txt
- Batch everything: multiple URLs for page analysis, PageSpeed comparison, competitive benchmarking
- Evidence-only: if the source doesn't report it, neither does Pagesight

### Promise

Your AI assistant can see what Google sees about your site.

One call. Prioritized findings. Fix what matters.

### Personality

**Archetype:** The Lens — clarity through direct observation. Removes distortion. Shows what's there.

**Attributes:** clear, precise, developer-native, evidence-based, calm, actionable

**What Pagesight is:**
- A sense organ for AI assistants — sight into search
- Evidence delivered where you already work
- A complete picture in one call
- Open source

**Pagesight is not:**
- A score generator
- A dashboard
- A subscription
- An opinion engine

### Guardrails

**Tone:** Clear, direct, technical, honest, unhurried.

**Litmus test:** If Google's own engineers would disagree with what we're saying, don't say it.

**What the brand cannot be:**
- A tool that invents rules or scores
- A dashboard that demands attention
- A brand that uses marketing superlatives
- A product that promises traffic results

---

## Voice

### Identity

Your AI assistant can write code, review PRs, debug, refactor. But ask it about your site's search visibility and it goes blind. Is this page indexed? What do real users experience? Which AI crawlers are hitting your robots.txt? It can't answer.

Pagesight gives it sight. Google Search Console tells you if a page is indexed. PageSpeed Insights tells you how fast it loads. Chrome UX Report tells you how real users experience it. A live registry of 139+ AI crawlers tells you who's accessing your content. Your structured data is validated against what Google requires for Rich Results. Your internal links are checked for broken paths and redirect chains. Your color contrast is checked against WCAG. Pagesight connects your AI assistant to all of it.

Six tools. Five questions. One package.

### Tagline & Slogans

**Primary tagline:** See your site the way search engines and AI see it.
*Use everywhere: npm, GitHub, homepage, social bios.*

**Context-specific:**
- Hero: "Your AI assistant can write your code. Now it can see your site."
- Technical: "Google Search Console + PageSpeed + CrUX + 139 AI crawlers + link health + accessibility. One package."
- Developer pitch: "Six tools. Five questions. Fix what matters."
- AI crawler pitch: "139 AI crawlers. Do you know which ones you've let in?"
- Trust: "No scores we invented. No rules we can't cite."
- Install: "`npm install pagesight`"

### Manifesto

Your AI assistant knows your codebase. It can find bugs, write tests, review pull requests, refactor modules. But ask it a simple question — is my homepage indexed? — and it can't answer. It doesn't have eyes into the systems that evaluate your site.

Google Search Console knows if your page is indexed. PageSpeed Insights knows how fast it loads. Chrome UX Report knows how real users experience it. 139 AI crawlers are visiting your site right now — for training, for search, for answering user questions. Your assistant can't see any of it.

So we built a bridge. Pagesight connects your AI assistant to the systems that actually evaluate your site. It fetches your page as Googlebot sees it. It validates your structured data against 19 schema types with nested field checks. It checks if your OG images load. It traces your redirect chains and checks every internal link. It samples your sitemap and batch-inspects to find why pages aren't indexed. It compares your search performance period over period. It audits 139 AI crawlers by category — training, search, assistant, agent — and detects your llms.txt. It checks your color contrast against WCAG and suggests the nearest passing color.

One command. Six tools. Prioritized by severity.

Every data point has a source. Google's API. Chrome users. RFC 9309. schema.org. A community-maintained registry. Nothing invented. Nothing we can't cite.

Your assistant asks. The sources answer. You see what they see.

That's Pagesight.

### Message Pillars

**Sight**
Your AI assistant is blind to search. Pagesight gives it eyes. Index status, performance, search traffic, bot access, meta tags, structured data, link health, accessibility, AI visibility — direct from the source, delivered through your assistant.

**Source**
Every data point has a citation. Official APIs, published standards, community registries. No invented scores. No proprietary rules. What the sources report is what you see.

**Action**
Seeing isn't enough. Six tools, each named for what you're trying to do. Findings ranked by severity. Batch across pages. Compare across periods. Fix what matters.

**Developer-Native**
`npm install pagesight`. Let your AI assistant use it. No dashboard. No browser. No login. No subscription. Works where you already work.

### Phrases

- "Your AI assistant can write your code. Now it can see your site."
- "See your site the way search engines and AI see it."
- "Six tools. Five questions. Prioritized."
- "What Google sees. What AI knows. One tool."
- "139 AI crawlers. Do you know which ones you've let in?"
- "No scores we invented. No rules we can't cite."
- "Your AI assistant's sight into search."
- "Direct from source. Not from opinions."

### Social Bios

**GitHub:**
See your site the way search engines and AI see it.

**X/Twitter:**
Your AI assistant's sight into search. Google Search Console + PageSpeed + CrUX + 139 AI crawlers. One call, prioritized findings. Open source.

**LinkedIn:**
Pagesight gives AI assistants sight into how search engines and AI crawlers evaluate your site. Google Search Console, PageSpeed Insights, Chrome UX Report, structured data validation, 139+ AI crawlers — one command, prioritized findings. Open source. npm install pagesight.

### Tonal Rules

1. Lead with what you can see, not what the tool is.
2. Speak in short, declarative sentences. No hedging.
3. Use developer vocabulary: install, configure, query — not "solutions," "empower," "leverage."
4. Never use marketing superlatives. Never say revolutionary, game-changing, next-generation.
5. Don't define the product by its implementation. "See what Google sees" not "MCP server that wraps APIs."
6. Respect the reader's time. One sentence over three.
7. When debunking a myth, quote the source by name. "Mueller said X." Not "experts agree."
8. Never promise traffic results. Promise sight and action.
9. Acknowledge what we don't cover. Silence is deception.
10. The strongest argument is a direct quote from an authoritative source.

| We Say | We Never Say |
|---|---|
| "See what Google sees" | "Optimize your digital presence" |
| "Google reports this page is not indexed" | "Your SEO score is 73/100" |
| "139 AI crawlers checked" | "Comprehensive AI-powered analysis" |
| "npm install pagesight" | "Sign up for a free trial" |
| "One call, prioritized findings" | "All-in-one platform" |
| "Works with your AI assistant" | "Seamless integration ecosystem" |
| "Direct from source" | "Industry-leading insights" |

---

## Visual

### Colors

**Primary:** `#0A0A0A` (near-black)
Headlines, body text, primary UI elements. The default state.

**Secondary:** `#18181B` (zinc-900)
Card backgrounds, code blocks, secondary surfaces.

**Accent:** `#3B82F6` (blue-500)
Links, interactive elements, data highlights. The color of clarity.

**Good:** `#22C55E` (green-500)
Indexed, allowed, passing states.

**Warning:** `#EAB308` (yellow-500)
Needs attention. Unclear states.

**Error:** `#EF4444` (red-500)
Not indexed, blocked, errors. Demands action.

**Muted:** `#71717A` (zinc-500)
Secondary text, metadata, descriptions.

**Background:** `#FAFAFA` (zinc-50)
Page backgrounds, light surfaces.

**Avoid:** Gradients. Purples (too SaaS). Neon (too marketing). Data should feel neutral, not promotional.

### Typography

**Display:** Inter — 700 weight
Headlines, hero text, brand name.

**Body:** Inter — 400/500 weight
Paragraphs, descriptions, UI text.

**Mono:** JetBrains Mono — 400 weight
Code, terminal output, API responses, configuration. First-class citizen.

### Style

**Design keywords:** clear, minimal, data-forward, terminal-native, unhurried

**Reference brands:** Linear (systematic clarity), Vercel (developer-native), Resend (clean minimalism)

**Direction:** The identity should feel like looking through a clean window. No decoration. No noise. Data presented clearly, with space to breathe. Terminal output is the hero content. The audit output — `HIGH`, `MEDIUM`, `LOW` — is the signature visual. If it wouldn't look right next to a `curl` response, reconsider it.
