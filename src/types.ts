export interface Complaint {
  id: string;
  citizenName: string;
  citizenContact: string;
  inputType: 'text' | 'image' | 'audio_transcript' | 'pdf';
  rawInput: string; // Base64 data or text content
  fileName?: string;
  status: 'pending' | 'reviewed';
  timestamp: string;
  analysis?: ScamAnalysis;
}

export interface ScamAnalysis {
  riskScore: number; // 0 - 100
  confidence: number; // 0 - 100
  classification: 'Safe' | 'Suspicious' | 'Digital Arrest Scam';
  reasoning: string;
  redFlags: string[];
  entities: {
    phones: string[];
    upis: string[];
    bankAccounts: string[];
    urls: string[];
    agencies: string[];
    emails: string[];
  };
  policeComplaintDraft: string;
  citizenGuidelines: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'phone' | 'upi' | 'bank_account' | 'url' | 'agency' | 'email' | 'victim' | 'mastermind' | 'mule';
  riskScore: number;
  community: number;
  details: string;
  x?: number;
  y?: number;
  customNotes?: string;
  status?: 'active' | 'monitored' | 'frozen' | 'trusted';
  tags?: string[];
  lastAuditedByAI?: string;
  lat?: number;
  lng?: number;
  locationName?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string; // 'associated_with' | 'transferred_to' | 'scammed' | 'controlled_by'
  weight?: number;
}

export interface NetworkSummary {
  totalNodes: number;
  totalEdges: number;
  communitiesCount: number;
  highRiskNodes: number;
  moneyMulesCount: number;
  mastermindsCount: number;
  aiPoliceReport: string;
}
