# Threat Incident Analysis Guide  
## Auto-ISAC ATM Mapping Methodology for Security Intelligence Analysts

## Preface

ATM shall be used as an attacker-oriented reasoning framework for incident interpretation in the automotive domain.

The analyst’s first responsibility is to reconstruct attacker intent, identify credible **adversary objectives (Tactics)**, and determine which **Techniques** would make technical sense against the target environment. Matrix mapping is the structured expression of that reasoning process. It is not the starting point, and it is not an end in itself.

The required standard is therefore clear:

**Attacker Intent First, Matrix as a Reasoning Aid.**

## 1. Purpose

This guide defines the internal methodology for analyzing a security incident and mapping it to the **Auto-ISAC Automotive Threat Matrix (ATM)**. It is intended for security intelligence analysts, incident researchers, and automotive cybersecurity personnel responsible for interpreting threat reporting, public disclosures, technical writeups, reverse engineering findings, and other incident evidence in a structured and analytically defensible manner.

The purpose of this guide is not to produce a mechanical matrix population exercise. Its purpose is to train analysts to decompose an incident into its essential technical elements, reason from the attacker’s perspective, identify credible **adversary objectives (Tactics)**, and determine which **Techniques** would reasonably support those objectives in the target environment.

This guide uses the **official Auto-ISAC ATM website** (https://atm.automotiveisac.com/) as the authoritative source for taxonomy and terminology. The official site defines ATM as an automotive threat matrix that enumerates automotive adversary tactics and supporting techniques based on real-world observations, and it organizes the framework through tactics, techniques, examples, and matrix views. Analysts shall therefore treat the official ATM website as the source of truth rather than any static offline copy or third-party summary.

Analysts shall not assume a fixed total number of techniques. The official ATM content continues to evolve, including the publication of newer techniques such as **ATM-T0076** (https://atm.automotiveisac.com/technique/ATM-TA0000/ATM-T0076), which appears on the official site with a May 1, 2025 date. The current official website must therefore be consulted during live analysis.

## 2. Framework Basis

Within MITRE ATT&CK-style threat matrices, **Tactics** describe attacker intent or strategic objective, while **Techniques** describe the methods that may be used to achieve that objective. In ATM, these attacker-oriented categories are tailored to the automotive environment.

The official ATM tactic set includes **Reconnaissance, Manipulate Environment, Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, and Affect Vehicle Function**. The official tactic pages further describe these as attacker goals such as gaining an initial foothold, learning vehicle systems and internal networks, moving across vehicle networks, or affecting vehicle functions directly. 

This taxonomy is not a rigid process flow. It is a structured model of attacker behavior that supports technical interpretation of incidents in the automotive domain.

## 3. Analytical Doctrine

## Attacker Intent First, Matrix as a Reasoning Aid

This doctrine defines the intended use of ATM in incident analysis.

The analyst shall not begin with forced traversal of the matrix. The analyst shall begin with the incident itself: the known target, the exposed interface, the attack surface, the affected component, the resulting effect, and the available technical evidence.

From that basis, the analyst shall reconstruct the attacker’s perspective. The core analytical question is not “Which matrix cell should be filled next?” but rather:

**What was the attacker trying to achieve, and what methods would make technical sense in this environment?**

Accordingly:

- **adversary objectives (Tactics)** are treated as expressions of attacker intent;
- **Techniques** are treated as the methods that may support those objectives;
- the matrix is used to structure reasoning, not to dictate a fixed narrative sequence.

An incident does not need to map cleanly from left to right across every tactic. Some tactics may be absent, repeated, unobservable, or only partially inferable. Discovery and Lateral Movement, for example, may recur multiple times. Observable evidence may capture effects without revealing the full intrusion lifecycle. A credible ATM analysis therefore depends on technical judgment, attacker-oriented reasoning, and analytical discipline rather than chronological neatness.

## 4. Scope of Analyst Responsibility

The analyst’s responsibility is to produce a **credible adversary behavior mapping** based on the information currently available.

This requires the analyst to:

- determine what is known, what is inferred, and what remains unknown;
- identify which **adversary objectives (Tactics)** are indicated by the incident;
- evaluate which **Techniques** would be technically consistent with the target architecture and threat context;
- test whether the proposed mapping remains coherent when viewed from the attacker’s perspective;
- avoid both overclaiming and under-modeling.

ATM mapping is therefore not a clerical classification task. It is a structured attacker-oriented reasoning activity grounded in automotive security knowledge.

## 5. Incident Analysis Methodology

### 5.1 Establish the Incident Context

The first analytical task is to consolidate the incident into a technically meaningful context set. At minimum, the following elements shall be identified where possible:

- target asset or subsystem;
- hardware model, ECU, firmware, software component, or package under discussion;
- exposed interface or communication path;
- known entry point or attack surface;
- observed attacker action;
- observed technical effect;
- vehicle-level consequence;
- evidence source and disclosure quality.

The purpose of this stage is not immediate mapping. The purpose is to define the incident’s factual boundaries.

### 5.2 Separate Observed Facts from Analytical Inference

Incident reporting, OSINT, reverse engineering notes, conference presentations, and media coverage rarely provide complete visibility into the event. For that reason, all incident material shall be classified into the following categories:

- **Observed**: directly supported by the source material;
- **Inferred**: supported by technical reasoning based on architecture, protocol behavior, or known exploit conditions;
- **Unknown**: not established by the available record.

This distinction shall be preserved throughout the mapping process. A high-quality analysis does not manufacture certainty.

### 5.3 Identify Credible Adversary Objectives (Tactics)

Once the context has been established, the analyst shall evaluate which **adversary objectives (Tactics)** are indicated by the known behavior or effects.

This step must be performed from the attacker’s perspective. The analyst shall ask:

- What objective was the attacker attempting to achieve at this point?
- What intermediate objective would have been necessary to enable the next stage?
- Does the observed effect imply prior attacker activity that has not been disclosed directly?
- Are repeated or alternating objectives likely in this environment?

The output of this step is not a linear tactic sequence. The output is a set of **credible adversary objectives (Tactics)** supported by evidence and technical reasoning.

### 5.4 Evaluate Candidate Techniques Against the Target Environment

After identifying credible **adversary objectives (Tactics)**, the analyst shall evaluate which **Techniques** would reasonably support those objectives within the specific environment under analysis.

This evaluation shall consider:

- hardware characteristics;
- firmware behavior;
- software exposure;
- communication interfaces;
- protocol properties;
- access assumptions;
- trust boundaries;
- privilege model;
- realistic exploitation constraints.

The analyst shall reason as follows:

- If the attacker intended to achieve this objective, what methods would be viable?
- Which techniques are directly supported by the evidence?
- Which techniques are technically consistent but not directly confirmed?
- Which techniques are theoretically possible but not credible in this specific target environment?

Technique selection shall be based on technical credibility, not superficial keyword overlap.

### 5.5 Perform Full Technique Review Rather than Keyword Filtering

ATM technique names are intentionally concise and abstract. The analyst shall not rely on keyword filtering as the primary method for candidate selection.

A component name, protocol name, or interface term may not appear directly in the technique title even when the technique is relevant. Conversely, a keyword match does not guarantee analytical fit. For that reason, analysts should review the full official ATM technique set and consider whether each candidate could reasonably contribute to the incident under review.

The operative question is not:

**“Does the title contain the same keyword as the incident?”**

The operative question is:

**“Would this technique make technical sense if the attacker were pursuing this objective against this target?”**

### 5.6 Develop a Credible Adversary Behavior Mapping

The analytical output shall not be a raw technique list. It shall be a **credible adversary behavior mapping**.

This mapping should explain:

- which **adversary objectives (Tactics)** appear relevant;
- which **Techniques** support those objectives;
- how those techniques relate to the target environment;
- where evidence exists;
- where inference is applied;
- where uncertainty remains.

This mapping may be incomplete, branching, iterative, cyclical, or partially observable. It is not required to form a clean left-to-right chain. What matters is whether the mapping remains technically credible and analytically defensible.

### 5.7 Test the Mapping from the Attacker’s Perspective

Before finalizing the result, the analyst shall test the mapping as a simulated attacker thought process.

The analyst should ask:

- If the objective were to compromise this target, would these techniques be a sensible choice?
- Would the target’s interfaces and architecture realistically allow this method?
- Does the mapping assume steps that contradict the known environment?
- Does the proposed behavior explain the observed outcome without forcing unsupported stages?

If the mapping fails this attacker-perspective review, it shall be revised.

## 6. Decision Criteria for Mapping Quality

A valid ATM mapping shall meet the following criteria:

1. It reflects attacker-oriented reasoning rather than matrix completion behavior.  
2. It identifies credible **adversary objectives (Tactics)** from the incident context.  
3. It selects **Techniques** that are technically consistent with the target environment.  
4. It distinguishes direct evidence from expert inference.  
5. It avoids forced sequence assumptions when the record is incomplete or non-linear.  
6. It remains defensible under expert technical review.

## 7. Common Analytical Errors

### 7.1 Treating the Matrix as a Mandatory Linear Sequence

Not every incident traverses all tactics, and not every disclosed incident reveals full attacker progression. Forced linear reconstruction reduces analytical quality.

### 7.2 Mapping Components Instead of Behavior

Terms such as ECU names, protocol names, interfaces, or product labels are environmental context. They are not themselves the mapping outcome. The mapping target is attacker behavior.

### 7.3 Using Keyword Matching as the Primary Technique Selection Method

Keyword filtering is useful only as a secondary aid. It must not replace technical review and attacker-oriented reasoning.

### 7.4 Confusing Observed Evidence with Assumed Enablement Steps

An effect may imply prior attacker actions, but those intermediate steps must be marked as inference unless directly supported by evidence.

### 7.5 Overstating Confidence

Where the source record is incomplete, the mapping shall remain disciplined. Uncertain stages shall be presented as inference, not as established fact.
