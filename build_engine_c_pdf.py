from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

styles = getSampleStyleSheet()

# ---------- Custom styles ----------
styles.add(ParagraphStyle(name="DocTitle", fontSize=20, leading=24, spaceAfter=4,
                           textColor=colors.HexColor("#0B3D91"), fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="DocSubtitle", fontSize=12, leading=16, spaceAfter=2,
                           textColor=colors.HexColor("#333333"), fontName="Helvetica"))
styles.add(ParagraphStyle(name="DocMeta", fontSize=9, leading=12, spaceAfter=14,
                           textColor=colors.HexColor("#666666"), fontName="Helvetica-Oblique"))
styles.add(ParagraphStyle(name="PhaseHeading", fontSize=15, leading=19, spaceBefore=18, spaceAfter=6,
                           textColor=colors.white, fontName="Helvetica-Bold",
                           backColor=colors.HexColor("#0B3D91"), leftIndent=6, borderPadding=6))
styles.add(ParagraphStyle(name="PhaseObjective", fontSize=10, leading=14, spaceAfter=10,
                           textColor=colors.HexColor("#222222"), fontName="Helvetica-Oblique",
                           leftIndent=4))
styles.add(ParagraphStyle(name="StepHeading", fontSize=12.5, leading=16, spaceBefore=12, spaceAfter=4,
                           textColor=colors.HexColor("#0B3D91"), fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="SubStep", fontSize=10, leading=14, spaceBefore=4, spaceAfter=2,
                           textColor=colors.HexColor("#111111"), fontName="Helvetica-Bold", leftIndent=12))
styles.add(ParagraphStyle(name="SubStepBody", fontSize=9.7, leading=13.5, spaceAfter=6,
                           textColor=colors.HexColor("#222222"), fontName="Helvetica", leftIndent=20))
styles.add(ParagraphStyle(name="FileTag", fontSize=8.7, leading=12, spaceAfter=6,
                           textColor=colors.HexColor("#0B3D91"), fontName="Courier-Bold", leftIndent=20))
styles.add(ParagraphStyle(name="SectionHeading", fontSize=14, leading=18, spaceBefore=16, spaceAfter=8,
                           textColor=colors.HexColor("#0B3D91"), fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="Body", fontSize=10, leading=14.5, spaceAfter=8,
                           textColor=colors.HexColor("#222222"), fontName="Helvetica"))
styles.add(ParagraphStyle(name="ExitCondition", fontSize=9.5, leading=13, spaceBefore=6, spaceAfter=4,
                           textColor=colors.HexColor("#0B6E2F"), fontName="Helvetica-BoldOblique",
                           leftIndent=6))

def para(text, style="Body"):
    return Paragraph(text, styles[style])

def sub_step(number, title, body, files=None):
    flow = [para(f"{number} — {title}", "SubStep"), para(body, "SubStepBody")]
    if files:
        flow.append(para("File(s): " + files, "FileTag"))
    return KeepTogether(flow)

def step_block(step_no, title, objective, substeps, exit_condition):
    flow = [para(f"Step {step_no} — {title}", "StepHeading")]
    if objective:
        flow.append(para(objective, "Body"))
    for s in substeps:
        flow.append(s)
    if exit_condition:
        flow.append(para("Exit condition: " + exit_condition, "ExitCondition"))
    return flow

def lib_table(rows):
    data = [["Library / Tool", "Purpose in this Step"]] + rows
    t = Table(data, colWidths=[1.6 * inch, 4.7 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B3D91")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.7),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F5FB")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t

story = []

# ================= TITLE PAGE =================
story.append(Spacer(1, 40))
story.append(para("GRIDSENSE AI: INTELLIGENCE ENGINE C", "DocTitle"))
story.append(para("Anomaly Detection Microservice — Infrastructure-Grade Execution Blueprint", "DocSubtitle"))
story.append(para("Track 6 — Energy Data &amp; AI Intelligence  |  Location: gridsense-ai/backend/ai-services/engine_c/", "DocMeta"))
story.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#0B3D91")))
story.append(Spacer(1, 14))

story.append(para(
    "Core Technologies: Python, FastAPI, Polars, scikit-learn, PyOD, statsmodels, SciPy, River, SHAP, "
    "ONNX, Pydantic v2, structlog, slowapi, Prometheus, Go.", "Body"))

story.append(para(
    "Engine C answers a fundamentally different question from Engine B. Engine B predicts whether an "
    "outage is likely in a future window; Engine C determines whether current feeder behavior is "
    "already deviating meaningfully from its own historical pattern, and explains why. Because there is "
    "no labeled ground truth for 'anomalous,' this blueprint deliberately builds three independent "
    "detection layers — a robust statistical baseline, a seasonal/time-aware baseline, and a "
    "multivariate machine learning ensemble — and combines their agreement into a single, honest "
    "confidence score, rather than trusting any single model's raw output.", "Body"))

story.append(Spacer(1, 8))
story.append(para(
    "This document follows the same execution discipline used for Intelligence Engine B: every phase "
    "is broken into concrete steps, every step is broken into sub-steps, and every sub-step is mapped "
    "to the exact file it belongs in, with the specific library used and the reason it was chosen.", "Body"))

story.append(PageBreak())

# ================= TABLE OF CONTENTS (simple) =================
story.append(para("Document Structure", "SectionHeading"))
toc_rows = [
    ["Phase 1", "Statistical &amp; Seasonal Baseline Engineering (Offline)"],
    ["Phase 2", "Multivariate Ensemble Training (Offline)"],
    ["Phase 3", "Confidence Scoring &amp; Explainability Engine"],
    ["Phase 4", "Schema Contracts &amp; Payload Definition"],
    ["Phase 5", "High-Performance Inference Pipeline (Online Service)"],
    ["Phase 6", "Security &amp; Observability Hardening"],
    ["Phase 7", "Inter-Service Integration (Golang Gateway)"],
    ["Phase 8", "Validation &amp; Parity Testing"],
]
toc_table = Table([["Phase", "Objective"]] + toc_rows, colWidths=[1.1 * inch, 5.2 * inch])
toc_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B3D91")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F5FB")]),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(toc_table)
story.append(PageBreak())

