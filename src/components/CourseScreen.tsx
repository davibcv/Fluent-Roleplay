import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Sparkles, AlertCircle, ArrowRight, CheckCircle2, 
  XCircle, BrainCircuit, RotateCcw, Loader2, HelpCircle, PenTool, Check, MessageSquare,
  Clock, Calendar, Sliders, X, RefreshCw
} from 'lucide-react';
import { CourseQuestion, IdentifiedError, DEFAULT_NODES, WeekPlan, AdaptationRecord } from '../types';
import { getVocabularyWordsForTopic, getLearnedVocabWords } from '../utils/plan';
import TeacherVoiceScreen from './TeacherVoiceScreen';
import ActivePassiveLoader from './ActivePassiveLoader';
import DifficultiesScreen from './DifficultiesScreen';
import ExerciseDoubtChat from './ExerciseDoubtChat';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet } from '../utils/safeStorage';


interface CourseScreenProps {
  grammaticalFocus: string;
  username?: string;
  baselineProficiency?: string;
  strengthsSummary?: string;
  globalErrors?: IdentifiedError[];
  globalStrengths?: { topicId: string; count: number; lastPhrase: string }[];
  onAdvanceProficiency: (adjustment: string, wasApproved?: boolean) => void;
  onTrackErrors: (errors: IdentifiedError[]) => void;
  onUpdateFocus?: (newFocus: string) => void;
  onGoBackMenu?: () => void;
  weeklyPlan?: WeekPlan[];
  isDevMode?: boolean;
  onCompleteLessonTopic?: (topicLabel: string) => void;
  adaptations?: AdaptationRecord[];
  onTriggerAdaptation?: () => void;
}

