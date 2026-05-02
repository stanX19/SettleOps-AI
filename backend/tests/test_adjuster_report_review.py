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


def _state(panel_quote: float) -> dict:
    return {
        "documents": [
            {
                "filename": "adjuster_report_sample.pdf",
                "doc_type": "adjuster_report",
                "content": REPORT_TEXT,
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


def test_adjuster_review_accepts_panel_quote_within_range():
    result = wait_for_adjuster_node(_state(7500.0))
    review = result["adjuster_results"]

    assert review["quotation_within_range"] is True
    assert review["adjuster_verdict"] == "acceptable"
    assert review["recommended_action_to_auditor"] == "approve"
    assert review["variance_myr"] == 0.0


def test_adjuster_review_declines_panel_quote_outside_range():
    result = wait_for_adjuster_node(_state(8000.0))
    review = result["adjuster_results"]

    assert review["quotation_within_range"] is False
    assert review["adjuster_verdict"] == "outside_range"
    assert review["recommended_action_to_auditor"] == "decline"
    assert review["variance_myr"] == 200.0
    assert "Recommend decline" in review["recommendation_to_auditor"]
