---
name: pitch-qna-prep
description: >
  Prepare founders and teams for pitch Q&A sessions by simulating tough judge questions across 5 personas: Skeptical VCs, Technical judges, Market/Business analysts, Domain experts, and General investors. Use this skill whenever a user wants to practice pitching, prepare for a demo day, hackathon, accelerator pitch, investor meeting, or competition judging panel. Triggers include: "prepare me for pitch questions", "simulate judge questions", "practice my pitch Q&A", "help me prep for judges", "what questions will judges ask", "stress test my pitch", "I have a pitch coming up", or any time the user shares a product idea and wants to be grilled on it. Always use this skill even if the user just says "help me prep for my pitch" or "I'm pitching soon."
---
 
# Pitch Q&A Prep Skill
 
Help founders practice and refine their pitch by simulating tough judge questions, collecting answers, rating them, and exporting a polished Q&A reference document.
 
---
 
## Phase 0 — Gather Product Context
 
Before generating questions, you need enough context. Extract from what the user has already shared:
 
- **Product name**
- **What it does** (the core problem + solution)
- **Target users / market**
- **Business model** (how it makes money)
- **Tech stack or approach** (if relevant)
- **Stage** (idea, MVP, launched, revenue?)
- **Domain** (e.g. fintech, edtech, healthtech, SaaS, marketplace, etc.)
If any of these are missing or vague, ask the user to fill in the gaps **before** generating questions. Be conversational — don't bombard them with a form. Ask for the most critical missing info in one message.
 
**Minimum required to proceed:** product name, what it does, target users.
 
---
 
## Phase 1 — Generate Questions
 
Generate **10 questions** distributed across these 5 judge personas (2 per persona):
 
### 1. 🏦 Skeptical VC / Investor
Focus: business viability, defensibility, return potential, exit, burn rate.
- Challenge assumptions about market size, monetisation, and competition.
- Ask about moats, unit economics, and why *this* team can win.
### 2. 🔧 Technical Judge
Focus: architecture, scalability, technical risk, build vs. buy decisions.
- Probe the tech stack, data pipelines, security, and edge cases.
- Ask why they built it this way vs. existing tools/APIs.
### 3. 📊 Market / Business Analyst
Focus: TAM/SAM/SOM, go-to-market strategy, traction, customer acquisition cost.
- Challenge market size claims and growth assumptions.
- Ask about distribution channels, partnerships, and competitive landscape.
### 4. 🎓 Domain Expert
Focus: domain-specific knowledge depth — regulations, standards, real user workflows.
- Ask detailed questions about the domain the product operates in (infer from context).
- If domain is unclear, ask the user to confirm before generating these questions.
### 5. 🧑‍⚖️ General / Panel Judge
Focus: team credibility, product clarity, pitch quality, overall conviction.
- Ask about the founding team's background, why now, and what happens if assumptions are wrong.
### Format for each question:
```
**Q[number] — [Persona Name]**
[The question]
```
 
Present all 10 questions together. Then prompt:
> "Take your time and answer each question. You can answer them all at once, or one by one — your call. When you're ready, type your answers below."
 
---
 
## Phase 2 — Collect & Rate Answers
 
Once the user provides answers, rate **each answer individually**:
 
### Rating format per question:
```
**Q[number] — [Persona Name]**
❓ [Repeat the question]
💬 Your answer: [Summarise or quote key parts of their answer]
 
Verdict: ✅ PASS  or  ⚠️ NEEDS IMPROVEMENT
 
Feedback:
- [What they did well]
- [What's missing or weak]
- [Suggested improvement or what a strong answer would include]
```
 
After rating all 10:
- Give a **Overall Session Summary** with:
  - How many passed vs. need improvement
  - Strongest persona area
  - Weakest persona area
  - One top recommendation to strengthen the pitch overall
Then ask:
> "Would you like to revise any answers before we save the final Q&A? Just tell me which question number(s) you want to redo."
 
---
 
## Phase 3 — Revise Answers (Optional Loop)
 
If the user wants to revise:
1. Show only the question(s) they want to redo
2. Collect new answer(s)
3. Re-rate only those answers
4. Update the verdict
Repeat until the user is satisfied. When done, ask:
> "Happy with all your answers? Say **'save'** or **'export'** when you're ready to download your Q&A prep sheet."
 
---
 
## Phase 4 — Export to Markdown
 
When the user says "save", "export", "done", or asks to download:
 
Generate a markdown file at `/mnt/user-data/outputs/pitch-qna-prep.md` with this structure:
 
```markdown
# Pitch Q&A Prep Sheet
**Product:** [Product Name]
**Date:** [Today's date]
**Session Summary:** [X/10 passed]
 
---
 
## Questions & Approved Answers
 
### Q1 — [Persona Name]
**Question:** [Full question]
**Answer:** [Final approved answer]
**Status:** ✅ PASS / ⚠️ NEEDS IMPROVEMENT
**Notes:** [Key feedback for reference]
 
---
[... repeat for all 10 questions ...]
 
---
 
## Areas to Strengthen
[Paste the overall recommendations from the session summary]
```
 
After saving, use `present_files` to share the file with the user.
 
---
 
## Behavioural Rules
 
- **Never skip Phase 0** — questions without context will be generic and useless.
- **Stay in character** per persona when generating questions — VCs care about returns, engineers care about scale, domain experts care about nuance.
- **Be constructively tough** — feedback should be honest but actionable, not discouraging.
- **Don't rush to export** — always offer a revision round before saving.
- **Track state across the conversation** — remember which questions were revised and use the latest answer when exporting.
- If the user shares a pitch deck file or document, read it for context before Phase 1.