# =====================================================================
# PHASE 1
# =====================================================================
story.append(para("Phase 1: Statistical &amp; Seasonal Baseline Engineering (The Offline Pipeline)", "PhaseHeading"))
story.append(para(
    "Objective: Establish the two non-ML detection layers — a robust statistical baseline and a "
    "seasonal/time-aware baseline — before any model training begins. These layers require only "
    "historical data and correct statistics, not labels, and form the foundation that the machine "
    "learning ensemble in Phase 2 will be validated against.", "PhaseObjective"))

story.extend(step_block(
    "1.1", "Data Ingestion &amp; Quality Validation",
    "Before any statistic is computed, the raw historical telemetry must be validated against a "
    "strict schema — malformed, duplicated, or systematically missing data silently corrupts every "
    "downstream baseline.",
    [
        sub_step("1.1.1", "Define the Polars/Pandera DataFrame schema",
                 "Declare column types, valid ranges, and null policies for timestamp, voltage, load, "
                 "frequency, and availability, mirroring the physical bounds already enforced in Engine "
                 "B's Pydantic contracts (voltage 0-500V, load non-negative).",
                 "features/pipeline.py"),
        sub_step("1.1.2", "Duplicate and systematic-missingness detection",
                 "Run pandera schema checks to flag duplicate (feeder_id, timestamp) pairs and detect "
                 "whether missing values are random or systematic (e.g. a sensor consistently dropping "
                 "readings during a specific hour), directly implementing the master blueprint's Data "
                 "Quality Checklist as enforced code rather than a manual review step.",
                 "scripts/train_engine_c.py"),
        sub_step("1.1.3", "Timestamp normalization to UTC",
                 "Coerce all incoming timestamps to timezone-aware UTC datetimes before any windowing "
                 "or seasonal calculation, preventing silent DST or timezone-offset corruption of "
                 "hour-of-day baselines.",
                 "features/pipeline.py"),
    ],
    "A validated, schema-checked historical DataFrame exists, with data quality issues logged and "
    "resolved rather than silently propagated into baseline statistics."
))
story.append(lib_table([
    ["pandera", "Declarative DataFrame schema validation — enforces the Data Quality Checklist as testable code."],
    ["Polars", "High-performance ingestion and timestamp normalization, consistent with Engine B's data layer."],
]))

story.extend(step_block(
    "1.2", "Robust Statistical Baseline Construction (Detection Layer 1)",
    "Build the fast, always-on statistical anomaly baseline using Median Absolute Deviation (MAD) "
    "instead of classic mean/standard-deviation z-score, since MAD is not distorted by the very "
    "outliers it is meant to detect.",
    [
        sub_step("1.2.1", "Compute per-feature median and MAD",
                 "For each telemetry feature (voltage, load, frequency), calculate the rolling median "
                 "and median absolute deviation over a trailing historical window using SciPy's robust "
                 "statistics primitive, avoiding the outlier-sensitivity flaw of naive standard deviation.",
                 "models/statistical_baseline.py"),
        sub_step("1.2.2", "Implement the robust z-score scoring function",
                 "Score each new reading as a robust z-score: (value - median) / (1.4826 * MAD), the "
                 "standard consistency-corrected MAD formula, so scores are comparable to a normal "
                 "z-score's interpretation despite using a robust center and spread.",
                 "models/statistical_baseline.py"),
        sub_step("1.2.3", "Calibrate per-feature alert thresholds",
                 "Determine the robust z-score threshold (commonly 3.5, per Iglewicz &amp; Hoaglin's "
                 "recommendation for MAD-based outlier detection) per feature, documented and versioned "
                 "rather than arbitrarily chosen.",
                 "models/statistical_baseline.py, artifacts/model_metadata.json"),
    ],
    "Given a synthetic time series with a known injected single-feature spike, Layer 1 flags the "
    "injected anomaly and clears all surrounding normal readings."
))
story.append(lib_table([
    ["SciPy (scipy.stats)", "median_abs_deviation — the correct mathematical primitive for outlier-robust statistics."],
    ["NumPy", "Vectorized rolling median/MAD computation across large historical windows."],
]))

