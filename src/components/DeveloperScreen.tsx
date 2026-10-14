import React, { useState, useEffect } from 'react';
import { 
  fetchDeveloperManualsFromCloud, 
  writeDeveloperManualsToCloud,
  DEFAULT_PERSONALITY_MANUAL,
  DEFAULT_REACTION_MANUAL,
  DEFAULT_INTIMACY_MANUAL,
  DEFAULT_RAW_MATERIAL_MANUAL,
  DEFAULT_NATURALNESS_AUDIT_MANUAL,
  DeveloperManuals
} from '../firebase';
import { Shield, ArrowLeft, Save, Sparkles, Database, RefreshCw, AlertCircle, Check, X, User, BookOpen, Cloud, CloudOff, AlertTriangle, Copy, Cpu, Key, Eye, EyeOff, Trash2, Activity, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet } from '../utils/safeStorage';
import { getAiConfig, saveAiConfig, DEFAULT_GEMINI_MODEL, DEFAULT_OPENROUTER_MODEL } from '../utils/aiConfig';


function getLatestIntimacyMilestone(score: number): number {
  if (score < 25) return 0;
  if (score <= 400) {
    return Math.floor(score / 25) * 25;
  }
  if (score <= 1000) {
    return 400 + Math.floor((score - 400) / 200) * 200;
  }
  return 1000 + Math.floor((score - 1000) / 500) * 500;
}

function getIntimacyMilestonesInRange(start: number, end: number): number[] {
  const milestones: number[] = [];
  for (let s = 25; s <= 400; s += 25) {
    if (s > start && s <= end) {
      milestones.push(s);
    }
  }
  for (let s = 600; s <= 1000; s += 200) {
    if (s > start && s <= end) {
      milestones.push(s);
    }
  }
  if (end > 1000) {
    const lowerBound = Math.max(1000, start);
    const startOffset = Math.floor((lowerBound - 1000) / 500) + 1;
    let s = 1000 + startOffset * 500;
    while (s <= end) {
      milestones.push(s);
      s += 500;
    }
  }
  return milestones;
}


interface DeveloperScreenProps {
  userId: string;
  onBack: () => void;
  onReloadWeeklyPlan?: () => void;
}

