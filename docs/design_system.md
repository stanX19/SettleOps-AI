# Claims Engine — Frontend Design System & Tech Stack

**Project:** Claims Engine (UMHackathon 2026, Domain 1)
**Audience:** Frontend engineer (primary), AI and backend engineers (reference for interface contracts)
**Document purpose:** Every visual and interaction decision for the Claims Engine UI. If you can't find the answer here, ask before inventing.
**Pairs with:** PRD and System Analysis Document (SAD)

---

## 1. Design direction

### 1.1 The aesthetic we're committing to

**Editorial-operational.** Think Bloomberg Terminal crossed with Linear, but for an insurance office — not Silicon Valley. Not a "consumer fintech" look. Not a "hackathon demo" look. We are a serious enterprise decision-support tool, and the UI should read that way the instant a judge sees it.

The design language is built on four commitments:

1. **Density over whitespace.** A claims officer wants to see a lot of information at once. Dashboards that feel airy and spaced-out look underpowered. We use tight vertical rhythm, disciplined use of real estate, and small typography. A judge should feel the UI is *loaded with thinking*, not styled for a screenshot.

2. **Monospace for data, serif for headers, sans for UI.** Three fonts, three jobs, no overlap. Data (JSON, extracted facts, evidence citations, payout numbers) lives in a refined monospace. Section headers use a serif to feel editorial and authoritative. Everything else — buttons, labels, navigation — uses a clean sans. This typographic trichotomy does more lifting than any color choice.

3. **Muted palette with one signal color.** Ink-black text on warm off-white background. Slate and stone neutrals. One single accent color — burnt amber — used exclusively to indicate *active reasoning*. When the Fraud agent raises a concern, when the Auditor challenges, when a field needs attention, it goes amber. Nothing else.

4. **Stillness, then motion.** The dashboard sits still. Then agents activate and the middle pane comes alive. Then it settles again. Motion is earned and purposeful; we don't have decorative transitions. When things move, it's because reasoning is happening.

### 1.2 What we're explicitly NOT doing

These are the AI/hackathon clichés we avoid:

- No purple gradients. No "AI glow" effects. No neon accents.
- No glassmorphism, no frosted backdrops.
- No dark mode as the default. Claims officers work in fluorescent-lit offices all day; light mode is correct. (Dark mode is supported but secondary.)
- No emoji anywhere in the product UI. (Emoji in pitch slides is fine, not in the product.)
- No "chatbot bubbles." No rounded speech balloons. No AI-avatar icons. Agents are nodes in a graph, not characters.
- No Inter, no Roboto, no system-font stacks. We pick distinctive typefaces.
- No full-width hero sections. This is a working dashboard, not a landing page.

### 1.3 The one thing judges will remember

The middle pane of the dashboard — the live agent graph — is the visual anchor. Every design decision in this document exists to make that pane sing. If a judge remembers one screenshot from the demo, it should be the middle pane mid-animation, with an arrow visibly traveling backward from Auditor to Liability as the Auditor challenges.

---

## 2. Typography

### 2.1 Type families

| Role | Family | Source | Usage |
|------|--------|--------|-------|
| Display / section headers | **GT Sectra** or **Tiempos Headline** (paid); free alternative: **Fraunces** | Google Fonts (Fraunces) | Section headings, pane titles, page titles |
| Body UI | **Söhne** (paid); free alternative: **Geist Sans** or **Work Sans** | Vercel (Geist) or Google Fonts (Work Sans) | Buttons, labels, navigation, body copy |
| Data / monospace | **JetBrains Mono** or **Berkeley Mono** (paid); free: **JetBrains Mono** | Google Fonts | JSON blackboard, payout numbers, agent IDs, evidence citations, timestamps |