story.extend(step_block(
    "1.3", "Seasonal Baseline Construction (Detection Layer 2)",
    "Build the time-aware baseline that answers 'is this normal for this specific hour and day,' "
    "directly implementing the master blueprint's own example of detecting evening-specific "
    "instability (18:00-22:00).",
    [
        sub_step("1.3.1", "STL decomposition per feature",
                 "Apply Seasonal-Trend decomposition using LOESS to each feature's historical time "
                 "series, separating it into trend, seasonal (daily/weekly), and residual components.",
                 "models/seasonal_baseline.py"),
        sub_step("1.3.2", "Generate per-hour / per-day-of-week baseline profiles",
                 "Aggregate the seasonal component into a lookup table of expected value and expected "
                 "variance for each (hour_of_day, day_of_week) bucket, so a live reading can be compared "
                 "against what is normal for that exact time slot.",
                 "models/seasonal_baseline.py"),
        sub_step("1.3.3", "Residual-based anomaly scoring",
                 "Score new readings against the STL residual distribution rather than the raw value, "
                 "so a reading that is unusual for 3am is flagged even if the same absolute value would "
                 "be perfectly normal at 7pm.",
                 "models/seasonal_baseline.py"),
    ],
    "The seasonal baseline correctly distinguishes a genuinely abnormal evening voltage dip from a "
    "numerically similar but contextually normal overnight reading."
))
story.append(lib_table([
    ["statsmodels", "STL decomposition — industry-standard seasonal-trend-residual separation, not a hand-rolled moving average."],
    ["Polars", "Efficient groupby aggregation for per-hour/per-day-of-week baseline profile construction."],
]))

story.extend(step_block(
    "1.4", "Baseline Artifact Serialization",
    "Persist both non-ML baselines to disk in a versioned, inspectable format so the online service "
    "can load them without recomputing from raw history on every request.",
    [
        sub_step("1.4.1", "Serialize seasonal baseline profiles to JSON",
                 "Write the per-hour/per-day-of-week expected value and variance lookup table to a "
                 "structured, human-readable JSON artifact — deliberately JSON, not a binary format, so "
                 "the baseline itself can be inspected and audited without deserializing code.",
                 "artifacts/seasonal_baselines.json"),
        sub_step("1.4.2", "Write baseline versioning metadata",
                 "Record the training data date range, MAD thresholds, and STL parameters used, "
                 "following the same versioning discipline as Engine B's model_metadata.json.",
                 "artifacts/model_metadata.json"),
    ],
    "Both baseline artifacts exist on disk, are independently loadable, and are fully traceable to "
    "the exact historical data window and parameters used to generate them."
))

story.extend(step_block(
    "1.5", "Baseline Validation Against Synthetic Anomalies",
    "Before proceeding to the ML ensemble in Phase 2, prove the two cheaper baseline layers work "
    "correctly in isolation.",
    [
        sub_step("1.5.1", "Synthetic anomaly injection testing",
                 "Inject known single-feature spikes, gradual drifts, and time-shifted anomalies into "
                 "held-out synthetic data, and confirm both Layer 1 and Layer 2 flag them.",
                 "scripts/train_engine_c.py"),
        sub_step("1.5.2", "False-positive rate measurement on clean data",
                 "Run both baselines against known-clean historical windows and measure the false "
                 "positive rate, establishing a documented benchmark before any ML layer is added, so "
                 "later ensemble improvements can be measured against a known starting point.",
                 "scripts/train_engine_c.py"),
    ],
    "Both statistical and seasonal baselines have a documented, reproducible precision/false-positive "
    "profile on synthetic data before the ML ensemble is introduced."
))

story.append(PageBreak())

# =====================================================================
# PHASE 2
# =====================================================================
story.append(para("Phase 2: Multivariate Ensemble Training (Detection Layer 3)", "PhaseHeading"))
story.append(para(
    "Objective: Train the machine learning layer that catches cross-feature interaction anomalies "
    "neither statistical layer can see alone — cases where each individual feature looks normal, but "
    "the relationship between them has broken down.", "PhaseObjective"))

story.extend(step_block(
    "2.1", "Multivariate Feature Engineering",
    "Construct the feature set the ensemble will actually be trained on, distinct from the raw "
    "features used by the statistical/seasonal layers.",
    [
        sub_step("2.1.1", "Rolling cross-feature correlation features",
                 "Engineer rolling-window correlation and ratio features between voltage, load, and "
                 "frequency, since a broken correlation between normally-linked features is often the "
                 "earliest sign of feeder degradation.",
                 "features/pipeline.py"),
        sub_step("2.1.2", "Feature normalization",
                 "Standardize all engineered features to zero mean and unit variance before ensemble "
                 "training, since Isolation Forest and PyOD's distance/density-based detectors are "
                 "sensitive to feature scale.",
                 "features/pipeline.py"),
    ],
    "A normalized, multivariate feature matrix exists, engineered specifically to expose "
    "cross-feature interaction patterns."
))

