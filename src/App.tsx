import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, GraduationCap, Compass, BookOpen, AlertCircle, 
  Settings, Loader2, ArrowRight, UserCheck, Shield, HelpCircle, XCircle, RotateCcw,
  Cloud, Database, LogIn, LogOut, CheckCircle2, Calendar, Smartphone, Sparkles, Key
} from 'lucide-react';
import { AppMode, IdentifiedError, AdaptationRecord, DEFAULT_NODES, ConsolidationRecord, WeekPlan, WeeklyPlanContent, PlanScheduleState } from './types';
import { generateWeeklyPlan, getNextUncompletedLesson, getVocabularyWordsForTopic, getLearnedVocabWords, isUntaughtError } from './utils/plan';
import { calculateProgression } from './utils/progress';
import AlignmentScreen from './components/AlignmentScreen';
import SetupScreen from './components/SetupScreen';
import ConversationScreen from './components/ConversationScreen';
import ErrorBoundary from './components/ErrorBoundary';
import CourseScreen from './components/CourseScreen';
import TutorialGuide from './components/TutorialGuide';
import DeveloperScreen from './components/DeveloperScreen';
import { safeLocalStorageSet } from './utils/safeStorage';
import { apiFetch } from './utils/api';
import { getAiConfig, saveAiConfig } from './utils/aiConfig';
import { 
  auth, 
  loginWithGoogle, 
  logoutUser, 
  summarizeState, 
  getLocalStateSnapshot, 
  isStateEmpty, 
  applyStateToLocalStorage, 
  writeStateToCloud, 
  fetchStateFromCloud, 
  LOCAL_STORAGE_KEYS 
} from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';