export default function DeveloperScreen({ userId, onBack, onReloadWeeklyPlan }: DeveloperScreenProps) {
  const [manuals, setManuals] = useState<DeveloperManuals>({
    personality_manual: '',
    reaction_manual: '',
    intimacy_manual: '',
    raw_material_manual: '',
    naturalness_audit_manual: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // States for Mandatory Vocabulary ("Vocabulário Obrigatório")
  const [vocabularyRaw, setVocabularyRaw] = useState<string>(localStorage.getItem('fluent_mandatory_vocab') || '');
  const [vocabGroups, setVocabGroups] = useState<any[]>(() => {
    try {
      const g = localStorage.getItem('fluent_mandatory_vocab_groups');
      return g ? JSON.parse(g) : [];
    } catch {
      return [];
    }
  });
  const [grouping, setGrouping] = useState(false);
  const [reloadingPlan, setReloadingPlan] = useState(false);

  // States for Retroactive Alignment
  const [simState, setSimState] = useState<any>(null);
  const [stateHistory, setStateHistory] = useState<any[]>([]);
  const [evolveLoading, setEvolveLoading] = useState(false);
  const [evolveLogs, setEvolveLogs] = useState<string[]>([]);
  const [evolveSuccess, setEvolveSuccess] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<any | null>(null);
  const [viewingRawMaterial, setViewingRawMaterial] = useState<any | null>(null);
  const [charModalTab, setCharModalTab] = useState<'profile' | 'wishes'>('profile');
  const [generatingWishes, setGeneratingWishes] = useState<boolean>(false);

  // States for Editing Character Personality Sheet and Raw Material
  const [editedPersonalityText, setEditedPersonalityText] = useState<string>('');
  const [personalitySaveSuccess, setPersonalitySaveSuccess] = useState<boolean>(false);
  const [editedRawMaterialText, setEditedRawMaterialText] = useState<string>('');
  const [rawMaterialSaveSuccess, setRawMaterialSaveSuccess] = useState<boolean>(false);

  // States for AI Providers Configuration
  const initialAiConfig = getAiConfig();
  const [primaryProvider, setPrimaryProvider] = useState<'gemini' | 'openrouter'>(initialAiConfig.primaryProvider);
  const [primaryApiKey, setPrimaryApiKey] = useState<string>(initialAiConfig.primaryApiKey);
  const [primaryModelId, setPrimaryModelId] = useState<string>(initialAiConfig.primaryModelId);

  const [reserveProvider, setReserveProvider] = useState<'gemini' | 'openrouter'>(initialAiConfig.reserveProvider);
  const [reserveApiKey, setReserveApiKey] = useState<string>(initialAiConfig.reserveApiKey);
  const [reserveModelId, setReserveModelId] = useState<string>(initialAiConfig.reserveModelId);

  const [showPrimaryApiKey, setShowPrimaryApiKey] = useState<boolean>(false);
  const [showReserveApiKey, setShowReserveApiKey] = useState<boolean>(false);
  const [aiProviderSuccessMsg, setAiProviderSuccessMsg] = useState<string | null>(null);
  const [aiProviderErrorMsg, setAiProviderErrorMsg] = useState<string | null>(null);

  // Helper functions when provider selection changes
  const handlePrimaryProviderChange = (newProvider: 'gemini' | 'openrouter') => {
    setPrimaryProvider(newProvider);
    if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
    if (newProvider === 'gemini' && (!primaryModelId || primaryModelId === DEFAULT_OPENROUTER_MODEL)) {
      setPrimaryModelId(DEFAULT_GEMINI_MODEL);
    } else if (newProvider === 'openrouter' && (!primaryModelId || primaryModelId === DEFAULT_GEMINI_MODEL)) {
      setPrimaryModelId(DEFAULT_OPENROUTER_MODEL);
    }
  };

  const handleReserveProviderChange = (newProvider: 'gemini' | 'openrouter') => {
    setReserveProvider(newProvider);
    if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
    if (newProvider === 'gemini' && (!reserveModelId || reserveModelId === DEFAULT_OPENROUTER_MODEL)) {
      setReserveModelId(DEFAULT_GEMINI_MODEL);
    } else if (newProvider === 'openrouter' && (!reserveModelId || reserveModelId === DEFAULT_GEMINI_MODEL)) {
      setReserveModelId(DEFAULT_OPENROUTER_MODEL);
    }
  };

  // States for AI Provider Diagnostics
  interface DiagnosticResult {
    testing: boolean;
    success?: boolean;
    status?: string;
    provider?: 'gemini' | 'openrouter';
    modelId?: string;
    maskedKey?: string;
    durationMs?: number;
    message?: string;
    errorCategory?: string;
    errorDetails?: string;
  }

  const [primaryDiagnostic, setPrimaryDiagnostic] = useState<DiagnosticResult | null>(null);
  const [reserveDiagnostic, setReserveDiagnostic] = useState<DiagnosticResult | null>(null);

  const maskKey = (key: string | undefined): string => {
    if (!key || !key.trim()) return '(Não configurada)';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '****';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  };

  const handleTestConnection = async (target: 'primary' | 'reserve') => {
    const isPrimary = target === 'primary';
    const providerToTest = isPrimary ? primaryProvider : reserveProvider;
    const keyToUse = isPrimary ? primaryApiKey.trim() : reserveApiKey.trim();
    const modelToUse = isPrimary ? primaryModelId.trim() : reserveModelId.trim();

    const setDiagnostic = isPrimary ? setPrimaryDiagnostic : setReserveDiagnostic;

    // Pre-call validation 1: Check if Model ID contains an API key
    if (modelToUse.startsWith('sk-') || modelToUse.includes('sk-') || modelToUse.startsWith('AIzaSy')) {
      setDiagnostic({
        testing: false,
        success: false,
        status: 'Falha na conexão',
        provider: providerToTest,
        modelId: modelToUse,
        maskedKey: maskKey(keyToUse),
        errorCategory: 'Model ID inválido',
        message: `Foi detectada uma API Key no campo "Model ID" da ${isPrimary ? 'API Principal' : 'API Reserva'}. O campo Model ID deve conter o identificador do modelo (ex: ${providerToTest === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL}) e não uma chave secreta de API.`,
        errorDetails: 'O valor inserido no campo de modelo possui o formato característico de uma chave secreta.'
      });
      return;
    }

    // Pre-call validation 2: Check if API Key is missing
    if (!keyToUse) {
      setDiagnostic({
        testing: false,
        success: false,
        status: 'Falha na conexão',
        provider: providerToTest,
        modelId: modelToUse || '(Não informado)',
        maskedKey: '(Não configurada)',
        errorCategory: 'API Key ausente',
        message: `A chave de API (API Key) para a ${isPrimary ? 'API Principal' : 'API Reserva'} (${providerToTest === 'gemini' ? 'Gemini' : 'OpenRouter'}) está ausente. Insira uma chave antes de testar.`,
        errorDetails: 'Nenhuma chave foi configurada nos campos do desenvolvedor.'
      });
      return;
    }

    // Pre-call validation 3: Check if Model ID is missing
    if (!modelToUse) {
      setDiagnostic({
        testing: false,
        success: false,
        status: 'Falha na conexão',
        provider: providerToTest,
        modelId: '(Não informado)',
        maskedKey: maskKey(keyToUse),
        errorCategory: 'Model ID ausente',
        message: 'O identificador do modelo (Model ID) está ausente. Por favor, informe o modelo desejado.',
        errorDetails: 'O campo do identificador de modelo está vazio.'
      });
      return;
    }

    // Set state to testing
    setDiagnostic({
      testing: true,
      provider: providerToTest,
      modelId: modelToUse,
      maskedKey: maskKey(keyToUse)
    });

    try {
      const res = await apiFetch('/api/dev/test-ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          provider: providerToTest,
          apiKey: keyToUse,
          modelId: modelToUse
        })
      });

      const data = await res.json();

      setDiagnostic({
        testing: false,
        success: data.success,
        status: data.status,
        provider: data.provider,
        modelId: data.modelId,
        maskedKey: data.maskedKey,
        durationMs: data.durationMs,
        message: data.message,
        errorCategory: data.errorCategory,
        errorDetails: data.errorDetails
      });
    } catch (err: any) {
      setDiagnostic({
        testing: false,
        success: false,
        status: 'Falha na conexão',
        provider: providerToTest,
        modelId: modelToUse,
        maskedKey: maskKey(keyToUse),
        errorCategory: 'Erro de comunicação',
        message: 'Não foi possível se comunicar com o servidor da aplicação para efetuar o teste de diagnóstico.',
        errorDetails: err?.message || String(err)
      });
    }
  };

  const handleSaveAiProviders = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAiProviderErrorMsg(null);
    setAiProviderSuccessMsg(null);

    const saved = saveAiConfig({
      primaryProvider,
      primaryApiKey,
      primaryModelId,
      reserveProvider,
      reserveApiKey,
      reserveModelId,
    });

    setPrimaryProvider(saved.primaryProvider);
    setPrimaryApiKey(saved.primaryApiKey);
    setPrimaryModelId(saved.primaryModelId);

    setReserveProvider(saved.reserveProvider);
    setReserveApiKey(saved.reserveApiKey);
    setReserveModelId(saved.reserveModelId);

    setAiProviderSuccessMsg('Configurações salvas com sucesso! A API Principal e a API Reserva foram atualizadas.');
    setTimeout(() => {
      setAiProviderSuccessMsg(null);
    }, 4000);
  };

  useEffect(() => {
    if (selectedChar) {
      setEditedPersonalityText(selectedChar.personality || selectedChar.personality_sheet || '');
      setPersonalitySaveSuccess(false);
    }
  }, [selectedChar?.id, selectedChar?.personality, selectedChar?.personality_sheet]);

  useEffect(() => {
    if (viewingRawMaterial) {
      setEditedRawMaterialText(viewingRawMaterial.raw_material || '');
      setRawMaterialSaveSuccess(false);
    }
  }, [viewingRawMaterial?.id, viewingRawMaterial?.raw_material]);

  const handleSaveCharacterField = (charId: string, fieldUpdates: Record<string, string>) => {
    if (!simState) return;

    const updateCharObj = (c: any) => {
      if (c && c.id === charId) {
        return {
          ...c,
          ...fieldUpdates
        };
      }
      return c;
    };

    const updatedFixed = (simState.fixed_characters || []).map(updateCharObj);
    const updatedActive = simState.active_character?.id === charId 
      ? updateCharObj(simState.active_character) 
      : simState.active_character;

    const updatedState = {
      ...simState,
      fixed_characters: updatedFixed,
      active_character: updatedActive
    };

    setSimState(updatedState);
    safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));

    if (selectedChar && selectedChar.id === charId) {
      setSelectedChar((prev: any) => prev ? { ...prev, ...fieldUpdates } : null);
    }
    if (viewingRawMaterial && viewingRawMaterial.id === charId) {
      setViewingRawMaterial((prev: any) => prev ? { ...prev, ...fieldUpdates } : null);
    }
  };

  const handleSavePersonality = () => {
    if (!selectedChar) return;
    handleSaveCharacterField(selectedChar.id, {
      personality: editedPersonalityText,
      personality_sheet: editedPersonalityText
    });
    setPersonalitySaveSuccess(true);
    setTimeout(() => setPersonalitySaveSuccess(false), 2500);
  };

  const handleSaveRawMaterial = () => {
    if (!viewingRawMaterial) return;
    handleSaveCharacterField(viewingRawMaterial.id, {
      raw_material: editedRawMaterialText
    });
    setRawMaterialSaveSuccess(true);
    setTimeout(() => setRawMaterialSaveSuccess(false), 2500);
  };

  const handleGenerateWishesForSelectedChar = async () => {
    if (!selectedChar) return;
    setGeneratingWishes(true);
    try {
      const res = await fetch("/api/generate-character-wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: selectedChar,
          simulatorState: simState
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Erro ao gerar desejos diários");
        setGeneratingWishes(false);
        return;
      }

      const updatedWishes = data.daily_wishes;
      const history = Array.isArray(selectedChar.daily_wishes_history) ? [...selectedChar.daily_wishes_history] : [];
      if (selectedChar.daily_wishes && selectedChar.daily_wishes.day !== updatedWishes.day) {
        if (!history.some((h: any) => h.day === selectedChar.daily_wishes?.day)) {
          history.push(selectedChar.daily_wishes);
        }
      }

      const updatedChar = {
        ...selectedChar,
        daily_wishes: updatedWishes,
        daily_wishes_history: history
      };

      setSelectedChar(updatedChar);

      if (simState) {
        const updatedFixed = (simState.fixed_characters || []).map((c: any) => c.id === selectedChar.id ? updatedChar : c);
        const updatedActive = simState.active_character?.id === selectedChar.id ? updatedChar : simState.active_character;
        const updatedState = {
          ...simState,
          fixed_characters: updatedFixed,
          active_character: updatedActive
        };
        setSimState(updatedState);
        safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));
      }
    } catch (err: any) {
      console.error("Failed to generate wishes:", err);
      alert("Falha ao se comunicar com o servidor para gerar os desejos.");
    } finally {
      setGeneratingWishes(false);
    }
  };

  // Custom states for Redo/Confirm and progress tracking
  const [redoConfirmation, setRedoConfirmation] = useState<{ id: string; name: string } | null>(null);
  const [redoProgress, setRedoProgress] = useState<{ active: boolean; percent: number; message: string }>({
    active: false,
    percent: 0,
    message: ''
  });

  const [disableFirestoreSync, setDisableFirestoreSync] = useState<boolean>(
    localStorage.getItem('fluent_disable_firestore_sync') === 'true'
  );
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(
    localStorage.getItem('fluent_firestore_quota_exceeded') === 'true'
  );

  const [batchRedoProgress, setBatchRedoProgress] = useState<{
    active: boolean;
    currentIndex: number;
    total: number;
    currentName: string;
    percent: number;
    message: string;
  }>({
    active: false,
    currentIndex: 0,
    total: 0,
    currentName: '',
    percent: 0,
    message: ''
  });

  const [showConfirmBatchPopup, setShowConfirmBatchPopup] = useState(false);

  // Load manuals from Firestore and simulator state on Mount
  useEffect(() => {
    async function loadManualsAndSimState() {
      try {
        setLoading(true);
        setErrorStatus(null);
        const data = await fetchDeveloperManualsFromCloud();
        if (data) {
          setManuals({
            personality_manual: data.personality_manual || DEFAULT_PERSONALITY_MANUAL,
            reaction_manual: data.reaction_manual || DEFAULT_REACTION_MANUAL,
            intimacy_manual: data.intimacy_manual || DEFAULT_INTIMACY_MANUAL,
            raw_material_manual: data.raw_material_manual || DEFAULT_RAW_MATERIAL_MANUAL,
            naturalness_audit_manual: data.naturalness_audit_manual || DEFAULT_NATURALNESS_AUDIT_MANUAL || ''
          });
        } else {
          // If Firestore is empty/not configured, populate with built-in fallbacks
          setManuals({
            personality_manual: DEFAULT_PERSONALITY_MANUAL,
            reaction_manual: DEFAULT_REACTION_MANUAL,
            intimacy_manual: DEFAULT_INTIMACY_MANUAL,
            raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
            naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL || ''
          });
        }
      } catch (err: any) {
        console.error('Falha ao obter manuais do Firestore. Usando reservas locais:', err);
        // Soft fallback to stay functional
        setManuals({
          personality_manual: DEFAULT_PERSONALITY_MANUAL,
          reaction_manual: DEFAULT_REACTION_MANUAL,
          intimacy_manual: DEFAULT_INTIMACY_MANUAL,
          raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
          naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL || ''
        });
        setErrorStatus('Instabilidade de rede ou Firestore pendente. Carregado manuais das reservas locais.');
      } finally {
        setLoading(false);
      }

      // Safe parse fluent_sim_state
      try {
        const raw = localStorage.getItem('fluent_sim_state');
        if (raw) {
          setSimState(JSON.parse(raw));
        }
      } catch (simErr) {
        console.error('Falha ao ler fluent_sim_state de localStorage:', simErr);
      }

      // Safe parse fluent_sim_state_history
      try {
        const rawHistory = localStorage.getItem('fluent_sim_state_history');
        if (rawHistory) {
          setStateHistory(JSON.parse(rawHistory));
        }
      } catch (hErr) {
        console.error('Falha ao ler fluent_sim_state_history de localStorage:', hErr);
      }
    }
    loadManualsAndSimState();
  }, []);

  const getMissingCharacters = () => {
    if (!simState) return [];

    const activeKeys = new Set<string>();
    if (simState.fixed_characters) {
      simState.fixed_characters.forEach((c: any) => {
        if (c.id) activeKeys.add(String(c.id));
        if (c.name) activeKeys.add(String(c.name));
      });
    }
    if (simState.active_character) {
      if (simState.active_character.id) activeKeys.add(String(simState.active_character.id));
      if (simState.active_character.name) activeKeys.add(String(simState.active_character.name));
    }

    const discoveredMap = new Map<string, any>();

    stateHistory.forEach((hState: any) => {
      if (!hState) return;
      const chars = [
        ...(hState.fixed_characters || []),
        ...(hState.active_character ? [hState.active_character] : [])
      ];

      chars.forEach((char: any) => {
        if (!char) return;
        const key = char.id || char.name;
        if (!key) return;

        const existingDiscovered = discoveredMap.get(String(key));
        if (!existingDiscovered) {
          discoveredMap.set(String(key), char);
        } else {
          // If we find a better state (higher relationship score), keep it or merge
          const currentScore = char.relationship_score || 0;
          const oldScore = existingDiscovered.relationship_score || 0;
          if (currentScore > oldScore || (!existingDiscovered.personality && char.personality)) {
            discoveredMap.set(String(key), { ...existingDiscovered, ...char });
          }
        }
      });
    });

    const missing: any[] = [];
    discoveredMap.forEach((char, key) => {
      if (!activeKeys.has(key)) {
        missing.push(char);
      }
    });

    return missing;
  };

  const handleRecoverCharacter = async (char: any) => {
    if (!simState) return;
    try {
      const prevFixed = simState.fixed_characters || [];
      if (prevFixed.some((c: any) => c.id === char.id || c.name === char.name)) {
        return;
      }

      const updatedFixed = [...prevFixed, char];
      const updatedState = {
        ...simState,
        fixed_characters: updatedFixed
      };

      setSimState(updatedState);
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));

      if (userId && userId !== 'guest') {
        try {
          const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
          const localSnapshot = getLocalStateSnapshot();
          localSnapshot['fluent_sim_state'] = JSON.stringify(updatedState);
          await writeStateToCloud(userId, localSnapshot);
        } catch (cloudErr) {
          console.warn("Could not sync recovered character to cloud, saved locally.", cloudErr);
        }
      }
    } catch (err: any) {
      console.error("Falha ao recuperar personagem:", err);
    }
  };

  const handleRecoverAllCharacters = async (chars: any[]) => {
    if (!simState || chars.length === 0) return;
    try {
      const prevFixed = [...(simState.fixed_characters || [])];
      
      chars.forEach((char: any) => {
        if (!prevFixed.some((c: any) => c.id === char.id || c.name === char.name)) {
          prevFixed.push(char);
        }
      });

      const updatedState = {
        ...simState,
        fixed_characters: prevFixed
      };

      setSimState(updatedState);
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));

      if (userId && userId !== 'guest') {
        try {
          const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
          const localSnapshot = getLocalStateSnapshot();
          localSnapshot['fluent_sim_state'] = JSON.stringify(updatedState);
          await writeStateToCloud(userId, localSnapshot);
        } catch (cloudErr) {
          console.warn("Could not sync recovered characters to cloud, saved locally.", cloudErr);
        }
      }
    } catch (err: any) {
      console.error("Falha ao recuperar todos os personagens:", err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorStatus(null);
    try {
      let latestGroups = vocabGroups;
      
      // Perform semantic grouping if the vocabulary is not empty and has changed
      const storedVocab = localStorage.getItem('fluent_mandatory_vocab') || '';
      if (vocabularyRaw.trim() && vocabularyRaw !== storedVocab) {
        setGrouping(true);
        try {
          const response = await apiFetch('/api/group-vocabulary', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vocabulary: vocabularyRaw })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.groups) {
              latestGroups = data.groups;
              setVocabGroups(data.groups);
              safeLocalStorageSet('fluent_mandatory_vocab_groups', JSON.stringify(data.groups));
            }
          }
        } catch (groupErr) {
          console.error("Error grouping vocabulary during save:", groupErr);
        } finally {
          setGrouping(false);
        }
      }
      
      // Persist raw vocabulary
      safeLocalStorageSet('fluent_mandatory_vocab', vocabularyRaw);

      // Save manuals
      await writeDeveloperManualsToCloud(manuals, userId);

      // Sync to cloud
      if (userId && userId !== 'guest') {
        try {
          const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
          const localSnapshot = getLocalStateSnapshot();
          localSnapshot['fluent_mandatory_vocab'] = vocabularyRaw;
          localSnapshot['fluent_mandatory_vocab_groups'] = JSON.stringify(latestGroups);
          await writeStateToCloud(userId, localSnapshot);
        } catch (cloudErr) {
          console.warn("Could not sync vocabulary state to Firestore:", cloudErr);
        }
      }

      setSuccessMsg('Configurações salvas e consolidadas no Firestore global e local com sucesso!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Causa do erro de persistência do Firestore:', err);
      setErrorStatus('Não foi possível persistir no Firestore. Detalhes: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleReloadPlanClick = async () => {
    if (!onReloadWeeklyPlan) return;
    setReloadingPlan(true);
    setSuccessMsg(null);
    setErrorStatus(null);
    try {
      let latestGroups = vocabGroups;
      
      // Force regrouping if the vocabulary is not empty and has changed
      const storedVocab = localStorage.getItem('fluent_mandatory_vocab') || '';
      if (vocabularyRaw.trim() && vocabularyRaw !== storedVocab) {
        const response = await apiFetch('/api/group-vocabulary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ vocabulary: vocabularyRaw })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.groups) {
            latestGroups = data.groups;
            setVocabGroups(data.groups);
            safeLocalStorageSet('fluent_mandatory_vocab_groups', JSON.stringify(data.groups));
          }
        }
      }
      safeLocalStorageSet('fluent_mandatory_vocab', vocabularyRaw);
      
      // Sync state to cloud
      if (userId && userId !== 'guest') {
        const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
        const localSnapshot = getLocalStateSnapshot();
        localSnapshot['fluent_mandatory_vocab'] = vocabularyRaw;
        localSnapshot['fluent_mandatory_vocab_groups'] = JSON.stringify(latestGroups);
        await writeStateToCloud(userId, localSnapshot);
      }
      
      // Trigger the plan reload
      await onReloadWeeklyPlan();
      setSuccessMsg('Plano de Ensino recalculado e atualizado com absoluto sucesso no banco do Aluno!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Error reloading plan:", err);
      setErrorStatus('Não foi possível recalcular o plano: ' + (err.message || err));
    } finally {
      setReloadingPlan(false);
    }
  };

  const loadDefaults = () => {
    const confirm = window.confirm('Restaurar os manuais para o texto padrão de fábrica?');
    if (confirm) {
      setManuals({
        personality_manual: DEFAULT_PERSONALITY_MANUAL,
        reaction_manual: DEFAULT_REACTION_MANUAL,
        intimacy_manual: DEFAULT_INTIMACY_MANUAL,
        raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
        naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL || ''
      });
      setSuccessMsg('Manuais padrões de fábrica re-estabelecidos nas caixas de texto. Não esqueça de Salvar!');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleRealignCharacter = async (characterId: string) => {
    if (!simState) return;
    setEvolveLoading(true);
    setEvolveSuccess(null);
    setEvolveLogs([]);
    try {
      const response = await apiFetch('/api/simulator-re-evolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fixed_characters: simState.fixed_characters,
          active_character: simState.active_character,
          character_id: characterId,
          developer_manuals: manuals
        })
      });

      if (!response.ok) {
        throw new Error(`Servidor retornou código ${response.status}`);
      }

      const data = await response.json();
      
      const updatedState = {
        ...simState,
        fixed_characters: data.fixed_characters,
        active_character: data.active_character
      };

      setSimState(updatedState);
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));

      // Sync with cloud if logged in (wrapped in try/catch to gracefully handle Firestore quota exhaustion)
      if (userId && userId !== 'guest') {
        try {
          const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
          const localSnapshot = getLocalStateSnapshot();
          localSnapshot['fluent_sim_state'] = JSON.stringify(updatedState);
          await writeStateToCloud(userId, localSnapshot);
        } catch (cloudErr) {
          console.warn("Could not sync state to Firestore cloud (quota or connection limit exceeded):", cloudErr);
        }
      }

      setEvolveLogs(data.logs || []);
      setEvolveSuccess(`Sucesso! Personagem alinhado retroativamente.`);
    } catch (err: any) {
      console.error("Erro no alinhamento retroativo:", err);
      window.alert("Falha no alinhamento retroativo: " + (err.message || err));
    } finally {
      setEvolveLoading(false);
    }
  };

  const handleRedoCharacter = async (characterId: string, charName: string) => {
    if (!simState) return;

    // Turn on progress overlay
    setRedoProgress({
      active: true,
      percent: 5,
      message: 'Iniciando reconstrução de personalidade para ' + charName + '...'
    });
    setEvolveLoading(true);
    setEvolveSuccess(null);
    setEvolveLogs([]);

    // Smooth progress bar advancement with adaptive speed curve
    let simulatedPercent = 5;
    const progressInterval = setInterval(() => {
      if (simulatedPercent < 98) {
        let increment = 1;
        if (simulatedPercent < 25) {
          increment = Math.floor(Math.random() * 4) + 3; // Fast initial response: +3-6%
        } else if (simulatedPercent < 55) {
          increment = Math.floor(Math.random() * 3) + 2; // Mid stage: +2-4%
        } else if (simulatedPercent < 75) {
          increment = Math.floor(Math.random() * 2) + 1; // Approaching deep stage: +1-2%
        } else if (simulatedPercent < 94) {
          // Slow down but continue moving so it looks active
          increment = Math.random() > 0.4 ? 1 : 0;
        } else {
          // Extremely slow hover near the end to keep the user engaged
          increment = Math.random() > 0.85 ? 1 : 0;
        }

        simulatedPercent += increment;
        if (simulatedPercent > 98) simulatedPercent = 98;

        let statusText = 'Em andamento...';
        if (simulatedPercent < 20) {
          statusText = 'Acessando os manuais de Construção de Personalidade e Reações Humanas...';
        } else if (simulatedPercent < 45) {
          statusText = 'Eliminando dossiê antigo e extraindo essência original (0%)...';
        } else if (simulatedPercent < 70) {
          statusText = 'Simulando e aplicando os saltos de intimidade com a IA (25% a 75%)...';
        } else if (simulatedPercent < 88) {
          statusText = 'Harmonizando novos traços de voz e nuances psicológicas...';
        } else {
          statusText = 'Sincronizando novas diretrizes cognitivas com o simulador (quase pronto)...';
        }

        setRedoProgress(prev => ({
          ...prev,
          percent: simulatedPercent,
          message: statusText
        }));
      }
    }, 550);

    try {
      const response = await apiFetch('/api/simulator-redo-character', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fixed_characters: simState.fixed_characters,
          active_character: simState.active_character,
          character_id: characterId,
          developer_manuals: manuals
        })
      });

      if (!response.ok) {
        throw new Error(`Servidor retornou código ${response.status}`);
      }

      const data = await response.json();
      
      const updatedState = {
        ...simState,
        fixed_characters: data.fixed_characters,
        active_character: data.active_character
      };

      setSimState(updatedState);
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));

      // Sync with cloud if logged in (wrapped in try/catch to gracefully handle Firestore quota exhaustion)
      if (userId && userId !== 'guest') {
        try {
          const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
          const localSnapshot = getLocalStateSnapshot();
          localSnapshot['fluent_sim_state'] = JSON.stringify(updatedState);
          await writeStateToCloud(userId, localSnapshot);
        } catch (cloudErr) {
          console.warn("Could not sync state to Firestore cloud (quota or connection limit exceeded):", cloudErr);
        }
      }

      clearInterval(progressInterval);
      setRedoProgress({
        active: true,
        percent: 100,
        message: 'Concluído com absoluto sucesso!'
      });

      setEvolveLogs(data.logs || []);
      setEvolveSuccess(`Sucesso! Personagem ${charName} teve sua personalidade completamente reconstruída e realinhada com base nos manuais de conduta.`);
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Erro ao refazer personalidade do personagem:", err);
      setErrorStatus("Falha ao refazer personagem: " + (err.message || err));
    } finally {
      setTimeout(() => {
        setRedoProgress({ active: false, percent: 0, message: '' });
        setEvolveLoading(false);
      }, 1000);
    }
  };

  const handleRedoAllCharacters = () => {
    if (!simState || !simState.fixed_characters || simState.fixed_characters.length === 0) {
      setErrorStatus("Nenhum personagem registrado no simulador ativo no momento.");
      return;
    }
    setShowConfirmBatchPopup(true);
  };

  const startBatchRedo = async () => {
    setShowConfirmBatchPopup(false);
    if (!simState || !simState.fixed_characters || simState.fixed_characters.length === 0) return;

    setEvolveLoading(true);
    setEvolveSuccess(null);
    setEvolveLogs([]);

    const total = simState.fixed_characters.length;
    let currentState = { ...simState };

    setBatchRedoProgress({
      active: true,
      currentIndex: 0,
      total,
      currentName: currentState.fixed_characters[0].name || currentState.fixed_characters[0].temporary_title,
      percent: 5,
      message: 'Iniciando reconstrução em lote...'
    });

    const allLogs: string[] = [];

    for (let i = 0; i < total; i++) {
      const char = currentState.fixed_characters[i];
      const charName = char.name || char.temporary_title;

      setBatchRedoProgress(prev => ({
        ...prev,
        currentIndex: i,
        currentName: charName,
        percent: 5,
        message: `Preparando reconstrução para ${charName}...`
      }));

      // Set up the interval for simulated percent of this specific character
      let simulatedPercent = 5;
      const progressInterval = setInterval(() => {
        if (simulatedPercent < 98) {
          let increment = 1;
          if (simulatedPercent < 25) {
            increment = Math.floor(Math.random() * 4) + 3;
          } else if (simulatedPercent < 55) {
            increment = Math.floor(Math.random() * 3) + 2;
          } else if (simulatedPercent < 75) {
            increment = Math.floor(Math.random() * 2) + 1;
          } else if (simulatedPercent < 94) {
            increment = Math.random() > 0.4 ? 1 : 0;
          } else {
            increment = Math.random() > 0.85 ? 1 : 0;
          }

          simulatedPercent += increment;
          if (simulatedPercent > 98) simulatedPercent = 98;

          let statusText = `Processando ${charName}...`;
          if (simulatedPercent < 20) {
            statusText = `[${charName}] Lendo manuais de Construção...`;
          } else if (simulatedPercent < 45) {
            statusText = `[${charName}] Preservando memórias antigas e iniciando re-evolução...`;
          } else if (simulatedPercent < 70) {
            statusText = `[${charName}] Calculando saltos de intimidade sequenciais (score: ${char.relationship_score || 0}%)...`;
          } else if (simulatedPercent < 88) {
            statusText = `[${charName}] Consolidando novas diretrizes cognitivas e traços de voz...`;
          } else {
            statusText = `[${charName}] Sincronizando personalidade com o simulador...`;
          }

          setBatchRedoProgress(prev => ({
            ...prev,
            percent: simulatedPercent,
            message: statusText
          }));
        }
      }, 550);

      try {
        const response = await apiFetch('/api/simulator-redo-character', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fixed_characters: currentState.fixed_characters,
            active_character: currentState.active_character,
            character_id: char.id,
            developer_manuals: manuals
          })
        });

        if (!response.ok) {
          throw new Error(`Servidor retornou erro ${response.status} ao processar ${charName}`);
        }

        const data = await response.json();
        
        // Update currentState sequentially
        currentState = {
          ...currentState,
          fixed_characters: data.fixed_characters,
          active_character: data.active_character
        };

        // Save progress step in localStorage
        setSimState(currentState);
        safeLocalStorageSet('fluent_sim_state', JSON.stringify(currentState));

        // Sync step with cloud if logged in
        if (userId && userId !== 'guest') {
          try {
            const { getLocalStateSnapshot, writeStateToCloud } = await import('../firebase');
            const localSnapshot = getLocalStateSnapshot();
            localSnapshot['fluent_sim_state'] = JSON.stringify(currentState);
            await writeStateToCloud(userId, localSnapshot);
          } catch (cloudErr) {
            console.warn("Could not sync partial batch state to Firestore:", cloudErr);
          }
        }

        if (data.logs && data.logs.length > 0) {
          allLogs.push(...data.logs);
        }

        clearInterval(progressInterval);
        setBatchRedoProgress(prev => ({
          ...prev,
          percent: 100,
          message: `${charName} reconstruído com sucesso!`
        }));

        // Small break between characters so user can see completion
        await new Promise(resolve => setTimeout(resolve, 800));

      } catch (err: any) {
        clearInterval(progressInterval);
        console.error(`Erro ao refazer ${charName}:`, err);
        allLogs.push(`[ERRO - ${charName}]: ${err.message || err}`);
        setEvolveLogs(prev => [...prev, `Falha em ${charName}: ${err.message || err}`]);
      }
    }

    setEvolveLogs(allLogs);
    setEvolveSuccess(`Sucesso! Personalidade de todos os personagens reconstruídas e realinhadas individualmente!`);

    setTimeout(() => {
      setBatchRedoProgress({ active: false, currentIndex: 0, total: 0, currentName: '', percent: 0, message: '' });
      setEvolveLoading(false);
    }, 1500);
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setSuccessMsg(`Sucesso! Os ciclos da conversa do modo Stories foram copiados para a área de transferência.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error("Fallback copy error:", err);
      setErrorStatus("Não foi possível copiar automaticamente para a área de transferência.");
      setTimeout(() => setErrorStatus(null), 4000);
    }
    document.body.removeChild(textArea);
  };

  const handleCopyLast10Cycles = () => {
    try {
      // 1. Obtain freshest simState
      let currentSimState = simState;
      try {
        const raw = localStorage.getItem('fluent_sim_state');
        if (raw) {
          currentSimState = JSON.parse(raw);
        }
      } catch (e) {
        console.warn("Could not read fluent_sim_state from localStorage for copying cycles", e);
      }

      const dialogHistory: any[] = Array.isArray(currentSimState?.dialog_history)
        ? currentSimState.dialog_history
        : [];

      if (dialogHistory.length === 0) {
        setSuccessMsg("Nenhum histórico de conversa do modo Stories foi encontrado para cópia no momento.");
        setTimeout(() => setSuccessMsg(null), 4000);
        return;
      }

      // 2. Group dialogHistory into interaction cycles
      const cycles: { cycleNumber: number; messages: any[] }[] = [];
      let currentCycleMsgs: any[] = [];

      for (const msg of dialogHistory) {
        if (!msg) continue;
        const isUser = msg.sender === 'user';

        if (isUser && currentCycleMsgs.length > 0) {
          cycles.push({
            cycleNumber: cycles.length + 1,
            messages: currentCycleMsgs
          });
          currentCycleMsgs = [];
        }

        currentCycleMsgs.push(msg);
      }

      if (currentCycleMsgs.length > 0) {
        cycles.push({
          cycleNumber: cycles.length + 1,
          messages: currentCycleMsgs
        });
      }

      const totalCycles = cycles.length;
      const selectedCycles = cycles.slice(-10);

      // 3. Format into a clean, legible report
      const activePlace = currentSimState?.active_place || 'Desconhecido';
      const activeChar = currentSimState?.active_character;
      const activeCharName = activeChar 
        ? (activeChar.name_known ? activeChar.name : (activeChar.temporary_title || activeChar.name || 'Personagem'))
        : 'Nenhum';

      let formattedText = `==================================================\n`;
      formattedText += `REGISTRO DE CONVERSA DO MODO STORIES (ÚLTIMOS ${selectedCycles.length} CICLOS)\n`;
      formattedText += `Total de Ciclos no Histórico: ${totalCycles}\n`;
      formattedText += `Ciclos nesta Amostra: ${selectedCycles.length}\n`;
      formattedText += `Local Ativo: ${activePlace} | Personagem Ativo: ${activeCharName}\n`;
      formattedText += `Data e Hora da Extração: ${new Date().toLocaleString('pt-BR')}\n`;
      formattedText += `==================================================\n\n`;

      selectedCycles.forEach((cycle, index) => {
        const realCycleNum = cycle.cycleNumber;
        formattedText += `--------------------------------------------------\n`;
        formattedText += `CICLO ${realCycleNum} (Ciclo ${index + 1} de ${selectedCycles.length} no relatório)\n`;
        formattedText += `--------------------------------------------------\n`;

        cycle.messages.forEach((msg: any) => {
          const sender = msg.sender || 'desconhecido';
          const msgText = msg.text || '';
          const isAction = !!msg.is_action || msgText.startsWith('[Ação:') || msgText.startsWith('[Ação ') || (msgText.trim().startsWith('*') && msgText.trim().endsWith('*'));
          const isThought = !!msg.thought || !!msg.internal_thought || msg.type === 'thought' || msgText.startsWith('[Pensamento:');

          // Sender identification
          let senderLabel = '';
          if (sender === 'user') {
            senderLabel = 'Usuário';
          } else if (sender === 'character') {
            const charName = msg.character_name || msg.character_id || activeCharName;
            senderLabel = `Personagem (${charName})`;
          } else if (sender === 'narrator') {
            senderLabel = 'Narrador / Cena';
          } else {
            senderLabel = `Remetente: ${sender}`;
          }

          // Type identification
          let typeLabel = '';
          if (sender === 'narrator') {
            typeLabel = 'Evento de Cena / Ambiente';
          } else if (isAction) {
            typeLabel = 'Ação / Reação Física';
          } else if (isThought) {
            typeLabel = 'Pensamento Interno';
          } else {
            typeLabel = 'Fala (Diálogo Direto)';
          }

          formattedText += `[${senderLabel}] • [${typeLabel}]:\n`;
          formattedText += `"${msgText}"\n`;

          if (msg.translation && typeof msg.translation === 'string' && msg.translation.trim()) {
            formattedText += `  └ Tradução Registrada: "${msg.translation.trim()}"\n`;
          }
          if ((msg.thought && String(msg.thought).trim()) || (msg.internal_thought && String(msg.internal_thought).trim())) {
            const thoughtVal = String(msg.thought || msg.internal_thought).trim();
            formattedText += `  └ Pensamento Registrado: "${thoughtVal}"\n`;
          }

          formattedText += `\n`;
        });

        formattedText += `\n`;
      });

      formattedText += `==================================================\n`;
      formattedText += `FIM DO REGISTRO DE CICLOS\n`;
      formattedText += `==================================================\n`;

      // 4. Copy to clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(formattedText).then(() => {
          setSuccessMsg(`Sucesso! Os últimos ${selectedCycles.length} ciclo(s) da conversa do modo Stories foram copiados para a área de transferência.`);
          setTimeout(() => setSuccessMsg(null), 4000);
        }).catch((err) => {
          console.error("Clipboard writeText error, falling back:", err);
          fallbackCopyTextToClipboard(formattedText);
        });
      } else {
        fallbackCopyTextToClipboard(formattedText);
      }
    } catch (err: any) {
      console.error("Error copying cycles:", err);
      setErrorStatus("Erro ao tentar copiar os ciclos da conversa: " + (err.message || String(err)));
      setTimeout(() => setErrorStatus(null), 4000);
    }
  };

  return (
    <div id="developer_panel_root" className="w-full max-w-2xl mx-auto py-6 px-4 space-y-6 font-sans">
      
      {/* HEADER CONTROLS */}
      <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-4">
        <button
          onClick={onBack}
          id="dev_back_btn"
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#e2dacb] hover:bg-classic-cream rounded-xl text-xs text-[#8e8574] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Menu</span>
        </button>

        <div className="flex items-center gap-2 text-right">
          <span className="text-[10px] font-mono tracking-wider text-classic-gold uppercase font-bold">Acesso Administrativo</span>
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-classic-gold" />
          <h2 className="text-2xl font-serif font-bold text-classic-ink">Menu do Desenvolvedor</h2>
        </div>
        <p className="text-xs text-[#8e8574] leading-relaxed max-w-xl">
          A configuração e humanização refinadas de cada simulador de inglês são controladas por estes três textos mestres em tempo de execução. Qualquer usuário acessará estas definições armazenadas globalmente.
        </p>
      </div>

      {/* SEÇÃO DE CONTROLE DE SINCRONIZAÇÃO FIRESTORE E AVISO DE COTAS */}
      <div className="bg-[#fcfaf7] border border-[#e8e2d5] rounded-3xl p-5 space-y-4 shadow-3xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="font-serif font-bold text-[#3a352c] text-sm">
              Sincronização com o Firestore
            </h4>
            <p className="text-[11px] text-[#8e8574] leading-relaxed">
              Ative ou desative a sincronização direta com a nuvem do Firebase para testes isolados sem atingir os limites diários de leitura/escrita.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const newValue = !disableFirestoreSync;
              setDisableFirestoreSync(newValue);
              if (newValue) {
                safeLocalStorageSet('fluent_disable_firestore_sync', 'true');
                setSuccessMsg('Sincronização com o Firestore desativada com sucesso! O simulador funcionará em modo 100% local (offline).');
              } else {
                localStorage.removeItem('fluent_disable_firestore_sync');
                setSuccessMsg('Sincronização com o Firestore reativada com sucesso!');
              }
              setTimeout(() => setSuccessMsg(null), 4000);
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-3xs ${
              disableFirestoreSync 
                ? 'bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700' 
                : 'bg-[#F2EDE4] hover:bg-classic-cream border border-[#e8e2d5] text-[#3a352c]'
            }`}
          >
            {disableFirestoreSync ? (
              <>
                <CloudOff className="w-4 h-4 text-rose-600 animate-pulse" />
                <span>Desativada (Modo Local)</span>
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 text-emerald-600" />
                <span>Sincronizando</span>
              </>
            )}
          </button>
        </div>

        {quotaExceeded && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 text-xs text-amber-900 leading-relaxed animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Limite Diário do Firestore Atingido (Resource Exhausted)</p>
                <p className="text-[11px] text-amber-800">
                  O limite diário gratuito de operações de leitura/escrita do Firestore foi atingido por hoje. A sincronização em nuvem foi automaticamente suspensa para evitar erros e lentidão.
                </p>
                <p className="text-[11px] text-amber-800 font-semibold">
                  Seu progresso, novos manuais e alterações estão 100% seguros! O simulador está rodando de forma offline localmente no seu navegador e você pode continuar seus testes normalmente.
                </p>
                <p className="text-[10px] text-amber-700 mt-1.5 font-mono">
                  O reset de cota do Google ocorre de forma automática diariamente à meia-noite no Horário do Pacífico (aproximadamente entre 04:00 e 05:00 da manhã de Brasília).
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('fluent_firestore_quota_exceeded');
                  setQuotaExceeded(false);
                  import('../firebase').then(m => {
                    m.isCloudWriteSuspended = false;
                  });
                  setSuccessMsg('Status de limite de cota limpo. Tentando restabelecer conexão...');
                  setTimeout(() => setSuccessMsg(null), 3000);
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-bold shadow-3xs cursor-pointer transition-colors"
              >
                Limpar Erro e Tentar Reconectar
              </button>
            </div>
          </div>
        )}
      </div>

      {successMsg && (
        <div id="dev_success_alert" className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs leading-relaxed animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorStatus && (
        <div id="dev_error_alert" className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs leading-relaxed animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{errorStatus}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            {/* Dashed outer circular track */}
            <div className="absolute inset-0 rounded-full border border-dashed border-[#dfcbb0]/65 animate-spin" style={{ animationDuration: '8s' }} />
            
            {/* Spinning wrapper for the dot forming a circle */}
            <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-classic-gold shadow-[0_0_8px_rgba(212,163,89,0.6)]" />
            </div>

            <div className="w-11 h-11 rounded-full bg-classic-ivory border border-[#dfcbb0] flex items-center justify-center text-classic-gold z-10">
              <Database className="w-4.5 h-4.5 animate-pulse" />
            </div>
          </div>
          <p className="text-[#8e8574] text-xs font-serif font-medium">Lendo manuais mestres...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          
          {/* SEÇÃO: CONFIGURAÇÃO DOS PROVEDORES DE IA */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-6 space-y-5 shadow-xs">
            <div className="flex justify-between items-start border-b border-[#e2dacb]/60 pb-4">
              <div>
                <h3 className="text-sm font-serif font-bold text-classic-ink flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-classic-gold" />
                  <span>Configuração dos Provedores de IA</span>
                </h3>
                <p className="text-[#8e8574] text-[11px] font-sans mt-1 leading-relaxed">
                  Configure a API Principal e a API Reserva de forma totalmente desacoplada. Cada API possui seu próprio Provedor, API Key e Model ID.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold bg-[#FAF6EE] text-classic-gold px-2.5 py-1 rounded-full border border-[#e2dacb] shrink-0">
                Fallback Desacoplado
              </span>
            </div>

            {/* ERROR & SUCCESS FEEDBACK BANNERS */}
            {aiProviderErrorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs font-sans flex items-center gap-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{aiProviderErrorMsg}</span>
              </div>
            )}

            {aiProviderSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs font-sans flex items-center gap-2 animate-fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{aiProviderSuccessMsg}</span>
              </div>
            )}

            {/* DECOUPLED PROVIDERS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* CARD 1: API PRINCIPAL */}
              <div className="bg-[#FAF8F5] border border-[#e2dacb] rounded-2xl p-4 space-y-3.5">
                <div className="flex justify-between items-center pb-2.5 border-b border-[#e2dacb]/60">
                  <span className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    API Principal
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                    Ativa
                  </span>
                </div>

                {/* PROVEDOR PRINCIPAL */}
                <div className="space-y-1.5">
                  <label htmlFor="primary_provider_select" className="text-xs font-serif font-bold text-classic-ink block">
                    Provedor
                  </label>
                  <select
                    id="primary_provider_select"
                    value={primaryProvider}
                    onChange={(e) => handlePrimaryProviderChange(e.target.value as 'gemini' | 'openrouter')}
                    className="w-full bg-white border border-[#e2dacb] rounded-xl px-3 py-2 text-xs text-classic-ink font-sans focus:outline-none focus:border-classic-gold cursor-pointer transition-colors"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>

                {/* API KEY PRINCIPAL */}
                <div className="space-y-1.5">
                  <label htmlFor="primary_api_key_field" className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-classic-gold" />
                    <span>API Key</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="primary_api_key_field"
                      type={showPrimaryApiKey ? 'text' : 'password'}
                      className="w-full bg-white border border-[#e2dacb] rounded-xl pl-3 pr-20 py-2 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-mono transition-colors"
                      value={primaryApiKey}
                      onChange={(e) => {
                        setPrimaryApiKey(e.target.value);
                        if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
                      }}
                      placeholder={primaryProvider === 'gemini' ? 'AIzaSy...' : 'sk-or-v1-...'}
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPrimaryApiKey(!showPrimaryApiKey)}
                        className="p-1 text-[#8e8574] hover:text-classic-ink rounded-lg transition-colors cursor-pointer"
                        title={showPrimaryApiKey ? "Ocultar chave" : "Mostrar chave"}
                      >
                        {showPrimaryApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {primaryApiKey && (
                        <button
                          type="button"
                          onClick={() => setPrimaryApiKey('')}
                          className="p-1 text-[#8e8574] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Limpar chave"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* MODEL ID PRINCIPAL */}
                <div className="space-y-1.5">
                  <label htmlFor="primary_model_field" className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-classic-gold" />
                    <span>Model ID</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="primary_model_field"
                      type="text"
                      className="w-full bg-white border border-[#e2dacb] rounded-xl pl-3 pr-8 py-2 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-mono transition-colors"
                      value={primaryModelId}
                      onChange={(e) => {
                        setPrimaryModelId(e.target.value);
                        if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
                      }}
                      placeholder={primaryProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL}
                    />
                    {primaryModelId && (
                      <button
                        type="button"
                        onClick={() => setPrimaryModelId('')}
                        className="absolute right-2 p-1 text-[#8e8574] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Limpar modelo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8e8574] font-sans">
                    {primaryProvider === 'gemini' 
                      ? 'Ex: gemini-3.8-flash, gemini-3.1-flash-lite' 
                      : 'Ex: google/gemini-2.5-flash, deepseek/deepseek-chat'}
                  </p>
                </div>
              </div>

              {/* CARD 2: API RESERVA */}
              <div className="bg-[#FAF8F5] border border-[#e2dacb] rounded-2xl p-4 space-y-3.5">
                <div className="flex justify-between items-center pb-2.5 border-b border-[#e2dacb]/60">
                  <span className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    API Reserva
                  </span>
                  <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                    Reserva / Fallback
                  </span>
                </div>

                {/* PROVEDOR RESERVA */}
                <div className="space-y-1.5">
                  <label htmlFor="reserve_provider_select" className="text-xs font-serif font-bold text-classic-ink block">
                    Provedor
                  </label>
                  <select
                    id="reserve_provider_select"
                    value={reserveProvider}
                    onChange={(e) => handleReserveProviderChange(e.target.value as 'gemini' | 'openrouter')}
                    className="w-full bg-white border border-[#e2dacb] rounded-xl px-3 py-2 text-xs text-classic-ink font-sans focus:outline-none focus:border-classic-gold cursor-pointer transition-colors"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>

                {/* API KEY RESERVA */}
                <div className="space-y-1.5">
                  <label htmlFor="reserve_api_key_field" className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-classic-gold" />
                    <span>API Key</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="reserve_api_key_field"
                      type={showReserveApiKey ? 'text' : 'password'}
                      className="w-full bg-white border border-[#e2dacb] rounded-xl pl-3 pr-20 py-2 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-mono transition-colors"
                      value={reserveApiKey}
                      onChange={(e) => {
                        setReserveApiKey(e.target.value);
                        if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
                      }}
                      placeholder={reserveProvider === 'gemini' ? 'AIzaSy...' : 'sk-or-v1-...'}
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowReserveApiKey(!showReserveApiKey)}
                        className="p-1 text-[#8e8574] hover:text-classic-ink rounded-lg transition-colors cursor-pointer"
                        title={showReserveApiKey ? "Ocultar chave" : "Mostrar chave"}
                      >
                        {showReserveApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {reserveApiKey && (
                        <button
                          type="button"
                          onClick={() => setReserveApiKey('')}
                          className="p-1 text-[#8e8574] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Limpar chave"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* MODEL ID RESERVA */}
                <div className="space-y-1.5">
                  <label htmlFor="reserve_model_field" className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-classic-gold" />
                    <span>Model ID</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="reserve_model_field"
                      type="text"
                      className="w-full bg-white border border-[#e2dacb] rounded-xl pl-3 pr-8 py-2 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-mono transition-colors"
                      value={reserveModelId}
                      onChange={(e) => {
                        setReserveModelId(e.target.value);
                        if (aiProviderErrorMsg) setAiProviderErrorMsg(null);
                      }}
                      placeholder={reserveProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL}
                    />
                    {reserveModelId && (
                      <button
                        type="button"
                        onClick={() => setReserveModelId('')}
                        className="absolute right-2 p-1 text-[#8e8574] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Limpar modelo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8e8574] font-sans">
                    {reserveProvider === 'gemini' 
                      ? 'Ex: gemini-3.8-flash, gemini-3.1-flash-lite' 
                      : 'Ex: google/gemini-2.5-flash, deepseek/deepseek-chat'}
                  </p>
                </div>
              </div>
            </div>

            {/* SAVE BUTTON FOR AI PROVIDERS */}
            <div className="pt-2 border-t border-[#e2dacb]/60 flex justify-end">
              <button
                type="button"
                onClick={handleSaveAiProviders}
                className="py-2.5 px-5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-sans font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Configurações de IA</span>
              </button>
            </div>

            {/* DIAGNOSTIC TOOLS & SUMMARY SECTION */}
            <div className="pt-4 border-t border-[#e2dacb]/60 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-classic-gold" />
                  <span>Diagnóstico de Conexão dos Provedores</span>
                </h4>
                <span className="text-[10px] font-mono text-[#8e8574] bg-[#FAF6EE] px-2 py-0.5 rounded border border-[#e2dacb]">
                  Sem Fallback • Validação Direta
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PROVEDOR PRINCIPAL DIAGNOSTIC CARD */}
                <div className="bg-[#FAF8F5] border border-[#e2dacb] rounded-2xl p-4 space-y-3 relative overflow-hidden">
                  <div className="flex justify-between items-center pb-2 border-b border-[#e2dacb]/60">
                    <span className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      API Principal: <strong className="capitalize text-classic-gold">{primaryProvider}</strong>
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                      Ativa
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-sans bg-white p-3 rounded-xl border border-[#e2dacb]/60">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">Provedor:</span>
                      <span className="font-mono font-semibold text-classic-ink capitalize">{primaryProvider}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">Model ID:</span>
                      <span className="font-mono font-semibold text-classic-ink truncate max-w-[180px]" title={primaryModelId || '(Não configurado)'}>
                        {primaryModelId || '(Não configurado)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">API Key:</span>
                      <span className="font-mono font-semibold text-classic-ink">
                        {maskKey(primaryApiKey)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={primaryDiagnostic?.testing}
                    onClick={() => handleTestConnection('primary')}
                    className="w-full py-2.5 px-3 bg-white hover:bg-[#F3EDE2] border border-[#d6cbba] text-classic-ink text-xs font-sans font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {primaryDiagnostic?.testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-classic-gold" />
                        <span>Testando Conexão Principal...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-classic-gold" />
                        <span>Testar Conexão Principal</span>
                      </>
                    )}
                  </button>

                  {/* DIAGNOSTIC RESULT PANEL FOR PRIMARY */}
                  {primaryDiagnostic && !primaryDiagnostic.testing && (
                    <div className={`p-3.5 rounded-xl border text-xs font-sans space-y-2 animate-fade-in ${
                      primaryDiagnostic.success 
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950' 
                        : 'bg-rose-50/90 border-rose-300 text-rose-950'
                    }`}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-black/10 font-bold">
                        <span className="flex items-center gap-1.5">
                          {primaryDiagnostic.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>Status: {primaryDiagnostic.status}</span>
                        </span>
                        {primaryDiagnostic.durationMs !== undefined && (
                          <span className="font-mono text-[10px] bg-white/90 px-2 py-0.5 rounded border border-black/10 flex items-center gap-1 text-slate-800">
                            <Clock className="w-3 h-3 text-emerald-700" />
                            {primaryDiagnostic.durationMs}ms
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-[11px] leading-relaxed">
                        <p className="font-medium">{primaryDiagnostic.message}</p>
                        <div className="text-[10px] text-[#555] font-mono pt-1 border-t border-black/5 grid grid-cols-2 gap-1">
                          <div>Provedor: <span className="font-bold capitalize">{primaryDiagnostic.provider}</span></div>
                          <div>Model ID: <span className="font-bold">{primaryDiagnostic.modelId}</span></div>
                        </div>
                      </div>

                      {!primaryDiagnostic.success && primaryDiagnostic.errorCategory && (
                        <div className="pt-1 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-900 px-2 py-0.5 rounded border border-rose-300">
                            Causa: {primaryDiagnostic.errorCategory}
                          </span>
                        </div>
                      )}

                      {primaryDiagnostic.errorDetails && (
                        <div className="mt-1 p-2 bg-white/80 rounded-lg border border-black/10 text-[10px] font-mono break-all max-h-24 overflow-y-auto text-slate-800">
                          {primaryDiagnostic.errorDetails}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PROVEDOR RESERVA DIAGNOSTIC CARD */}
                <div className="bg-[#FAF8F5] border border-[#e2dacb] rounded-2xl p-4 space-y-3 relative overflow-hidden">
                  <div className="flex justify-between items-center pb-2 border-b border-[#e2dacb]/60">
                    <span className="text-xs font-serif font-bold text-classic-ink flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      API Reserva: <strong className="capitalize text-classic-gold">{reserveProvider}</strong>
                    </span>
                    <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                      Reserva
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-sans bg-white p-3 rounded-xl border border-[#e2dacb]/60">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">Provedor:</span>
                      <span className="font-mono font-semibold text-classic-ink capitalize">{reserveProvider}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">Model ID:</span>
                      <span className="font-mono font-semibold text-classic-ink truncate max-w-[180px]" title={reserveModelId || '(Não configurado)'}>
                        {reserveModelId || '(Não configurado)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#8e8574]">API Key:</span>
                      <span className="font-mono font-semibold text-classic-ink">
                        {maskKey(reserveApiKey)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={reserveDiagnostic?.testing}
                    onClick={() => handleTestConnection('reserve')}
                    className="w-full py-2.5 px-3 bg-white hover:bg-[#F3EDE2] border border-[#d6cbba] text-classic-ink text-xs font-sans font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {reserveDiagnostic?.testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-classic-gold" />
                        <span>Testando Conexão Reserva...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-classic-gold" />
                        <span>Testar Conexão Reserva</span>
                      </>
                    )}
                  </button>

                  {/* DIAGNOSTIC RESULT PANEL FOR RESERVE */}
                  {reserveDiagnostic && !reserveDiagnostic.testing && (
                    <div className={`p-3.5 rounded-xl border text-xs font-sans space-y-2 animate-fade-in ${
                      reserveDiagnostic.success 
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950' 
                        : 'bg-rose-50/90 border-rose-300 text-rose-950'
                    }`}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-black/10 font-bold">
                        <span className="flex items-center gap-1.5">
                          {reserveDiagnostic.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>Status: {reserveDiagnostic.status}</span>
                        </span>
                        {reserveDiagnostic.durationMs !== undefined && (
                          <span className="font-mono text-[10px] bg-white/90 px-2 py-0.5 rounded border border-black/10 flex items-center gap-1 text-slate-800">
                            <Clock className="w-3 h-3 text-emerald-700" />
                            {reserveDiagnostic.durationMs}ms
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-[11px] leading-relaxed">
                        <p className="font-medium">{reserveDiagnostic.message}</p>
                        <div className="text-[10px] text-[#555] font-mono pt-1 border-t border-black/5 grid grid-cols-2 gap-1">
                          <div>Provedor: <span className="font-bold capitalize">{reserveDiagnostic.provider}</span></div>
                          <div>Model ID: <span className="font-bold">{reserveDiagnostic.modelId}</span></div>
                        </div>
                      </div>

                      {!reserveDiagnostic.success && reserveDiagnostic.errorCategory && (
                        <div className="pt-1 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-900 px-2 py-0.5 rounded border border-rose-300">
                            Causa: {reserveDiagnostic.errorCategory}
                          </span>
                        </div>
                      )}

                      {reserveDiagnostic.errorDetails && (
                        <div className="mt-1 p-2 bg-white/80 rounded-lg border border-black/10 text-[10px] font-mono break-all max-h-24 overflow-y-auto text-slate-800">
                          {reserveDiagnostic.errorDetails}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* MANUAL 1: PERSONALITY */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <label htmlFor="personality_manual_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <span className="text-classic-gold font-mono">1</span> 
                Como construir personalidades humanas e profundas
              </label>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full">
                {manuals.personality_manual.length} carácteres
              </span>
            </div>
            <textarea
              id="personality_manual_field"
              className="w-full h-36 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={manuals.personality_manual}
              onChange={(e) => setManuals({ ...manuals, personality_manual: e.target.value })}
              required
              placeholder="Diretrizes estruturadas para construir um dossiê humano refinado..."
            />
          </div>

          {/* MANUAL 2: REACTION & RESPONSE */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <label htmlFor="reaction_manual_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <span className="text-classic-gold font-mono">2</span> 
                Como reagir e responder de modo humano e realista
              </label>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full">
                {manuals.reaction_manual.length} carácteres
              </span>
            </div>
            <textarea
              id="reaction_manual_field"
              className="w-full h-36 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={manuals.reaction_manual}
              onChange={(e) => setManuals({ ...manuals, reaction_manual: e.target.value })}
              required
              placeholder="Instruções para regular a conversa: brevidade, perguntas curtas, etc..."
            />
          </div>

          {/* MANUAL 3: INTIMACY EVOLUTION */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <label htmlFor="intimacy_manual_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <span className="text-classic-gold font-mono">3</span> 
                Como aprofundar conforme aumento da intimidade
              </label>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full">
                {manuals.intimacy_manual.length} carácteres
              </span>
            </div>
            <textarea
              id="intimacy_manual_field"
              className="w-full h-36 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={manuals.intimacy_manual}
              onChange={(e) => setManuals({ ...manuals, intimacy_manual: e.target.value })}
              required
              placeholder="Fases de progressão do score e o redesenho dinâmico de proximidade..."
            />
          </div>

          {/* MANUAL 4: RAW MATERIAL (COMO FAZER A MATÉRIA PRIMA) */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <label htmlFor="raw_material_manual_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <span className="text-classic-gold font-mono">4</span> 
                Como fazer a matéria-prima (tipos de personalidade e arquétipos)
              </label>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full">
                {(manuals.raw_material_manual || '').length} carácteres
              </span>
            </div>
            <textarea
              id="raw_material_manual_field"
              className="w-full h-36 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={manuals.raw_material_manual || ''}
              onChange={(e) => setManuals({ ...manuals, raw_material_manual: e.target.value })}
              required
              placeholder="Instruções para selecionar e fabricar a matéria-prima de personalidade (arquétipos, signos, etc)..."
            />
          </div>

          {/* MANUAL 5: MANUAL DE AUDITORIA DE NATURALIDADE */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <label htmlFor="naturalness_audit_manual_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <span className="text-classic-gold font-mono">5</span> 
                Manual de Auditoria de Naturalidade
              </label>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full">
                {(manuals.naturalness_audit_manual || '').length} carácteres
              </span>
            </div>
            <textarea
              id="naturalness_audit_manual_field"
              className="w-full h-36 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={manuals.naturalness_audit_manual || ''}
              onChange={(e) => setManuals({ ...manuals, naturalness_audit_manual: e.target.value })}
              placeholder="Diretrizes para auditoria e ajuste de naturalidade das respostas..."
            />
          </div>

          {/* VOCABULÁRIO OBRIGATÓRIO (MANDATORY VOCABULARY) SECTION */}
          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
            <div className="flex justify-between items-start">
              <div>
                <label htmlFor="vocabulary_raw_field" className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                  <span className="text-classic-gold font-mono">6</span> 
                  Vocabulário Obrigatório (Curso Particular)
                </label>
                <p className="text-[#8e8574] text-[11px] font-sans mt-1 leading-relaxed">
                  Insira manualmente termos ou expressões em inglês separados por ponto e vírgula (<strong className="font-mono font-bold text-classic-gold">;</strong>) para serem priorizados no Plano de Estudos.
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold bg-[#FAF6EE] text-[#8e8574] px-2 py-0.5 rounded-full shrink-0">
                {vocabularyRaw ? vocabularyRaw.split(';').filter(Boolean).length : 0} palavras
              </span>
            </div>

            <textarea
              id="vocabulary_raw_field"
              className="w-full h-28 bg-[#FAF8F5] border border-[#e2dacb] rounded-xl p-3.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-sans leading-relaxed transition-colors"
              value={vocabularyRaw}
              onChange={(e) => setVocabularyRaw(e.target.value)}
              placeholder="therefore;more or less;house;above;behind;crime scene;take care of"
            />

            {/* List of currently identified semantic groups and words */}
            {vocabGroups && vocabGroups.length > 0 && (
              <div className="bg-[#FAF8F5] border border-[#e8e2d5] rounded-2xl p-4 space-y-3 font-sans text-xs">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#8e8574] flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-classic-gold" />
                  <span>Agrupamento Semântico Atualizado (Gemini)</span>
                </div>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {vocabGroups.map((group: any, idx: number) => (
                    <div key={idx} className="border-b border-[#e2dacb]/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-serif font-bold text-classic-ink text-xs">{group.topic}</span>
                        <span className="text-[9.5px] px-1.5 py-0.5 bg-amber-50 border border-[#dfcbb0] text-classic-gold rounded-full font-mono">
                          {group.grammarNodeId || 'Outros'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {group.words && group.words.map((w: any, wIdx: number) => (
                          <span key={wIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#e2dacb] text-[10.5px] rounded-lg text-stone-700">
                            <span className="font-medium font-serif">{w.word}</span>
                            <span className="text-[9px] text-[#8e8574] font-sans">({w.translation})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reloading Teaching Plan Button inside the card for contextual clarity */}
            <div className="pt-2 border-t border-[#e2dacb]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[10.5px] text-[#8e8574] leading-relaxed font-sans max-w-sm">
                Gere e reconstrua o cronograma completo do Curso para injetar esse vocabulário de forma prioritária nas primeiras semanas do aluno.
              </div>
              <button
                type="button"
                disabled={reloadingPlan || grouping}
                onClick={handleReloadPlanClick}
                className="py-2.5 px-4 bg-classic-gold hover:bg-[#cbb58c] text-white text-xs font-sans font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                {reloadingPlan || grouping ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Recarregar Plano de Ensino</span>
              </button>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="flex gap-3 justify-end items-center pt-2 font-sans text-xs">
            <button
              type="button"
              onClick={loadDefaults}
              className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer transition-colors"
            >
              Restaurar Padrão
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-3 bg-classic-green hover:bg-classic-green-light text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors disabled:opacity-60"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Salvar Configurações</span>
            </button>
          </div>
        </form>
      )}

      {/* SEÇÃO: EXPORTAR / COPIAR CICLOS DA CONVERSA (STORIES) */}
      {!loading && (
        <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-classic-gold" />
                <span>Auditoria de Conversa do Modo Stories</span>
              </h3>
              <p className="text-[11px] text-[#8e8574] leading-relaxed">
                Copia os 10 ciclos mais recentes da conversa ativa do modo Stories para a área de transferência em formato limpo e legível.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyLast10Cycles}
              id="btn_copy_last_10_cycles"
              className="px-4 py-2.5 bg-classic-gold hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs shrink-0"
              title="Copiar os 10 ciclos mais recentes da conversa"
            >
              <Copy className="w-4 h-4 text-white" />
              <span>Copiar últimos 10 ciclos</span>
            </button>
          </div>
        </div>
      )}

      {/* SEÇÃO: ATUALIZAR PERSONAGENS (STORIES) */}
      {!loading && simState && (
        <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-classic-gold animate-pulse" />
              Alinhamento Retroativo de Personagens (Modo Stories)
            </h3>
            <p className="text-[11px] text-[#8e8574] leading-relaxed">
              Caso você já tenha jogado histórias anteriormente, seus personagens podem possuir alta intimidade [%], mas sem as expansões de personalidade associadas de 25% em 25%.
              <strong className="block mt-1 text-classic-ink">💡 Clique em qualquer personagem abaixo para auditar sua "Folha de Personalidade" construída!</strong>
            </p>
          </div>

          {((simState.fixed_characters || []) as any[]).length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/40 border border-rose-200/55 p-3.5 rounded-2xl">
              <div className="text-left text-[11px] text-[#7c6950] leading-relaxed max-w-sm">
                <span className="font-bold text-rose-800 block mb-0.5">⚡ Lote de Reconstrução Absoluta:</span>
                Refaz a personalidade de todos os personagens da lista, um de cada vez. Esse processo prioriza a máxima qualidade de escrita, processando sequencialmente sem poupar tempo.
              </div>
              <button
                type="button"
                disabled={evolveLoading}
                onClick={handleRedoAllCharacters}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0"
                title="Refaz a personalidade de todos os personagens da lista sequencialmente, garantindo a qualidade de escrita de cada um."
              >
                <Sparkles className="w-4 h-4 text-white animate-pulse" />
                <span>Reconstruir Toda a Lista (Um por Um)</span>
              </button>
            </div>
          )}

          {/* LIST OF CHARACTERS */}
          <div className="space-y-3.5 border-t border-[#f2ece0] pt-4">
            {((simState.fixed_characters || []) as any[]).length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-2">Nenhum personagem registrado nesta simulação ativa ainda.</p>
            ) : (
              ((simState.fixed_characters || []) as any[]).map((char: any, idx: number) => {
                const score = char.relationship_score ?? 0;
                const lastEvolved = char.last_evolved_intimacy ?? 0;
                const targetTh = getLatestIntimacyMilestone(score);
                const pendingSteps = getIntimacyMilestonesInRange(lastEvolved, targetTh).length;

                return (
                  <div 
                    key={char.id || idx} 
                    onClick={() => {
                      setSelectedChar(char);
                      setCharModalTab('profile');
                    }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#FAF8F5] border border-[#f0e9dd] hover:border-classic-gold/50 hover:bg-[#FDFCFB] p-4 rounded-2xl text-xs gap-3 transition-all duration-200 cursor-pointer group hover:shadow-xs"
                    title="Clique para inspecionar folha-personalidade"
                  >
                    <div className="space-y-1">
                      <p className="font-bold text-classic-ink font-serif group-hover:text-classic-gold transition-colors flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#8e8574] shrink-0" />
                        <span>{char.name || char.temporary_title}</span>
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#8e8574]">
                        <p>Score: <span className="font-semibold text-classic-gold font-mono">{score}%</span></p>
                        <p>Alinhado: <span className="font-semibold font-mono">{lastEvolved}%</span></p>
                        {pendingSteps > 0 ? (
                          <span className="text-amber-600 font-medium font-serif">({pendingSteps} pendente(s))</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 ml-auto sm:ml-0" onClick={(e) => e.stopPropagation()}>
                      {/* Action buttons */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRawMaterial(char);
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 text-amber-800 font-bold text-[10px] rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Visualizar a matéria-prima e arquétipo de temperamento criados para este personagem"
                      >
                        <Database className="w-3.5 h-3.5 text-amber-600" />
                        <span>Matéria prima</span>
                      </button>

                      <button
                        type="button"
                        disabled={evolveLoading}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleRealignCharacter(char.id);
                        }}
                        className="px-2.5 py-1.5 bg-[#FAF6EE] hover:bg-[#F2EFE8] border border-[#dfd7c5] hover:border-[#b0a590] text-classic-ink font-bold text-[10px] rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        title="Executa apenas os incrementos/saltos de intimidade pendentes para este personagem"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-classic-gold ${evolveLoading ? 'animate-spin' : ''}`} />
                        <span>Realinhar</span>
                      </button>

                      <button
                        type="button"
                        disabled={evolveLoading}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRedoConfirmation({ id: char.id, name: char.name || char.temporary_title });
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-700 font-bold text-[10px] rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        title="Apaga a folha de personalidade estendida atual, preserva os traços originais iniciais e gera sequencialmente todos os passos desde 0% até o nível atual"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                        <span>Refazer</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* LOGS OUTPUT */}
          {evolveLogs.length > 0 && (
            <div className="bg-[#FAF8F5] border border-[#ebdcc1] rounded-2xl p-3 space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-mono font-bold text-classic-gold uppercase">Logs de Alinhamento:</p>
              {evolveLogs.map((log, lIdx) => (
                <p key={lIdx} className="text-[10px] font-mono text-classic-ink leading-relaxed">
                  ➔ {log}
                </p>
              ))}
            </div>
          )}

          {evolveSuccess && (
            <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 p-3.5 rounded-xl">
              {evolveSuccess}
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO: RECUPERAÇÃO DE PERSONAGENS DO HISTÓRICO */}
      {!loading && simState && (
        <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-sm font-serif font-bold text-classic-ink flex items-center gap-1.5">
              <Database className="w-4 h-4 text-classic-gold" />
              Personagens Anteriores Detectados no Histórico
            </h3>
            <p className="text-[11px] text-[#8e8574] leading-relaxed">
              Ferramenta emergencial para identificar e recuperar personagens que possuam registros no histórico mas que foram omitidos nas respostas recentes da IA.
            </p>
          </div>

          <div className="space-y-3.5 border-t border-[#f2ece0] pt-4">
            {getMissingCharacters().length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-2">
                Nenhum personagem omitido ou perdido detectado no histórico de simulação.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-end pr-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleRecoverAllCharacters(getMissingCharacters())}
                    className="px-3 py-1.5 bg-classic-gold text-white font-bold text-[10px] rounded-xl hover:bg-classic-gold-light transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Recuperar Todos ({getMissingCharacters().length})</span>
                  </button>
                </div>
                
                {getMissingCharacters().map((char: any, idx: number) => {
                  const score = char.relationship_score ?? 0;
                  const level = char.relationship_level || 'Stranger';
                  const pDesc = char.personality || char.personality_sheet || '';
                  const truncatedDesc = pDesc.length > 120 ? pDesc.slice(0, 120) + "..." : pDesc;
                  
                  return (
                    <div 
                      key={char.id || `missing_${idx}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#FAF8F5] border border-[#f0e9dd] hover:border-classic-gold/40 p-4 rounded-2xl text-xs gap-3 transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-classic-ink font-serif text-sm">
                            {char.name || char.temporary_title}
                          </p>
                          {char.temporary_title && char.name && (
                            <span className="text-[10px] px-2 py-0.5 bg-classic-gold/10 text-classic-gold font-medium rounded-full">
                              {char.temporary_title}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-[11px] text-[#5c5344] leading-relaxed">
                          <p>
                            <span className="font-semibold text-classic-ink">Profissão:</span> {char.profession || 'Não especificada'} • <span className="font-semibold text-[#3c362d]">Idade:</span> {char.age || 'Não especificada'}
                          </p>
                          {truncatedDesc && (
                            <p className="mt-1 text-[10px] text-[#8e8574] italic">
                              "{truncatedDesc}"
                            </p>
                          )}
                          {char.memories && char.memories.length > 0 && (
                            <p className="mt-1.5 text-[9.5px] text-classic-gold font-semibold font-mono flex items-center gap-1">
                              <span>🧠 {char.memories.length} memórias salvas</span>
                              {char.encounters_count && <span>• {char.encounters_count} encontros</span>}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-3 text-[10px] text-[#8e8574] font-mono pt-0.5">
                          <span>Nível: <strong className="text-classic-ink">{level}</strong></span>
                          <span>Intimidade: <strong className="text-classic-gold">{score}%</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center text-xs">
                        <button
                          type="button"
                          onClick={() => handleRecoverCharacter(char)}
                          className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-classic-gold/5 border border-classic-gold text-classic-gold font-bold text-[10px] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Recuperar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL POPUP - FOLHA-PERSONALIDADE DO PERSONAGEM */}
      {selectedChar && (
        <div id="character_sheet_modal_overlay" className="fixed inset-0 bg-[#343028]/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div 
            id="character_sheet_modal_card" 
            className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-lg rounded-3xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-slideUp font-sans"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#ebdcc1] px-5 py-4 bg-[#F2EDE4]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-classic-gold" />
                <div>
                  <h3 className="font-serif font-bold text-[#3a352c] text-sm leading-tight">
                    {selectedChar.name || selectedChar.temporary_title}
                  </h3>
                  <p className="text-[10px] text-[#8e8574] font-medium uppercase tracking-wider mt-0.5">
                    Folha-Personalidade em Tempo de Execução
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedChar(null)}
                className="p-1 px-1.5 border border-[#dfd7c5] hover:bg-classic-cream rounded-lg text-[#8e8574] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="flex border-b border-[#ebdcc1] bg-[#FAF8F5] px-5 pt-2 gap-2 text-xs font-serif font-bold">
              <button
                type="button"
                onClick={() => setCharModalTab('profile')}
                className={`py-2 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  charModalTab === 'profile'
                    ? 'border-classic-gold text-classic-ink bg-white rounded-t-xl'
                    : 'border-transparent text-[#8e8574] hover:text-classic-ink'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Dossiê e Perfil</span>
              </button>

              <button
                type="button"
                onClick={() => setCharModalTab('wishes')}
                className={`py-2 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  charModalTab === 'wishes'
                    ? 'border-classic-gold text-classic-ink bg-white rounded-t-xl'
                    : 'border-transparent text-[#8e8574] hover:text-classic-ink'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-classic-gold" />
                <span>Desejos de Hoje</span>
                {(selectedChar.relationship_score ?? 0) > 599 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Desejos Diários Ativos" />
                )}
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#3c362d] leading-relaxed">
              {charModalTab === 'profile' ? (
                <>
                  {/* Quick Status Badges */}
                  <div className="grid grid-cols-2 gap-2 bg-[#FAF8F5] border border-[#f0e9dd] p-3 rounded-2xl">
                    <div>
                      <p className="text-[10px] text-[#8e8574] uppercase font-bold tracking-wider">Score Intimidade</p>
                      <p className="text-sm font-semibold font-serif text-classic-gold mt-0.5">
                        {selectedChar.relationship_score ?? 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8e8574] uppercase font-bold tracking-wider">Última Re-evolução</p>
                      <p className="text-sm font-semibold font-serif text-classic-ink mt-0.5">
                        {selectedChar.last_evolved_intimacy ?? 0}%
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Description if any */}
                  {selectedChar.roleplay_dynamic_description && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#8e8574] font-mono">Dossiê Situacional e Dinâmica</p>
                      <p className="bg-[#FAF8F5] border border-[#ebdcc1] rounded-xl p-3 text-xs italic text-[#5c5344]">
                        "{selectedChar.roleplay_dynamic_description}"
                      </p>
                    </div>
                  )}

                  {/* Memories list */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-[#8e8574] font-mono flex items-center gap-1">
                      <span>🧠 Registro de Memórias e Diálogos Recentes</span>
                      <span className="font-sans font-normal text-[#8e8574] bg-[#FAF6EE] border border-[#e2dacb] text-[9px] px-1.5 rounded-full">
                        {Array.isArray(selectedChar.memories) ? selectedChar.memories.length : 0}
                      </span>
                    </p>
                    {Array.isArray(selectedChar.memories) && selectedChar.memories.length > 0 ? (
                      <ul className="space-y-1 bg-[#FAF8F5] border border-[#f0e9dd] rounded-xl p-3 max-h-28 overflow-y-auto list-disc pl-5 text-[11px] text-[#5c5344]">
                        {selectedChar.memories.map((mem: string, mIdx: number) => (
                          <li key={mIdx} className="leading-normal">{mem}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] italic text-[#a39a89] bg-[#FAF8F5] border border-[#f0e9dd] rounded-xl p-3 text-center">
                        Nenhuma memória específica registrada ainda nos diálogos realizados.
                      </p>
                    )}
                  </div>

                  {/* Personality Sheet Sheet text (Editable) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#8e8574] font-mono">
                        Dossiê Completo de Personalidade (Editável)
                      </p>
                      {personalitySaveSuccess && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 animate-fadeIn">
                          <Check className="w-3 h-3 text-emerald-600" /> Salvo com sucesso!
                        </span>
                      )}
                    </div>

                    <textarea
                      value={editedPersonalityText}
                      onChange={(e) => setEditedPersonalityText(e.target.value)}
                      placeholder="Digite ou edite a folha de personalidade do personagem aqui..."
                      rows={10}
                      className="w-full bg-[#1e1e1e] text-slate-200 font-mono text-[10px] p-3.5 rounded-2xl border border-stone-800 focus:border-classic-gold focus:outline-none resize-y leading-relaxed shadow-inner transition-colors"
                    />

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSavePersonality}
                        className="px-3.5 py-1.5 bg-classic-gold hover:bg-classic-gold-light text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Folha de Personalidade</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4 font-sans text-xs">
                  {(selectedChar.relationship_score ?? 0) <= 599 ? (
                    <div className="bg-[#FAF8F5] border border-[#f0e9dd] p-5 rounded-2xl text-center space-y-2">
                      <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                        <Shield className="w-5 h-5 text-amber-600" />
                      </div>
                      <p className="font-serif font-bold text-classic-ink text-sm">
                        Sistema de Desejos Diários Inativo
                      </p>
                      <p className="text-xs text-[#8e8574] leading-relaxed max-w-sm mx-auto">
                        Esta funcionalidade é ativada exclusivamente para personagens cuja intimidade seja superior a <strong>599%</strong>.
                      </p>
                      <div className="pt-2 text-[11px] font-mono text-classic-gold font-semibold">
                        Intimidade Atual de {selectedChar.name || selectedChar.temporary_title}: {selectedChar.relationship_score ?? 0}% (Necessário: &gt; 599%)
                      </div>
                      <div className="pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            const updatedChar = { ...selectedChar, relationship_score: 600 };
                            setSelectedChar(updatedChar);
                            if (simState) {
                              const updatedFixed = (simState.fixed_characters || []).map((c: any) => c.id === selectedChar.id ? updatedChar : c);
                              const updatedActive = simState.active_character?.id === selectedChar.id ? updatedChar : simState.active_character;
                              const updatedState = { ...simState, fixed_characters: updatedFixed, active_character: updatedActive };
                              setSimState(updatedState);
                              safeLocalStorageSet('fluent_sim_state', JSON.stringify(updatedState));
                            }
                          }}
                          className="px-3 py-1.5 bg-classic-gold/10 hover:bg-classic-gold/20 text-classic-gold border border-classic-gold/30 rounded-xl font-bold text-[10.5px] transition-colors cursor-pointer"
                        >
                          🧪 [Dev Test] Definir Intimidade como 600% para Testar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Active Wishes for Today */}
                      <div className="bg-[#FAF8F5] border border-[#ebdcc1] p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between border-b border-[#f0e9dd] pb-2.5">
                          <div>
                            <h4 className="font-serif font-bold text-classic-ink text-sm flex items-center gap-1.5">
                              <span>🌟 Desejos de Hoje</span>
                              <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-sans font-semibold">
                                Ativo (&gt; 599%)
                              </span>
                            </h4>
                            <p className="text-[10px] text-[#8e8574] mt-0.5">
                              Dia {selectedChar.daily_wishes?.day || simState?.day_count || 1} • {selectedChar.daily_wishes?.date || simState?.date || 'Hoje'}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={generatingWishes}
                            onClick={handleGenerateWishesForSelectedChar}
                            className="px-3 py-1.5 bg-classic-gold hover:bg-classic-gold-light text-white font-bold text-[10.5px] rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50 shrink-0"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${generatingWishes ? 'animate-spin' : ''}`} />
                            <span>{selectedChar.daily_wishes ? 'Regerar Desejos' : 'Gerar Desejos'}</span>
                          </button>
                        </div>

                        {selectedChar.daily_wishes ? (
                          <div className="space-y-3 pt-1">
                            {/* Manhã */}
                            <div className="bg-amber-50/60 border border-amber-200/60 p-3 rounded-xl space-y-1.5">
                              <p className="text-[10.5px] font-bold font-serif text-amber-900 flex items-center gap-1">
                                <span>🌅 Manhã (3 Desejos)</span>
                              </p>
                              <ul className="space-y-1 list-disc pl-4 text-[11px] text-amber-950">
                                {(selectedChar.daily_wishes.morning || []).map((w: string, i: number) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>

                            {/* Tarde */}
                            <div className="bg-orange-50/60 border border-orange-200/60 p-3 rounded-xl space-y-1.5">
                              <p className="text-[10.5px] font-bold font-serif text-orange-900 flex items-center gap-1">
                                <span>☀️ Tarde (3 Desejos)</span>
                              </p>
                              <ul className="space-y-1 list-disc pl-4 text-[11px] text-orange-950">
                                {(selectedChar.daily_wishes.afternoon || []).map((w: string, i: number) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>

                            {/* Noite */}
                            <div className="bg-indigo-50/60 border border-indigo-200/60 p-3 rounded-xl space-y-1.5">
                              <p className="text-[10.5px] font-bold font-serif text-indigo-900 flex items-center gap-1">
                                <span>🌙 Noite (3 Desejos)</span>
                              </p>
                              <ul className="space-y-1 list-disc pl-4 text-[11px] text-indigo-950">
                                {(selectedChar.daily_wishes.evening || []).map((w: string, i: number) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-slate-500 italic text-[11px] space-y-2">
                            <p>Nenhum desejo gerado para o dia de hoje ainda.</p>
                            <button
                              type="button"
                              disabled={generatingWishes}
                              onClick={handleGenerateWishesForSelectedChar}
                              className="px-4 py-2 bg-classic-gold hover:bg-classic-gold-light text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                              Gerar 9 Desejos Agora
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Historical Wishes for Past Days */}
                      <div className="space-y-2 pt-2 border-t border-[#f0e9dd]">
                        <h4 className="font-serif font-bold text-classic-ink text-xs flex items-center gap-1.5">
                          <span>📜 Histórico de Desejos de Dias Anteriores</span>
                          <span className="text-[9.5px] font-mono text-[#8e8574]">
                            ({Array.isArray(selectedChar.daily_wishes_history) ? selectedChar.daily_wishes_history.length : 0} registro(s))
                          </span>
                        </h4>

                        {Array.isArray(selectedChar.daily_wishes_history) && selectedChar.daily_wishes_history.length > 0 ? (
                          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                            {selectedChar.daily_wishes_history.map((hist: any, hIdx: number) => (
                              <div key={hIdx} className="bg-[#FAF8F5] border border-[#f0e9dd] p-3 rounded-xl space-y-2">
                                <p className="text-[10px] font-bold font-mono text-classic-gold uppercase">
                                  Dia {hist.day} • {hist.date}
                                </p>
                                <div className="grid grid-cols-1 gap-1.5 text-[10.5px] text-[#5c5344]">
                                  <div><strong>🌅 Manhã:</strong> {(hist.morning || []).join("; ")}</div>
                                  <div><strong>☀️ Tarde:</strong> {(hist.afternoon || []).join("; ")}</div>
                                  <div><strong>🌙 Noite:</strong> {(hist.evening || []).join("; ")}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10.5px] italic text-[#a39a89] bg-[#FAF8F5] border border-[#f0e9dd] rounded-xl p-3 text-center">
                            Nenhum histórico de dias anteriores armazenado ainda.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#ebdcc1] p-4 bg-[#F2EDE4] text-right">
              <button
                type="button"
                onClick={() => setSelectedChar(null)}
                className="px-4 py-2 bg-classic-gold hover:bg-classic-gold-light text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm transition-colors"
              >
                Fechar Dossiê
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP - MATÉRIA PRIMA DO PERSONAGEM */}
      {viewingRawMaterial && (
        <div id="raw_material_modal_overlay" className="fixed inset-0 bg-[#343028]/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div 
            id="raw_material_modal_card" 
            className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-lg rounded-3xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-slideUp font-sans"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#ebdcc1] px-5 py-4 bg-[#F2EDE4]">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-600 animate-pulse" />
                <div>
                  <h3 className="font-serif font-bold text-[#3a352c] text-sm leading-tight">
                    Matéria-Prima: {viewingRawMaterial.name || viewingRawMaterial.temporary_title}
                  </h3>
                  <p className="text-[10px] text-[#8e8574] font-medium uppercase tracking-wider mt-0.5">
                    Arquétipo de Base e Temperamento Inicial
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingRawMaterial(null)}
                className="p-1 px-1.5 border border-[#dfd7c5] hover:bg-classic-cream rounded-lg text-[#8e8574] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#3c362d] leading-relaxed">
              <div className="bg-[#FAF8F5] border border-[#f0e9dd] p-3 rounded-2xl space-y-1">
                <p className="text-[10px] text-[#8e8574] uppercase font-bold tracking-wider">Como esta matéria-prima é usada?</p>
                <p className="text-[11px] text-[#5c4f3c]">
                  Este texto descreve as tendências temperamentais brutas e o "esqueleto" psicológico inicial do personagem. Ele serve de matéria-prima inicial que moldará as diretrizes de personalidade complexa do personagem sem alterar memórias ou o progresso de intimidade já existente.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[#8e8574] font-mono">
                    Matéria-Prima Registrada (Editável)
                  </p>
                  {rawMaterialSaveSuccess && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 animate-fadeIn">
                      <Check className="w-3 h-3 text-emerald-600" /> Salvo com sucesso!
                    </span>
                  )}
                </div>

                <textarea
                  value={editedRawMaterialText}
                  onChange={(e) => setEditedRawMaterialText(e.target.value)}
                  placeholder="Digite ou edite a matéria-prima do personagem aqui..."
                  rows={8}
                  className="w-full bg-[#FAF8F5] text-[#3a352c] font-sans text-xs p-3.5 rounded-2xl border border-[#ebdcc1] focus:border-classic-gold focus:outline-none resize-y italic leading-relaxed shadow-inner transition-colors"
                />

                <div className="flex justify-between items-center pt-1">
                  {(!viewingRawMaterial.raw_material && (
                    <p className="text-[10px] text-[#8e8574] italic">
                      Este personagem não possui matéria-prima inicial. Você pode escrever acima ou usar "Refazer".
                    </p>
                  )) || <div />}

                  <button
                    type="button"
                    onClick={handleSaveRawMaterial}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Matéria-Prima</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#ebdcc1] p-4 bg-[#F2EDE4] text-right">
              <button
                type="button"
                onClick={() => setViewingRawMaterial(null)}
                className="px-4 py-2 bg-classic-gold hover:bg-classic-gold-light text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm transition-colors"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP - CONFIRMAR RECOSTRUCÃO COMPLETA (REFAZER) */}
      {redoConfirmation && (
        <div id="redo_confirm_modal_overlay" className="fixed inset-0 bg-[#343028]/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-md rounded-3xl shadow-2xl p-6 text-center space-y-4 animate-slideUp font-sans">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <Sparkles className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>
            
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-[#3a352c] text-base leading-tight">
                Refazer personalidade de {redoConfirmation.name}?
              </h3>
              <p className="text-xs text-[#8e8574] leading-relaxed">
                A personalidade estendida atual de {redoConfirmation.name} será totalmente excluída e reconstruída do zero baseada na essência original, passando sequencialmente por todos os saltos de intimidade de 25% até o patamar atual.
              </p>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-2xl text-[11px] text-amber-800 text-left leading-relaxed">
              <strong>✨ O que será preservado:</strong> Todo o histórico de memória, interações passadas e o score atual de intimidade do personagem.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRedoConfirmation(null)}
                className="flex-1 px-4 py-2 bg-white hover:bg-neutral-50 border border-stone-200 hover:border-stone-300 text-stone-600 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = redoConfirmation.id;
                  const targetName = redoConfirmation.name;
                  setRedoConfirmation(null);
                  await handleRedoCharacter(targetId, targetName);
                }}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm transition-colors"
              >
                Confirmar e Refazer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP - BARRA DE PROGRESSO DO REFAZER */}
      {redoProgress.active && (
        <div id="redo_progress_modal_overlay" className="fixed inset-0 bg-[#343028]/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center space-y-5 animate-slideUp font-sans">
            <div className="relative w-16 h-16 flex items-center justify-center mx-auto">
              {/* Dashed outer circular track */}
              <div className="absolute inset-0 rounded-full border border-dashed border-[#dfcbb0]/65 animate-spin" style={{ animationDuration: '8s' }} />
              
              {/* Spinning wrapper for the dot forming a circle */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-classic-gold shadow-[0_0_8px_rgba(212,163,89,0.6)]" />
              </div>

              <div className="w-11 h-11 rounded-full bg-classic-ivory border border-[#dfcbb0] flex items-center justify-center text-classic-gold z-10">
                <Sparkles className="w-4.5 h-4.5 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-serif font-bold text-classic-ink text-base">
                Refazendo Personalidade...
              </h3>
              <p className="text-[11px] text-[#8e8574] leading-relaxed min-h-[32px] flex items-center justify-center">
                {redoProgress.message}
              </p>
            </div>

            {/* Custom Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-[#FAF6EE] h-3.5 rounded-full border border-[#e2dacb] overflow-hidden p-0.5 shadow-inner">
                <div 
                  className="bg-[#c2a470] h-full rounded-full transition-all duration-300 ease-out shadow-xs flex items-center justify-end pr-1"
                  style={{ width: `${redoProgress.percent}%` }}
                >
                  {redoProgress.percent > 15 && (
                    <span className="text-[8px] font-mono font-bold text-white leading-none">
                      {redoProgress.percent}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-[#8e8574] font-mono px-0.5">
                <span>0% Essência</span>
                <span>{redoProgress.percent}%</span>
                <span>Finalizado</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP - BARRA DE PROGRESSO DO REFAZER EM LOTE */}
      {batchRedoProgress.active && (
        <div id="batch_redo_progress_modal_overlay" className="fixed inset-0 bg-[#343028]/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-md rounded-3xl shadow-2xl p-6 text-center space-y-5 animate-slideUp">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <Sparkles className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="font-serif font-bold text-classic-ink text-base">
                Lote de Reconstrução de Personalidade
              </h3>
              <p className="text-xs text-[#8e8574] font-medium uppercase tracking-wider">
                Processando: <span className="text-rose-700 font-bold">{batchRedoProgress.currentName}</span> ({batchRedoProgress.currentIndex + 1} de {batchRedoProgress.total})
              </p>
              <p className="text-[11px] text-[#5c5344] leading-relaxed min-h-[32px] flex items-center justify-center">
                {batchRedoProgress.message}
              </p>
            </div>

            {/* Individual Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-[#8e8574] font-mono px-0.5">
                <span>Progresso de {batchRedoProgress.currentName}</span>
                <span className="font-bold text-rose-700">{batchRedoProgress.percent}%</span>
              </div>
              <div className="w-full bg-[#FAF6EE] h-3.5 rounded-full border border-[#e2dacb] overflow-hidden p-0.5 shadow-inner">
                <div 
                  className="bg-rose-600 h-full rounded-full transition-all duration-300 ease-out shadow-xs flex items-center justify-end pr-1"
                  style={{ width: `${batchRedoProgress.percent}%` }}
                >
                  {batchRedoProgress.percent > 15 && (
                    <span className="text-[8px] font-mono font-bold text-white leading-none">
                      {batchRedoProgress.percent}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Batch Progress Bar */}
            <div className="space-y-1.5 border-t border-[#f2ece0] pt-4">
              <div className="flex justify-between items-center text-[10px] text-[#8e8574] font-mono px-0.5">
                <span>Progresso Geral da Lista</span>
                <span className="font-bold text-classic-gold">
                  {Math.round(((batchRedoProgress.currentIndex + (batchRedoProgress.percent / 100)) / batchRedoProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-[#FAF6EE] h-3 rounded-full border border-[#e2dacb] overflow-hidden p-0.5 shadow-inner">
                <div 
                  className="bg-classic-gold h-full rounded-full transition-all duration-300 ease-out shadow-xs animate-pulse"
                  style={{ width: `${((batchRedoProgress.currentIndex + (batchRedoProgress.percent / 100)) / batchRedoProgress.total) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] text-[#8e8574] font-mono px-0.5">
                <span>Início</span>
                <span>Personagem {batchRedoProgress.currentIndex + 1} / {batchRedoProgress.total}</span>
                <span>Fim</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP - CONFIRMAÇÃO DO LOTE DE RECONSTRUÇÃO */}
      {showConfirmBatchPopup && (
        <div id="batch_redo_confirm_modal_overlay" className="fixed inset-0 bg-[#343028]/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn animate-duration-200">
          <div className="bg-[#FCFAF7] border border-[#e8e2d5] w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center space-y-4 animate-slideUp font-sans">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <Sparkles className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-serif font-bold text-classic-ink text-base">
                Confirmar Lote de Reconstrução?
              </h3>
              <p className="text-xs text-[#5c5344] leading-relaxed">
                Você tem certeza que deseja reconstruir a personalidade de <strong>TODOS</strong> os personagens da lista, um por um?
              </p>
              <p className="text-[11px] text-[#8e8574] leading-relaxed bg-[#FAF6EE] p-2.5 rounded-xl border border-[#e2dacb]">
                Esse processo usará os manuais mestres atualizados para redefinir as nuances psicológicas de cada um de forma integrada, preservando memórias e intimidade individuais.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmBatchPopup(false)}
                className="flex-1 px-4 py-2 border border-[#e2dacb] hover:bg-classic-cream text-[#8e8574] font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={startBatchRedo}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm transition-colors"
              >
                Confirmar Lote
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