story.extend(step_block(
    "2.2", "Isolation Forest Training",
    "Train the tree-based multivariate detector that will later be SHAP-explainable, mirroring the "
    "exact explainability pattern already proven correct in Engine B.",
    [
        sub_step("2.2.1", "Hyperparameter tuning via Optuna",
                 "Tune the number of estimators, max samples, and contamination rate using the same "
                 "Optuna optimization pattern established in Engine B's training pipeline, for "
                 "consistency across the codebase.",
                 "scripts/train_engine_c.py"),
        sub_step("2.2.2", "Contamination rate selection",
                 "Set the expected anomaly proportion conservatively based on the false-positive "
                 "benchmark from Step 1.5.2, rather than an arbitrary default, so the model's "
                 "sensitivity is grounded in the data's actual observed behavior.",
                 "scripts/train_engine_c.py"),
    ],
    "A trained Isolation Forest model exists, with documented hyperparameters and an evaluation "
    "score against the same synthetic anomaly set used in Phase 1."
))
story.append(lib_table([
    ["scikit-learn", "IsolationForest — tree-based multivariate anomaly detector, directly SHAP-explainable."],
    ["Optuna", "Systematic hyperparameter search, consistent with Engine B's training methodology."],
]))

story.extend(step_block(
    "2.3", "PyOD Ensemble Training (ECOD + COPOD)",
    "Add two independent, purpose-built outlier detectors to catch anomaly types Isolation Forest "
    "alone may miss, particularly correlation-structure violations between features.",
    [
        sub_step("2.3.1", "Fit ECOD (Empirical Cumulative Distribution)",
                 "Fit PyOD's parameter-free ECOD detector, which requires no hyperparameter tuning and "
                 "gives a fast, independent second opinion on each reading's outlier status.",
                 "scripts/train_engine_c.py"),
        sub_step("2.3.2", "Fit COPOD (Copula-Based Outlier Detection)",
                 "Fit PyOD's COPOD detector, which explicitly models dependency structure between "
                 "features — catching cases where voltage and load are each individually normal but "
                 "their relationship has broken down, the specific interaction-anomaly gap Isolation "
                 "Forest alone does not fully cover.",
                 "scripts/train_engine_c.py"),
        sub_step("2.3.3", "Normalize and combine ensemble scores",
                 "Use PyOD's built-in score standardization utilities to place ECOD and COPOD outputs "
                 "on a comparable scale before combining them into the multivariate layer's unified "
                 "score.",
                 "models/multivariate_ensemble.py"),
    ],
    "Three independent multivariate detectors (Isolation Forest, ECOD, COPOD) each produce a "
    "calibrated, comparable outlier score on the same held-out evaluation set."
))
story.append(lib_table([
    ["PyOD", "Purpose-built outlier-detection library (ECOD, COPOD) — not a general ML toolkit repurposed for this task."],
]))

story.extend(step_block(
    "2.4", "Model Compilation &amp; Serialization",
    "Persist the trained ensemble in the appropriate format for each model, matching Engine B's "
    "ONNX-first pattern where technically possible.",
    [
        sub_step("2.4.1", "Compile Isolation Forest to ONNX",
                 "Convert the trained Isolation Forest to an ONNX binary using skl2onnx, for "
                 "sub-millisecond production inference identical to Engine B's LightGBM compilation "
                 "pattern.",
                 "artifacts/isolation_forest.onnx"),
        sub_step("2.4.2", "Serialize PyOD ensemble via joblib",
                 "Persist the fitted ECOD and COPOD detectors using joblib, since PyOD's detectors do "
                 "not cleanly ONNX-export — a deliberate, documented tradeoff rather than an oversight.",
                 "artifacts/pyod_ensemble.joblib"),
    ],
    "Both artifact types load correctly from a clean process and produce numerically identical "
    "output to the in-memory trained models (parity, verified formally in Phase 8)."
))
story.append(lib_table([
    ["skl2onnx", "Compiles the scikit-learn Isolation Forest to a portable, low-latency ONNX graph."],
    ["onnxruntime", "Executes the compiled ONNX graph in the online service."],
    ["joblib", "Safe, standard serialization for the PyOD ensemble state that does not ONNX-export cleanly."],
]))

story.extend(step_block(
    "2.5", "Offline Ensemble Evaluation",
    "Establish a documented precision/recall benchmark for the multivariate layer before it is "
    "combined with the statistical and seasonal layers.",
    [
        sub_step("2.5.1", "Precision/recall against injected multivariate anomalies",
                 "Evaluate all three multivariate detectors against synthetic cross-feature anomalies "
                 "specifically (not single-feature spikes, which Phase 1 already covers), measuring "
                 "precision, recall, and ROC-AUC.",
                 "scripts/train_engine_c.py"),
        sub_step("2.5.2", "Cross-layer agreement analysis",
                 "Measure how often Layer 3's three detectors agree with each other and with Layers 1 "
                 "and 2, establishing the empirical basis for the confidence-weighting scheme built in "
                 "Phase 3.",
                 "scripts/train_engine_c.py"),
    ],
    "A documented precision/recall/ROC-AUC benchmark exists for the multivariate ensemble, and the "
    "empirical agreement rate between all three detection layers is known and recorded."
))

