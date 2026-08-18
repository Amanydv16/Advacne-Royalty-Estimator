# Advance Royalty Calculator — Valuation Engine Architecture & Mechanism

This document specifies the end-to-end architecture, mathematical derivations, ingestion rules, and risk underwriting mechanisms implemented in the Royalty Calculator and Valuation Engine.

---

## 1. Pipeline Overview & Master Architecture

The valuation engine is designed as a **deterministic, zero-uncontrolled-I/O underwriting system**. It separates what already exists in the artist's historical catalogue from future music contracted to be written.

```
+---------------------------------------------------------------------------------------------------------+
|                                        1. LIVE INGESTION & DISCOVERY                                    |
|                                                                                                         |
|   Spotify Artist / Label Query  ──▶  /api/spotify/artist-tracks  ──▶  Live Catalog (Tracks + ISRCs)     |
|                                                                                                         |
|   Multi-Distributor Statements  ──▶  /api/valuation (CSV/TSV/XLSX)  ──▶  Rule 3 Ingestion Normalizer    |
+----------------------------------------------------+----------------------------------------------------+
                                                     |
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
|                                    2. DATA CLEANING & RECONCILIATION                                    |
|                                                                                                         |
|  • Rule 3a: Feed Deduplication (distributor vs direct feeds)                                            |
|  • Rule 3b: Trailing Month Drop (φ_partial = 0.25 threshold)                                            |
|  • Rule 3c: Missing Feed Exclusion                                                                      |
|  • Rule 3d: 6-Month Gate (Refusal if valid_months < 6)                                                  |
+----------------------------------------------------+----------------------------------------------------+
                                                     |
                         +---------------------------+---------------------------+
                         |                                                       |
                         ▼                                                       ▼
+-------------------------------------------------+     +-------------------------------------------------+
|            3. CATALOG PRICER (A_cat)            |     |           4. NEW-RELEASE PRICER (A_new)         |
|                                                 |     |                                                 |
|  • Run-rate: R_0 = median(r_{M-2}, r_{M-1}, r_M)|     |  • Peak opening median: m_0                     |
|  • Term multiple: K(T) (Option A / Option B)    |     |  • Tail survival ratio: r_tail <= 0.90          |
|  • Pay-through factor: (1 - p)                  |     |  • Lifetime multiple: L                         |
|  • Closed-form early recoupment: E(e)           |     |  • Advance fraction: ADV_FRAC = 0.50            |
|                                                 |     |  • Empirical range: [range_lo, range_hi]        |
|  Formula: A_cat = R_0 * K(T) * (1 - p) * E(e)   |     |  Formula: A_new = N * m_0 * L * ρ(T) * ADV_FRAC |
+------------------------+------------------------+     +------------------------+------------------------+
                         |                                                       |
                         +---------------------------+---------------------------+
                                                     |
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
|                                    5. RISK AUDIT & PORTFOLIO SIZING                                     |
|                                                                                                         |
|  • Master Advance: A_total = A_cat + A_new                                                              |
|  • Concentration: Gini G* of catalog track earnings (Alert if G* > 0.70)                               |
|  • Model Divergence: A_A / A_B ratio (Alert if > 2.0x)                                                  |
|  • Payment Tranche Schedule: Execution / Delivery(j) / Month(m) milestones                              |
|  • Provenance Block: 24+ diagnostic audit flags & JSON memo export                                     |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Ingestion & Normalization Layer

The engine accepts statement files across 6 major distributor formats and normalizes them to 5 canonical fields:

$$\mathcal{D} = \{\text{sale\_month}, \; \text{store}, \; \text{isrc}, \; \text{title}, \; \text{earnings\_usd}\}$$

### Distributor Normalization Rules

| Distributor | Timestamp Logic | Gross vs Net | Title/ISRC Extraction |
| :--- | :--- | :--- | :--- |
| **DistroKid** | Earning Month (`Sale Month`) | Net ($f_{dist} = 0.00$) | Direct ISRC column |
| **TuneCore** | Sales Period Date | Net ($f_{dist} = 0.00$) | Direct ISRC column |
| **DashGo** | Transaction Month | Net ($f_{dist} = 0.00$) | Direct ISRC column |
| **Too Lost** | Activity Period | Net ($f_{dist} = 0.00$) | Direct ISRC column |
| **Sony / The Orchard** | Activity Month | Net of distributor fee ($15\%$) | Standard Master ISRC |
| **CD Baby** | Sales Date | Net ($f_{dist} = 0.00$) | Track Title + ISRC |

### Data Scrubbing & Guardrail Rules

1. **Rule 3a — Feed Deduplication**:
   When an artist has both direct DSP feeds (e.g. Spotify for Artists direct) and aggregator statements (e.g. DistroKid) for the same month and store, the engine prioritizes distributor statements to avoid double counting.

2. **Rule 3b — Partial Trailing Month Drop**:
   Digital royalty statements for the most recent month often arrive incomplete. If:
   $$r_M < \phi_{partial} \times \text{median}(r_{M-3}, r_{M-2}, r_{M-1}) \quad \text{where } \phi_{partial} = 0.25$$
   the trailing month $M$ is dropped from $R_0$ calculation and flagged as `PARTIAL_TRAILING_MONTH_DROPPED`.

3. **Rule 3c — Missing Feed Exclusion**:
   If a recurring platform (e.g., Apple Music) is missing in a single month but present in prior months, the engine flags `MISSING_FEED` and computes trailing metrics over validated continuous feeds.

4. **Rule 3d — History Gate**:
   - $\text{valid\_months} < 6 \implies \mathbf{REFUSAL}$ (`INSUFFICIENT_HISTORY` flag).
   - $6 \le \text{valid\_months} < 12 \implies \mathbf{PERMITTED}$ with `SHORT_HISTORY` diagnostic flag.

---

## 3. Catalogue Advance Valuation ($A_{catalog}$)

$$A_{catalog} = R_0 \times K(T) \times (1 - p) \times E(e)$$

### 3.1 Current Monthly Run-Rate ($R_0$)
The baseline monthly revenue is calculated using the **trailing-3 median**:
$$R_0 = \text{median}(r_{M-2}, \; r_{M-1}, \; r_M)$$

**Rationale**: The median is robust against one-off viral spikes and transient playlist placements that do not represent enduring catalog earning power.

### 3.2 Term Multiples $K(T)$

#### Option A: Market Multiple Table
Calibrated directly from benchmark transaction data:

| Term ($T$) | $K_A(T)$ Multiple | Implied Recoupment Rate $\rho(T) = \frac{K(T)}{12T}$ |
| :---: | :---: | :---: |
| **1 Year** | $10.797$ | $0.8998$ ($89.98\%$) |
| **2 Years** | $20.816$ | $0.8673$ ($86.73\%$) |
| **3 Years** | $29.211$ | $0.8114$ ($81.14\%$) |
| **5 Years** | $36.028$ | $0.6005$ ($60.05\%$) |
| **8 Years** | $45.000$ | $0.4688$ ($46.88\%$) |

#### Option B: Measured Catalog Decay
When empirical statement decay is measured, $K_B(T)$ projects forward using a two-phase decay model:
$$K_B(T) = \rho(T) \sum_{t=1}^{12T} (1 - d_1)^{\min(t, t_b)} (1 - d_2)^{\max(0, t - t_b)}$$
where:
- $d_1$: Measured initial monthly decay rate of existing catalogue.
- $d_2$: Terminal catalog decay rate ($0.5\%$ per month / $6\%$ annual).
- $t_b = 24$ months: Breakpoint between initial and mature catalogue phases.

### 3.3 Pay-Through Lever $(1 - p)$
If an artist negotiates to retain a percentage $p \in [0, 0.50]$ of ongoing cash flow during recoupment (e.g. $15\%$ pay-through), the upfront advance scales linearly by $(1 - p)$.

### 3.4 Early Recoupment Factor $E(e)$
When the artist retains a post-recoupment tail share $e < 1.0$ (e.g., $85\%$ retained by artist, meaning $15\%$ retained by funder post-recoupment), the advance increases according to the **closed-form solution**:

$$E(e) = 1 + c \cdot (1 - e^k) \quad \text{with } c = 0.296880, \; k = 2.879956$$

- When $e = 1.00 \implies E(1.00) = 1.000$ (Standard deal).
- When $e = 0.85 \implies E(0.85) = 1.111$ ($+11.1\%$ advance increase).
- Guardrail: $E(e) \le E\_MAX = 1.300$.

---

## 4. New-Release Advance Valuation ($A_{new}$)

When the deal includes $N > 0$ contracted future singles:

$$A_{new} = N \times \hat{m}_0 \times L \times \rho(T) \times ADV\_FRAC$$

```
   Monthly Revenue
        ▲
        │         *  (Peak Month m_0)
        │        / \
        │       /   *
        │      /     \
        │     /       *---*---*---*---*  (Tail Survival r_tail)
        │    /                         \
        └────┴──────────────────────────┴─────▶ Time (Months)
             0    1   2   3   4   5  ... 12T