export default function CourseScreen({ 
  grammaticalFocus, 
  username = '', 
  baselineProficiency = 'Intermediate', 
  strengthsSummary = '',
  globalErrors = [],
  globalStrengths = [],
  onAdvanceProficiency, 
  onTrackErrors, 
  onUpdateFocus,
  onGoBackMenu,
  weeklyPlan = [],
  isDevMode = false,
  onCompleteLessonTopic,
  adaptations = [],
  onTriggerAdaptation
}: CourseScreenProps) {

  // Visual sub-views routing state: 'MENU' | 'EXERCISING' | 'TEACHING' | 'PLAN' | 'DIFF'
  const [activeTab, setActiveTab] = useState<'MENU' | 'EXERCISING' | 'TEACHING' | 'PLAN' | 'DIFF'>('MENU');
  
  const [showAdaptationsModal, setShowAdaptationsModal] = useState(false);
  const [isAdapting, setIsAdapting] = useState(false);

  const handleAdaptNowClick = async () => {
    if (onTriggerAdaptation) {
      setIsAdapting(true);
      try {
        await onTriggerAdaptation();
      } catch (err) {
        console.error("Erro ao executar adaptação manual:", err);
      } finally {
        setIsAdapting(false);
      }
    }
  };

  // Derive last adaptation details securely
  const lastAdaptation = adaptations && adaptations.length > 0 ? adaptations[0] : null;

  let lastAdaptationDateText: string | null = null;
  let lastAdaptationOriginText: string | null = null;
  let hasValidDateOrOrigin = false;

  if (lastAdaptation) {
    if (lastAdaptation.timestamp) {
      const d = new Date(lastAdaptation.timestamp);
      if (!isNaN(d.getTime())) {
        const dateStr = d.toLocaleDateString('pt-BR');
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        lastAdaptationDateText = `${dateStr} às ${timeStr}`;
        hasValidDateOrOrigin = true;
      }
    }

    if (lastAdaptation.origin) {
      lastAdaptationOriginText = lastAdaptation.origin;
      hasValidDateOrOrigin = true;
    } else if (lastAdaptation.id === 'baseline' || lastAdaptation.id.startsWith('review_')) {
      lastAdaptationOriginText = 'automática';
      hasValidDateOrOrigin = true;
    }
  }

  const lastAdaptationChanges: string[] = [];
  if (lastAdaptation) {
    if (Array.isArray(lastAdaptation.changesSummary) && lastAdaptation.changesSummary.length > 0) {
      lastAdaptationChanges.push(...lastAdaptation.changesSummary);
    }
  }
  const hasRecordedChanges = lastAdaptationChanges.length > 0;

  let nextScheduledDateText: string | null = null;
  if (lastAdaptation && lastAdaptation.nextScheduledDate) {
    const nd = new Date(lastAdaptation.nextScheduledDate);
    if (!isNaN(nd.getTime())) {
      nextScheduledDateText = nd.toLocaleDateString('pt-BR');
    }
  }
  
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab === 'PLAN' && weeklyPlan && weeklyPlan.length > 0) {
      // If expandedWeek is already set to a valid weekNumber in weeklyPlan, keep it!
      if (expandedWeek !== null && weeklyPlan.some(w => w.weekNumber === expandedWeek)) {
        return;
      }
      const currentWeekIdx = weeklyPlan.findIndex(w => w.contents.some(c => !c.completed));
      if (currentWeekIdx !== -1 && weeklyPlan[currentWeekIdx]?.weekNumber) {
        setExpandedWeek(weeklyPlan[currentWeekIdx].weekNumber);
      } else if (weeklyPlan[0]?.weekNumber) {
        setExpandedWeek(weeklyPlan[0].weekNumber);
      }
    }
  }, [activeTab, weeklyPlan, expandedWeek]);
  
  // Show Aula choices expansion
  const [showAulaSubmenu, setShowAulaSubmenu] = useState(false);

  // Selected difficulty explanation popup state
  const [selectedDifficultyExplanation, setSelectedDifficultyExplanation] = useState<{ label: string; details: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [courseData, setCourseData] = useState<{
    theory: string;
    phase1: CourseQuestion[];
    phase2: CourseQuestion[];
    phase3: CourseQuestion[];
  } | null>(null);

  // Phase progress state
  // 'THEORY' | 'EASY' | 'MEDIUM' | 'HARD' | 'COMPLETED'
  const [currentSection, setCurrentSection] = useState<'THEORY' | 'EASY' | 'MEDIUM' | 'HARD' | 'COMPLETED'>('THEORY');
  
  // MCQ state (Phase 1 / 2)
  const [mcqIndex, setMcqIndex] = useState(0);
  const [mcqAnswers, setMcqAnswers] = useState<string[]>([]);
  const [mcqChecked, setMcqChecked] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  // Active production (Phase 3) state
  const [hardAnswers, setHardAnswers] = useState<string[]>(['', '', '', '', '', '']);
  const [hardResults, setHardResults] = useState<any>(null); // evaluation response from backend
  const [grading, setGrading] = useState(false);

  const getAutoPlannedExerciseType = (): 'GRAMMAR' | 'VOCABULARY' | 'CHUNKS' => {
    // 1. Get history of exercise types from localStorage
    let history: string[] = [];
    try {
      const raw = localStorage.getItem('fluent_exercise_type_history');
      if (raw) {
        history = JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading fluent_exercise_type_history:", e);
    }
    if (!Array.isArray(history)) {
      history = [];
    }

    if (history.length === 0) {
      const olderLast = localStorage.getItem('fluent_last_exercise_type');
      if (olderLast) {
        history = [olderLast];
      }
    }

    // 2. Count frequencies in recent history (last 6 items)
    const recent = history.slice(-6);
    const countGrammar = recent.filter(t => t === 'GRAMMAR').length;
    const countVocab = recent.filter(t => t === 'VOCABULARY').length;
    const countChunks = recent.filter(t => t === 'CHUNKS').length;

    // 3. Score each category
    let scoreGrammar = 1.0;
    let scoreVocab = 1.0;
    let scoreChunks = 1.0;

    // A. Variety/recency penalty: de-prioritize the most recent types to avoid direct back-to-back repetitions
    if (history.length > 0) {
      const last = history[history.length - 1];
      if (last === 'GRAMMAR') scoreGrammar *= 0.15;
      if (last === 'VOCABULARY') scoreVocab *= 0.15;
      if (last === 'CHUNKS') scoreChunks *= 0.15;
    }
    if (history.length > 1) {
      const secondLast = history[history.length - 2];
      if (secondLast === 'GRAMMAR') scoreGrammar *= 0.4;
      if (secondLast === 'VOCABULARY') scoreVocab *= 0.4;
      if (secondLast === 'CHUNKS') scoreChunks *= 0.4;
    }

    // B. Under-representation bonus: if a category hasn't been played in the last 6, boost it
    if (countGrammar === 0) scoreGrammar += 2.0;
    if (countVocab === 0) scoreVocab += 2.0;
    if (countChunks === 0) scoreChunks += 2.0;

    // C. Over-representation penalty: prevent monopoly (especially grammar)
    if (countGrammar >= 3) scoreGrammar *= 0.3;
    if (countVocab >= 3) scoreVocab *= 0.3;
    if (countChunks >= 3) scoreChunks *= 0.3;

    // D. Global Errors (dificuldades existentes) matching
    let vocabErrorCount = 0;
    let chunkErrorCount = 0;
    let grammarErrorCount = 0;

    if (Array.isArray(globalErrors)) {
      globalErrors.forEach(err => {
        const type = (err.error_type || '').toLowerCase();
        const expl = (err.explanation || '').toLowerCase();
        const userPhrase = (err.user_phrase || '').toLowerCase();

        if (type.includes('vocab') || type.includes('word') || type.includes('lexic') || expl.includes('vocabulário') || expl.includes('termo') || expl.includes('palavra')) {
          vocabErrorCount++;
        } else if (type.includes('chunk') || type.includes('colloc') || type.includes('idiom') || type.includes('phras') || expl.includes('bloco') || expl.includes('expressão') || expl.includes('natural')) {
          chunkErrorCount++;
        } else if (type.includes('gramm') || type.includes('syntax') || type.includes('tense') || type.includes('verbo') || type.includes('prepos') || expl.includes('gramática') || expl.includes('regra') || expl.includes('estrutura')) {
          grammarErrorCount++;
        }
      });
    }

    // Boost based on active difficulties
    if (vocabErrorCount > 0) scoreVocab += Math.min(vocabErrorCount * 0.4, 2.0);
    if (chunkErrorCount > 0) scoreChunks += Math.min(chunkErrorCount * 0.4, 2.0);
    if (grammarErrorCount > 0) scoreGrammar += Math.min(grammarErrorCount * 0.4, 2.0);

    // E. Hard protection against absolute monopoly:
    // If Grammar has been chosen 4 or more times in the last 6, force select Vocab or Chunks
    if (countGrammar >= 4) {
      scoreGrammar = 0.001;
    }

    console.log("Planner Auto-Scoring details:", {
      recentHistory: recent,
      scores: { GRAMMAR: scoreGrammar, VOCABULARY: scoreVocab, CHUNKS: scoreChunks },
      errorsMatched: { grammar: grammarErrorCount, vocab: vocabErrorCount, chunks: chunkErrorCount }
    });

    if (scoreGrammar >= scoreVocab && scoreGrammar >= scoreChunks) {
      return 'GRAMMAR';
    } else if (scoreVocab >= scoreGrammar && scoreVocab >= scoreChunks) {
      return 'VOCABULARY';
    } else {
      return 'CHUNKS';
    }
  };

  const saveExerciseTypeToHistory = (type: 'GRAMMAR' | 'VOCABULARY' | 'CHUNKS') => {
    try {
      let history: string[] = [];
      const raw = localStorage.getItem('fluent_exercise_type_history');
      if (raw) {
        history = JSON.parse(raw);
      }
      if (!Array.isArray(history)) {
        history = [];
      }
      history.push(type);
      if (history.length > 30) {
        history = history.slice(-30);
      }
      safeLocalStorageSet('fluent_exercise_type_history', JSON.stringify(history));
      safeLocalStorageSet('fluent_last_exercise_type', type);
    } catch (e) {
      console.error("Error saving exercise type history:", e);
    }
  };

  const [exerciseType, setExerciseType] = useState<'GRAMMAR' | 'VOCABULARY' | 'CHUNKS'>(() => {
    // We cannot reference globalErrors inside lazy initializer directly as it can change,
    // but we can initialize with the default.
    return 'GRAMMAR';
  });

  // Re-run the auto-planned exercise type select on tab change, focus change or error updates
  useEffect(() => {
    if (activeTab === 'MENU') {
      let matchedType: 'GRAMMAR' | 'VOCABULARY' | 'CHUNKS' | null = null;
      if (grammaticalFocus && weeklyPlan) {
        for (const week of weeklyPlan) {
          const match = week.contents.find(
            c => c.label.toLowerCase().trim() === grammaticalFocus.toLowerCase().trim()
          );
          if (match) {
            if (match.type === 'Grammar') matchedType = 'GRAMMAR';
            else if (match.type === 'Vocabulary') matchedType = 'VOCABULARY';
            else if (match.type === 'Blocos de fala') matchedType = 'CHUNKS';
            break;
          }
        }
      }

      if (matchedType) {
        setExerciseType(matchedType);
      } else {
        const nextType = getAutoPlannedExerciseType();
        setExerciseType(nextType);
      }
    }
  }, [activeTab, grammaticalFocus, globalErrors, weeklyPlan]);
  const [mcqResult, setMcqResult] = useState<{ score: number; pass: boolean; section: 'EASY' | 'MEDIUM' } | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [apiQuotaError, setApiQuotaError] = useState<{ isQuota: boolean; message: string; estimate: string } | null>(null);

  const getCurriculumCacheKey = () => `fluent_course_cache_${grammaticalFocus}_${exerciseType}`;

  // Auto fetch structured curriculum ONLY when activeTab is EXERCISING and data is not yet loaded
  useEffect(() => {
    if (activeTab === 'EXERCISING') {
      const cacheKey = getCurriculumCacheKey();
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsedCache = JSON.parse(cached);
          if (parsedCache && parsedCache.theory && parsedCache.phase1) {
            setCourseData(parsedCache);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("[CourseScreen] Failed to read cached curriculum:", e);
      }
      fetchCurriculum();
    }
  }, [activeTab, grammaticalFocus, exerciseType]);

  const getMandatoryGroups = () => {
    try {
      const raw = localStorage.getItem('fluent_mandatory_vocab_groups');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  };

  const fetchCurriculum = async () => {
    setLoading(true);
    setErrorMessage('');
    setApiQuotaError(null);
    setMcqResult(null);
    try {
      const mandatoryGroups = getMandatoryGroups();
      const learnedVocabList = getLearnedVocabWords(globalErrors);

      const response = await apiFetch('/api/course-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          grammaticalFocus, 
          exerciseType,
          vocabWords: exerciseType === 'VOCABULARY' ? getVocabularyWordsForTopic(grammaticalFocus, globalErrors, mandatoryGroups) : undefined,
          learnedMandatoryVocab: learnedVocabList
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.isQuotaExceeded) {
          setApiQuotaError({
            isQuota: true,
            message: errData.error,
            estimate: errData.timeEstimate
          });
          throw new Error(errData.error);
        }
        throw new Error(errData.error || 'Curriculum generator could not be resolved.');
      }

      const data = await response.json();
      if (!data || !data.theory || !Array.isArray(data.phase1) || data.phase1.length === 0) {
        throw new Error("O conteúdo da aula foi retornado incompleto ou em formato inesperado.");
      }
      try {
        sessionStorage.setItem(getCurriculumCacheKey(), JSON.stringify(data));
      } catch (cacheErr) {
        console.warn("[CourseScreen] Failed to save curriculum to cache:", cacheErr);
      }

      setCourseData(data);
      setCurrentSection('THEORY');
      setMcqIndex(0);
      setMcqAnswers([]);
      setMcqChecked(false);
      setShowExplanation(false);
      setHardAnswers(['', '', '', '', '', '']);
      setHardResults(null);
    } catch (err: any) {
      const errMsg = err.message || "Error generating course content.";
      const isQuotaText = errMsg.includes("429") || 
        errMsg.toLowerCase().includes("quota") || 
        errMsg.toLowerCase().includes("exhausted") || 
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("insuficiente");
        
      if (isQuotaText && !apiQuotaError) {
        setApiQuotaError({
          isQuota: true,
          message: errMsg,
          estimate: "em cerca de 1 a 5 minutos"
        });
      }
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Easy / Medium Navigation Handlers
  const handleSelectOption = (option: string) => {
    if (mcqChecked) return;
    setMcqAnswers((prev) => {
      const copy = [...prev];
      copy[mcqIndex] = option;
      return copy;
    });
  };

  const handleCheckAnswer = () => {
    setMcqChecked(true);
    setShowExplanation(true);
  };

  const handleNextMcq = () => {
    setMcqChecked(false);
    setShowExplanation(false);
    if (mcqIndex < 5) {
      setMcqIndex(mcqIndex + 1);
    } else {
      const answersForCheck = mcqAnswers;
      let score = 0;
      const currentMcqArray = currentSection === 'EASY' ? courseData?.phase1 || [] : courseData?.phase2 || [];
      currentMcqArray.forEach((q, i) => {
        if (answersForCheck[i] === q.correctAnswer || answersForCheck[i]?.charAt(0) === q.correctAnswer?.charAt(0)) {
          score++;
        }
      });

      const pass = score >= 5; // 80% passing condition
      setMcqResult({ score, pass, section: currentSection as 'EASY' | 'MEDIUM' });
    }
  };

  // Phase 3 grading routine
  const handleSubmitPhase3 = async () => {
    setGrading(true);
    try {
      const response = await apiFetch('/api/course-evaluate-phase3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: grammaticalFocus,
          prompts: courseData?.phase3,
          userAnswers: hardAnswers,
          exerciseType: exerciseType
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.isQuotaExceeded) {
          setApiQuotaError({
            isQuota: true,
            message: errData.error,
            estimate: errData.timeEstimate
          });
          throw new Error(errData.error);
        }
        throw new Error(errData.error || 'Grading server timed out.');
      }

      const evalData = await response.json();
      setHardResults(evalData);
      setCurrentSection('COMPLETED');

      // Forward results to global adaptive progress callback
      const identifiedErrors: IdentifiedError[] = evalData.identified_errors || [];
      onTrackErrors(identifiedErrors);

      // Evaluate overall success rate
      if (evalData.overallRulePassed) {
        onAdvanceProficiency('higher', true);
      } else {
        onAdvanceProficiency('lower', false);
      }

    } catch (err: any) {
      alert("Não foi possível processar a avaliação. Tente enviar novamente.");
    } finally {
      setGrading(false);
    }
  };

  // Find active node ID based on robust match
  const getActiveNodeId = () => {
    let matchedNode = DEFAULT_NODES.find(node =>
      node.label.toLowerCase().trim() === grammaticalFocus.toLowerCase().trim()
    );

    if (!matchedNode) {
      let longestMatchLen = 0;
      DEFAULT_NODES.forEach(node => {
        const labelLower = node.label.toLowerCase().trim();
        const focusLower = grammaticalFocus.toLowerCase().trim();
        if (labelLower.includes(focusLower) || focusLower.includes(labelLower)) {
          const matchLen = Math.max(labelLower.length, focusLower.length);
          if (matchLen > longestMatchLen) {
            longestMatchLen = matchLen;
            matchedNode = node;
          }
        }
        node.keywords.forEach((kw: string) => {
          const kwClean = kw.toLowerCase().trim();
          if (focusLower.includes(kwClean)) {
            if (kwClean.length > longestMatchLen) {
              longestMatchLen = kwClean.length;
              matchedNode = node;
            }
          }
        });
      });
    }
    return matchedNode ? (matchedNode as any).id : null;
  };

  // Mapping status helper for studied node
  const getNodeStatus = (node: any) => {
    const completedList = JSON.parse(localStorage.getItem('fluent_completed_nodes') || '[]');
    if (completedList.includes(node.id)) {
      return 'completed';
    }
    const activeId = getActiveNodeId();
    if (activeId === node.id) {
      return 'active';
    }
    const canUnlock = node.dependsOn.every((dep: string) => completedList.includes(dep));
    return canUnlock ? 'unlocked' : 'locked';
  };

  const currentMcqArray = currentSection === 'EASY' ? courseData?.phase1 || [] : currentSection === 'MEDIUM' ? courseData?.phase2 || [] : [];
  const currentQuestion = currentMcqArray[mcqIndex];

  // Loading indicator for generating curriculums
  if (loading) {
    return (
      <ActivePassiveLoader 
        title="Gerando Aula Adaptativa"
        subtitle="Construindo materiais teóricos exclusivos, eliminadores gramaticais e tarefas escritas de proficiência para o foco de hoje."
        extraBadge={grammaticalFocus}
        globalErrors={globalErrors}
      />
    );
  }

  // Quota limiting layout
  if (apiQuotaError) {
    return (
      <div className="max-w-md mx-auto py-12 px-6 bg-white border border-[#e8e2d5] rounded-3xl shadow-sm text-center my-10 font-serif">
        <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-amber-50 text-classic-gold mb-4 text-xl border border-[#dfcbb0]">
          💡
        </div>
        <h3 className="text-xl font-serif font-bold text-classic-ink">Cota de IA Limitada</h3>
        <p className="text-xs text-[#8e8574] leading-relaxed max-w-xs mx-auto mt-2">
          {apiQuotaError.message || "A API do sistema de Inteligência Artificial está sob alta demanda ou esgotou o limite diário temporariamente."}
        </p>
        <div className="mt-4 bg-classic-cream p-4 rounded-2xl border border-[#e2dacb] text-left text-xs">
          <span className="text-[#8e8574] block">Previsão</span>
          <strong className="text-classic-ink mt-0.5 block">{apiQuotaError.estimate || "cerca de 1 a 5 minutos"}</strong>
        </div>
        <button
          onClick={() => {
            setApiQuotaError(null);
            setErrorMessage('');
            fetchCurriculum();
          }}
          className="mt-6 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white font-semibold text-xs rounded-xl"
        >
          Reestabelecer Conexão
        </button>
      </div>
    );
  }

  // Fallback e recuperação para erros genéricos ou ausência de dados na aba de exercícios
  if (activeTab === "EXERCISING" && (!courseData || errorMessage)) {
    return (
      <div className="max-w-md mx-auto py-12 px-6 bg-white border border-[#e8e2d5] rounded-3xl shadow-sm text-center my-10 font-serif">
        <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-rose-50 text-rose-600 mb-4 text-xl border border-rose-200">
          ⚠️
        </div>
        <h3 className="text-xl font-serif font-bold text-classic-ink">Não foi possível carregar a aula</h3>
        <p className="text-xs text-[#8e8574] leading-relaxed max-w-xs mx-auto mt-2">
          {errorMessage || "Houve uma instabilidade ao montar o conteúdo adaptativo desta lição."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => {
              setErrorMessage("");
              fetchCurriculum();
            }}
            className="w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Tentar Novamente
          </button>
          <button
            onClick={() => {
              setErrorMessage("");
              setActiveTab("MENU");
            }}
            className="w-full py-2.5 bg-transparent border border-[#e2dacb] text-[#7d715e] hover:bg-[#FAF6EE] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Voltar ao Menu do Curso
          </button>
        </div>
      </div>
    );
  }

  // SECTION rendering
  return (
    <div className="max-w-2xl mx-auto py-4 px-3 md:px-0 min-h-[85vh] flex flex-col justify-between">
      
      {/* ============================================================= */}
      {/* CLASSIQUE COURSE MAIN MENU                                     */}
      {/* ============================================================= */}
      {activeTab === 'MENU' && (
        <div className="space-y-6">
          <div className="text-center py-6">
            <h1 className="text-2xl font-serif font-bold text-classic-ink tracking-tight mb-2">
              Curso Particular
            </h1>
            <p className="text-xs text-[#8e8574] max-w-sm mx-auto leading-relaxed">
              Estrutura clássica de ensino alinhada ao método de imersão e correção adaptativa.
            </p>
          </div>

          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-8 shadow-sm space-y-4">
            
            {/* 1. AULA SECTION */}
            <div className="border border-[#e2dacb] rounded-2xl overflow-hidden bg-classic-cream/40">
              <button
                id="course_aula_button"
                onClick={() => setShowAulaSubmenu(!showAulaSubmenu)}
                className="w-full text-left p-5 flex items-center justify-between hover:bg-classic-cream transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-xl">📚</span>
                  <div>
                    <h3 className="font-serif font-semibold text-classic-ink text-base">Aula Diária</h3>
                    <p className="text-[#8e8574] text-xs mt-0.5">Teoria em português e desafios de fala em inglês</p>
                  </div>
                </div>
                <span className="text-xs text-[#7d715e] font-serif">{showAulaSubmenu ? '▲ Ocultar' : '▼ Expandir'}</span>
              </button>

              <AnimatePresence>
                {showAulaSubmenu && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden border-t border-[#e2dacb] bg-white divide-y divide-slate-100"
                  >
                    <button
                      id="course_exercicios_subitem"
                      onClick={() => {
                        saveExerciseTypeToHistory(exerciseType);
                        setActiveTab('EXERCISING');
                        setShowAulaSubmenu(false);
                      }}
                      className="w-full text-left px-6 py-4 hover:bg-classic-cream transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs">✏️</span>
                        <div>
                          <strong className="block text-xs text-classic-ink font-serif font-bold">Exercícios Fixadores</strong>
                          <span className="text-[10px] text-[#8e8574]">
                            Phases 1, 2 e 3 de síntese escrita ({exerciseType === 'GRAMMAR' ? 'Foco: Gramática' : exerciseType === 'VOCABULARY' ? 'Foco: Vocabulário' : 'Foco: Blocos de Fala'})
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-classic-gold" />
                    </button>

                    <button
                      id="course_professora_subitem"
                      onClick={() => {
                        saveExerciseTypeToHistory(exerciseType);
                        setActiveTab('TEACHING');
                        setShowAulaSubmenu(false);
                      }}
                      className="w-full text-left px-6 py-4 hover:bg-classic-cream transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs">👩‍🏫</span>
                        <div>
                          <strong className="block text-xs text-classic-ink font-serif font-bold">Conversar com a Professora</strong>
                          <span className="text-[10px] text-[#8e8574]">
                            Prática de pronúncia via áudio ({exerciseType === 'GRAMMAR' ? 'Foco: Gramática' : exerciseType === 'VOCABULARY' ? 'Foco: Vocabulário' : 'Foco: Blocos de Fala'})
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-classic-gold" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2. PLANO DE ESTUDOS */}
            <button
              id="course_plan_button"
              onClick={() => setActiveTab('PLAN')}
              className="w-full text-left p-5 border border-[#e2dacb] rounded-2xl flex items-center justify-between hover:bg-classic-cream transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-xl">🧭</span>
                <div>
                  <h3 className="font-serif font-semibold text-classic-ink text-base">Plano de Estudos</h3>
                  <p className="text-[#8e8574] text-xs mt-0.5">Sua trilha cronológica e tópicos de progressão</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7d715e]" />
            </button>

            {/* 3. DIFICULDADES */}
            <button
              id="course_diff_button"
              onClick={() => setActiveTab('DIFF')}
              className="w-full text-left p-5 border border-[#e2dacb] rounded-2xl flex items-center justify-between hover:bg-classic-cream transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-xl">⚠️</span>
                <div>
                  <h3 className="font-serif font-semibold text-classic-ink text-base">Dificuldades</h3>
                  <p className="text-[#8e8574] text-xs mt-0.5">Histórico de erros sintáticos estruturais compilados</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7d715e]" />
            </button>

          </div>

          {onGoBackMenu && (
            <button
              onClick={onGoBackMenu}
              className="w-full py-3 border border-[#e2dacb] hover:bg-classic-cream rounded-2xl text-xs text-classic-gold font-serif text-center cursor-pointer transition-colors"
            >
              ← Voltar ao Menu Principal
            </button>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBVIEW: PLANO DE ESTUDOS                                      */}
      {/* ============================================================= */}
      {activeTab === 'PLAN' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-4 gap-2 flex-wrap sm:flex-nowrap">
            <div>
              <h2 className="text-xl font-serif font-semibold text-classic-ink">Plano de Ensino Particular</h2>
              <p className="text-[11px] text-[#8e8574]">Sua trilha estruturada organizada em semanas com foco pedagógico e adaptativo</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdaptationsModal(true)}
                className="px-2.5 py-1.5 rounded-lg border border-[#c4a87a]/40 bg-[#FAF6EE] hover:bg-[#f3ece0] text-xs font-serif font-medium text-[#7d715e] flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-classic-gold" />
                Últimas adaptações
              </button>
              <button
                onClick={() => setActiveTab('MENU')}
                className="px-2.5 py-1.5 rounded-lg border border-[#e2dacb] text-xs text-[#7d715e] hover:bg-[#FAF6EE] cursor-pointer"
              >
                ← Voltar
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {weeklyPlan && weeklyPlan.map((week) => {
              const isWeekCompleted = week.contents.every(c => c.completed);
              const isExpanded = expandedWeek === week.weekNumber;
              
              return (
                <div 
                  key={week.weekNumber} 
                  className="border border-[#e2dacb] rounded-2xl overflow-hidden bg-white shadow-xs transition-all duration-200"
                >
                  {/* Header */}
                  <button
                    onClick={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
                    className="w-full flex items-center justify-between p-5 text-left font-serif transition-colors hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <h4 className="font-bold text-[#2a241e] text-base">Semana {week.weekNumber}</h4>
                        <p className="text-[11px] text-[#8e8574] font-sans mt-0.5">
                          {week.contents.filter(c => c.completed).length} de {week.contents.length} concluídos
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isWeekCompleted && (
                        <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-sans font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Concluída
                        </span>
                      )}
                      <span className="text-stone-400 text-xs">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>

                  {/* Expandable contents block */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-[#f3eee5]"
                      >
                        <div className="p-4 space-y-2 bg-stone-50/50">
                          {week.contents.map((content) => {
                            return (
                              <div
                                key={content.id}
                                onClick={() => {
                                  if (!content.completed && onUpdateFocus) {
                                    onUpdateFocus(content.label);
                                    setActiveTab('MENU');
                                  }
                                }}
                                className={`p-4 border rounded-xl flex items-center justify-between transition-all ${
                                  content.completed
                                    ? 'border-emerald-100 bg-emerald-50/20 text-emerald-800'
                                    : 'border-[#e2dacb] bg-white hover:border-classic-gold hover:bg-classic-cream/10 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-base shrink-0">
                                    {content.completed ? '✅' : content.type === 'Grammar' ? '📘' : content.type === 'Vocabulary' ? '📙' : '💬'}
                                  </span>
                                  <div className="min-w-0">
                                    <span className={`block text-xs font-serif font-bold truncate leading-none ${
                                      content.completed ? 'line-through text-emerald-700 font-normal' : 'text-classic-ink'
                                    }`}>
                                      {content.label}
                                    </span>
                                    <span className="text-[9px] text-[#8e8574] font-sans mt-1.5 block">
                                      {content.type === 'Grammar' ? 'Gramática' : content.type === 'Vocabulary' ? 'Vocabulário' : 'Blocos de fala'}
                                    </span>
                                    {content.type === 'Vocabulary' && (
                                      <div className="mt-2 flex flex-wrap gap-1 max-w-md">
                                        {getVocabularyWordsForTopic(content.label, globalErrors, getMandatoryGroups()).map((word, idx) => (
                                          <span key={idx} className="text-[9px] bg-amber-50/70 border border-amber-200/50 text-amber-800 rounded px-1.5 py-0.5 font-mono">
                                            {word.en} ({word.pt})
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {!content.completed && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isDevMode && (
                                      <button
                                        type="button"
                                        title="Concluir aula instantaneamente (Modo Desenvolvedor)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (onCompleteLessonTopic) {
                                            onCompleteLessonTopic(content.label);
                                          } else {
                                            onAdvanceProficiency('0 days', true);
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-sans font-bold transition-colors cursor-pointer flex items-center justify-center shadow-2xs active:scale-95"
                                      >
                                        ✅
                                      </button>
                                    )}
                                    <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded border border-[#e2dacb] bg-[#FAF8F5] text-[#7d715e] font-semibold">
                                      Estudar
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBVIEW: DIFICULDADES                                          */}
      {/* ============================================================= */}
      {activeTab === 'DIFF' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-4">
            <div>
              <h2 className="text-xl font-serif font-semibold text-classic-ink">Mapeamento de Habilidades & Dificuldades</h2>
              <p className="text-[11px] text-[#8e8574]">Análise clínica e modulação adaptativa contínua do seu idioma</p>
            </div>
            <button
              onClick={() => setActiveTab('MENU')}
              className="px-2.5 py-1.5 rounded-lg border border-[#e2dacb] text-xs text-[#7d715e] hover:bg-[#FAF6EE] cursor-pointer bg-white transition-colors shadow-xs"
            >
              ← Voltar ao Menu
            </button>
          </div>

          <div className="bg-classic-cream border border-[#e2dacb] rounded-3xl p-5 md:p-6 shadow-xs relative overflow-hidden text-classic-ink">
            <DifficultiesScreen globalErrors={globalErrors || []} globalStrengths={globalStrengths || []} />
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBVIEW: EXERCISES FIXADORES (TRADITIONAL)                    */}
      {/* ============================================================= */}
      {activeTab === 'EXERCISING' && courseData && (
        <div className="space-y-6">
          
          <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-4">
            <div>
              <h1 className="text-xl font-serif font-semibold text-classic-ink">Exercícios Fixadores</h1>
              <p className="text-[11px] text-[#8e8574]">Teoria e respostas sintáticas • <span className="text-classic-gold font-bold">{grammaticalFocus}</span></p>
            </div>
            <button
              onClick={() => setActiveTab('MENU')}
              className="px-2.5 py-1.5 rounded-lg border border-[#e2dacb] text-xs text-[#7d715e] hover:bg-[#FAF6EE] cursor-pointer"
            >
              ← Sair da Aula
            </button>
          </div>

          {!courseData ? (
            <div className="py-12 text-center italic text-[#8e8574]">Syllabus indisponível.</div>
          ) : (
            <div className="bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-6 shadow-sm space-y-6">
              
              {/* RENDER PHASE: THEORY EXPOSITION/CLASS */}
              {currentSection === 'THEORY' && (
                <div className="space-y-4">
                  <span className="text-[10px] font-mono uppercase bg-classic-cream px-2 py-0.5 rounded border border-[#e2dacb] text-classic-gold font-bold">
                    Estudo de Apoio em Português
                  </span>
                  
                  <div className="p-5 bg-classic-cream text-classic-ink rounded-3xl border border-[#e2dacb] leading-relaxed font-serif text-sm">
                    {courseData.theory}
                  </div>

                  <button
                    onClick={() => {
                      setCurrentSection('EASY');
                      setMcqIndex(0);
                    }}
                    className="w-full py-3 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    <span>Seguir para Exercícios Práticos</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* RENDER PHASE: EASY / MEDIUM MCQ PROGRESS */}
              {(currentSection === 'EASY' || currentSection === 'MEDIUM') && (
                <div className="space-y-4">
                  {mcqResult ? (
                    <div className="text-center py-6 bg-classic-cream border border-[#e2dacb] rounded-2xl p-6 space-y-3">
                      <span className="text-xl">{mcqResult.pass ? '✅' : '✏️'}</span>
                      <h4 className="text-lg font-serif font-bold text-classic-ink">
                        {mcqResult.pass ? 'Parabéns!' : 'Fase Não Concluída'}
                      </h4>
                      <p className="text-xs text-[#8e8574]">
                        Acertos: {mcqResult.score} de 6 questões.
                      </p>

                      <div className="pt-4 flex gap-3 justify-center">
                        {mcqResult.pass ? (
                          <button
                            onClick={() => {
                              if (mcqResult.section === 'EASY') {
                                setCurrentSection('MEDIUM');
                              } else {
                                setCurrentSection('HARD');
                              }
                              setMcqIndex(0);
                              setMcqAnswers([]);
                              setMcqResult(null);
                            }}
                            className="px-5 py-2.5 rounded-xl bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold"
                          >
                            Avançar para Próxima Fase
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setMcqIndex(0);
                              setMcqAnswers([]);
                              setMcqResult(null);
                            }}
                            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                          >
                            Refazer Apenas esta Fase
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    currentQuestion && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-classic-gold">
                            {currentSection === 'EASY' ? 'Fase 1: Eliminação Direta' : 'Fase 2: Alternativas Plausíveis'}
                          </span>
                          <span className="font-mono text-[10px] text-[#8e8574]">
                            QUESTÃO {mcqIndex + 1} DE 6
                          </span>
                        </div>

                        <h3 className="text-base font-serif font-bold text-classic-ink leading-relaxed">
                          {currentQuestion.question}
                        </h3>

                        {/* Options */}
                        <div className="grid grid-cols-1 gap-3 pt-2">
                          {currentQuestion.options?.map((option, idx) => {
                            const isSelected = mcqAnswers[mcqIndex] === option;
                            const isCorrectOpt = option === currentQuestion.correctAnswer || option.startsWith(currentQuestion.correctAnswer);

                            let wrapperClass = "border-[#e2dacb] bg-[#FAF6EE]/30 hover:bg-[#FAF6EE] text-[#7d715e]";
                            if (isSelected) {
                              wrapperClass = "border-classic-gold bg-classic-cream font-bold text-classic-ink";
                            }
                            if (mcqChecked) {
                              if (isCorrectOpt) {
                                wrapperClass = "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold";
                              } else if (isSelected) {
                                wrapperClass = "border-rose-500 bg-rose-50 text-rose-950 line-through";
                              } else {
                                wrapperClass = "border-slate-100 opacity-40 text-slate-450";
                              }
                            }

                            return (
                              <button
                                key={idx}
                                onClick={() => handleSelectOption(option)}
                                disabled={mcqChecked}
                                className={`p-4 border rounded-xl text-left text-xs transition-all cursor-pointer flex items-center justify-between ${wrapperClass}`}
                              >
                                <span>{option}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-4 border-t border-[#f0ebe0] flex items-center justify-between pt-4 min-h-[50px]">
                          <div>
                            {mcqChecked && (
                              <span className={`text-xs font-serif ${mcqAnswers[mcqIndex] === currentQuestion.correctAnswer ? 'text-emerald-700 font-bold' : 'text-rose-700'}`}>
                                {mcqAnswers[mcqIndex] === currentQuestion.correctAnswer ? '✓ Correto!' : '✗ Errado. Veja explicação abaixo'}
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {!mcqChecked ? (
                              <button
                                onClick={handleCheckAnswer}
                                disabled={!mcqAnswers[mcqIndex]}
                                className="px-4 py-2 bg-classic-gold hover:bg-classic-gold-hover text-white text-xs font-semibold rounded-xl disabled:opacity-40"
                              >
                                Verificar Resposta
                              </button>
                            ) : (
                              <button
                                onClick={handleNextMcq}
                                className="px-4 py-2 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl"
                              >
                                {mcqIndex < 5 ? "Próxima Questão" : "Concluir Fase"}
                              </button>
                            )}
                          </div>
                        </div>

                        {showExplanation && (
                          <div className="p-4 bg-classic-cream border border-[#e2dacb] rounded-xl text-xs text-[#7d715e] font-serif leading-relaxed mt-4">
                            <strong>Feedback Didático:</strong> {currentQuestion.explanation}
                          </div>
                        )}

                        {/* In-Exercise Doubts Assistant with the Teacher */}
                        <ExerciseDoubtChat
                          exerciseKey={`${grammaticalFocus}_${currentSection}_q${mcqIndex}_${currentQuestion.id || mcqIndex}`}
                          exerciseContext={{
                            question: currentQuestion.question,
                            options: currentQuestion.options,
                            correctAnswer: currentQuestion.correctAnswer,
                            explanation: currentQuestion.explanation,
                            grammaticalFocus,
                            exerciseType,
                            phase: currentSection === 'EASY' ? 'Fase 1: Eliminação Direta' : 'Fase 2: Alternativas Plausíveis',
                            questionNumber: mcqIndex + 1,
                            totalQuestions: 6,
                            userAnswer: mcqAnswers[mcqIndex] || '',
                            isAnswerChecked: mcqChecked,
                            vocabWords: exerciseType === 'VOCABULARY' ? getVocabularyWordsForTopic(grammaticalFocus, globalErrors, getMandatoryGroups()) : undefined
                          }}
                          username={username}
                          baselineProficiency={baselineProficiency}
                        />
                      </div>
                    )
                  )}
                </div>
              )}

              {/* RENDER PHASE: HARD WRITE */}
              {currentSection === 'HARD' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-rose-800">
                      Fase 3: Tradução Ativa
                    </span>
                    <span className="font-mono text-[10px] text-[#8e8574]">6 Exercícios Combinados</span>
                  </div>

                  <p className="text-xs text-[#7d715e] leading-relaxed font-serif">
                    Formule as traduções ou orações em inglês. Nosso examinador calibrará sua grafia de acordo com as regras de: <strong className="text-classic-gold">{grammaticalFocus}</strong>.
                  </p>

                  <div className="space-y-4 pt-2">
                    {courseData.phase3.map((q, idx) => (
                      <div key={q.id} className="p-4 border border-[#e2dacb] bg-classic-cream rounded-xl space-y-2">
                        <span className="text-[9px] font-mono text-classic-gold block font-bold uppercase">Exercício #{idx + 1}</span>
                        <p className="text-xs text-classic-ink font-serif font-bold">{q.question}</p>
                        
                        <input
                          type="text"
                          required
                          className="w-full bg-white border border-[#e2dacb] rounded-xl px-3 py-2 text-xs text-classic-ink focus:outline-none focus:border-classic-gold"
                          placeholder="Digite aqui sua resposta em inglês..."
                          value={hardAnswers[idx]}
                          onChange={(e) => {
                            const value = e.target.value;
                            setHardAnswers((prev) => {
                              const copy = [...prev];
                              copy[idx] = value;
                              return copy;
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmitPhase3}
                    disabled={grading || hardAnswers.some(ans => !ans.trim())}
                    className="w-full py-3 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl disabled:opacity-40"
                  >
                    {grading ? 'Examinando Respostas Sintáticas...' : 'Enviar Exercício para Correção'}
                  </button>

                  {/* In-Exercise Doubts Assistant for Phase 3 */}
                  <ExerciseDoubtChat
                    exerciseKey={`${grammaticalFocus}_HARD_PHASE3`}
                    exerciseContext={{
                      question: courseData.phase3.map((q, i) => `#${i + 1}: ${q.question}`).join(' | '),
                      options: [],
                      correctAnswer: courseData.phase3.map((q, i) => `#${i + 1}: ${q.correctAnswer}`).join(' | '),
                      explanation: `Tradução e produção ativa de frases com foco em ${grammaticalFocus}`,
                      grammaticalFocus,
                      exerciseType,
                      phase: 'Fase 3: Tradução Ativa',
                      questionNumber: 1,
                      totalQuestions: 6,
                      userAnswer: hardAnswers.map((a, i) => `#${i + 1}: ${a || '(vazio)'}`).join(' | '),
                      isAnswerChecked: false,
                      vocabWords: exerciseType === 'VOCABULARY' ? getVocabularyWordsForTopic(grammaticalFocus, globalErrors, getMandatoryGroups()) : undefined
                    }}
                    username={username}
                    baselineProficiency={baselineProficiency}
                  />
                </div>
              )}

              {/* RENDER PHASE: COMPLETED RESULT */}
              {currentSection === 'COMPLETED' && hardResults && (
                <div className="w-full">
                  {/* CASE 1: PASSED (>= 80% Success Rate) */}
                  {!!(hardResults.pass || hardResults.overallRulePassed) ? (
                    <div className="text-center space-y-6 font-serif py-4">
                      <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-500/20 text-[#2b5c43] flex items-center justify-center mx-auto shadow-sm">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-classic-gold bg-classic-cream px-3 py-1 rounded-full border border-[#dfcbb0]">
                          Aula Concluída com Sucesso
                        </span>
                        <h2 className="text-3xl font-serif font-black tracking-tight text-classic-ink pt-1">
                          Progresso Consolidado!
                        </h2>
                        <p className="text-[#7d715e] text-xs font-medium max-w-md mx-auto leading-relaxed">
                          O próximo passo no estudo adaptativo já foi incorporado ao seu plano de estudos.
                        </p>
                      </div>

                      <div className="bg-classic-cream border border-[#e2dacb] rounded-2xl p-5 text-left text-xs leading-relaxed text-classic-ink space-y-4 max-h-[300px] overflow-y-auto w-full">
                        <p className="text-classic-ink leading-relaxed font-serif">{hardResults.overall_explanation}</p>
                        
                        {hardResults.results && (
                          <div className="space-y-3 pt-3 border-t border-[#e2dacb]">
                            <span className="text-[9px] font-mono uppercase tracking-wider font-bold block text-classic-gold">Feedback Individual das Sentenças:</span>
                            {hardResults.results.map((res: any, idx: number) => {
                              const hasMiniError = res.identified_error && res.identified_error.user_phrase && res.identified_error.user_phrase.trim();
                              return (
                                <div key={idx} className="space-y-1.5 border-b border-[#ebdcb3]/20 pb-2 last:border-0 last:pb-0">
                                  <div className="flex items-start gap-1.5 text-[11px] leading-tight text-emerald-800">
                                    <span className="font-bold">✓</span>
                                    <span>
                                      <strong>Exercício #{idx + 1}:</strong> {courseData.phase3[idx]?.question}
                                    </span>
                                  </div>
                                  <div className="pl-4 text-[10px] text-[#7d715e] italic">
                                    Sua resposta: "{hardAnswers[idx]}"
                                  </div>
                                  {hasMiniError && (
                                    <div className="ml-4 text-[10px] text-amber-800 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/50 mt-1">
                                      <span className="font-bold">Ajuste ortográfico/vocabulário:</span> "<em>{res.identified_error.user_phrase}</em>" &rarr; "<strong>{res.identified_error.correction}</strong>". <p className="mt-0.5 text-slate-600">{res.identified_error.explanation}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                        <button
                          onClick={() => {
                            setActiveTab('MENU');
                            setCurrentSection('THEORY');
                          }}
                          className="bg-classic-green hover:bg-classic-green-light py-3 px-4 rounded-xl text-white font-serif font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-colors text-center"
                        >
                          Continuar Estudando
                        </button>
                        
                        <button
                          onClick={() => {
                            setActiveTab('MENU');
                            setCurrentSection('THEORY');
                          }}
                          className="bg-white border border-[#e2dacb] hover:bg-classic-cream py-3 px-4 rounded-xl text-classic-ink font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
                        >
                          Voltar ao Course
                        </button>

                        <button
                          onClick={() => {
                            if (onGoBackMenu) onGoBackMenu();
                          }}
                          className="bg-classic-cream border border-[#dfcbb0] hover:bg-[#F0EBE0] py-3 px-4 rounded-xl text-[#7d715e] font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
                        >
                          Menu Principal
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* CASE 2: FAILED (< 80% Success Rate) */
                    <div className="text-center space-y-6 font-serif py-4">
                      <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-500/20 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                        <XCircle className="w-8 h-8" />
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                          Aproveitamento Insuficiente (Abaixo de 80%)
                        </span>
                        <h2 className="text-2xl font-serif font-black tracking-tight text-classic-ink pt-1">
                          Fase Não Concluída
                        </h2>
                        <p className="text-[#7d715e] text-xs leading-relaxed max-w-md mx-auto font-sans">
                          Para ser aprovado, você precisa de pelo menos 80% das sentenças aceitáveis (mínimo de 5 frases corretas). Os erros abaixo impediram a sua aprovação nesta rodada:
                        </p>
                      </div>

                      <div className="bg-rose-50/20 border border-rose-100 rounded-2xl p-5 text-left text-xs leading-relaxed text-classic-ink space-y-4 max-h-[300px] overflow-y-auto">
                        {hardResults.results && (
                          <div className="space-y-3">
                            {hardResults.results.map((res: any, idx: number) => {
                              const isCorrect = res.correct !== false;
                              if (isCorrect) return null; // Show only blocker errors directly related to the lesson topic
                              
                              return (
                                <div key={idx} className="p-3.5 bg-white border border-rose-100 rounded-xl space-y-2.5 shadow-xs">
                                  <div className="flex items-start gap-1.5 text-rose-800 font-bold leading-tight">
                                    <span>✗</span>
                                    <span className="text-[11px]">
                                      <strong>Exercício #{idx + 1}:</strong> {courseData.phase3[idx]?.question}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 italic pl-3.5">
                                    Sua resposta: "{hardAnswers[idx]}"
                                  </div>
                                  <div className="text-[11px] text-[#7d715e] border-t border-rose-50/50 pt-2 pl-3.5 space-y-1 font-sans">
                                    <div>
                                      <span className="text-emerald-700 font-bold">Correção recomendada:</span> "{res.identified_error?.correction || res.correction || 'Seja mais assertivo com o foco!'}"
                                    </div>
                                    <div className="text-[10px] mt-1 text-slate-600 font-serif leading-normal bg-slate-50 p-2.5 rounded border border-slate-150">
                                      {res.identified_error?.explanation || res.feedback || "Desvio sintático crítico em relação ao tema em estudo."}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          onClick={() => {
                            // Let user retry Phase 3 so they can adjust and submit again
                            setCurrentSection('HARD');
                          }}
                          className="flex-1 bg-classic-green hover:bg-classic-green-light py-3 px-4 rounded-xl text-white font-serif font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-colors text-center"
                        >
                          Tentar Novamente (Ajustar Frases)
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('MENU');
                            setCurrentSection('THEORY');
                          }}
                          className="bg-white border border-[#e2dacb] hover:bg-classic-cream py-3 px-6 rounded-xl text-classic-ink font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
                        >
                          Voltar ao Menu
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBVIEW: TUTORA PARTICULAR (TEACHER)                          */}
      {/* ============================================================= */}
      {activeTab === 'TEACHING' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-4">
            <div>
              <h1 className="text-xl font-serif font-semibold text-emerald-900 leading-none">Professora Particular</h1>
              <p className="text-[11px] text-[#8e8574] mt-1">Sala de voz com Madson sobre: <span className="font-bold text-classic-gold">{grammaticalFocus}</span></p>
            </div>
            <button
              onClick={() => setActiveTab('MENU')}
              className="px-2.5 py-1.5 rounded-lg border border-[#e2dacb] text-xs text-[#7d715e] hover:bg-[#FAF6EE] cursor-pointer"
            >
              ← Voltar
            </button>
          </div>

          <div className="bg-white border border-[#e8e2d5] rounded-3xl p-3 md:p-6 shadow-sm">
            <TeacherVoiceScreen
              grammaticalFocus={grammaticalFocus}
              baselineProficiency={baselineProficiency}
              username={username}
              strengthsSummary={strengthsSummary}
              globalErrors={globalErrors}
              onAdvanceProficiency={onAdvanceProficiency}
              onTrackErrors={onTrackErrors}
              onCompleteLesson={(summary) => {
                safeLocalStorageSet('fluent_recommendation_last_action', 'course');
                setActiveTab('MENU');
              }}
              onBackToTraditional={() => setActiveTab('MENU')}
              exerciseType={exerciseType}
              vocabWords={exerciseType === 'VOCABULARY' ? getVocabularyWordsForTopic(grammaticalFocus, globalErrors, getMandatoryGroups()) : undefined}
            />
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* POP-UP MODAL: ÚLTIMAS ADAPTAÇÕES                               */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showAdaptationsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FCFAFA] border border-[#e2dacb] rounded-2xl max-w-lg w-full p-6 shadow-xl relative overflow-hidden space-y-5 text-classic-ink"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-classic-gold" />
                  <h3 className="font-serif font-bold text-base text-classic-ink">
                    Últimas adaptações
                  </h3>
                </div>
                <button
                  onClick={() => setShowAdaptationsModal(false)}
                  className="p-1 text-[#8e8574] hover:text-classic-ink rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                
                {/* 1. ÚLTIMA ADAPTAÇÃO */}
                <div className="bg-[#FAF6EE] border border-[#e2dacb] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-serif font-bold uppercase tracking-wider text-[#7d715e] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-classic-gold" />
                    Última adaptação
                  </h4>

                  {lastAdaptation && hasValidDateOrOrigin ? (
                    <div className="text-xs text-[#2a241e] space-y-1.5 pt-1">
                      {lastAdaptationDateText && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#8e8574]">Data e hora:</span>
                          <span className="font-medium">{lastAdaptationDateText}</span>
                        </div>
                      )}
                      {lastAdaptationOriginText && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#8e8574]">Origem da adaptação:</span>
                          <span className="font-semibold capitalize px-2 py-0.5 rounded text-[11px] bg-[#e2dacb]/40 text-[#5c5243]">
                            {lastAdaptationOriginText}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8e8574] py-1">
                      Ainda não há registros de adaptações realizadas.
                    </p>
                  )}
                </div>

                {/* 2. ALTERAÇÕES REALIZADAS */}
                <div className="bg-[#FAF6EE] border border-[#e2dacb] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-serif font-bold uppercase tracking-wider text-[#7d715e] flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-classic-gold" />
                    Alterações e Diagnóstico
                  </h4>

                  {lastAdaptation?.diagnosis && (
                    <div className="text-xs text-[#2a241e] bg-white/80 p-2.5 rounded-lg border border-[#e2dacb]/60 leading-relaxed font-sans mb-2">
                      <span className="font-semibold text-[#5c5243] block mb-1">Diagnóstico Pedagógico:</span>
                      {lastAdaptation.diagnosis}
                    </div>
                  )}

                  {hasRecordedChanges ? (
                    <div className="text-xs text-[#2a241e] space-y-2 pt-1">
                      {lastAdaptationChanges.map((changeItem, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-[#3a3228] bg-white/70 p-2.5 rounded-lg border border-[#e2dacb]/50">
                          <span className="text-classic-gold font-bold mt-0.5">•</span>
                          <span>{changeItem}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8e8574] py-1 leading-relaxed">
                      O sistema não possui um histórico detalhado das alterações realizadas na última adaptação.
                    </p>
                  )}

                  {lastAdaptation?.justifications && lastAdaptation.justifications.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[#e2dacb]/60 mt-2">
                      <span className="text-[11px] font-semibold text-[#7d715e] block">Justificativas Pedagógicas:</span>
                      {lastAdaptation.justifications.map((j, idx) => (
                        <div key={idx} className="text-[11px] text-[#4a4033] bg-white/60 p-2 rounded border border-[#e2dacb]/40">
                          <span className="font-medium text-[#2a241e]">{j.topic}:</span> {j.justification}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. PRÓXIMA ADAPTAÇÃO PREVISTA */}
                <div className="bg-[#FAF6EE] border border-[#e2dacb] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-serif font-bold uppercase tracking-wider text-[#7d715e] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-classic-gold" />
                    Próxima adaptação prevista
                  </h4>

                  {nextScheduledDateText ? (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[#8e8574]">Data prevista:</span>
                      <span className="font-semibold text-[#2a241e]">{nextScheduledDateText}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8e8574] py-1">
                      Não foi possível determinar a próxima data de adaptação.
                    </p>
                  )}
                </div>

              </div>

              {/* Footer / Botão "Adaptar agora" */}
              <div className="pt-2 border-t border-[#e8e2d5]">
                <button
                  onClick={handleAdaptNowClick}
                  disabled={isAdapting}
                  className="w-full py-3 px-4 bg-classic-gold hover:bg-[#b89047] text-white font-serif font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {isAdapting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adaptando plano de estudos...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Adaptar agora
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
