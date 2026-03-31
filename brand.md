---
name: "Pagesight"
tagline: "Lint your site for search engines and AI."
version: 2
language: en
---

# Pagesight

## Strategy

### Overview

Pagesight is an open-source MCP server that gives AI assistants direct access to how search engines and AI crawlers see your site. Google's index status, Core Web Vitals, search performance, structured data validation — plus a robots.txt analyzer that audits 139+ AI crawlers. All from authoritative sources, not made-up rules.

It was born from a developer maintaining multiple personal projects — tired of juggling SEO tools that flag "title too long" and "only one H1 allowed" when Google itself says those rules don't exist. Pagesight skips the myths and asks the sources directly: is this page indexed? What canonical did Google choose? Is GPTBot blocked or allowed? How fast is it for real Chrome users?

What it really does: it wraps three Google APIs — Search Console, PageSpeed Insights, and Chrome UX Report — plus an RFC 9309-compliant robots.txt analyzer with a live AI crawler registry into a single MCP server. Your assistant can inspect a URL, check performance, audit which AI bots can access your content, and diagnose search issues without you opening a dashboard.

The problem it solves: SEO tooling is built for marketers staring at dashboards, not developers shipping code. The MCP ecosystem fragmented it further — 15+ single-purpose servers, each wrapping one API, each with its own auth flow. And most SEO tools report rules that Google has explicitly debunked.

**Before Pagesight:** Install 5 MCP servers. Configure 5 auth flows. Get flagged for "multiple H1 tags" and "title over 60 characters" — neither of which Google cares about.

**After Pagesight:** One server. Google APIs + AI crawler intelligence. Only data from authoritative sources.

Long-term ambition: become the standard way AI assistants understand and optimize web presence — for both traditional search and generative AI.

### Positioning

**Category:** Open-source Google Search intelligence for AI assistants.

Not a SaaS platform. Not a dashboard. Not a wrapper for a paid API. Not another single-purpose MCP server. Not a tool that invents rules.

**Competitive landscape:**
- **Top layer:** Enterprise SaaS (Semrush, Ahrefs, Moz) — $100-500/mo, built for marketing teams, dashboard-centric, hundreds of made-up "SEO scores"
- **Mid layer:** Focused SaaS (Frase, Otterly.AI, Profound) — $25-500/mo, narrower scope, still subscription-based
- **Bottom layer:** Open-source MCP servers — free but fragmented. 5+ PageSpeed MCPs, 9+ Search Console MCPs, all silos with partial API coverage. DataForSEO MCP is comprehensive but wraps a paid API.