```

1. **Peak Month Anchoring ($\hat{m}_0$)**:
   Filters historical tracks to identify genuine historical single releases (excluding remixes, acoustic versions, and social audio snippets) and extracts their median peak revenue $\hat{m}_0$.

2. **Empirical Decay Shape & Survival Ratio ($r_{tail}$)**:
   - Historical tracks are aligned to their peak months ($k=0$).
   - Normalized shape: $\text{shape}[k] = \text{median}(\{v_i[k] / m_{0,i}\})$.
   - The tail survival ratio $r_{tail} = \text{median}(\{\text{shape}[k+1] / \text{shape}[k]\})$ is calculated and bounded:
     $$r_{tail} = \min(r_{tail}, \; R\_TAIL\_MAX) \quad \text{where } R\_TAIL\_MAX = 0.90$$

3. **Lifetime Multiple ($L$)**:
   Integrates the projected curve across the deal horizon:
   $$L = \sum_{t=0}^{12T - 1} \text{projected\_decay}(t)$$

4. **Underwriting Safety Margin ($ADV\_FRAC = 0.50$)**:
   A $50\%$ haircut is applied to unreleased music to account for composition, delivery, and marketing variance.

5. **Empirical Range $[range_{lo}, range_{hi}]$**:
   Calculated by evaluating the 10th percentile and 90th percentile peak performances from historical releases to provide lower and upper sizing envelopes.

---

## 5. Risk Underwriting, Audit Flags & Provenance

### 5.1 Gini Concentration Index ($G^*$)
Measures portfolio diversification across catalogue tracks:
$$G^* = \left(\frac{n}{n-1}\right) \left[ \frac{2 \sum_{i=1}^n i \cdot v_{(i)}}{n \sum_{i=1}^n v_{(i)}} - \frac{n+1}{n} \right]$$
- $G^* \le 0.50$: Healthy, diversified catalogue.
- $G^* > 0.70$: High concentration risk (1–2 songs generate $>70\%$ of revenue) $\implies$ raises `HIGH_CONCENTRATION`.

### 5.2 Model Divergence Indicator
$$\text{Divergence Ratio} = \frac{A_{OptionA}}{A_{OptionB}}$$
- If $\text{Ratio} > 2.0\times \implies$ raises `AB_DIVERGENCE`, warning that the catalog's measured decay is significantly faster than standard market multiples assume.

### 5.3 Milestone Payment Tranches
To mitigate delivery default on new music, $A_{new}$ is structured across milestones:
- **Execution Tranche**: Upfront upon agreement execution.
- **Delivery Tranches**: Paid upon verified master ingestion of Single $j$.
- **Calendar Tranches**: Paid at Month $m$.
- **Risk Check**: If $\text{Upfront Share} > 50\%$, flags `AT_RISK_CASH_HIGH`.

### 5.4 Audit & Flag Dictionary

| Flag Name | Trigger Condition | Severity |
| :--- | :--- | :--- |
| `INSUFFICIENT_HISTORY` | Valid continuous statement months $< 6$ | **Refusal** |
| `SHORT_HISTORY` | $6 \le \text{valid\_months} < 12$ | Informational |
| `HIGH_CONCENTRATION` | Normalized Gini coefficient $G^* > 0.70$ | Warning |
| `AB_DIVERGENCE` | $A_{OptionA} / A_{OptionB} > 2.0\times$ | Warning |
| `PARTIAL_TRAILING_MONTH_DROPPED` | Month $M < 25\%$ of prior 3-month median | Ingestion Clean |
| `EARLY_RECOUPMENT_CAPPED` | Post-recoupment multiplier $E(e) \ge 1.30$ | Guardrail Cap |
| `AT_RISK_CASH_HIGH` | Upfront cash share $> 50\%$ of advance | Risk Warning |

---

## 6. Verification & Automated Test Coverage

The engine is verified by deterministic regression test suites:
- `backend/tests/test_islem23.py`: Validates exact reproduction of $R_0 = \$317.59$, 5-year advance $A = \$11,442$ ($0.00\%$ error), all 24 grid cells ($\le 0.029\%$ error), and closed-form early recoupment ($0.000\%$ error).
- `backend/tests/test_acceptance.py`: Validates 6-month refusal gate and multi-source feed handling.