story.append(PageBreak())

# =====================================================================
# PHASE 3
# =====================================================================
story.append(para("Phase 3: Confidence Scoring &amp; Explainability Engine", "PhaseHeading"))
story.append(para(
    "Objective: Combine all three detection layers into one honest confidence score, and ensure "
    "every anomaly alert carries a human-inspectable reason, directly satisfying the master "
    "blueprint's explainability mandate.", "PhaseObjective"))

story.extend(step_block(
    "3.1", "Weighted Agreement Confidence Model",
    "Build the mechanism that converts three independent layer outputs into a single, calibrated "
    "confidence score, rather than trusting any one model's raw probability.",
    [
        sub_step("3.1.1", "Define per-layer weights",
                 "Assign each of the three layers a weight based on the empirical agreement analysis "
                 "from Step 2.5.2, documented and versioned rather than arbitrarily chosen.",
                 "models/anomaly_detector.py, artifacts/model_metadata.json"),
        sub_step("3.1.2", "Implement the combination formula",
                 "Compute the final confidence score as the weighted sum of each layer's normalized "
                 "flag/score, such that an alert flagged by all three layers scores materially higher "
                 "than one flagged by a single layer alone.",
                 "models/anomaly_detector.py"),
    ],
    "Given controlled test inputs designed to trigger 0, 1, 2, or all 3 layers, the resulting "
    "confidence score increases monotonically with layer agreement (formally verified in Phase 8)."
))

story.extend(step_block(
    "3.2", "SHAP Explainability for the Isolation Forest Layer",
    "Apply the same tree-based explainability methodology already validated in Engine B's Phase 5.3 "
    "audit.",
    [
        sub_step("3.2.1", "Integrate SHAP TreeExplainer",
                 "Attach a SHAP TreeExplainer to the trained Isolation Forest, operating directly on "
                 "its tree structure the same way Engine B's TreeExplainer operates on the LightGBM "
                 "booster.",
                 "models/multivariate_ensemble.py"),
        sub_step("3.2.2", "Validate additivity guarantee",
                 "Confirm base_value + sum(SHAP values) reconstructs the Isolation Forest's raw "
                 "anomaly score, the same mathematical audit methodology used in Engine B, adapted to "
                 "this model.",
                 "tests/test_explainability_audit.py"),
    ],
    "SHAP values for the multivariate layer are proven mathematically additive, not merely "
    "plausible-looking."
))

story.extend(step_block(
    "3.3", "Statistical &amp; Seasonal Feature Attribution",
    "Since MAD-based and STL-based scores are not tree models, build direct, interpretable "
    "attribution for these two layers rather than forcing SHAP onto them.",
    [
        sub_step("3.3.1", "MAD deviation attribution",
                 "For Layer 1 flags, report which feature's robust z-score exceeded threshold and by "
                 "how many MAD units, giving a directly interpretable magnitude.",
                 "models/statistical_baseline.py"),
        sub_step("3.3.2", "STL residual attribution",
                 "For Layer 2 flags, report which feature's residual deviated most from its expected "
                 "seasonal baseline, and by what magnitude relative to the seasonal variance for that "
                 "time slot.",
                 "models/seasonal_baseline.py"),
    ],
    "Every layer, ML or statistical, produces a directly interpretable per-feature attribution, not "
    "just a pass/fail flag."
))

story.extend(step_block(
    "3.4", "Unified Explanation Assembly",
    "Merge the three layers' independent attributions into one ranked, coherent explanation.",
    [
        sub_step("3.4.1", "Merge and rank all attributions",
                 "Combine SHAP values, MAD deviations, and STL residual magnitudes into one ranked "
                 "list of contributing signals, normalized so they are comparable despite originating "
                 "from different mathematical frameworks.",
                 "models/anomaly_detector.py"),
    ],
    "A single, ranked contributing-factors list is produced per anomaly, regardless of which "
    "layer(s) triggered the alert."
))

story.extend(step_block(
    "3.5", "Human-Readable Reason Generation",
    "Convert the ranked technical attribution list into the plain-language explanation the master "
    "blueprint's example output requires (e.g. 'Repeated recent interruptions,' 'Increasing "
    "interruption duration').",
    [
        sub_step("3.5.1", "Template-based natural language reason strings",
                 "Map the top-ranked contributing factors to pre-approved, deterministic natural "
                 "language templates — not an LLM call — so every reason string is traceable to a "
                 "specific numeric attribution and cannot hallucinate a cause that isn't in the data.",
                 "models/anomaly_detector.py"),
    ],
    "Every anomaly response includes both the ranked numeric attribution list and a human-readable "
    "explanation string, fully traceable to the underlying computation."
))

story.append(PageBreak())

# =====================================================================
# PHASE 4
# =====================================================================
story.append(para("Phase 4: Schema Contracts &amp; Payload Definition", "PhaseHeading"))
story.append(para(
    "Objective: Construct the strict interface boundary between the Go gateway and Engine C, "
    "applying the exact lesson learned during Engine B's integration regarding Pydantic strict mode.",
    "PhaseObjective"))