**Recommended free stack for the hackathon:**
- **Fraunces** (display — variable font, supports tight optical sizing)
- **Geist Sans** (UI — Vercel's in-house sans, clean but not generic)
- **JetBrains Mono** (data — reads as "engineering tool")

This combination costs nothing, loads fast via next/font, and hits the editorial-operational tone we want. Do not substitute without team discussion.

### 2.2 Type scale

All sizes in rem. Base is 14px (set on `html`), which is deliberately smaller than the usual 16px — it's the density commitment.

```
Display L    2.25rem / 31.5px   Fraunces    500   -0.02em    Page titles only (rare)
Display M    1.75rem / 24.5px   Fraunces    500   -0.015em   Pane titles on dashboard
Display S    1.375rem / 19px    Fraunces    500   -0.01em    Section headers
Body L       1.125rem / 15.75px Geist Sans  400                Primary readable text
Body         1rem / 14px        Geist Sans  400                Default body, labels
Body S       0.875rem / 12.25px Geist Sans  400                Secondary text, metadata
Caption      0.75rem / 10.5px   Geist Sans  500   0.04em       Uppercase labels only
Data L       1.25rem / 17.5px   JetBrains   400                Payout amounts
Data         0.9375rem / 13px   JetBrains   400                JSON values, plate numbers
Data S       0.8125rem / 11.4px JetBrains   400                Timestamps, IDs
```

### 2.3 Rules of use

- **Never use Fraunces below Display S** (1.375rem). Serifs below 18px look amateur on screens.
- **Monospace is only for machine-generated text.** Human-written prose (narrative, rationale, decision letter body) uses Geist Sans. Policy clauses quoted verbatim use Geist Sans italic.
- **No text below 11px ever.** Accessibility baseline.
- **Line-height:** display 1.1, body 1.5, data 1.4.
- **Sentence case for everything.** Never Title Case. Never ALL CAPS except for Caption-style uppercase labels (e.g. "AGENT STATUS").

---

## 3. Color

### 3.1 The palette

One neutral ramp, one accent, two semantic states. That's it.

```
Neutrals (Stone)
  --stone-50:   #FAFAF7   Page background
  --stone-100:  #F4F3EE   Surface background (panes)
  --stone-200:  #E8E6DD   Dividers, subtle borders
  --stone-300:  #D4D1C3   Hover states on dividers
  --stone-400:  #9B988A   Tertiary text, disabled state
  --stone-500:  #6B6860   Secondary text
  --stone-700:  #3D3B35   Body text
  --stone-900:  #1C1B17   Primary text, headings

Accent (Amber — reserved for ACTIVE REASONING)
  --amber-50:   #FAF5E9   Accent background wash
  --amber-200:  #EDD79F   Accent border
  --amber-500:  #B8872D   Accent primary (Auditor arrow, active agent pulse)
  --amber-700:  #7A5A1C   Accent strong (text on amber-50)

Semantic — Success (used sparingly, only for "done" states)
  --success-50: #EFF2E8
  --success-500: #5A7D3A
  --success-700: #3A5424

Semantic — Danger (fraud signals, escalation)
  --danger-50:  #F5E8E5
  --danger-500: #A33D28
  --danger-700: #6E2918
```

### 3.2 Color rules

- **Background:** always `--stone-50`. Never white (`#FFFFFF`). The warm off-white signals "editorial document," not "tech app."
- **Surface:** panes use `--stone-100`, one step warmer than the background. Borders are `--stone-200` at 0.5px.
- **Text:** primary is `--stone-900`, secondary is `--stone-500`, never use pure black (`#000`).
- **Amber is reserved.** Use it only for:
  - The currently-active agent node in the middle pane (pulsing amber)
  - The Auditor challenge arrow
  - Fields requiring attention
  - The "Action required" badge on the escalation card
  Never use amber for decoration, buttons at rest, or headings.
- **Success green** appears only on "completed" agent nodes in the middle pane and the "Approved" status badge. Everywhere else, "done" is just monochrome.
- **Danger red** appears only for fraud signals, escalation flags, and destructive action confirmations (override override). Not for errors generally — field validation errors use amber.

### 3.3 Dark mode (secondary)

Dark mode exists for the accessibility baseline but is not the demo default. Palette inverts cleanly:

```
Neutrals (Ink)
  --ink-50:    #1C1B17   Page background
  --ink-100:   #24231E   Surface
  --ink-200:   #2F2E28   Dividers
  --ink-500:   #8A887D   Secondary text
  --ink-900:   #E8E5DA   Primary text

Amber stays the same hue, slightly brighter:
  --amber-500 (dark): #D4A040
```

Implement via `prefers-color-scheme` media query with a manual toggle override. Test both modes on day 4.

---

## 4. Layout and grid

### 4.1 Page frame

The application uses two top-level layouts:

**A) Claimant submission view** (`/file-claim`)
Single-column, max-width 640px, centered. Mobile-responsive (stacks cleanly at phone widths).

