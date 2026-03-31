---
name: "Sitelint"
tagline: "Lint your site for search engines and AI."
version: 1
language: en
---

# Sitelint

## Strategy

### Overview

Sitelint is an open-source MCP server that lints websites for SEO and AI discoverability. Like ESLint catches JavaScript issues before they ship, Sitelint catches search and visibility issues before they cost you traffic.

It was born from a developer maintaining multiple personal projects — tired of juggling 5 different SEO tools, paying for dashboards he'd check once a month, and manually tuning meta tags when an AI assistant could just do it. Sitelint is the tool he wanted: plug it into your AI workflow, and it tells you what's wrong and how to fix it.

What it really does: it gives AI assistants the ability to see your site the way Google, ChatGPT, Perplexity, and every other search surface sees it — then fix the problems autonomously. It unifies PageSpeed Insights, Google Search Console, on-page analysis, technical SEO auditing, and AI-readiness checks into a single MCP server. No paid APIs. No subscriptions. No dashboards.

The problem it solves is structural: SEO tooling is fragmented, expensive, and built for marketers staring at dashboards — not for developers shipping code. The MCP ecosystem made it worse by scattering capabilities across 15+ single-purpose servers. Sitelint collapses all of it into one tool that works inside the workflow developers already use.

**Before Sitelint:** Install 5 MCP servers. Configure 5 auth flows. Get 5 different response formats. Manually cross-reference findings. Pay $38-500/mo for anything comprehensive.

**After Sitelint:** One server. One install. Your AI assistant handles the rest.

Long-term ambition: become the standard way AI assistants understand and optimize web presence — for both traditional search and generative AI.

### Positioning

**Category:** Open-source SEO & GEO linter for AI assistants.

Not a SaaS platform. Not a dashboard. Not a wrapper for a paid API. Not another single-purpose MCP server. Not a marketing tool with a chat interface bolted on.

**Competitive landscape:**
- **Top layer:** Enterprise SaaS (Semrush, Ahrefs, Moz) — $100-500/mo, built for marketing teams, dashboard-centric, feature bloat
- **Mid layer:** Focused SaaS (Frase, Otterly.AI, Profound) — $25-500/mo, narrower scope, still subscription-based
- **Bottom layer:** Open-source MCP servers — free but fragmented. 5+ PageSpeed MCPs, 9+ Search Console MCPs, 2 audit MCPs, all silos. DataForSEO MCP is comprehensive but wraps a paid API.

Sitelint sits below all of them in cost (free) and above all of them in integration (one tool, works with any AI assistant). It trades dashboards and UI chrome for raw capability that agents can use programmatically.

**Structural differentials:**
- Only unified SEO + GEO MCP server using exclusively free APIs
- Designed for AI assistants, not humans staring at screens
- Opinionated by default — flags issues with severity, not just data dumps
- Linter mental model — developers already know how linters work
- Zero vendor lock-in — MIT license, works with Claude, Cursor, Codex, any MCP client

**Territory:** Sitelint owns the intersection of "developer tooling" and "search visibility." It's the place where `bun run lint` meets "why isn't my page ranking."

### Personality

**Dominant archetype:** The Architect — systematic, precise, opinionated. Builds foundations others rely on.

**Attributes the brand transmits:** precise, open, unified, developer-native, opinionated, practical

**What it is:**
- A linter, not a dashboard
- A tool for builders, not watchers
- Opinionated with escape hatches
- Free as in freedom
- One tool that replaces five

**What it is not:**
- Not flashy or marketing-speak
- Not trying to be your SEO strategy consultant
- Not a platform that wants your monthly payment
- Not enterprise software dressed up as open source
- Not another AI wrapper with a landing page

### Promise

Your site, seen clearly — by every search surface that matters.

One install. Every check. No subscriptions.

If your AI assistant can't tell you what's wrong with your SEO, your SEO tool has failed.

**Base message:** Sitelint gives AI assistants the eyes to see what search engines and AI models see — and the knowledge to fix it.

**Synthesizing phrase:** Sitelint exists so developers never have to open an SEO dashboard again.

### Guardrails