story.extend(step_block(
    "4.1", "Ingestion Schema Definition",
    "Define the exact JSON contract Engine C accepts from the Go gateway.",
    [
        sub_step("4.1.1", "Define the TelemetryWindow ingestion model",
                 "Construct the Pydantic v2 model for the rolling telemetry window submitted per "
                 "detection request, with field-level physical bounds matching Engine B's contract "
                 "style.",
                 "schemas/anomaly_contracts.py"),
        sub_step("4.1.2", "Apply the non-strict datetime lesson from Engine B",
                 "Use ConfigDict(extra='forbid') without strict=True — strict mode rejects valid "
                 "ISO-8601 JSON datetime strings, exactly the bug diagnosed and fixed during Engine "
                 "B's integration. This is applied here proactively rather than being rediscovered.",
                 "schemas/anomaly_contracts.py"),
    ],
    "The ingestion schema rejects malformed payloads correctly while accepting every valid ISO-8601 "
    "timestamp format the Go gateway will realistically send."
))

story.extend(step_block(
    "4.2", "Egress Schema Definition",
    "Standardize the anomaly response payload so the Go gateway receives a predictable structure "
    "for persistence and frontend rendering.",
    [
        sub_step("4.2.1", "Define the AnomalyResponse egress model",
                 "Construct the Pydantic v2 response model containing severity, confidence, "
                 "per-layer flags, ranked contributing factors, and the human-readable explanation "
                 "string.",
                 "schemas/anomaly_contracts.py"),
        sub_step("4.2.2", "Add model and baseline versioning fields",
                 "Include model_version and baseline_version fields in every response, satisfying the "
                 "master blueprint's audit-trail requirement at the API contract level, not just in "
                 "logs.",
                 "schemas/anomaly_contracts.py"),
    ],
    "The egress schema guarantees a predictable, versioned JSON structure matching the anomalies "
    "table defined in the master blueprint's database schema."
))

story.append(PageBreak())

# =====================================================================
# PHASE 5
# =====================================================================
story.append(para("Phase 5: High-Performance Inference Pipeline (Online Service)", "PhaseHeading"))
story.append(para(
    "Objective: Translate the three offline-trained detection layers into a high-throughput, "
    "low-latency FastAPI service capable of executing ensemble detection on demand.", "PhaseObjective"))

story.extend(step_block(
    "5.1", "Feature Pipeline Implementation",
    "Mirror the exact training-time transformations at inference time, the same discipline that "
    "prevented train/serve skew in Engine B.",
    [
        sub_step("5.1.1", "Polars vectorization mirroring training",
                 "Implement the identical rolling-window and cross-feature correlation transformations "
                 "used in Phase 2.1, applied to a live request payload rather than historical batch "
                 "data.",
                 "features/pipeline.py"),
    ],
    "A live request produces a feature tensor numerically identical to what the same raw readings "
    "would have produced during offline training."
))

story.extend(step_block(
    "5.2", "Detector Orchestration",
    "Build the central orchestrator that sequences all three layers and assembles the final "
    "response, structurally mirroring Engine B's risk_classifier.py.",
    [
        sub_step("5.2.1", "Sequential layer invocation",
                 "Load the statistical baseline, seasonal baseline, and multivariate ensemble "
                 "artifacts at startup, and invoke all three layers against each incoming feature "
                 "tensor.",
                 "models/anomaly_detector.py"),
        sub_step("5.2.2", "Confidence and explanation assembly",
                 "Apply the Phase 3 confidence formula and unified explanation assembly to produce "
                 "the final AnomalyResponse.",
                 "models/anomaly_detector.py"),
    ],
    "A single call to the orchestrator's detect() method returns a fully-formed, schema-valid "
    "AnomalyResponse from a raw feature tensor."
))

story.extend(step_block(
    "5.3", "API Exposure",
    "Bind the orchestrator to a FastAPI endpoint, enforcing internal-network-only access.",
    [
        sub_step("5.3.1", "Route binding",
                 "Mount POST /internal/v1/anomalies/detect, binding Pydantic validation directly to "
                 "the incoming request body.",
                 "api/anomaly_routes.py"),
        sub_step("5.3.2", "Internal service authentication check",
                 "Validate the internal service token header using hmac.compare_digest before any "
                 "processing occurs, closing the timing-attack vector a naive string comparison would "
                 "leave open.",
                 "api/anomaly_routes.py, security/auth.py"),
    ],
    "The endpoint rejects unauthenticated and malformed requests before any computation occurs, and "
    "returns a correctly-typed AnomalyResponse for valid requests."
))