**B) Claims officer dashboard** (`/dashboard/[caseId]`)
Full-viewport three-column layout. Minimum width 1280px (we do not support tablet widths for the dashboard). At narrower widths, show a message: *"Claims Engine is optimized for desktop displays."*

### 4.2 Dashboard grid specification

The dashboard is the hero. Its proportions are fixed:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  TOP BAR  (56px)  — insurer logo, case ID, status pill, user avatar              │
├────────────────────┬─────────────────────────────────────────┬───────────────────┤
│                    │                                         │                   │
│  INPUTS PANE       │  WORKFLOW PANE                          │  BLACKBOARD PANE  │
│  25% width         │  50% width                              │  25% width        │
│  min-width 320px   │  min-width 560px                        │  min-width 320px  │
│                    │                                         │                   │
│                    │                                         │                   │
│                    │                                         │                   │
├────────────────────┴─────────────────────────────────────────┴───────────────────┤
│  ACTION BAR  (72px)  — Approve, Override, Export PDF, escalate to human          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Panes are divided by 0.5px vertical rules** in `--stone-200`, not by gaps or shadows. Adjacent panes touch.
- **Each pane scrolls independently** when content overflows. No nested scrolling within panes.
- **Top bar is sticky.** Action bar is sticky at the bottom.
- **Padding inside each pane:** 24px horizontal, 20px vertical. Tight.

### 4.3 Spacing scale

We use an 8px base grid, with a 4px half-step allowed where density requires it.

```
space-0.5:  4px     Tight internal padding, icon offsets
space-1:    8px     Default gap between related elements
space-2:    16px    Gap between groups of elements
space-3:    24px    Pane padding, section separation
space-4:    32px    Major layout separation
space-6:    48px    Page-level separation (rare on dashboard, common on claimant view)
```

Never invent values. If 8px feels too tight and 16px too loose, pick one and adjust the content instead of creating new spacing.

---

## 5. The three panes, in detail

This section is the most important in the document. Read it twice before writing any dashboard code.

### 5.1 Inputs pane (left, 25%)

**Purpose:** show the claims officer — and the judge — what's coming into the system. Creates contrast with the processing happening in the middle pane.

**Structure from top to bottom:**

1. **Pane header** — "Inputs" in Display S (Fraunces), with a subtle document icon to the right
2. **Documents list** — four items, each a card:
   - Police report PDF (with filename, page count, first 2-line preview)
   - Adjuster's report PDF (same format)
   - Insurance policy PDF (same format)
   - Repair quotation (same format)
3. **Photos grid** — 2-column grid of 80px-square thumbnails, with image count badge
4. **Chat transcript** — collapsed by default into a "View chat" link; expands inline to show the WhatsApp-style messages

**Visual details:**

- Each document card: `--stone-100` background, 0.5px `--stone-200` border, 12px padding. No rounded corners over 4px — keep it editorial, not app-y.
- Hover on a document card shows a subtle `--stone-200` background shift.
- Clicking a document opens a modal PDF preview (react-pdf or a simple iframe).
- Photo thumbnails have 0.5px borders, click to lightbox.
- Chat messages: left-aligned for claimant (stone-500 label), right-aligned for third-party (stone-700 label), no colored bubbles — just alignment and small timestamp metadata.

**What the pane does NOT do:**
- No animations. This pane is deliberately still.
- No editing. Documents are read-only.
- No colors beyond the neutral palette.

### 5.2 Workflow pane (middle, 50%) — the hero

**Purpose:** show the six agents coordinating in real time. This is the pane that wins the hackathon.