**Tone summary:** direct, technical, confident, no-nonsense, helpful

**What the brand cannot be:**
- A salesy tool that promises "10x your traffic"
- A bloated platform that tries to do everything
- A tool that requires an SEO certification to use
- A project that treats developers as secondary users
- Anything that feels like Salesforce

**Litmus test:** If a developer wouldn't put it in their `package.json`, it's wrong.

---

## Voice

### Identity

We build linters, not dashboards. Sitelint is an open-source MCP server that tells your AI assistant what's wrong with your site's SEO and AI discoverability — and how to fix it. We don't sell subscriptions. We don't gate features. We don't require you to log into anything.

We are not a marketing platform. We are not consultants. We are not SaaS. We are a developer tool that does one job well: make your site findable by everything that searches — Google, ChatGPT, Perplexity, and whatever comes next.

We believe SEO tooling should work like every other developer tool: install it, configure it, let it run. No dashboards. No monthly emails about your "SEO health score." No upsells. Just rules, violations, and fixes.

**Essence:** The linter for the rest of the web.

### Tagline & Slogans

**Primary tagline:** Lint your site for search engines and AI.
*Use everywhere: README, homepage, social bios, conference talks.*

**Alternatives:**
- SEO and GEO analysis for AI assistants.
- One MCP server. Every search surface.
- The missing linter for web visibility.

**Slogans for different contexts:**
- README hero: "Like ESLint for your site's search visibility."
- Technical: "Unified SEO and GEO analysis over MCP. Free. Open source."
- Community: "Stop paying for dashboards. Start linting."
- GEO-forward: "Be found by Google. Be cited by AI."
- Developer pitch: "Your AI assistant's SEO toolkit."

### Manifesto

Every developer tool has a linter.

JavaScript has ESLint. CSS has Stylelint. Your code gets checked before it ships. But your site's visibility? That's still a dashboard you forget to check and a subscription you overpay for.

Search changed. It's not just Google anymore. ChatGPT cites sources. Perplexity links references. Google summarizes instead of listing. Your site needs to be found by crawlers and understood by language models.

The tools didn't keep up. SEO is still fragmented across 15 different services, each charging monthly, each returning data in a different format, each requiring its own auth flow. Developers gave up and ignored it.

We think that's broken.

Sitelint is one tool. One install. One protocol. It gives your AI assistant the ability to see your site the way every search surface sees it — and fix what's wrong. PageSpeed, Search Console, on-page analysis, technical audits, AI-readiness checks. All free. All open source.

No dashboards. No subscriptions. No "upgrade to Pro."

We built this because we needed it. We open-sourced it because everyone does.

Lint your site. Ship with confidence.

**Sitelint.**

### Message Pillars

**Unified**
One MCP server replaces five. PageSpeed, Search Console, on-page analysis, technical SEO, and AI-readiness — all in one tool. Install once, use everything.

**Open**
MIT license. Free APIs only. No paid dependencies. No vendor lock-in. Works with Claude, Cursor, Codex, and every MCP-compatible client.

**Opinionated**
Like a good linter, Sitelint has opinions. It flags issues with severity levels, not just raw data. It tells you what to fix first. Escape hatches exist for when you disagree.

**Developer-Native**
Built for `bun install`, not for marketing dashboards. Designed to run inside AI workflows, not beside them. Speaks MCP, not REST-with-a-pretty-UI.

**Future-Ready**
SEO today. GEO tomorrow. Your site needs to be found by crawlers and cited by AI models. Sitelint checks for both.

### Phrases

- "Lint your site for search engines and AI."
- "Like ESLint, but for your site's visibility."
- "One server. Every search surface."
- "No dashboards. No subscriptions. Just rules."
- "Your AI assistant's SEO toolkit."
- "Stop paying to see what's wrong with your site."
- "Found by Google. Cited by ChatGPT. Checked by Sitelint."
- "The linter for the rest of the web."

### Social Bios

