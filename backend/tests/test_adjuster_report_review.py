from srcs.services.agents.adjuster_request import (
    _extract_adjuster_costs,
    wait_for_adjuster_node,
)


REPORT_TEXT = """
G. TOTAL ESTIMATED COSTS
COST CATEGORY Minimum (RM) Maximum (RM)
FINAL TOTAL COST ESTIMATE RM 4,300.00 RM 7,800.00

Workshop vs. Adjuster Comparison:
Workshop Estimated Repair Cost RM 8,000.00 —
Minimum Total Cost (Adjuster) — RM 4,300.00
Maximum Total Cost (Adjuster) — RM 7,800.00

J. CONCLUSION & RECOMMENDATION
We recommend approving a maximum repair cost of RM 7,800.00.
"""

APPROVED_TOTAL_REPORT_TEXT = """
G. COST SUMMARY

Workshop Quoted Total

RM 1,000,296.00

Adjuster Approved Total

RM 25,493.00

K. CONCLUSION & RECOMMENDATION

B. APPROVE REPAIR at the adjuster's recommended amount of RM 25,493.00,
subject to physical re-inspection and photographic verification.
"""


def _state(panel_quote: float, report_text: str = REPORT_TEXT) -> dict:
    return {
        "documents": [
            {
                "filename": "adjuster_report_sample.pdf",
                "doc_type": "adjuster_report",
                "content": report_text,
            }
        ],
        "damage_results": {
            "verified_total": panel_quote,
        },
    }


def test_extract_adjuster_cost_range_from_report_text():
    costs = _extract_adjuster_costs(REPORT_TEXT)

    assert costs["adjuster_min_repair_myr"] == 4300.0
    assert costs["adjuster_max_repair_myr"] == 7800.0
    assert costs["report_panel_quotation_myr"] == 8000.0
    assert costs["adjuster_recommended_myr"] == 7800.0


def test_extract_adjuster_approved_amount_from_report_text():
    costs = _extract_adjuster_costs(APPROVED_TOTAL_REPORT_TEXT)

    assert costs["adjuster_recommended_myr"] == 25493.0


def test_adjuster_review_accepts_panel_quote_within_range():
    result = wait_for_adjuster_node(_state(7500.0))
    review = result["adjuster_results"]

    assert review["quotation_within_range"] is True
    assert review["adjuster_verdict"] == "acceptable"
    assert review["recommended_action_to_auditor"] == "approve"
    assert review["variance_myr"] == 0.0
    assert "MYR 4,300.00 to MYR 7,800.00" in review["adjuster_summary_to_auditor"]
    assert "MYR 7,500.00" in review["adjuster_summary_to_auditor"]
    assert "within the recommended range" in review["adjuster_summary_to_auditor"]
    assert "appears reasonable" in review["adjuster_summary_to_auditor"]


def test_adjuster_review_declines_panel_quote_outside_range():
    result = wait_for_adjuster_node(_state(8000.0))
    review = result["adjuster_results"]

    assert review["quotation_within_range"] is False
    assert review["adjuster_verdict"] == "outside_range"
    assert review["recommended_action_to_auditor"] == "decline"
    assert review["variance_myr"] == 200.0
    assert "Recommend decline" in review["recommendation_to_auditor"]
    assert "MYR 4,300.00 to MYR 7,800.00" in review["adjuster_summary_to_auditor"]
    assert "MYR 8,000.00" in review["adjuster_summary_to_auditor"]
    assert "outside the recommended range by MYR 200.00" in review["adjuster_summary_to_auditor"]
    assert "may not be reasonable" in review["adjuster_summary_to_auditor"]


def test_adjuster_review_declines_panel_quote_above_approved_amount():
    result = wait_for_adjuster_node(_state(1_000_296.0, APPROVED_TOTAL_REPORT_TEXT))
    review = result["adjuster_results"]

    assert review["quotation_within_range"] is False
    assert review["adjuster_verdict"] == "outside_approved_amount"
    assert review["recommended_action_to_auditor"] == "decline"
    assert review["adjuster_comparison_amount_myr"] == 25493.0
    assert review["adjuster_comparison_mode"] == "approved_amount"
    assert review["variance_myr"] == 974803.0
    assert "exceeds the adjuster approved repair cost" in review["adjuster_audit_finding"]["finding"]
    assert "MYR 974,803.00" in review["adjuster_summary_to_auditor"]
    assert "unknown to unknown" not in review["adjuster_summary_to_auditor"]
