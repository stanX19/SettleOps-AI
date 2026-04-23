# Role: Backend Logic Engineer

## Task: Implement Intake Validation and Deterministic Payout
You are responsible for the entry and exit logic of the core processing phases.

## Files to Work On
- `project/backend/srcs/services/agents/intake.py` [NEW]
- `project/backend/srcs/services/agents/payout.py` [NEW]

## Scope & Out of Scope
- **In Scope**:
    - **Intake**: Create nodes for `ingest_tagging` (LLM-based categorization) and `validation_gate` (deterministic check for 8 required document types).
    - **Payout**: Implement a **pure Python** node for financial calculations based on `CaseFacts`, `LiabilityVerdict`, and `DamageRecommendation`.
    - Apply policy caps, excess, and depreciation logic.
- **Out of Scope**:
    - Building the parallel analysis clusters (Policy, Liability, etc.).
    - Handling the AI Auditor logic.

## Expected Outcome
- An intake agent that accurately flags missing documents and pauses the graph.
- A payout engine that calculates the final recommendation without using an LLM.

## Definition of Done (DoD)
- [ ] `validation_gate` correctly identifies if any of the 8 required documents are missing.
- [ ] `payout_node` uses deterministic logic (no LLM) for final numbers.
- [ ] Logic follows the guard clause pattern.

## Roadblock Protocol
If the document categorization logic is ambiguous or the payout formula is underspecified, STOP and document the issue in `feedbacks/Engineer2Feedback.md`.

## Feedback Instructions
Write all completion notes or roadblocks to `project/backend/PMContext/feedbacks/Engineer2Feedback.md`.