**Library:** React Flow v11 (https://reactflow.dev). Non-negotiable. Do not hand-build this.

**Structure:**

```
┌──────────────────────────────────────────────────────────────┐
│  Pane header: "Workflow"     Progress: ●●●○○○  status badge  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│          [Intake]                                            │
│             ↓                                                │
│     ┌───────┼───────┐                                        │
│     ↓       ↓       ↓                                        │
│  [Policy][Liability][Fraud]                                  │
│     └───────┼───────┘                                        │
│             ↓                                                │
│          [Payout]                                            │
│             ↓                                                │
│         [Auditor] ←───┐                                      │
│             ↓          │ challenge                           │
│         [Decision]     │                                     │
│                        │                                     │
│                    (to Liability when challenged)            │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Agent timeline: Intake 2.4s → Policy 3.1s → Liability 4.7s  │
│                  → Fraud 3.8s → Payout 2.2s → Auditor 1.9s   │
└──────────────────────────────────────────────────────────────┘
```

**Node design (each agent):**

A node is a 140px × 72px rectangle with 2px rounded corners. Four visual states:

| State | Background | Border | Text | Animation |
|-------|-----------|--------|------|-----------|
| Idle | `--stone-100` | 0.5px `--stone-200` | `--stone-500` | None |
| Active | `--amber-50` | 1px `--amber-500` | `--amber-700` | Subtle pulse (opacity 0.85 → 1.0, 1.2s ease-in-out, infinite while active) |
| Done | `--success-50` | 0.5px `--success-500` | `--stone-900` | None |
| Challenged | `--danger-50` | 1px `--danger-500` | `--danger-700` | Single shake (0.4s) when challenge arrives, then settles |

Node contents, top to bottom:
- **Agent name** in Body S sans, medium weight (e.g. "Policy")
- **Status line** in Data S monospace (e.g. "idle" / "reading policy.pdf" / "done · 3.1s")
- **Confidence bar** — a 1px tall bar showing confidence (0-100%), hidden when idle, appears on done. Color matches state.

**Edges (arrows between nodes):**

- Idle edges: 0.5px `--stone-300`, straight or gently curved
- Active edges: 1px `--amber-500` with a traveling dot animation (CSS keyframes, 1.5s linear infinite)
- Completed edges: 0.5px `--stone-500`
- **Challenge edge** (backward from Auditor): 1px `--amber-500`, dashed (4px-4px), with an arrowhead. Animates in with a 600ms slide-in from Auditor to the target node. This is the moment. Make it perfect.

**The timeline strip at the bottom:**

A horizontal bar showing each agent's execution time as it completes. Looks like:

```
Intake 2.4s  ━━  Policy 3.1s  ━━  Liability 4.7s  ━━  Fraud 3.8s  ━━  Payout 2.2s  ━━  Auditor 1.9s
```

In monospace, `--stone-500`. When an Auditor loop happens, the timeline extends with `⟲ Liability-retry 3.2s  ━━  Payout-retry 1.8s  ━━  Auditor 1.4s` in `--amber-500`.

### 5.3 Blackboard pane (right, 25%)

**Purpose:** show the structured output accumulating as agents complete. This converts skepticism into "oh, this is a workflow."

**Structure:**

Section-by-section, top to bottom, each appearing as its agent completes:

1. **case_id, timestamp, status** — always shown, populated from the moment of submission
2. **case_facts** — populated when Intake completes
3. **policy_verdict** — populated when Policy completes
4. **liability_verdict** — populated when Liability completes
5. **fraud_assessment** — populated when Fraud completes
6. **payout_recommendation** — populated when Payout completes
7. **audit_result** — populated when Auditor completes

**Rendering style:**

Each section is a collapsible card. Headers in Body S caps:

```
▾ CASE FACTS                                         3.1s
    incident.datetime    "2026-03-15T14:32:00+08:00"
    incident.location    "Jalan Tun Razak, KL"
    vehicles[0].plate    "WXY 1234"
    vehicles[0].damage   ["rear_bumper", "rear_right_panel"]
    narrative            "Claimant was stationary at..."
    [expand 3 more fields]
```

- Field names: Data, `--stone-500`
- Field values: Data, `--stone-900`
- Quoted strings in `--stone-900`, wrapped in quotes
- Numbers without quotes
- Arrays shown inline if ≤3 items, collapsed otherwise
- Long strings truncated to 80 chars with "expand" link
- Each section has a completion timestamp on the right in Data S

**Key interactions:**

- Click any value → copies to clipboard with a brief toast
- Click a section header → collapses/expands
- Click "view full" → opens a modal with the complete JSON for that section
- When Auditor challenges a section, that section gets a 1px `--amber-500` left border and an "⟲ Challenged" tag

### 5.4 Top bar

Fixed height 56px. Contents, left to right:

- Insurer logo or mark (configurable per tenant post-hackathon; for demo use a placeholder mark)
- Breadcrumb: `Claims / CLM-2026-00812` in Body S
- Center: empty (don't fill)
- Right: case status pill (see Status Badges in section 6.2), claims officer avatar + name

Background: `--stone-50`, bottom border 0.5px `--stone-200`.

### 5.5 Action bar

Fixed height 72px at the bottom. Contents, left to right:

- **"Review reasoning"** link — opens a modal with the full agent reasoning trace
- Empty middle
- **"Export PDF"** button — secondary style
- **"Override"** button — secondary style
- **"Approve"** button — primary style, amber when a decision is ready for review

When the case is in "awaiting approval" state, the Approve button pulses subtly until clicked.

---

## 6. Component library

Everything below is built with Tailwind utility classes on top of the design tokens. We do not use a component library (no shadcn, no MUI, no Mantine) — they carry visual opinions that fight with ours.

### 6.1 Buttons

Three sizes: sm (28px), md (36px), lg (44px). Default is md.

**Primary button:**
```
Background: --stone-900
Text: --stone-50
Border: none
Hover: --stone-700 background
Active: scale(0.98)
Disabled: --stone-400 bg, --stone-200 text
```

**Primary amber button** (only for "Approve" when ready):
```
Background: --amber-500
Text: white
Hover: --amber-700
```

**Secondary button:**
```
Background: transparent
Text: --stone-900
Border: 0.5px --stone-300
Hover: --stone-100 background
```

**Ghost button:**
```
Background: transparent
Text: --stone-500
Border: none
Hover: --stone-100 background
```

All buttons: Body S text, medium weight, 12px horizontal padding per size step. Rounded 4px only. Never larger rounding.

### 6.2 Status badges

Small pills for case status, agent status, and inline labels.

```
Running       --amber-50 bg,  --amber-700 text,  --amber-500 border  "Running"
Approved      --success-50 bg, --success-700 text, --success-500 border  "Approved"
Escalated     --danger-50 bg, --danger-700 text, --danger-500 border  "Escalated"
Draft         --stone-200 bg, --stone-700 text, no border  "Draft"
```

Height 22px, 8px horizontal padding, 2px border radius, Body S caps with 0.04em tracking.

### 6.3 Cards

All "document cards," "agent detail cards," "section cards" share one pattern:

```
Background: --stone-100
Border: 0.5px --stone-200
Radius: 4px
Padding: 16px
Hover: border shifts to --stone-300, 120ms ease
```

No drop shadows. Ever.

### 6.4 Forms (claimant submission view)

- Inputs: 40px tall, 0.5px `--stone-300` border, `--stone-50` background, 12px horizontal padding
- Focus state: 1.5px `--stone-900` border (no glow, no ring)
- Labels: Caption above input, `--stone-700`, 4px bottom margin
- File uploaders: dashed 1px `--stone-300` border, 96px tall, drag-and-drop zone with "or click to browse" text
- Validation errors: inline below field in `--danger-700`, Body S

### 6.5 Modals

- Backdrop: `rgba(28, 27, 23, 0.4)` (ink tint)
- Modal: `--stone-50` background, 0.5px `--stone-300` border, 4px radius, max-width 720px
- Header: 24px padding, Display S title, close button top-right
- Body: 24px padding
- No full-screen modals, no sliding drawers — classic centered modal only

### 6.6 Toasts

Appear bottom-right, 16px margin from corner. `--stone-900` background, `--stone-50` text, Data S mono for technical messages, Body S sans for human messages. Auto-dismiss after 3 seconds. Stack vertically if multiple.

---

## 7. Motion and animation

### 7.1 Philosophy

Motion indicates reasoning is happening. When the UI is still, the system is waiting. When it moves, something is being decided. Never animate for decoration.

### 7.2 Duration tokens

```
duration-instant:  0ms     No transition (for things that must feel immediate)
duration-quick:    120ms   Hover states, small shifts
duration-default:  240ms   Most transitions
duration-slow:     400ms   Pane transitions, modal open
duration-pulse:    1200ms  Active-agent pulse cycle
duration-travel:   1500ms  Data-particle travel along an edge
```

### 7.3 Easing

Two curves only:

- `--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)` — default for entering/revealing
- `--ease-in-out-quad: cubic-bezier(0.45, 0, 0.55, 1)` — for pulse loops and traveling dots

No bouncy easing. No elastic. No spring physics.

### 7.4 Key animations

**Agent activation pulse:**
```css
@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
.agent-node.active {
  animation: agent-pulse 1.2s var(--ease-in-out-quad) infinite;
}
```

**Data particle traveling along an edge:**
```css
@keyframes edge-travel {
  from { offset-distance: 0%; }
  to { offset-distance: 100%; }
}
.edge-particle {
  offset-path: path("M0,0 C100,0 100,50 200,50");
  animation: edge-travel 1.5s linear infinite;
}
```
React Flow supports custom edge components; implement this there.

**Auditor challenge arrow slide-in:**
```css
@keyframes challenge-appear {
  from { opacity: 0; stroke-dashoffset: 100; }
  to { opacity: 1; stroke-dashoffset: 0; }
}
.challenge-edge {
  stroke-dasharray: 4 4;
  animation: challenge-appear 600ms var(--ease-out-quart) forwards;
}
```

**Approve button ready pulse:**
```css
@keyframes ready-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(184, 135, 45, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(184, 135, 45, 0); }
}
.btn-primary-ready {
  animation: ready-pulse 2s var(--ease-in-out-quad) infinite;
}
```

### 7.5 Reduced motion

Respect `prefers-reduced-motion: reduce`. When set:
- Disable all infinite loops (agent pulse, button ready pulse, edge particles)
- Keep state-change transitions (challenged, done) but shorten to instant
- The agent timeline still updates, just without animation

---

## 8. Iconography

### 8.1 Library

**Lucide React.** Installed via `lucide-react`. One icon set, used consistently.

### 8.2 Sizing

- Inline icons (within text): 14px
- Button icons: 16px
- Standalone icons (in cards, status badges): 20px
- Large decorative icons: 24px (max)

### 8.3 Usage rules

- Icons always have a semantic meaning. No decorative icons.
- Icons always paired with text labels in navigation and buttons. Icon-only only for obvious actions (close X, expand/collapse chevron).
- Icons inherit color from their parent — no colored icons.

### 8.4 Specific icon choices

| Concept | Icon |
|---------|------|
| Document | `FileText` |
| PDF | `FileType` |
| Photo | `Image` |
| Chat | `MessageSquare` |
| Policy | `Scale` |
| Liability | `Scale` (same — context disambiguates) |
| Fraud | `ShieldAlert` |
| Auditor | `Gavel` |
| Payout | `Coins` |
| Intake | `Inbox` |
| Approve | `Check` |
| Override | `PencilLine` |
| Escalate | `Flag` |
| Expand | `ChevronDown` |
| External link | `ArrowUpRight` |

No custom SVGs except the insurer logo placeholder.

---

## 9. Accessibility

### 9.1 Non-negotiable baselines

- All text meets WCAG AA contrast against its background (4.5:1 for body, 3:1 for large text)
- All interactive elements have visible focus states (1.5px `--stone-900` outline, 2px offset, 0 radius)
- All icons paired with text or have `aria-label`
- All form fields have associated labels
- Keyboard navigation works for every action (test with tab-only flow)
- Screen reader announcements for agent state changes via `aria-live="polite"` regions

### 9.2 Specific WCAG concerns in our palette

The amber-500 (#B8872D) on stone-50 (#FAFAF7) contrast is 4.9:1 — passes AA for body text. Amber-500 on amber-50 (#FAF5E9) is 4.4:1 — slightly under AA. Solution: amber-500 is *only* used for borders and animated elements on amber-50 backgrounds, never for text. Text on amber-50 is always amber-700.

Verify all combinations with WebAIM's contrast checker on day 4.

---

## 10. Tech stack

### 10.1 Framework and core

| Concern | Choice | Version | Rationale |
|---------|--------|---------|-----------|
| Framework | **Next.js (App Router)** | 14+ | File-based routing, built-in SSR if we need it, strong default tooling |
| Language | **TypeScript** | 5+ | Contract sync with backend Pydantic models via generated types |
| Styling | **Tailwind CSS** | 3+ | Utility-first fits our "no component library" approach |
| Font loading | `next/font/google` | (built-in) | Optimal font loading without CLS |

No Remix, no Vite-only, no CRA. Next.js App Router is the standard and what everyone on the team can Google effectively.

### 10.2 UI-layer libraries

| Purpose | Library | Version | Why this one |
|---------|---------|---------|--------------|
| Workflow graph | **React Flow** | ^11.10 | The only serious option for animated node graphs. Hand-rolling is a 2-day trap. |
| Icons | **lucide-react** | ^0.400 | Clean, consistent, treeshakeable, no opinionated styling |
| Client state | **Zustand** | ^4.5 | SSE-driven state updates, simpler than Redux, no Context-hell |
| SSE client | **@microsoft/fetch-event-source** | ^2.0 | Better than native EventSource for our use case (supports auth headers, better reconnection) |
| PDF preview | **react-pdf** | ^7.7 | Renders PDF in-browser for the Inputs pane document previews |
| Form handling | **react-hook-form** + **zod** | ^7.50 + ^3.22 | For the claimant submission view only |
| Date formatting | **date-fns** | ^3.0 | No dayjs, no moment |
| Animations | **CSS only + Framer Motion where necessary** | ^11 | Framer Motion only for orchestrated sequences (modal enters, toast stacks). CSS for everything else. |

### 10.3 What we deliberately don't use

- **No shadcn/ui, no Radix UI primitives.** They carry Tailwind defaults we fight with. We build our own 10–12 primitives.
- **No Chakra, MUI, Mantine, Ant Design.** Opinionated visual systems that don't match ours.
- **No Redux, no Jotai, no Recoil.** Zustand is enough.
- **No GraphQL client.** Our backend is REST + SSE, keep it simple.
- **No styled-components, no emotion.** Tailwind is the styling system.
- **No icon packs beyond Lucide.** One is enough.
- **No chart library unless explicitly needed.** The payout breakdown is a table, not a chart.

### 10.4 Dev tooling

```
eslint                    ^8   (next/core-web-vitals config)
prettier                  ^3   (with tailwindcss plugin for class sorting)
typescript                ^5
@types/react              ^18
vitest                    ^1   (component tests for critical paths only)
```

No Storybook. No Chromatic. No visual regression tooling. We're shipping in 7 days.

---

## 11. File and folder structure

```
frontend/
├── app/
│   ├── layout.tsx                    # Root layout, font loading, global styles
│   ├── globals.css                   # Tailwind directives + CSS variables
│   ├── page.tsx                      # Marketing landing (if we build one; skip in favor of a redirect)
│   ├── file-claim/
│   │   └── page.tsx                  # Claimant submission view
│   └── dashboard/
│       └── [caseId]/
│           └── page.tsx              # Operator dashboard
│
├── components/
│   ├── primitives/                   # Our handbuilt 12 components
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Separator.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Avatar.tsx
│   │   ├── FileUploader.tsx
│   │   ├── Chevron.tsx
│   │   └── index.ts
│   │
│   ├── dashboard/
│   │   ├── TopBar.tsx
│   │   ├── ActionBar.tsx
│   │   ├── InputsPane.tsx
│   │   ├── WorkflowPane.tsx          # wraps React Flow
│   │   ├── BlackboardPane.tsx
│   │   ├── AgentNode.tsx             # React Flow custom node
│   │   ├── AgentEdge.tsx             # React Flow custom edge with traveling dot
│   │   ├── ChallengeEdge.tsx         # special dashed amber edge
│   │   ├── TimelineStrip.tsx
│   │   ├── DocumentCard.tsx
│   │   ├── PhotoGrid.tsx
│   │   ├── ChatThread.tsx
│   │   └── BlackboardSection.tsx
│   │
│   └── claimant/
│       ├── UploadForm.tsx
│       ├── SubmissionSteps.tsx
│       └── SubmissionConfirm.tsx
│
├── lib/
│   ├── api.ts                        # fetch wrappers
│   ├── sse.ts                        # useCaseStream hook for SSE
│   ├── types.ts                      # Mirrors backend Pydantic models
│   ├── events.ts                     # SSE event type definitions
│   └── cn.ts                         # classnames utility
│
├── stores/
│   └── caseStore.ts                  # Zustand store for dashboard state
│
├── styles/
│   └── tokens.css                    # CSS variable definitions
│
├── public/
│   └── fonts/                        # Self-hosted font fallbacks (optional)
│
├── tailwind.config.ts                # Theme extends with our tokens
├── next.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## 12. Tailwind configuration

The full `tailwind.config.ts` extends default Tailwind with our tokens. Frontend engineer implements this on day 1.

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stone: {
          50: '#FAFAF7',
          100: '#F4F3EE',
          200: '#E8E6DD',
          300: '#D4D1C3',
          400: '#9B988A',
          500: '#6B6860',
          700: '#3D3B35',
          900: '#1C1B17',
        },
        amber: {
          50: '#FAF5E9',
          200: '#EDD79F',
          500: '#B8872D',
          700: '#7A5A1C',
        },
        success: {
          50: '#EFF2E8',
          500: '#5A7D3A',
          700: '#3A5424',
        },
        danger: {
          50: '#F5E8E5',
          500: '#A33D28',
          700: '#6E2918',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-geist-sans)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        'display-l': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '500' }],
        'display-m': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '500' }],
        'display-s': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body-l': ['1.125rem', { lineHeight: '1.5' }],
        'body': ['1rem', { lineHeight: '1.5' }],
        'body-s': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.04em', fontWeight: '500' }],
        'data-l': ['1.25rem', { lineHeight: '1.3' }],
        'data': ['0.9375rem', { lineHeight: '1.4' }],
        'data-s': ['0.8125rem', { lineHeight: '1.4' }],
      },
      spacing: {
        '0.5': '4px',
        '1': '8px',
        '2': '16px',
        '3': '24px',
        '4': '32px',
        '6': '48px',
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        lg: '8px',  // reserved for modals only
      },
      transitionDuration: {
        quick: '120ms',
        DEFAULT: '240ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'in-out-quad': 'cubic-bezier(0.45, 0, 0.55, 1)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## 13. First-day implementation checklist

On day 1, the frontend engineer delivers:

- [ ] Next.js app scaffolded with App Router
- [ ] Fonts loaded via `next/font` (Fraunces, Geist Sans, JetBrains Mono)
- [ ] `tailwind.config.ts` populated per section 12
- [ ] `app/layout.tsx` with global styles and font CSS variables
- [ ] `/dashboard/[caseId]/page.tsx` with the static 3-pane layout (no data, just structure)
- [ ] Top bar and Action bar as stubs
- [ ] `components/primitives/` folder with at least Button, Badge, and Card implemented
- [ ] React Flow installed and a static 6-node graph rendering in the Workflow pane (no animation yet)
- [ ] Deploys locally on `npm run dev`

**End-of-day-1 demo:** open `/dashboard/test-case`, see the three panes, see six static agent nodes in the middle pane. No backend connection yet — that's day 2.

---

## 14. Design handoff summary

If the frontend engineer reads only one section of this document, read **Section 5** (the three panes). Everything else is tokens and infrastructure.

If the AI and backend engineers read only one section, read **Section 10** (the tech stack) and confirm the SSE event contract matches the SAD's `/case/{id}/stream` spec.

If the product manager reads only one section, read **Section 1** (the design direction). When you're cutting a slide for the pitch, the aesthetic should match this language: editorial-operational, not consumer-fintech.

---

## 15. One last thing

The worst thing you can do with this design is get it 90% right and break the last 10% on demo day. Things that look small and matter a lot:

- Typography. If Fraunces isn't loading, the whole aesthetic collapses into generic-sans-app.
- The amber accent. If amber is used on too many things, it stops signaling "active reasoning" and starts being decoration.
- The middle pane's edge animations. A static graph looks the same as every other multi-agent demo. The traveling dots and the backward challenge arrow are the differentiators.
- The monospace in the Blackboard. If the JSON renders in a variable-width font, it looks like a chat log instead of a data panel.

Check these four things at end of each build day. If any of them are wrong, fix them before adding new features.
