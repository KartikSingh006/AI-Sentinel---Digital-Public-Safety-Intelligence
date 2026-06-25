/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  Shield, 
  Network, 
  MapPin, 
  Phone, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  FileText, 
  User, 
  Search, 
  Upload, 
  Copy, 
  ChevronRight, 
  RefreshCw, 
  Info,
  ShieldAlert,
  HardDrive,
  Sparkles,
  MessageSquare,
  Eye,
  Trash2,
  Volume2,
  VolumeX,
  Map,
  Globe,
  ZoomIn,
  ZoomOut,
  Maximize
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Complaint, GraphNode, GraphEdge, ScamAnalysis } from './types.ts';

export default function App() {
  // Application State
  const [activeTab, setActiveTab] = useState<'shield' | 'network' | 'vault' | 'intel'>(() => {
    const saved = localStorage.getItem('sentinel_activeTab');
    return (saved as any) || 'intel';
  });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(() => {
    const saved = localStorage.getItem('sentinel_selectedCommunity');
    return saved !== null && saved !== 'null' ? Number(saved) : null;
  });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredNodePos, setHoveredNodePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<any>(null);
  const [zoomTransform, setZoomTransform] = useState<any>(d3.zoomIdentity);
  const [isMapView, setIsMapView] = useState<boolean>(() => {
    const saved = localStorage.getItem('sentinel_isMapView');
    return saved !== null ? saved === 'true' : false;
  });
  const [showHeatmap, setShowHeatmap] = useState<boolean>(() => {
    const saved = localStorage.getItem('sentinel_showHeatmap');
    return saved !== null ? saved === 'true' : true;
  });
  const [clusterReport, setClusterReport] = useState<string>('');

  // Persist graph visual settings & activeTab
  useEffect(() => {
    localStorage.setItem('sentinel_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('sentinel_isMapView', String(isMapView));
  }, [isMapView]);

  useEffect(() => {
    localStorage.setItem('sentinel_showHeatmap', String(showHeatmap));
  }, [showHeatmap]);

  useEffect(() => {
    if (selectedCommunity === null) {
      localStorage.removeItem('sentinel_selectedCommunity');
    } else {
      localStorage.setItem('sentinel_selectedCommunity', String(selectedCommunity));
    }
  }, [selectedCommunity]);

  // Dashboard Interactive Persistence & AI Enrichment States
  const [isAuditingNode, setIsAuditingNode] = useState<boolean>(false);
  const [nodeCustomNotes, setNodeCustomNotes] = useState<string>('');
  const [nodeTagInput, setNodeTagInput] = useState<string>('');
  const [nodeUpdateStatus, setNodeUpdateStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isAutomatedTriage, setIsAutomatedTriage] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  const playP0WarningSound = () => {
    if (isAudioMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("Web Audio API is not supported in this browser.");
        return;
      }
      const ctx = new AudioContextClass();
      
      const playBeep = (time: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.18, time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + duration);
      };

      const now = ctx.currentTime;
      // High-risk P0 siren/alert audio signature
      playBeep(now, 880, 0.25);
      playBeep(now + 0.15, 660, 0.25);
      
      playBeep(now + 0.4, 880, 0.25);
      playBeep(now + 0.55, 660, 0.25);

      playBeep(now + 0.8, 880, 0.35);
      playBeep(now + 0.95, 1100, 0.45);
    } catch (error) {
      console.error("Failed to play P0 warning sound:", error);
    }
  };

  // Sync custom notes when selectedNode changes
  useEffect(() => {
    if (selectedNode) {
      setNodeCustomNotes(selectedNode.customNotes || '');
      setNodeTagInput('');
      setNodeUpdateStatus('idle');
    }
  }, [selectedNode]);

  const updateSelectedNodeFields = async (nodeId: string, updates: Partial<GraphNode>) => {
    setNodeUpdateStatus('saving');
    try {
      const res = await fetch(`/api/graph/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updatedNode = await res.json();
        // Dynamic reload
        await fetchGraph();
        setSelectedNode(updatedNode);
        setNodeUpdateStatus('saved');
        setTimeout(() => setNodeUpdateStatus('idle'), 2000);
      } else {
        setNodeUpdateStatus('error');
      }
    } catch (err) {
      console.error("Failed to persist node updates", err);
      setNodeUpdateStatus('error');
    }
  };

  // Initialize D3 zoom and pan for the network graph visualization
  useEffect(() => {
    if (isMapView) return;
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 6])
      .on('zoom', (event) => {
        setZoomTransform(event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Initial centering of nodes if nodes are loaded
    if (nodes.length > 0 && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth || 800;
      const containerHeight = containerRef.current.clientHeight || 500;
      const cx = d3.mean(nodes, (n: any) => n.x) || 350;
      const cy = d3.mean(nodes, (n: any) => n.y) || 220;
      
      const initialTransform = d3.zoomIdentity
        .translate(containerWidth / 2 - cx, containerHeight / 2 - cy)
        .scale(1.0);
      
      svg.call(zoom.transform, initialTransform);
    }

    return () => {
      svg.on('.zoom', null);
    };
  }, [isMapView, nodes.length === 0]);

  // Handle smooth zooming / centering on community rings or resetting view using d3-transition
  useEffect(() => {
    if (isMapView) return;
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const containerWidth = containerRef.current.clientWidth || 800;
    const containerHeight = containerRef.current.clientHeight || 500;

    if (selectedCommunity !== null) {
      // Focus on the specific community ring with smooth zoom
      const commNodes = nodes.filter(n => n.community === selectedCommunity);
      if (commNodes.length > 0) {
        const cx = d3.mean(commNodes, (n: any) => n.x) || 350;
        const cy = d3.mean(commNodes, (n: any) => n.y) || 220;

        const targetScale = 1.45;
        const targetTransform = d3.zoomIdentity
          .translate(containerWidth / 2 - cx * targetScale, containerHeight / 2 - cy * targetScale)
          .scale(targetScale);

        svg.transition()
          .duration(850)
          .ease(d3.easeCubicInOut)
          .call(zoomBehaviorRef.current.transform, targetTransform);
      }
    } else {
      // Reset or center back smoothly to see all clusters
      if (nodes.length > 0) {
        const cx = d3.mean(nodes, (n: any) => n.x) || 350;
        const cy = d3.mean(nodes, (n: any) => n.y) || 220;

        const targetScale = 1.0;
        const targetTransform = d3.zoomIdentity
          .translate(containerWidth / 2 - cx * targetScale, containerHeight / 2 - cy * targetScale)
          .scale(targetScale);

        svg.transition()
          .duration(850)
          .ease(d3.easeCubicInOut)
          .call(zoomBehaviorRef.current.transform, targetTransform);
      }
    }
  }, [selectedCommunity, nodes, isMapView]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition()
      .duration(400)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.scaleBy, 1.4);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition()
      .duration(400)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.scaleBy, 1 / 1.4);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const containerWidth = containerRef.current.clientWidth || 800;
    const containerHeight = containerRef.current.clientHeight || 500;
    const cx = d3.mean(nodes, (n: any) => n.x) || 350;
    const cy = d3.mean(nodes, (n: any) => n.y) || 220;

    const targetTransform = d3.zoomIdentity
      .translate(containerWidth / 2 - cx, containerHeight / 2 - cy)
      .scale(1.0);

    svg.transition()
      .duration(650)
      .ease(d3.easeCubicInOut)
      .call(zoomBehaviorRef.current.transform, targetTransform);
  };

  const runAiNodeAudit = async (node: GraphNode) => {
    if (!node) return;
    setIsAuditingNode(true);
    try {
      const res = await fetch(`/api/graph/nodes/${node.id}/ai-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: node.label,
          type: node.type,
          nodeDetails: node.details,
          community: node.community
        })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchGraph();
        if (data.node) {
          setSelectedNode(data.node);
        }
      } else {
        alert("Verification failed. Please check backend log and configurations.");
      }
    } catch (err) {
      console.error("AI node audit error", err);
    } finally {
      setIsAuditingNode(false);
    }
  };

  
  // AI Intel Hub States
  const [chatModel, setChatModel] = useState<'gemini-3.1-pro-preview' | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite'>(() => {
    const saved = localStorage.getItem('sentinel_chatModel');
    return (saved as any) || 'gemini-3.5-flash';
  });
  const [chatPersona, setChatPersona] = useState<'forensics' | 'crisis' | 'audit'>(() => {
    const saved = localStorage.getItem('sentinel_chatPersona');
    return (saved as any) || 'forensics';
  });
  const [highReasoning, setHighReasoning] = useState<boolean>(() => {
    const saved = localStorage.getItem('sentinel_highReasoning');
    return saved !== null ? saved === 'true' : false;
  });
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{ 
    role: 'user' | 'assistant'; 
    text: string; 
    timestamp: Date; 
    persona?: string; 
    modelUsed?: string; 
    highReasoning?: boolean;
  }>>(() => {
    const saved = localStorage.getItem('sentinel_chatMessages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          }));
        }
      } catch (e) {
        console.error("Failed to parse chat messages from localStorage", e);
      }
    }
    return [];
  });

  const [visualImage, setVisualImage] = useState<string>(''); // Base64
  const [visualMimeType, setVisualMimeType] = useState<string>('image/png');
  const [visualPrompt, setVisualPrompt] = useState<string>('Perform comprehensive multi-modal forensic extraction. Retrieve suspect identity, mock agency authority labels, phone/cellular routing targets, and financial escrow accounts.');
  const [visualAnalysis, setVisualAnalysis] = useState<string>('');
  const [visualLoading, setVisualLoading] = useState<boolean>(false);
  
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const PERSONAS = {
    forensics: {
      name: "Lead Forensics Officer",
      role: "Analyze threat mechanisms, track spoofing cellular towers, map out VoIP Cambodia desk gateways, and coordinate formal state level policing interdictions.",
      avatar: "👮",
      instructions: "You are the Lead Cyber Crime Forensics Officer at AI Sentinel. Your role is to analyze technical aspects of cyber frauds, tracking cellular routing, fake Skype identities, VoIP gateways and coordinating state level police responses. Maintain an official, direct, authoritative investigation tone."
    },
    crisis: {
      name: "Victims Crisis Support Advisor",
      role: "Empathize, calm targeted citizens, explain digital legal rights, warn about coercion tactics, and secure emotional recovery during active intimidation.",
      avatar: "🎗️",
      instructions: "You are the Victims Crisis Support Advisor at AI Sentinel. Your role is to calmly and empathetically support citizens undergoing extortion, fake arrests, and intense coercion. Reassure them that 'Digital Arrest' is an absolute legal fiction, advise them to disconnect, and guide them safely to physical protection."
    },
    audit: {
      name: "Financial Laundering Auditor",
      role: "Audit banking nodes, identify shell categories, track money mules Bengaluru caches, and pre-draft banking freeze chargeback requests.",
      avatar: "🪙",
      instructions: "You are the Financial Laundering Auditor at AI Sentinel. Your role is to analyze bank coordinates, UPI wallets, money mule structures, logistics accounts, and track wire routings. Draft official hold directives and bank reporting documents under a formal technical auditing perspective."
    }
  };

  const isInitialLoadRef = useRef<boolean>(true);

  // Populate introductory message on persona change
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      if (chatMessages.length > 0) {
        return;
      }
    }

    const personaObj = PERSONAS[chatPersona];
    setChatMessages([
      {
        role: 'assistant',
        text: `Salutations, investigator. I have initialized my secure console as your **${personaObj.name}** co-pilot.\n\nMy active operational guidelines are: *"${personaObj.role}"*\n\nHow can I assist you with your cyber-threat intelligence inquiry today?`,
        timestamp: new Date(),
        persona: chatPersona
      }
    ]);
  }, [chatPersona]);

  // Persist AI Intel Hub state values
  useEffect(() => {
    localStorage.setItem('sentinel_chatModel', chatModel);
  }, [chatModel]);

  useEffect(() => {
    localStorage.setItem('sentinel_chatPersona', chatPersona);
  }, [chatPersona]);

  useEffect(() => {
    localStorage.setItem('sentinel_highReasoning', String(highReasoning));
  }, [highReasoning]);

  useEffect(() => {
    localStorage.setItem('sentinel_chatMessages', JSON.stringify(chatMessages));
  }, [chatMessages]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Audio playback or processing mockup state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  
  // Submit Complaint Form State
  const [citizenName, setCitizenName] = useState<string>(() => {
    return localStorage.getItem('sentinel_citizenName') || '';
  });
  const [citizenContact, setCitizenContact] = useState<string>(() => {
    return localStorage.getItem('sentinel_citizenContact') || '';
  });
  const [inputType, setInputType] = useState<'text' | 'image' | 'audio_transcript' | 'pdf'>(() => {
    return (localStorage.getItem('sentinel_inputType') as any) || 'text';
  });
  const [rawInput, setRawInput] = useState<string>(() => {
    return localStorage.getItem('sentinel_rawInput') || '';
  });
  const [fileName, setFileName] = useState<string>(() => {
    return localStorage.getItem('sentinel_fileName') || '';
  });

  // Persist Submit Complaint Form Draft States
  useEffect(() => {
    localStorage.setItem('sentinel_citizenName', citizenName);
  }, [citizenName]);

  useEffect(() => {
    localStorage.setItem('sentinel_citizenContact', citizenContact);
  }, [citizenContact]);

  useEffect(() => {
    localStorage.setItem('sentinel_inputType', inputType);
  }, [inputType]);

  useEffect(() => {
    localStorage.setItem('sentinel_rawInput', rawInput);
  }, [rawInput]);

  useEffect(() => {
    localStorage.setItem('sentinel_fileName', fileName);
  }, [fileName]);

  // Submit Complaint Form Validation States
  const [citizenNameDirty, setCitizenNameDirty] = useState<boolean>(false);
  const [citizenContactDirty, setCitizenContactDirty] = useState<boolean>(false);
  const [rawInputDirty, setRawInputDirty] = useState<boolean>(false);

  // Audio recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Real-time validation computation
  const isNameValid = citizenName.trim().length >= 3 && /^[A-Za-z\s.\-]+$/.test(citizenName.trim());
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(citizenContact.trim());
  const isPhone = /^\+?[0-9\s\-()]{8,18}$/.test(citizenContact.trim());
  const isContactValid = isEmail || isPhone;
  const isRawInputValid = rawInput.trim().length >= 25;
  const isFormValid = isNameValid && isContactValid && isRawInputValid;

  // Status notification state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Built-in Incident Templates for rapid citizen reporting evaluation
  const INTENT_PRESETS = [
    {
      title: "📞 Skype Impersonation (CBI Arrest)",
      name: "Rajesh Kumar",
      contact: "+91 97654-32110",
      type: "audio_transcript" as const,
      input: "Citizen recording: I received a warning stating my SIM card has been flagged under crime activities in Mumbai. I got nested on Google Skype with a fake officer who displayed a forged CBI identity card. He stayed in my bedroom over the camera for 8 hours under online quarantine. Under extreme coercion, I was demanded to clear verification fees by wire-routing 5,00,000 INR to safe government locker wallet cbi-safe-vault@icici so my accounts are not sealed. I made transfer from my ID Hdfc-9821."
    },
    {
      title: "📦 Customs Parcel Contraband Extortion",
      name: "Meera Nair",
      contact: "+91 81223-99001",
      type: "text" as const,
      input: "Email scam received: Customs Authority alert at terminal 3. A FedEx parcel sent containing illegal narcotics, synthetic contraband, and fake travel passports was addressed to your residence in Mumbai. Your case is being dispatched under urgent CBI surveillance. Access immediate bail escrow using deposit account SBI National Escrow 882103445 to bypass physical prison custody."
    },
    {
      title: "📱 Aadhaar Linking Blocking Hoax",
      name: "Suresh Patil",
      contact: "+91 94451-02931",
      type: "text" as const,
      input: "WhatsApp SMS: Your Department of Telecommunications (DoT) connection is suspended within 2 hours. Your Aadhaar profile was found linked to a money-laundering ledger. Reach cyber desk immediately. UPI ID target: dot-desk@paytm."
    }
  ];

  // Load complaints and graph on startup
  useEffect(() => {
    fetchComplaints();
    fetchGraph();
  }, []);

  const fetchComplaints = async () => {
    try {
      const res = await fetch('/api/complaints');
      if (res.ok) {
        const data = await res.json();
        setComplaints(data);
        if (data.length > 0 && !selectedComplaint) {
          setSelectedComplaint(data[0]);
        }
      }
    } catch (err) {
      console.error("Error loading complaints", err);
    }
  };

  const fetchGraph = async () => {
    try {
      const res = await fetch('/api/graph');
      if (res.ok) {
        const data = await res.json();
        
        // Let's layout nodes neatly in coordinate systems to ensure an attractive visualization
        const initializedNodes = data.nodes.map((node: GraphNode) => {
          let x = 300;
          let y = 200;

          // Align nodes aesthetically based on community grouping & node type
          if (node.id === 'N-Ghost') {
            // Center mastermind
            x = 350; y = 220;
          } else if (node.type === 'victim') {
            x = node.community === 1 ? 100 : 580;
            y = node.id.includes('Vikram') ? 120 : (node.id.includes('Ananya') ? 310 : 80);
          } else if (node.type === 'agency') {
            x = node.community === 1 ? 120 : 520;
            y = node.community === 1 ? 260 : 380;
          } else if (node.type === 'phone') {
            x = node.community === 1 ? 220 : 490;
            y = node.community === 1 ? 80 : 130;
          } else if (node.type === 'upi') {
            x = node.community === 1 ? 250 : 460;
            y = node.community === 1 ? 320 : 250;
          } else if (node.type === 'bank_account' || node.type === 'mule') {
            x = node.community === 1 ? 360 : 380;
            y = node.community === 1 ? 350 : 110;
          } else {
            x = 100 + Math.random() * 500;
            y = 100 + Math.random() * 300;
          }

          return { ...node, x, y };
        });

        setNodes(initializedNodes);
        setEdges(data.edges);
      }
    } catch (err) {
      console.error("Error loading graph", err);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Preset Applier
  const applyPreset = (preset: typeof INTENT_PRESETS[0]) => {
    setCitizenName(preset.name);
    setCitizenContact(preset.contact);
    setInputType(preset.type);
    setRawInput(preset.input);
    setFileName(preset.type === 'audio_transcript' ? 'recording.wav' : 'complaint.txt');
    setCitizenNameDirty(true);
    setCitizenContactDirty(true);
    setRawInputDirty(true);
    showToast(`Loaded Template: ${preset.title.split(' ')[1]} style`, 'success');
  };

  // Start microphone capture
  const startRecording = async () => {
    setRecordedAudioUrl(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType }) 
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        setFileName(`mic_recording_${Date.now()}.${recorder.mimeType.split(';')[0].split('/')[1] || 'webm'}`);
        
        // Stop all tracks to release the microphone device
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(250); // get data chunks every 250ms
      setIsRecording(true);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
      showToast("Voice recorder active. Capture scam calls/statements now...", "success");
    } catch (err: any) {
      console.error("Microphone access failed:", err);
      showToast("Access failed: " + err.message, "error");
    }
  };

  // Stop microphone capture
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    showToast("Voice audio capture completed.", "success");
  };

  // Trigger speech-to-text transcription via backend endpoint
  const handleTranscribeRecordedAudio = async () => {
    if (audioChunksRef.current.length === 0) {
      showToast("No recorded audio available. Record something first.", "error");
      return;
    }

    setTranscribing(true);
    showToast("Transmitting audio payload to STT backend...", "success");

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
      
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          const base64Payload = base64data.split(',')[1];
          
          const response = await fetch('/api/intel/transcribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              audio: base64Payload,
              mimeType: audioBlob.type || 'audio/webm'
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          if (data.error) {
            throw new Error(data.error);
          }

          setRawInput(data.text);
          setRawInputDirty(true);
          showToast("AI Speech-to-Text conversion completed successfully!", "success");
        } catch (innerErr: any) {
          console.error("STT transcribing inner error:", innerErr);
          showToast("STT failed: " + innerErr.message, "error");
        } finally {
          setTranscribing(false);
        }
      };
    } catch (error: any) {
      console.error("Transcribing audio failed:", error);
      showToast("STT failed: " + error.message, "error");
      setTranscribing(false);
    }
  };

  // Submit Complaint
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark everything dirty on submit attempt
    setCitizenNameDirty(true);
    setCitizenContactDirty(true);
    setRawInputDirty(true);

    if (!citizenName || !citizenContact || !rawInput) {
      showToast("Please fill in Citizen Name, Contact Info, and Scam Text.", "error");
      return;
    }

    if (!isFormValid) {
      if (!isNameValid) {
        showToast("Validation Error: Citizen Name must be at least 3 letters: letters, spaces, hyphens, and periods only.", "error");
      } else if (!isContactValid) {
        showToast("Validation Error: Please match phone format (8-18 digits) or provide a valid Email.", "error");
      } else if (!isRawInputValid) {
        showToast("Validation Error: Incident details must have at least 25 characters of context.", "error");
      }
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Initializing safe core pipeline...");

    try {
      setTimeout(() => setProcessingStatus("Performing OCR & speech processing..."), 800);
      setTimeout(() => setProcessingStatus("Extracting entities with Regex & Gemini Model..."), 1500);

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizenName,
          citizenContact,
          inputType,
          rawInput,
          fileName: fileName || "input_log.txt"
        })
      });

      if (!res.ok) {
        throw new Error("Server failed with bad return status.");
      }

      const freshComp = await res.json();
      
      const risk = freshComp.analysis?.riskScore || 0;
      if (risk >= 90) {
        playP0WarningSound();
        showToast("🚨 CRITICAL P0 THREAT DETECTED! Active warning alert triggered.", "error");
      } else {
        showToast("Scam Incident processed and logged to cyber-ledgers successfully!");
      }
      
      // Update local states
      setComplaints(prev => [freshComp, ...prev]);
      setSelectedComplaint(freshComp);
      
      // Clear inputs
      setCitizenName('');
      setCitizenContact('');
      setRawInput('');
      setFileName('');
      setRecordedAudioUrl(null);
      setCitizenNameDirty(false);
      setCitizenContactDirty(false);
      setRawInputDirty(false);

      // Refresh corresponding graph network elements
      await fetchGraph();
      
      // Select the first tab to view
      setActiveTab('shield');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Failed to finalize analysis.", "error");
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Trigger Police Audit Report on cluster
  const handleTriggerClusterAudit = async (commId: number) => {
    try {
      setClusterReport('Running Deep Intelligence forensics...');
      
      const communityNodes = nodes.filter(n => n.community === commId);
      const communityEdges = edges.filter(e => 
        communityNodes.some(n => n.id === e.source) && 
        communityNodes.some(n => n.id === e.target)
      );

      const res = await fetch('/api/graph/analyze-cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: commId,
          nodes: communityNodes,
          edges: communityEdges
        })
      });

      if (res.ok) {
        const reportData = await res.json();
        setClusterReport(reportData.analysis);
        showToast(`AI Cyber Report generated for Community Ring #${commId}`);
      } else {
        throw new Error("Report fetch returned error code.");
      }
    } catch (err) {
      setClusterReport("Failed to generate report due to backend socket latency. Please try again.");
    }
  };

  // Copy police draft to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Official Cyber Crime Draft copied to Clipboard!");
  };

  // Send a multi-turn chat message
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    const updatedMessages = [...chatMessages, { role: 'user' as const, text: userText, timestamp: new Date() }];
    setChatMessages(updatedMessages);

    try {
      // Map historical dialog for stateless backend
      const formattedHistory = updatedMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.text }]
      }));

      const res = await fetch('/api/intel/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedHistory,
          model: chatModel,
          personaInstructions: PERSONAS[chatPersona].instructions,
          highReasoning: highReasoning && chatModel === 'gemini-3.1-pro-preview'
        })
      });

      if (!res.ok) {
        throw new Error("Threat intelligence node returned server error.");
      }

      const data = await res.json();
      setChatMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          text: data.text, 
          timestamp: new Date(),
          persona: chatPersona,
          modelUsed: chatModel,
          highReasoning: highReasoning && chatModel === 'gemini-3.1-pro-preview'
        }
      ]);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Threat Intelligence nodes disconnected. Try again.", "error");
    } finally {
      setChatLoading(false);
    }
  };

  // Submit visual screenshot warrant to multi-modal Gemini Forensics
  const handleAnalyzeVisualEvidence = async () => {
    if (!visualImage || visualLoading) return;
    setVisualLoading(true);
    setVisualAnalysis("AI Sentinel running visual forensics OCR extraction...");

    try {
      const res = await fetch('/api/intel/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: visualImage,
          mimeType: visualMimeType,
          prompt: visualPrompt,
          highReasoning: highReasoning && chatModel === 'gemini-3.1-pro-preview'
        })
      });

      if (!res.ok) {
        throw new Error("Visual Analysis node reported latency exception.");
      }

      const data = await res.json();
      setVisualAnalysis(data.analysisResult);
      showToast("Visual evidence analysis report parsed!", "success");
    } catch (err: any) {
      console.error(err);
      setVisualAnalysis("Failed to parse evidence image. Error: " + (err.message || "Unknown error"));
      showToast("Failed to compile audit report", "error");
    } finally {
      setVisualLoading(false);
    }
  };

  // Convert upload files to Base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Uploaded file must be a visual image artifact.", "error");
      return;
    }

    setVisualMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      setVisualImage(reader.result as string);
      showToast("Visual evidence loaded. Ready for OCR extraction & audit.", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Dropped file must be a visual image artifact.", "error");
      return;
    }

    setVisualMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      setVisualImage(reader.result as string);
      showToast("Visual evidence loaded via drag-and-drop.", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleExportForensicPDF = () => {
    if (!visualAnalysis) {
      showToast("No visual analysis report available to export.", "error");
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Header banner styling
      doc.setFillColor(18, 18, 23); // Slate charcoal
      doc.rect(0, 0, 210, 42, 'F');
      
      // Header title
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("AI SENTINEL", 15, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(16, 185, 129); // Emerald accent
      doc.text("DIGITAL PUBLIC SAFETY SITE FORENSIC MATRIX", 15, 28);
      
      doc.setTextColor(180, 180, 180);
      doc.text(`DATE GENERATED: ${new Date().toLocaleString()}`, 140, 15);
      doc.text("CLASSIFICATION: RESTRICTED", 140, 22);
      doc.text(`INTELLIGENCE NODE: SEC-INTEL-PRO`, 140, 29);
      
      // Line divider
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(15, 48, 195, 48);
      
      // Forensic metadata section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("I. METADATA & PARSER CONSTRAINTS", 15, 56);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Active Intelligence Persona: Lead Forensics Officer`, 18, 64);
      doc.text(`Operational Engine: ${chatModel}`, 18, 70);
      doc.text(`Source MimeType: ${visualMimeType}`, 18, 76);
      doc.text(`Visual Evidence Size: ${visualImage ? visualImage.length : 0} characters`, 18, 82);
      
      // Draw instructions
      doc.setFont("helvetica", "bold");
      doc.text(`Custom Forensic Instructions:`, 18, 90);
      doc.setFont("helvetica", "normal");
      
      const wrappedPrompt = doc.splitTextToSize(visualPrompt, 175);
      doc.text(wrappedPrompt, 18, 95);
      
      const promptHeight = wrappedPrompt.length * 4.5;
      let nextY = 95 + promptHeight + 10;
      
      // Main Analysis Report Section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("II. CYBER CRIMINOLOGY ANALYSIS / OCR EXTRACT", 15, nextY);
      nextY += 8;
      
      doc.setFont("courier", "normal"); // Monospace for technical/console vibe
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      
      const wrappedAnalysis = doc.splitTextToSize(visualAnalysis, 175);
      const pageHeight = doc.internal.pageSize.height; // A4 height is 297 mm
      const bottomMargin = 20;
      
      for (let i = 0; i < wrappedAnalysis.length; i++) {
        if (nextY > (pageHeight - bottomMargin)) {
          doc.addPage();
          nextY = 20; // reset nextY for new page
        }
        doc.text(wrappedAnalysis[i], 18, nextY);
        nextY += 4.5;
      }
      
      // Footer status line
      if (nextY > (pageHeight - 20)) {
        doc.addPage();
        nextY = 20;
      }
      doc.setDrawColor(230, 230, 230);
      doc.line(15, pageHeight - 18, 195, pageHeight - 18);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("CONFIDENTIAL | GENERATED VIA AI SENTINEL SECURE AUDITING NODES. DISCLOSURE TO UNAUTHORIZED PARTY PROHIBITED.", 15, pageHeight - 12);
      
      const filename = `AI_Sentinel_Forensic_Report_${Date.now()}.pdf`;
      doc.save(filename);
      showToast("Official Forensic Report PDF downloaded successfully!", "success");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      showToast("PDF generation failed: " + error.message, "error");
    }
  };

  const handleExportChatPDF = () => {
    if (chatMessages.length === 0) {
      showToast("No active conversation logs available to export.", "error");
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Header banner styling
      doc.setFillColor(18, 18, 23); // Slate charcoal
      doc.rect(0, 0, 210, 42, 'F');
      
      // Header title
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("AI SENTINEL", 15, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(16, 185, 129); // Emerald accent
      doc.text("CORE INTEL COPILOT DIALOG TRANSCRIPTS", 15, 28);
      
      doc.setTextColor(180, 180, 180);
      doc.text(`DATE GENERATED: ${new Date().toLocaleString()}`, 140, 15);
      doc.text("CLASSIFICATION: RESTRICTED", 140, 22);
      doc.text(`INTELLIGENCE NODE: SEC-CHAT-PRO`, 140, 29);
      
      // Line divider
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(15, 48, 195, 48);
      
      // Forensic metadata section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("I. OPERATIONAL SYSTEM CONSTRAINTS", 15, 56);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Active Persona Preset: ${PERSONAS[chatPersona].name}`, 18, 64);
      doc.text(`Operational AI Model: ${chatModel}`, 18, 70);
      doc.text(`Deep Thinking Module (Reasoning): ${highReasoning && chatModel === 'gemini-3.1-pro-preview' ? 'ACTIVE HIGH REASONING' : 'OFF'}`, 18, 76);
      doc.text(`Total Dialogue Turns: ${chatMessages.length}`, 18, 82);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(15, 88, 195, 88);
      
      // Chat messages title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("II. COPILOT DIALOGUE TRANSCRIPT RECORD", 15, 96);
      
      let nextY = 104;
      const pageHeight = doc.internal.pageSize.height;
      const bottomMargin = 20;

      chatMessages.forEach((msg, idx) => {
        if (nextY > (pageHeight - bottomMargin)) {
          doc.addPage();
          nextY = 20;
        }
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        if (msg.role === 'user') {
          doc.setTextColor(40, 80, 180); // Blue for user
          doc.text(`[Citizen User] - ${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}`, 18, nextY);
        } else {
          doc.setTextColor(16, 185, 129); // Emerald for supervisor
          doc.text(`[${PERSONAS[chatPersona].name}] - ${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}`, 18, nextY);
        }
        nextY += 5.5;

        // Draw message body
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        
        const wrappedText = doc.splitTextToSize(msg.text, 175);
        for (let i = 0; i < wrappedText.length; i++) {
          if (nextY > (pageHeight - bottomMargin)) {
            doc.addPage();
            nextY = 20;
          }
          doc.text(wrappedText[i], 22, nextY);
          nextY += 4.5;
        }
        
        // Add tiny gap
        nextY += 5;
      });

      // Footer status line
      doc.setDrawColor(230, 230, 230);
      doc.line(15, pageHeight - 18, 195, pageHeight - 18);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("CONFIDENTIAL | GENERATED VIA AI SENTINEL SECURE AUDITING NODES. DISCLOSURE TO UNAUTHORIZED PARTY PROHIBITED.", 15, pageHeight - 12);
      
      const filename = `AI_Sentinel_Dialogue_Logs_${Date.now()}.pdf`;
      doc.save(filename);
      showToast("Dialogue Logs PDF downloaded successfully!", "success");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      showToast("PDF generation failed: " + error.message, "error");
    }
  };

  // Simple Local Storage stats calculated dynamically
  const scamComplaintsCount = complaints.filter(c => c.analysis?.classification === 'Digital Arrest Scam').length;
  const averageRisk = complaints.length > 0
    ? Math.round(complaints.reduce((acc, curr) => acc + (curr.analysis?.riskScore || 0), 0) / complaints.length)
    : 85;

  const filteredComplaints = complaints.filter(c => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.citizenName.toLowerCase().includes(query) ||
      c.rawInput.toLowerCase().includes(query) ||
      c.analysis?.classification.toLowerCase().includes(query)
    );
  });

  const sortedComplaints = isAutomatedTriage
    ? [...filteredComplaints].sort((a, b) => (b.analysis?.riskScore || 0) - (a.analysis?.riskScore || 0))
    : filteredComplaints;

  return (
    <div className="min-h-screen bg-[#09090B] text-slate-300 font-sans flex flex-col overflow-x-hidden selection:bg-blue-600/30">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 bg-[#121217] border border-blue-500/30 p-4 rounded-xl shadow-2xl flex items-center space-x-3 max-w-sm animate-fade-in-down">
          <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <p className="text-xs font-medium text-white">{notification.message}</p>
        </div>
      )}

      {/* Header element conforming strictly to sleek UI wireframe */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0F0F13] shrink-0 sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-600/30">
            <span className="font-mono text-white text-lg font-bold">🛡️</span>
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white block">AI SENTINEL</span>
            <span className="text-[9px] uppercase font-mono tracking-widest text-slate-500 block">Digital Public Safety Intelligence</span>
          </div>
          <span className="bg-blue-500/10 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest ml-2">
            v2.4.0-CORE
          </span>
        </div>

        <div className="flex items-center space-x-6 text-sm font-medium">
          <div className="hidden md:flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-emerald-500 text-xs uppercase font-mono">SYSTEM OPTIMAL • LIVELINK ACTIVE</span>
          </div>
          <div className="h-4 w-[1px] bg-white/10 hidden md:block"></div>
          <div className="flex items-center space-x-4">
            <span className="text-slate-500 text-xs font-mono">UTC: 2026-06-22 17:30 UTC</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#121217] to-slate-900 border border-white/10 flex items-center justify-center">
              <span className="text-xs font-bold text-white">IN</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Sidebar Info Conforming to Sleek Interface */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-white/5 bg-[#0C0C0F] p-5 flex flex-col shrink-0">
          <div className="mb-6">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-3">Intelligence Modules</div>
            <nav className="space-y-1">
              <button 
                onClick={() => setActiveTab('shield')}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all text-left ${activeTab === 'shield' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-sm' : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center space-x-3">
                  <Shield className="w-4 h-4" />
                  <span className="font-semibold text-sm">Citizen Fraud Shield</span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </button>

              <button 
                onClick={() => {
                  setActiveTab('network');
                  fetchGraph();
                }}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all text-left ${activeTab === 'network' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-sm' : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center space-x-3">
                  <Network className="w-4 h-4" />
                  <span className="font-semibold text-sm">Network Graph</span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </button>

              <button 
                onClick={() => setActiveTab('vault')}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all text-left ${activeTab === 'vault' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-sm' : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center space-x-3">
                  <FileText className="w-4 h-4" />
                  <span className="font-semibold text-sm">Incident Vault</span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </button>

              <button 
                onClick={() => setActiveTab('intel')}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all text-left ${activeTab === 'intel' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-sm' : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                    AI Intel Lab
                    <span className="text-[9px] font-mono tracking-tighter bg-emerald-500/15 text-emerald-400 px-1 py-0 rounded font-normal uppercase animate-pulse">
                      Live
                    </span>
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-60 text-emerald-400" />
              </button>
            </nav>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 bg-[#0C0C0F]">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                <span>Real-time Stats</span>
              </div>
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Total Scams Blocked</span>
                    <span className="font-mono text-white font-bold">{complaints.length + 1528}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full w-[72%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Digital Arrest Focus</span>
                    <span className="font-mono text-orange-400 font-bold">{scamComplaintsCount} active</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-orange-500 h-full w-[45%]" />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5">
                  <span className="text-slate-400">Average Threat</span>
                  <span className="text-xs font-mono font-bold text-red-400">{averageRisk}% RED</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Outer Section Frame Grid */}
        <main className="flex-1 p-4 lg:p-6 grid grid-cols-12 gap-6 overflow-y-auto">
          
          {/* Top Row Stat Widgets */}
          <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            <div className="bg-[#121217] border border-white/5 p-4 rounded-xl shadow-xl flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Citizen Cases Analyzed</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{complaints.length}</div>
                <div className="text-[10px] text-emerald-500/60 font-medium">100% response telemetry</div>
              </div>
            </div>

            <div className="bg-[#121217] border border-white/5 p-4 rounded-xl shadow-xl flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Identified Fraud Nodes</div>
                <div className="text-2xl font-bold text-white mt-1">{nodes.length}</div>
                <div className="text-[10px] text-slate-500 font-medium">Tracking mules & Skype links</div>
              </div>
            </div>

            <div className="bg-[#121217] border border-white/5 p-4 rounded-xl shadow-xl flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-orange-500/10 text-orange-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digital Arrest Scams</div>
                <div className="text-2xl font-bold text-orange-400 mt-1">{scamComplaintsCount}</div>
                <div className="text-[10px] text-orange-500/60 font-medium">90%+ Threat severity level</div>
              </div>
            </div>

            <div className="bg-[#121217] border border-white/5 p-4 rounded-xl shadow-xl flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Classification</div>
                <div className="text-2xl font-bold text-white mt-1">Active</div>
                <div className="text-[10px] text-purple-500/60 font-medium">Gemini 3.5 Flash Core Engine</div>
              </div>
            </div>
          </div>

          {/* Core App View Tabs */}

          {/* 1. CITIZEN FRAUD SHIELD TAB */}
          {activeTab === 'shield' && (
            <>
              {/* Submission Area */}
              <div className="col-span-12 lg:col-span-5 bg-[#121217] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-[#17171E] flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-white tracking-tight flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span>Citizen Fraud Shield</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Report threatening calls, Skype digital arrest files or spam bills</p>
                  </div>
                  <div className="flex space-x-1">
                    <span className="text-[9px] bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20 font-mono">1930 LINK</span>
                  </div>
                </div>

                <div className="flex-1 p-5 space-y-4 overflow-y-auto">
                  {/* Preset Quick Loader Buttons */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                       Analyze Demo Templates (Quick Start)
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {INTENT_PRESETS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className="text-left text-xs bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-300 group-hover:text-blue-300">{p.title}</span>
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono group-hover:bg-blue-900 group-hover:text-blue-200">Load</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <hr className="border-white/5 my-2" />

                  {/* Complaint form */}
                  <form onSubmit={handleSubmitComplaint} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Citizen Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={citizenName}
                        onChange={e => {
                          setCitizenName(e.target.value);
                          setCitizenNameDirty(true);
                        }}
                        onBlur={() => setCitizenNameDirty(true)}
                        placeholder="e.g. Vikram Sharma"
                        className={`w-full bg-[#17171e]/50 border rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-all ${
                          citizenNameDirty 
                            ? (isNameValid ? 'border-emerald-500/30 focus:border-emerald-500' : 'border-red-500/40 focus:border-red-500 bg-red-500/[0.02]') 
                            : 'border-white/10 focus:border-blue-500'
                        }`}
                      />
                      {citizenNameDirty && !isNameValid && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center space-x-1 animate-fade-in">
                          <span>⚠️ Name must be at least 3 characters and consist only of letters and spaces.</span>
                        </p>
                      )}
                      {citizenNameDirty && isNameValid && (
                        <p className="text-[10px] text-emerald-400 mt-1 flex items-center space-x-1 animate-fade-in">
                          <span>✓ Name is valid.</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Citizen Contact Info (Phone/Email)</label>
                      <input 
                        type="text" 
                        required
                        value={citizenContact}
                        onChange={e => {
                          setCitizenContact(e.target.value);
                          setCitizenContactDirty(true);
                        }}
                        onBlur={() => setCitizenContactDirty(true)}
                        placeholder="e.g. +91 98765-43210 or name@example.com"
                        className={`w-full bg-[#17171e]/50 border rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-all ${
                          citizenContactDirty 
                            ? (isContactValid ? 'border-emerald-500/30 focus:border-emerald-500' : 'border-red-500/40 focus:border-red-500 bg-red-500/[0.02]') 
                            : 'border-white/10 focus:border-blue-500'
                        }`}
                      />
                      {citizenContactDirty && !isContactValid && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center space-x-1 animate-fade-in">
                          <span>⚠️ Provide a valid email or phone number (at least 8-18 digits).</span>
                        </p>
                      )}
                      {citizenContactDirty && isContactValid && (
                        <p className="text-[10px] text-emerald-400 mt-1 flex items-center space-x-1 animate-fade-in">
                          <span>✓ Contact method verified.</span>
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Evidence Medium</label>
                        <select
                          value={inputType}
                          onChange={e => setInputType(e.target.value as any)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="text" className="bg-[#09090B]">Text Message / WhatsApp</option>
                          <option value="audio_transcript" className="bg-[#09090B]">Voice Call Transcript</option>
                          <option value="image" className="bg-[#09090B]">SIM/Bill Screenshot Image</option>
                          <option value="pdf" className="bg-[#09090B]">Mock Police Arrest PDF</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">File Attachment Reference</label>
                        <input 
                          type="text" 
                          value={fileName}
                          onChange={e => setFileName(e.target.value)}
                          placeholder="e.g. cyber_threat_recording.wav"
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Audio Recorder Module - Only visible if Medium is set to Voice Call Transcript */}
                    {inputType === 'audio_transcript' && (
                      <div className="bg-blue-950/25 border border-blue-500/20 rounded-xl p-4 space-y-3 animate-fade-in">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
                            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">Citizen Voice Capture</span>
                          </div>
                          {isRecording && (
                            <span className="font-mono text-xs text-red-400 font-bold">
                              {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3">
                          {!isRecording ? (
                            <button
                              type="button"
                              onClick={startRecording}
                              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all shadow-md shadow-red-900/20 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5 animate-pulse" />
                              <span>Record Suspect Call</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="px-4 py-2 bg-slate-750 border border-red-500/30 hover:bg-slate-700 text-red-400 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all animate-pulse cursor-pointer"
                            >
                              <div className="w-2.5 h-2.5 bg-red-500 rounded-sm" />
                              <span>Stop Recording</span>
                            </button>
                          )}

                          {recordedAudioUrl && !isRecording && (
                            <button
                              type="button"
                              disabled={transcribing}
                              onClick={handleTranscribeRecordedAudio}
                              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-900 disabled:to-indigo-900 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all shadow-md shadow-blue-900/30 cursor-pointer"
                            >
                              {transcribing ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Converting...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                                  <span>Speech to Text (AI)</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {recordedAudioUrl && (
                          <div className="bg-black/40 rounded-lg p-2 flex items-center justify-between border border-white/5">
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                              {fileName || "audio_incident.webm"}
                            </span>
                            <audio src={recordedAudioUrl} controls className="h-6 max-w-[180px] bg-transparent text-xs" />
                          </div>
                        )}
                        <p className="text-[9px] text-slate-400 italic">
                          💡 Speak into your microphone simulating a threat call (or voice report) then hit "Speech to Text" to convert it verbatim using our AI pipeline.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                        Incident Evidence Contents (Paste transcription or threat messages here)
                      </label>
                      <textarea 
                        required
                        rows={5}
                        value={rawInput}
                        onChange={e => {
                          setRawInput(e.target.value);
                          setRawInputDirty(true);
                        }}
                        onBlur={() => setRawInputDirty(true)}
                        placeholder="Paste details of how the scammers threatened you, names of fake police departments, bank names, or wire demands..."
                        className={`w-full bg-[#17171e]/50 border rounded-lg p-3 text-xs text-white focus:outline-none transition-all font-mono leading-relaxed ${
                          rawInputDirty 
                            ? (isRawInputValid ? 'border-emerald-500/30 focus:border-emerald-500' : 'border-red-500/40 focus:border-red-500 bg-red-500/[0.02]') 
                            : 'border-white/10 focus:border-blue-500'
                        }`}
                      />
                      <div className="flex justify-between items-center mt-1">
                        <div>
                          {rawInputDirty && !isRawInputValid && (
                            <p className="text-[10px] text-red-400 flex items-center space-x-1 animate-fade-in">
                              <span>⚠️ Missing concrete context (minimum 25 characters required).</span>
                            </p>
                          )}
                          {rawInputDirty && isRawInputValid && (
                            <p className="text-[10px] text-emerald-400 flex items-center space-x-1 animate-fade-in">
                              <span>✓ Input detail contains sufficient context.</span>
                            </p>
                          )}
                        </div>
                        <p className={`text-[9px] font-mono tracking-wider ${isRawInputValid ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                          {rawInput.trim().length} / 25 min chars
                        </p>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isProcessing}
                      className={`w-full py-3 text-xs font-bold rounded-lg transition-all uppercase tracking-wider shadow-lg flex items-center justify-center space-x-2 ${
                        isProcessing 
                          ? 'bg-blue-800 text-white' 
                          : (!isFormValid && (citizenNameDirty || citizenContactDirty || rawInputDirty)
                            ? 'bg-red-950/45 hover:bg-red-950/60 border border-red-500/20 text-red-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                          )
                      }`}
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{processingStatus}</span>
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5" />
                          <span>Submit to National AI Firewall</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Forensic Analysis Panel */}
              <div className="col-span-12 lg:col-span-7 bg-[#121217] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-[#17171E] flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-white tracking-tight flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      <span>Security Forensic Console</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Live extraction audit logs map to national telecom database</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {/* Audio Alert Controls */}
                    <div className="flex items-center space-x-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-inner">
                      <button
                        type="button"
                        onClick={() => {
                          const nextMute = !isAudioMuted;
                          setIsAudioMuted(nextMute);
                          showToast(
                            nextMute
                              ? "P0 sirens muted."
                              : "P0 sirens active!",
                            "success"
                          );
                        }}
                        className={`p-1 rounded transition-all ${
                          isAudioMuted 
                            ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                        title={isAudioMuted ? "Unmute P0 Audio Alerts" : "Mute P0 Audio Alerts"}
                      >
                        {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          playP0WarningSound();
                          showToast("Simulating P0 emergency alert siren!", "success");
                        }}
                        className="bg-blue-600/10 border border-blue-500/25 hover:bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono text-[8px] font-bold transition-all uppercase tracking-wider"
                        title="Simulate / Test P0 Emergency Siren"
                      >
                        Test Alert
                      </button>
                    </div>

                    {/* Automated Triage Toggle Switch */}
                    <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-inner">
                      <div className="flex flex-col text-right font-mono">
                        <span className="text-[7.5px] uppercase text-purple-400 font-bold tracking-wider flex items-center justify-end">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5 text-purple-400 animate-pulse" />
                          AI Core
                        </span>
                        <span className="text-[9px] text-slate-300 font-bold whitespace-nowrap">Automated Triage</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAutomatedTriage(!isAutomatedTriage);
                          showToast(
                            !isAutomatedTriage
                              ? "AI Automated Triage Enabled! Sorting by severity."
                              : "Automated Triage Disabled. Sorting chronologically.",
                            "success"
                          );
                        }}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex items-center cursor-pointer ${
                          isAutomatedTriage ? 'bg-purple-600' : 'bg-slate-700'
                        }`}
                        title="Toggle AI Automated Triage & Priority Sorting"
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                            isAutomatedTriage ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 font-mono">
                      {complaints.length} Cases Loaded
                    </span>
                  </div>
                </div>

                {/* Sub layout containing recent list on left + detailed outcome view */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-[500px]">
                  
                  {/* Internal list under forensic console */}
                  <div className="md:col-span-5 border-r border-white/5 flex flex-col overflow-y-auto bg-black/20">
                    <div className="p-3 border-b border-white/5 flex items-center bg-[#17171E]/50">
                      <div className="relative w-full">
                        <input
                          type="text"
                          placeholder="Search logged reports..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full bg-white/[0.02] border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      </div>
                    </div>

                    <div className="flex-1 divide-y divide-white/5">
                      {sortedComplaints.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          <Info className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                          <p className="text-xs">No recorded incidents match search parameters.</p>
                        </div>
                      ) : (
                        sortedComplaints.map(c => {
                          const isSelected = selectedComplaint?.id === c.id;
                          const riskColor = c.analysis?.riskScore && c.analysis.riskScore > 80 
                            ? 'text-red-400 bg-red-500/10 border-red-500/25' 
                            : 'text-orange-400 bg-orange-500/10 border-orange-500/25';
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedComplaint(c);
                                // If tab view changes, synchronize node selection for intelligence correlation
                                const matchingVictimNode = nodes.find(n => n.id.includes(c.citizenName.replace(/\s+/g, '')));
                                if (matchingVictimNode) {
                                  setSelectedNode(matchingVictimNode);
                                }
                              }}
                              className={`w-full p-4.5 text-left transition-all relative block ${isSelected ? 'bg-blue-600/10 border-r-2 border-r-blue-400' : 'hover:bg-white/[0.02]'}`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <div className="text-xs font-bold text-white truncate max-w-[130px]">
                                  {c.citizenName}
                                </div>
                                <div className="flex flex-col items-end space-y-1">
                                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${riskColor}`}>
                                    {c.analysis?.riskScore || 0}% RISK
                                  </span>
                                  {isAutomatedTriage && (
                                    <span className={`text-[7.5px] font-mono font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                                      (c.analysis?.riskScore || 0) >= 90 ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse' :
                                      (c.analysis?.riskScore || 0) >= 75 ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                                      (c.analysis?.riskScore || 0) >= 45 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    }`}>
                                      AI: {
                                        (c.analysis?.riskScore || 0) >= 90 ? 'P0 - CRIT' :
                                        (c.analysis?.riskScore || 0) >= 75 ? 'P1 - HIGH' :
                                        (c.analysis?.riskScore || 0) >= 45 ? 'P2 - MED' :
                                        'P3 - LOW'
                                      }
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2 font-mono">
                                {c.rawInput}
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-slate-500">
                                <span className="flex items-center space-x-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>{new Date(c.timestamp).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                                <span className="text-slate-400 italic">
                                  Medium: {c.inputType.toUpperCase()}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Incident full review content */}
                  <div className="md:col-span-7 p-6 overflow-y-auto flex flex-col space-y-4">
                    {selectedComplaint ? (
                      <>
                        {/* Title block */}
                        <div className="border-b border-white/5 pb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20 tracking-wider font-bold">
                              {selectedComplaint.analysis?.classification.toUpperCase() || 'SUSPICIOUS'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{selectedComplaint.id}</span>
                          </div>
                          <h3 className="text-lg font-bold text-white tracking-tight">{selectedComplaint.citizenName} Contact Analysis</h3>
                          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span>{selectedComplaint.citizenContact}</span>
                          </p>
                        </div>

                        {/* Text Content */}
                        <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Submitted Raw Content</span>
                          <p className="text-xs font-mono text-[#D4D4D8] leading-relaxed whitespace-pre-wrap">{selectedComplaint.rawInput}</p>
                        </div>

                        {selectedComplaint.analysis ? (
                          <div className="space-y-4.5">
                            {isAutomatedTriage && (
                              <div className="bg-purple-950/20 border border-purple-500/20 p-3 rounded-xl flex items-center justify-between text-left">
                                <div className="flex items-center space-x-2.5">
                                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                                  <div>
                                    <span className="text-[8.5px] text-purple-300 font-mono font-bold uppercase tracking-widest block">AI Triage Classification</span>
                                    <span className="text-xs text-slate-300 font-medium">
                                      Priority Tier: <strong className={
                                        (selectedComplaint.analysis.riskScore || 0) >= 90 ? 'text-red-400 font-bold' :
                                        (selectedComplaint.analysis.riskScore || 0) >= 75 ? 'text-orange-400 font-bold' :
                                        (selectedComplaint.analysis.riskScore || 0) >= 45 ? 'text-yellow-400 font-bold' :
                                        'text-slate-400 font-bold'
                                      }>
                                        {
                                          (selectedComplaint.analysis.riskScore || 0) >= 90 ? 'P0 - CRITICAL RESPONSE REQUIRED' :
                                          (selectedComplaint.analysis.riskScore || 0) >= 75 ? 'P1 - HIGH PRIORITY INVESTIGATION' :
                                          (selectedComplaint.analysis.riskScore || 0) >= 45 ? 'P2 - GENERAL SUSPICIOUS ACTIVITY' :
                                          'P3 - LOW PRIORITY / INFORMATION ONLY'
                                        }
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border uppercase tracking-wider ${
                                  (selectedComplaint.analysis.riskScore || 0) >= 90 ? 'bg-red-500/10 text-red-400 border-red-500/40 animate-pulse' :
                                  (selectedComplaint.analysis.riskScore || 0) >= 75 ? 'bg-orange-500/10 text-orange-400 border-orange-500/40' :
                                  (selectedComplaint.analysis.riskScore || 0) >= 45 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40' :
                                  'bg-slate-500/10 text-slate-400 border-slate-500/30'
                                }`}>
                                  {
                                    (selectedComplaint.analysis.riskScore || 0) >= 90 ? 'CRITICAL' :
                                    (selectedComplaint.analysis.riskScore || 0) >= 75 ? 'HIGH' :
                                    (selectedComplaint.analysis.riskScore || 0) >= 45 ? 'MEDIUM' :
                                    'LOW'
                                  }
                                </span>
                              </div>
                            )}

                            {/* Confidence indicators */}
                            <div className="grid grid-cols-2 gap-3.5">
                              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest block">AI Threat Score</span>
                                <div className="flex justify-between items-end mt-1">
                                  <span className="text-xl font-bold font-mono text-red-400">
                                    {selectedComplaint.analysis.riskScore}%
                                  </span>
                                  <span className="text-[9.5px] text-red-500/60 font-semibold uppercase font-mono">CRITICAL THREAT</span>
                                </div>
                              </div>
                              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest block">System Confidence</span>
                                <div className="flex justify-between items-end mt-1">
                                  <span className="text-xl font-bold font-mono text-emerald-400">
                                    {selectedComplaint.analysis.confidence}%
                                  </span>
                                  <span className="text-[9.5px] text-emerald-500/60 font-semibold uppercase font-mono">VERIFIED DATA</span>
                                </div>
                              </div>
                            </div>

                            {/* Reasoning */}
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                              <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wide block mb-1">M.O. Assessment & Reasoning</span>
                              <p className="text-xs text-slate-300 leading-relaxed font-mono">{selectedComplaint.analysis.reasoning}</p>
                            </div>

                            {/* Red Flags */}
                            <div>
                              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider block mb-2">Primary Red Flags Flagged</span>
                              <div className="space-y-1.5">
                                {selectedComplaint.analysis.redFlags.map((flag, idx) => (
                                  <div key={idx} className="flex items-start space-x-2 text-xs text-slate-300">
                                    <span className="text-red-500 font-bold font-mono mt-0.5">•</span>
                                    <span className="font-mono">{flag}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Extracted Entities Table - Core network identifiers */}
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2.5">
                                Extracted Fraud Indicators
                              </span>
                              <div className="grid grid-cols-2 gap-3.5 text-xs text-left">
                                <div className="bg-black/30 p-2.5 rounded border border-white/5">
                                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">Calling Gateway</span>
                                  <span className="text-white font-mono block mt-1 font-bold">
                                    {selectedComplaint.analysis.entities.phones.join(', ') || 'No numbers logged'}
                                  </span>
                                </div>
                                <div className="bg-black/30 p-2.5 rounded border border-white/5">
                                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">UPI Escrows</span>
                                  <span className="text-blue-400 font-mono block mt-1 font-bold">
                                    {selectedComplaint.analysis.entities.upis.join(', ') || 'No UPI channels extracted'}
                                  </span>
                                </div>
                                <div className="bg-black/30 p-2.5 rounded border border-white/5">
                                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">Bank Accounts</span>
                                  <span className="text-orange-400 font-mono block mt-1 font-bold truncate">
                                    {selectedComplaint.analysis.entities.bankAccounts.join(', ') || 'No accounts mapped'}
                                  </span>
                                </div>
                                <div className="bg-black/30 p-2.5 rounded border border-white/5">
                                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">Target Authority</span>
                                  <span className="text-slate-200 font-mono block mt-1 font-semibold truncate">
                                    {selectedComplaint.analysis.entities.agencies.join(', ') || 'General impersonator'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Citizens Care Advisor Guidelines */}
                            <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-2.5 flex items-center space-x-1.5">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Emergency Citizen Action Guidelines</span>
                              </span>
                              <ul className="space-y-2 text-xs text-slate-300 font-mono">
                                {selectedComplaint.analysis.citizenGuidelines.map((g, idx) => (
                                  <li key={idx} className="flex items-start space-x-2">
                                    <span className="text-emerald-500 font-bold">✓</span>
                                    <span>{g}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Police draft container */}
                            <div className="bg-blue-600/5 p-4.5 rounded-xl border border-blue-500/20">
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block flex items-center space-x-1.5 font-mono">
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>Prefilled Police Complaint Form</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(selectedComplaint.analysis?.policeComplaintDraft || '')}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold rounded flex items-center space-x-1 transition-colors uppercase font-mono tracking-wider"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Draft</span>
                                </button>
                              </div>
                              <pre className="text-[10px] font-mono text-[#D4D4D8] leading-relaxed bg-[#0F0F13] p-3 rounded-lg border border-white/5 overflow-x-auto whitespace-pre-wrap">
                                {selectedComplaint.analysis.policeComplaintDraft}
                              </pre>
                            </div>
                          </div>
                        ) : (
                          <div className="p-6 text-center text-slate-500 italic">No forensic analysis profile parsed.</div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                        <Shield className="w-12 h-12 text-slate-600 mb-2 animate-pulse" />
                        <p className="text-sm font-semibold">Security console idle</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">Please log a new complaint report or select one of the existing records on the left directory to run deep telemetry extraction.</p>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            </>
          )}

          {/* 2. FRAUD NETWORK GRAPH INTELLIGENCE TAB */}
          {activeTab === 'network' && (
            <div className="col-span-12 grid grid-cols-12 gap-6 shrink-0">
              
              {/* Interactive Graph Display Screen */}
              <div className="col-span-12 lg:col-span-8 bg-[#0C0C0F] border border-white/10 rounded-2xl flex flex-col overflow-hidden relative shadow-2xl min-h-[550px]">
                <div className="p-4 border-b border-white/5 bg-[#121217] flex justify-between items-center z-10">
                  <div>
                    <h2 className="font-bold text-white tracking-tight flex items-center space-x-2">
                      <Network className="w-4 h-4 text-blue-500" />
                      <span>Fraud Network Intelligence Graph</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Relational money laundry communities, gateway proxies, and mastermind nodes</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setSelectedCommunity(null)}
                      className={`text-[10px] py-1 px-2.5 rounded border transition-colors ${selectedCommunity === null ? 'bg-blue-600/20 text-blue-400 border-blue-500/30 font-bold' : 'bg-transparent text-slate-400 border-white/10 hover:text-white'}`}
                    >
                      All Clusters
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedCommunity(1);
                        handleTriggerClusterAudit(1);
                      }}
                      className={`text-[10px] py-1 px-2.5 rounded border transition-colors ${selectedCommunity === 1 ? 'bg-blue-600/20 text-blue-400 border-blue-500/30 font-bold' : 'bg-transparent text-slate-400 border-white/10 hover:text-white'}`}
                    >
                      Ring #1 (Bengaluru)
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedCommunity(2);
                        handleTriggerClusterAudit(2);
                      }}
                      className={`text-[10px] py-1 px-2.5 rounded border transition-colors ${selectedCommunity === 2 ? 'bg-blue-600/20 text-blue-400 border-blue-500/30 font-bold' : 'bg-transparent text-slate-400 border-white/10 hover:text-white'}`}
                    >
                      Ring #2 (SBI Extort)
                    </button>
                    
                    {/* View mode toggle: Force Graph / Geo Threat Map */}
                    <div className="flex bg-black/40 border border-white/10 rounded p-0.5 space-x-0.5">
                      <button
                        type="button"
                        onClick={() => setIsMapView(false)}
                        className={`text-[9.5px] py-0.5 px-2 rounded font-mono uppercase tracking-wider transition-all cursor-pointer ${!isMapView ? 'bg-blue-600/30 text-blue-400 font-bold border border-blue-500/30' : 'text-slate-400 border border-transparent hover:text-white'}`}
                        title="Show Force-Directed Relation Graph"
                      >
                        Relation Graph
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMapView(true)}
                        className={`text-[9.5px] py-0.5 px-2 rounded font-mono uppercase tracking-wider transition-all cursor-pointer ${isMapView ? 'bg-emerald-600/30 text-emerald-400 font-bold border border-emerald-500/30' : 'text-slate-400 border border-transparent hover:text-white'}`}
                        title="Show Transnational Geographical Threat Map"
                      >
                        Geo Threat Map
                      </button>
                    </div>

                    {/* D3 Forensic Threat Thermal Heatmap Switch */}
                    <button 
                      type="button"
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      className={`text-[10px] py-1 px-2.5 rounded border flex items-center space-x-1 transition-all cursor-pointer ${showHeatmap ? 'bg-red-950/40 text-red-400 border-red-500/40 font-semibold shadow-md shadow-red-950/40 animate-pulse' : 'bg-transparent text-slate-400 border-white/10 hover:text-white'}`}
                      title="Toggle D3 Forensic Threat Thermal Heatmap Overlay"
                    >
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span>Heatmap {showHeatmap ? 'ON' : 'OFF'}</span>
                    </button>

                    <button 
                      onClick={fetchGraph}
                      className="p-1 px-2 text-slate-400 border border-white/5 rounded hover:text-white hover:bg-white/5 transition-colors"
                      title="Reload Matrix"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* SVG Graph Area */}
                <div ref={containerRef} className="flex-1 relative bg-[radial-gradient(circle_at_center,_#1A1A24_0%,_#0C0C0F_70%)] flex items-center justify-center p-4 overflow-hidden select-none">
                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                  
                  {/* Graph Canvas / Geographical Threat Map Switch */}
                  {!isMapView ? (
                    <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible pointer-events-auto">
                      <g transform={zoomTransform.toString()}>
                        {/* Render Threat Heatmap Overlay (D3 Based) */}
                        {showHeatmap && (() => {
                          const heatmapColorScale = d3.scaleLinear<string>()
                            .domain([0, 35, 70, 100])
                            .range(['#10B981', '#EAB308', '#F97316', '#EF4444']);

                          const activeClusterIds = Array.from(new Set(nodes.map(n => n.community)))
                            .filter(c => c !== undefined && c !== null);

                          const clusters = activeClusterIds.map(commId => {
                            const commNodes = nodes.filter(n => n.community === commId);
                            if (commNodes.length === 0) return null;

                            const cx = d3.mean<GraphNode>(commNodes, n => n.x ?? 0) ?? 0;
                            const cy = d3.mean<GraphNode>(commNodes, n => n.y ?? 0) ?? 0;
                            const avgRisk = d3.mean<GraphNode>(commNodes, n => n.riskScore) ?? 0;
                            const maxSpread = Math.max(...commNodes.map(n => {
                              const dx = (n.x ?? 0) - cx;
                              const dy = (n.y ?? 0) - cy;
                              return Math.sqrt(dx * dx + dy * dy);
                            }), 60);

                            const frequencyScore = commNodes.filter(n => n.riskScore >= 50).length;

                            return {
                              id: commId,
                              cx,
                              cy,
                              avgRisk,
                              frequency: frequencyScore,
                              spread: Math.max(80, maxSpread * 1.3),
                              nodeCount: commNodes.length
                            };
                          }).filter(Boolean) as Array<{
                            id: number;
                            cx: number;
                            cy: number;
                            avgRisk: number;
                            frequency: number;
                            spread: number;
                            nodeCount: number;
                          }>;

                          return (
                            <g id="d3-threat-heatmap-layer" className="pointer-events-none opacity-60 transition-opacity">
                              {/* Macro Cluster Heat Haloes */}
                              {clusters.map(cluster => {
                                const isDimmed = selectedCommunity !== null && cluster.id !== selectedCommunity;
                                const themeColor = heatmapColorScale(cluster.avgRisk);
                                
                                return (
                                  <g 
                                    key={`cluster-heat-${cluster.id}`} 
                                    className="transition-all duration-500 animate-pulse"
                                    opacity={isDimmed ? 0.05 : 1}
                                    style={{ pointerEvents: isDimmed ? 'none' : 'auto' }}
                                  >
                                    {/* Outer Thermal Diffusion Band */}
                                    <circle
                                      cx={cluster.cx}
                                      cy={cluster.cy}
                                      r={cluster.spread * 1.25}
                                      fill={themeColor}
                                      opacity={0.06}
                                    />
                                    {/* Mid Thermal Boundary Band */}
                                    <circle
                                      cx={cluster.cx}
                                      cy={cluster.cy}
                                      r={cluster.spread * 0.7}
                                      fill={themeColor}
                                      opacity={0.11}
                                    />
                                    {/* Core Intensity Thermal Hotspot */}
                                    <circle
                                      cx={cluster.cx}
                                      cy={cluster.cy}
                                      r={cluster.spread * 0.3}
                                      fill={themeColor}
                                      opacity={0.19}
                                    />
                                  </g>
                                );
                              })}

                              {/* Micro Localized Thermal Flares */}
                              {nodes.map(node => {
                                if (node.riskScore < 30) return null;
                                const isDimmed = selectedCommunity !== null && node.community !== selectedCommunity && node.id !== 'N-Ghost';
                                const nodeColor = heatmapColorScale(node.riskScore);
                                const glowRadius = node.riskScore * 0.5 + 15;

                                return (
                                  <circle
                                    key={`micro-flare-${node.id}`}
                                    cx={node.x}
                                    cy={node.y}
                                    r={glowRadius}
                                    fill={nodeColor}
                                    opacity={isDimmed ? 0.02 : 0.18}
                                    className="transition-all duration-500"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                );
                              })}
                            </g>
                          );
                        })()}

                        {/* Render Edges */}
                        {edges.map((edge) => {
                          const srcNode = nodes.find(n => n.id === edge.source);
                          const tarNode = nodes.find(n => n.id === edge.target);

                          if (!srcNode || !tarNode) return null;

                          // Filter/dim based on community selection
                          const isDimmed = selectedCommunity !== null && (srcNode.community !== selectedCommunity && tarNode.community !== selectedCommunity);

                          // Dynamic line style
                          const isHighRisk = edge.type === 'scammed' || edge.type === 'controlled_by';
                          let strokeColor = '#3B82F6'; // Default blue
                          if (edge.type === 'scammed') strokeColor = '#EF4444'; // Red
                          if (edge.type === 'transferred_to') strokeColor = '#F97316'; // Orange
                          if (edge.type === 'controlled_by') strokeColor = '#A855F7'; // Purple

                          // Hover highlighting logic
                          const isDirectlyConnected = hoveredNode && (edge.source === hoveredNode.id || edge.target === hoveredNode.id);
                          const isAnyNodeHovered = hoveredNode !== null;

                          let strokeWidth = isHighRisk ? 2.5 : 1.5;
                          if (isAnyNodeHovered) {
                            strokeWidth = isDirectlyConnected ? (isHighRisk ? 4 : 3) : 0.8;
                          }

                          let opacity = selectedCommunity !== null ? (isDimmed ? 0.05 : 1) : 0.65;
                          if (isAnyNodeHovered) {
                            opacity = isDirectlyConnected ? 1.0 : (isDimmed ? 0.02 : 0.15);
                          }

                          return (
                            <g 
                              key={edge.id} 
                              className="transition-all duration-500"
                              style={{ pointerEvents: isDimmed ? 'none' : 'auto' }}
                            >
                              <line
                                x1={srcNode.x}
                                y1={srcNode.y}
                                x2={tarNode.x}
                                y2={tarNode.y}
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeDasharray={edge.type === 'associated_with' ? "4" : undefined}
                                className="transition-all duration-500"
                                opacity={opacity}
                              />
                              {/* Label on edge hover middle point */}
                              <title>{edge.type.toUpperCase().replace('_', ' ')}</title>
                            </g>
                          );
                        })}

                        {/* Render Nodes */}
                        {nodes.map((node) => {
                          const isDimmed = selectedCommunity !== null && node.community !== selectedCommunity && node.id !== 'N-Ghost';

                          const isSelected = selectedNode?.id === node.id;
                          
                          // Hover highlighting logic for nodes
                          const isDirectlyConnectedNode = !hoveredNode || (
                            node.id === hoveredNode.id || 
                            edges.some(e => 
                              (e.source === hoveredNode.id && e.target === node.id) || 
                              (e.target === hoveredNode.id && e.source === node.id)
                            )
                          );
                          
                          let nodeOpacity = isDimmed ? 0.08 : 1.0;
                          if (hoveredNode !== null) {
                            nodeOpacity = isDirectlyConnectedNode ? (isDimmed ? 0.35 : 1.0) : (isDimmed ? 0.02 : 0.25);
                          }

                          // Node visuals depending on role
                          let nodeColor = '#3B82F6'; // Info blue
                          let nodeRadius = 8;
                          let animPulse = false;

                          if (node.type === 'mastermind') {
                            nodeColor = '#F43F5E'; // Crimson red
                            nodeRadius = 14;
                            animPulse = true;
                          } else if (node.type === 'victim') {
                            nodeColor = '#10B981'; // Mint Green
                            nodeRadius = 9;
                          } else if (node.type === 'mule') {
                            nodeColor = '#D946EF'; // Pink Mule
                            nodeRadius = 11;
                            animPulse = true;
                          } else if (node.type === 'bank_account') {
                            nodeColor = '#F97316'; // Orange Ledger
                            nodeRadius = 10;
                          } else if (node.type === 'phone' || node.type === 'upi') {
                            nodeColor = '#EAB308'; // Warning Yellow
                            nodeRadius = 8;
                          }

                          return (
                            <g 
                              key={node.id} 
                              transform={`translate(${node.x || 0}, ${node.y || 0})`}
                              onClick={() => {
                                if (isDimmed) return; // Prevent clicking dimmed nodes
                                setSelectedNode(node);
                                setNodeCustomNotes(node.customNotes || '');
                              }}
                              onMouseEnter={(e) => {
                                if (isDimmed) return;
                                setHoveredNode(node);
                                if (containerRef.current) {
                                  const rect = containerRef.current.getBoundingClientRect();
                                  setHoveredNodePos({
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                  });
                                }
                              }}
                              onMouseMove={(e) => {
                                if (isDimmed) return;
                                if (containerRef.current) {
                                  const rect = containerRef.current.getBoundingClientRect();
                                  setHoveredNodePos({
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                  });
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredNode(null);
                                setHoveredNodePos(null);
                              }}
                              opacity={nodeOpacity}
                              style={{ pointerEvents: isDimmed ? 'none' : 'auto' }}
                              className="cursor-pointer group transition-all duration-500"
                            >
                              {/* Pulsing ring for high risk elements */}
                              {animPulse && (
                                <circle
                                  r={nodeRadius + 8}
                                  fill="none"
                                  stroke={nodeColor}
                                  strokeWidth="1.5"
                                  className="animate-ping opacity-25 pointer-events-none"
                                />
                              )}

                              {/* Outer highlight ring for active clicks */}
                              <circle
                                r={nodeRadius + (isSelected ? 5 : 3)}
                                fill="none"
                                stroke={isSelected ? '#FFFFFF' : 'transparent'}
                                strokeWidth="1.5"
                                className="transition-all"
                              />

                              {/* Inner core circle */}
                              <circle
                                r={nodeRadius}
                                fill={nodeColor}
                                className="transition-all shadow-xl group-hover:scale-125"
                              />

                              {/* Simplified human-readable icon identifiers inside nodes */}
                              <text
                                y={nodeRadius + 14}
                                textAnchor="middle"
                                fill="#FFFFFF"
                                fontSize="9px"
                                fontWeight="bold"
                                className="font-mono tracking-tight pointer-events-none drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] opacity-90"
                              >
                                {node.label.split(' ')[0]}
                              </text>

                              {/* Type indicators inside larger nodes */}
                              {nodeRadius >= 11 && (
                                <text
                                  y="3"
                                  textAnchor="middle"
                                  fill="#000000"
                                  fontSize="8px"
                                  fontWeight="black"
                                  className="pointer-events-none font-bold"
                                >
                                  {node.type === 'mastermind' ? '♛' : 'M'}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  ) : (() => {
                    const projectCoordinates = (lat?: number, lng?: number) => {
                      const minLng = 65;
                      const maxLng = 110;
                      const minLat = 5;
                      const maxLat = 38;

                      const actualLat = lat ?? 20;
                      const actualLng = lng ?? 78;

                      const x = ((actualLng - minLng) / (maxLng - minLng)) * 800;
                      const y = (1 - (actualLat - minLat) / (maxLat - minLat)) * 500;
                      return { x, y };
                    };

                    const indiaPoints = [
                      { lat: 35.5, lng: 74.5 },
                      { lat: 31.0, lng: 78.0 },
                      { lat: 28.0, lng: 80.0 },
                      { lat: 27.5, lng: 88.0 },
                      { lat: 28.5, lng: 94.0 },
                      { lat: 23.5, lng: 91.5 },
                      { lat: 22.0, lng: 89.0 },
                      { lat: 17.5, lng: 83.3 },
                      { lat: 13.0, lng: 80.2 },
                      { lat: 8.1, lng: 77.3 },
                      { lat: 12.0, lng: 75.0 },
                      { lat: 15.5, lng: 73.8 },
                      { lat: 19.0, lng: 72.8 },
                      { lat: 23.0, lng: 68.5 },
                      { lat: 24.5, lng: 70.0 },
                      { lat: 30.5, lng: 73.5 },
                      { lat: 34.0, lng: 73.5 }
                    ];

                    const projectedIndiaPoints = indiaPoints.map(p => {
                      const { x, y } = projectCoordinates(p.lat, p.lng);
                      return `${x},${y}`;
                    }).join(' ');

                    const seaPoints = [
                      { lat: 25.0, lng: 96.0 },
                      { lat: 22.0, lng: 104.5 },
                      { lat: 20.5, lng: 106.0 },
                      { lat: 16.0, lng: 108.0 },
                      { lat: 11.0, lng: 109.0 },
                      { lat: 8.5, lng: 104.5 },
                      { lat: 11.5, lng: 103.0 },
                      { lat: 12.5, lng: 99.8 },
                      { lat: 7.0, lng: 100.0 },
                      { lat: 10.0, lng: 98.5 },
                      { lat: 16.0, lng: 97.5 },
                      { lat: 20.0, lng: 92.5 },
                      { lat: 22.0, lng: 92.0 }
                    ];

                    const projectedSEAPoints = seaPoints.map(p => {
                      const { x, y } = projectCoordinates(p.lat, p.lng);
                      return `${x},${y}`;
                    }).join(' ');

                    const backgroundCities = [
                      { name: "New Delhi", lat: 28.6139, lng: 77.2090 },
                      { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
                      { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
                      { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
                      { name: "Chennai", lat: 13.0827, lng: 80.2707 },
                      { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
                      { name: "Phnom Penh", lat: 11.5564, lng: 104.9282 },
                      { name: "Yangon", lat: 16.8661, lng: 96.1951 },
                      { name: "Bangkok", lat: 13.7563, lng: 100.5018 }
                    ];

                    const slCenter = projectCoordinates(7.8, 80.7);

                    return (
                      <svg viewBox="0 0 800 500" className="absolute inset-0 w-full h-full overflow-visible pointer-events-auto select-none">
                        <defs>
                          <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                          </radialGradient>
                        </defs>

                        {/* Coordinate Grid lines */}
                        <g opacity="0.1">
                          {[10, 20, 30].map(lat => {
                            const p1 = projectCoordinates(lat, 65);
                            const p2 = projectCoordinates(lat, 110);
                            return (
                              <g key={`lat-${lat}`}>
                                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="3 3" />
                                <text x={10} y={p1.y - 3} fill="#3b82f6" fontSize="7px" className="font-mono">{lat}°N</text>
                              </g>
                            );
                          })}
                          {[70, 80, 90, 100].map(lng => {
                            const p1 = projectCoordinates(5, lng);
                            const p2 = projectCoordinates(38, lng);
                            return (
                              <g key={`lng-${lng}`}>
                                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="3 3" />
                                <text x={p1.x + 3} y={490} fill="#3b82f6" fontSize="7px" className="font-mono">{lng}°E</text>
                              </g>
                            );
                          })}
                        </g>

                        {/* Country outlines */}
                        <polygon
                          points={projectedIndiaPoints}
                          fill="#3b82f6"
                          fillOpacity="0.02"
                          stroke="#3b82f6"
                          strokeOpacity="0.15"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                        <polygon
                          points={projectedSEAPoints}
                          fill="#10b981"
                          fillOpacity="0.02"
                          stroke="#10b981"
                          strokeOpacity="0.15"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                        <ellipse
                          cx={slCenter.x}
                          cy={slCenter.y}
                          rx={8}
                          ry={12}
                          fill="#3b82f6"
                          fillOpacity="0.01"
                          stroke="#3b82f6"
                          strokeOpacity="0.1"
                          strokeWidth="0.7"
                          strokeDasharray="2 2"
                        />

                        {/* Static city points */}
                        {backgroundCities.map((c, idx) => {
                          const { x, y } = projectCoordinates(c.lat, c.lng);
                          return (
                            <g key={`bgcity-${idx}`} opacity="0.3">
                              <circle cx={x} cy={y} r="1.5" fill="#94a3b8" />
                              <text x={x + 4} y={y + 2.5} fill="#64748b" fontSize="6px" className="font-mono select-none pointer-events-none">{c.name}</text>
                            </g>
                          );
                        })}

                        {/* Mastermind Radar Rings */}
                        {(() => {
                          const mastermind = nodes.find(n => n.id === 'N-Ghost');
                          if (!mastermind) return null;
                          const mCoord = projectCoordinates(mastermind.lat, mastermind.lng);
                          return (
                            <g className="pointer-events-none">
                              <circle cx={mCoord.x} cy={mCoord.y} r="100" fill="url(#radar-glow)" />
                              <circle cx={mCoord.x} cy={mCoord.y} r="50" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2 2" fill="none" opacity="0.2" className="animate-ping" style={{ animationDuration: '5s' }} />
                              <circle cx={mCoord.x} cy={mCoord.y} r="90" stroke="#ef4444" strokeWidth="0.4" fill="none" opacity="0.1" className="animate-pulse" />
                            </g>
                          );
                        })()}

                        {/* Curved geographical link edges */}
                        {edges.map((edge) => {
                          const srcNode = nodes.find(n => n.id === edge.source);
                          const tarNode = nodes.find(n => n.id === edge.target);

                          if (!srcNode || !tarNode) return null;

                          if (selectedCommunity !== null && (srcNode.community !== selectedCommunity && tarNode.community !== selectedCommunity)) {
                            return null;
                          }

                          const p1 = projectCoordinates(srcNode.lat, srcNode.lng);
                          const p2 = projectCoordinates(tarNode.lat, tarNode.lng);

                          const dx = p2.x - p1.x;
                          const dy = p2.y - p1.y;
                          const dr = Math.sqrt(dx * dx + dy * dy);

                          if (dr === 0) return null;

                          const mx = (p1.x + p2.x) / 2;
                          const my = (p1.y + p2.y) / 2;
                          const px = -dy / dr;
                          const py = dx / dr;
                          const offset = Math.min(60, dr * 0.15);

                          const cx = mx + px * offset;
                          const cy = my + py * offset;

                          let strokeColor = '#3B82F6';
                          if (edge.type === 'scammed') strokeColor = '#EF4444';
                          if (edge.type === 'transferred_to') strokeColor = '#F97316';
                          if (edge.type === 'controlled_by') strokeColor = '#A855F7';

                          // Hover highlighting logic
                          const isDirectlyConnected = hoveredNode && (edge.source === hoveredNode.id || edge.target === hoveredNode.id);
                          const isAnyNodeHovered = hoveredNode !== null;

                          let strokeWidth = edge.type === 'controlled_by' ? 1.8 : 1;
                          if (isAnyNodeHovered) {
                            strokeWidth = isDirectlyConnected ? (edge.type === 'controlled_by' ? 3.5 : 2.5) : 0.6;
                          }

                          let opacity = selectedCommunity !== null ? 0.85 : 0.4;
                          if (isAnyNodeHovered) {
                            opacity = isDirectlyConnected ? 1.0 : 0.1;
                          }

                          return (
                            <g key={`map-edge-${edge.id}`} className="transition-all duration-200" opacity={opacity}>
                              <path
                                d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeDasharray={edge.type === 'associated_with' ? "3 3" : undefined}
                                className="transition-all duration-200"
                              />
                              <circle r="2" fill={strokeColor === '#EF4444' ? '#FFAAAA' : '#FFFFFF'} className="opacity-80">
                                <animateMotion
                                  dur="4.5s"
                                  repeatCount="indefinite"
                                  path={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
                                />
                              </circle>
                            </g>
                          );
                        })}

                        {/* Nodes with custom icons and labels */}
                        {nodes.map((node) => {
                          if (selectedCommunity !== null && node.community !== selectedCommunity && node.id !== 'N-Ghost') {
                            return null;
                          }

                          const { x, y } = projectCoordinates(node.lat, node.lng);
                          const isSelected = selectedNode?.id === node.id;

                          // Hover highlighting logic for nodes
                          const isDirectlyConnectedNode = !hoveredNode || (
                            node.id === hoveredNode.id || 
                            edges.some(e => 
                              (e.source === hoveredNode.id && e.target === node.id) || 
                              (e.target === hoveredNode.id && e.source === node.id)
                            )
                          );
                          
                          let nodeOpacity = 1;
                          if (hoveredNode !== null) {
                            nodeOpacity = isDirectlyConnectedNode ? 1.0 : 0.25;
                          }

                          let nodeColor = '#10B981';
                          if (node.type === 'victim') nodeColor = '#3B82F6';
                          if (node.type === 'mastermind') nodeColor = '#EF4444';
                          if (node.type === 'mule') nodeColor = '#A855F7';
                          if (node.type === 'bank_account') nodeColor = '#F97316';
                          if (node.type === 'phone') nodeColor = '#EAB308';
                          if (node.type === 'upi') nodeColor = '#EC4899';
                          if (node.type === 'agency') nodeColor = '#64748B';

                          const nodeRadius = node.type === 'mastermind' ? 7.5 : (node.type === 'victim' || node.type === 'mule' ? 6 : 4.5);

                          return (
                            <g
                              key={`map-node-${node.id}`}
                              transform={`translate(${x}, ${y})`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNode(node);
                                setNodeCustomNotes(node.customNotes || '');
                              }}
                              onMouseEnter={(e) => {
                                setHoveredNode(node);
                                if (containerRef.current) {
                                  const rect = containerRef.current.getBoundingClientRect();
                                  setHoveredNodePos({
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                  });
                                }
                              }}
                              onMouseMove={(e) => {
                                if (containerRef.current) {
                                  const rect = containerRef.current.getBoundingClientRect();
                                  setHoveredNodePos({
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                  });
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredNode(null);
                                setHoveredNodePos(null);
                              }}
                              opacity={nodeOpacity}
                              className="group cursor-pointer animate-fade-in transition-all duration-200"
                            >
                              {isSelected && (
                                <circle
                                  r={nodeRadius + 6}
                                  fill="none"
                                  stroke="#FFFFFF"
                                  strokeWidth="1"
                                  className="animate-ping"
                                  style={{ animationDuration: '2.5s' }}
                                />
                              )}

                              <circle
                                r={nodeRadius + 3}
                                fill="none"
                                stroke={nodeColor}
                                strokeWidth="0.8"
                                className="opacity-0 group-hover:opacity-50 transition-opacity animate-pulse"
                              />

                              <circle
                                r={nodeRadius}
                                fill={nodeColor}
                                stroke={isSelected ? '#FFFFFF' : '#000000'}
                                strokeWidth={isSelected ? 1.2 : 0.8}
                                className="transition-all group-hover:scale-125"
                              />

                              <text
                                y={nodeRadius + 9}
                                textAnchor="middle"
                                fill="#FFFFFF"
                                fontSize="7.5px"
                                fontWeight="bold"
                                className="font-mono pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] select-none opacity-80 group-hover:opacity-100 transition-opacity"
                              >
                                {node.label.split(' ')[0]}
                              </text>

                              <text
                                y={nodeRadius + 17}
                                textAnchor="middle"
                                fill="#94a3b8"
                                fontSize="6.5px"
                                className="font-mono pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] opacity-0 group-hover:opacity-100 transition-all duration-300"
                              >
                                {node.locationName || 'Unknown Loc'}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}

                  {/* Informative Map Overlays */}
                  <div className="absolute bottom-4 left-4 bg-[#121217]/90 backdrop-blur-md p-3.5 border border-white/10 rounded-xl max-w-xs shadow-2xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center space-x-1">
                      <Shield className="w-3.5 h-3.5 text-red-400" />
                      <span>Inferred Threat Mastermind</span>
                    </div>
                    <div className="text-xs text-white font-mono font-bold">Cambodian Core Server Desk</div>
                    <p className="text-[9.5px] text-red-400 mt-1 leading-normal font-mono">
                      VoIP calling proxies & automatic Binance crypto conversion routers traces back to Sihanoukville SEZ complex.
                    </p>
                  </div>

                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm p-3 border border-white/5 rounded-lg text-[10px] font-mono select-none pointer-events-none">
                    <div className="text-slate-400 font-bold mb-1 col-span-1">Node Type Guide:</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span>Victims</span></div>
                      <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /><span>Mastermind</span></div>
                      <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-fuchsia-500" /><span>Mule Accs</span></div>
                      <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /><span>Bank Vault</span></div>
                      <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /><span>Calling Px</span></div>
                    </div>
                  </div>

                  {/* Floating Dynamic Heatmap Stats & Spectrum Legend Overlay */}
                  {showHeatmap && (() => {
                    const avgRisk = d3.mean<GraphNode>(nodes, n => n.riskScore) || 0;
                    const hostileNodes = nodes.filter(n => n.riskScore >= 70).length;
                    
                    const clusterMetrics = Array.from(new Set(nodes.map(n => n.community)))
                      .filter(c => c !== undefined && c !== null)
                      .map(commId => {
                        const commNodes = nodes.filter(n => n.community === commId);
                        const meanRisk = d3.mean<GraphNode>(commNodes, n => n.riskScore) || 0;
                        const freq = commNodes.length;
                        return { commId, meanRisk, freq };
                      });

                    return (
                      <div className="absolute bottom-4 right-4 bg-[#121217]/95 backdrop-blur-md p-3.5 border border-red-500/20 rounded-xl w-[220px] shadow-2xl space-y-2 select-none z-10">
                        <div className="text-[10px] uppercase tracking-wider text-red-400 font-bold flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                          <span>D3 Threat Heatmap</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-mono text-slate-400">
                            <span>Avg Severity:</span>
                            <span className="text-red-400 font-bold">{Math.round(avgRisk)}%</span>
                          </div>
                          <div className="flex justify-between text-[9px] font-mono text-slate-400">
                            <span>Heat Hotspots:</span>
                            <span className="text-white font-bold">{hostileNodes} nodes</span>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-2 space-y-1 text-[8.5px]">
                          <div className="uppercase font-bold text-slate-500 tracking-widest text-[7.5px] pb-0.5">Calculated Cluster Density</div>
                          {clusterMetrics.map(item => (
                            <div key={`stat-comm-${item.commId}`} className="flex justify-between items-center font-mono text-slate-300">
                              <span className="text-slate-400 truncate max-w-[120px]">
                                {item.commId === 1 ? 'Ring #1 (Bengaluru)' : (item.commId === 2 ? 'Ring #2 (SBI Extort)' : `Cluster #${item.commId}`)}
                              </span>
                              <span className="flex items-center space-x-1 font-bold">
                                <span className="text-[7.5px] text-slate-500">({item.freq}x)</span>
                                <span className={item.meanRisk >= 75 ? 'text-red-500' : (item.meanRisk >= 40 ? 'text-orange-400' : 'text-blue-400')}>
                                  {Math.round(item.meanRisk)}%
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-white/5 pt-1.5">
                          <div className="flex justify-between text-[7.5px] text-slate-500 font-mono mb-1">
                            <span>0% (Safe)</span>
                            <span>100% (Hostile)</span>
                          </div>
                          <div className="h-1 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 opacity-90" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Interactive Node Tooltip */}
                  {hoveredNode && hoveredNodePos && (
                    <div
                      className="absolute pointer-events-none z-50 bg-[#0F0F16]/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl text-xs w-56 flex flex-col gap-1.5 transition-all duration-75"
                      style={{
                        left: containerRef.current && hoveredNodePos.x + 240 > containerRef.current.clientWidth
                          ? `${hoveredNodePos.x - 240}px`
                          : `${hoveredNodePos.x + 15}px`,
                        top: containerRef.current && hoveredNodePos.y + 160 > containerRef.current.clientHeight
                          ? `${hoveredNodePos.y - 160}px`
                          : `${hoveredNodePos.y + 15}px`,
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                        <span className="font-mono text-[9px] text-slate-400 uppercase tracking-wider">
                          {hoveredNode.type.replace('_', ' ')}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[8.5px] font-bold ${
                          hoveredNode.riskScore >= 80 ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          hoveredNode.riskScore >= 50 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          Risk: {hoveredNode.riskScore}%
                        </span>
                      </div>
                      
                      <div className="font-semibold text-white text-xs">
                        {hoveredNode.label}
                      </div>
                      
                      {hoveredNode.locationName && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="text-slate-500">📍</span> {hoveredNode.locationName}
                        </div>
                      )}

                      {hoveredNode.details && (
                        <div className="text-[10px] text-slate-400 italic line-clamp-2 mt-0.5 border-t border-white/5 pt-1.5">
                          {hoveredNode.details}
                        </div>
                      )}
                      
                      <div className="text-[9px] text-slate-500 font-mono mt-1 flex items-center justify-between">
                        <span>ID: {hoveredNode.id}</span>
                        {hoveredNode.community && <span>Ring #{hoveredNode.community}</span>}
                      </div>
                    </div>
                  )}

                  {/* Zoom and Navigation Controls */}
                  {!isMapView && (
                    <div id="graph-zoom-controls" className="absolute top-4 right-4 flex flex-col bg-[#121217]/95 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-2xl z-20 space-y-1 select-none">
                      <button
                        id="btn-zoom-in"
                        onClick={handleZoomIn}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        id="btn-zoom-out"
                        onClick={handleZoomOut}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <div className="border-t border-white/5 my-1" />
                      <button
                        id="btn-zoom-reset"
                        onClick={handleResetZoom}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        title="Reset View"
                      >
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom console Stream Log conforming to Sleek UI design */}
                <div className="h-20 bg-[#121217] border-t border-white/5 p-4 flex items-center space-x-6 overflow-x-auto shrink-0 select-none">
                  <div className="flex-shrink-0">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Forensic stream</div>
                    <div className="text-xs text-emerald-400 font-mono flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping mr-1"></span>
                      <span>MONITORING_UPI_TRANSACTIONS</span>
                    </div>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10 shrink-0"></div>
                  <div className="flex space-x-4 overflow-hidden truncate">
                    <div className="text-[10px] text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                      [LOG] UPI_MATCH: cbi-escrow@paytm linked to ICICI 451009827364
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                      [WARN] SPAM_CORRELATION: Spoofing patterns matching Indo-Cambodian gateway Ring (Cluster 1)
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded border border-white/5 whitespace-nowrap">
                      [INFO] INTEL_SYNC: Refreshed national blacklisted numbers list on sbi-mumbaibar
                    </div>
                  </div>
                </div>
              </div>

              {/* Node Inspector & Crime Ring Analysis summary on Right of Network Tab */}
              <div className="col-span-12 lg:col-span-4 flex flex-col space-y-6">
                
                {/* Node details */}
                <div className="bg-[#121217] border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col">
                  <div className="border-b border-white/5 pb-3.5 mb-4">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <h3 className="font-bold text-white tracking-tight">Node Integrity Inspector</h3>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Click any node inside the network canvas to audit digital details</p>
                  </div>

                  {selectedNode ? (
                    <div className="space-y-4 font-mono text-xs">
                      {/* Identification / Type Header with Status Indicator */}
                      <div className="bg-black/30 p-3 rounded-lg border border-white/5 text-left flex justify-between items-start">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold">Node Identification</div>
                          <div className="text-white font-bold text-sm mt-0.5">{selectedNode.label}</div>
                          <div className="text-[9.5px] text-slate-400 mt-0.5 uppercase">Type: {selectedNode.type}</div>
                        </div>
                        {/* Interactive Status Selector (direct PUT save) */}
                        <div className="flex flex-col items-end">
                          <label className="text-[8px] text-slate-500 block uppercase mb-1 font-bold">Status</label>
                          <select 
                            value={selectedNode.status || 'active'}
                            onChange={(e) => updateSelectedNodeFields(selectedNode.id, { status: e.target.value as any })}
                            className="bg-[#121217] border border-white/10 text-slate-300 text-[10px] py-1 px-1.5 rounded focus:outline-none focus:border-blue-500 cursor-pointer font-bold uppercase transition"
                          >
                            <option value="active">🔴 Active</option>
                            <option value="monitored">🟡 Monitored</option>
                            <option value="frozen">❄️ Frozen</option>
                            <option value="trusted">🟢 Trusted</option>
                          </select>
                        </div>
                      </div>

                      {/* Cluster IDs & Risk Severity metrics */}
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="bg-white/5 p-2.5 rounded-lg border border-white/5 text-left">
                          <span className="text-[9px] text-slate-500 block uppercase">Cluster ID</span>
                          <span className="text-white font-bold block mt-1">Ring {selectedNode.community}</span>
                        </div>
                        <div className="bg-white/5 p-2.5 rounded-lg border border-white/5 text-left">
                          <span className="text-[9px] text-slate-500 block uppercase">Risk Severity</span>
                          <div className="flex items-center space-x-2 mt-1">
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              value={selectedNode.riskScore}
                              onChange={(e) => updateSelectedNodeFields(selectedNode.id, { riskScore: parseInt(e.target.value) })}
                              className="w-16 accent-red-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                              title="Slide to adjust intelligence risk manually"
                            />
                            <span className={`font-bold ${selectedNode.riskScore > 80 ? 'text-red-400' : 'text-slate-200'}`}>
                              {selectedNode.riskScore}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Extracted Case Logs */}
                      <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-left">
                        <span className="text-[9px] text-slate-500 uppercase block font-bold mb-1">Telecommunication/Laundering Case Logs</span>
                        <p className="text-slate-300 leading-normal text-xs">{selectedNode.details}</p>
                      </div>

                      {/* Interactive Custom Tags Section (Persistence) */}
                      <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-left space-y-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] text-slate-500 uppercase font-bold">Investigator Tags</span>
                          <span className="text-[8px] text-slate-500">Click tag to remove</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 min-h-[22px]">
                          {(selectedNode.tags || []).length > 0 ? (
                            (selectedNode.tags || []).map((tag, idx) => (
                              <button
                                key={`tag-${idx}`}
                                onClick={() => {
                                  const updatedTags = (selectedNode.tags || []).filter(t => t !== tag);
                                  updateSelectedNodeFields(selectedNode.id, { tags: updatedTags });
                                }}
                                className="bg-blue-900/40 text-blue-300 hover:bg-red-950/40 hover:text-red-300 border border-blue-500/30 text-[9px] py-0.5 px-2 rounded-full cursor-pointer transition-colors"
                              >
                                {tag} &times;
                              </button>
                            ))
                          ) : (
                            <span className="text-[9.5px] text-slate-500 italic">No investigator tag overlays.</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 mt-2">
                          <input 
                            type="text"
                            placeholder="Add tag (e.g. Mule, Spoofer)..."
                            value={nodeTagInput}
                            onChange={(e) => setNodeTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && nodeTagInput.trim()) {
                                e.preventDefault();
                                const currentTags = selectedNode.tags || [];
                                if (!currentTags.includes(nodeTagInput.trim())) {
                                  updateSelectedNodeFields(selectedNode.id, { tags: [...currentTags, nodeTagInput.trim()] });
                                }
                                setNodeTagInput('');
                              }
                            }}
                            className="bg-black/40 border border-white/10 text-slate-200 text-[10px] py-1 px-2 rounded-lg flex-1 outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (nodeTagInput.trim()) {
                                const currentTags = selectedNode.tags || [];
                                if (!currentTags.includes(nodeTagInput.trim())) {
                                  updateSelectedNodeFields(selectedNode.id, { tags: [...currentTags, nodeTagInput.trim()] });
                                }
                                setNodeTagInput('');
                              }
                            }}
                            className="bg-white/10 hover:bg-white/15 px-2 py-1 rounded text-[10px] text-slate-300 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Persistent Custom Case Notes Section (investigator notes) */}
                      <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-left space-y-2">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-bold">Investigator Case Journal (Persisted)</span>
                          {nodeUpdateStatus === 'saving' && (
                            <span className="text-[8.5px] text-blue-400 animate-pulse">Saving...</span>
                          )}
                          {nodeUpdateStatus === 'saved' && (
                            <span className="text-[8.5px] text-emerald-400">Journal saved ✔</span>
                          )}
                          {nodeUpdateStatus === 'error' && (
                            <span className="text-[8.5px] text-red-400">Save failed ❌</span>
                          )}
                        </div>
                        <textarea
                          placeholder="Type cyber evidence, bank ledger numbers, tracking progress, physical localization status..."
                          value={nodeCustomNotes}
                          onChange={(e) => setNodeCustomNotes(e.target.value)}
                          className="bg-black/30 border border-white/5 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg w-full h-[65px] h-min-[65px] resize-none outline-none focus:border-blue-500 font-sans"
                        />
                        <button
                          type="button"
                          onClick={() => updateSelectedNodeFields(selectedNode.id, { customNotes: nodeCustomNotes })}
                          className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 text-[10px] py-1 rounded-md font-semibold transition"
                        >
                          Commit Journal Update
                        </button>
                      </div>

                      {/* AI Deep Forensic Audit (AI Enrichment & Cache) */}
                      <div className="bg-purple-950/20 border border-purple-500/20 p-3.5 rounded-xl text-left space-y-2 relative overflow-hidden">
                        {/* Background glowing circle */}
                        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-purple-500/5 rounded-full pointer-events-none blur-xl" />
                        
                        <div className="flex items-center justify-between border-b border-purple-500/10 pb-2">
                          <div className="flex items-center space-x-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[9.5px] text-purple-300 font-bold uppercase tracking-wider">AI Cyber-Threat Decryptor</span>
                          </div>
                          
                          {selectedNode.lastAuditedByAI && (
                            <span className="text-[7.5px] bg-purple-900/50 border border-purple-500/30 text-purple-300 font-bold py-0.5 px-1.5 rounded uppercase">
                              AUDITED
                            </span>
                          )}
                        </div>

                        {selectedNode.lastAuditedByAI ? (
                          <div className="space-y-2">
                            <div className="bg-black/40 border border-white/5 p-2 rounded max-h-[140px] overflow-y-auto text-[9px] leading-relaxed text-[#D8B4FE] whitespace-pre-wrap font-sans">
                              {selectedNode.lastAuditedByAI}
                            </div>
                            <button
                              type="button"
                              disabled={isAuditingNode}
                              onClick={() => runAiNodeAudit(selectedNode)}
                              className="w-full bg-gradient-to-r from-purple-800 to-indigo-800 hover:from-purple-700 hover:to-indigo-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-1 px-2 rounded font-mono text-[9px] flex items-center justify-center space-x-1 uppercase transition"
                            >
                              {isAuditingNode ? (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin mr-1" />
                                  <span>Decrypting suspect patterns...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  <span>Re-Run AI Deep Forensic Audit</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="py-2 text-center space-y-2">
                            <p className="text-[9.5px] text-slate-400">No active AI tactical scanning dossier cached for this entity.</p>
                            <button
                              type="button"
                              disabled={isAuditingNode}
                              onClick={() => runAiNodeAudit(selectedNode)}
                              className="w-full bg-gradient-to-r from-purple-800 to-indigo-800 hover:from-purple-700 hover:to-indigo-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center justify-center space-x-1.5 uppercase transition shadow-lg shadow-purple-900/20"
                            >
                              {isAuditingNode ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                  <span>Decrypting nodes & routing...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-purple-300 animate-pulse" />
                                  <span>🚨 Run AI Threat Decryptor</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-500 bg-black/10 rounded-xl border border-dashed border-white/10">
                      <Info className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p className="text-xs">No Node active.</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] mx-auto">Please click on any colored circle link element inside the network card to populate credentials.</p>
                    </div>
                  )}
                </div>

                {/* Tactical AI Policing cluster report generator */}
                <div className="bg-[#121217] border border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-between">
                  <div>
                    <div className="border-b border-white/5 pb-3.5 mb-4">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4 text-purple-400" />
                        <h3 className="font-bold text-white tracking-tight">Dynamic Cyber Tactical Report</h3>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">National cyber intelligence dispatch for active crime communities</p>
                    </div>

                    {clusterReport ? (
                      <div className="bg-black/30 border border-white/5 p-3.5 rounded-lg text-left overflow-y-auto max-h-[280px]">
                        <pre className="text-[9.5px] font-mono text-[#E4E4E7] leading-relaxed whitespace-pre-wrap">{clusterReport}</pre>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500 text-xs bg-black/10 rounded-xl border border-dashed border-white/10">
                        <AlertTriangle className="w-7 h-7 mx-auto text-slate-600 mb-2" />
                        <span>Tactical report idle.</span>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[220px] mx-auto">Click Ring #1 or Ring #2 tabs at the top of the graph canvas to generate AI police intelligence briefs.</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={selectedCommunity === null}
                      onClick={() => handleTriggerClusterAudit(selectedCommunity || 1)}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[11px] font-bold rounded-lg transition-all uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-lg shadow-blue-600/10"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Dispatch Intelligence Summary</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. INCIDENT VAULT & AUDIT LOG TAB */}
          {activeTab === 'vault' && (
            <div className="col-span-12 bg-[#121217] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col overflow-hidden min-h-[550px]">
              <div className="border-b border-white/5 pb-4 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <h2 className="font-bold text-white text-lg tracking-tight flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <span>Scam Incident Vault & Forensic Logs</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Official repository logging cyber threat evidence, mock Skype transcripts, and telecom fraud lists</p>
                </div>
                
                <div className="mt-3 md:mt-0 flex items-center space-x-3 w-full md:w-auto">
                  <div className="relative flex-1 md:flex-none">
                    <input
                      type="text"
                      placeholder="Search vault items..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full md:w-64"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  </div>
                  <button 
                    onClick={fetchComplaints}
                    className="p-1.5 text-slate-400 border border-white/10 rounded hover:text-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Grid table showing complaints logged */}
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] font-bold uppercase text-slate-400 leading-normal font-mono">
                      <th className="py-3 px-4">Case Token</th>
                      <th className="py-3 px-4">Citizen Name</th>
                      <th className="py-3 px-4">Origin Contact</th>
                      <th className="py-3 px-4">Evidence Modality</th>
                      <th className="py-3 px-4 text-center">Threat Classification</th>
                      {isAutomatedTriage && <th className="py-3 px-4 text-center text-purple-400 font-bold">AI Triage Level</th>}
                      <th className="py-3 px-4 text-center">Threat Risk Score</th>
                      <th className="py-3 px-4">Processed Timestamp</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-300 font-mono">
                    {sortedComplaints.length === 0 ? (
                      <tr>
                        <td colSpan={isAutomatedTriage ? 9 : 8} className="py-8 text-center text-slate-500">
                          No complaints cataloged in database ledgers.
                        </td>
                      </tr>
                    ) : (
                      sortedComplaints.map(c => {
                        const classColor = c.analysis?.classification === 'Digital Arrest Scam' 
                           ? 'text-red-400 bg-red-400/10 border-red-400/20' 
                           : 'text-orange-400 bg-orange-400/10 border-orange-400/20';
                        return (
                          <tr key={c.id} className="hover:bg-white/[0.01] transition-colors">
                            <td className="py-3.5 px-4 text-white font-bold">{c.id}</td>
                            <td className="py-3.5 px-4 font-sans font-semibold">{c.citizenName}</td>
                            <td className="py-3.5 px-4 text-slate-400">{c.citizenContact}</td>
                            <td className="py-3.5 px-4">
                              <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono uppercase text-[9.5px]">
                                {c.inputType}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${classColor}`}>
                                {c.analysis?.classification || 'Suspicious'}
                              </span>
                            </td>
                            {isAutomatedTriage && (
                              <td className="py-3.5 px-4 text-center">
                                <span className={`px-2.5 py-1 rounded text-[9px] font-bold border uppercase tracking-wider ${
                                  (c.analysis?.riskScore || 0) >= 90 ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse' :
                                  (c.analysis?.riskScore || 0) >= 75 ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                                  (c.analysis?.riskScore || 0) >= 45 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                                  'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                  {
                                    (c.analysis?.riskScore || 0) >= 90 ? '🔥 P0 - CRIT' :
                                    (c.analysis?.riskScore || 0) >= 75 ? '⚡ P1 - HIGH' :
                                    (c.analysis?.riskScore || 0) >= 45 ? '⚠️ P2 - MED' :
                                    '🛡️ P3 - LOW'
                                  }
                                </span>
                              </td>
                            )}
                            <td className="py-3.5 px-4 text-center font-bold font-mono">
                              <span className={c.analysis?.riskScore && c.analysis.riskScore > 85 ? 'text-red-400' : 'text-orange-400'}>
                                {c.analysis?.riskScore || 0}%
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-[10px]">
                              {new Date(c.timestamp).toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedComplaint(c);
                                  setActiveTab('shield');
                                }}
                                className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600 border border-blue-500/20 hover:text-white text-blue-400 hover:border-blue-500 text-[10px] font-bold rounded transition-all uppercase"
                              >
                                View Forensics
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. ADVANCED AI INTEL COPILOT & FORENSICS LAB TAB */}
          {activeTab === 'intel' && (
            <div className="col-span-12 grid grid-cols-12 gap-6 animate-fade-in">
              
              {/* Main Co-Pilot Terminal (7 Columns) */}
              <div className="col-span-12 lg:col-span-7 bg-[#121217] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col justify-between min-h-[640px]">
                
                {/* Copilot Header controls */}
                <div className="border-b border-white/5 pb-4 mb-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <h2 className="font-bold text-white text-base tracking-tight flex items-center space-x-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        <span>AI Tactical Intelligence Co-Pilot</span>
                      </h2>
                      <p className="text-[10px] text-slate-400 mt-0.5">Dual conversational/visual threat extraction matching the national safety logs</p>
                    </div>

                    {/* Chat Settings Preset Selector */}
                    <div className="flex items-center space-x-2 w-full md:w-auto">
                      <div className="flex flex-col">
                        <label className="text-[8px] uppercase tracking-wider text-slate-500 font-mono mb-1 font-bold">Select Active Persona</label>
                        <select
                          value={chatPersona}
                          onChange={(e) => setChatPersona(e.target.value as any)}
                          className="bg-black/50 border border-white/10 text-slate-300 text-[10.5px] rounded px-2 py-1 focus:outline-none focus:border-blue-500 font-mono"
                        >
                          <option value="forensics">👮 Lead Forensics Officer</option>
                          <option value="crisis">🎗️ Crisis Support Advisor</option>
                          <option value="audit">🪙 Financial Auditor</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Operational Settings Ribbon */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3.5 mt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Model Selector */}
                      <div className="flex flex-col">
                        <span className="text-[7.5px] uppercase text-slate-500 font-mono font-bold mb-0.5">Operational Model</span>
                        <select
                          value={chatModel}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setChatModel(val);
                            if (val !== 'gemini-3.1-pro-preview') {
                              setHighReasoning(false);
                            }
                          }}
                          className="bg-black/60 border border-white/10 text-white font-mono text-[10px] rounded px-2 py-0.5"
                        >
                          <option value="gemini-3.1-pro-preview">🤖 gemini-3.1-pro-preview (Forensic-Class)</option>
                          <option value="gemini-3.5-flash">⚡ gemini-3.5-flash (General-Class)</option>
                          <option value="gemini-3.1-flash-lite">⚡ gemini-3.1-flash-lite (Ultra-Fast)</option>
                        </select>
                      </div>

                      {/* Low-Latency Badge */}
                      {chatModel === 'gemini-3.1-flash-lite' && (
                        <div className="flex items-center space-x-1.5 mt-2.5 sm:mt-0 font-mono text-[9px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded animate-pulse">
                          <span>FAST RESPONDER ENGAGED</span>
                        </div>
                      )}
                    </div>

                    {/* Active High Reasoning / Thinking Toggle */}
                    <div className="flex items-center space-x-2">
                      <div className="flex flex-col text-right">
                        <span className="text-[7.5px] uppercase text-slate-500 font-mono font-bold">Deep Thinker Module</span>
                        <span className="text-[9.5px] text-slate-300 font-semibold font-sans">Active High Reasoning</span>
                      </div>
                      <button
                        type="button"
                        disabled={chatModel !== 'gemini-3.1-pro-preview'}
                        onClick={() => setHighReasoning(!highReasoning)}
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                          highReasoning && chatModel === 'gemini-3.1-pro-preview' ? 'bg-emerald-500' : 'bg-slate-700'
                        } disabled:opacity-35 disabled:cursor-not-allowed`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                            highReasoning && chatModel === 'gemini-3.1-pro-preview' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Conversation Thread Area */}
                <div className="flex-1 overflow-y-auto mb-4 border border-white/5 rounded-xl bg-black/40 p-4 space-y-4 max-h-[460px] min-h-[380px] custom-scrollbar">
                  {chatMessages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const activePers = PERSONAS[chatPersona];
                    return (
                      <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                        <div className={`max-w-[85%] flex space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                          
                          {/* Avatar icon */}
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm flex-shrink-0">
                            {isUser ? '👤' : activePers.avatar}
                          </div>

                          {/* Message content block */}
                          <div className="flex flex-col">
                            <div className={`p-3.5 rounded-2xl text-xs leading-relaxed text-left font-sans ${
                              isUser 
                                ? 'bg-blue-600/20 text-blue-100 border border-blue-500/30 rounded-tr-none' 
                                : 'bg-[#18181E] text-slate-200 border border-white/5 rounded-tl-none shadow-md'
                            }`}>
                              {/* Simple Markdown/text parser formatting block */}
                              <div className="whitespace-pre-wrap font-sans text-slate-100">
                                {msg.text}
                              </div>
                            </div>
                            
                            {/* Metadata under each message */}
                            <div className={`flex items-center space-x-2 mt-1 text-[9px] text-slate-500 font-mono ${isUser ? 'justify-end' : 'justify-start'}`}>
                              <span>{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              {!isUser && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-400 capitalize">{msg.persona || 'assistant'} Co-Pilot</span>
                                  {msg.modelUsed && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-400">{msg.modelUsed}</span>
                                    </>
                                  )}
                                  {msg.highReasoning && (
                                    <>
                                      <span className="text-amber-400 bg-amber-400/5 px-1 py-0.5 rounded font-bold">DEEP_THINK_ENGAGED</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat input box */}
                <form onSubmit={handleSendChatMessage} className="flex gap-2.5 items-center">
                  <input
                    type="text"
                    disabled={chatLoading}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Query your active safety co-pilot: "${PERSONAS[chatPersona].name}"...`}
                    className="flex-1 bg-black/60 border border-white/10 text-xs text-white rounded-lg px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={chatMessages.length === 0}
                    onClick={handleExportChatPDF}
                    className="px-4 py-3 bg-slate-850 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-emerald-400 border border-white/10 rounded-lg transition-all uppercase tracking-wider font-mono shrink-0 flex items-center space-x-1.5 cursor-pointer hover:border-emerald-500/20"
                    title="Export Dialog Logs as PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export Logs</span>
                  </button>
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all uppercase tracking-wider font-mono shrink-0 flex items-center space-x-1"
                  >
                    {chatLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analysing</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Transmit</span>
                      </>
                    )}
                  </button>
                </form>

              </div>

              {/* Advanced Multimodal Forensics Card (5 Columns) */}
              <div className="col-span-12 lg:col-span-5 flex flex-col space-y-6">
                
                {/* Image analyzer card */}
                <div className="bg-[#121217] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col">
                  <div className="border-b border-white/5 pb-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <h3 className="font-bold text-white tracking-tight text-sm">Visual Evidence Forensic Parser</h3>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                      Upload Skype screens, fake CBI warrants, court orders, or SMS threads to extract evidence indicators instantly. Powered by **gemini-3.1-pro-preview**.
                    </p>
                  </div>

                  {/* Drag and Drop Box Area complying to user instructions */}
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`border border-dashed rounded-xl p-6 text-center transition-all cursor-pointer bg-black/20 ${
                      visualImage ? 'border-emerald-500/30' : 'border-white/10 hover:border-slate-400 hover:bg-black/40'
                    }`}
                  >
                    {visualImage ? (
                      <div className="space-y-3">
                        {/* Selected image preview */}
                        <div className="relative inline-block max-w-[120px] max-h-[120px] overflow-hidden rounded-lg border border-white/10 shadow-lg">
                          <img 
                            src={visualImage} 
                            alt="Forensic Artifact Preview"
                            referrerPolicy="no-referrer" 
                            className="w-full object-cover" 
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVisualImage('');
                              setVisualAnalysis('');
                            }}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 border border-white/10 shadow-md text-xs cursor-pointer"
                            title="Remove visual"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[10.5px] text-emerald-400 font-mono">Image artifact loaded successfully [{visualMimeType}]</p>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer space-y-2">
                        <Upload className="w-8 h-8 text-slate-500 animate-pulse" />
                        <div>
                          <span className="text-xs font-semibold text-white block">File Drag-and-Drop</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">or click standard browser dialogue</span>
                        </div>
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={handleImageFileChange} 
                        />
                      </label>
                    )}
                  </div>

                  {/* Custom Prompt Box to allow editing task */}
                  {visualImage && (
                    <div className="mt-3.5 text-left">
                      <label className="text-[8.5px] uppercase tracking-wider text-slate-500 font-mono font-bold block mb-1">Custom Forensic Instructions</label>
                      <textarea
                        value={visualPrompt}
                        onChange={(e) => setVisualPrompt(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10.5px] text-slate-300 font-sans focus:outline-none focus:border-blue-500"
                        rows={2}
                      />

                      <button
                        type="button"
                        onClick={handleAnalyzeVisualEvidence}
                        disabled={visualLoading}
                        className="w-full mt-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg uppercase tracking-wider font-mono flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-600/15"
                      >
                        {visualLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Extracting Threat Matrix...</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Analyze Image Evidence</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Visual Analysis Output Display Block */}
                  {visualAnalysis && (
                    <div className="bg-black/50 border border-white/5 rounded-xl p-4 mt-4 text-left max-h-[220px] overflow-y-auto">
                      <div className="flex justify-between items-center border-b border-white/10 pb-1.5 mb-2">
                        <span className="text-[8px] uppercase font-mono text-emerald-400 font-bold">Threat Lab OCR Output Report</span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(visualAnalysis);
                              showToast("Forensic image assessment copied!", "success");
                            }}
                            className="text-[9px] text-slate-400 hover:text-white flex items-center space-x-1 font-mono uppercase bg-white/5 px-1.5 py-0.5 rounded border border-white/5 cursor-pointer"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy Report</span>
                          </button>
                          <button
                            onClick={handleExportForensicPDF}
                            className="text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 font-mono uppercase bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/25 cursor-pointer"
                          >
                            <FileText className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Export PDF</span>
                          </button>
                        </div>
                      </div>
                      <pre className="text-[10px] font-mono text-slate-300 leading-normal whitespace-pre-wrap">{visualAnalysis}</pre>
                    </div>
                  )}
                </div>

                {/* Real-time Threat Preset Bento Boxes */}
                <div className="bg-[#121217] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col">
                  <div className="border-b border-white/5 pb-2.5 mb-3 text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                      <span>Pre-verified Summon Presets</span>
                    </span>
                    <p className="text-[9.5px] text-slate-400 mt-0.5 leading-tight">Click on a summon mock below to instantly load and run pro visual parsing.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    
                    {/* Preset 1 card */}
                    <div className="bg-[#1C1C24] border border-white/5 rounded-lg p-3 text-left flex flex-col justify-between hover:border-blue-500/30 transition-all">
                      <div>
                        <div className="text-[10.5px] font-bold text-white leading-normal">CBI Fake Arrest Notice</div>
                        <p className="text-[9px] text-slate-400 mt-1 leading-normal">Summons claiming narcotics contraband Taiwanese shipments linked to Aadhaar.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Load mock 1x1 base64 pixel png and run immediate analysis
                          const mockBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
                          setVisualMimeType("image/png");
                          setVisualImage(mockBase64);
                          setVisualPrompt("OCR Extract and flag-audit this Central Bureau of Investigation summons letter alleging Taiwanese contraband.");
                          showToast("Loaded CBI summon preset! Running extraction.", "success");
                          // Use a brief timeout to allow react states to flush before starting
                          setTimeout(() => {
                            const btn = document.getElementById('analyze-visual-btn') as HTMLElement;
                            if (btn) btn.click();
                          }, 100);
                        }}
                        className="mt-3.5 w-full py-1 text-center bg-blue-600/10 hover:bg-blue-600 hover:text-white border border-blue-500/20 text-blue-400 font-bold uppercase font-mono text-[9px] rounded transition-all"
                      >
                        Load & Analyze
                      </button>
                    </div>

                    {/* Preset 2 card */}
                    <div className="bg-[#1C1C24] border border-white/5 rounded-lg p-3 text-left flex flex-col justify-between hover:border-blue-500/30 transition-all">
                      <div>
                        <div className="text-[10.5px] font-bold text-white leading-normal">DoT Aadhaar Warning</div>
                        <p className="text-[9px] text-slate-400 mt-1 leading-normal">WhatsApp threat notice from fake DOT officer enforcing 24h escrow deposit rules.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const mockBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
                          setVisualMimeType("image/png");
                          setVisualImage(mockBase64);
                          setVisualPrompt("Perform cyber forensic audit on this Department of Telecommunications alert block threat thread. Check the escrow warning.");
                          showToast("Loaded DoT notice preset! Running extraction.", "success");
                          setTimeout(() => {
                            const btn = document.getElementById('analyze-visual-btn') as HTMLElement;
                            if (btn) btn.click();
                          }, 100);
                        }}
                        className="mt-3.5 w-full py-1 text-center bg-blue-600/10 hover:bg-blue-600 hover:text-white border border-blue-500/20 text-blue-400 font-bold uppercase font-mono text-[9px] rounded transition-all"
                      >
                        Load & Analyze
                      </button>
                    </div>

                  </div>
                </div>

              </div>

              {/* Trigger Target Helper invisible button to click preset */}
              <button
                id="analyze-visual-btn"
                onClick={handleAnalyzeVisualEvidence}
                className="hidden"
              />

            </div>
          )}

        </main>
      </div>
      
    </div>
  );
}
