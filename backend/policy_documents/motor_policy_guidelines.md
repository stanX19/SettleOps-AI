# Standard Motor Insurance Policy Guidelines (Malaysia)
## Reference Document — SettleOps Policy MCP Tool

---

## 1. Types of Motor Insurance Coverage

| Cover Type | Own Vehicle Damage | Fire & Theft | Third-Party Liability |
|---|---|---|---|
| **Comprehensive** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Third-Party, Fire & Theft** | ❌ No | ✅ Yes | ✅ Yes |
| **Third-Party Only** | ❌ No | ❌ No | ✅ Yes |

- All coverage details are stated in the **Cover Note** — this is the primary reference document.
- **Comprehensive Cover** is the most complete policy and is usually mandatory for vehicles under hire-purchase (bank loan).
- Some comprehensive policies also cover **passengers** in the vehicle. Check the Cover Note for the endorsement "Passenger Liability" or "Extension of Cover to Passengers". If passenger coverage is included, the final report **must** include medical expenses.
- **Default** if document is silent on cover type: `comprehensive`.

### Permissible Claim Types

| Claim Type | Description |
|---|---|
| `own_damage` | First-party claim — insured's own vehicle is damaged (requires Comprehensive cover) |
| `third_party` | Third-party bodily injury or property damage |
| `fire_and_theft` | Loss/damage due to fire or theft only |
| `comprehensive` | All-risk cover including theft, fire, flood, accident |

---

## 2. Required Documents for Claim Processing

The car owner must submit the following documents to the Panel (workshop):

1. **Police Report** — must be lodged within 24 hours of the accident
2. **Keputusan Case (Police Investigation Result)** — official determination of fault/liability by police
3. **Policy** — the full insurance policy document
4. **Cover Note** — summary of coverage terms, sum insured, excess, and endorsements

The workshop then:
1. Estimates repair cost based on damaged parts
2. Prepares an **Offer Letter** with the repair quotation
3. Submits the Offer Letter together with documents from Step 1–4 to the insurance company
4. If the insurance company finds the quotation reasonable, they **approve, sign, and stamp** the document

### Missing Documents Handling
If any documents are missing (e.g., Police Report or Cover Note):
- The Panel (workshop) will obtain them from the **Insurance Agent**, or
- Request them directly from the **car owner**

---

## 3. Policy Excess (Deductible) Standards

- Standard compulsory excess: **MYR 400** for vehicles under 10 years old.
- Voluntary excess: ranges from MYR 0 to MYR 2,000 (as endorsed).
- No excess applies to third-party bodily injury claims.
- Look for keywords: **"Excess"**, **"Deductible"**, **"Policy Excess"**, **"Kenaan Lebihan"**.

---

## 4. Betterment Schedule (Repair Method Determination)

During repair, the workshop must check the policy to determine the applicable repair method:

### 4.1 Autopro (Zero Betterment)
- Applicable for vehicles **less than 5 years old**
- The panel can claim the **full repair cost** from the insurance company
- No betterment deduction applies

### 4.2 Betterment
- Applicable for vehicles **5 years old and above**
- The insurance company only allows the panel to claim based on the depreciated value of parts
- The **car owner** must pay the betterment difference out of pocket

**Standard Betterment Rates by Vehicle Age:**

| Vehicle Age | Betterment Rate (Owner Pays) |
|---|---|
| Less than 5 years | 0% (Autopro — full claim) |
| 5 years | 15% |
| 6 years | 20% |
| 7 years | 25% |
| 8 years | 30% |
| 9 years | 35% |
| 10 years and above | 40% |

**Example:**
- A side mirror for a Myvi costs MYR 400 today
- For a 10-year-old Myvi (40% betterment): insurance pays MYR 240, owner pays MYR 160

**Note:** Some policies offer a "Waiver of Betterment" add-on endorsement. If present in the Cover Note, betterment charges are waived even for older vehicles. Always check endorsements first.

---

## 5. Depreciation Schedule

If no depreciation is explicitly stated in the policy, apply this schedule based on vehicle registration date:

| Vehicle Age | Depreciation Rate |
|---|---|
| 0–1 year | 0% |
| 1–2 years | 10% |
| 2–3 years | 15% |
| 3–5 years | 20% |
| 5–7 years | 25% |
| 7–10 years | 30% |
| > 10 years | 35% |

---

## 6. Coverage Limits

- **Maximum payout** is capped at the **sum insured** stated on the Cover Note.
- NCD (No-Claim Discount) does not affect payout calculation; it affects renewal premium only.
- Betterment applies if the vehicle age exceeds 5 years — deduct according to Section 4.2 schedule.
- For vehicles with "Waiver of Betterment" endorsement, do not apply betterment deduction.

---

## 7. Standard Exclusions

- Wear and tear, mechanical breakdown, electrical faults.
- Driver unlicensed or driving under influence.
- Deliberate damage or fraud (see fraud assessment cluster).
- Damage outside the declared usage (e.g., commercial use under private policy).
- Modifications not declared in the policy.

---

## 8. Keputusan Case (Police Investigation Result)

- The **Keputusan Case** is the official police determination of fault in the accident.
- It is critical for determining whether the claim is processed as:
  - **Own Damage (OD)** — insured is at fault or single-vehicle accident
  - **Third-Party** — the other party is at fault (claim against their insurer)
- The insurer uses the Keputusan Case to confirm liability split.
- If the Keputusan Case is not yet available, the claim may be processed provisionally pending the investigation result.

---

## 9. Extraction Rules for Policy Analysis

1. `claim_type` — extract from "Type of Cover" or endorsements on the Cover Note.
2. `max_payout_myr` — extract from "Sum Insured" or "Market Value" on the Cover Note.
3. `excess_myr` — look for "Excess" / "Deductible" amount in MYR.
4. `depreciation_percent` — if no explicit rate, infer from vehicle age using schedule in Section 5.
5. `betterment_percent` — infer from vehicle age using schedule in Section 4.2.
6. `vehicle_age_years` — calculate from vehicle registration date to accident date.
7. `has_betterment_waiver` — check for "Waiver of Betterment" endorsement (true/false).
8. `has_passenger_coverage` — check for "Passenger Liability" endorsement (true/false).
9. `repair_method` — "autopro" if vehicle < 5 years, "betterment" if ≥ 5 years (unless waiver exists).
10. Always prefer document-stated values over defaults.
11. If the policy document is a **Cover Note** rather than a full policy, apply standard terms for missing fields.
