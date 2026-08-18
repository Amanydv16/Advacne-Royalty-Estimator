# 🎵 MoneTunes — Advance Royalty Calculator & Valuation Engine

[![Python](https://img.shields.io/badge/Python-3.11+-e11d48.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Build Status](https://img.shields.io/badge/Engine-Deterministic_Pass-10b981.svg?style=for-the-badge)](https://github.com/Amanydv16/Roayalty-calculator)

**MoneTunes** is a deterministic royalty advance sizing and underwriting engine designed for music catalogs and new-release contracts. It processes raw multi-distributor royalty statement files (`CSV`, `TSV`, `TXT`, `XLSX`), standardises line items across 6 industry formats, applies multi-feed scoring and ingestion rules, and calculates exact advance offers backed by a complete provenance trail.

---

## 🌟 Key Features

- 🎧 **Live Spotify Artist Directory**: Direct integration with Spotify Web API to search artists/labels, displaying verified profile photos, genre tags, monthly followers, and popularity meters.
- 📊 **Deterministic Sizing Engine**: 100% reproducible advance offers with zero machine-learning black boxes. Every number traces directly back to statement line items.
- 📁 **Multi-Format Ingestion Pipeline**: Auto-detects 6 major royalty statement formats (DistroKid, TuneCore, CD Baby, Too Lost, DashGo, Sony/The Orchard, AWAL, BMG, etc.).
- 🛡️ **Rule-Based Ingestion**:
  - **Multi-Source Feed Scoring**: Automatically scores and selects the highest-earning feed when artists migrate distributors, preventing double-counted run-rates.
  - **Partial Trailing Month Drop**: Detects and drops incomplete current month statements.
  - **Missing Feed Detection**: Identifies dropped platform feeds and excludes zero-reporting anomalies.
- ⚡ **Catalogue Valuation ($A_{\text{catalog}}$)**: Trailing median anchor $R_0$, sample-corrected Gini concentration $G^*$, share-weighted song decay $d_{\text{decay}}$, term risk discounts, and closed-form early recoupment multipliers $E(e)$.
- 🚀 **New-Release Valuation ($A_{\text{new}}$)**: Peak-anchored decay shape fitting, per-artist lifetime multiple $L$, and empirical range envelope $[range_{\text{lo}}, range_{\text{hi}}]$ for contracted singles ($N > 0$).
- 📑 **Underwriting Hub & Provenance**: Milestone payment schedule builder, at-risk cash meter, automated flag engine, and 1-click exportable Underwriting Memo.

---

## 📐 Mathematical Specification

### Master Advance Formula

$$A_{\text{total}} = A_{\text{catalog}} + A_{\text{new}}$$

### 1. Catalogue Advance ($A_{\text{catalog}}$)

$$A_{\text{catalog}} = R_0 \times K(T) \times (1 - p) \times E(e)$$

Where:
- **$R_0$ (Current Monthly Revenue)**: Median earnings across the trailing $R_{\text{WIN}}$ usable months (default $R_{\text{WIN}} = 3$).
- **$K(T)$ (Active Multiple)**: Base multiple adjusted for catalog risk:
  $$K(T) = K_{\text{base}}(T) \times (1 - \text{risk\_discount})$$
- **$K_{\text{base}}(T)$ (Term Multipliers)**:
  - 1 Year: $10.797$ ($\rho = 90.0\%$)
  - 2 Years: $20.816$ ($\rho = 86.7\%$)
  - 3 Years: $29.211$ ($\rho = 81.1\%$)
  - 5 Years: $36.028$ ($\rho = 60.0\%$)
- **$\text{risk\_discount}$**:
  $$\text{risk\_discount} = \min\left(0.55, (d_{\text{conc}} + d_{\text{decay}}) \times \text{TERM\_SENS}(T)\right)$$
  - **Concentration Discount ($d_{\text{conc}}$)**: Derived from sample-corrected Gini $G^*$.
  - **Share-Weighted Decay ($d_{\text{decay}}$)**: Log-linear slope fitting per song with share $\ge 0.5\%$.
- **$E(e)$ (Early Recoupment Multiplier)**:
  $$E(e) = \min\left(1.30, \frac{\rho(T) + \frac{1-e}{1-d}}{\rho(T) + (1-e)}\right)$$

### 2. New-Release Advance ($A_{\text{new}}$)

$$A_{\text{new}} = N \times m_0 \times L \times \rho(T) \times 0.50$$

Where $N$ is the number of contracted singles, $m_0$ is the median peak first-month earnings, and $L$ is the per-artist measured lifetime multiple.

---

## 💻 Codebase Structure

```
Royalty/
├── backend/
│   ├── api/
│   │   └── main.py               # FastAPI REST API endpoints & static serving
│   ├── engine/
│   │   ├── catalog_pricer.py     # R0, Gini, Decay, Risk Discount, A_catalog, E(e)
│   │   ├── new_release_pricer.py # Release filtering, peak decay curves, L, A_new
│   │   ├── ingestion_rules.py    # Distributor feed scoring & partial month drop
│   │   ├── normalizer.py         # Statement format detection & standardisation
│   │   ├── schedule_builder.py   # Payment schedule tranches & at-risk cash meter
│   │   ├── valuation_engine.py   # Master engine pipeline orchestrator
│   │   ├── provenance.py         # System flag compiler & provenance payload
│   │   └── config.py             # Configurable finance parameters
│   ├── services/
│   │   └── spotify_client.py     # Spotify Web API proxy client
│   └── tests/
│       ├── test_islem23.py       # Islem-23 reference catalog verification suite
│       └── test_acceptance.py    # Vydia proposal acceptance test suite
├── sample_data/                  # Curated reference royalty statement files
├── index.html                    # MoneTunes frontend interface
├── styles.css                    # MoneTunes Ruby Crimson Red design system
├── app.js                        # Frontend UI controller & state manager
└── server.py                     # Entrypoint script for local development
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.11+
- `pip` package manager

### 1. Install Dependencies
```bash
pip install fastapi uvicorn pandas pytest
```

### 2. Launch Development Server
```bash
python server.py
```

The server will start on port **8050**:
- **Interactive Web App**: [http://localhost:8050](http://localhost:8050)
- **API Documentation (Swagger UI)**: [http://localhost:8050/docs](http://localhost:8050/docs)

---

## 🧪 Testing & Verification

Run the test suite to verify mathematical precision against reference catalogs:

```bash
python -m pytest
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