story.extend(step_block(
    "5.4", "Application Entrypoint",
    "Wire artifact loading, security middleware, and observability into the FastAPI application "
    "lifecycle.",
    [
        sub_step("5.4.1", "Lifespan artifact loading",
                 "Load all three layers' artifacts (statistical thresholds, seasonal_baselines.json, "
                 "ONNX Isolation Forest, PyOD joblib ensemble) exactly once at startup into app.state, "
                 "matching Engine B's lifespan pattern.",
                 "main.py"),
        sub_step("5.4.2", "Rate limiting and structured logging setup",
                 "Configure slowapi rate limiting and structlog JSON logging middleware, so every "
                 "request and every anomaly decision is both protected against abuse and traceably "
                 "logged.",
                 "main.py"),
        sub_step("5.4.3", "Prometheus instrumentation",
                 "Attach prometheus-fastapi-instrumentator to automatically expose request latency and "
                 "error-rate metrics, feeding the same /metrics scraping pattern already wired into "
                 "the Go gateway for Engine B.",
                 "main.py"),
    ],
    "The service starts cleanly, exposes /internal/v1/anomalies/detect, /metrics, and a health "
    "check, and fails fast with a clear error if any artifact is missing."
))
story.append(lib_table([
    ["FastAPI", "Asynchronous HTTP routing for high-concurrency requests from the Go gateway."],
    ["Pydantic v2", "Strict request/response schema validation at the HTTP boundary."],
    ["structlog", "Structured JSON audit logging of every scoring decision, satisfying the master blueprint's audit-trail requirement."],
    ["slowapi", "Rate limiting, protecting the service from both external abuse and internal retry-storm bugs."],
    ["prometheus-fastapi-instrumentator", "Automatic latency/error-rate metrics feeding the existing /metrics scrape pattern."],
]))

story.append(PageBreak())

# =====================================================================
# PHASE 6
# =====================================================================
story.append(para("Phase 6: Security &amp; Observability Hardening", "PhaseHeading"))
story.append(para(
    "Objective: Treat security as a first-class engineering concern, not an afterthought — every "
    "measure here is chosen for a specific, named threat, not generic hardening for its own sake.",
    "PhaseObjective"))

story.extend(step_block(
    "6.1", "Internal Service Authentication",
    "Prevent unauthorized services on the internal network from calling Engine C directly.",
    [
        sub_step("6.1.1", "Constant-time token validation module",
                 "Implement token comparison using hmac.compare_digest rather than Python's default == "
                 "operator, which is vulnerable to timing attacks that can incrementally leak a valid "
                 "token by measuring comparison time.",
                 "security/auth.py"),
    ],
    "A deliberately crafted timing-attack probe against the token validation endpoint yields no "
    "measurable timing signal correlated with token correctness."
))

story.extend(step_block(
    "6.2", "Rate Limiting",
    "Protect the service from both malicious abuse and, more realistically for an internal service, "
    "bugs in calling code (such as a retry-logic defect) that could otherwise hammer the endpoint.",
    [
        sub_step("6.2.1", "Configure per-source rate limits",
                 "Apply slowapi rate limiting keyed on the calling service identity, with limits set "
                 "above expected legitimate peak load but well below what would exhaust CPU or memory "
                 "resources.",
                 "main.py"),
    ],
    "A simulated retry-storm (mirroring the Go gateway's own retry logic under a hypothetical bug) "
    "is throttled without crashing the service."
))

story.extend(step_block(
    "6.3", "Structured Audit Logging",
    "Ensure every anomaly decision is traceable after the fact, satisfying the master blueprint's "
    "explicit governance requirement.",
    [
        sub_step("6.3.1", "Per-decision structured log entry",
                 "Emit one structlog JSON entry per detection request, containing model_version, "
                 "baseline_version, input feature hash, and the final confidence score, queryable by "
                 "any downstream log aggregator.",
                 "models/anomaly_detector.py"),
    ],
    "Given any historical anomaly alert, the exact model version, baseline version, and input data "
    "that produced it can be reconstructed from logs alone."
))

story.append(PageBreak())

# =====================================================================
# PHASE 7
# =====================================================================
story.append(para("Phase 7: Inter-Service Integration (Golang Gateway)", "PhaseHeading"))
story.append(para(
    "Objective: Extend the existing, already-proven Go gateway resilience pattern (retry with "
    "jittered backoff, circuit breaker) — established for Engine A and Engine B — to Engine C, "
    "rather than inventing a new integration pattern.", "PhaseObjective"))

story.extend(step_block(
    "7.1", "Payload Assembly (Go)",
    "Query and assemble the rolling telemetry window Engine C expects.",
    [
        sub_step("7.1.1", "Telemetry window query",
                 "Extend the existing pgx-based repository pattern to fetch the rolling window of "
                 "recent power_readings and fault_events required by Engine C's ingestion schema.",
                 "services/gateway/handlers.go (or a new anomaly_handler.go, following the existing "
                 "pgxTelemetryRepo pattern)"),
    ],
    "The Go gateway assembles a payload that validates cleanly against Engine C's Pydantic ingestion "
    "schema for a real feeder."
))

story.extend(step_block(
    "7.2", "Network Resilience",
    "Reuse, not reimplement, the retry-with-jittered-backoff and circuit-breaker pattern already "
    "validated for both Engine A and Engine B.",
    [
        sub_step("7.2.1", "Apply the existing resilient client pattern",
                 "Construct an EngineCClient following the exact structure of engineBClient / "
                 "EngineAClient — jittered exponential backoff retry on network errors and 5xx, "
                 "immediate failure on 4xx, wrapped in a gobreaker circuit breaker.",
                 "gateway/bridge/engine_c_client.go"),
    ],
    "A simulated Engine C outage is handled identically in behavior and log signature to a "
    "simulated Engine A or Engine B outage."
))

