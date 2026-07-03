// Auto-ISAC Automotive Threat Matrix (ATM)
// Adapted from MITRE ATT&CK for the automotive / connected-vehicle domain.
// Tactics represent the "why" (goal of the attacker), techniques the "how".

export type AtmTactic = {
  id: string;
  name: string;
  description: string;
  techniques: { id: string; name: string; description: string }[];
};

export const ATM_TACTICS: AtmTactic[] = [
  {
    id: "initial-access",
    name: "Initial Access",
    description: "Adversaries gain a foothold in automotive IT/OT or vehicle systems.",
    techniques: [
      { id: "T1505", name: "Supply Chain Compromise", description: "Compromise of a Tier-1 supplier or SDV component." },
      { id: "T1190", name: "Exploit Public-Facing App", description: "Exploit of OEM portal, dealer DMS, or OTA backend." },
      { id: "T1078", name: "Valid Accounts", description: "Use of leaked credentials to OEM/telematics portals." },
      { id: "T1659", name: "Vehicle Physical Access", description: "Direct physical/ODB access to a vehicle ECU." },
    ],
  },
  {
    id: "execution",
    name: "Execution",
    description: "Running malicious code on vehicle ECUs, head-units, or backend systems.",
    techniques: [
      { id: "T1203", name: "Exploitation for Client Execution", description: "Code execution via infotainment browser or app." },
      { id: "T1059", name: "Command & Scripting Interpreter", description: "Scripting on telematics control units." },
    ],
  },
  {
    id: "persistence",
    name: "Persistence",
    description: "Maintaining access across reboots or OTA updates.",
    techniques: [
      { id: "T1543", name: "Modify Vehicle Firmware", description: "Persistent modification of ECU firmware." },
      { id: "T1098", name: "Account Manipulation", description: "Backdoor accounts in fleet management systems." },
    ],
  },
  {
    id: "credential-access",
    name: "Credential Access",
    description: "Stealing keys, certificates, or tokens used by vehicles & backends.",
    techniques: [
      { id: "T1552", name: "Unsecured Credentials", description: "Hardcoded keys in vehicle firmware / apps." },
      { id: "T1110", name: "Brute Force", description: "Brute force of OEM customer portals." },
    ],
  },
  {
    id: "discovery",
    name: "Discovery",
    description: "Mapping vehicle networks, CAN buses, and backend architecture.",
    techniques: [
      { id: "T1046", name: "Network Service Discovery", description: "Scanning CAN/Ethernet vehicle networks." },
      { id: "T1087", name: "Account Discovery", description: "Enumerating fleet/telematics accounts." },
    ],
  },
  {
    id: "lateral-movement",
    name: "Lateral Movement",
    description: "Moving between vehicle subsystems or IT/OT networks.",
    techniques: [
      { id: "T1021", name: "Remote Services", description: "Pivot via OTA / telematics gateway to internal CAN." },
      { id: "T1072", name: "Software Deployment Tools", description: "Abuse of fleet management tools." },
    ],
  },
  {
    id: "collection",
    name: "Collection",
    description: "Gathering driver data, vehicle telemetry, or location history.",
    techniques: [
      { id: "T1213", name: "Data from Information Repositories", description: "Harvesting telematics databases." },
      { id: "T1602", name: "Data from Config Repository", description: "Collecting vehicle config / calibration data." },
    ],
  },
  {
    id: "command-control",
    name: "Command & Control",
    description: "Channels used to control compromised vehicles or backends.",
    techniques: [
      { id: "T1071", name: "Application Layer Protocol", description: "C2 over MQTT / cellular telematics." },
      { id: "T1132", name: "Data Encoding", description: "Encrypted C2 to disguise vehicle commands." },
    ],
  },
  {
    id: "exfiltration",
    name: "Exfiltration",
    description: "Stealing driver PII, vehicle data, or IP out of automotive systems.",
    techniques: [
      { id: "T1041", name: "Exfiltration Over C2 Channel", description: "PII exfil via telematics C2." },
      { id: "T1567", name: "Exfiltration to Cloud Storage", description: "Breach data posted to leak sites / dark web." },
    ],
  },
  {
    id: "impact",
    name: "Impact",
    description: "Disruption, manipulation, or destruction of vehicle functions.",
    techniques: [
      { id: "T1486", name: "Data Encrypted for Impact", description: "Ransomware on OEM / supplier networks." },
      { id: "T1489", name: "Service Stop", description: "Disruption of OTA / charging services." },
      { id: "T1490", name: "Inhibit System Recovery", description: "Disable vehicle recovery / diagnostics." },
      { id: "T1499", name: "Endpoint Denial of Service", description: "DoS of connected-vehicle services." },
    ],
  },
  {
    id: "telematics-exploitation",
    name: "Telematics Exploitation",
    description: "Automotive-specific abuse of connectivity, OTA, and V2X.",
    techniques: [
      { id: "ATM-01", name: "OTA Update Hijack", description: "Compromise or spoof over-the-air updates." },
      { id: "ATM-02", name: "Telematics Unit Takeover", description: "Full control of the TCU / connectivity module." },
      { id: "ATM-03", name: "CAN Bus Injection", description: "Malicious CAN frames to control vehicle dynamics." },
      { id: "ATM-04", name: "Charging Network Abuse", description: "Attack on EV charging / billing infrastructure." },
    ],
  },
];

export const TACTIC_NAMES = ATM_TACTICS.map((t) => t.name);

export function getTactic(name?: string | null): AtmTactic | undefined {
  if (!name) return undefined;
  return ATM_TACTICS.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
}

// Severity inference helper.
export function severityFromScore(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 60) return "medium";
  return "low";
}
