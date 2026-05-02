# Authoritative Parts & Labour Pricing Reference (Malaysia)
## Reference Document — SettleOps Pricing MCP Tool

_Prices reflect mid-2024 market rates for standard passenger vehicles (non-luxury)._

---

## 1. Commonly Claimed Parts — Benchmark Prices (MYR)

| Part | Budget (Reconditioned) | OEM / Standard | Premium |
|---|---|---|---|
| Bonnet (hood) | 300 – 500 | 600 – 900 | 1,000 – 1,800 |
| Front bumper | 150 – 300 | 350 – 600 | 700 – 1,200 |
| Rear bumper | 150 – 300 | 300 – 550 | 650 – 1,100 |
| Front door (L or R) | 400 – 700 | 800 – 1,200 | 1,300 – 2,500 |
| Rear door (L or R) | 350 – 600 | 700 – 1,100 | 1,200 – 2,200 |
| Front fender | 250 – 450 | 500 – 800 | 900 – 1,500 |
| Headlamp (each) | 200 – 400 | 500 – 900 | 1,000 – 2,000 |
| Tail lamp (each) | 150 – 300 | 350 – 700 | 800 – 1,500 |
| Windscreen (front) | 300 – 500 | 600 – 1,000 | 1,100 – 2,000 |
| Side mirror (each) | 80 – 180 | 200 – 400 | 450 – 900 |
| Radiator | 300 – 600 | 700 – 1,200 | 1,300 – 2,500 |
| Air-conditioning condenser | 250 – 500 | 600 – 1,100 | 1,200 – 2,000 |
| Quarter panel | 500 – 900 | 1,000 – 1,800 | 2,000 – 3,500 |
| Roof panel | 800 – 1,500 | 1,800 – 3,000 | 3,200 – 5,500 |

---

## 2. Labour Rate Benchmarks

| Service | Rate |
|---|---|
| Panel beating (per panel) | MYR 80 – 200 |
| Full respray (per panel) | MYR 120 – 300 |
| Mechanical labour (per hour) | MYR 40 – 90 |
| Alignment & balancing | MYR 60 – 120 |
| Towing (per trip, within 50 km) | MYR 150 – 400 |

---

## 3. Repair Method & Betterment-Adjusted Pricing

When validating quoted prices, the applicable **repair method** determines how much the insurer covers:

### 3.1 Autopro (Vehicle < 5 years old)
- Insurer covers **100%** of OEM/Standard part prices
- Full repair cost is claimable
- Use OEM/Standard column as the benchmark

### 3.2 Betterment (Vehicle ≥ 5 years old)
- Insurer covers a **reduced percentage** based on vehicle age:

| Vehicle Age | Insurer Pays | Owner Pays (Betterment) |
|---|---|---|
| 5 years | 85% | 15% |
| 6 years | 80% | 20% |
| 7 years | 75% | 25% |
| 8 years | 70% | 30% |
| 9 years | 65% | 35% |
| 10+ years | 60% | 40% |

- When validating under betterment, the **quoted amount should still be based on current market prices** — but the payout is reduced by the betterment percentage
- The car owner pays the betterment difference out of pocket
- **Exception:** If the Cover Note has a "Waiver of Betterment" endorsement, treat as Autopro regardless of age

### 3.3 Reconditioned Parts
- For betterment vehicles, workshops may use reconditioned/used parts to reduce the owner's out-of-pocket cost
- Reconditioned parts are acceptable but do not carry the same guarantees as OEM
- If reconditioned parts are used, the betterment deduction may not apply (at insurer's discretion)

---

## 4. Panel vs Non-Panel Workshop Pricing

- **Panel Workshops** are officially approved by the insurer — their pricing follows documented standards and the claims process is smoother
- **Non-Panel Workshops** may quote higher or non-standard rates — the insurer cannot guarantee quality or pricing alignment
- For validation purposes, always benchmark against **Panel Workshop rates** (OEM/Standard column)
- Non-panel quotes exceeding panel workshop benchmarks by >20% should be flagged

---

## 5. Pricing Validation Rules

1. **Flag as overpriced** if a line item exceeds the OEM/Standard upper bound by more than 20%.
2. **Flag as suspicious** if luxury/performance parts are claimed for an economy vehicle.
3. **Verify necessity**: parts not consistent with the stated Point of Impact (POI) should be questioned.
4. **Towing** is only claimable if the vehicle was immobilised at scene; maximum MYR 400 per trip.
5. **Paint/refinish**: should not exceed 2.5× the part cost for standard vehicles.
6. Do not flag parts within the OEM range as suspicious — only outliers warrant review.
7. **Betterment context**: when vehicle age ≥ 5 years, note that the insurer will only pay the betterment-adjusted amount, but the quoted price itself should still be at current market rates.

---

## 6. Total Cost Benchmarks by Damage Severity

| Severity | Expected Range (MYR) |
|---|---|
| Minor (1–2 panels, cosmetic) | 500 – 2,500 |
| Moderate (3–5 panels, structural) | 2,500 – 10,000 |
| Severe (> 5 panels or chassis) | 10,000 – 40,000 |
| Total loss candidate | > 70% of market value |
