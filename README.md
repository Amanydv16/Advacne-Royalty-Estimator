# MoneTunes — Advance Royalty Calculator & Valuation Engine

[![Python](https://img.shields.io/badge/Python-3.11+-1e293b.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991.svg?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

**MoneTunes** is a deterministic royalty advance sizing and financial underwriting engine designed for music catalog valuations and contracted new-release deals. It ingests raw multi-distributor royalty statement files across all standard formats (`PDF`, `CSV`, `TSV`, `XLSX`, `DOCX`, `TXT`, and scanned image documents), normalizes line items, scores feed continuity, and executes a deterministic valuation model backed by a granular provenance audit trail.

---

## Technical Overview

MoneTunes operates as a 5-phase deterministic pipeline, bridging multi-format statement parsing, live streaming index resolution, risk discount modeling, and milestone payment schedule generation.

```
+-------------------------------------------------------------------------------+
| PHASE 1: Multimodal Statement Ingestion & Preprocessing                       |
| (PDF, CSV, XLSX, DOCX, Images -> Header Discovery -> YYYY-MM Normalization)    |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| PHASE 2: Live Artist & Catalogue Metadata Resolution                          |
| (Spotify Web API / oEmbed / Deezer / iTunes -> ISRC Distributor Detection)    |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| PHASE 3: Catalogue Advance Valuation Engine (A_catalog)                        |
| (Trailing Median Anchor R0 -> Gini Concentration G* -> Track Decay -> K(T))   |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| PHASE 4: Contracted New-Release Valuation Engine (A_new)                       |
| (Peak Baseline M0_hat -> Lifetime Multiple L -> 50% Risk-Adjusted Range)      |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| PHASE 5: Master Valuation Consolidation & Provenance Output                    |
| (A_total = A_catalog + A_new -> Payment Tranches -> Underwriting Provenance)  |
+-------------------------------------------------------------------------------+
```

---

## End-to-End Workflow & Mathematical Specification

### Master Valuation Model

The total advance valuation ($A_{\text{total}}$) is calculated as the sum of the catalog advance ($A_{\text{catalog}}$) and the contracted new-release advance ($A_{\text{new}}$):

$$A_{\text{total}} = A_{\text{catalog}} + A_{\text{new}}$$

---

### Phase 1: Statement Ingestion & Preprocessing

1. **Multimodal LLM Parser**:
   - Analyzes native text documents, tabular spreadsheets, and scanned PDF page images using `gpt-4o` (Vision) and `gpt-4o-mini`.
   - Client-side instant parser (`parseCSVTextClientSide`) handles CSV/TSV files in under 1 millisecond for zero-latency execution.
2. **Header Row Auto-Discovery**:
   - Automatically scans document lines (lines 1 to 10) to bypass report titles and metadata, locating exact table header rows containing target column keys (`month`, `period`, `date`, `earnings`, `net`, `amount`, `title`, `isrc`, `store`).
3. **Date & Currency Normalization**:
   - Maps raw dates (`2026-01`, `Jan 2026`, `202601`, `01/2026`, `Jan-26`, `2026-01-15`) into ISO standard `YYYY-MM` format.
   - Detects statement currency (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`) without artificial currency conversion.
4. **Feed Continuity & Partial Month Drop**:
   - Filters out incomplete current-month reporting and scores multi-source distributor migration feeds to eliminate double-counting.

---

### Phase 2: Live Artist & Catalogue Metadata Resolution

1. **Multi-Tiered Resolution Pipeline**:
   - **Tier 1 (Production)**: Spotify Web API Client Credentials OAuth (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`).
   - **Tier 2 (Zero-Config Fallback)**: Scrapes public Spotify embed bearer tokens (`open.spotify.com/embed/artist/...`).
   - **Tier 3 (Direct Client Fallback)**: Queries Deezer API (`api.deezer.com`) and iTunes API (`itunes.apple.com`) directly via CORS for static hosting deployments.
2. **Spotify Link & URI Resolution**:
   - Extracts 22-character Spotify IDs from all link variants (`open.spotify.com/artist/ID`, `open.spotify.com/intl-xx/artist/ID?si=...`, `spotify:artist:ID`).
   - Fetches canonical artist names, avatar images, follower counts, and popularity indexes via Spotify oEmbed endpoints.
3. **ISRC Distributor Analysis**:
   - Analyzes ISRC prefix codes to detect distributor origins (`QZ` -> DistroKid / Too Lost, `TC` -> TuneCore, `US7` -> The Orchard).

---

### Phase 3: Catalogue Advance Valuation ($A_{\text{catalog}}$)

The catalogue advance is defined as:

$$A_{\text{catalog}} = R_0 \times K(T) \times (1 - p) \times E(e)$$

#### 1. Trailing Monthly Revenue Anchor ($R_0$)
To protect against single-month anomalies, $R_0$ is calculated as the median of the last $R_{\text{win}}$ usable statement months (default $R_{\text{win}} = 3$):

$$R_0 = \text{median}\left(\text{Revenue}_{m_1}, \text{Revenue}_{m_2}, \dots, \text{Revenue}_{m_{R_{\text{win}}}}\right)$$

Sensitivity is tracked via $R_{0,\text{last}}$ (the final single usable month).

#### 2. Base Valuation Multiple ($K_{\text{base}}(T)$)
Base valuation multiples map deterministically to deal term lengths ($T$ years):

$$\begin{aligned}
T = 1 \text{ Year} \quad &\implies \quad K_{\text{base}}(1) = 10.797 \quad (\rho = 90.0\%) \\
T = 2 \text{ Years} \quad &\implies \quad K_{\text{base}}(2) = 20.816 \quad (\rho = 86.7\%) \\
T = 3 \text{ Years} \quad &\implies \quad K_{\text{base}}(3) = 29.211 \quad (\rho = 81.1\%) \\
T = 5 \text{ Years} \quad &\implies \quad K_{\text{base}}(5) = 36.028 \quad (\rho = 60.0\%)
\end{aligned}$$

The implicit annual recoupment split is $\rho(T) = \frac{K_{\text{base}}(T)}{12 \times T}$.

#### 3. Risk Discount ($d$) and Active Multiple ($K(T)$)
The base multiple is adjusted for catalog risk $d$:

$$K(T) = K_{\text{base}}(T) \times (1 - d)$$

Where total risk discount $d$ is capped at $55\%$ ($d \le 0.55$) and computed as:

$$d = \min\left(0.55, (d_{\text{conc}} + d_{\text{decay}}) \times \text{TERM\_SENS}(T)\right)$$

- **Concentration Discount ($d_{\text{conc}}$)**: Derived from the sample-corrected Gini Index ($G^*$):
  $$G^* = \frac{n}{n - 1} \times \left[ \frac{2 \sum_{i=1}^{n} i \cdot v_{(i)}}{n \sum_{i=1}^{n} v_{(i)}} - \frac{n + 1}{n} \right]$$
  $$d_{\text{conc}} = W_{\text{conc}} \times \text{clamp}_{0,1}\left( \frac{G^* - C^*}{1 - C^*} \right)$$
  *(Default parameters: $W_{\text{conc}} = 0.20$, $C^* = 0.55$)*

- **Share-Weighted Decay Discount ($d_{\text{decay}}$)**: Measures log-linear monthly growth rates ($g_i$) per track with earnings share $\ge 0.5\%$:
  $$d_{\text{decay}} = W_{\text{decay}} \times \sum_{i} \left( \text{share}_i \times \text{severity}_i \right)$$
  *(Default parameter: $W_{\text{decay}} = 0.25$)*

- **Term Sensitivity Scaling ($\text{TERM\_SENS}(T)$)**:
  $$\text{TERM\_SENS}(1) = 0.70, \quad \text{TERM\_SENS}(2) = 0.85, \quad \text{TERM\_SENS}(3) = 1.00, \quad \text{TERM\_SENS}(5) = 1.20$$

#### 4. Pay-Through Factor ($(1 - p)$)
Adjusts for ongoing monthly revenue paid through to the artist before full recoupment ($p \in [0.0, 0.50]$). For standard 100% recoupment deals ($p = 0\%$), $(1 - p) = 1.0$.

#### 5. Early Recoupment & Post-Recoupment Split Multiplier ($E(e)$)
Adjusts the advance when the artist retains a post-recoupment share $e < 100\%$:

$$E(e) = \min\left(1.30, \frac{\rho(T) + \frac{1 - e}{1 - d}}{\rho(T) + (1 - e)}\right)$$

---

### Phase 4: Contracted New-Release Valuation ($A_{\text{new}}$)

If the contract includes $N$ unreleased future singles ($N > 0$):

$$A_{\text{new}} = N \times A_{\text{single}}$$

Where single-track advance sizing is defined as:

$$A_{\text{single}} = \hat{M}_0 \times L \times \rho(T) \times 0.50$$

- **Baseline Month-1 Peak Revenue ($\hat{M}_0$)**: $\hat{M}_0 = R_0 \times 0.15$.
- **Per-Artist Measured Lifetime Multiple ($L$)**: $L = 4.77$ (calibrated from single decay curves).
- **Effective Recoupment Split ($\rho(T)$)**: $\rho(T) = \frac{K_{\text{base}}(T)}{12 \times T}$.
- **Unreleased Risk Factor ($0.50$)**: Applies a 50% discount to account for production and delivery risk.

#### Empirical Range Envelope
The valuation model generates a target underwriting range $[range_{\text{lo}}, range_{\text{hi}}]$ for new-release allocations:

$$range_{\text{lo}} = 0.65 \times A_{\text{new}}, \quad range_{\text{hi}} = 1.55 \times A_{\text{new}}$$

---

### Phase 5: Master Consolidation & Payment Tranche Schedule

1. **Master Advance Offer**:
   $$A_{\text{total}} = A_{\text{catalog}} + A_{\text{new}}$$

2. **Milestone Payment Tranches**:
   For contracted new releases ($N > 0$), $A_{\text{new}}$ is structured into performance tranches:
   - **Tranche 1 (Signing / Execution)**: $30\%$ of $A_{\text{new}}$
   - **Tranche 2 (Delivery of Single 1)**: $35\%$ of $A_{\text{new}}$
   - **Tranche 3 (Delivery of Single N)**: $35\%$ of $A_{\text{new}}$

3. **Reconciliation & Audit Provenance**:
   - Computes total difference between declared statement summary totals and calculated transaction row totals:
     $$\text{Difference} = \left| \text{Statement\_Total}_{\text{declared}} - \text{Calculated\_Total} \right|$$
   - Flags discrepancies exceeding $\$0.50$ as `RECONCILIATION_MISMATCH`.

---

## Codebase Architecture

```
Royalty/
├── api/
│   └── index.py                  # Vercel Python Serverless Function entrypoint
├── backend/
│   ├── api/
│   │   └── main.py               # FastAPI REST API handlers & path alias router
│   ├── engine/
│   │   ├── catalog_pricer.py     # R0, Gini G*, Track Decay, K(T), A_catalog, E(e)
│   │   ├── new_release_pricer.py # Baseline M0_hat, decay curves, L, A_new
│   │   ├── ingestion_rules.py    # Multi-feed scoring & partial month drop
│   │   ├── normalizer.py         # Table auto-discovery & YYYY-MM date parsing
│   │   ├── schedule_builder.py   # Milestone tranche builder & cash meter
│   │   ├── valuation_engine.py   # Master engine orchestrator & multi-year solver
│   │   ├── provenance.py         # Flag compiler & field-level audit trail
│   │   └── config.py             # System parameters & constants
│   ├── services/
│   │   ├── llm_parser.py         # OpenAI GPT-4o / GPT-4o-mini Multimodal Parser
│   │   ├── preprocessor.py       # PDF, XLSX, DOCX, image preprocessor
│   │   └── spotify_client.py     # Spotify Web API / oEmbed / Deezer / iTunes client
│   └── tests/
│       ├── test_acceptance.py            # Vydia proposal acceptance test suite
│       ├── test_artist_search.py        # Spotify artist search test suite
│       ├── test_full_catalog_valuation.py # Catalog valuation engine test suite
│       ├── test_ingestion_and_schedule.py # Ingestion rules & tranche schedule tests
│       ├── test_islem23.py              # Islem-23 reference catalog regression suite
│       ├── test_live_artist_catalogue.py # Live catalogue & monthly streams tests
│       └── test_multimodal_parser.py     # Multimodal LLM parser test suite
├── index.html                    # MoneTunes web application interface
├── styles.css                    # Design system tokens & layout styles
├── app.js                        # Client application controller & fallback engine
├── vercel.json                   # Vercel Serverless Function & routing configuration
├── netlify.toml                  # Netlify Static Hosting SPA rewrite rules
├── requirements.txt              # Backend Python dependencies
└── server.py                     # Local development entrypoint script
```

---

## Deployment Options

### 1. Vercel Deployment (Serverless Python + Static Web)

The repository includes [`vercel.json`](file:///c:/Users/amany/OneDrive/Desktop/Royalty/vercel.json) and [`api/index.py`](file:///c:/Users/amany/OneDrive/Desktop/Royalty/api/index.py) preconfigured for Vercel Serverless Functions (`@vercel/python`).

- Push code to GitHub and connect repository in Vercel.
- Configure Environment Variables in Vercel Dashboard:
  ```env
  OPENAI_API_KEY=sk-proj-...
  SPOTIFY_CLIENT_ID=your_client_id
  SPOTIFY_CLIENT_SECRET=your_client_secret
  ```

### 2. Netlify Deployment (Static Web + Client Fallback)

The repository includes [`netlify.toml`](file:///c:/Users/amany/OneDrive/Desktop/Royalty/netlify.toml) configured for static hosting.

- The application automatically uses browser-native CORS endpoints (Spotify oEmbed, Deezer API, iTunes API) and client-side instant statement parsing (`parseCSVTextClientSide`).
- Push code to GitHub and connect repository in Netlify.

### 3. Local Development Server

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run local server
python server.py
```

Access local instances at:
- **Web Application**: `http://localhost:8050`
- **Swagger API Docs**: `http://localhost:8050/docs`

---

## Verification & Test Suite

Run the full automated test suite (26 unit tests):

```bash
python -m pytest backend/tests/ -v
```

---

## License

Distributed under the MIT License. See `LICENSE` for details.
