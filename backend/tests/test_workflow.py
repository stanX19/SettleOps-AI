from srcs.schemas.citations import stamp_citation_ids
from srcs.services.workflow_engine import build_workflow, _build_log_entries, _dedupe_citations

def test_workflow_compilation():
    """Verifies that the workflow can be compiled without errors."""
    builder = build_workflow()
    graph = builder.compile()
    assert graph is not None

def test_workflow_nodes():
    """Verifies that all required nodes are present in the graph."""
    builder = build_workflow()
    nodes = builder.nodes.keys()
    
    expected_nodes = [
        "ingest_tagging",
        "validation_gate",
        "parallel_analysis_start",
        "policy_cluster",
        "liability_cluster",
        "damage_cluster",
        "fraud_cluster",
        "payout_node",
        "auditor_node",
        "decision_gate",
        "refiner",
        "report_generator"
    ]
    
    for node in expected_nodes:
        assert node in nodes, f"Node {node} missing from graph"

    assert "validator_node" not in nodes, "Validator should be scoped inside each cluster"


def test_citation_dedupe_removes_duplicates_and_caps_fields():
    citations = [
        {"filename": "quote.pdf", "source_type": "text", "excerpt": "RM 100", "field_path": "verified_total"},
        {"filename": "quote.pdf", "source_type": "text", "excerpt": " RM   100 ", "field_path": "verified_total"},
        {"filename": "quote.pdf", "source_type": "text", "excerpt": "RM 90", "field_path": "verified_total"},
        {"filename": "quote.pdf", "source_type": "text", "excerpt": "RM 80", "field_path": "verified_total"},
        {"filename": "policy.pdf", "source_type": "text", "excerpt": "Excess RM 400", "field_path": "excess_myr"},
    ]

    deduped = _dedupe_citations(citations)

    assert len(deduped) == 3
    assert [c["excerpt"] for c in deduped] == ["RM 100", "RM 90", "Excess RM 400"]


def test_log_entries_include_every_citation():
    citations = stamp_citation_ids([
        {
            "filename": "quote.pdf",
            "source_type": "text",
            "excerpt": "RM 100",
            "field_path": "verified_total",
            "conclusion": "Verified repair total is MYR 100",
            "comment": "Shows total repair amount",
            "node_id": "damage_quote_audit_task",
        },
        {
            "filename": "policy.pdf",
            "source_type": "text",
            "excerpt": "Excess RM 400",
            "field_path": "excess_myr",
            "conclusion": "Policy excess is MYR 400",
            "comment": "Shows deductible",
            "node_id": "policy_analysis_task",
        },
    ])

    entries = _build_log_entries(["[damage] Reasoning summary"], citations)

    assert len(entries) == 3
    assert entries[0].text == "[damage] Reasoning summary"
    assert entries[1].citation_id == citations[0]["id"]
    assert entries[1].citation_ref == "verified_total"
    assert entries[2].citation_id == citations[1]["id"]
    assert entries[2].citation_ref == "excess_myr"

if __name__ == "__main__":
    test_workflow_compilation()
    test_workflow_nodes()
    print("Workflow compilation and nodes verification: PASSED")
