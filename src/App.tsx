'use client';

/**
 * RoadrunnerParts
 * A premium BOM intelligence dashboard for appliance parts lookup and diagnostics.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ChevronRight,
  X,
  Package,
  Shield,
  ClipboardList,

  CheckCircle2,
  XCircle,
  Star,
  User,
  LogOut,
  MessageSquare,
  AlertCircle,
  Camera,
  Loader2,
  Scan,
  LayoutGrid,
  List as TableIcon,
  Download,
  Printer,
  BrainCircuit,
  Settings,
  Zap,
  ChevronDown,
  MapPin,
  Video,
  FileJson,
  FileSpreadsheet,
  Mic,
  MicOff,
  Send,
  Sparkles
} from 'lucide-react';
import { partsData, Part } from './partsData';


import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";
import { ApplianceDecoder, DecodeResult } from './lib/decoder';
import { computeCurrentMarketValue, ApplianceCondition, ValuationResult } from './lib/valuation';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || "MISSING_API_KEY" });
const decoder = new ApplianceDecoder();

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [bomPassCount, setBomPassCount] = useState(0);

  const dynamicSections = useMemo(() => {
    const source = aiParts.length > 0 ? aiParts : partsData;
    const unique = Array.from(new Set(source.map(p => p.section).filter(Boolean)));
    return unique.sort().slice(0, 6);
  }, [aiParts]);



  // Compatibility state
  const [checkModel, setCheckModel] = useState('');
  const [compatibilityResult, setCompatibilityResult] = useState<{
    isCompatible: boolean;
    suggestions: Part[];
  } | null>(null);



  const [isScanning, setIsScanning] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiParts, setAIParts] = useState<Part[]>([]);
  const [lookupModel, setLookupModel] = useState<string | null>(null);
  const [lookupSerial, setLookupSerial] = useState<string | null>(null);
  const [modelMSRP, setModelMSRP] = useState<number | null>(null);
  const [manufactureInfo, setManufactureInfo] = useState<DecodeResult | null>(null);
  const [applianceCondition, setApplianceCondition] = useState<ApplianceCondition>('good');
  const [valuation, setValuation] = useState<ValuationResult | null>(null);
  const [scanType, setScanType] = useState<'search' | 'compatibility' | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [sortBy, setSortBy] = useState<'id' | 'rating' | 'popularity'>('id');

  // AI Chat & Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [fieldChatMessages, setFieldChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [isFieldChatLoading, setIsFieldChatLoading] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Diagnostics state
  const [diagQuery, setDiagQuery] = useState('');
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [isDiagLoading, setIsDiagLoading] = useState(false);
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [isMainDiagOpen, setIsMainDiagOpen] = useState(false);

  // Video state
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);

  const handleDeepDiagnostic = async (isGlobal = false) => {
    const queryToUse = isGlobal ? diagQuery : diagQuery; // They use the same state for simplicity
    if (!queryToUse) return;
    setIsDiagLoading(true);
    setDiagResult(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Diagnostic Query: ${queryToUse}. 
        Machine Model: ${lookupModel || 'Not Specified (Analyze based on Query)'}. 
        
        As a Master Appliance Engineer, provide:
        1. REASONING: Analyze the symptoms and machine logic.
        2. POTENTIAL FAULTY PARTS: List specific OEM-style parts that are likely failing.
        3. TROUBLESHOOTING STEPS: Detailed, step-by-step instructions for testing and repair.
        4. ERROR CODES: Relevant codes for this specific model series.`,
        config: {
          systemInstruction: "You are a world-class Master Appliance Engineer with 30 years of field experience. Use your deep reasoning to diagnose complex appliance failures. Be precise, technical, and prioritize safety. Use logic to narrow down the most likely failure points.",
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
      });
      setDiagResult(response.text || "No diagnostic results found.");
    } catch (error) {
      console.error(error);
      alert("Diagnostic engine failed. Please try again.");
    } finally {
      setIsDiagLoading(false);
    }
  };

  const handleAILookup = async (modelToSearch?: string, serialToSearch?: string) => {
    const query = modelToSearch || searchTerm;
    if (!query || query.length < 3) return;

    const currentSerial = serialToSearch || lookupSerial;
    const manufactureDate = manufactureInfo?.manufactureYear
      ? `${manufactureInfo.manufactureYear}-${manufactureInfo.timeValue?.value || "01"}`
      : null;

    const existingParts = [...aiParts];
    const existingPartNumbers = existingParts
      .map((p) => (p.partNumber || "").toUpperCase().trim())
      .filter(Boolean);

    const passNumber = existingParts.length > 0 ? bomPassCount + 1 : 1;

    let passInstruction = "";
    if (passNumber === 1) {
      passInstruction = `
INITIAL PASS:
Build the broadest possible OEM BOM for this model.
Return the main assemblies, controls, pumps, motors, valves, boards, panels, hoses, sensors, and serviceable internal components.`;
    } else if (passNumber === 2) {
      passInstruction = `
SECOND PASS:
I already have an initial BOM. Search for MORE parts that were missed.
Focus on:
- internal structure
- brackets
- retainers
- clips
- supports
- shields
- covers
- internal tubing
- sub-harnesses
- wiring
- detailed assembly-specific pieces

DO NOT repeat parts already found unless the part number is different.`;
    } else if (passNumber === 3) {
      passInstruction = `
THIRD PASS:
Go deeper and search for the remaining small service parts and overlooked items.
Focus on:
- screws
- nuts
- bolts
- washers
- spacers
- bushings
- grommets
- springs
- clamps
- seals
- bearings
- pins
- small mounts
- harness connectors
- minor hardware included in exploded diagrams

I need the missing long-tail parts to push toward a complete BOM.`;
    } else {
      passInstruction = `
ADDITIONAL GAP-FILL PASS:
I already have a partial expanded BOM. Search specifically for remaining omitted parts from diagrams, subassemblies, hardware packs, internal supports, and low-visibility service items.
Only return NEW part numbers not already found.`;
    }

    setIsAILoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate an ABSOLUTELY EXHAUSTIVE, MASTER-LEVEL Bill of Materials (BOM) for appliance model: ${query}.
${currentSerial ? `Serial Number: ${currentSerial}` : ""}
${manufactureDate ? `Approximate Manufacture Date: ${manufactureDate}` : ""}

CURRENT PASS NUMBER: ${passNumber}

${passInstruction}

KNOWN PART NUMBERS ALREADY FOUND:
${existingPartNumbers.length > 0 ? existingPartNumbers.join(", ") : "NONE"}

First, identify the Brand and Category.
I require the deepest possible OEM service BOM.
Use REAL OEM part numbers for the identified manufacturer.
Categorize strictly into the provided assembly sections.

CRITICAL:
- Search for missing parts that are NOT already in the known list.
- Prefer exact OEM part numbers.
- Focus on completeness.
- Return only valid serviceable or diagram-listed parts.
- Avoid duplicates of known part numbers.

ALSO:
Use GOOGLE SEARCH to verify the EXACT CURRENT RETAIL PRICE for each part.
For EVERY price provided, specify the source website.
Focus specifically on Encompass.com.
    
Return a JSON object with two keys:
- "parts" (array)
- "modelMSRP" (number, optional if high confidence only).`,
        config: {
          systemInstruction:
            "You are the world's leading Universal Appliance Master Technician and Parts Cataloger. Your task is to maximize BOM completeness across repeated passes while avoiding duplicate part numbers.",
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }],
          responseSchema: {
            type: "OBJECT",
            properties: {
              modelMSRP: { type: "NUMBER" },
              parts: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "NUMBER" },
                    partNumber: { type: "STRING" },
                    description: { type: "STRING" },
                    section: {
                      type: "STRING",
                      enum: sections,
                    },
                    compatibleModels: {
                      type: "ARRAY",
                      items: { type: "STRING" },
                    },
                    avgRating: { type: "NUMBER" },
                    reviewCount: { type: "NUMBER" },
                    price: { type: "NUMBER" },
                    priceSource: { type: "STRING" },
                  },
                  required: [
                    "id",
                    "partNumber",
                    "description",
                    "section",
                    "compatibleModels",
                    "avgRating",
                    "reviewCount",
                    "price",
                    "priceSource",
                  ],
                },
              },
            },
            required: ["parts"],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"parts": []}');
      const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];

      const processedParts = rawParts.map((p: any, idx: number) => ({
        ...p,
        id: p.id > 1000 ? p.id : 10000 + (p.id || idx),
      }));

      const mergedParts = [...existingParts];
      const seen = new Set(
        existingParts
          .map((p) => (p.partNumber || "").toUpperCase().trim())
          .filter(Boolean),
      );

      for (const np of processedParts) {
        const pn = (np.partNumber || "").toUpperCase().trim();
        if (!pn) continue;
        if (!seen.has(pn)) {
          seen.add(pn);
          mergedParts.push(np);
        }
      }

      setAIParts(mergedParts);
      setBomPassCount(passNumber);

      if (parsed.modelMSRP) {
        setModelMSRP(parsed.modelMSRP);

        const currentValue = computeCurrentMarketValue(
          parsed.modelMSRP,
          manufactureInfo?.manufactureYear || null,
          manufactureInfo?.timeValue?.unit === "month"
            ? manufactureInfo.timeValue.value
            : null,
          query,
          manufactureInfo?.brandFamily || "Universal",
          applianceCondition,
        );
        setValuation(currentValue);
      }

      setLookupModel(query.toUpperCase());
      setViewMode("table");
    } catch (error) {
      console.error("AI Lookup failed:", error);
      alert("AI lookup failed. Please try again.");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scanType) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const prompt = scanType === 'search'
        ? "ACT AS A FORENSIC TECH. This is an image of an appliance model tag. Extract the exact OEM Part Number, Model Number (MOD), and Serial Number (SER). BE EXTREMELY PRECISE with alphanumeric characters (e.g., don't confuse '0' and 'O', '1' and 'I'). ALSO look for technical markers: identify 'refrigerant' (e.g. R600a, R134a) and 'features' (e.g. WiFi, SmartThings, Slate finish, Inverter). Return a JSON object with keys: 'partNumber', 'modelNumber', 'serialNumber', 'refrigerant', 'features' (array)."
        : "ACT AS A FORENSIC TECH. This is an image of an appliance model tag. Extract the exact Model Number (MOD) and Serial Number (SER). BE EXTREMELY PRECISE with alphanumeric characters (e.g., don't confuse '0' and 'O', '1' and 'I'). ALSO look for 'refrigerant' and 'features' (WiFi, Smart Diagnosis, etc). Return a JSON object with keys: 'modelNumber', 'serialNumber', 'refrigerant', 'features' (array).";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: file.type, data: base64 } },
          { text: prompt }
        ],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Cloud Vision engine returned an empty response. Check internet connection.");

      const result = JSON.parse(text);
      const model = (result.modelNumber || result.model || '').toString().trim().toUpperCase();
      const serial = (result.serialNumber || result.serial || '').toString().trim().toUpperCase();
      const part = (result.partNumber || result.part || '').toString().trim().toUpperCase();
      const features = result.features || [];
      const refrigerant = result.refrigerant || '';

      if (!model && !serial && !part) {
        throw new Error("Validation Failure: Could not identify Model or Serial number. Ensure the manufacturer tag is well-lit and the text is sharp.");
      }

      if (serial) {
        const decoded = decoder.decode(serial, model, features, refrigerant);
        setManufactureInfo(decoded);
      }

      if (scanType === 'search') {
        if (model) {
          setAIParts([]);
          setBomPassCount(0);
          setSearchTerm(model);
          setLookupModel(model);
          setLookupSerial(serial);
          handleAILookup(model, serial);
        } else if (part) {
          setSearchTerm(part);
        }
      } else {
        setCheckModel(model);
        setTimeout(() => handleCheckCompatibility(model), 100);
      }
    } catch (error) {
      console.error("Forensic OCR failed", error);
      alert(error instanceof Error ? error.message : "Optical analysis failed. Please enter the data manually.");
    } finally {
      setIsScanning(false);
      setScanType(null);
    }
  };


  useEffect(() => {
    if (selectedPart) {
      setCompatibilityResult(null);
      setCheckModel('');
    }
  }, [selectedPart]);

  useEffect(() => {
    if (modelMSRP) {
      const val = computeCurrentMarketValue(
        modelMSRP,
        manufactureInfo?.manufactureYear || null,
        manufactureInfo?.timeValue?.unit === 'month' ? manufactureInfo.timeValue.value : null,
        lookupModel || '',
        manufactureInfo?.brandFamily || 'Universal',
        applianceCondition
      );
      setValuation(val);
    }
  }, [modelMSRP, manufactureInfo, applianceCondition, lookupModel]);

  const handleManufactureRefresh = () => {
    if (lookupSerial) {
      setIsRecalculating(true);
      setTimeout(() => {
        const decoded = decoder.decode(lookupSerial, lookupModel || '');
        setManufactureInfo(decoded);

        if (modelMSRP) {
          const val = computeCurrentMarketValue(
            modelMSRP,
            decoded.manufactureYear,
            decoded.timeValue?.unit === 'month' ? decoded.timeValue.value : null,
            lookupModel || '',
            decoded.brandFamily,
            applianceCondition
          );
          setValuation(val);
        }
        setIsRecalculating(false);
      }, 400); // Small delay for visual impact
    }
  };



  const handleVideoDiagnostic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsVideoLoading(true);
    setVideoResult(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          { inlineData: { mimeType: file.type, data: base64 } },
          {
            text: `Analyze this video of an appliance in failure state. The model is ${lookupModel || 'Whirlpool Washer'}. 
            What sounds, oscillations, or visual errors do you detect? 
            Suggest specific mechanical or electrical root causes based on the video evidence.` }
        ],
        config: {
          systemInstruction: "You are an expert diagnostic engineer specialized in visual and acoustic failure analysis. Analyze the provided video with extreme detail.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
      setVideoResult(response.text || "Video analysis complete, but no specific errors detected.");
    } catch (error) {
      console.error(error);
      alert("Video analysis engine encountered a problem.");
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleExportCSV = () => {
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    const headers = ['Ref ID', 'Part Number', 'Description', 'Price (USD)', 'Price Source', 'Assembly Section'];
    const rows = dataSource.map(part => [
      part.id,
      part.partNumber,
      `"${part.description.replace(/"/g, '""')}"`,
      part.price || 0,
      `"${(part.priceSource || 'N/A').replace(/"/g, '""')}"`,
      `"${part.section.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BOM-${lookupModel || 'APPLIANCE'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredParts = useMemo(() => {
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    const filtered = dataSource.filter(part => {
      const matchesSearch =
        part.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.compatibleModels.some(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSection = selectedSection ? part.section === selectedSection : true;
      return matchesSearch && matchesSection;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'popularity') return (b.reviewCount || 0) - (a.reviewCount || 0);
      return a.id - b.id;
    });
  }, [searchTerm, selectedSection, aiParts, sortBy]);

  const stats = useMemo(() => {
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    return {
      total: dataSource.length,
      filtered: filteredParts.length,
      sections: dynamicSections.length,
      isAI: aiParts.length > 0
    };
  }, [filteredParts, aiParts]);

  const handleCheckCompatibility = (modelOverride?: string) => {
    const modelToUse = modelOverride || checkModel;
    if (!selectedPart || !modelToUse) return;

    const normalizedModel = modelToUse.trim().toUpperCase();
    const isCompatible = selectedPart.compatibleModels.some(m =>
      m === normalizedModel || m === 'Universal'
    );

    let suggestions: Part[] = [];
    if (!isCompatible) {
      suggestions = partsData.filter(p =>
        p.section === selectedPart.section &&
        p.partNumber !== selectedPart.partNumber &&
        p.compatibleModels.includes(normalizedModel)
      ).slice(0, 3);
    }

    setCompatibilityResult({ isCompatible, suggestions });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      newRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setIsFieldChatLoading(true);
        try {
          // Convert binary to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            await processAudioNote(base64Audio);
          };
        } catch (err) {
          console.error("Audio processing failed", err);
        } finally {
          setIsFieldChatLoading(false);
          // Cleanup stream
          stream.getTracks().forEach(track => track.stop());
        }
      };

      newRecorder.start();
      setRecorder(newRecorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
      alert("Microphone access is required for voice notes. Please enable permissions.");
    }
  };

  const stopRecording = () => {
    if (recorder) {
      recorder.stop();
      setIsRecording(false);
      setRecorder(null);
    }
  };

  const processAudioNote = async (base64Data: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: "audio/webm", data: base64Data } },
          { text: "Transcribe this technical field note for an appliance repair. Return ONLY the clear text transcription." }
        ]
      });
      const transcript = response.text || "";
      if (transcript) {

        setFieldChatMessages(prev => [...prev,
        { role: 'user', text: "[Voice Log Recorded]" },
        { role: 'assistant', text: `Captured Note: "${transcript}". I've added this to your technical log.` }
        ]);
      }
    } catch (error) {
      console.error("Transcription error", error);
    }
  };

  const handleFieldAIChat = async (message: string) => {
    if (!message.trim()) return;

    const userMsg = { role: 'user' as const, text: message };
    setFieldChatMessages(prev => [...prev, userMsg]);
    setIsFieldChatLoading(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are a Technical Field Assistant for Roadrunner Appliance Inc. 
          You are helping a technician with the part: ${selectedPart?.description} (${selectedPart?.partNumber}).
          Current Model context: ${checkModel || lookupModel || 'Unknown'}.
          Help the technician troubleshoot, find specifications, or record field notes. 
          Keep responses concise, technical, and high-accuracy.`,
        },
        history: fieldChatMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
        }))
      });

      const response = await chat.sendMessage({ message });
      setFieldChatMessages(prev => [...prev, { role: 'assistant', text: response.text || "System error. Please retry." }]);
    } catch (error) {
      console.error("Field AI Chat Error", error);
    } finally {
      setIsFieldChatLoading(false);
    }
  };


  return (
    <div className="min-h-screen">
      {/* Professional Header */}
      <header className="bg-white border-b border-pro-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-1.5 cursor-pointer" onClick={() => window.location.reload()}>
              <span className="text-xl font-black tracking-tighter text-pro-navy uppercase">
                Roadrunner<span className="text-pro-blue">Parts</span>
              </span>
              <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest bg-pro-slate-100 px-2 py-0.5 rounded">
                v2.5
              </span>
            </div>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Professional Sidebar */}
        <aside className="lg:col-span-1 space-y-8">
          <section>
            <h2 className="pro-section-title flex items-center gap-2">
              <Package size={14} className="text-pro-blue" /> Machine Systems
            </h2>
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => setSelectedSection(null)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all rounded-lg ${selectedSection === null
                  ? 'bg-pro-navy text-white shadow-pro'
                  : 'text-pro-slate-600 hover:bg-pro-slate-100 hover:text-pro-slate-900'
                  }`}
              >
                All Components
              </button>
              {dynamicSections.map((section) => (
                <button
                  key={section}
                  onClick={() => setSelectedSection(section)}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all rounded-lg ${selectedSection === section
                    ? 'bg-pro-navy text-white shadow-pro'
                    : 'text-pro-slate-600 hover:bg-pro-slate-100 hover:text-pro-slate-900'
                    }`}
                >
                  {section}
                </button>
              ))}
            </nav>
          </section>


        </aside>

        {/* Parts Explorer */}
        <section className="lg:col-span-3 space-y-6">
          <div className="flex flex-col gap-6">
            {/* High-Level Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="pro-card p-3 rounded-xl flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Model</span>
                <span className="text-xs font-bold text-pro-slate-900 truncate">{lookupModel || 'N/A'}</span>
                {modelMSRP && (
                  <span className="text-[9px] font-bold text-pro-blue">MSRP: ${modelMSRP}</span>
                )}
              </div>

              <div className="pro-card p-3 rounded-xl flex flex-col gap-0.5 relative group">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest leading-none">Manufactured</span>
                  <button
                    onClick={handleManufactureRefresh}
                    className="p-1 hover:bg-pro-slate-100 rounded text-pro-slate-400 hover:text-pro-blue transition-colors"
                  >
                    <Zap size={10} className={isRecalculating ? 'animate-spin' : ''} />
                  </button>
                </div>
                <span className="text-xs font-bold text-pro-slate-900">
                  {manufactureInfo ? `${manufactureInfo.manufactureYear} • ${manufactureInfo.timeValue?.unit === 'month' ? 'M' : 'W'}${manufactureInfo.timeValue?.value}` : 'UNDETECTED'}
                </span>
                {manufactureInfo && (
                  <span className={`text-[8px] font-black uppercase text-white px-1 rounded-sm w-fit ${manufactureInfo.confidence === 'high' ? 'bg-emerald-500' :
                    manufactureInfo.confidence === 'medium' ? 'bg-pro-blue' : 'bg-amber-500'
                    }`}>{manufactureInfo.confidence} Confidence</span>
                )}
              </div>

              <div className="pro-card p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Market Value</span>
                <span className="text-base font-black text-emerald-600 leading-none">
                  {valuation ? `$${valuation.currentMarketValue.toFixed(2)}` : '--'}
                </span>
                <select
                  className="text-[9px] font-bold text-pro-slate-500 bg-transparent focus:outline-none cursor-pointer uppercase tracking-tighter"
                  value={applianceCondition}
                  onChange={(e) => setApplianceCondition(e.target.value as ApplianceCondition)}
                >
                  <option value="excellent">Mint Condition</option>
                  <option value="good">Standard Use</option>
                  <option value="fair">Well Used</option>
                  <option value="poor">Scrap / Salvage</option>
                </select>
              </div>

              <div className="pro-card p-3 rounded-xl flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest leading-none">Active Serial</span>
                <input
                  type="text"
                  placeholder="ENTER SERIAL #"
                  value={lookupSerial || ''}
                  onChange={(e) => {
                    const s = e.target.value.toUpperCase();
                    setLookupSerial(s);
                    if (s.length > 3) {
                      setManufactureInfo(decoder.decode(s));
                    } else {
                      setManufactureInfo(null);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-pro-slate-900 focus:outline-none w-full placeholder:text-pro-slate-300 border-b border-pro-slate-100 focus:border-pro-blue py-0.5"
                />
              </div>
            </div>

            {/* Search and Action Bar */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-pro-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="EX: WTW5000DW1, DRAIN PUMP..."
                  className="pro-input py-2.5 pl-10 h-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <button
                  className="pro-button pro-button-secondary"
                  onClick={() => setIsMainDiagOpen(true)}
                  title="Run deep AI diagnostic"
                >
                  <BrainCircuit size={16} className="text-pro-blue" />
                  <span className="hidden xl:inline">Diagnostics</span>
                </button>
                <button
                  className="pro-button pro-button-blue px-6 flex-1 md:flex-initial"
                  onClick={() => handleAILookup()}
                  disabled={isAILoading}
                >
                  {isAILoading ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <>
                      <Zap className={`${aiParts.length > 0 ? 'fill-yellow-300' : 'fill-white'}`} size={16} />
                      <span>{aiParts.length > 0 ? `Complete BOM Pass ${Math.min(bomPassCount + 1, 4)}` : 'AI Deep Scan'}</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setScanType('search');
                    document.getElementById('ocr-input')?.click();
                  }}
                  className={`pro-button px-3 ${isScanning ? 'pro-button-primary animate-pulse' : 'pro-button-secondary'}`}
                  title="Scan model tag via camera"
                  disabled={isScanning}
                >
                  {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                </button>
              </div>
            </div>
            <p className="text-[9px] text-pro-slate-400 mt-1.5 flex items-center gap-1 px-1">
              <span className="font-bold text-pro-blue uppercase tracking-widest">Scanner Tip:</span>
              Align the MOD/SER plate in landscape, ensure bright lighting, and avoid glare for forensic accuracy.
            </p>
          </div>

          {/* View Mode and Sorting Controls */}
          <div className="flex items-center justify-between border-y border-pro-slate-200/60 py-2">
            <div className="flex items-center gap-1 bg-pro-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-pro-navy shadow-sm' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white text-pro-navy shadow-sm' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
              >
                <TableIcon size={16} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Sort By</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs font-semibold text-pro-slate-700 bg-transparent focus:outline-none appearance-none cursor-pointer hover:text-pro-blue transition-colors px-2 py-1"
                >
                  <option value="id">Sequence</option>
                  <option value="popularity">Demand</option>
                </select>
                <ChevronDown size={12} className="text-pro-slate-400 -ml-1" />
              </div>

              <div className="h-4 w-px bg-pro-slate-200"></div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1.5 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                  title="Print BOM"
                >
                  <Printer size={16} />
                </button>
                {stats.isAI && (
                  <>
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(aiParts, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `BOM-${lookupModel}.json`;
                        a.click();
                      }}
                      className="p-1.5 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                      title="Export JSON"
                    >
                      <FileJson size={16} />
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="p-1.5 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                      title="Export CSV"
                    >
                      <FileSpreadsheet size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {filteredParts.length === 0 ? (
            <div className="pro-card p-16 flex flex-col items-center text-center rounded-2xl border-dashed">
              <div className="w-16 h-16 bg-pro-slate-100 rounded-2xl flex items-center justify-center mb-6">
                <Search size={32} className="text-pro-slate-400" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-pro-slate-900">No matching parts found</h3>
              <p className="text-sm text-pro-slate-500 max-w-sm mb-8 leading-relaxed">
                We couldn't find any components matching <span className="font-semibold text-pro-slate-900">"{searchTerm}"</span> in our local database. You can try an AI-powered deep scan.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleAILookup(searchTerm)}
                  disabled={isAILoading}
                  className="pro-button pro-button-primary px-8"
                >
                  {isAILoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Deep Intelligence Lookup
                </button>
                <button
                  onClick={() => setSearchTerm('')}
                  className="pro-button pro-button-secondary px-8"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredParts.map((part) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={part.id}
                  onClick={() => setSelectedPart(part)}
                  className="pro-card pro-card-hover p-4 cursor-pointer flex flex-col justify-between rounded-xl h-full"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">
                        Item ID {part.id}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-pro-slate-900 mb-2 leading-snug group-hover:text-pro-blue transition-colors">
                      {part.description}
                    </h3>
                    <p className="text-[10px] font-mono text-pro-slate-400 uppercase tracking-tighter">PN: {part.partNumber}</p>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-pro-slate-50">
                    <div>
                      {part.price && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-black text-pro-slate-900">${part.price.toFixed(2)}</span>
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">{part.priceSource || 'VERIFIED'}</span>
                        </div>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-pro-slate-50 flex items-center justify-center text-pro-slate-400 group-hover:bg-pro-blue group-hover:text-white transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="pro-card rounded-xl overflow-hidden border-pro-slate-200">
              <div className="bg-pro-navy px-4 py-2 border-b border-pro-navy flex items-center justify-between text-[10px] text-white/70 font-bold tracking-[0.15em] uppercase">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={12} className="text-pro-blue animate-pulse" />
                  Advanced Technical Dataset
                </div>
                <div className="flex items-center gap-2 text-[9px] opacity-60">
                  RT Engine 3.1 • Neural High-Thinking
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-pro-slate-50 border-b border-pro-slate-200">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">OEM Identifier</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Component Description</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest w-24">Market Cost</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Assembly</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pro-slate-100">
                    {filteredParts.map((part) => (
                      <tr
                        key={part.id}
                        onClick={() => setSelectedPart(part)}
                        className="hover:bg-pro-slate-50 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-bold text-pro-navy group-hover:text-pro-blue underline decoration-transparent group-hover:decoration-pro-blue/30 transition-all">{part.partNumber}</span>
                            <span className="text-[9px] font-bold text-pro-slate-400">ID {part.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-pro-slate-700">{part.description}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-pro-slate-900">${part.price?.toFixed(2) || 'N/A'}</span>
                            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">{part.priceSource || 'Market'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-pro-slate-100 text-pro-slate-500 rounded uppercase tracking-tighter">
                            {part.section}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Global Diagnostic Modal */}
      {/* Professional Global Diagnostic Modal */}
      <AnimatePresence>
        {isMainDiagOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-pro-navy/60 backdrop-blur-md overflow-y-auto"
            onClick={() => setIsMainDiagOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="pro-card bg-white w-full max-w-3xl overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white border-b border-pro-slate-100 p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-pro-slate-100 p-2 rounded-xl">
                    <BrainCircuit className="text-pro-blue" size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-pro-slate-900 leading-tight">AI Diagnostic Interface</h2>
                    <p className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Neural Multi-Path Analysis Engaged</p>
                  </div>
                </div>
                <button onClick={() => setIsMainDiagOpen(false)} className="p-2 text-pro-slate-400 hover:text-pro-slate-900 transition-colors">
                  <X />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Text Diagnostic Input */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Symptom Description</label>
                    <div className="relative">
                      <textarea
                        placeholder="ENTER SYMPTOMS (E.G. NO DRAIN, GRINDING NOISE)..."
                        className="pro-input w-full p-4 min-h-[160px] resize-none"
                        value={diagQuery}
                        onChange={(e) => setDiagQuery(e.target.value)}
                      />
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={() => handleDeepDiagnostic(true)}
                          disabled={isDiagLoading || !diagQuery}
                          className="pro-button pro-button-primary py-1.5"
                        >
                          {isDiagLoading ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                          <span>Analyze</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Video Diagnostic Input */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Acoustic / Video Analysis</label>
                    <div className="pro-card border-dashed p-6 flex flex-col items-center justify-center text-center hover:bg-pro-slate-50 transition-all cursor-pointer relative h-[160px] rounded-lg">
                      <input
                        type="file"
                        accept="video/*"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={handleVideoDiagnostic}
                      />

                      {isVideoLoading ? (
                        <div className="space-y-2">
                          <Loader2 className="animate-spin text-pro-blue mx-auto" size={24} />
                          <p className="text-[10px] font-bold text-pro-blue uppercase tracking-widest animate-pulse">Processing Stream...</p>
                        </div>
                      ) : (
                        <>
                          <Video className="text-pro-slate-300 mb-2" size={32} />
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-pro-slate-900">Upload Failure Video</p>
                            <p className="text-[9px] font-medium text-pro-slate-400 uppercase leading-tight max-w-[140px]">
                              Analyzing pattern cycles via AI sound detection.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Analysis Result Display */}
                {(diagResult || videoResult) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pro-card bg-pro-navy p-6 rounded-xl relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                      <span className="text-[10px] font-bold text-pro-blue uppercase tracking-widest">Intelligence Report</span>
                      <BrainCircuit size={14} className="text-white/20" />
                    </div>
                    <div className="whitespace-pre-wrap text-white/90 font-medium text-xs leading-relaxed max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                      {videoResult || diagResult}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Professional Part Detail Dialog */}
      <AnimatePresence>
        {selectedPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-pro-navy/60 backdrop-blur-md overflow-y-auto"
            onClick={() => setSelectedPart(null)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="pro-card bg-white w-full max-w-5xl overflow-hidden rounded-2xl my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-pro-navy text-white p-6 md:p-8 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="bg-pro-blue text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">
                      OEM CERTIFIED
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none uppercase">
                    {selectedPart.description}
                  </h2>
                  <div className="flex items-center gap-4 mt-6">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Part Index</span>
                      <span className="text-sm font-mono font-bold text-white/90">{selectedPart.partNumber}</span>
                    </div>
                    {selectedPart.price && (
                      <div className="flex flex-col border-l border-white/10 pl-4">
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Market Value</span>
                        <span className="text-2xl font-black text-emerald-400 leading-none">${selectedPart.price.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedPart(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                  <X />
                </button>
              </div>

              {/* Advanced Diagnostics Tab */}
              <div className="bg-pro-slate-50 px-6 flex border-b border-pro-slate-100">
                <button
                  onClick={() => setShowDiagPanel(false)}
                  className={`py-4 px-6 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${!showDiagPanel ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  Technical Specifications
                </button>
                <button
                  onClick={() => setShowDiagPanel(true)}
                  className={`py-4 px-6 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-b-2 ${showDiagPanel ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  <BrainCircuit size={14} /> Intelligence Analysis
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                {!showDiagPanel ? (
                  <>
                    <div className="p-6 md:p-8 space-y-10 bg-white border-r border-pro-slate-100">
                      <section>
                        <h3 className="pro-section-title flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-pro-blue" />
                          Compatibility Audit
                        </h3>
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="ENTER MODEL NUMBER TO VERIFY"
                                className="pro-input py-2 text-xs font-bold"
                                value={checkModel}
                                onChange={(e) => setCheckModel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCheckCompatibility();
                                }}
                              />
                            </div>
                            <button
                              onClick={() => handleCheckCompatibility()}
                              className="pro-button pro-button-primary shrink-0"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => {
                                setScanType('compatibility');
                                document.getElementById('ocr-input')?.click();
                              }}
                              className={`pro-button px-3 shrink-0 ${isScanning && scanType === 'compatibility' ? 'pro-button-primary animate-pulse' : 'pro-button-secondary'}`}
                              title="Scan tag to pre-fill model"
                              disabled={isScanning}
                            >
                              {isScanning && scanType === 'compatibility' ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                            </button>
                          </div>

                          <AnimatePresence mode="wait">
                            {compatibilityResult && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className={`pro-card p-4 border-dashed rounded-lg ${compatibilityResult.isCompatible
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-red-50 border-red-200 text-red-900'
                                  }`}
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  {compatibilityResult.isCompatible ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                  <span className="text-xs font-bold uppercase tracking-tight">
                                    {compatibilityResult.isCompatible ? 'Validated Compatible' : 'Incompatible Variant'}
                                  </span>
                                </div>

                                {!compatibilityResult.isCompatible && compatibilityResult.suggestions.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-red-100">
                                    <p className="text-[10px] font-bold uppercase mb-3 text-red-700">Recommended Alternatives:</p>
                                    <div className="space-y-2">
                                      {compatibilityResult.suggestions.map(s => (
                                        <button
                                          key={s.id}
                                          onClick={() => setSelectedPart(s)}
                                          className="w-full pro-card p-3 bg-white hover:border-pro-blue flex justify-between items-center rounded-lg shadow-sm"
                                        >
                                          <span className="text-xs font-semibold truncate pr-4 text-pro-slate-900">{s.description}</span>
                                          <span className="text-[10px] font-bold text-pro-blue uppercase">{s.partNumber}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </section>

                      <section>
                        <h3 className="pro-section-title flex items-center gap-2">
                          <AlertCircle size={14} className="text-amber-500" />
                          Engineering Profile
                        </h3>
                        <div className="pro-card bg-pro-slate-50 p-4 space-y-4 rounded-xl border-dashed">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-pro-slate-400 uppercase">Assembly Context</span>
                            <span className="text-xs font-bold text-pro-slate-900 uppercase italic">{selectedPart.section}</span>
                          </div>
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-pro-slate-400 uppercase">Availability</span>
                            <span className="text-xs font-bold text-emerald-600 uppercase flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                              Active Stock
                            </span>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="p-6 md:p-8 bg-pro-slate-50/50 flex flex-col h-full max-h-[700px]">
                      <h3 className="pro-section-title flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={14} className="text-pro-blue" />
                          Field Intelligence Assistant
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                          <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isFieldChatLoading ? 'animate-ping' : ''}`}></div>
                          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Active Relay</span>
                        </div>
                      </h3>

                      <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar min-h-[400px]">
                        {/* Conversation History */}
                        <div className="space-y-3 mb-6 bg-pro-slate-50/50 p-3 rounded-xl border border-pro-slate-100">
                          {fieldChatMessages.length === 0 && (
                            <div className="text-[10px] text-pro-slate-400 text-center py-6 font-bold uppercase tracking-widest italic">
                              Awaiting technical briefing or voice notes...
                            </div>
                          )}
                          {fieldChatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm ${msg.role === 'user'
                                ? 'bg-pro-blue text-white rounded-tr-none'
                                : 'bg-white text-pro-navy rounded-tl-none border border-pro-slate-100'
                                }`}>
                                <div className="flex items-center gap-1.5 mb-1 opacity-60 font-black uppercase text-[8px]">
                                  {msg.role === 'user' ? <User size={8} /> : <Sparkles size={8} />}
                                  {msg.role === 'user' ? 'Technician' : 'Logic Assistant'}
                                </div>
                                {msg.text}
                              </div>
                            </div>
                          ))}
                          {isFieldChatLoading && (
                            <div className="flex justify-start">
                              <div className="bg-white p-2 text-pro-blue animate-pulse rounded-full shadow-sm border border-pro-slate-100">
                                <Loader2 size={12} className="animate-spin" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 p-8 md:p-12 bg-white space-y-8 min-h-[500px]">
                    <div className="flex items-center flex-col md:flex-row gap-6 mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-pro-slate-900 flex items-center justify-center text-white shadow-lg">
                        <Zap size={28} className="text-pro-blue animate-pulse" />
                      </div>
                      <div className="text-center md:text-left">
                        <h3 className="text-xl font-bold text-pro-slate-900 tracking-tight">Assisted Diagnostics</h3>
                        <p className="text-xs font-bold text-pro-blue uppercase tracking-widest">Roadrunner Precision Analysis Active</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Analyze Symptoms</label>
                      <div className="relative">
                        <textarea
                          placeholder=" DESCRIBE SPECIFIC FAILURE MODES (E.G. ERROR F3, BURNING SMELL DURING CYCLE)..."
                          className="pro-input w-full p-6 text-sm min-h-[160px] bg-pro-slate-50 border-none focus:bg-white"
                          value={diagQuery}
                          onChange={(e) => setDiagQuery(e.target.value)}
                        />
                        <div className="absolute bottom-4 right-4">
                          <button
                            onClick={() => handleDeepDiagnostic()}
                            disabled={isDiagLoading || !diagQuery}
                            className="pro-button pro-button-primary px-6 shadow-pro-md"
                          >
                            {isDiagLoading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                            <span>Generate Logic</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {diagResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="pro-card bg-pro-navy p-6 rounded-2xl relative overflow-hidden"
                      >
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                          <span className="text-[10px] font-bold text-pro-blue uppercase tracking-widest">Trace Diagnostics Report</span>
                        </div>
                        <div className="whitespace-pre-wrap text-white/90 font-medium text-xs leading-relaxed max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                          {diagResult}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto p-12 flex flex-col md:flex-row items-center justify-between border-t border-pro-slate-200 mt-20 text-pro-slate-900 bg-white rounded-t-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-pro-blue"></div>
        <div className="flex items-center gap-6 mb-6 md:mb-0">
          <div className="bg-pro-navy p-3 border border-pro-navy rounded-xl shadow-sm">
            <ClipboardList size={24} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pro-navy">Unified Intelligence Framework</p>
            <p className="text-[10px] font-bold text-pro-slate-400 uppercase">Master Catalog System • Production Build v2.5.0</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold uppercase text-pro-slate-400">Environment</p>
            <p className="text-xs font-bold uppercase text-pro-navy">Secure Cloud Relay</p>
          </div>
          <div className="h-10 w-px bg-pro-slate-200 hidden sm:block"></div>
          <div className="bg-pro-navy text-white px-6 py-2 rounded-full font-bold text-[10px] tracking-widest shadow-md uppercase">
            Validated BOM Data • 2026 Edition
          </div>
        </div>
      </footer>

      {/* Hidden OCR Input */}
      <input
        id="ocr-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}