Pagesight sits below all of them in cost (free) and above all of them in accuracy (Google's own data, not approximations). It trades dashboards for raw API access that agents can use programmatically.

**Structural differentials:**
- Only MCP server unifying Google Search Console + PageSpeed Insights + Chrome UX Report + AI crawler audit
- Reports what authoritative sources report. Doesn't invent rules, scores, or thresholds.
- robots.txt analysis per RFC 9309 with 139+ AI crawlers from a live community registry
- Full Google API coverage — every read-only method, every parameter, every dimension
- Designed for AI assistants, not humans clicking through tabs
- Zero vendor lock-in — MIT license, works with Claude, Cursor, Codex, any MCP client

**Territory:** Pagesight owns the intersection of "developer tooling" and "Google Search data." The tool that makes Google's APIs conversational.

### Personality

**Dominant archetype:** The Architect — systematic, precise, evidence-based. Builds on verified foundations, not assumptions.

**Attributes the brand transmits:** precise, honest, unified, developer-native, evidence-based, practical

**What it is:**
- Google's data, made accessible to AI assistants
- A tool for builders who want facts, not opinions
- Evidence over convention
- Free as in freedom
- One tool that replaces five

**What it is not:**
- Not a tool that invents SEO rules
- Not a score generator that makes up numbers
- Not trying to be your SEO consultant
- Not a platform that wants your monthly payment
- Not enterprise software dressed up as open source

### Promise

Your site, seen through Google's eyes.

One install. Three APIs. No made-up rules.

If your AI assistant can't ask Google about your site, your SEO tool has failed.

**Base message:** Pagesight gives AI assistants direct access to what Google knows about your site — index status, performance, Core Web Vitals, search queries — so they can diagnose and fix issues with real data.

**Synthesizing phrase:** Pagesight exists so developers never have to open an SEO dashboard again.

### Guardrails

**Tone summary:** direct, technical, confident, evidence-based, helpful

**What the brand cannot be:**
- A tool that promises "10x your traffic"
- A score generator that assigns arbitrary numbers
- A tool that flags "issues" Google says don't matter
- A project that treats developers as secondary users
- Anything that feels like Salesforce

**Litmus test:** If Google's own documentation doesn't support the claim, don't make it.

---

## Voice

### Identity

We don't make up rules. We ask Google. Pagesight is an open-source MCP server that connects AI assistants to Google Search Console, PageSpeed Insights, and Chrome UX Report — the same data Google uses to evaluate your site.

We are not a marketing platform. We are not consultants. We are not SaaS. We are a developer tool that does one job well: make Google's search data accessible to AI assistants.

Most SEO tools flag "title over 60 characters" and "only one H1 allowed." Google's own engineers have said these rules are made up. We researched every common SEO rule against official documentation and built a tool that only reports what Google actually tells us.

**Essence:** Google's data, your AI assistant's hands.

### Tagline & Slogans

**Primary tagline:** Lint your site for search engines and AI.
*Use everywhere: README, homepage, social bios, conference talks.*

**Alternatives:**
- Google's search data + AI crawler intelligence for AI assistants.
- One MCP server. Three Google APIs. 139+ AI bots tracked.
- Ask Google, not SEO tools.

**Slogans for different contexts:**
- README hero: "Google Search Console + PageSpeed + CrUX in one MCP server."
- Technical: "Three Google APIs. Seven tools. One install."
- Community: "Stop guessing. Ask Google."
- Myth-busting: "Title length limits? Google says they don't exist. We checked."
- Developer pitch: "Your AI assistant's direct line to Google Search."

### Manifesto

Most SEO tools are built on myths.

"Title must be under 60 characters." Google: "there's no limit." "Only one H1 per page." John Mueller: "You can use H1 tags as often as you want." "Meta description must be 155 characters." Google: "There's no limit on how long a meta description can be." "Minimum 300 words per page." Mueller: "Word count is not a quality factor."

We checked every rule. We read the documentation. We watched the office hours. Most of what SEO tools flag has no basis in anything Google has ever said.

So we built something different.

Pagesight doesn't make up rules. It asks Google directly. Three APIs — Search Console, PageSpeed Insights, Chrome UX Report — unified into one MCP server that your AI assistant can use.

Is this page indexed? Ask Google. What canonical did Google choose? Ask Google. How fast is this page for real users? Ask Google. What queries bring traffic? Ask Google.

No scores we invented. No thresholds we made up. No "best practices" that are actually just blog posts from 2015.

Just Google's data. In your AI assistant's hands.

**Pagesight.**

### Message Pillars

**Evidence-Based**
Every data point comes from authoritative sources — Google's APIs, RFC 9309, community-maintained bot registries. We don't invent rules, assign scores, or set thresholds. If the source doesn't support it, we don't report it.

**Unified**
Three Google APIs plus AI crawler intelligence in one MCP server. Search Console for indexing and search data. PageSpeed Insights for Lighthouse audits. Chrome UX Report for real-world performance. robots.txt analyzer for AI bot access control. Eight tools. One install.

**Open**
MIT license. Free APIs only. No paid dependencies. No vendor lock-in. Works with Claude, Cursor, Codex, and every MCP-compatible client.

**Developer-Native**
Built with Bun. Configured with env vars. Speaks MCP over stdio. Designed to run inside AI workflows, not beside them. No dashboard. No browser. No login page.

**Myth-Free**
We researched every common SEO rule against Google's official documentation. Title length limits, H1 requirements, word count minimums — all debunked. Pagesight only reports what Google actually cares about.

### Phrases

- "Lint your site for search engines and AI."
- "Google's data, your AI assistant's hands."
- "One server. Three APIs. 139 bots. No made-up rules."
- "Stop guessing. Ask Google."
- "Your AI assistant's direct line to Google Search."
- "Is GPTBot blocked? Ask Pagesight."
- "Title length limits? Google says they don't exist."
- "We checked every SEO rule. Most are myths."
- "If the source doesn't report it, neither do we."

### Social Bios

**LinkedIn:**
Pagesight is an open-source MCP server that gives AI assistants direct access to Google Search Console, PageSpeed Insights, and Chrome UX Report. Inspect indexing status, track Core Web Vitals, analyze search performance — with real data from Google's APIs, not made-up rules. Built with Bun. MIT license.

**Instagram:**
Open-source MCP server for AI assistants
Google Search Console + PageSpeed + CrUX
No dashboards. No made-up rules. Just Google's data.
MIT License | Built with Bun

**X/Twitter:**
Open-source MCP server that gives AI assistants direct access to Google Search Console, PageSpeed Insights, and CrUX. No made-up SEO rules. Just Google's data.

**GitHub:**
Lint your site for search engines and AI. Google Search Console + PageSpeed Insights + Chrome UX Report in one MCP server.

### Tonal Rules

1. Speak in short, declarative sentences. No hedging.
2. Lead with what the tool does, not what it is.
3. Use developer vocabulary: install, configure, query, inspect — not "solutions," "empower," "leverage."
4. When citing an SEO claim, always reference the source. "Google says X" with a link, not "best practice suggests."
5. Never use marketing superlatives: "revolutionary," "game-changing," "next-generation," "cutting-edge."
6. When debunking a myth, quote the Google engineer directly. Names and dates.
7. Respect the reader's time. If it can be said in one line, don't use three.
8. Use code examples and terminal output over screenshots and diagrams.
9. Acknowledge what we don't cover. "Pagesight doesn't do X" is better than hiding it.
10. Never promise traffic results. Promise access to data.
11. Open source is a fact, not a selling point. Don't over-celebrate it.
12. "Google says" is our strongest argument. Use it.

**Identity boundaries:**
- We are not consultants who leave a report behind.
- We are not a platform trying to become your workflow.
- We are not a score generator that makes up numbers.
- We are not a startup looking for your email address.
- We are not building the next Semrush. We are building a bridge to Google's APIs.

| We Say | We Never Say |
|---|---|
| "Install Pagesight" | "Sign up for Pagesight" |
| "Ask Google" | "Optimize your digital presence" |
| "Google reports this page is not indexed" | "Our analysis shows SEO score 73/100" |
| "One MCP server, three Google APIs" | "All-in-one platform" |
| "CrUX shows p75 LCP of 2.1s" | "Your page speed needs improvement" |
| "Open source, MIT license" | "Free forever (with Pro tier)" |
| "Built for AI assistants" | "Built for teams of all sizes" |
| "Works with any MCP client" | "Seamless integration ecosystem" |

---

## Visual

### Colors

**Primary:** `#0A0A0A` (near-black)
Headlines, body text, primary UI elements. The default state. Clean, authoritative, no decoration.

**Secondary:** `#18181B` (zinc-900)
Card backgrounds, code blocks, secondary surfaces. Provides depth without competing.

**Accent:** `#4285F4` (Google blue)
Links, interactive elements, data highlights. References Google as the data source. Used sparingly.

**Good:** `#22C55E` (green-500)
Pass states, "indexed" indicators, good CrUX ratings. The "everything is fine" color.

**Warning:** `#EAB308` (yellow-500)
Warnings, "needs improvement" CrUX ratings. Attention without alarm.

**Error:** `#EF4444` (red-500)
Errors, "not indexed" states, poor CrUX ratings. Demands action.

**Muted:** `#71717A` (zinc-500)
Secondary text, descriptions, metadata. Stays out of the way.

**Background:** `#FAFAFA` (zinc-50)
Page backgrounds, light mode surfaces. Clean, not sterile.

**Avoid:** Gradients, purples (too SaaS), any neon or saturated palette that signals "marketing tool." Don't overuse Google blue — it's an accent, not a primary.

### Typography

**Display:** Inter — 700 weight
Headlines, hero text, brand name. Clean geometric sans-serif. Same family used by Linear and Vercel.

**Body:** Inter — 400/500 weight
Paragraphs, descriptions, UI text. Highly legible at all sizes.

**Mono:** JetBrains Mono — 400 weight
Code examples, terminal output, tool names, API responses, configuration snippets. This is a developer tool — monospace is a first-class citizen, not an afterthought.

### Style

**Design keywords:** systematic, minimal, structured, terminal-native, data-forward

**Reference brands:** Linear (systematic clarity), Vercel (developer-native), Resend (clean minimalism), Google Search Console (data authority)

**Direction:** The identity should communicate precision and data integrity, not decoration. Every visual element should feel like it belongs in a terminal or a well-designed README. Data tables and API responses are the hero content, not illustrations. If it wouldn't look right next to a `curl` output, reconsider it.