export default function App() {
  const isResettingRef = useRef(false);
  // Profiles & Authentication state
  const [username, setUsername] = useState(() => localStorage.getItem('fluent_username') || '');
  const [tempUsername, setTempUsername] = useState('');

  // Developer mode authentication
  const [isDevModeUnlocked, setIsDevModeUnlocked] = useState(() => localStorage.getItem('fluent_dev_unlocked') === 'true');
  const [passwordInput, setPasswordInput] = useState('');

  // Firebase auth state and sync controls
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [initialSyncChecking, setInitialSyncChecking] = useState<boolean>(true);
  const [conflictResult, setConflictResult] = useState<{ local: any; cloud: any; cloudRaw: any } | null>(null);
  const [showReplaceConfirmation, setShowReplaceConfirmation] = useState<boolean>(false);

  // Manual Save to Cloud state controls
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);

  const handleManualSaveToCloud = async () => {
    setIsSavingToCloud(true);
    try {
      // Execute batch linguistic audit on accumulated session messages before saving
      try {
        const auditRes = await apiFetch('/api/batch-audit-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          if (Array.isArray(auditData.identified_errors) && auditData.identified_errors.length > 0) {
            auditData.identified_errors.forEach((err: any) => handleTrackError(err));
          }
          if (Array.isArray(auditData.identified_strengths) && auditData.identified_strengths.length > 0) {
            auditData.identified_strengths.forEach((st: any) => {
              handleTrackStrength({
                topicId: st.structure_used || 'general',
                user_phrase: st.user_phrase,
                topicLabel: st.topic_label || 'Estrutura Correta'
              });
            });
          }
        }
      } catch (auditErr) {
        console.error("Batch audit on save error:", auditErr);
      }

      let targetUser = currentUser;
      if (!targetUser) {
        targetUser = await loginWithGoogle();
        if (targetUser) {
          setCurrentUser(targetUser);
        }
      }
      
      if (targetUser) {
        const localSnapshot = getLocalStateSnapshot();
        await writeStateToCloud(targetUser.uid, localSnapshot);
        setShowSaveSuccessModal(true);
      }
    } catch (err) {
      console.error("Erro ao salvar progresso na nuvem:", err);
      alert("Não foi possível salvar na nuvem no momento. Tente novamente.");
    } finally {
      setIsSavingToCloud(false);
    }
  };

  // Main application routing states
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const savedMode = localStorage.getItem('fluent_app_mode') as AppMode;
    if (savedMode) return savedMode;
    
    const aligned = localStorage.getItem('fluent_aligned') === 'true';
    if (!aligned) return 'ALIGNMENT';
    return 'MENU'; // land on the elegant central choices menu
  });
  
  // Evaluation diagnostics states
  const [isAligned, setIsAligned] = useState(() => localStorage.getItem('fluent_aligned') === 'true');
  const [baselineProficiency, setBaselineProficiency] = useState(() => localStorage.getItem('fluent_proficiency') || 'Intermediate');
  const [estimatedMonths, setEstimatedMonths] = useState(() => parseFloat(localStorage.getItem('fluent_est_months') || '9.0'));
  const [nextGrammaticalFocus, setNextGrammaticalFocus] = useState(() => localStorage.getItem('fluent_focus') || 'Present Perfect');
  const [strengthsSummary, setStrengthsSummary] = useState(() => localStorage.getItem('fluent_strengths_summary') || '');
  
  // Custom narrative sandbox states
  const [activeStorySetting, setActiveStorySetting] = useState(() => localStorage.getItem('fluent_setting') || '');
  const [activeCharacter, setActiveCharacter] = useState(() => localStorage.getItem('fluent_character') || '');
  const [initialReply, setInitialReply] = useState(() => localStorage.getItem('fluent_init_reply') || '');
  const [isStoryLoaded, setIsStoryLoaded] = useState(() => localStorage.getItem('fluent_story_loaded') === 'true');
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('fluent_user_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState(() => localStorage.getItem('fluent_user_api_key') || '');
  const [showKeyInstructions, setShowKeyInstructions] = useState(false);

  const [resetModalConfig, setResetModalConfig] = useState<{
    isOpen: boolean;
    type: 'STORY' | 'ALL' | null;
  }>({
    isOpen: false,
    type: null,
  });

  // Error history monitoring panel state
  const [globalErrors, setGlobalErrors] = useState<IdentifiedError[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fluent_errors') || '[]');
    } catch {
      return [];
    }
  });

  // Track strengths/facilities nodes (hits) with occurrences
  const [globalStrengths, setGlobalStrengths] = useState<{ topicId: string; count: number; lastPhrase: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fluent_strengths_nodes') || '[]');
    } catch {
      return [];
    }
  });

  // Adaptive modifications list state
  const [adaptations, setAdaptations] = useState<AdaptationRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fluent_adaptations') || '[]');
    } catch {
      return [];
    }
  });

  // Hybrid Real-Calendar Schedule State for Monthly Adaptations
  const [planSchedule, setPlanSchedule] = useState<PlanScheduleState>(() => {
    try {
      const persisted = localStorage.getItem('fluent_plan_schedule');
      if (persisted) return JSON.parse(persisted);
    } catch {}
    const now = new Date();
    const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      planCreationDate: now.toISOString(),
      lastAdaptationDate: now.toISOString(),
      nextScheduledDate: nextDate.toISOString()
    };
  });

  // Weekly Teaching Plan State
  const [weeklyPlan, setWeeklyPlan] = useState<WeekPlan[]>(() => {
    try {
      const persisted = localStorage.getItem('fluent_weekly_plan');
      if (persisted) return JSON.parse(persisted);
    } catch {}
    return [];
  });

  // Settings Modal Toggle State
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Guided onboarding tutorial states
  const [isTutorialActive, setIsTutorialActive] = useState(() => {
    const aligned = localStorage.getItem('fluent_aligned') === 'true';
    const done = localStorage.getItem('fluent_tutorial_done') === 'true';
    return aligned && !done;
  });
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  // Completed nodes (modules)
  const [completedNodes, setCompletedNodes] = useState<string[]>(() => {
    try {
      const persisted = localStorage.getItem('fluent_completed_nodes');
      if (persisted) return JSON.parse(persisted);
    } catch {}
    const baseline = localStorage.getItem('fluent_proficiency') || 'Intermediate';
    if (baseline === 'Advanced') {
      return ['present_simple', 'past_simple', 'present_perfect', 'prepositions', 'relative_clauses'];
    } else if (baseline === 'Intermediate') {
      return ['present_simple', 'past_simple'];
    }
    return [];
  });

  // Consolidation Period records (3 days)
  const [consolidationRecords, setConsolidationRecords] = useState<ConsolidationRecord[]>(() => {
    try {
      const saved = localStorage.getItem('fluent_consolidation_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Comprehensive local state reloader helper function
  const reloadEverythingFromLocal = (forceMenu: boolean = false) => {
    setUsername(localStorage.getItem('fluent_username') || '');
    
    const savedMode = localStorage.getItem('fluent_app_mode') as AppMode;
    const aligned = localStorage.getItem('fluent_aligned') === 'true';
    if (forceMenu) {
      const forced = aligned ? 'MENU' : 'ALIGNMENT';
      setAppMode(forced);
      safeLocalStorageSet('fluent_app_mode', forced);
    } else {
      setAppMode(savedMode || (aligned ? 'MENU' : 'ALIGNMENT'));
    }
    
    setIsAligned(aligned);
    setBaselineProficiency(localStorage.getItem('fluent_proficiency') || 'Intermediate');
    setEstimatedMonths(parseFloat(localStorage.getItem('fluent_est_months') || '9.0'));
    setNextGrammaticalFocus(localStorage.getItem('fluent_focus') || 'Present Perfect');
    setStrengthsSummary(localStorage.getItem('fluent_strengths_summary') || '');
    setActiveStorySetting(localStorage.getItem('fluent_setting') || '');
    setActiveCharacter(localStorage.getItem('fluent_character') || '');
    setInitialReply(localStorage.getItem('fluent_init_reply') || '');
    setIsStoryLoaded(localStorage.getItem('fluent_story_loaded') === 'true');
    
    try {
      setGlobalErrors(JSON.parse(localStorage.getItem('fluent_errors') || '[]'));
    } catch {
      setGlobalErrors([]);
    }
    
    try {
      setGlobalStrengths(JSON.parse(localStorage.getItem('fluent_strengths_nodes') || '[]'));
    } catch {
      setGlobalStrengths([]);
    }
    
    try {
      setAdaptations(JSON.parse(localStorage.getItem('fluent_adaptations') || '[]'));
    } catch {
      setAdaptations([]);
    }
    
    try {
      const persisted = localStorage.getItem('fluent_completed_nodes');
      if (persisted) {
        setCompletedNodes(JSON.parse(persisted));
      } else {
        const baseline = localStorage.getItem('fluent_proficiency') || 'Intermediate';
        if (baseline === 'Advanced') {
          setCompletedNodes(['present_simple', 'past_simple', 'present_perfect', 'prepositions', 'relative_clauses']);
        } else if (baseline === 'Intermediate') {
          setCompletedNodes(['present_simple', 'past_simple']);
        } else {
          setCompletedNodes([]);
        }
      }
    } catch {
      setCompletedNodes([]);
    }
    
    try {
      const saved = localStorage.getItem('fluent_consolidation_records');
      setConsolidationRecords(saved ? JSON.parse(saved) : []);
    } catch {
      setConsolidationRecords([]);
    }

    try {
      const persistedPlan = localStorage.getItem('fluent_weekly_plan');
      if (persistedPlan) {
        setWeeklyPlan(JSON.parse(persistedPlan));
      } else {
        setWeeklyPlan([]);
      }
    } catch {
      setWeeklyPlan([]);
    }

    setIsTutorialActive(() => {
      const done = localStorage.getItem('fluent_tutorial_done') === 'true';
      return aligned && !done;
    });

    const savedKey = localStorage.getItem('fluent_user_api_key') || '';
    setUserApiKey(savedKey);
    setTempApiKey(savedKey);
  };

  // Monitor Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await handleCloudSynchronization(user);
      } else {
        setInitialSyncChecking(false);
      }
    });
    return unsubscribe;
  }, []);

  // Pre-fill tempUsername with Google account displayName if available and not yet set
  useEffect(() => {
    if (currentUser && currentUser.displayName && !username && !tempUsername) {
      setTempUsername(currentUser.displayName);
    }
  }, [currentUser, username, tempUsername]);

  // Sync first-time cloud credentials or resolve conflict intelligently
  const handleCloudSynchronization = async (user: FirebaseUser) => {
    setSyncing(true);
    setInitialSyncChecking(true);
    try {
      const localState = getLocalStateSnapshot();
      const cloudState = await fetchStateFromCloud(user.uid);
      
      const localEmpty = isStateEmpty(localState);
      const cloudEmpty = !cloudState || isStateEmpty(cloudState);
      
      if (localEmpty && cloudEmpty) {
        // Case 4: Neither exists. Brand new account setup.
        setAppMode('ALIGNMENT');
        safeLocalStorageSet('fluent_app_mode', 'ALIGNMENT');
        setInitialSyncChecking(false);
        setSyncing(false);
        return;
      }
      
      if (!localEmpty && cloudEmpty) {
        // Case 1: Only local history exists. Send local straight to cloud.
        await writeStateToCloud(user.uid, localState);
        reloadEverythingFromLocal(true);
        setInitialSyncChecking(false);
        setSyncing(false);
        return;
      }
      
      if (localEmpty && !cloudEmpty) {
        // Case 3: Only cloud history has records. Restore straight to device.
        applyStateToLocalStorage(cloudState!);
        reloadEverythingFromLocal(true);
        setInitialSyncChecking(false);
        setSyncing(false);
        return;
      }
      
      // Both local and cloud have history data (!localEmpty && !cloudEmpty).
      // Let's run semantic & temporal evaluation to prevent unneeded conflict dialogs.
      const localSum = summarizeState(localState);
      const cloudSum = summarizeState(cloudState!);
      
      // 1. Semantic equivalence filter
      const isSemanticallyEquivalent = 
        localSum.isAligned === cloudSum.isAligned &&
        localSum.username === cloudSum.username &&
        localSum.setting === cloudSum.setting &&
        localSum.dayCount === cloudSum.dayCount &&
        localSum.characterCount === cloudSum.characterCount;
        
      if (isSemanticallyEquivalent) {
        // Safe to silenty align and assume cloud is sovereign
        applyStateToLocalStorage(cloudState!);
        reloadEverythingFromLocal(true);
        setInitialSyncChecking(false);
        setSyncing(false);
        return;
      }
      
      // 2. Temporal recency filter
      const localTime = localState['lastUpdatedAt'] ? new Date(localState['lastUpdatedAt']!).getTime() : 0;
      const cloudTime = cloudState!['lastUpdatedAt'] ? new Date(cloudState!['lastUpdatedAt']!).getTime() : 0;
      
      // If local is older than or equal to cloud, then cloud wins silently (local is just stale cache)
      if (localTime <= cloudTime) {
        applyStateToLocalStorage(cloudState!);
        reloadEverythingFromLocal(true);
        setInitialSyncChecking(false);
        setSyncing(false);
        return;
      }
      
      // Case 2: Genuine exceptional conflict (user played offline more recently and progress differs)
      setConflictResult({
        local: localSum,
        cloud: cloudSum,
        cloudRaw: cloudState
      });
    } catch (err) {
      console.error("Erro ao sincronizar com a nuvem:", err);
    } finally {
      setInitialSyncChecking(false);
      setSyncing(false);
    }
  };

  // Continuous background real-time synchronization is disabled to prevent continuous requests and quota usage.
  // Progress is sent to the cloud exclusively when the user presses the 💾 button in the main menu.

  // Keep additional states in sync
  useEffect(() => {
    if (isResettingRef.current) return;
    safeLocalStorageSet('fluent_completed_nodes', JSON.stringify(completedNodes));
  }, [completedNodes]);

  useEffect(() => {
    if (isResettingRef.current) return;
    safeLocalStorageSet('fluent_consolidation_records', JSON.stringify(consolidationRecords));
  }, [consolidationRecords]);

  // Keep state synced to localStorage
  useEffect(() => {
    if (isResettingRef.current) return;
    if (username) safeLocalStorageSet('fluent_username', username);
    safeLocalStorageSet('fluent_aligned', String(isAligned));
    safeLocalStorageSet('fluent_proficiency', baselineProficiency);
    safeLocalStorageSet('fluent_est_months', String(estimatedMonths));
    safeLocalStorageSet('fluent_focus', nextGrammaticalFocus);
    safeLocalStorageSet('fluent_setting', activeStorySetting);
    safeLocalStorageSet('fluent_character', activeCharacter);
    safeLocalStorageSet('fluent_init_reply', initialReply);
    safeLocalStorageSet('fluent_story_loaded', String(isStoryLoaded));
    safeLocalStorageSet('fluent_errors', JSON.stringify(globalErrors));
    safeLocalStorageSet('fluent_strengths_nodes', JSON.stringify(globalStrengths));
    safeLocalStorageSet('fluent_adaptations', JSON.stringify(adaptations));
    safeLocalStorageSet('fluent_app_mode', appMode);
    safeLocalStorageSet('fluent_strengths_summary', strengthsSummary);
    safeLocalStorageSet('fluent_weekly_plan', JSON.stringify(weeklyPlan));
  }, [
    username, isAligned, baselineProficiency, estimatedMonths, nextGrammaticalFocus, 
    activeStorySetting, activeCharacter, initialReply, isStoryLoaded, globalErrors, globalStrengths, adaptations, appMode, strengthsSummary, weeklyPlan
  ]);


  // Seed initial diagnostic adaptation on alignment completion
  useEffect(() => {
    if (isAligned && adaptations.length === 0) {
      const now = new Date();
      const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const initialRecord: AdaptationRecord = {
        id: 'baseline',
        timestamp: now.toISOString(),
        previousFocus: 'Nenhum (Alinhamento Inicial)',
        newFocus: nextGrammaticalFocus,
        reason: `Com base nas respostas do seu teste de diagnóstico, identificamos que o seu perfil de proficiência inicial se situa no nível "${baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediário' : 'Iniciante'}". Estruturamos o módulo do seu planejamento focado originalmente em "${nextGrammaticalFocus}" para melhor consolidar seus alvos graduais.`,
        origin: 'automática',
        diagnosis: `Perfil inicial mapeado para o nível ${baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediário' : 'Iniciante'}.`,
        changesSummary: [
          `Definição da estrutura inicial do plano para o nível ${baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediário' : 'Iniciante'}.`
        ],
        nextScheduledDate: nextDate.toISOString()
      };
      setAdaptations([initialRecord]);

      const initialSchedule: PlanScheduleState = {
        planCreationDate: now.toISOString(),
        lastAdaptationDate: now.toISOString(),
        nextScheduledDate: nextDate.toISOString()
      };
      setPlanSchedule(initialSchedule);
      safeLocalStorageSet('fluent_plan_schedule', JSON.stringify(initialSchedule));
    }
  }, [isAligned, adaptations, nextGrammaticalFocus, baselineProficiency]);

  // Initialize the weekly teaching plan if aligned and empty
  useEffect(() => {
    if (isAligned && (!weeklyPlan || weeklyPlan.length === 0)) {
      const initialPlan = generateWeeklyPlan(estimatedMonths, baselineProficiency, completedNodes);
      setWeeklyPlan(initialPlan);
      safeLocalStorageSet('fluent_weekly_plan', JSON.stringify(initialPlan));
      
      const firstUncompleted = getNextUncompletedLesson(initialPlan);
      if (firstUncompleted) {
        setNextGrammaticalFocus(firstUncompleted.label);
      }
    }
  }, [isAligned, estimatedMonths, baselineProficiency, completedNodes, weeklyPlan]);

  // Intelligent Multi-Source AI Study Plan Adapter
  const triggerMonthlyReview = async (currentDayNum?: number, origin: 'automática' | 'manual' = 'automática') => {
    try {
      let currentDay = currentDayNum;
      if (!currentDay) {
        try {
          const savedSimState = localStorage.getItem('fluent_sim_state');
          if (savedSimState) {
            currentDay = JSON.parse(savedSimState).day_count || 1;
          } else {
            currentDay = 1;
          }
        } catch {
          currentDay = 1;
        }
      }

      safeLocalStorageSet('fluent_last_review_day', String(currentDay));

      const planStr = localStorage.getItem('fluent_weekly_plan');
      if (!planStr) return;
      const currentPlan: WeekPlan[] = JSON.parse(planStr);

      let currentWeekIdx = currentPlan.findIndex(w => w.contents.some(c => !c.completed));
      if (currentWeekIdx === -1) {
        currentWeekIdx = currentPlan.length - 1;
      }

      let mandatoryVocabGroups: any[] = [];
      try {
        const mvgStr = localStorage.getItem('fluent_mandatory_vocab_groups');
        if (mvgStr) mandatoryVocabGroups = JSON.parse(mvgStr);
      } catch (err) {
        console.warn("Could not read mandatory vocab groups:", err);
      }

      const res = await apiFetch('/api/adapt-study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineProficiency,
          estimatedMonths,
          currentWeekIndex: currentWeekIdx,
          completedNodes,
          weeklyPlan: currentPlan,
          globalErrors,
          globalStrengths,
          strengthsSummary,
          mandatoryVocabGroups,
          origin
        })
      });

      if (!res.ok) {
        throw new Error(`Servidor respondeu com erro ao adaptar plano: ${res.statusText}`);
      }

      const data = await res.json();
      const rawUpdatedPlan: WeekPlan[] = data.weeklyPlan || currentPlan;

      // CLIENT-SIDE INTEGRITY VALIDATION BEFORE SAVING
      let isValidPlan = true;
      let validationError = "";

      if (!Array.isArray(rawUpdatedPlan) || rawUpdatedPlan.length === 0) {
        isValidPlan = false;
        validationError = "O plano retornado está vazio ou num formato inválido.";
      } else {
        // 1. Check weekNumber sequence
        for (let i = 0; i < rawUpdatedPlan.length; i++) {
          if (typeof rawUpdatedPlan[i].weekNumber !== 'number' || rawUpdatedPlan[i].weekNumber !== i + 1) {
            isValidPlan = false;
            validationError = `Numeração da Semana ${i + 1} incorreta ou ausente.`;
            break;
          }
        }

        // 2. Check past & current week preservation
        if (isValidPlan) {
          const maxCheckIndex = Math.min(currentWeekIdx, currentPlan.length - 1);
          for (let w = 0; w <= maxCheckIndex; w++) {
            const oldWeek = currentPlan[w];
            const newWeek = rawUpdatedPlan[w];
            if (!newWeek) {
              isValidPlan = false;
              validationError = `A Semana ${w + 1} (já realizada ou em andamento) foi removida.`;
              break;
            }
            for (let c = 0; c < oldWeek.contents.length; c++) {
              if (oldWeek.contents[c].completed && (!newWeek.contents[c] || !newWeek.contents[c].completed)) {
                isValidPlan = false;
                validationError = `Conteúdo concluído da Semana ${w + 1} foi alterado ou desmarcado.`;
                break;
              }
            }
            if (!isValidPlan) break;
          }
        }

        // 3. Check Duration Coherence (no drastic collapse)
        if (isValidPlan && currentPlan.length >= 6 && rawUpdatedPlan.length < Math.floor(currentPlan.length * 0.5)) {
          isValidPlan = false;
          validationError = `Redução drástica e não autorizada da duração do curso (${currentPlan.length} semanas reduzidas para ${rawUpdatedPlan.length}).`;
        }

        // 4. Check Mandatory Vocabulary preservation
        if (isValidPlan && mandatoryVocabGroups && mandatoryVocabGroups.length > 0) {
          const newPlanTopics = new Set<string>();
          rawUpdatedPlan.forEach(w => w.contents.forEach(c => newPlanTopics.add(c.label)));
          for (const grp of mandatoryVocabGroups) {
            if (grp.topic && !newPlanTopics.has(grp.topic)) {
              isValidPlan = false;
              validationError = `Vocabulário obrigatório pendente '${grp.topic}' foi omitido do plano.`;
              break;
            }
          }
        }
      }

      const updatedWeeklyPlan = isValidPlan ? rawUpdatedPlan : currentPlan;

      if (!isValidPlan) {
        console.warn(`[Validação de Integridade do Plano]: Adaptação rejeitada por falha na validação (${validationError}). Mantendo plano original.`);
      } else {
        setWeeklyPlan(updatedWeeklyPlan);
        safeLocalStorageSet('fluent_weekly_plan', JSON.stringify(updatedWeeklyPlan));
      }

      const firstUncompleted = getNextUncompletedLesson(updatedWeeklyPlan);
      if (firstUncompleted) {
        setNextGrammaticalFocus(firstUncompleted.label);
      }

      const now = new Date();
      const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const updatedSchedule: PlanScheduleState = {
        planCreationDate: planSchedule?.planCreationDate || now.toISOString(),
        lastAdaptationDate: now.toISOString(),
        nextScheduledDate: nextDate.toISOString()
      };
      setPlanSchedule(updatedSchedule);
      safeLocalStorageSet('fluent_plan_schedule', JSON.stringify(updatedSchedule));

      const adaptiveRecord: AdaptationRecord = {
        id: `review_${Date.now()}`,
        timestamp: now.toISOString(),
        previousFocus: nextGrammaticalFocus,
        newFocus: firstUncompleted?.label || nextGrammaticalFocus,
        reason: !isValidPlan
          ? `Validação de Integridade: O plano anterior foi mantido intacto para proteger seu progresso e vocabulário obrigatório (${validationError}).`
          : data.maintained
            ? (data.maintainedReason || "Após analisar dificuldades, facilidades, progresso e conteúdos futuros, concluiu-se que o plano atual já atende adequadamente às necessidades do usuário. Nenhuma adaptação foi considerada benéfica neste momento.")
            : `Análise Pedagógica Inteligente (${origin}): O diretor pedagógico examinou suas evidências de uso (Stories, Mini Tradutor, Facilidades) e reorganizou o cronograma futuro com sucesso.`,
        origin,
        diagnosis: isValidPlan ? data.diagnosis : `Integridade preservada. (${validationError})`,
        changesSummary: isValidPlan ? (data.changesSummary || []) : [`Manutenção do plano existente devido à validação de integridade.`],
        addedTopics: isValidPlan ? (data.addedTopics || []) : [],
        removedTopics: isValidPlan ? (data.removedTopics || []) : [],
        anticipatedTopics: isValidPlan ? (data.anticipatedTopics || []) : [],
        postponedTopics: isValidPlan ? (data.postponedTopics || []) : [],
        justifications: isValidPlan ? (data.justifications || []) : [],
        nextScheduledDate: nextDate.toISOString()
      };

      setAdaptations(prev => {
        const nextList = [adaptiveRecord, ...prev];
        safeLocalStorageSet('fluent_adaptations', JSON.stringify(nextList));
        return nextList;
      });

    } catch (e) {
      console.error("Erro na revisão inteligente do plano:", e);
    }
  };

  // Real Calendar & Simulator Day Monitor for Automatic Monthly Reviews
  useEffect(() => {
    if (!isAligned) return;
    try {
      let shouldTrigger = false;

      // 1. Check Real Calendar Schedule
      if (planSchedule && planSchedule.nextScheduledDate) {
        const now = new Date();
        const nextDate = new Date(planSchedule.nextScheduledDate);
        if (!isNaN(nextDate.getTime()) && now >= nextDate) {
          shouldTrigger = true;
        }
      }

      // 2. Check Simulator Day Count as fallback/complement
      const savedSimState = localStorage.getItem('fluent_sim_state');
      if (savedSimState) {
        const parsed = JSON.parse(savedSimState);
        const dayCount = parsed.day_count || 1;
        const lastReviewDayStr = localStorage.getItem('fluent_last_review_day');
        const lastReviewDay = lastReviewDayStr ? parseInt(lastReviewDayStr) : 1;
        if (dayCount >= lastReviewDay + 30) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        triggerMonthlyReview(undefined, 'automática');
      }
    } catch (e) {
      console.error("Erro ao monitorar agendamento de revisão mensal:", e);
    }
  }, [appMode, isAligned, planSchedule, globalErrors]);

  // Handle setting active username
  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempUsername.trim()) {
      setUsername(tempUsername.trim());
    }
  };

  // Greet Alignment completed callback
  const handleAlignmentCompleted = (data: {
    baselineProficiency: string;
    identifiedErrors: IdentifiedError[];
    nextGrammaticalFocus: string;
    estimatedMonths: number;
    summary: string;
    answers: { q1: string; q2: string; q3: string };
  }) => {
    setBaselineProficiency(data.baselineProficiency);
    setEstimatedMonths(data.estimatedMonths);
    setNextGrammaticalFocus(data.nextGrammaticalFocus);
    setStrengthsSummary(data.summary);
    setIsAligned(true);
    setAppMode('MENU'); // Transition smoothly to central Main Menu!
    setIsTutorialActive(true); // Automatically trigger the interactive onboarding tutorial!

    if (data.baselineProficiency === 'Advanced') {
      setCompletedNodes(['present_simple', 'past_simple', 'present_perfect', 'prepositions', 'relative_clauses']);
    } else if (data.baselineProficiency === 'Intermediate') {
      setCompletedNodes(['present_simple', 'past_simple']);
    } else {
      setCompletedNodes([]);
    }

    if (data.identifiedErrors.length > 0) {
      setGlobalErrors((prev) => [...data.identifiedErrors, ...prev]);
    }
  };

  // Story & Character Ready callback
  const handleSetupCompleted = (data: {
    setting: string;
    character: string;
    initialReply: string;
    narrativeSetting: string;
    activeCharacter: string;
  }) => {
    setActiveStorySetting(data.narrativeSetting);
    setActiveCharacter(data.activeCharacter);
    setInitialReply(data.initialReply);
    setIsStoryLoaded(true);
    
    setAppMode('CONVERSATION'); // Launch fully into conversation scenario!
  };

  // Live track conversational error events
  const handleTrackError = (err: IdentifiedError) => {
    const nowIso = new Date().toISOString();
    setGlobalErrors((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const existingIdx = arr.findIndex(
        (e) =>
          e.user_phrase.toLowerCase().trim() === err.user_phrase.toLowerCase().trim() &&
          e.correction.toLowerCase().trim() === err.correction.toLowerCase().trim()
      );
      
      if (existingIdx !== -1) {
        const updated = [...arr];
        const existing = updated[existingIdx];
        const wasTaught = !!existing.last_taught_at;
        const newErrorCountAfterTaught = wasTaught 
          ? (existing.error_count_after_taught || 0) + 1 
          : existing.error_count_after_taught;

        updated[existingIdx] = {
          ...existing,
          ...err,
          timestamp: existing.timestamp || nowIso,
          last_error_at: nowIso,
          error_count_after_taught: newErrorCountAfterTaught,
          search_count: (existing.search_count || 1) + (err.is_translator_search ? 1 : 0),
          last_searched_at: err.is_translator_search ? new Date().toLocaleString('pt-BR') : existing.last_searched_at
        };
        return updated;
      } else {
        const newErr: IdentifiedError = {
          ...err,
          timestamp: err.timestamp || nowIso,
          last_error_at: nowIso,
          error_count_after_taught: 0
        };
        return [newErr, ...arr];
      }
    });
  };

  // Live track conversational strength/mastery events
  const handleTrackStrength = (strength: { topicId: string; user_phrase: string; topicLabel: string }) => {
    setGlobalStrengths((prev) => {
      const existing = prev.find((s) => s.topicId === strength.topicId);
      if (existing) {
        return prev.map((s) =>
          s.topicId === strength.topicId
            ? { ...s, count: s.count + 1, lastPhrase: strength.user_phrase }
            : s
        );
      } else {
        return [...prev, { topicId: strength.topicId, count: 1, lastPhrase: strength.user_phrase }];
      }
    });
  };

  // Automated Evolution Sync
  useEffect(() => {
    if (globalStrengths.length === 0 || globalErrors.length === 0) return;

    let errorsChanged = false;
    let updatedErrors = [...globalErrors];
    const resolvedTopics: string[] = [];

    globalStrengths.forEach((strength) => {
      const node = DEFAULT_NODES.find((n) => n.id === strength.topicId);
      if (!node) return;

      const matchCount = globalErrors.filter((err) => {
        const p = (err.user_phrase || '').toLowerCase();
        const t = (err.error_type || '').toLowerCase();
        const e = (err.explanation || '').toLowerCase();
        return node.keywords.some((kw) => p.includes(kw) || t.includes(kw) || e.includes(kw));
      }).length;

      if (strength.count >= 2 && strength.count >= matchCount) {
        const filtered = updatedErrors.filter((err) => {
          const p = (err.user_phrase || '').toLowerCase();
          const t = (err.error_type || '').toLowerCase();
          const e = (err.explanation || '').toLowerCase();
          const matchesThisNode = node.keywords.some((kw) => p.includes(kw) || t.includes(kw) || e.includes(kw));
          return !matchesThisNode;
        });

        if (filtered.length !== updatedErrors.length) {
          updatedErrors = filtered;
          errorsChanged = true;
          resolvedTopics.push(node.label);
        }
      }
    });

    if (errorsChanged) {
      setGlobalErrors(updatedErrors);
      const resolvedList = resolvedTopics.join(', ');
      const activeText = `Evolução percebida! O assistente verificou que o seu fluxo de acertos na estrutura de "${resolvedList}" superou os desvios históricos observados anteriormente. Essa dificuldade foi arquivada do seu prontuário adaptativo em tempo real.`;
      
      const adaptiveRecord: AdaptationRecord = {
        id: `resolved_${Date.now()}`,
        timestamp: new Date().toISOString(),
        previousFocus: nextGrammaticalFocus,
        newFocus: nextGrammaticalFocus,
        reason: activeText
      };
      setAdaptations((prev) => [adaptiveRecord, ...prev]);
    }
  }, [globalStrengths, globalErrors, nextGrammaticalFocus]);

  // Live track roadmap progress updates
  const handleUpdatePlan = (newFocus: string, fluencyOffset: string) => {
    if (newFocus) {
      setNextGrammaticalFocus(newFocus);
    }
    
    const match = fluencyOffset.match(/([+-]?\d+)/);
    if (match) {
      const days = parseInt(match[1]);
      setEstimatedMonths((prev) => {
        const after = prev + (days / 30);
        return parseFloat(Math.max(1.5, after).toFixed(2));
      });
    }
  };

  const handleLessonCompletedSuccess = (topicLabel: string, wasApproved: boolean) => {
    safeLocalStorageSet('fluent_recommendation_last_action', 'course');
    
    // Find matched grammatical node if it is a grammar topic
    let matchedNode = DEFAULT_NODES.find(node =>
      node.label.toLowerCase().trim() === topicLabel.toLowerCase().trim()
    );

    if (!matchedNode) {
      let longestMatchLen = 0;
      DEFAULT_NODES.forEach(node => {
        const labelLower = node.label.toLowerCase().trim();
        const topicLower = topicLabel.toLowerCase().trim();
        if (labelLower.includes(topicLower) || topicLower.includes(labelLower)) {
          const matchLen = Math.max(labelLower.length, topicLower.length);
          if (matchLen > longestMatchLen) {
            longestMatchLen = matchLen;
            matchedNode = node;
          }
        }
        node.keywords.forEach(kw => {
          const kwClean = kw.toLowerCase().trim();
          if (topicLower.includes(kwClean)) {
            if (kwClean.length > longestMatchLen) {
              longestMatchLen = kwClean.length;
              matchedNode = node;
            }
          }
        });
      });
    }

    if (wasApproved) {
      // 1. Mark completed in our weekly plan
      let contentToMark: WeeklyPlanContent | null = null;
      let nextPlan = weeklyPlan.map(week => {
        const contents = week.contents.map(c => {
          if (!c.completed && c.label.toLowerCase().trim() === topicLabel.toLowerCase().trim()) {
            contentToMark = c;
            return { ...c, completed: true };
          }
          return c;
        });
        return { ...week, contents };
      });
      
      // Fallback: if no label matches perfectly, mark the first uncompleted lesson as completed
      if (!contentToMark) {
        nextPlan = weeklyPlan.map(week => {
          const contents = week.contents.map(c => {
            if (!contentToMark && !c.completed) {
              contentToMark = c;
              return { ...c, completed: true };
            }
            return c;
          });
          return { ...week, contents };
        });
      }

      setWeeklyPlan(nextPlan);
      safeLocalStorageSet('fluent_weekly_plan', JSON.stringify(nextPlan));

      // 2. Add to completed nodes if it's a Grammar topic
      if (contentToMark && contentToMark.type === 'Grammar' && contentToMark.nodeId) {
        let nextCompleted = [...completedNodes];
        if (!nextCompleted.includes(contentToMark.nodeId)) {
          nextCompleted.push(contentToMark.nodeId);
          setCompletedNodes(nextCompleted);
        }
      }

      // 3. Mark taught vocabulary words and update error/mandatory status
      const nowIso = new Date().toISOString();

      let mandatoryGroups: any[] = [];
      try {
        const rawG = localStorage.getItem('fluent_mandatory_vocab_groups');
        if (rawG) mandatoryGroups = JSON.parse(rawG);
      } catch {}

      const targetWords = getVocabularyWordsForTopic(topicLabel, globalErrors, mandatoryGroups);
      const targetEnList = targetWords.map(w => w.en.toLowerCase().trim());

      setGlobalErrors(prev => {
        const updated = prev.map(err => {
          const errClean = (err.correction || '').toLowerCase().trim();
          const phraseClean = (err.user_phrase || '').toLowerCase().trim();
          const explClean = (err.explanation || '').toLowerCase().trim();
          const topicLower = topicLabel.toLowerCase().trim();

          const matchesTargetWord = targetEnList.some(targetEn => 
            targetEn.length > 0 && (errClean === targetEn || errClean.includes(targetEn) || targetEn.includes(errClean))
          );
          const matchesTopic = topicLower.length > 3 && (phraseClean.includes(topicLower) || explClean.includes(topicLower));

          let matchesNode = false;
          if (matchedNode) {
            const matchesKeyword = matchedNode.keywords.some(kw => 
              phraseClean.includes(kw) || errClean.includes(kw) || explClean.includes(kw)
            );
            const labelLower = matchedNode.label.toLowerCase();
            const matchesLabel = phraseClean.includes(labelLower) || errClean.includes(labelLower) || explClean.includes(labelLower);
            matchesNode = matchesKeyword || matchesLabel;
          }

          if (matchesTargetWord || matchesTopic || matchesNode) {
            return {
              ...err,
              last_taught_at: nowIso,
              error_count_after_taught: 0
            };
          }
          return err;
        });

        safeLocalStorageSet('fluent_errors', JSON.stringify(updated));
        return updated;
      });

      // Register target words into fluent_learned_vocab
      try {
        let learnedList: string[] = [];
        const storedLearned = localStorage.getItem('fluent_learned_vocab');
        if (storedLearned) learnedList = JSON.parse(storedLearned);
        targetEnList.forEach(w => {
          if (w && !learnedList.includes(w)) learnedList.push(w);
        });
        safeLocalStorageSet('fluent_learned_vocab', JSON.stringify(learnedList));
      } catch {}

      // If topicLabel matched a mandatory group, mark words in that group as learned
      if (mandatoryGroups.length > 0) {
        let groupChanged = false;
        const updatedGroups = mandatoryGroups.map(g => {
          if (g.topic.toLowerCase().trim() === topicLabel.toLowerCase().trim()) {
            groupChanged = true;
            return {
              ...g,
              words: (g.words || []).map((w: any) => ({
                ...w,
                hasBeenLearned: true,
                lastTestedAt: nowIso
              }))
            };
          }
          return g;
        });
        if (groupChanged) {
          safeLocalStorageSet('fluent_mandatory_vocab_groups', JSON.stringify(updatedGroups));
        }
      }

      // 4. Determine next lesson and focus
      const nextLesson = getNextUncompletedLesson(nextPlan);
      if (nextLesson) {
        setNextGrammaticalFocus(nextLesson.label);
      }

      // 5. Register consolidation record if applicable
      const capRecord: AdaptationRecord = {
        id: `consolidated_${Date.now()}`,
        timestamp: new Date().toISOString(),
        previousFocus: topicLabel,
        newFocus: nextLesson ? nextLesson.label : topicLabel,
        reason: `Parabéns pela conclusão da aula de ${contentToMark?.type || 'estudos'} sobre "${topicLabel}"! ${nextLesson ? `Avançando automaticamente para o próximo conteúdo planejado: "${nextLesson.label}".` : 'Parabéns! Você completou todo o seu cronograma planejado!'}`
      };
      setAdaptations(prev => [capRecord, ...prev]);
    } else {
      // Fail case - do nothing or record fail
    }
  };

  const handleCourseDynamicProgress = (fluencyOffset: string, wasApproved?: boolean) => {
    handleUpdatePlan(nextGrammaticalFocus, fluencyOffset);
    if (wasApproved !== undefined) {
      handleLessonCompletedSuccess(nextGrammaticalFocus, wasApproved);
    }
  };

  const handleReloadWeeklyPlan = () => {
    let mandatoryGroups: any[] = [];
    try {
      const rawGroups = localStorage.getItem('fluent_mandatory_vocab_groups');
      if (rawGroups) {
        mandatoryGroups = JSON.parse(rawGroups);
      }
    } catch (err) {
      console.error("Error reading fluent_mandatory_vocab_groups on reload:", err);
    }
    const newPlan = generateWeeklyPlan(estimatedMonths, baselineProficiency, completedNodes, mandatoryGroups);
    setWeeklyPlan(newPlan);
    safeLocalStorageSet('fluent_weekly_plan', JSON.stringify(newPlan));
    
    const firstUncompleted = getNextUncompletedLesson(newPlan);
    if (firstUncompleted) {
      setNextGrammaticalFocus(firstUncompleted.label);
    }

    // Force immediately syncing with cloud if logged in
    if (currentUser) {
      try {
        const localState = getLocalStateSnapshot();
        localState['fluent_weekly_plan'] = JSON.stringify(newPlan);
        if (firstUncompleted) {
          localState['fluent_focus'] = firstUncompleted.label;
        }
        writeStateToCloud(currentUser.uid, localState);
      } catch (err) {
        console.error("Error syncing reloaded plan to cloud:", err);
      }
    }
  };

  const executeFullReset = () => {
    isResettingRef.current = true;
    localStorage.clear();
    window.location.reload();
  };

  const executeResetStory = () => {
    isResettingRef.current = true;
    // Clear state values to avoid memory writebacks
    setActiveStorySetting('');
    setActiveCharacter('');
    setInitialReply('');
    setIsStoryLoaded(false);
    setAppMode('MENU');

    // Remove specific story keys
    localStorage.removeItem('fluent_sim_state');
    localStorage.removeItem('fluent_sim_state_history');
    localStorage.removeItem('fluent_story_loaded');
    localStorage.removeItem('fluent_setting');
    localStorage.removeItem('fluent_character');
    localStorage.removeItem('fluent_init_reply');
    safeLocalStorageSet('fluent_app_mode', 'MENU');

    window.location.reload();
  };

  const handleFullReset = () => {
    setResetModalConfig({
      isOpen: true,
      type: 'ALL',
    });
  };

  const handleResetStory = () => {
    setResetModalConfig({
      isOpen: true,
      type: 'STORY',
    });
  };

  const getContextualRecommendation = () => {
    const prof = baselineProficiency || 'Intermediate';
    
    // Total user messages in current active story
    let userMessagesCount = 0;
    try {
      const savedSimState = localStorage.getItem('fluent_sim_state');
      if (savedSimState) {
        const parsed = JSON.parse(savedSimState);
        if (parsed && parsed.dialog_history) {
          userMessagesCount = parsed.dialog_history.filter((m: any) => m.sender === 'user').length;
        }
      }
    } catch (e) {
      console.warn("Could not read fluent_sim_state for recommendation logic", e);
    }

    // Cumulative data from errors and strengths
    const totalDifficulties = globalErrors.length;
    const totalStrengthsCount = globalStrengths.length;
    const totalActivityData = totalDifficulties + totalStrengthsCount;

    // Check Baseline Completed Nodes
    const baselineCount = prof === 'Advanced' ? 5 : prof === 'Intermediate' ? 2 : 0;
    const newCompletedCount = Math.max(0, completedNodes.length - baselineCount);

    // Read last action from local storage
    const lastAction = localStorage.getItem('fluent_recommendation_last_action') || ''; 

    // CASO 1 & 2: PRIMEIRO USO (sem mensagens de usuário registradas ainda e sem atividades na conta)
    const isFirstUse = userMessagesCount === 0 && totalActivityData === 0;
    if (isFirstUse) {
      if (prof === 'Beginner') {
        return {
          type: 'COURSE' as const,
          title: 'Curso Particular',
          message: 'Seria bom começar pelo Curso Particular para construir algumas bases antes de iniciar sua jornada no Stories.'
        };
      } else {
        return {
          type: 'STORIES' as const,
          title: 'Stories',
          message: 'Seria bom começar pelo Stories. Algumas conversas ajudarão a personalizar melhor o Curso Particular.'
        };
      }
    }

    // CASO 3 — POUCO MATERIAL PARA PLANEJAMENTO
    // Se começou a falar mas ainda tem poucas mensagens gravadas e poucos dados (menos de 4 interações de dados totais)
    const hasFewConversations = userMessagesCount > 0 && userMessagesCount < 4 && totalActivityData < 4;
    if (hasFewConversations) {
      return {
        type: 'STORIES' as const,
        title: 'Stories',
        message: 'Seria bom continuar no Stories. Mais algumas conversas ajudarão a refinar seu plano de estudos.'
      };
    }

    // CASO 6 — MUITO STORIES E POUCO CURSO
    // Quando há muitas dificuldades acumuladas aguardando estudo (dificuldades recentes acumuladas >= 3)
    if (totalDifficulties >= 3) {
      return {
        type: 'COURSE' as const,
        title: 'Curso Particular',
        message: 'Seria bom fazer uma aula agora. Existem alguns pontos importantes esperando por você.'
      };
    }

    // CASO 4 — MUITAS CONVERSAS E POUCAS AULAS
    // Se tem dados de conversação ricos (>=4 mensagens ou >=4 dados), mas ainda não completou novas aulas
    if ((userMessagesCount >= 4 || totalActivityData >= 4) && newCompletedCount === 0) {
      return {
        type: 'COURSE' as const,
        title: 'Curso Particular',
        message: 'Seria bom fazer uma aula agora. O plano já reuniu informações suficientes para um estudo mais direcionado.'
      };
    }

    // CASO 5 — MUITAS AULAS SEGUIDAS
    // Se o usuário estudou recentemente (ex: última ação foi estudar, ou completou 1+ aulas novas no total) 
    // e as dificuldades acumuladas são baixas ou zeradas.
    // Também apóia o fluxo de Alternância Natural!
    const studiedRecently = lastAction === 'course' || newCompletedCount >= 1;
    if (studiedRecently && totalDifficulties === 0) {
      return {
        type: 'STORIES' as const,
        title: 'Stories',
        message: 'Seria bom voltar ao Stories para colocar em prática o que você estudou recentemente.'
      };
    }

    // ALTERNÂNCIA NATURAL DIRECTIVE & PRIORIDADE PARA STORIES
    // Se a última ação de estudo/prática foi um curso, sugere Stories.
    // Se a última ação foi Stories, sugere Curso para equilibrar (se houver erros pendentes).
    if (lastAction === 'course') {
      return {
        type: 'STORIES' as const,
        title: 'Stories',
        message: 'Seria bom voltar ao Stories para exercitar seu inglês em situações reais.'
      };
    } else if (lastAction === 'story' && totalDifficulties > 0) {
      return {
        type: 'COURSE' as const,
        title: 'Curso Particular',
        message: 'Seria bom fazer uma aula agora. Vamos resolver os pequenos desvios identificados na sua última simulação.'
      };
    }

    // Padronização com prioridade para Stories se for situação ambígua
    return {
      type: 'STORIES' as const,
      title: 'Stories',
      message: 'Seria bom começar pelo Stories. Algumas conversas ajudarão a personalizar melhor o Curso Particular.'
    };
  };

  // Computed metrics with real confidence margins and active calibration
  const progressData = calculateProgression(
    baselineProficiency,
    completedNodes.length,
    globalStrengths.length,
    globalErrors.length,
    estimatedMonths
  );
  const currentFluencyPercent = progressData.estimatedPercentage;

  const recommendation = getContextualRecommendation();

  if (initialSyncChecking) {
    return (
      <div id="initial_sync_loader" className="w-full min-h-screen bg-[#FCFAF7] flex flex-col items-center justify-center p-6 font-sans">
        <div className="text-center space-y-6 max-w-sm flex flex-col items-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            {/* Dashed outer circular track */}
            <div className="absolute inset-0 rounded-full border border-dashed border-[#dfcbb0]/65 animate-spin" style={{ animationDuration: '8s' }} />
            
            {/* Spinning wrapper for the dot forming a circle */}
            <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-classic-gold shadow-[0_0_8px_rgba(212,163,89,0.6)]" />
            </div>

            <div className="w-11 h-11 rounded-full bg-classic-ivory border border-[#dfcbb0] flex items-center justify-center text-classic-gold z-10">
              <Cloud className="w-4.5 h-4.5 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-classic-ink text-base">
              Alinhando com a Nuvem
            </h3>
            <p className="text-xs text-[#8e8574] leading-relaxed">
              Carregando o progresso da sua conta e sincronizando o histórico para garantir a integridade da sua jornada linguística.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Mandatory Google Login screen on first access or if not signed in
  if (!currentUser) {
    return (
      <div id="mandatory_google_login_screen" className="w-full min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4 font-serif">
        <div className="bg-white border border-[#e8e2d5] rounded-3xl p-8 max-w-sm w-full shadow-xl text-center space-y-6 relative">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-amber-50 border border-[#dfcbb0]">
            <Cloud className="w-6 h-6 text-classic-gold animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <span className="text-classic-gold text-[10px] font-mono uppercase tracking-widest font-semibold block">FluentRoleplay</span>
            <h3 className="text-2xl font-serif font-bold text-classic-ink tracking-tight">
              Sincronização Necessária
            </h3>
            <p className="text-[#8e8574] text-xs font-sans leading-relaxed max-w-xs mx-auto">
              Para começar sua jornada, faça login com sua conta do Google. Isso garante que seu progresso de aprendizado e histórias sejam salvos de forma segura e automática na nuvem.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                setSyncing(true);
                await loginWithGoogle();
              } catch (e) {
                console.error(e);
                alert("O login por popup falhou ou foi bloqueado. Por favor, tente novamente.");
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 bg-classic-green hover:bg-classic-green-light disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider py-4 rounded-xl cursor-pointer transition-all shadow-sm"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Cloud className="w-4 h-4 text-white" />
            )}
            <span>Entrar com Google</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="immersive_root_wrap" className="w-full min-h-screen bg-[#FAF8F5] text-classic-ink font-sans flex flex-col justify-between overflow-x-hidden">
      
      {/* ------------------------------------------------------------- */}
      {/* WELCOME ALIAS REGISTRATION OVERLAY (IF NO USERNAME)             */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {!username && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 font-serif"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-8 max-w-sm w-full shadow-xl text-center space-y-6 relative"
            >
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-classic-cream border border-[#dfcbb0]">
                <UserCheck className="w-6 h-6 text-classic-gold" />
              </div>
              
              <div className="space-y-2">
                <span className="text-classic-gold text-[10px] font-mono uppercase tracking-widest font-semibold block">FluentRoleplay</span>
                <h3 className="text-2xl font-serif font-bold text-classic-ink tracking-tight">
                  Identifique-se, Estudante
                </h3>
                <p className="text-[#8e8574] text-xs font-sans leading-relaxed max-w-xs mx-auto">
                  A simulação e as perguntas adaptativas particulares serão moldadas em torno do seu apelido de preferência.
                </p>
              </div>

              <form onSubmit={handleSetUsername} className="space-y-4 text-left font-sans">
                <div>
                  <label id="username_input_label" className="block text-[10px] font-mono uppercase text-[#8e8574] mb-2 font-bold tracking-wide">
                    Como gostaria de ser chamado?
                  </label>
                  <input
                    id="username_identifier_field"
                    type="text"
                    required
                    placeholder="Ex: David, Clara, Satoshi..."
                    className="w-full bg-[#FAF6EE] border border-[#e2dacb] rounded-xl px-4 py-3 text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all text-sm font-sans"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  id="username_register_btn"
                  className="w-full flex items-center justify-center gap-1.5 bg-classic-green hover:bg-classic-green-light text-white font-sans font-bold text-xs uppercase tracking-wider py-4 rounded-xl cursor-pointer transition-all shadow-sm"
                >
                  Confirmar Apelido <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* IMPERATIVE GEMINI API KEY OVERLAY (IF USERNAME AND NO API KEY) */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {username && !userApiKey && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 font-serif"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-8 max-w-sm w-full shadow-xl text-center space-y-6 relative"
            >
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-amber-50 border border-[#dfcbb0]">
                <Key className="w-6 h-6 text-classic-gold" />
              </div>
              
              <div className="space-y-2">
                <span className="text-classic-gold text-[10px] font-mono uppercase tracking-widest font-semibold block">FluentRoleplay</span>
                <h3 className="text-2xl font-serif font-bold text-classic-ink tracking-tight">
                  Chave API Necessária
                </h3>
                <p className="text-[#8e8574] text-xs font-sans leading-relaxed max-w-xs mx-auto">
                  Para garantir acesso ilimitado, gratuito e sem interrupções por limites de uso, o FluentRoleplay agora exige que você utilize sua própria chave do Gemini.
                </p>
              </div>

              <div className="space-y-4 text-left font-sans text-xs">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#8e8574] mb-2 font-bold tracking-wide">
                    Sua Gemini API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Cole sua API Key (AIzaSy... ou AQ...)"
                    className="w-full bg-[#FAF6EE] border border-[#e2dacb] rounded-xl px-4 py-3 text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all text-sm font-sans font-mono"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value.trim())}
                  />
                  {tempApiKey && (tempApiKey.length < 20 || !(tempApiKey.startsWith('AIzaSy') || tempApiKey.startsWith('AQ.'))) && (
                    <span className="text-rose-600 text-[10px] mt-1 block font-sans font-medium">
                      Chave inválida.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!tempApiKey || tempApiKey.length < 20 || !(tempApiKey.startsWith('AIzaSy') || tempApiKey.startsWith('AQ.'))}
                  onClick={() => {
                    saveAiConfig({ geminiApiKey: tempApiKey });
                    setUserApiKey(tempApiKey);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-classic-green hover:bg-classic-green-light disabled:opacity-50 disabled:hover:bg-classic-green text-white font-sans font-bold text-xs uppercase tracking-wider py-4 rounded-xl cursor-pointer transition-all shadow-sm"
                >
                  Confirmar e Ativar <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowKeyInstructions(true)}
                  className="w-full py-3.5 bg-[#FAF6EE] hover:bg-amber-50 border border-[#e2dacb] text-[#7d715e] font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-xs"
                >
                  <Sparkles className="w-4 h-4 text-classic-gold animate-pulse" />
                  <span>Gerar Chave Grátis no Google AI Studio ↗</span>
                </button>

                <div className="relative py-1 flex items-center justify-center font-sans">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <span className="relative px-3 bg-white text-[10px] text-slate-400 font-medium uppercase tracking-wider">Opções de Conta</span>
                </div>

                <div className="flex gap-2">
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setSyncing(true);
                          await logoutUser();
                          // Clear localStorage username to trigger login screen again
                          localStorage.removeItem('fluent_username');
                          setUsername('');
                        } catch (e) {
                          console.error(e);
                        } finally {
                          setSyncing(false);
                        }
                      }}
                      className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-center font-semibold text-[11px] cursor-pointer"
                    >
                      Sair da Conta
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setSyncing(true);
                          await loginWithGoogle();
                        } catch (e) {
                          console.error(e);
                          alert("Falha ao entrar com Google.");
                        } finally {
                          setSyncing(false);
                        }
                      }}
                      className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-center font-semibold text-[11px] cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Cloud className="w-3.5 h-3.5 text-classic-gold" />
                      <span>Sincronizar Cloud</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('fluent_username');
                      setUsername('');
                    }}
                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-center font-semibold text-[11px] cursor-pointer"
                  >
                    Mudar Nome
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* POP-UP: INSTRUÇÕES PARA GERAR CHAVE GEMINI                    */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {showKeyInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5 text-left relative"
            >
              <div className="flex items-center gap-3 border-b border-[#f3eee5] pb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 border border-[#dfcbb0] shrink-0">
                  <Sparkles className="w-5 h-5 text-classic-gold animate-pulse" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-lg text-classic-ink tracking-tight">
                    Como obter sua chave grátis
                  </h4>
                  <p className="text-[11px] text-[#8e8574]">
                    Siga o passo a passo rápido e simples:
                  </p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs text-classic-ink">
                <div className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-50 border border-[#dfcbb0] flex items-center justify-center font-bold text-[10px] text-classic-gold shrink-0 mt-0.5">
                    1
                  </span>
                  <p className="leading-relaxed">
                    Clique em <strong className="font-semibold text-classic-ink">"Entendi"</strong> abaixo para abrir o Google AI Studio diretamente na seção de chaves.
                  </p>
                </div>

                <div className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-50 border border-[#dfcbb0] flex items-center justify-center font-bold text-[10px] text-classic-gold shrink-0 mt-0.5">
                    2
                  </span>
                  <p className="leading-relaxed">
                    Clique no botão de criar chave de API (<strong className="font-semibold text-classic-ink">"Create API key"</strong>).
                  </p>
                </div>

                <div className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-50 border border-[#dfcbb0] flex items-center justify-center font-bold text-[10px] text-classic-gold shrink-0 mt-0.5">
                    3
                  </span>
                  <p className="leading-relaxed">
                    Nomeie como <strong className="font-serif text-[#7d3c16] font-bold">Curso de Inglês</strong> e aperte em <strong className="font-semibold">Criar chave</strong>.
                  </p>
                </div>

                <div className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-50 border border-[#dfcbb0] flex items-center justify-center font-bold text-[10px] text-classic-gold shrink-0 mt-0.5">
                    4
                  </span>
                  <p className="leading-relaxed">
                    Copie a chave gerada.
                  </p>
                </div>

                <div className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-50 border border-[#dfcbb0] flex items-center justify-center font-bold text-[10px] text-classic-gold shrink-0 mt-0.5">
                    5
                  </span>
                  <p className="leading-relaxed">
                    Volte para o aplicativo <strong className="font-serif font-bold text-classic-ink">FluentRoleplay</strong> e cole o texto na caixa solicitada.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyInstructions(false)}
                  className="flex-1 py-3 border border-[#e2dacb] text-[#8e8574] hover:bg-slate-50 font-bold rounded-xl text-center text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowKeyInstructions(false)}
                  className="flex-[1.5] py-3 bg-classic-green hover:bg-classic-green-light text-white font-bold rounded-xl text-center text-xs uppercase tracking-wider cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span>Entendi</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* MAIN BODY APP VIEW                                            */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 p-3 md:p-6 flex flex-col justify-start relative z-10 max-w-2xl mx-auto w-full">
        {username && (
          <div className="w-full">

            <AnimatePresence mode="wait">
              
              {/* ======================================================== */}
              {/* 1. INITIAL ALIGNMENT SCREEN                              */}
              {/* ======================================================== */}
              {appMode === 'ALIGNMENT' && (
                <AlignmentScreen
                  username={username}
                  onCompleted={handleAlignmentCompleted}
                />
              )}

              {/* ======================================================== */}
              {/* 2. CENTRAL MAIN MENU TABLET                              */}
              {/* ======================================================== */}
              {appMode === 'MENU' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 pt-6 font-serif"
                >
                  <div className="text-center py-4 relative">
                    {/* Strategic Save button positioned at top right */}
                    <div className="absolute top-0 right-0 md:top-1 md:right-1">
                      <button
                        type="button"
                        onClick={handleManualSaveToCloud}
                        disabled={isSavingToCloud}
                        title="Salvar progresso na nuvem"
                        className="w-10 h-10 rounded-xl bg-[#e5dec9] hover:bg-[#dcd3ba] active:scale-95 border border-[#d3c8ad] flex items-center justify-center cursor-pointer transition-all shadow-2xs group relative"
                      >
                        {isSavingToCloud ? (
                          <Loader2 className="w-5 h-5 animate-spin text-[#6d6250]" />
                        ) : (
                          <span className="text-lg select-none">💾</span>
                        )}
                      </button>
                    </div>

                    <span className="text-[10px] font-mono font-bold tracking-[0.25em] text-classic-gold uppercase block mb-1">
                      Bem-vindo ao FluentRoleplay
                    </span>
                    <h1 className="text-3xl font-serif font-bold text-classic-ink tracking-tight mb-2">
                      Olá, {username}
                    </h1>
                    <p className="text-xs text-[#8e8574] leading-relaxed max-w-sm mx-auto font-sans mt-3">
                      <span className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.1em] text-classic-gold text-[10px] mb-1">
                        ✨ Recomendamos {recommendation.title}:
                      </span>
                      <span className="block italic text-slate-600 mt-0.5">
                        "{recommendation.message}"
                      </span>
                    </p>
                  </div>

                  <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-8 shadow-sm space-y-4">
                    
                    {/* Big Button A: Stories */}
                    <button
                      id="tutorial_btn_stories"
                      onClick={() => {
                        if (isStoryLoaded) {
                          setAppMode('CONVERSATION');
                        } else {
                          setAppMode('SETUP');
                        }
                      }}
                      className="w-full text-left p-6 border border-[#e2dacb] rounded-2xl bg-classic- cream/30 hover:bg-classic-cream transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-start gap-4">
                        <span className="text-2xl mt-1">📖</span>
                        <div>
                          <h2 className="text-lg font-serif font-bold text-classic-ink group-hover:text-classic-gold transition-colors">
                            Stories
                          </h2>
                          <p className="text-xs text-[#8e8574] font-sans mt-1 leading-relaxed">
                            Simulação e conversa por áudio imersivo interpretando personagens no exterior.
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-classic-gold group-hover:translate-x-1 transition-transform" />
                    </button>

                    {/* Big Button B: Course */}
                    <button
                      id="tutorial_btn_course"
                      onClick={() => setAppMode('COURSE')}
                      className="w-full text-left p-6 border border-[#e2dacb] rounded-2xl bg-classic- cream/30 hover:bg-classic-cream transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-start gap-4">
                        <span className="text-2xl mt-1">🎓</span>
                        <div>
                          <h2 className="text-lg font-serif font-bold text-classic-ink group-hover:text-classic-gold transition-colors">
                            Curso Particular
                          </h2>
                          <p className="text-xs text-[#8e8574] font-sans mt-1 leading-relaxed">
                            Estude explicações teóricas, resolva fixadores ou pratique chamadas de áudio com a Professora.
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-classic-gold group-hover:translate-x-1 transition-transform" />
                    </button>

                  </div>

                  {/* Settings quick toggle bottom bar */}
                  <div className="text-center pt-2">
                    <button
                      id="tutorial_btn_settings"
                      onClick={() => setShowSettingsDrawer(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#e2dacb] hover:bg-classic-cream text-xs text-[#8e8574] transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configurações & Progresso</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ======================================================== */}
              {/* 3. IMIGRATION TRANSITIONAL SETUP                         */}
              {/* ======================================================== */}
              {appMode === 'SETUP' && (
                <SetupScreen
                  username={username}
                  baselineProficiency={baselineProficiency}
                  nextGrammaticalFocus={nextGrammaticalFocus}
                  onCompleted={handleSetupCompleted}
                  onGoBackMenu={() => setAppMode('MENU')}
                />
              )}

              {/* ======================================================== */}
              {/* 4. ACTIVE CONVERSATIONAL STORIES                         */}
              {/* ======================================================== */}
              {appMode === 'CONVERSATION' && (
                <div key={`fluent_session_${activeCharacter}_${initialReply.slice(0, 32).replace(/[^a-zA-Z0-9]/g, "_")}`} className="w-full">
                  <ErrorBoundary onGoBackMenu={() => setAppMode('MENU')}>
                    <ConversationScreen
                      initialReply={initialReply}
                      narrativeSetting={activeStorySetting}
                      activeCharacter={activeCharacter}
                      baselineProficiency={baselineProficiency}
                      nextGrammaticalFocus={nextGrammaticalFocus}
                      onTrackError={handleTrackError}
                      onTrackStrength={handleTrackStrength}
                      onUpdatePlan={handleUpdatePlan}
                      onSwitchSetting={setActiveStorySetting}
                      onGoBackMenu={() => setAppMode('MENU')}
                      onResetStory={handleResetStory}
                      globalErrors={globalErrors}
                    />
                  </ErrorBoundary>
                </div>
              )}

              {/* ======================================================== */}
              {/* 5. CORE ADAPTIVE COURSE COMPONENT                        */}
              {/* ======================================================== */}
              {appMode === 'COURSE' && (
                <CourseScreen
                  grammaticalFocus={nextGrammaticalFocus}
                  username={username}
                  baselineProficiency={baselineProficiency}
                  strengthsSummary={strengthsSummary}
                  globalErrors={globalErrors}
                  globalStrengths={globalStrengths}
                  onAdvanceProficiency={handleCourseDynamicProgress}
                  onTrackErrors={(errs) => setGlobalErrors((prev) => [...errs, ...prev])}
                  onUpdateFocus={setNextGrammaticalFocus}
                  onGoBackMenu={() => setAppMode('MENU')}
                  weeklyPlan={weeklyPlan}
                  isDevMode={isDevModeUnlocked || (appMode as string) === 'DEVELOPER'}
                  onCompleteLessonTopic={(topicLabel) => handleLessonCompletedSuccess(topicLabel, true)}
                  adaptations={adaptations}
                  onTriggerAdaptation={() => triggerMonthlyReview(undefined, 'manual')}
                />
              )}

              {/* ======================================================== */}
              {/* 6. DEV MODE CONFIGURATION PANEL                          */}
              {/* ======================================================== */}
              {appMode === 'DEVELOPER' && (
                <DeveloperScreen
                  userId={currentUser?.uid || 'guest'}
                  onBack={() => setAppMode('MENU')}
                  onReloadWeeklyPlan={handleReloadWeeklyPlan}
                />
              )}

            </AnimatePresence>

          </div>
        )}
      </main>

      {/* ============================================================= */}
      {/* PERSISTENT CONFIGURATIONS DRAWER MODAL                         */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showSettingsDrawer && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-serif">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-sm w-full shadow-lg relative flex flex-col max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="absolute top-4 right-4 text-[#7d715e]"
              >
                <XCircle className="w-5 h-5 text-slate-300 hover:text-slate-400" />
              </button>

              <div className="text-center pb-4 border-b border-slate-100 mb-4">
                <div className="w-10 h-10 rounded-full mx-auto bg-classic-cream flex items-center justify-center text-classic-gold border border-[#dfcbb0] mb-2">
                  <Settings className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-serif font-bold text-classic-ink">Configurações & Status</h3>
                <p className="text-[#8e8574] text-[11px] leading-relaxed mt-0.5">Métricas de rendimento lingüístico calculadas</p>
              </div>

              <div className="space-y-3 font-sans text-xs flex-1">
                <div className="bg-classic-cream p-4 rounded-2xl border border-[#e2dacb] space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[#8e8574]">Apelido do Aluno</span>
                    <strong className="text-classic-ink font-serif text-sm">{username}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#8e8574]">Nível Diagnosticado</span>
                    <strong className="text-classic-ink font-serif text-sm">
                      {baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediário' : 'Iniciante'}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#8e8574]">Foco Recente de Estudo</span>
                    <strong className="text-classic-gold font-serif text-sm">{nextGrammaticalFocus}</strong>
                  </div>
                   <div className="flex justify-between items-center">
                    <span className="text-[#8e8574]">Fluência Estimada</span>
                    <div className="text-right">
                      <strong className="text-emerald-800 font-serif text-sm">
                        {currentFluencyPercent}% (±{progressData.marginOfError}%)
                      </strong>
                      <span className={`block text-[9.5px] font-sans font-semibold tracking-tight ${
                        progressData.confidenceRating === 'Confiança Alta'
                          ? 'text-emerald-700'
                          : progressData.confidenceRating === 'Confiança Moderada'
                          ? 'text-amber-700'
                          : 'text-red-600 animate-pulse'
                      }`}>
                        {progressData.confidenceRating}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#8e8574]">Meses Est. Restantes</span>
                    <strong className="text-classic-ink font-serif text-sm">{estimatedMonths} m</strong>
                  </div>
                </div>

                {/* Sincronização em Nuvem (Cloud Sync) Section */}
                <div id="cloud_sync_section" className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#e2dacb] space-y-3">
                  <div className="flex items-center gap-1.5 text-classic-gold font-serif font-bold text-xs uppercase tracking-wider">
                    <Cloud className="w-3.5 h-3.5 animate-pulse" />
                    <span>Sincronização em Nuvem</span>
                  </div>
                  
                  {currentUser ? (
                    <div className="space-y-2 font-sans text-xs">
                      <div className="flex flex-col gap-1 text-[#8e8574]">
                        <span>Conta Conectada</span>
                        <span className="text-classic-ink font-semibold truncate bg-white/60 p-2.5 rounded-lg border border-[#e2dacb]">{currentUser.email}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-emerald-800">
                        <span className="flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Progresso salvo na nuvem
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            setSyncing(true);
                            await logoutUser();
                            setShowSettingsDrawer(false);
                          } catch (e) {
                            alert("Erro ao sair: " + e);
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        className="w-full py-2 bg-white hover:bg-rose-50 border border-[#e2dacb] text-rose-700 hover:text-rose-600 font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 font-sans text-xs text-[#8e8574]">
                      <p className="leading-relaxed text-[11px]">
                        Conecte sua conta para garantir que suas histórias, snapshots e progresso estejam salvos e acessíveis de qualquer aparelho.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            setSyncing(true);
                            await loginWithGoogle();
                            setShowSettingsDrawer(false);
                          } catch (e) {
                            console.error(e);
                            alert("Dispositivo em sandbox ou login cancelado. Seus dados continuam no navegador localmente.");
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        disabled={syncing}
                        className="w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                      >
                        {syncing ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <Cloud className="w-4 h-4 text-white" />
                        )}
                        <span>Sincronizar com Google</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-3 space-y-2">
                  <button
                    onClick={() => {
                      setShowSettingsDrawer(false);
                      setShowHelpGuide(true);
                    }}
                    className="w-full py-2.5 text-center bg-classic-cream hover:bg-[#FAF6EE] text-[#7d715e] border border-[#e2dacb] text-xs font-semibold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>ℹ️ Como Funciona o Aplicativo</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowSettingsDrawer(false);
                      setIsTutorialActive(true);
                    }}
                    className="w-full py-2.5 text-center bg-classic-cream hover:bg-[#FAF6EE] text-[#7d715e] border border-[#e2dacb] text-xs font-semibold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>🎓 Refazer Tutorial Onboarding</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowSettingsDrawer(false);
                      handleFullReset();
                    }}
                    className="w-full py-2.5 text-center bg-rose-50 hover:bg-rose-100/50 text-rose-700 hover:text-rose-600 border border-rose-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Geral de dados</span>
                  </button>

                  <div className="border-t border-[#e2dacb] pt-3 space-y-1.5 font-sans">
                    {!isDevModeUnlocked ? (
                      <div className="flex items-center gap-1.5 p-1 bg-[#FAF6EE] border border-[#e2dacb] rounded-xl">
                        <input
                          id="dev_passcode_input"
                          type="password"
                          placeholder="Senha Dev..."
                          className="w-full bg-transparent px-2.5 py-1 text-[11px] text-classic-ink focus:outline-none placeholder-[#b0a590]"
                          value={passwordInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPasswordInput(val);
                            if (val === '0985') {
                              setIsDevModeUnlocked(true);
                              safeLocalStorageSet('fluent_dev_unlocked', 'true');
                              setPasswordInput('');
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowSettingsDrawer(false);
                          setAppMode('DEVELOPER');
                        }}
                        className="w-full py-2.5 bg-classic-gold hover:bg-[#cbb58c] text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-1"
                      >
                        <span>🔧 Painel do Desenvolvedor</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="mt-6 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white font-semibold text-xs rounded-xl"
              >
                Voltar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* HOW THE APP WORKS HELPER MODAL (COMO FUNCIONA O APLICATIVO) */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showHelpGuide && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto font-serif">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowHelpGuide(false)}
                className="absolute top-4 right-4 text-[#7d715e]"
              >
                <XCircle className="w-5 h-5 text-slate-300 hover:text-slate-400" />
              </button>

              <div className="text-center pb-4 border-b border-slate-100 mb-6 font-serif">
                <span className="text-2xl block mb-2">ℹ️</span>
                <h3 className="text-xl font-bold text-classic-ink">Como Funciona o Aplicativo</h3>
                <p className="text-[#8e8574] text-xs font-sans mt-0.5">Conheça os pilares pedagógicos e dinâmicas do FluentRoleplay</p>
              </div>

              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar font-sans text-xs">
                
                {/* 1. Stories */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>📖</span>
                    <span>Stories (Histórias Práticas)</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    Você vive diálogos cotidianos interpretando situações reais em cidades no exterior. Seu maior objetivo é se fazer compreender, focado na conversa imersiva, e não em regras rígidas.
                  </p>
                </div>

                {/* 2. Relacionamento & Amizades */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>🤝</span>
                    <span>Relacionamentos & Afinidade</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    Suas atitudes moldam a proximidade com moradores. Personagens guardam recordações de encontros passados e podem adicionar seu nome aos contatos para continuar conversando espontaneamente.
                  </p>
                </div>

                {/* 3. Planejamento Adaptativo */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>🧭</span>
                    <span>Plano de Estudos Inteligente</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    Em segundo plano, o sistema monitora sua confiança e fluência ao conversar. O seu plano de estudos é reconduzido em tempo real, priorizando os temas que você mais necessita.
                  </p>
                </div>

                {/* 4. Dificuldades Catalogadas */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>⚠️</span>
                    <span>Dificuldades Automatizadas</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    Qualquer desvio sintático é catalogado em sua folha de progressão. Você pode revisar as explicações didáticas com tranquilidade, sabendo que as dificuldades somem assim que você demonstrar acertos.
                  </p>
                </div>

                {/* 5. Exercícios de Nível */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>✏️</span>
                    <span>Exercícios Fixadores</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    Divididos em três fases: Teoria clara em português, Perguntas de Múltipla Escolha sobre desvios recorrentes e Tradução Ativa Prática para blindar sua gramática.
                  </p>
                </div>

                {/* 6. Tutora Particular */}
                <div className="space-y-1 p-3.5 bg-classic-cream rounded-xl border border-[#e2dacb]">
                  <div className="flex items-center gap-2 text-classic-ink font-serif font-bold text-sm">
                    <span>👩‍🏫</span>
                    <span>Professora de Voz Particular</span>
                  </div>
                  <p className="text-[#7d715e] leading-relaxed">
                    A Professora Madson interage com você por voz em chamadas virtuais. Ela traz explicações simples em português acompanhadas de exemplos claros e feedback de pronúncia imediato.
                  </p>
                </div>

              </div>

              <div className="pt-6 border-t border-slate-100 flex gap-3 font-sans">
                <button
                  onClick={() => {
                    setShowHelpGuide(false);
                    setIsTutorialActive(true);
                  }}
                  className="flex-1 py-2.5 text-center bg-classic-gold hover:bg-classic-gold-hover text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Fazer Tutorial de Voz
                </button>
                <button
                  onClick={() => setShowHelpGuide(false)}
                  className="flex-1 py-2.5 text-center bg-classic-green hover:bg-classic-green-light text-white font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Entendi, Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* CORE INTEGRATED ONBOARDING TUTORIAL GUIDE                     */}
      {/* ============================================================= */}
      <TutorialGuide
        isActive={isTutorialActive}
        onFinish={() => {
          setIsTutorialActive(false);
          safeLocalStorageSet('fluent_tutorial_done', 'true');
          setAppMode('MENU');
        }}
        appMode={appMode}
        setAppMode={(mode) => setAppMode(mode)}
        isStoryLoaded={isStoryLoaded}
        setIsStoryLoaded={setIsStoryLoaded}
      />

      {/* ============================================================= */}
      {/* CLOUD OVERWRITING CONFIRMATION DIALOG                        */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showReplaceConfirmation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] font-serif">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-rose-100 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="text-center">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-200">
                  <AlertCircle className="w-6 h-6 animate-pulse" />
                </div>
                <h4 className="text-lg font-bold text-stone-900">Atenção Crítica</h4>
                <p className="text-xs text-[#8e8574] font-sans mt-2 leading-relaxed">
                  Tem certeza? O histórico atualmente armazenado na nuvem será substituído completamente pelos dados locais deste dispositivo. Esta operação é irreversível.
                </p>
              </div>

              <div className="flex gap-2 font-sans pt-2">
                <button
                  type="button"
                  onClick={() => setShowReplaceConfirmation(false)}
                  className="flex-1 py-3 text-center bg-slate-100 hover:bg-slate-200 text-slate-705 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentUser) return;
                    setSyncing(true);
                    try {
                      const localState = getLocalStateSnapshot();
                      await writeStateToCloud(currentUser.uid, localState);
                      setConflictResult(null);
                      setShowReplaceConfirmation(false);
                    } catch (e) {
                      alert("Erro ao sobrescrever dados: " + e);
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="flex-1 py-3 text-center bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Confirmar Substituição
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* HISTORIC COLLISION RESOLUTION SCREEN (TELA DE RESOLUÇÃO)     */}
      {/* ============================================================= */}
      <AnimatePresence>
        {conflictResult && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto font-serif">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#FAF8F5] border border-[#e8e2d5] rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 my-8"
            >
              <div className="text-center space-y-2 pb-4 border-b border-[#e2dacb]">
                <div className="w-12 h-12 bg-classic-cream rounded-full mx-auto flex items-center justify-center text-classic-gold border border-[#dfcbb0]">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-classic-ink">
                  Conflito de Histórico Detectado
                </h3>
                <p className="text-[#8e8574] text-xs font-sans leading-relaxed max-w-md mx-auto">
                  Encontramos mais de um histórico associado a esta conta. Escolha qual deles deverá tornar-se o histórico oficial.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-xs">
                
                {/* Device Local Option Card */}
                <div className="bg-white border border-[#e2dacb] rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <Smartphone className="w-4 h-4 text-classic-gold" />
                      <span className="font-serif font-bold text-stone-900 text-sm">Dispositivo Atual</span>
                    </div>
                    <ul className="space-y-2 text-[#7d715e] leading-relaxed">
                      <li>• Última atividade: <strong className="text-stone-900">Agora (local)</strong></li>
                      <li>• Progresso: <strong className="text-stone-900">{conflictResult.local.isAligned ? "Alinhamento Concluído" : "Não Alinhado"}</strong></li>
                      <li>• Cidade atual: <strong className="text-stone-900">{conflictResult.local.setting}</strong></li>
                      <li>• Dias de jornada: <strong className="text-stone-900">{conflictResult.local.dayCount} dias</strong></li>
                      <li>• Personagens conhecidos: <strong className="text-stone-900">{conflictResult.local.characterCount}</strong></li>
                      <li>• Snapshots semanais: <strong className="text-stone-900">{conflictResult.local.snapshotCount} registros</strong></li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentUser) return;
                      setSyncing(true);
                      try {
                        const localState = getLocalStateSnapshot();
                        await writeStateToCloud(currentUser.uid, localState);
                        reloadEverythingFromLocal(true);
                        setConflictResult(null);
                      } catch (e) {
                        alert("Erro ao salvar dados locais do dispositivo: " + e);
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    className="w-full mt-4 py-2.5 bg-classic-gold hover:bg-classic-gold-hover text-white font-bold rounded-xl transition-colors text-center cursor-pointer"
                  >
                    Usar Histórico Deste Dispositivo
                  </button>
                </div>

                {/* Cloud Option Card */}
                <div className="bg-white border border-[#e2dacb] rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <Cloud className="w-4 h-4 text-classic-green" />
                      <span className="font-serif font-bold text-stone-900 text-sm">Histórico na Nuvem</span>
                    </div>
                    <ul className="space-y-2 text-[#7d715e] leading-relaxed">
                      <li>• Última atividade: <strong className="text-stone-900">{conflictResult.cloud.lastUpdatedAt !== 'Agora' ? new Date(conflictResult.cloud.lastUpdatedAt).toLocaleString('pt-BR') : 'Sem data'}</strong></li>
                      <li>• Progresso: <strong className="text-stone-900">{conflictResult.cloud.isAligned ? "Alinhamento Concluído" : "Não Alinhado"}</strong></li>
                      <li>• Cidade atual: <strong className="text-stone-900">{conflictResult.cloud.setting}</strong></li>
                      <li>• Dias de jornada: <strong className="text-stone-900">{conflictResult.cloud.dayCount} dias</strong></li>
                      <li>• Personagens conhecidos: <strong className="text-stone-900">{conflictResult.cloud.characterCount}</strong></li>
                      <li>• Snapshots semanais: <strong className="text-stone-900">{conflictResult.cloud.snapshotCount} registros</strong></li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentUser) return;
                      setSyncing(true);
                      try {
                        applyStateToLocalStorage(conflictResult.cloudRaw);
                        reloadEverythingFromLocal(true);
                        setConflictResult(null);
                      } catch (e) {
                        alert("Erro ao restaurar histórico na nuvem: " + e);
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    className="w-full mt-4 py-2.5 bg-classic-green hover:bg-classic-green-light text-white font-bold rounded-xl transition-colors text-center cursor-pointer"
                  >
                    Usar Histórico da Nuvem
                  </button>
                </div>

              </div>

              {/* Special Essential Root Device Principal Setter option */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-3xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 text-xs font-serif font-bold uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 animate-bounce" />
                  <span>⭐ Definir este dispositivo como principal</span>
                </div>
                <p className="text-[11px] font-sans text-stone-600 leading-relaxed">
                  Esta opção existe especialmente para usuários que estavam utilizando um aparelho principal e outros aparelhos apenas para testes. Ao selecioná-la, todo o histórico desse dispositivo sobe para a nuvem e substitui completamente os registros remotos salvos.
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setShowReplaceConfirmation(true)}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-sans font-bold text-xs rounded-xl cursor-pointer transition-all shadow-xs"
                  >
                    Confirmar Dispositivo Principal
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Reset Confirmation Modal (safe for sandboxed iframes) */}
      <AnimatePresence>
        {resetModalConfig.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] font-serif">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-sm w-full shadow-2xl relative flex flex-col text-center"
            >
              <div className="w-12 h-12 rounded-full mx-auto bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 mb-4">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-2">Confirmar Reinício</h3>
              <p className="text-stone-600 font-sans text-sm leading-relaxed mb-6">
                Isso vai fazer que uma nova jornada se inicia. Confirmar / Cancelar
              </p>
              <div className="flex gap-3 justify-center font-sans">
                <button
                  type="button"
                  onClick={() => setResetModalConfig({ isOpen: false, type: null })}
                  className="flex-1 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-stone-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const type = resetModalConfig.type;
                    setResetModalConfig({ isOpen: false, type: null });
                    if (type === 'ALL') {
                      executeFullReset();
                    } else if (type === 'STORY') {
                      executeResetStory();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl cursor-pointer transition-all shadow-xs"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* MANUAL CLOUD SAVE SUCCESS MODAL                                */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showSaveSuccessModal && (
          <div
            onClick={() => setShowSaveSuccessModal(false)}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 font-serif cursor-pointer select-none"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl space-y-3 relative"
            >
              <div className="w-12 h-12 rounded-full mx-auto bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold text-xl">
                ✓
              </div>
              <h3 className="text-lg font-serif font-bold text-classic-ink leading-snug">
                Seu progresso foi salvo com sucesso
              </h3>
              <p className="text-[11px] text-[#8e8574] font-sans">
                Toque em qualquer lugar para fechar
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
