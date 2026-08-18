# Advance Royalty Calculator & Valuation Engine

A web application and quantitative pricing engine for music catalog and new-release advances. Replicates the 5-stage portal flow with live Spotify artist search, revenue inputs, quick range estimation, live distributor multi-file statement ingestion, and the deterministic advance & risk underwriting engine.

---

## 🌟 Application Workflow (5 Stages)

1. **Stage 1: Add a New Deal (`ADD A NEW DEAL`)**
   - Live Spotify Artist search query with high-resolution artist image, verified badge, genres, and Spotify ID.
   - Segmented toggle for `[ ARTIST ]` vs `[ LABEL ]`.
2. **Stage 2: Get Funding (`GET FUNDING`)**
   - Declared last-month streaming revenue input (`$ [ 0.00 ]`).
3. **Stage 3: View Quotes (`VIEW QUOTES`)**
   - Interactive Deal Parameters: Term length (1, 2, 3, 5, 8 years), Pay-through % (0% to 50%), Post-recoupment share $e$, and Contracted new singles $N$.
   - Live Estimator Card showing initial estimate range (*"Between $17,700 and $39,900"*).
4. **Stage 4: Upload Distribution Reports (`UPLOAD REPORTS`)**
   - Searchable distributor picker with logos (DistroKid, TuneCore, CD Baby, Too Lost, DashGo, Sony / The Orchard, AWAL, BMG, etc.).
   - Multi-file statement dropzone (`.csv, .tsv, .txt, .xlsx, .xls, .pdf`).
   - 1-Click validation datasets (Islem-23, Arta, INCE, PULP).
   - **Strict Gate**: At least 6 months of valid statements required before moving to Stage 5.
5. **Stage 5: Final Advance Figures & Underwriting Hub**
   - Headline approved advance: $A_{catalog}$, $A_{new}$ with empirical range $[range_{lo}, range_{hi}]$, and $A_{total}$.
   - Option A (Market Table Multiple) vs. Option B (Measured Catalog Decay) with $A/B$ divergence ratio alert.
   - Run-rate $R_0$ (trailing-3 median), Gini concentration $G^*$, and share-weighted decay rates.
   - Milestone payment schedule builder with at-risk cash meter.
   - System flags in plain English & exportable Underwriting Memo.

---

## 🚀 How to Run

### Option 1: Direct Browser Launch (Instant Zero-Setup)
Simply open [index.html](file:///c:/Users/amany/OneDrive/Desktop/Royalty/index.html) in any modern web browser (Chrome, Edge, Firefox, Safari). The standalone app includes the full interactive UI and deterministic pricing core.

### Option 2: Python Backend Server
```bash
# Install dependencies
pip install fastapi uvicorn pandas

# Run FastAPI server
uvicorn backend.api.main:app --reload --port 8000
```
Then visit `http://localhost:8000/` or test the REST API documentation at `http://localhost:8000/docs`.

---

## 🧪 Mathematical Verification & Testing

- **Islem-23 Ground Truth**: Run `python -m unittest backend/tests/test_islem23.py` to verify reproduction of $R_0 = \$317.59$, $A = \$11,442$ at 5 years ($0.00\%$ error), and all 27 grid cells.
- **Vydia Acceptance Suite**: Run `python -m unittest backend/tests/test_acceptance.py` to test Arta P1/P2/P3, INCE, and ORANGLE.
