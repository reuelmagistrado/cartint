// Auto-ISAC Automotive Threat Matrix (ATM) — generated from the official STIX 2.1 bundle.
// 14 tactics in the proper kill-chain sequence, 77 techniques.

export type AtmTactic = { id: string; name: string; description: string; techniques: { id: string; name: string; description: string }[]; };

export const ATM_TACTICS: AtmTactic[] = [
  {
    id: "reconnaissance",
    name: "Reconnaissance",
    description: "The adversary is trying to gather information they can use to plan future operations. Reconnaissance consists of techniques that involve adversaries actively or passively gathering information that can be used to support an attack on the vehicle. These techniques focus on sources the adversary can target to obtain information, rather than specific information found. These information can be leveraged by the adversary to aid in other phases of the adversary lifecycle, such as using gathered information to plan and execute Initial Access, to scope and prioritize post-compromise objectives, or to drive and lead further Reconnaissance efforts. This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0076", name: "Gather Target Information \u2013 from Other", description: "The adversary gathers information by directly targeting sources that do not involve the vehicle and its services. Targeting organizations are included, such OEMs, suppliers, service providers, and dealerships. This may involve physically breaching an organization\u2019s premises, infi" },
    { id: "ATM-T0077", name: "Gather Target Information \u2013 from Vehicle", description: "The adversary gathers information by targeting a vehicle\u2019s hardware and/or communication environment. Hardware includes physical components, such as Electronic Control Units (ECUs), sensors, FPGAs, microcontrollers, or SoCs. The communication environment involves any physical com" },
    ],
  },
  {
    id: "manipulate-environment",
    name: "Manipulate Environment",
    description: "The adversary is attempting to intercept or manipulate network traffic to or from a vehicle, or manipulate the vehicle\u2019s natural environment to achieve their goal without physically manipulating the vehicle itself.This category refers to network-based techniques that an adversary may utilize to achieve their objectives or create conditions conducive to employing techniques from the 'initial access' tactic. These techniques involve intercepting or manipulating network traffic to and from the vehicle's mobile device.Additionally, this category covers techniques that involve manipulating the physical environment surrounding a vehicle to confuse its sensors or artificial intelligence processing systems, without directly altering the vehicle's mechanics or components.This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0005", name: "Adversarial Machine Learning", description: "As per Wikipedia, adversarial machine learning can be defined as a machine learning technique that attempts to fool models by supplying deceptive input. In the context of automotive cybersecurity, the adversary could try to use adversarial machine learning techniques to cause veh" },
    { id: "ATM-T0001", name: "Downgrade to Insecure Protocols", description: "An adversary could cause the vehicle\u2019s wireless interfaces to use less secure protocols, for example by jamming frequencies used by newer protocols such as LTE and only allowing older protocols such as GSM to communicate. Use of less secure protocols may make communication easier" },
    { id: "ATM-T0002", name: "Jamming or Denial of Service", description: "An attacker could jam radio signals (e.g. Wi-Fi, cellular, GPS, key fobs) to prevent the mobile device from communicating.Adapted from MITRE ATT&CK." },
    { id: "ATM-T0003", name: "Manipulate Communications", description: "If network traffic between the vehicle and a remote server or mobile device is not securely protected, then an attacker positioned on the network may be able to manipulate network communication without being detected. For example, FireEye researchers found in 2014 that 68% of the" },
    { id: "ATM-T0009", name: "Rogue Wi-Fi Access Point", description: "An adversary could set up unauthorized Wi-Fi access points or compromise existing access points and, if the device connects to them, carry out network-based attacks such as eavesdropping on or modifying network communicationAdapted from MITRE ATT&CK for Mobile." },
    { id: "ATM-T0007", name: "Relay Communications", description: "The adversary may be able to relay communications to make a device that the vehicle trusts appear closer to the vehicle than it really is. An example of this technique is the use of a key fob relay attack, which a car thief could use to unlock, start, and drive away with a vehicl" },
    { id: "ATM-T0008", name: "Rogue Cellular Base Station", description: "An adversary could set up a rogue cellular base station and then use it to eavesdrop on or manipulate the vehicle cellular interface\u2019s communication. A compromised cellular femtocell could be used to carry out this technique[1].This technique was adapted from MITRE ATT&CK." },
    { id: "ATM-T0004", name: "Analog Sensor Attacks", description: "The adversary may use analog sensor attacks to disrupt the availability of vehicle\u2019s analog sensors, and possibly control their output. Examples of these techniques include shining a laser into a Lidar receiver, transmitting an interfering radar signal that causes a vehicle to pe" },
    ],
  },
  {
    id: "initial-access",
    name: "Initial Access",
    description: "Adapted from MITRE ATT&CK:The adversary is trying to get into the vehicle network.The initial access tactic represents the vectors adversaries use to gain an initial foothold onto a vehicle.",
    techniques: [
    { id: "ATM-T0013", name: "Exploit via Removable Media", description: "Adversaries may gain initial access to an automotive environment by copying malware to removable media and taking advantage of Autorun features or automatic parsing of file (e.g., MP3s) when the device is inserted into a system and executes. This may occur through manual manipula" },
    { id: "ATM-T0016", name: "Physical Modification", description: "The adversary can make physical modifications to the vehicle\u2019s ECUs, wiring harnesses, and can replace ECUs.Some ECUs possess physical debug interfaces that are not exposed outside their enclosures. With sufficient time, an adversary can partially disassemble the vehicle to obtai" },
    { id: "ATM-T0014", name: "Malicious App", description: "Malicious applications could be used by adversaries to gain a presence on a vehicle.Some vehicles are configured to allow application installation only from an authorized app store, and an adversary may seek to place a malicious application in an authorized app store, enabling th" },
    { id: "ATM-T0015", name: "Phishing", description: "\u201cAdversaries may send phishing messages to gain access to victim systems. All forms of phishing are electronically delivered social engineering. Phishing can be targeted, known as spearphishing. In spearphishing, a specific individual, company, or industry will be targeted by the" },
    { id: "ATM-T0017", name: "Supply Chain Compromise", description: "Adversaries may manipulate products or product delivery mechanisms prior to receipt by a final consumer for the purpose of data or system compromise.Supply chain compromise can take place at any stage of the supply chain including:Manipulation of development toolsManipulation of " },
    { id: "ATM-T0010", name: "Aftermarket, Customer, or Dealer Equipment", description: "Adversaries may take use aftermarket, customer, or dealer equipment as an initial access point into the vehicle. Paired devices, such as a customer's smart phone, often possess valid credentials for the vehicle\u2019s Bluetooth and Wi-Fi networks, access to phone projection technologi" },
    { id: "ATM-T0011", name: "Browser Compromise", description: "A browser compromise is when an adversary gains access to a system through a user visiting a website over the normal course of browsing. With this technique, the user's web browser is targeted for exploitation. For example, a website may contain malicious media content intended t" },
    { id: "ATM-T0012", name: "Exploit via Radio Interface", description: "The vehicle may be targeted for exploitation through its interface to cellular networks or other radio interfaces.Baseband Vulnerability ExploitationA message sent over a radio interface such as cellular, Bluetooth, GPS, NFC, Wi-Fi[1], TPMS, DAB, or others to the vehicle could ex" },
    ],
  },
  {
    id: "execution",
    name: "Execution",
    description: "The adversary is trying to run malicious code. Execution of the malicious code involves infiltrating an ECU's memory space, where it can manipulate data and instructions to carry out unauthorized operations. This process often involves exploiting vulnerabilities in the component's firmware or software. Techniques that run malicious code are often paired with techniques from all other tactics to achieve broader goals, like moving laterally in a vehicle network or affecting vehicle functions.Adapted from MITRE ATT&CK for mobile.",
    techniques: [
    { id: "ATM-T0018", name: "Command and Scripting Interpreter", description: "Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries. These interfaces and languages provide ways of interacting with computer systems and are a common feature across many different platforms. Most systems come with some built-in command" },
    { id: "ATM-T0019", name: "Native API", description: "Adversaries may directly interact with the native OS application programming interface (API) to execute behaviors. Native APIs provide a controlled means of calling low-level OS services within the kernel, such as those involving hardware/devices, memory, and processes. These nat" },
    { id: "ATM-T0074", name: "Abuse Standard Diagnostic Protocol to Temporarily Modify Execution", description: "Standard diagnostic protocols can be used to write directly to RAM such as the UDS service, WriteMemoryByAddress (in contrast to RequestDownload, which usually targets writing to persistent flash). This can be used to modify sensitive data (for example verification keys) or chang" },
    ],
  },
  {
    id: "persistence",
    name: "Persistence",
    description: "The adversary is trying to maintain their foothold.Persistence consists of techniques that adversaries use to keep access to vehicle systems across restarts, changed credentials, and other interruptions that could cut off their access. Techniques used for persistence include any access, action, or configuration changes that let them maintain their foothold on vehicle systems, such as replacing or hijacking legitimate code or adding startup code.Adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0022", name: "Modify OS Kernel, Boot Partition, or System Partition", description: "If an adversary can escalate privileges, he or she may be able to use those privileges to place malicious code in the system partition, operating system kernel or other boot partition components, where the code may evade detection, may persist after device resets, and may not be " },
    { id: "ATM-T0021", name: "Disable Software Update", description: "The adversary may disable or modify an ECU\u2019s software update mechanism so that it cannot be used to restore the device to an uncompromised state." },
    { id: "ATM-T0020", name: "Abuse Standard Diagnostic Protocol for Persistence", description: "The adversary can attempt to use standard diagnostic protocols to persist their presence on an ECU. For example, UDS' capabilities for firmware updates and \u2018download-and-execute\u2019 can be abused by an adversary to achieve persistence." },
    { id: "ATM-T0023", name: "Modify Isolated Execution Environment", description: "If an adversary can escalate privileges, he or she may be able to use those privileges to place malicious code in the ECU\u2019s isolated execution environment (TrustZone, SMU, CAAM, SE, TPM, EVITA HSM, SHE, SGX, TEE etc.) where the code can evade detection, may persist after device r" },
    { id: "ATM-T0075", name: "Compromise Cryptographic Security", description: "Adversaries may compromise the cryptographic mechanisms used by vehicles to bypass controls that would otherwise protect assets. These assets may be internal to an ECU, or used in communication between ECUs within the vehicle, or with services outside the vehicle. This technique " },
    ],
  },
  {
    id: "privilege-escalation",
    name: "Privilege Escalation",
    description: "The adversary is trying to gain higher-level permissions.Privilege Escalation consists of techniques that adversaries use to gain higher-level permissions on an ECU. Adversaries can often gain initial access to an ECU with unprivileged access but require elevated permissions or capabilities to follow through on their objectives. Common approaches are to take advantage of system weaknesses, misconfigurations, and vulnerabilities. Examples of elevated access include:root accesscontrol of adjacent computing environments on the same ECUThese techniques can overlap with Persistence techniques, as OS features that let an adversary persist can execute in an elevated context.Adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0030", name: "Reprogram Co-Located Computing Device for Privilege Escalation", description: "The adversary may attempt to elevate privileges by using their access on one of the ECU\u2019s computing devices to reprogram another computing device on the same ECU. For example, if an ECU that uses a system-on-chip for most tasks and a separate microcontroller for communication on " },
    { id: "ATM-T0024", name: "Abuse Elevation Control Mechanism", description: "Adversaries may circumvent mechanisms designed to control elevate privileges to gain higher-level permissions. Many modern systems contain native elevation control mechanisms that are intended to limit privileges that a user can perform on an ECU. Authorization has to be granted " },
    { id: "ATM-T0027", name: "Exploit Isolated Execution Environment Vulnerability", description: "A malicious app or other attack vector could be used to exploit vulnerabilities in code running within a isolated execution environment (IEE) [1], which could include ARM TrustZone, SEs, TPMs, EVITA HSMs, SHEs, SPUs, CAAMs, TEE, or similar. The adversary could then obtain privile" },
    { id: "ATM-T0026", name: "Exploit OS Vulnerability", description: "A malicious app can exploit unpatched vulnerabilities in the operating system to obtain escalated privileges.Adapted from MITRE ATT&CK." },
    { id: "ATM-T0028", name: "Hardware Fault Injection", description: "The adversary may attempt fault injection attacks to elevate privileges by \u2018flipping\u2019 bits that control authentication states. For example, through voltage or clock glitching it may be possible to bypass password authentication on debug interfaces. Many different fault injection " },
    { id: "ATM-T0025", name: "Exploit Co-Located Computing Device for Privilege Escalation", description: "Adversaries may be able to leverage their access on one of an ECU\u2019s computing devices to gain control of another computing device on the same ECU. For example, it may be possible for a compromised USB controller or Wi-Fi/Bluetooth chip to gain control of the operating system runn" },
    { id: "ATM-T0029", name: "Process Injection", description: "Adversaries may inject code into processes in order to evade process-based defenses as well as possibly elevate privileges. Process injection is a method of executing arbitrary code in the address space of a separate live process. Running code in the context of another process ma" },
    { id: "ATM-T0075", name: "Compromise Cryptographic Security", description: "Adversaries may compromise the cryptographic mechanisms used by vehicles to bypass controls that would otherwise protect assets. These assets may be internal to an ECU, or used in communication between ECUs within the vehicle, or with services outside the vehicle. This technique " },
    ],
  },
  {
    id: "defense-evasion",
    name: "Defense Evasion",
    description: "The adversary is attempting to bypass or manipulate security controls. This can include bypassing networking filtering, intrusion detection systems (IDS), and code integrity checks to undermine the protection measures in place.Defense Evasion consists of techniques that adversaries use to advance their objectives despite the presence of defensive measures. This tactic is different from MITRE ATT&CK\u2019s \u2018defense evasion\u2019, which is squarely focused on avoiding detection.",
    techniques: [
    { id: "ATM-T0034", name: "Bypass Mandatory Access Control", description: "Adversaries may find ways to defeat mandatory access control mechanisms such as SELinux or AppArmor. This could include finding a \u2018hole\u2019 in the policy, or exploiting a vulnerability in the operating system, kernel, or trusted execution environment that allows the adversary to dis" },
    { id: "ATM-T0031", name: "Bypass Code Integrity Protections", description: "Adversaries may seek to circumvent various code integrity protections to install unauthorized firmware or software on the device." },
    { id: "ATM-T0032", name: "Bypass Network Filtering", description: "Adversaries may disable or modify network filters in order to bypass controls limiting vehicle network usage. Changes could be disabling the entire mechanism as well as adding, deleting, or modifying particular rules. This can be done numerous ways depending on the operating syst" },
    { id: "ATM-T0033", name: "Bypass UDS Security Access", description: "Adversaries may find ways to bypass or defeat the Universal Diagnostic Services \u201cSecurity Access / mode 0x27\u201d security mechanism. Implementation details for this mechanism are not part of the standard and an adversary could seek to defeat mechanisms that use a common secret value" },
    { id: "ATM-T0075", name: "Compromise Cryptographic Security", description: "Adversaries may compromise the cryptographic mechanisms used by vehicles to bypass controls that would otherwise protect assets. These assets may be internal to an ECU, or used in communication between ECUs within the vehicle, or with services outside the vehicle. This technique " },
    ],
  },
  {
    id: "credential-access",
    name: "Credential Access",
    description: "The adversary is trying to steal vehicle network credentials.Credential Access consists of techniques for stealing vehicle network credentials like cryptographic tokens, keys, and passwords. Techniques used to get credentials include credential dumping and collecting unsecured credentials stored on ECU file systems. Using legitimate credentials can give adversaries access to vehicle systems and make them harder to detect.Adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0037", name: "Input Prompt", description: "The operating system and installed applications often have legitimate needs to prompt the user for sensitive information such as account credentials, bank account information, or Personally Identifiable Information (PII). Adversaries may mimic this functionality to prompt users f" },
    { id: "ATM-T0039", name: "ECU Credential Dumping", description: "Adversaries may attempt to dump credentials to obtain account login and credential material, normally in the form of a hash or a clear text password, from the operating system and software. Credentials can then be used to perform Lateral Movement and access restricted information" },
    { id: "ATM-T0027", name: "Exploit Isolated Execution Environment Vulnerability", description: "A malicious app or other attack vector could be used to exploit vulnerabilities in code running within a isolated execution environment (IEE) [1], which could include ARM TrustZone, SEs, TPMs, EVITA HSMs, SHEs, SPUs, CAAMs, TEE, or similar. The adversary could then obtain privile" },
    { id: "ATM-T0038", name: "Network Sniffing", description: "Adversaries may sniff vehicle network traffic to capture information about an environment, including authentication material passed over the vehicle network. Network sniffing refers to using the network interface on a system to monitor or capture information sent over a wired or " },
    { id: "ATM-T0040", name: "Unsecured Credentials", description: "Adversaries may search compromised systems to find and obtain insecurely stored credentials. These credentials can be stored and/or misplaced in many locations on a system, including plaintext files (e.g. bash history), operating system or application-specific repositories (e.g. " },
    { id: "ATM-T0036", name: "Input Capture", description: "Adversaries may capture user input to obtain credentials or other information from the user through various methods.Malware may masquerade as a legitimate third-party keyboard to record user keystrokes.[1] On Android, users must explicitly authorize the use of third-party keyboar" },
    { id: "ATM-T0035", name: "Capture SMS Message", description: "A malicious application could capture sensitive data sent via SMS, including authentication credentials. SMS is frequently used to transmit codes used for multi-factor authentication.On Android, a malicious application must request and obtain permission (either at app install tim" },
    { id: "ATM-T0041", name: "URI Hijacking", description: "Adversaries may register Uniform Resource Identifiers (URIs) to intercept sensitive data.Applications regularly register URIs with the operating system to act as a response handler for various actions, such as logging into an app using an external account via single sign-on. This" },
    ],
  },
  {
    id: "discovery",
    name: "Discovery",
    description: "The adversary is trying to figure out the vehicle environment.Discovery consists of techniques an adversary may use to gain knowledge about a vehicle\u2019s systems and its internal network. These techniques help adversaries observe the environment and orient themselves before deciding how to act. They also allow adversaries to explore what they can control and what\u2019s around their entry point in order to discover how it could benefit their current objective. Native operating system tools are often used toward this post-compromise information-gathering objective.This tactic does not include techniques or other work that is performed during an offline / reverse engineering phase of an attack \u2013 this is currently out of scope of the auto threat matrix. In other words, the techniques are listed here if they are part of an active attack, but they are not listed if they only need to be used during a reverse engineering / exploit development phase.This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0043", name: "Location Tracking", description: "An adversary could use a malicious or exploited application to surreptitiously track the vehicle\u2019s physical location through use of standard operating system APIs.This technique\u2019s description was adapted from MITRE ATT&CK." },
    { id: "ATM-T0044", name: "Network Service Scanning", description: "Adversaries may attempt to get a listing of services running on a vehicle\u2019s ECUs, including those that may be vulnerable to remote software exploitation. Methods to acquire this information include port scans and vulnerability scans using tools that are brought onto a system.This" },
    { id: "ATM-T0047", name: "System Information Discovery", description: "An adversary may attempt to get detailed information about the ECU\u2019s operating system and hardware, including version, patches, hotfixes, service packs, and architecture. Adversaries may use the information from this technique during automated discovery to shape follow-on behavio" },
    { id: "ATM-T0042", name: "File and Directory Discovery", description: "Adversaries may enumerate files and directories or may search in specific locations of an ECU for certain information within a file system. Adversaries may use the information from this technique during automated discovery to shape follow-on behaviors, including whether or not th" },
    { id: "ATM-T0049", name: "System Network Connections Discovery", description: "Adversaries may attempt to get a listing of network connections to or from the compromised system they are currently accessing or from remote systems by querying for information over the network.An adversary who gains access to a system that is part of a cloud-based environment m" },
    { id: "ATM-T0045", name: "Process Discovery", description: "Adversaries may attempt to get information about running processes on a system. Information obtained could be used to gain an understanding of common software/applications running on systems within the vehicle network. Adversaries may use the information from process discovery du" },
    { id: "ATM-T0046", name: "Software Discovery", description: "Adversaries may attempt to get a listing of software and software versions that are installed on a vehicle. Adversaries may use the information from this technique during automated discovery to shape follow-on behaviors, including whether or not the adversary fully infects the ta" },
    { id: "ATM-T0048", name: "System Network Configuration Discovery", description: "Adversaries may look for details about the network configuration and settings of systems they access or through information discovery of remote systems. Several operating system administration utilities exist that can be used to gather this information. Examples include Arp, ipco" },
    ],
  },
  {
    id: "lateral-movement",
    name: "Lateral Movement",
    description: "The adversary is trying to move through the vehicle network.Lateral movement consists of techniques that enable an adversary to access and control remote systems on a vehicle network and could, but does not necessarily, include execution of tools on ECUs. The lateral movement techniques could allow an adversary to gather information from a system without needing additional tools, such as a remote access tool.This definition was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0051", name: "Bridge Vehicle Networks", description: "The adversary may seek to bridge vehicle vehicle networks to obtain their objectives.Some ECUs may possess multiple interfaces to the vehicle network, including interfaces that use different networking technologies, and an adversary could modify these ECUs to bridge networks that" },
    { id: "ATM-T0054", name: "Reprogram ECU for Lateral Movement", description: "The adversary may attempt to move laterally in a vehicle\u2019s network by reprogramming an ECU via its software update mechanisms. This can be successful if an ECU on the vehicle network does not possess a mechanism to verify the authenticity of a software update. Flaws in the verifi" },
    { id: "ATM-T0050", name: "Abuse Standard Diagnostic Protocol for Lateral Movement", description: "The adversary could try to abuse standard diagnostic protocols (e.g., unified diagnostic services) to move laterally inside the vehicle network. For example, an adversary that can send diagnostic commands could attempt to use UDS \u2018download and execute\u2019 or \u2018write memory by address" },
    { id: "ATM-T0052", name: "Exploit ECU for Lateral Movement", description: "Adversaries may exploit an ECU\u2019s services to gain unauthorized access to internal systems once inside of a vehicle network. Exploitation of a software vulnerability occurs when an adversary takes advantage of a programming error in a program, service, or within the operating syst" },
    { id: "ATM-T0053", name: "Remote Services", description: "Adversaries may attempt to log into a service specifically designed to accept remote connections, such as telnet, SSH, and VNC. The adversary may then perform actions as the logged-on user.This technique\u2019s description was adapted from MITRE ATT&CK." },
    { id: "ATM-T0075", name: "Compromise Cryptographic Security", description: "Adversaries may compromise the cryptographic mechanisms used by vehicles to bypass controls that would otherwise protect assets. These assets may be internal to an ECU, or used in communication between ECUs within the vehicle, or with services outside the vehicle. This technique " },
    ],
  },
  {
    id: "collection",
    name: "Collection",
    description: "The adversary is trying to gather data of interest to their goal.Collection consists of techniques used to identify and gather information, such as sensitive files, location history, or recordings of in-vehicle audio from a target vehicle prior to exfiltration. This category also covers locations on a system or vehicle network where the adversary may look for information to exfiltrate.This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0055", name: "Abuse Standard Diagnostic Protocol for Collection", description: "The adversary can attempt to abuse \u2018read\u2019 capabilities in standard diagnostic protocols, such as the UDS service \u2018read memory by address\u2019 to access customer information from an ECU\u2019s storage or memory." },
    { id: "ATM-T0043", name: "Location Tracking", description: "An adversary could use a malicious or exploited application to surreptitiously track the vehicle\u2019s physical location through use of standard operating system APIs.This technique\u2019s description was adapted from MITRE ATT&CK." },
    { id: "ATM-T0038", name: "Network Sniffing", description: "Adversaries may sniff vehicle network traffic to capture information about an environment, including authentication material passed over the vehicle network. Network sniffing refers to using the network interface on a system to monitor or capture information sent over a wired or " },
    { id: "ATM-T0059", name: "Data from Local System", description: "Adversaries may search local system sources, such as file systems, local databases, logs, or volatile storage via data dumps to find files of interest and sensitive data prior to exfiltration.Adversaries may do this using a command and scripting interpreter, such as cmd, which ha" },
    { id: "ATM-T0036", name: "Input Capture", description: "Adversaries may capture user input to obtain credentials or other information from the user through various methods.Malware may masquerade as a legitimate third-party keyboard to record user keystrokes.[1] On Android, users must explicitly authorize the use of third-party keyboar" },
    { id: "ATM-T0060", name: "Network Information Discovery", description: "Adversaries may use device sensors to collect information about nearby networks, such as Wi-Fi and Bluetooth.This technique\u2019s description was adapted from MITRE ATT&CK." },
    { id: "ATM-T0061", name: "Screen Capture", description: "Adversaries may use screen captures to collect information about applications running in the foreground, capture user data, credentials, or other sensitive information. Screen capturing functionality may be included as a feature of a remote access tool used in post-compromise ope" },
    { id: "ATM-T0035", name: "Capture SMS Message", description: "A malicious application could capture sensitive data sent via SMS, including authentication credentials. SMS is frequently used to transmit codes used for multi-factor authentication.On Android, a malicious application must request and obtain permission (either at app install tim" },
    { id: "ATM-T0058", name: "Capture Camera or Audio", description: "Adversaries may utilize the vehicle\u2019s cameras and microphones to capture information about the user, their surroundings, or other physical identifiers. Adversaries may use the vehicle\u2019s camera and microphones on the vehicle to capture images, audio recordings, or video.This techn" },
    ],
  },
  {
    id: "command-and-control",
    name: "Command and Control",
    description: "The adversary is trying to communicate with compromised systems to control them.Command and Control consists of techniques that adversaries may use to communicate with a compromised vehicle and its systems. Adversaries can attempt to mimic normal, expected traffic to avoid detection. There are many ways an adversary can establish command and control with various levels of stealth depending on the vehicle\u2019s connectivity features and its defenses.This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0062", name: "Cellular Communication", description: "If available, the adversary can use the vehicle\u2019s cellular communication system (e.g., SMS) in a post-exploitation environment to fulfill their command and control and exfiltration objectives." },
    { id: "ATM-T0063", name: "Internet Communication", description: "The adversary can use a compromised ECU\u2019s internet connection (if available) for command and control and to exfiltrate data." },
    { id: "ATM-T0065", name: "Short Range Wireless Communication", description: "If available, the adversary can use the vehicle\u2019s short range wireless communication capabilities, including Bluetooth and Wi-Fi, in a post-exploitation environment to fulfill their command and control and exfiltration objectives." },
    { id: "ATM-T0064", name: "Receive Only Communication", description: "The adversary can use a receive-only communication channel, such as Radio Data System (RDS) or TPMS to send commands to the compromised vehicle." },
    { id: "ATM-T0010", name: "Aftermarket, Customer, or Dealer Equipment", description: "Adversaries may take use aftermarket, customer, or dealer equipment as an initial access point into the vehicle. Paired devices, such as a customer's smart phone, often possess valid credentials for the vehicle\u2019s Bluetooth and Wi-Fi networks, access to phone projection technologi" },
    { id: "ATM-T0066", name: "Standard Cryptographic Protocol", description: "Adversaries may employ a known encryption algorithm to conceal command and control traffic rather than relying on any inherent protections provided by a communication protocol. Despite the use of a secure algorithm, these implementations may be vulnerable to reverse engineering i" },
    ],
  },
  {
    id: "exfiltration",
    name: "Exfiltration",
    description: "The adversary is trying to steal data.Exfiltration consists of techniques that adversaries may use to steal data from the vehicle. Once they\u2019ve collected data, adversaries often package it to avoid detection while removing it. This can include compression and encryption. Techniques for getting data out of a target network typically include transferring it over their command and control channel or an alternate channel and may also include putting size limits on the transmission. Depending on a vehicle\u2019s connectivity features, it may be possible to exfiltrate over channels that do not use internet communication, such as Bluetooth or Wi-Fi.This tactic was adapted from MITRE ATT&CK.",
    techniques: [
    { id: "ATM-T0062", name: "Cellular Communication", description: "If available, the adversary can use the vehicle\u2019s cellular communication system (e.g., SMS) in a post-exploitation environment to fulfill their command and control and exfiltration objectives." },
    { id: "ATM-T0063", name: "Internet Communication", description: "The adversary can use a compromised ECU\u2019s internet connection (if available) for command and control and to exfiltrate data." },
    { id: "ATM-T0065", name: "Short Range Wireless Communication", description: "If available, the adversary can use the vehicle\u2019s short range wireless communication capabilities, including Bluetooth and Wi-Fi, in a post-exploitation environment to fulfill their command and control and exfiltration objectives." },
    { id: "ATM-T0010", name: "Aftermarket, Customer, or Dealer Equipment", description: "Adversaries may take use aftermarket, customer, or dealer equipment as an initial access point into the vehicle. Paired devices, such as a customer's smart phone, often possess valid credentials for the vehicle\u2019s Bluetooth and Wi-Fi networks, access to phone projection technologi" },
    { id: "ATM-T0006", name: "Removable Media", description: "Adversaries may attempt to exfiltrate data via a physical medium, such as a removable drive. Such media could be an external hard drive, USB drive, cellular phone, MP3 player, or other removable storage and processing device.This technique\u2019s description was adapted from MITRE ATT" },
    { id: "ATM-T0066", name: "Standard Cryptographic Protocol", description: "Adversaries may employ a known encryption algorithm to conceal command and control traffic rather than relying on any inherent protections provided by a communication protocol. Despite the use of a secure algorithm, these implementations may be vulnerable to reverse engineering i" },
    { id: "ATM-T0073", name: "Physical Access", description: "Physical access via a JTAG / debug / serial interface could be used to exfiltrate data -- for example, a private key could be extracted using one of these techniques / cold boot attack / memory remanence attack some possible technique names - extract using physical medium / extra" },
    ],
  },
  {
    id: "affect-vehicle-function",
    name: "Affect Vehicle Function",
    description: "The adversary is trying to affect vehicle functions and systems, such as propulsion control, airbag deployment, audio, and displays.",
    techniques: [
    { id: "ATM-T0005", name: "Adversarial Machine Learning", description: "As per Wikipedia, adversarial machine learning can be defined as a machine learning technique that attempts to fool models by supplying deceptive input. In the context of automotive cybersecurity, the adversary could try to use adversarial machine learning techniques to cause veh" },
    { id: "ATM-T0070", name: "Modify Bus Message", description: "An adversary that has gained access to one of the vehicle\u2019s communication busses may try to modify or suppress messages sent by another ECU on that network. This technique is particularly applicable to CAN busses, but is not necessarily limited to that technology." },
    { id: "ATM-T0071", name: "Unintended Vehicle Network Message", description: "The adversary may try to send unintended messages on the in-vehicle network. While this technique is not specific to CAN communications, it often follows a privilege escalation technique that grants the adversary control of an ECU\u2019s CAN communication system.Unintended message inc" },
    { id: "ATM-T0004", name: "Analog Sensor Attacks", description: "The adversary may use analog sensor attacks to disrupt the availability of vehicle\u2019s analog sensors, and possibly control their output. Examples of these techniques include shining a laser into a Lidar receiver, transmitting an interfering radar signal that causes a vehicle to pe" },
    { id: "ATM-T0072", name: "Denial of Service on Vehicle Function", description: "Adversaries may perform Denial of Service (DoS) attacks to disrupt expected vehicle functionality. Examples of DoS attacks include overwhelming an ECU with a high volume of requests in a short time period and sending an ECU a request it does not know how to handle. Vulnerabilitie" },
    { id: "ATM-T0069", name: "Local Function", description: "Once the adversary has gained some level of access to an ECU they will have partial or complete control of the functions actuated by that device. For example, an adversary that can execute arbitrary code on a body controller ECU will likely be able to exercise door lock / unlock " },
    { id: "ATM-T0067", name: "Abuse Standard Diagnostic Protocol for Affecting Vehicle Function", description: "The adversary could try to abuse standard diagnostic protocls to actuate vehicle functions. For example, if an adversary may try to send diagnostic commands to actuate the brakes or control headlamps. Some UDS functions, such as write memory by address, could be abused to modify " },
    { id: "ATM-T0068", name: "CAN Bus Denial of Service", description: "An adversary with access to one of the vehicle\u2019s CAN busses may be able to perform a denial-of-service attack by flooding the bus with high-priority messages, preventing other ECUs from being able to communicate." },
    ],
  },
];

export const TACTIC_NAMES = ATM_TACTICS.map((t) => t.name);

export function getTactic(name?: string | null): AtmTactic | undefined {
  if (!name) return undefined;
  return ATM_TACTICS.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
}

export function severityFromScore(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 60) return "medium";
  return "low";
}