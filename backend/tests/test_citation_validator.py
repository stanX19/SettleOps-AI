import asyncio

import pytest

from srcs.schemas.citations import CitationValidationError
from srcs.services.citation_validator import validate_citations


def _state():
    return {
        "documents": [
            {
                "filename": "uploaded_0_police_report.pdf",
                "source_type": "document",
                "content": "The insured vehicle collided with the rear bumper at Jalan Ampang.",
            },
            {
                "filename": "uploaded_1_damage_closeup.jpg",
                "source_type": "image",
                "content": "Visible deformation on the front bumper with cracked paint.",
            },
        ]
    }


async def _same_result_task(result):
    async def task(_state, feedback=None):
        return result

    return task


def test_valid_text_citation_populates_offsets():
    result = {
        "data": {"description": "rear bumper collision"},
        "citations": [
            {
                "filename": "uploaded_0_police_report.pdf",
                "source_type": "text",
                "excerpt": "vehicle collided with the rear bumper",
                "comment": "States the collision sequence.",
                "conclusion": "Supports the incident description.",
                "node_id": "liability_narrative_task",
                "field_path": "description",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=_state(),
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="liability_narrative_task",
        )
        citation = validated["citations"][0]
        assert citation["char_start"] == 12
        assert citation["char_end"] == 49

    asyncio.run(run())


def test_text_citation_tolerates_pdf_spacing_and_punctuation():
    result = {
        "data": {"policy_number": "ALZ/2024/07/5566789"},
        "citations": [
            {
                "filename": "uploaded_0_police_report.pdf",
                "source_type": "text",
                "excerpt": "Policy No.: ALZ/2024/07/5566789",
                "comment": "States the policy number.",
                "conclusion": "Supports policy number extraction.",
                "node_id": "policy_analysis_task",
                "field_path": "policy_number",
            }
        ],
    }
    state = {
        "documents": [
            {
                "filename": "uploaded_0_police_report.pdf",
                "source_type": "document",
                "content": "POLICY NO\nALZ 2024 07 5566789\nINSURED SARAH WONG",
            }
        ]
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=state,
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="policy_analysis_task",
        )
        citation = validated["citations"][0]
        matched = state["documents"][0]["content"][citation["char_start"]:citation["char_end"]]
        assert "5566789" in matched

    asyncio.run(run())


def test_ellipsized_text_citation_fails():
    result = {
        "data": {"address": "truncated"},
        "citations": [
            {
                "filename": "uploaded_0_police_report.pdf",
                "source_type": "text",
                "excerpt": "Address: NO. 22, JALAN DUTA...",
                "comment": "Uses truncated address.",
                "conclusion": "Should fail because ellipses are not verbatim.",
                "node_id": "policy_analysis_task",
                "field_path": "address",
            }
        ],
    }

    async def run():
        with pytest.raises(CitationValidationError) as exc:
            await validate_citations(
                raw_result=result,
                state=_state(),
                task_fn=await _same_result_task(result),
                feedback=None,
                node_id="policy_analysis_task",
            )
        assert "excerpt not found" in exc.value.errors[0]

    asyncio.run(run())


def test_label_value_citation_matches_split_policy_values():
    state = {
        "documents": [
            {
                "filename": "uploaded_1_06_policy_covernote_case4.pdf",
                "source_type": "document",
                "content": (
                    "No. Pendaftaran:\n\nJenama / Model:\n\nOPS 1111\n\n"
                    "Warna / Colour:\n\nNo. Enjin:\n\nNo. Casis:\n\n"
                    "KUNING / YELLOW\n\nRB26DETT-112345\n\nBNR34-305612"
                ),
            }
        ]
    }
    result = {
        "data": {"vehicle": "OPS 1111"},
        "citations": [
            {
                "filename": "uploaded_1_06_policy_covernote_case4.pdf",
                "source_type": "text",
                "excerpt": "No. Pendaftaran: OPS 1111",
                "comment": "Vehicle registration.",
                "conclusion": "Supports vehicle registration.",
                "node_id": "policy_analysis_task",
                "field_path": "vehicle.registration",
            },
            {
                "filename": "uploaded_1_06_policy_covernote_case4.pdf",
                "source_type": "text",
                "excerpt": "Warna / Colour: KUNING / YELLOW",
                "comment": "Vehicle colour.",
                "conclusion": "Supports vehicle colour.",
                "node_id": "policy_analysis_task",
                "field_path": "vehicle.colour",
            },
            {
                "filename": "uploaded_1_06_policy_covernote_case4.pdf",
                "source_type": "text",
                "excerpt": "No. Enjin: RB26DETT-112345",
                "comment": "Engine number.",
                "conclusion": "Supports engine number.",
                "node_id": "policy_analysis_task",
                "field_path": "vehicle.engine_no",
            },
            {
                "filename": "uploaded_1_06_policy_covernote_case4.pdf",
                "source_type": "text",
                "excerpt": "No. Casis: BNR34-305612",
                "comment": "Chassis number.",
                "conclusion": "Supports chassis number.",
                "node_id": "policy_analysis_task",
                "field_path": "vehicle.chassis_no",
            },
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=state,
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="policy_analysis_task",
        )
        excerpts = [
            state["documents"][0]["content"][c["char_start"]:c["char_end"]]
            for c in validated["citations"]
        ]
        assert excerpts == [
            "OPS 1111",
            "KUNING / YELLOW",
            "RB26DETT-112345",
            "BNR34-305612",
        ]

    asyncio.run(run())


def test_label_value_citation_matches_split_road_tax_combined_values():
    state = {
        "documents": [
            {
                "filename": "uploaded_0_04_road_tax_registration_card_case4.pdf",
                "source_type": "document",
                "content": "No. Casis/No. Sin\n\nBNR34-305612 / RB26DETT-112345",
            }
        ]
    }
    result = {
        "data": {"chassis_no": "BNR34-305612"},
        "citations": [
            {
                "filename": "uploaded_0_04_road_tax_registration_card_case4.pdf",
                "source_type": "text",
                "excerpt": "No. Casis/No. Sin BNR34-305612",
                "comment": "Chassis number appears on road tax.",
                "conclusion": "Supports chassis number.",
                "node_id": "auditor_node",
                "field_path": "vehicle.chassis_no",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=state,
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="auditor_node",
        )
        citation = validated["citations"][0]
        matched = state["documents"][0]["content"][citation["char_start"]:citation["char_end"]]
        assert matched == "BNR34-305612"

    asyncio.run(run())


def test_table_row_citation_tolerates_split_pdf_columns():
    state = {
        "documents": [
            {
                "filename": "uploaded_6_08_workshop_quotation.pdf",
                "source_type": "document",
                "content": (
                    "No\nDescription\nQty\nAmount\n"
                    "1\nFront Bumper\n1\nRM 658.00\n"
                    "2\nFront Bumper Bracket\n1\nRM 120.00\n"
                ),
            }
        ]
    }
    result = {
        "data": {"verified_total": 778.0},
        "citations": [
            {
                "filename": "uploaded_6_08_workshop_quotation.pdf",
                "source_type": "text",
                "excerpt": "1 Front Bumper 658.00",
                "comment": "Front bumper line item amount.",
                "conclusion": "Supports verified parts cost.",
                "node_id": "damage_quote_audit_task",
                "field_path": "verified_parts",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=state,
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="damage_quote_audit_task",
        )
        citation = validated["citations"][0]
        matched = state["documents"][0]["content"][citation["char_start"]:citation["char_end"]]
        assert "Front Bumper" in matched
        assert "658.00" in matched

    asyncio.run(run())


def test_table_row_citation_tolerates_column_oriented_pdf_extraction():
    state = {
        "documents": [
            {
                "filename": "uploaded_3_08_workshop_quotation_case2.pdf",
                "source_type": "document",
                "content": (
                    "No.\nDescription\nQty\nUnit Price (RM)\nAmount (RM)\n"
                    "1\n2\n3\n"
                    "Front Left Door Shell — Genuine OEM Toyota (Hilux Rogue)\n"
                    "Rear Left Door Shell — Genuine OEM Toyota (Hilux Rogue)\n"
                    "Front Left Door Inner Panel & Retainer Complete Assembly\n"
                    "1\n1\n1\n"
                    "18,500.00\n17,200.00\n12,800.00\n"
                    "18,500.00\n17,200.00\n12,800.00\n"
                ),
            }
        ]
    }
    result = {
        "data": {"verified_parts": 18500.0},
        "citations": [
            {
                "filename": "uploaded_3_08_workshop_quotation_case2.pdf",
                "source_type": "text",
                "excerpt": "Front Left Door Shell — Genuine OEM Toyota (Hilux Rogue) 18,500.00",
                "comment": "Front left door shell quoted amount.",
                "conclusion": "Supports verified parts cost.",
                "node_id": "damage_quote_audit_task",
                "field_path": "verified_parts",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=state,
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="damage_quote_audit_task",
        )
        citation = validated["citations"][0]
        matched = state["documents"][0]["content"][citation["char_start"]:citation["char_end"]]
        assert "Front Left Door Shell" in matched

    asyncio.run(run())


def test_valid_image_citation_passes():
    result = {
        "data": {"poi_location": "front"},
        "citations": [
            {
                "filename": "uploaded_1_damage_closeup.jpg",
                "source_type": "image",
                "excerpt": None,
                "comment": "Shows visible deformation on the front bumper.",
                "conclusion": "Supports front point of impact.",
                "node_id": "liability_poi_task",
                "field_path": "poi_location",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=_state(),
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="liability_poi_task",
        )
        assert validated["citations"][0]["filename"] == "uploaded_1_damage_closeup.jpg"

    asyncio.run(run())


def test_empty_citations_fail_hard():
    result = {"data": {"claim_type": "own_damage"}, "citations": []}

    async def run():
        with pytest.raises(CitationValidationError) as exc:
            await validate_citations(
                raw_result=result,
                state=_state(),
                task_fn=await _same_result_task(result),
                feedback=None,
                node_id="policy_analysis_task",
            )
        assert "No citations provided" in exc.value.errors[0]

    asyncio.run(run())


def test_bad_filename_fails_after_retries():
    result = {
        "data": {"description": "rear bumper collision"},
        "citations": [
            {
                "filename": "missing_report.pdf",
                "source_type": "text",
                "excerpt": "vehicle collided",
                "comment": "Bad source.",
                "conclusion": "Should fail.",
                "node_id": "liability_narrative_task",
                "field_path": "description",
            }
        ],
    }

    async def run():
        with pytest.raises(CitationValidationError) as exc:
            await validate_citations(
                raw_result=result,
                state=_state(),
                task_fn=await _same_result_task(result),
                feedback=None,
                node_id="liability_narrative_task",
            )
        assert "filename 'missing_report.pdf' not found" in exc.value.errors[0]

    asyncio.run(run())


def test_image_citation_with_excerpt_fails():
    result = {
        "data": {"poi_location": "front"},
        "citations": [
            {
                "filename": "uploaded_1_damage_closeup.jpg",
                "source_type": "image",
                "excerpt": "front bumper",
                "comment": "Shows front bumper deformation.",
                "conclusion": "Supports front point of impact.",
                "node_id": "liability_poi_task",
                "field_path": "poi_location",
            }
        ],
    }

    async def run():
        with pytest.raises(CitationValidationError) as exc:
            await validate_citations(
                raw_result=result,
                state=_state(),
                task_fn=await _same_result_task(result),
                feedback=None,
                node_id="liability_poi_task",
            )
        assert "image citation must have excerpt=null" in exc.value.errors[0]

    asyncio.run(run())


def test_agent_output_citation_passes_for_known_output():
    result = {
        "data": {"findings": "No discrepancy"},
        "citations": [
            {
                "filename": "liability_analysis_output",
                "source_type": "agent_output",
                "excerpt": "poi_location: front",
                "comment": "Auditor checked the upstream POI conclusion.",
                "conclusion": "Supports audit finding.",
                "node_id": "auditor_node",
                "field_path": "findings",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=_state(),
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="auditor_node",
        )
        assert validated["citations"][0]["source_type"] == "agent_output"

    asyncio.run(run())


def test_reference_citation_passes_for_known_mcp_document():
    result = {
        "data": {"benchmark_range": "OEM front fender benchmark"},
        "citations": [
            {
                "filename": "parts_pricing_guide",
                "source_type": "reference",
                "excerpt": "Front fender | 250 – 450 | 500 – 800 | 900 – 1,500",
                "comment": "Benchmark guide row for front fender pricing.",
                "conclusion": "Supports benchmark comparison.",
                "node_id": "pricing_validation_task",
                "field_path": "flagged_items[0].benchmark_range",
            }
        ],
    }

    async def run():
        validated, _ = await validate_citations(
            raw_result=result,
            state=_state(),
            task_fn=await _same_result_task(result),
            feedback=None,
            node_id="pricing_validation_task",
        )
        assert validated["citations"][0]["source_type"] == "reference"
        assert validated["citations"][0]["char_start"] is not None

    asyncio.run(run())
