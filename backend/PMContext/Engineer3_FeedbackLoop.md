# Role: AI Alignment & Feedback Engineer

## Task: Implement the AI Auditor and Feedback Refiner Loop
You are responsible for the quality control and human interaction cycle.

## Files to Work On
- `project/backend/srcs/services/agents/auditor.py` [NEW]
- `project/backend/srcs/services/agents/refiner.py` [NEW]

## Scope & Out of Scope
- **In Scope**:
    - **Auditor**: Implement a cross-consistency check node (e.g., matching photos to police reports).
    - **Refiner**: Implement a node that translates freeform human feedback into a structured `ChallengeState`.
    - **Decision Router**: Logic to route based on `active_challenge` or auditor findings.
- **Out of Scope**:
    - Building the main graph structure.
    - Implementing the parallel analysis tasks themselves.

## Expected Outcome
A robust system that can detect inconsistencies and translate human "challenges" into actionable instructions for the relevant agent clusters.

## Definition of Done (DoD)
- [ ] Auditor can flag a case as "inconsistent" based on cross-agent data.
- [ ] Refiner correctly maps user text to a `target_cluster` (policy, liability, or damage).
- [ ] `ChallengeState` is correctly populated for the loop-back.

## Roadblock Protocol
If the intent extraction for human feedback is unreliable, STOP and document the issue in `feedbacks/Engineer3Feedback.md`.

## Feedback Instructions
Write all completion notes or roadblocks to `project/backend/PMContext/feedbacks/Engineer3Feedback.md`.