**LinkedIn:**
Sitelint is an open-source MCP server that gives AI assistants the ability to analyze and fix SEO and AI discoverability issues. It unifies PageSpeed Insights, Google Search Console, on-page analysis, and AI-readiness checks into a single tool — no paid APIs, no subscriptions. Built for developers who want their sites found by search engines and cited by AI models.

**Instagram:**
Open-source SEO & GEO linter for AI assistants
One MCP server. Every search surface.
No dashboards. No subscriptions.
MIT License | Built with Bun

**X/Twitter:**
Open-source MCP server that lints your site for SEO and AI discoverability. One install, every check. No subscriptions.

**GitHub:**
Lint your site for search engines and AI. Unified SEO and GEO analysis over MCP. Free and open source.

### Tonal Rules

1. Speak in short, declarative sentences. No hedging.
2. Lead with what the tool does, not what it is.
3. Use developer vocabulary: install, configure, lint, rules, violations — not "solutions," "empower," "leverage."
4. Technical confidence without arrogance. State facts, not opinions disguised as facts.
5. Never use marketing superlatives: "revolutionary," "game-changing," "next-generation," "cutting-edge."
6. Comparisons to developer tools are always welcome. Comparisons to SaaS platforms are not.
7. Respect the reader's time. If it can be said in one line, don't use three.
8. Use code examples and terminal output over screenshots and diagrams.
9. Acknowledge limitations directly. "Sitelint doesn't do X" is better than hiding it.
10. Never promise traffic results. Promise clarity.
11. Open source is a fact, not a selling point. Don't over-celebrate it.

**Identity boundaries:**
- We are not consultants who leave a report behind.
- We are not a platform trying to become your workflow.
- We are not enterprise software with an "open-source edition."
- We are not a startup looking for your email address.
- We are not building the next Semrush. We are building the next ESLint — for search.

| We Say | We Never Say |
|---|---|
| "Install Sitelint" | "Sign up for Sitelint" |
| "Lint your site" | "Optimize your digital presence" |
| "Found by search engines and AI" | "Maximize your organic reach" |
| "One MCP server" | "All-in-one platform" |
| "Flags issues with severity" | "Actionable insights dashboard" |
| "Open source, MIT license" | "Free forever (with Pro tier)" |
| "Built for developers" | "Built for teams of all sizes" |
| "Works with any MCP client" | "Seamless integration ecosystem" |

---

## Visual

### Colors

**Primary:** `#0A0A0A` (near-black)
Headlines, body text, primary UI elements. The default state. Clean, authoritative, no decoration.

**Secondary:** `#18181B` (zinc-900)
Card backgrounds, code blocks, secondary surfaces. Provides depth without competing.

**Accent:** `#22C55E` (green-500)
Pass states, CTAs, success indicators. The "lint passed" color. Used sparingly — when something is correct or actionable.

**Warning:** `#EAB308` (yellow-500)
Warnings, medium-severity issues. The linter's caution signal.

**Error:** `#EF4444` (red-500)
Errors, high-severity issues, critical findings. Demands attention.

**Muted:** `#71717A` (zinc-500)
Secondary text, descriptions, metadata. Stays out of the way.

**Background:** `#FAFAFA` (zinc-50)
Page backgrounds, light mode surfaces. Clean, not sterile.

**Avoid:** Gradients, blues (too corporate), purples (too SaaS), any neon or saturated palette that signals "marketing tool."

### Typography

**Display:** Inter — 700 weight
Headlines, hero text, brand name. Clean geometric sans-serif. Same family used by Linear and Vercel.

**Body:** Inter — 400/500 weight
Paragraphs, descriptions, UI text. Highly legible at all sizes.

**Mono:** JetBrains Mono — 400 weight
Code examples, terminal output, tool names, configuration snippets. This is a developer tool — monospace is a first-class citizen, not an afterthought.

### Style

**Design keywords:** systematic, minimal, structured, terminal-native, monochrome-with-signal

**Reference brands:** Linear (systematic clarity), Vercel (developer-native), Resend (clean minimalism), ESLint (linter authority)

**Direction:** The identity should communicate precision and utility, not decoration. Every visual element should feel like it belongs in a terminal or a well-designed README. If it wouldn't look right in a `--help` output, reconsider it.