story.extend(step_block(
    "7.3", "Database Persistence",
    "Persist the anomaly result to the schema already defined in the master blueprint's database "
    "specification.",
    [
        sub_step("7.3.1", "Insert into the anomalies table",
                 "Persist feeder_id, detected_at, type, severity, score, and explanation into the "
                 "anomalies table defined in the master blueprint's Database Blueprint (Section 13), "
                 "following the same log-but-don't-fail persistence pattern used for risk_predictions.",
                 "gateway/database/database.go (new method) or handlers.go's repository layer"),
    ],
    "A successful anomaly detection call results in a persisted row in the anomalies table, visible "
    "to the Next.js frontend, even if persistence itself briefly fails without blocking the response."
))

story.append(PageBreak())

# =====================================================================
# PHASE 8
# =====================================================================
story.append(para("Phase 8: Validation &amp; Parity Testing", "PhaseHeading"))
story.append(para(
    "Objective: Apply the exact three-suite testing discipline already proven for Engine B — "
    "boundary, parity/agreement, and explainability — adapted for Engine C's three-layer ensemble "
    "architecture.", "PhaseObjective"))

story.extend(step_block(
    "8.1", "Boundary Testing",
    "Verify strict, correct rejection of malformed input at the API boundary.",
    [
        sub_step("8.1.1", "Schema and contract rejection tests",
                 "Test malformed payloads, out-of-range physical values, missing required fields, and "
                 "unauthorized requests, following the exact structure of Engine B's test_boundary.py.",
                 "tests/test_boundary.py"),
    ],
    "All malformed payload classes are rejected with the correct HTTP status code and a traceable "
    "error message."
))

story.extend(step_block(
    "8.2", "Ensemble Agreement Testing",
    "Verify the confidence scoring formula behaves correctly across every combination of layer "
    "agreement, since this is the mechanism that makes Engine C's confidence score meaningful rather "
    "than decorative.",
    [
        sub_step("8.2.1", "All-combinations confidence monotonicity test",
                 "Construct synthetic inputs designed to trigger each of the eight possible "
                 "combinations of the three layers flagging or clearing, and assert confidence "
                 "increases monotonically with agreement.",
                 "tests/test_ensemble_agreement.py"),
        sub_step("8.2.2", "ONNX/native parity for the Isolation Forest layer",
                 "Verify the compiled ONNX Isolation Forest and the native scikit-learn model agree "
                 "within tolerance, following the identical parity methodology used for Engine B's "
                 "LightGBM/ONNX comparison.",
                 "tests/test_ensemble_agreement.py"),
    ],
    "The confidence scoring formula is proven correct across all agreement combinations, and the "
    "compiled ONNX artifact is proven numerically equivalent to its source model."
))

story.extend(step_block(
    "8.3", "Explainability Audit",
    "Prove the SHAP values for the multivariate layer, and the attribution values for the "
    "statistical/seasonal layers, are mathematically correct rather than merely plausible.",
    [
        sub_step("8.3.1", "SHAP additivity verification",
                 "Verify base_value + sum(SHAP values) reconstructs the Isolation Forest's raw output, "
                 "the same audit methodology proven correct in Engine B's Phase 5.3.",
                 "tests/test_explainability_audit.py"),
        sub_step("8.3.2", "Statistical attribution correctness",
                 "Verify the reported MAD-unit and STL-residual attributions match independently "
                 "recomputed values from the raw feature tensor, not just the orchestrator's internal "
                 "state.",
                 "tests/test_explainability_audit.py"),
    ],
    "Every explanation Engine C produces, across all three layers, is proven to be a correct "
    "reflection of the underlying mathematics, not a plausible-looking approximation."
))

story.append(Spacer(1, 16))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CCCCCC")))
story.append(Spacer(1, 8))
story.append(para(
    "Prepared as the execution blueprint for GridSense AI Intelligence Engine C, following the same "
    "phase-step-substep discipline established for Intelligence Engine B, for the NESI Innovation "
    "Challenge 2026, Track 6 — Energy Data &amp; AI Intelligence.", "DocMeta"))

# ---------- Build with page numbers ----------
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#888888"))
    canvas.drawRightString(letter[0] - 0.6 * inch, 0.5 * inch, f"Page {doc.page}")
    canvas.drawString(0.6 * inch, 0.5 * inch, "GridSense AI — Engine C Blueprint")
    canvas.restoreState()

doc = SimpleDocTemplate(
    r"C:\Users\hp\Documents\GridSense_AI_Engine_C_Blueprint.pdf",
    pagesize=letter,
    topMargin=0.7 * inch, bottomMargin=0.7 * inch,
    leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    title="GridSense AI - Intelligence Engine C Blueprint",
    author="GridSense AI Team",
)
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print("PDF built successfully.")
