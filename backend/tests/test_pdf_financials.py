from srcs.schemas.case_dto import BlackboardSection, CaseStatus
from srcs.services.case_service import build_repair_approval_data
from srcs.services.case_store import CaseState


def test_repair_approval_data_uses_payout_breakdown_financials():
    state = CaseState(
        case_id="CLM-2026-99999",
        submitted_at="2026-05-02T00:00:00+08:00",
        status=CaseStatus.AWAITING_APPROVAL,
    )
    state.set_section_data(
        BlackboardSection.CASE_FACTS,
        {
            "claim_no": "CLM-2026-99999",
            "insured_name": "Test Driver",
            "vehicle_no": "ABC1234",
        },
    )
    state.set_section_data(
        BlackboardSection.PAYOUT_RECOMMENDATION,
        {
            "payout_breakdown": {
                "repair_estimate_myr": 10000,
                "verified_parts": 7000,
                "verified_labour": 2000,
                "verified_paint": 1000,
                "verified_towing": 0,
                "depreciation_deducted_myr": 1000,
                "liability_adjusted_myr": 9000,
                "excess_deducted_myr": 400,
                "final_payout_myr": 8600,
            }
        },
    )

    data = build_repair_approval_data(state)

    assert data.costs.repair_estimate_myr == 10000
    assert data.costs.depreciation_deducted_myr == 1000
    assert data.costs.excess_deducted_myr == 400
    assert data.costs.liability_adjusted_myr == 9000
    assert data.costs.final_payout_myr == 8600
