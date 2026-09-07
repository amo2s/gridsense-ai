# ⚡ GridSense AI

### Electricity Intelligence & Explainable Decision-Support Platform

> **“Nigeria doesn't need another electricity dashboard. It needs electricity intelligence.”**

GridSense AI is a **PowerTech intelligence and decision-support platform** built for the **NESI Innovation Challenge 2026 — Track 6: Energy Data & AI Intelligence**.

The platform transforms fragmented electricity-sector data into:

**Data → Analysis → Prediction → Risk → Priority → Action**

GridSense AI is designed to help electricity-sector stakeholders understand **where reliability is deteriorating, what unusual patterns are occurring, which areas may face higher near-term reliability risk, and where limited investigation or intervention resources should be prioritized.**

The system combines:

- Reliability intelligence
- Outage-risk estimation
- Anomaly detection
- Intervention prioritization
- Explainable analytics
- Natural-language interaction with platform data
- Operational dashboards
- Alerts
- Historical trend analysis

GridSense AI is **not a replacement for SCADA, protection systems, dispatch systems, control systems, or utility engineering teams**.

It is a **decision-support layer** that sits above available electricity data and intelligence systems.

---

# 📌 Table of Contents

- [Overview](#-overview)
- [The Problem](#-the-problem)
- [Our Solution](#-our-solution)
- [Core Product Thesis](#-core-product-thesis)
- [What GridSense AI Is](#-what-gridsense-ai-is)
- [What GridSense AI Is Not](#-what-gridsense-ai-is-not)
- [Key Users](#-key-users)
- [Core Intelligence Engines](#-core-intelligence-engines)
  - [Engine A — Reliability Intelligence](#engine-a--reliability-intelligence)
  - [Engine B — Outage-Risk Prediction](#engine-b--outage-risk-prediction)
  - [Engine C — Anomaly Detection](#engine-c--anomaly-detection)
  - [Engine D — Intervention Prioritization](#engine-d--intervention-prioritization)
- [Explainable AI Assistant](#-explainable-ai-assistant)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Data Strategy](#-data-strategy)
- [Database Architecture](#-database-architecture)
- [Application Flow](#-application-flow)
- [API Architecture](#-api-architecture)
- [Dashboard & UX](#-dashboard--ux)
- [Responsible AI & Data Governance](#-responsible-ai--data-governance)
- [Machine Learning Philosophy](#-machine-learning-philosophy)
- [Evaluation & Metrics](#-evaluation--metrics)
- [Testing Strategy](#-testing-strategy)
- [Repository Structure](#-repository-structure)
- [Engineering Roadmap](#-engineering-roadmap)
- [MVP Scope](#-mvp-scope)
- [Definition of Done](#-definition-of-done)
- [Business & Scaling Strategy](#-business--scaling-strategy)
- [Future Expansion](#-future-expansion)
- [Competition Demo Flow](#-competition-demo-flow)
- [Team Responsibilities](#-team-responsibilities)
- [Risks & Mitigation](#-risks--mitigation)
- [Engineering Principles](#-engineering-principles)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Development Workflow](#-development-workflow)
- [Project Status](#-project-status)
- [Limitations](#-limitations)
- [Vision](#-vision)

---

# 🌍 Overview

Nigeria's electricity ecosystem produces large amounts of operational information.

Outages happen.

Reliability changes over time.

Faults occur.

Some feeders perform worse than others.

Some areas deteriorate gradually.

Some patterns only become obvious when historical information is compared with recent behavior.

The challenge is not simply collecting electricity data.

The challenge is turning that data into **usable intelligence for decision makers**.

GridSense AI addresses this information problem by building an intelligence layer that can analyze electricity-sector data and convert it into actionable signals.

Instead of asking an operator to manually inspect disconnected datasets, GridSense AI attempts to answer questions such as:

> **Which areas are becoming less reliable?**

> **What behavior is abnormal?**

> **Which locations have the highest near-term reliability risk?**

> **Which areas should receive attention first?**

> **Why did the system flag this location?**

The result is an intelligence workflow that moves from raw information toward prioritized, explainable decisions.

---

# 🚨 The Problem

Electricity reliability is influenced by multiple interconnected factors, including:

- Generation
- Transmission
- Distribution
- Network condition
- Demand
- Fault events
- Restoration performance
- Metering
- Operational decisions
- Historical reliability behavior

Because of this complexity, electricity stakeholders can accumulate significant amounts of data without necessarily having an efficient mechanism for converting that information into timely intervention priorities.

GridSense AI therefore deliberately avoids claiming to solve the entire electricity problem.

Instead, it focuses on a narrower and more defensible problem:

> **How can fragmented historical and operational electricity signals be transformed into timely, explainable reliability intelligence and intervention priorities?**

The platform focuses on four major questions:

1. **What areas or assets are showing worsening reliability?**
2. **Which patterns are abnormal compared with historical behavior?**
3. **Which locations have the highest near-term reliability risk?**
4. **Where should limited investigation or intervention resources be prioritized?**

---

# 💡 Our Solution

GridSense AI combines data engineering, statistical analysis, machine learning, and explainable AI into a single decision-support platform.

The platform receives electricity-related records and transforms them through multiple intelligence layers.

### Core pipeline

```text
Electricity Data
      ↓
Data Processing
      ↓
Reliability Analysis
      ↓
Anomaly Detection
      ↓
Risk Estimation
      ↓
Intervention Prioritization
      ↓
Explainability
      ↓
Human Decision
```

This means GridSense AI does not stop at:

> “Here is a chart.”

It attempts to answer:

> “Here is what changed, how significant it appears to be, what the current risk looks like, why the system believes that, and which area deserves attention first.”

---

# 🎯 Core Product Thesis

The central thesis of GridSense AI is:

> **GridSense AI converts electricity data into reliability scores, anomaly detection, outage-risk predictions, intervention priorities, and explainable insights for electricity-sector decision makers.**

The product's fundamental value proposition is:

> **Move from fragmented electricity data to prioritized, explainable action.**

---

# 🧠 What GridSense AI Is

GridSense AI is an:

- Electricity intelligence platform
- Reliability analytics system
- Outage-risk intelligence layer
- Anomaly detection platform
- Intervention prioritization system
- Explainable decision-support tool
- Natural-language analytics interface

The platform provides intelligence through a combination of:

- Web dashboards
- Analytics
- Risk scores
- Alerts
- Historical trends
- Anomaly detection
- Predictions
- Priority rankings
- AI explanations

---

# 🚫 What GridSense AI Is Not

GridSense AI intentionally avoids overclaiming.

It is **not**:

- A national-grid control system
- A replacement for SCADA
- A protection system
- A dispatch system
- A utility engineering replacement
- A system that guarantees physical component failure predictions
- A system that automatically controls the electricity grid
- A consumer-only outage-reporting application
- A generic chatbot
- A decorative electricity dashboard

Most importantly:

> **GridSense AI does not claim to know exactly which physical component will fail.**

Instead, it produces **risk estimates and decision-support signals** based on available data.

---

# 👥 Target Users

GridSense AI is designed primarily for organizations and professionals who need electricity intelligence for operational decisions.

Potential users include:

### Electricity Distribution Companies

DisCos can use reliability intelligence to identify areas or feeders that require investigation.

### Energy Operators

Operators can monitor trends, anomalies, and risk indicators.

### Mini-grid Operators

Mini-grid operators can use the platform to monitor reliability and prioritize operational attention.

### Energy Agencies

Government and sector stakeholders can use aggregated intelligence to understand reliability patterns.

### Facilities & Energy Managers

Large energy consumers can use intelligence to monitor and prioritize energy reliability issues.

### Future Customers

The platform can eventually support:

- Energy service companies
- Energy infrastructure operators
- Industrial energy users
- Regulatory stakeholders

---

# 🧠 Core Intelligence Engines

GridSense AI's competitive advantage is centered around four intelligence engines.

```text
                 GridSense AI
                      │
       ┌──────────────┼──────────────┐
       │              │              │
 Reliability       Outage         Anomaly
 Intelligence       Risk         Detection
       │              │              │
       └──────────────┼──────────────┘
                      │
              Intervention
                Priority
                      │
                      ↓
              Explainable Action
```

---

# Engine A — Reliability Intelligence

## Purpose

Reliability Intelligence converts raw or processed electricity records into interpretable performance indicators.

Potential inputs include:

- Outage start timestamps
- Restoration timestamps
- Outage frequency
- Interruption duration
- Recent fault events
- Power availability
- Supply hours
- Historical time patterns
- Historical day patterns
- Area identity
- Feeder identity
- Customer impact estimates

---

## Example

```text
AREA: Feeder A

Reliability Score: 62 / 100
Risk: HIGH
Trend: Deteriorating

Most Vulnerable Period:
18:00 – 22:00

Key Signals:
- Repeated recent interruptions
- Increasing interruption duration
- Historical evening instability
```

The reliability score is a **GridSense decision-support indicator**.

It is not an official regulatory reliability rating.

The scoring methodology must therefore be:

- Documented
- Reproducible
- Versioned
- Testable

---

# Engine B — Outage-Risk Prediction

## Purpose

The outage-risk engine estimates the likelihood or risk of a reliability interruption within a defined future window.

GridSense AI deliberately starts with a modest prediction target.

Instead of claiming:

> “This exact transformer will fail at 8:42 PM.”

the system should say something closer to:

> “This feeder currently exhibits elevated reliability risk within the next defined forecast window.”

---

## Example

```text
FEEDER A

Current Risk: 78 / 100
Risk Level: HIGH
Forecast Window: Next 6 Hours

Contributing Signals:

1. Recent interruption frequency
2. Historical evening instability
3. Increasing interruption duration
4. Recent abnormal behavior
```

---

## Modeling Strategy

The system follows a data-first approach.

### Step 1 — Baseline

Start with a simple statistical model.

### Step 2 — Machine Learning

If sufficient labeled data exists, introduce an interpretable ML classifier or regression model.

### Step 3 — Time-Aware Validation

Use:

```text
Past Data → Training
Later Data → Validation
Future Holdout → Testing
```

This reduces the risk of future information leaking into the training process.

### Step 4 — Evaluate

Depending on the problem:

- Precision
- Recall
- F1
- ROC-AUC
- PR-AUC

### Step 5 — Calibration

If the model outputs probability-like values, probabilities should be calibrated where appropriate.

---

## Critical Principle

> **Model complexity must follow data quality.**

A simple model evaluated honestly is better than a sophisticated model trained using unreliable or invented labels.

---

# Engine C — Anomaly Detection

## Purpose

Anomaly Detection determines whether current electricity behavior looks meaningfully different from expected historical behavior.

For example:

```text
Historical Pattern
       ↓
Stable

Current Behavior
       ↓
Repeated unusual interruptions

       ↓

RELIABILITY ANOMALY
```

---

## Example Alert

```text
Type: Reliability Anomaly

Severity: HIGH

Confidence: 0.89

Recommended Action:
Investigate the affected feeder/area
and recent fault reports.
```

---

## Candidate Techniques

The anomaly engine can begin with relatively interpretable methods.

### Statistical thresholds

- Z-score
- Robust statistical thresholds

### Rolling-window analysis

Compare recent behavior with historical rolling baselines.

### Seasonal baselines

Account for:

- Time of day
- Day of week
- Historical seasonal patterns

### Multivariate anomaly detection

Potentially use:

- Isolation Forest

### Future methods

More advanced time-series anomaly methods can be introduced when the data justifies them.

---

## Explainability Requirement

Every anomaly should have a human-inspectable reason.

Bad:

```text
ANOMALY DETECTED
```

Better:

```text
ANOMALY DETECTED

Severity: HIGH

Why:
- Interruption frequency increased by X
- Average duration increased
- Behavior differs from historical evening baseline
```

The exact metrics depend on the selected dataset.

---

# Engine D — Intervention Prioritization

## Purpose

Intervention Prioritization converts analytics into an operational decision.

Instead of simply showing ten high-risk areas, GridSense AI attempts to answer:

> **Which one deserves attention first?**

Potential priority factors include:

- Reliability severity
- Outage frequency
- Interruption duration
- Number of affected customers
- Recurrence
- Recent deterioration
- Anomaly severity
- Model confidence

Conceptually:

```text
Priority Score =
    Weighted Severity
  + Weighted Recurrence
  + Weighted Impact
  + Weighted Trend
  + Weighted Confidence
```

---

## Example

| Area | Reliability | Risk | Priority |
|---|---:|---|---:|
| Area A | 41/100 | High | 94 |
| Area D | 52/100 | High | 87 |
| Area B | 58/100 | Medium | 71 |
| Area C | 77/100 | Low | 34 |

The actual weights must be determined after the real dataset is understood.

GridSense AI should **never invent weights simply to generate attractive dashboard numbers**.

---

# 🤖 Explainable AI Assistant

The AI Assistant sits on top of GridSense's intelligence platform.

It is **not the core product**.

The deterministic analytics engines remain the source of truth.

The assistant acts as the:

- Natural-language interface
- Explanation layer
- Query interface
- Decision-support conversational layer

---

## Example Questions

Users can ask:

```text
Why is Area A high risk?

Which areas require attention first?

What changed compared with last week?

Which feeders have worsening reliability?

What are the main factors behind this alert?
```

---

# 🔐 Grounded AI Architecture

The assistant should never simply ask an LLM to “guess” electricity-sector information.

Instead:

```text
User Question
      ↓
Intent / Query Understanding
      ↓
Approved Data + Analytics Retrieval
      ↓
Context Assembly
      ↓
LLM Explanation Layer
      ↓
Answer + Supporting Metrics
```

The LLM therefore explains information already produced or retrieved from the platform.

### Source of truth

```text
PostgreSQL
     +
Deterministic Analytics
     +
Validated ML Outputs
          ↓
      AI Assistant
          ↓
      Explanation
```

This reduces the risk of hallucinating grid facts.

---

# 🏗️ System Architecture

The core architecture is:

```text
┌──────────────────────────────────────────┐
│              Next.js Frontend            │
│ Dashboard • Analytics • Alerts • UX      │
└─────────────────────┬────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────┐
│                 Go Backend               │
│ API Gateway • Auth • Data • Alerts       │
└───────────────┬──────────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ PostgreSQL   │  │ Alert / Job      │
│ Core Data    │  │ Processing       │
└───────┬──────┘  └──────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│            Python FastAPI                │
│ Risk • Anomaly • Analytics • ML          │
└──────────────────────────────────────────┘
```

---

# 🔄 End-to-End Request Flow

Example:

```http
GET /api/v1/areas/{id}/risk
```

The request follows this path:

```text
1. Next.js
      ↓
2. Go Backend
      ↓
3. Request Validation
      ↓
4. Latest Data Retrieval
      ↓
5. Python /predict-risk
      ↓
6. Risk Score + Contributing Factors
      ↓
7. Go Stores / Returns Result
      ↓
8. Next.js Renders Result
```

---

# 🧰 Technology Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js | Dashboard and UX |
| Frontend Language | TypeScript | Type-safe UI development |
| Backend | Go | API gateway, auth, operational services |
| AI Service | Python | ML, analytics and inference |
| API Framework | FastAPI | AI-service API |
| Database | PostgreSQL | Core application and energy data |
| Data Science | Pandas | Data processing |
| Data Science | NumPy | Numerical computation |
| ML | scikit-learn | Baseline/interpretable ML |
| Validation | Pydantic | Python API validation |
| Database Access | SQLAlchemy/equivalent | Python-side data access |
| Deployment | Containers | Reproducible services |

---

# 🐹 Why Go + Python?

GridSense AI intentionally separates operational backend engineering from data science.

## Go

Go is responsible for:

- API gateway
- Authentication
- Authorization
- Operational APIs
- Data services
- Alerts
- Orchestration
- High-concurrency service workloads

## Python

Python is responsible for:

- Data processing
- Feature engineering
- Statistical analysis
- Machine learning
- Risk prediction
- Anomaly detection
- Intelligence services

This separation gives each language a clear responsibility.

```text
Go
│
├── Application backend
├── Authentication
├── APIs
├── Alerts
└── Orchestration

Python
│
├── Analytics
├── ML
├── Risk
├── Anomaly Detection
└── Intelligence
```

However:

> **Microservices should not be created merely to look sophisticated.**

If a service boundary adds unnecessary complexity to the MVP, services should be combined.

---

# 📊 Data Strategy

Data is the most important technical dependency in GridSense AI.

The team should **not build the AI first and search for data afterward**.

The project follows a four-tier data strategy.

---

## Tier 1 — Public Nigerian Energy Data

Use public Nigerian electricity-sector and regulatory information to ground the prototype in real sector context.

Potential sources include:

- NERC reports
- NERC statistics/performance resources
- Federal Ministry of Power publications

These sources must be independently checked for:

- Current availability
- Granularity
- Licensing
- Usage permissions
- Freshness
- Access methods

---

## Tier 2 — Open Datasets

Open datasets can expand the modeling dataset where licensing permits.

---

## Tier 3 — Synthetic Data

Synthetic data can be used for:

- Development
- Testing
- Demonstration
- Filling gaps

But synthetic data must always be clearly labeled.

### Never do this:

```text
Synthetic Dataset
        ↓
"Live Utility Data"
```

### Do this:

```text
Synthetic Prototype Data
        ↓
Clearly labeled demonstration dataset
```

---

## Tier 4 — Community / Operator Reports

Future versions can incorporate supplementary event streams from:

- Operators
- Community reports
- Field observations

---

# 🔎 Data Quality Checklist

Before using a dataset, the team should answer:

- What does each row represent?
- What is the time granularity?
- Are timestamps consistent?
- Are outages reliably labeled?
- Are missing values random or systematic?
- Are there duplicate records?
- Can reports be joined by area, feeder, and date?
- Is the data legally usable in the competition?
- Which fields are real?
- Which fields are synthetic?
- What period does the data cover?
- How fresh is the dataset?

---

# 🗄️ Database Architecture

GridSense AI uses PostgreSQL as its core data layer.

The initial conceptual schema contains the following entities.

---

## `users`

Stores platform users.

```text
id
name
email
role
created_at
```

---

## `areas`

Represents monitored geographical or operational areas.

```text
id
name
state
latitude
longitude
```

---

## `feeders`

Represents electricity feeders associated with areas.

```text
id
area_id
name
voltage_level
status
```

---

## `outage_events`

Stores outage events.

```text
id
feeder_id
started_at
restored_at
duration_minutes
cause
affected_customers
```

---

## `power_readings`

Stores available power measurements.

```text
id
feeder_id
timestamp
voltage
frequency
load
availability
```

---

## `fault_events`

Stores detected or recorded faults.

```text
id
feeder_id
timestamp
type
severity
```

---

## `risk_predictions`

Stores risk outputs.

```text
id
feeder_id
generated_at
horizon
score
level
model_version
```

---

## `anomalies`

Stores detected anomalies.

```text
id
feeder_id
detected_at
type
severity
score
explanation
```

---

## `alerts`

Stores operational alerts.

```text
id
feeder_id
type
severity
message
created_at
acknowledged_at
```

---

### Important Database Principle

The schema must evolve with the actual dataset.

> **Do not build tables for fields the team cannot actually populate.**

---

# 🖥️ Dashboard & UX

The dashboard exists to make intelligence understandable.

A user should be able to understand the value of a screen within seconds.

---

# Main Dashboard

The main dashboard should provide:

- Overall reliability
- High-risk areas
- Risk trends
- Priority areas
- Alerts
- Analytics

Conceptually:

```text
┌─────────────────────────────────────────────────────┐
│ GridSense AI                     Alerts   Profile   │
├──────────────┬──────────────────────────────────────┤
│ Dashboard    │ NATIONAL / REGIONAL OVERVIEW         │
│ Areas        │                                      │
│ Feeders      │ Reliability: 68/100                  │
│ Analytics    │ High Risk Areas: 12                  │
│ Alerts       │                                      │
│              │ [Reliability Trend]                  │
│              │ [Risk Analysis]                      │
│              │                                      │
│              │ Priority Areas                       │
│              │ 1. Area A — 94 HIGH                  │
│              │ 2. Area D — 87 HIGH                  │
└──────────────┴──────────────────────────────────────┘
```

---

# Feeder / Area Detail Page

A detailed view should include:

- Current reliability score
- Current risk level
- Historical trend
- Recent outages
- Anomaly timeline
- Prediction window
- Top contributing factors
- Intervention priority
- Data-quality indicator
- AI explanation

---

# UX Principle

> **Every chart must answer a question.**

Avoid decorative visualizations.

A chart should exist because it helps answer something such as:

- Is reliability improving?
- Is reliability deteriorating?
- When do interruptions occur most often?
- Which areas have higher risk?
- What changed recently?

---

# 🔌 API Architecture

The initial API blueprint includes:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/areas` | List monitored areas |
| GET | `/api/v1/areas/{id}` | Area overview |
| GET | `/api/v1/feeders/{id}` | Feeder details |
| GET | `/api/v1/feeders/{id}/reliability` | Reliability metrics |
| GET | `/api/v1/feeders/{id}/risk` | Latest risk result |
| GET | `/api/v1/feeders/{id}/anomalies` | Anomaly history |
| GET | `/api/v1/priorities` | Ranked intervention list |
| GET | `/api/v1/alerts` | Active/recent alerts |
| POST | `/api/v1/assistant/query` | Natural-language analytics query |
| GET | `/api/v1/health` | Service health |

---

# 🐍 Python Intelligence API

The Python service should expose intelligence capabilities such as:

```http
POST /v1/risk/predict
```

Predict or calculate risk.

```http
POST /v1/anomalies/detect
```

Detect anomalies.

```http
GET /v1/reliability/{feeder_id}
```

Retrieve reliability intelligence.

```http
POST /v1/priority/rank
```

Rank intervention priorities.

```http
GET /v1/health
```

Check AI service health.

```http
GET /v1/model/info
```

Return model/version information.

---

# 🔐 Responsible AI & Data Governance

GridSense AI is designed with responsible AI principles from the beginning.

## Authentication

Authentication should be separated from energy analytics permissions.

---

## Role-Based Access

Potential roles include:

```text
operator
admin
demo
```

Each role should have appropriate permissions.

---

## Privacy

The competition demo should not expose private customer information.

---

## Prediction Transparency

Predictions should record:

- Model version
- Data version
- Timestamp
- Input assumptions

---

## Synthetic Data Transparency

Synthetic data must always be clearly identified.

---

## Uncertainty

Where appropriate, the system should communicate:

- Confidence
- Uncertainty
- Limitations

---

## No Guaranteed Predictions

The system should never present a model output as a guaranteed physical failure.

Instead:

```text
HIGH RISK
```

is acceptable.

While:

```text
TRANSFORMER WILL FAIL AT 7:00 PM
```

would be an unjustified claim.

---

## Auditability

Changes to:

- Scoring logic
- Model versions
- Prediction methodology

should be traceable.

---

# 🧪 Machine Learning Philosophy

GridSense AI follows a simple rule:

> **Build the intelligence first. Validate it honestly. Then make it beautiful.**

The project deliberately avoids using deep learning simply because it sounds impressive.

The model should be selected according to:

```text
Data Quality
     ↓
Problem Type
     ↓
Baseline
     ↓
Validation
     ↓
Model Complexity
```

Not:

```text
"AI sounds impressive"
        ↓
Use biggest model available
```

---

# 📈 Evaluation & Metrics

## Risk Model

Potential metrics:

- Precision
- Recall
- F1
- ROC-AUC
- PR-AUC

The appropriate metric depends on the prediction problem and class distribution.

---

## Anomaly Detector

Measure:

- Precision
- False-positive rate

against labeled validation events where reliable labels exist.

---

## Reliability Score

Assess:

- Correlation with chosen reliability indicators
- Practical usefulness

---

## API

Measure:

- Latency
- Error rate
- Throughput

---

## Data Pipeline

Measure:

- Completeness
- Freshness
- Failed-ingestion rate

---

# 📊 Product Metrics

The platform can also measure:

### Decision Speed

How long does it take a user to identify the highest-priority area?

### Explanation Quality

What percentage of alerts have understandable explanations?

### Workflow Efficiency

How many manual analysis steps are eliminated?

### User Satisfaction

How do pilot users evaluate the usefulness of the platform?

### Reproducibility

Can the same result be reproduced from the same:

- Data version
- Model version
- Inputs

---

# 🧪 Testing Strategy

GridSense AI requires testing at multiple levels.

---

## Unit Tests

Test:

- Reliability score calculations
- Feature transformations
- Anomaly thresholds
- Priority scoring
- API validation

---

## Integration Tests

Test:

```text
Go → Python
Go → PostgreSQL
Frontend → Go
Alert Creation → Acknowledgement
```

---

## Model Tests

Test:

- Time-based holdout validation
- Baseline comparison
- Class imbalance
- False positives
- Drift monitoring strategy

---

## Demo Tests

The competition demo must be tested for:

- Network failure
- Expected scenarios
- Traceability of displayed numbers
- Synthetic-data labels
- Reproducibility

A judge should never see:

> “Wait, let me manually edit the database first.”

The demo should work repeatedly without manual database manipulation.

---

# 📁 Repository Structure

The initial repository structure is:

```text
gridsense-ai/
│
├── frontend/
│   └── # Next.js + TypeScript application
│
├── services/
│   │
│   ├── gateway/
│   │   └── # Go API gateway
│   │
│   ├── auth/
│   │   └── # Go authentication service
│   │
│   ├── data/
│   │   └── # Go data service
│   │
│   └── alerts/
│       └── # Go alert service
│
├── ai-service/
│   │
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   ├── ml/
│   │   └── schemas/
│   │
│   ├── tests/
│   └── notebooks/
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── synthetic/
│
├── database/
│   └── migrations/
│
├── docs/
│   ├── architecture/
│   ├── data-dictionary/
│   └── competition/
│
├── docker-compose.yml
│
└── README.md
```

### Architecture Rule

If the MVP is too small to justify several Go services, combine them into one Go service.

The goal is **useful boundaries**, not maximum service count.

---

# 🚀 Engineering Roadmap

## Phase 0 — Competition Intelligence

### Goal

Understand exactly what the competition requires.

Tasks:

- Confirm official challenge rules
- Review judging criteria
- Identify scoring weights
- Identify submission requirements
- Identify prototype requirements
- Identify official datasets/APIs
- Confirm eligibility requirements

### Exit Condition

The entire team can explain exactly what judges will score.

---

# Phase 1 — Problem & Data Discovery

### Goal

Prove that the selected use case is data-feasible.

Tasks:

- Collect candidate Nigerian electricity datasets
- Document data sources
- Document date ranges
- Document granularity
- Document fields
- Document licensing
- Profile missing values
- Identify duplicates
- Select initial geography
- Define prediction target
- Define evaluation window
- Create data dictionary

### Exit Condition

A clean sample dataset exists and the team understands what can and cannot be predicted.

---

# Phase 2 — Data Model

### Goal

Build the storage foundation.

Tasks:

- Create PostgreSQL schema
- Implement ingestion scripts
- Normalize timestamps
- Normalize identifiers
- Create migrations
- Seed development data
- Implement validation checks

### Exit Condition

A new developer can run the project and reproduce the database.

---

# Phase 3 — Intelligence Engine

### Goal

Build GridSense's actual competitive advantage.

Tasks:

- Reliability metrics
- Reliability scoring
- Anomaly baseline
- Prediction baseline
- Feature engineering
- Candidate ML models
- Time-aware evaluation
- Model versioning
- Evaluation storage

### Exit Condition

The AI service receives data and returns a defensible result.

---

# Phase 4 — Python FastAPI

### Goal

Expose intelligence through documented APIs.

Implement:

```text
POST /v1/risk/predict
POST /v1/anomalies/detect
GET  /v1/reliability/{feeder_id}
POST /v1/priority/rank
GET  /v1/health
GET  /v1/model/info
```

Also implement:

- Request validation
- Error handling
- Model versioning
- Structured logging
- Unit tests

### Exit Condition

AI capabilities are accessible through documented APIs.

---

# Phase 5 — Go Backend

### Goal

Create the production-style application layer.

Tasks:

- Authentication
- Authorization
- Area endpoints
- Feeder endpoints
- Data access
- Alert service
- API gateway
- Python integration
- Caching where useful
- API tests

### Exit Condition

The frontend consumes a stable Go API without directly depending on the internal Python implementation.

---

# Phase 6 — Next.js Frontend

### Goal

Make the intelligence understandable.

Build:

- Dashboard
- Area list
- Feeder details
- Risk visualization
- Anomaly timeline
- Priority ranking
- Alerts
- AI explanation panel
- Responsive UI

### Exit Condition

A judge can understand and follow the entire product story without engineering assistance.

---

# Phase 7 — Integration

Connect:

```text
Next.js
   ↓
Go
   ↓
PostgreSQL
   ↓
Python AI
```

Test:

- End-to-end scenarios
- Failure states
- Loading states
- Empty states
- Displayed values
- Model outputs
- Database values
- Synthetic-data labels

### Exit Condition

One stable demo flow works from start to finish.

---

# Phase 8 — Competition Polish

Tasks:

- Build 60–120 second demo
- Create problem → insight → prediction → action narrative
- Prepare technical metrics
- Prepare business model
- Prepare customer story
- Prepare architecture diagram
- Prepare data methodology
- Prepare limitations
- Prepare future roadmap
- Rehearse repeatedly

### Exit Condition

The team can demonstrate value without explaining every line of code.

---

# 🏆 MVP Scope

The competition MVP should remain focused.

### Core MVP

```text
Reliability Intelligence
        +
Outage Risk
        +
Anomaly Detection
        +
Intervention Priority
        +
Dashboard
        +
Explainability
```

Do not allow the project to expand uncontrollably.

---

# ✅ MVP Definition of Done

The MVP is considered complete when:

- A judge understands the problem within 30 seconds
- Dashboard displays real or clearly labeled prototype data
- Reliability score is reproducible
- Anomalies are identified using a documented method
- Risk estimate/score is defensible
- Intervention priorities are ranked
- Major factors behind results are explained
- Frontend works with Go backend
- Go works with PostgreSQL
- Go integrates with Python AI service
- Model evaluation results are documented
- Synthetic data is clearly labeled
- Limitations are honestly communicated
- Demo works repeatedly
- No manual database editing is required

---

# 💼 Business & Scaling Strategy

The competition MVP focuses primarily on technical validation.

Beyond the competition, GridSense AI has a B2B-oriented growth strategy.

---

# Potential Customers

### Electricity Distribution Companies

For operational reliability intelligence.

### Mini-grid Operators

For monitoring and prioritization.

### Commercial / Industrial Energy Users

For energy reliability analysis.

### Energy Service Companies

For analytics and operational intelligence.

### Government & Regulatory Stakeholders

For sector-level intelligence.

### Energy Infrastructure Operators

For monitoring and decision support.

---

# 💰 Potential Business Models

GridSense AI could eventually support:

### B2B SaaS

Subscription-based intelligence dashboards.

### Enterprise Deployment

Private deployment for organizations with specific security or data requirements.

### Pilot Contracts

Paid pilot implementations with energy operators.

### API / Data Intelligence

Expose intelligence through APIs.

### Custom Analytics

Build integrations and analytics for specific customers.

The strongest long-term direction is likely **B2B**, because the core product provides operational decision support rather than consumer entertainment.

---

# 🔮 Future Expansion

The future roadmap should remain subordinate to the MVP.

---

## MVP

```text
Reliability Intelligence
        ↓
Outage Risk
        ↓
Anomaly Detection
        ↓
Intervention Priority
```

---

## Pilot

Potential integrations:

```text
Utility / DisCo Data
Smart Meter Data
IoT Sensors
Community Reports
```

---

## Platform

Potential future intelligence modules:

```text
Asset Health
Loss / Theft Intelligence
Demand Forecasting
Renewable Forecasting
Microgrid Intelligence
Automated Alerts
API Ecosystem
```

The key principle:

> **Do not build future features until the core reliability-intelligence loop is credible.**

---

# 🎬 Competition Demo Flow

The recommended competition demonstration follows a simple narrative.

---

## Scene 1 — Problem

Explain:

Electricity stakeholders receive large amounts of operational information, but identifying which areas deserve attention—and why—can require fragmented analysis.

---

## Scene 2 — Dashboard

Show:

- Overall reliability
- High-risk areas
- Priority ranking

---

## Scene 3 — Drill Down

Select an area.

Show:

- Reliability trend
- Recent interruptions
- Current risk score

---

## Scene 4 — Intelligence

Show:

- Anomaly
- Prediction
- Contributing factors

---

## Scene 5 — Decision

Show the intervention ranking.

Ask:

> **“Where should we investigate first?”**

---

## Scene 6 — Explainability

Ask:

> **“Why is this area high risk?”**

The assistant should answer using the platform's actual metrics.

---

## Scene 7 — Impact

Finish with:

- Faster identification
- Better prioritization
- Explainable intelligence
- Foundation for future utility integrations

---

# 👨‍💻 Team Responsibilities

The project can be divided around ownership rather than titles.

| Role | Primary Ownership |
|---|---|
| Product / Team Lead | Problem framing, roadmap, pitch, integration, competition strategy |
| AI / Data Engineer | Dataset, feature engineering, reliability scoring, anomaly detection, ML evaluation |
| Go Backend Engineer | APIs, authentication, data services, alerts, orchestration |
| Frontend Engineer | Next.js dashboard, charts, UX, demo flow |
| Research / Domain Lead | Electricity-sector research, data sources, validation, impact narrative |
| Design / Presentation | Branding, dashboard polish, pitch deck, demo visuals |

One person may hold multiple roles.

The important thing is:

> **Ownership matters more than titles.**

---

# ⚠️ Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Not enough real data | Use public data + clearly labeled synthetic development data |
| Poor labels | Use anomaly/risk framing or carefully define labels |
| Overclaiming predictions | Use risk estimates and transparent limitations |
| Too much scope | Limit MVP to four intelligence engines + dashboard |
| Microservice complexity | Keep boundaries purposeful |
| Beautiful UI but weak AI | Build intelligence before UI polish |
| AI hallucinations | Ground assistant in retrieved platform data |
| Judges question credibility | Show methodology, provenance, metrics and limitations |

---

# 🧭 Engineering Principles

## 1. Data Before AI

Do not build sophisticated ML without understanding the dataset.

---

## 2. Intelligence Before UI

A beautiful dashboard cannot compensate for weak intelligence.

---

## 3. Explainability by Default

Every important result should have an understandable reason.

---

## 4. No Fake Precision

If the dataset does not support a probability, do not pretend it does.

---

## 5. No Fake Data Claims

Synthetic data must never be represented as live utility data.

---

## 6. Reproducibility

The same:

```text
Data
+
Model
+
Inputs
```

should produce the same result where deterministic behavior is expected.

---

## 7. Version Everything Important

Track:

- Data versions
- Model versions
- Scoring versions
- Assumptions
- Evaluation results

---

## 8. Keep Architecture Practical

Do not introduce a microservice because it looks impressive in an architecture diagram.

Introduce one because it has a real responsibility.

---

## 9. Build for the Judge

A competition judge should understand the product quickly.

The demo should tell a story:

```text
Problem
  ↓
Data
  ↓
Insight
  ↓
Prediction
  ↓
Priority
  ↓
Action
  ↓
Explanation
```

---

# 🚀 Getting Started

> **Note:** The commands below represent the intended development setup. They should be updated to match the actual implementation once the repository is initialized.

---

## Prerequisites

Recommended development environment:

- Node.js
- pnpm/npm
- Go
- Python
- PostgreSQL
- Docker / Docker Compose

---

# 1. Clone the Repository

```bash
git clone <repository-url>
cd gridsense-ai
```

---

# 2. Start Infrastructure

If using Docker:

```bash
docker compose up -d
```

This should eventually provide the required infrastructure for local development.

---

# 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The Next.js development server should then start locally.

---

# 4. Python AI Service

Navigate to:

```bash
cd ai-service
```

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it.

### Linux/macOS

```bash
source .venv/bin/activate
```

### Windows

```powershell
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run FastAPI:

```bash
uvicorn app.main:app --reload
```

---

# 5. Go Backend

Navigate to the Go service:

```bash
cd services/gateway
```

Download dependencies:

```bash
go mod tidy
```

Run:

```bash
go run .
```

---

# 🧪 Development Workflow

Recommended development order:

```text
1. Understand challenge requirements
          ↓
2. Validate data
          ↓
3. Define data model
          ↓
4. Build reliability intelligence
          ↓
5. Build anomaly detection
          ↓
6. Build risk engine
          ↓
7. Build intervention prioritization
          ↓
8. Expose Python APIs
          ↓
9. Build Go application layer
          ↓
10. Build frontend
          ↓
11. Integrate everything
          ↓
12. Test
          ↓
13. Build demo
          ↓
14. Polish
```

Do **not** reverse this order by spending the first sprint building every frontend screen.

The first sprint should prove that the intelligence problem is technically feasible.

---

# 🔐 Environment Variables

Environment variables will depend on the final implementation.

A future `.env.example` should contain variables for things such as:

```env
DATABASE_URL=
AI_SERVICE_URL=
GO_API_URL=
NEXT_PUBLIC_API_URL=
JWT_SECRET=
```

Secrets must never be committed to Git.

---

# 📌 Project Status

**Project:** GridSense AI

**Challenge:** NESI Innovation Challenge 2026

**Track:** Track 6 — Energy Data & AI Intelligence

**Status:** MVP / Engineering Development

**Primary Thesis:**

> Data → Intelligence → Decision

### Current strategic focus

- Validate official competition requirements
- Validate available electricity data
- Lock the MVP specification
- Build the intelligence engines
- Establish reproducible data pipelines
- Integrate AI with the backend
- Build the decision-support interface
- Prepare the competition demo

---

# ⚠️ Limitations

GridSense AI's capabilities depend heavily on the quality and availability of electricity-sector data.

Important limitations include:

### Data Availability

The quality of predictions depends on the quality, completeness, granularity, and freshness of available data.

### Labels

Supervised ML requires reliable labels.

Poor labels can produce misleading models.

### Synthetic Data

Synthetic datasets can demonstrate system behavior but cannot automatically establish real-world predictive performance.

### Prediction Uncertainty

Risk estimates are not guarantees.

### Operational Integration

The MVP does not directly control electricity infrastructure.

### Sector Complexity

Electricity reliability has many physical and operational causes that cannot necessarily be inferred from limited datasets.

Therefore:

> **GridSense AI is a decision-support platform, not an autonomous grid-control system.**

---

# 🌐 Vision

The long-term vision of GridSense AI is to create an intelligence layer that allows electricity-sector organizations to move from fragmented operational information toward **explainable, prioritized decisions**.

The platform starts with reliability.

It can eventually expand into broader electricity intelligence.

```text
                 GRID SENSE AI
                       │
                       ▼
              Electricity Data
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Reliability    Anomalies     Risk
          │            │            │
          └────────────┼────────────┘
                       ▼
                Prioritization
                       │
                       ▼
                 Explanation
                       │
                       ▼
                   ACTION
```

The long-term objective is not to create another dashboard full of charts.

It is to help energy stakeholders answer:

> **What is happening?**

> **Why is it happening?**

> **What is likely to happen next?**

> **What deserves attention first?**

> **Why should we trust this recommendation?**

That is the core of GridSense AI.

---

# 🏁 Final Product Positioning

GridSense AI should be positioned as:

> **An electricity intelligence and decision-support platform.**

Not merely:

- A dashboard
- A chatbot
- An outage-reporting application

Its competitive advantage is the combination of:

```text
Reliability Analytics
        +
Anomaly Detection
        +
Risk Prediction
        +
Intervention Prioritization
        +
Explainability
```

The core architecture is:

```text
Next.js + TypeScript
        ↓
Go Backend
        ↓
PostgreSQL
        ↓
Python FastAPI Intelligence Service
```

And the core product discipline is:

> **Build the intelligence first. Validate it honestly. Then make it beautiful.**

---

# 📚 Research & Data Sources

GridSense AI should prioritize official sector information wherever possible.

Potential starting points include:

- Nigerian Electricity Regulatory Commission (NERC) reports and statistics
- Federal Ministry of Power electricity-system indicators
- Open electricity datasets where licensing permits
- Future utility/operator datasets

Before incorporating any external source, verify:

- Availability
- Date range
- Granularity
- Licensing
- Competition-use permissions
- Freshness
- Data quality

---

# 🤝 Contributing

GridSense AI is an engineering and research project.

Contributions should focus on:

- Data quality
- Reliability analytics
- ML evaluation
- Explainability
- Backend reliability
- Frontend usability
- Testing
- Documentation
- Energy-sector research

When contributing, prioritize **correctness, reproducibility, explainability, and practical value** over unnecessary complexity.

---

# 📄 License

License information will be added when the project's distribution and ownership terms are finalized.

---

# ⚡ GridSense AI

### From fragmented electricity data to prioritized, explainable action.

**Data → Analysis → Prediction → Risk → Priority → Action**