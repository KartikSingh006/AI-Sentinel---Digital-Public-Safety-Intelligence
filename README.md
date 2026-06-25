# AI Sentinel - Digital Public Safety Intelligence

AI Sentinel is a next-generation full-stack cyber threat intelligence platform engineered to combat specialized internet extortion scams, pre-scripted state-level impersonation calls, and **"Digital Arrest"** syndicates. 

The application offers direct tactical co-piloting, interactive money mule ring tracing, legal complaint drafting, and visual-evidence OCR extraction.

---

## 🛠 How It Works

AI Sentinel leverages a dual-engine architecture comprising a high-fidelity React frontend coupled with an Express micro-backend to orchestrate multi-modal intelligence.

### 1. AI Tactical Intelligence Lab
The Core Intelligence Hub allows citizens and safety officers to toggle specialized multi-turn conversational agents with structured personas under dynamic reasoning models:
*   **Lead Forensics Officer (👮)**: Dissects cellular tower spoof routing coordinates, Cambodia-based VoIP SIP gateways, and schedules state-level technical interdictions.
*   **Victims Crisis Support Advisor (🎗️)**: Designed to de-escalate psychological intimidation, assure targeted individuals that "Digital Arrest" is a complete legal fabrication, and offer immediate emotional and physical protection protocols.
*   **Financial Laundering Auditor (🪙)**: Audits suspicious bank coordinates, flags active UPI handles, and automatically drafts high-priority escrow hold requests for banks.

**Model Execution Grid:**
*   **`gemini-3.1-pro-preview` (Forensic-Class)**: Engaged for deeply analytical and deductive investigations. Uses **Thinking Mode** (with `thinkingLevel` initialized to `HIGH` for maximum intelligence, bypassing standard output token ceilings to ensure complete, multi-step forensic tracing).
*   **`gemini-3.5-flash` (General-Class)**: Optimizes standard audits, parsing normal threat patterns.
*   **`gemini-3.1-flash-lite` (Ultra-Fast)**: Utilized when sub-second tactical responses are requested during active, high-stress interaction windows.

---

### 2. Visual Evidence Forensic Parser
Under active investigation, fraudsters often send spoofed official notifications via chat platforms.
*   **Multimodal Vision OCR**: Users can upload or drag-and-drop screenshots of fake court notices, CBI warrants, Skype video profiles, or DOT warnings.
*   **Threat Matrix Extraction**: Automatically flags illegitimate administrative stamps, checks logo alignments, extracts targeted digital escrow bank accounts, and catalogs the text layout.
*   **Bento Presets**: Includes pre-loaded high-risk template summons (such as fake Narcotics/Aadhaar complaints) to immediately test extraction capabilities in real-time.

---

### 3. Dynamic Incident Shield & Automated Legal Drafts
*   **Heuristic Text Scanner**: Assesses victim statements or text transcripts for coercion patterns, identifying digital arrest profiles, money laundering blackmail, and identity theft hooks.
*   **Automated Legal Complaint Compiler**: Automatically maps evidence (phone numbers, fake agencies, and financial mule targets) and drafts a formal legal complaint letter pre-formatted for submission to the national cybersecurity helpline or legal authorities.

---

### 4. Money Mule Ring Visual Matrix
*   **Force-Directed Graphs**: Tracks the flow of stolen funds down regional currency tunnels (such as Bengaluru caches and shell accounts).
*   **Node Analysis**: Evaluates high-degree nodes representing key money mules, listing logistics business dummy titles and instant transaction velocity parameters.

---

## 🏗 System Architecture & Security

*   **Server-Side Proxy Isolation**: All Gemini API calls are strictly processed server-side (`/api/intel/*` endpoints in `server.ts`). Security keys (like `GEMINI_API_KEY`) are kept fully hidden from client dev consoles.
*   **Unified ESM-to-CommonJS Builder**: Utilizing an automated production compiler script, our backend server and custom DB file are compiled securely to `dist/server.cjs` via `esbuild`. This encapsulates dependencies and guarantees rapid cold-starts.

---

## 🚀 Setup & Execution

### Prerequisites
*   Node.js (v18+)
*   An active Google Gemini API Key

### Installation

1. Clone the repository files.
2. Install client and server-side dependencies:
   ```bash
   npm install
   ```
3. Copy environment configurations and add your secure keys:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and assign your key: `GEMINI_API_KEY=your_gemini_api_key`*

### Development Mode
Initialize the high-performance local compilation dev-server:
```bash
npm run dev
```
The server binds to port `3000` on localhost.

### Production Build
Compile client static assets and bundle Node server components safely:
```bash
npm run build
npm start
```
