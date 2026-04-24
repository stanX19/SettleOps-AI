from srcs.services.workflow_engine import build_workflow

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

if __name__ == "__main__":
    test_workflow_compilation()
    test_workflow_nodes()
    print("Workflow compilation and nodes verification: PASSED")
