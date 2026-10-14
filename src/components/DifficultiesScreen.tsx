import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  ShieldAlert, AlertTriangle, CheckCircle, RefreshCw, 
  BookOpen, Flame, HelpCircle, ArrowRight, MessageSquare,
  TrendingUp, Calendar, Award, X, Sparkles, AlertCircle
} from 'lucide-react';
import { IdentifiedError, DEFAULT_NODES } from '../types';
import { calculateProgression } from '../utils/progress';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet, deduplicateAndLimitSnapshots, MAX_SNAPSHOTS_ITEMS } from '../utils/safeStorage';


interface GroupedDifficulty {
  nodeId: string;
  title: string;
  description: string;
  gravity: 'Baixa' | 'Média' | 'Alta' | 'Excelente';
  maxSeverityScore: number;
  repetitionCount: number;
  associatedErrors: IdentifiedError[];
}

interface DifficultiesScreenProps {
  globalErrors: IdentifiedError[];
  globalStrengths?: { topicId: string; count: number; lastPhrase: string }[];
}

export default function DifficultiesScreen({ 
  globalErrors, 
  globalStrengths = [] 
}: DifficultiesScreenProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<GroupedDifficulty | null>(null);
  
  // Progress Modal local states
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [currentPeriod, setCurrentPeriod] = useState<'month' | '6months' | 'beginning'>('month');
  const [reportText, setReportText] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [activePoint, setActivePoint] = useState<any | null>(null);

  // Initialize and check periodic snapshots based on 7-day intervals
  useEffect(() => {
    // Read previous records from storage
    const savedSnapshotsStr = localStorage.getItem('fluent_snapshots');
    let snaps = [];
    if (savedSnapshotsStr) {
      try {
        snaps = JSON.parse(savedSnapshotsStr);
      } catch (e) {
        snaps = [];
      }
    }

    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    // Pre-populate if empty, so the user enjoys a functional timeline showing evolution
    if (snaps.length === 0) {
      const baseline = localStorage.getItem('fluent_proficiency') || 'Intermediate';
      const baselineLabel = baseline === 'Advanced' ? 'Avançado' : baseline === 'Intermediate' ? 'Intermediário' : 'Iniciante';
      
      let completedNodesCount = 0;
      try {
        const completedNodesStr = localStorage.getItem('fluent_completed_nodes');
        if (completedNodesStr) {
          completedNodesCount = JSON.parse(completedNodesStr).length;
        } else {
          if (baseline === 'Advanced') completedNodesCount = 5;
          else if (baseline === 'Intermediate') completedNodesCount = 2;
        }
      } catch (e) {
        completedNodesCount = 0;
      }

      snaps = [
        {
          date: todayString,
          timestamp: today.getTime(),
          errorsCount: globalErrors.length,
          strengthsCount: globalStrengths.length,
          completedNodesCount: completedNodesCount,
          textSummary: `Ponto de partida estabelecido de forma honesta. Diagnóstico inicial de entrada avaliado de forma isenta como nível ${baselineLabel}.`
        }
      ];
      snaps = deduplicateAndLimitSnapshots(snaps, MAX_SNAPSHOTS_ITEMS);
      safeLocalStorageSet('fluent_snapshots', JSON.stringify(snaps));
    }

    // Interval-based check: check if 7 days or more have passed since the last snapshot
    snaps.sort((a: any, b: any) => a.timestamp - b.timestamp);
    const lastSnapshot = snaps[snaps.length - 1];
    if (lastSnapshot) {
      const d1 = new Date(lastSnapshot.date + "T00:00:00");
      const d2 = new Date(todayString + "T00:00:00");
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 7) {
        const grammarErrorsCount = globalErrors.filter(e => !e.error_type || e.error_type.toLowerCase().includes('gram')).length;
        const vocabErrorsCount = globalErrors.filter(e => e.error_type?.toLowerCase().includes('vocab')).length;
        
        let dynamicSummary = "Habilidades em consolidação contínua.";
        if (globalErrors.length > 0) {
          dynamicSummary = `Perfil de desvios atual: ${globalErrors.length} lacunas ativas (${grammarErrorsCount} gramaticais, ${vocabErrorsCount} de termos).`;
        } else if (globalStrengths.length > 0) {
          dynamicSummary = `Fluidez consolidada com ${globalStrengths.length} áreas dominadas com pleno sucesso.`;
        }

        let completedNodesCount = 0;
        try {
          const completedNodesStr = localStorage.getItem('fluent_completed_nodes');
          if (completedNodesStr) {
            completedNodesCount = JSON.parse(completedNodesStr).length;
          } else {
            completedNodesCount = Math.max(2, globalStrengths.length);
          }
        } catch (e) {
          completedNodesCount = Math.max(2, globalStrengths.length);
        }

        const newSnapshot = {
          date: todayString,
          timestamp: today.getTime(),
          errorsCount: globalErrors.length,
          strengthsCount: globalStrengths.length,
          completedNodesCount: completedNodesCount,
          textSummary: dynamicSummary
        };

        snaps.push(newSnapshot);
        snaps.sort((a: any, b: any) => a.timestamp - b.timestamp);
        snaps = deduplicateAndLimitSnapshots(snaps, MAX_SNAPSHOTS_ITEMS);
        safeLocalStorageSet('fluent_snapshots', JSON.stringify(snaps));
      }
    }
  }, [globalErrors, globalStrengths]);

  // Fetch AI evaluation report from server
  const fetchProgressReport = async (period: 'month' | '6months' | 'beginning') => {
    setLoadingReport(true);
    setReportText('');
    try {
      const savedSnapshotsStr = localStorage.getItem('fluent_snapshots');
      let snaps = [];
      if (savedSnapshotsStr) {
        snaps = JSON.parse(savedSnapshotsStr);
      }

      const response = await apiFetch('/api/generate-progress-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          period,
          globalErrors,
          globalStrengths,
          snapshots: snaps
        }),
      });

      if (!response.ok) {
        throw new Error('Server error generating report');
      }

      const data = await response.json();
      setReportText(data.report || 'Nenhum relatório pôde ser formulado.');
    } catch (err) {
      console.error(err);
      setReportText(
        'Iniciamos sua jornada linguística recentemente, por isso os padrões históricos estão se consolidando. Continue praticando com o Story RPG e as lições do Curso Particular para gerar um diagnóstico completo!'
      );
    } finally {
      setLoadingReport(false);
    }
  };

  // Auto trigger loading when popup opens or current tab changes
  useEffect(() => {
    if (showProgressModal) {
      fetchProgressReport(currentPeriod);
    }
  }, [showProgressModal, currentPeriod]);

  // Reset active point on period switch
  useEffect(() => {
    setActivePoint(null);
  }, [currentPeriod]);

  // Translate dates to Portuguese layout
  const formatDatePT = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${day} de ${months[monthIdx]} de ${year}`;
  };

  // Compile snapshots and calculate proximity percentages locally (0 token cost)
  const parsedSnapshots = React.useMemo(() => {
    const savedSnapshotsStr = localStorage.getItem('fluent_snapshots');
    let snaps = [];
    if (savedSnapshotsStr) {
      try {
        snaps = JSON.parse(savedSnapshotsStr);
      } catch (e) {
        snaps = [];
      }
    }

    const today = new Date();
    let filteredSnaps = [...snaps];

    if (currentPeriod === 'month') {
      const thirtyDaysAgo = today.getTime() - (30 * 24 * 60 * 60 * 1000);
      filteredSnaps = snaps.filter((s: any) => new Date(s.date).getTime() >= thirtyDaysAgo);
    } else if (currentPeriod === '6months') {
      const sixMonthsAgo = today.getTime() - (180 * 24 * 60 * 60 * 1000);
      filteredSnaps = snaps.filter((s: any) => new Date(s.date).getTime() >= sixMonthsAgo);
    }

    const baselineProficiency = localStorage.getItem('fluent_proficiency') || 'Intermediate';
    const estimatedMonths = parseFloat(localStorage.getItem('fluent_est_months') || '10.0');

    // Map each snapshot deterministically
    const mapped = filteredSnaps.map((s: any) => {
      const errors = s.errorsCount || 0;
      const strengths = s.strengthsCount || 0;
      const completed = s.completedNodesCount || 0;

      // Consistent mathematical formula matching performance state and uncertainty
      const progression = calculateProgression(
        baselineProficiency,
        completed,
        strengths,
        errors,
        estimatedMonths
      );

      return {
        date: s.date,
        timestamp: new Date(s.date).getTime(),
        errorsCount: errors,
        strengthsCount: strengths,
        completedNodesCount: completed,
        textSummary: s.textSummary || '',
        percentage: progression.estimatedPercentage,
        marginOfError: progression.marginOfError,
        confidenceRating: progression.confidenceRating,
        details: progression.details
      };
    });

    return mapped.sort((a, b) => a.timestamp - b.timestamp);
  }, [currentPeriod, globalErrors, globalStrengths, showProgressModal]);

  // Group errors on the fly under the 7 dimensions of linguistic difficulty (Unchanged Algorithms)
  const difficulties = React.useMemo(() => {
    const groupedMap: Record<string, GroupedDifficulty> = {};

    const ALL_DIMENSIONS = [
      {
        id: 'grammar',
        title: 'Gramática & Estrutura',
        description: 'Domínio correto de tempos verbais, preposições, artigos, voz passiva, condicionais, modais, concordância nominal/verbal e ordem de palavras.'
      },
      {
        id: 'vocabulary',
        title: 'Vocabulário Temático & Lacunas',
        description: 'Capacidade de usar o vocabulário adequado de cenários reais (saúde, economia, negócios) e evitar repetições (como dependência de "thing", "good", "bad").'
      },
      {
        id: 'expression',
        title: 'Capacidade de Expressar Ideias',
        description: 'Habilidade funcional para justificar escolhas, explicar pontos de vista, comparar ideias, discordar amigavelmente ou levantar hipóteses.'
      },
      {
        id: 'chunks',
        title: 'Blocos de Comunicação (Chunks)',
        description: 'Uso fluído de padrões de fixação cotidiana do idioma que dão ritmo e naturalidade, tais como "In my opinion...", "It depends on...".'
      },
      {
        id: 'complexity',
        title: 'Complexidade de Frases',
        description: 'Abandono de frases curtíssimas e isoladas em prol de períodos compostos elegantes usando conectivos inteligentes.'
      },
      {
        id: 'flexibility',
        title: 'Flexibilidade Comunicativa',
        description: 'Capacidade de circunlóquio (parafrasear termos esquecidos com facilidade) e manter o diálogo ativo diante de termos desconhecidos.'
      },
      {
        id: 'real_life_domains',
        title: 'Domínios Práticos de Vida Real',
        description: 'Exposição ativa a simulações de compra, aeroporto, hotel, reuniões, diálogos profissionais e situações de emergência sem travamentos.'
      }
    ];

    // Initialize all 7 dimensions
    ALL_DIMENSIONS.forEach(dim => {
      groupedMap[dim.id] = {
        nodeId: dim.id,
        title: dim.title,
        description: dim.description,
        gravity: 'Baixa',
        maxSeverityScore: 0,
        repetitionCount: 0,
        associatedErrors: []
      };
    });

    globalErrors.forEach(err => {
      const phrase = (err.user_phrase || '').toLowerCase();
      const type = (err.error_type || '').toLowerCase();
      const expl = (err.explanation || '').toLowerCase();

      let dimensionKey = 'grammar';

      if (type.includes('vocabulary gap') || type.includes('vocab gap') || type === 'vocabulary' || type.includes('vocabulário') || type.includes('lexical') || type.includes('lacuna de vocabulário') || type.includes('vocabulario')) {
        dimensionKey = 'vocabulary';
      } else if (type.includes('expression gap') || type.includes('expression') || type.includes('express') || type.includes('argumentative') || type.includes('rhetoric') || expl.includes('justificar') || expl.includes('explicar') || expl.includes('comparar') || expl.includes('argumentar') || expl.includes('expressar')) {
        dimensionKey = 'expression';
      } else if (type.includes('communication chunk') || type.includes('chunk') || type.includes('bloco') || type.includes('frequent chunks') || phrase.includes('i think that') || phrase.includes('in my opinion') || phrase.includes('depends on') || phrase.includes('reason is')) {
        dimensionKey = 'chunks';
      } else if (type.includes('complexity limit') || type.includes('complexity') || type.includes('complexidade') || type.includes('sentence complexity') || expl.includes('frase curta') || expl.includes('frases curtas')) {
        dimensionKey = 'complexity';
      } else if (type.includes('flexibility limit') || type.includes('flexibility') || type.includes('flexibilidade') || type.includes('circumlocution') || type.includes('locking') || expl.includes('travou') || expl.includes('parafrasear')) {
        dimensionKey = 'flexibility';
      } else if (type.includes('real-life domain') || type.includes('real life') || type.includes('domain') || type.includes('vida real') || type.includes('domínio')) {
        dimensionKey = 'real_life_domains';
      } else {
        const hasVocabKeyword = ['vocab', 'vocabulário', 'palavra', 'termo', 'gíria'].some(k => phrase.includes(k) || type.includes(k) || expl.includes(k));
        if (hasVocabKeyword) {
          dimensionKey = 'vocabulary';
        }
      }

      groupedMap[dimensionKey].associatedErrors.push(err);
      groupedMap[dimensionKey].repetitionCount += 1;
      groupedMap[dimensionKey].maxSeverityScore = Math.max(groupedMap[dimensionKey].maxSeverityScore, err.severity_score || 5);
    });

    return Object.values(groupedMap).map(diff => {
      let gravity: 'Baixa' | 'Média' | 'Alta' | 'Excelente' = 'Baixa';
      const score = diff.maxSeverityScore;
      if (diff.associatedErrors.length === 0) {
        gravity = 'Excelente';
      } else if (score >= 8) {
        gravity = 'Alta';
      } else if (score >= 4) {
        gravity = 'Média';
      }
      return {
        ...diff,
        gravity
      } as any;
    }).sort((a, b) => b.repetitionCount - a.repetitionCount);
  }, [globalErrors]);

  // Compile comparisons (Unchanged Algorithms)
  const comparisonData = React.useMemo(() => {
    return DEFAULT_NODES.map((node) => {
      const strengthMatch = globalStrengths.find((s) => s.topicId === node.id);
      const successCount = strengthMatch ? strengthMatch.count : 0;
      const lastSuccessPhrase = strengthMatch ? strengthMatch.lastPhrase : '';

      const errorCount = globalErrors.filter((err) => {
        const p = (err.user_phrase || '').toLowerCase();
        const t = (err.error_type || '').toLowerCase();
        const e = (err.explanation || '').toLowerCase();
        return node.keywords.some((kw) => p.includes(kw) || t.includes(kw) || e.includes(kw));
      }).length;

      return {
        id: node.id,
        label: node.label,
        successCount,
        lastSuccessPhrase,
        errorCount,
        category: node.category
      };
    });
  }, [globalErrors, globalStrengths]);

  // Select first difficulty automatically
  useEffect(() => {
    if (!selectedDifficulty && difficulties.length > 0) {
      setSelectedDifficulty(difficulties[0]);
    }
  }, [difficulties]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 text-classic-ink"
    >
      {/* VINTAGE PARCHMENT GREETINGS JOURNAL CARD (Replaces cold technical metrics panel) */}
      <div className="bg-classic-cream border border-[#dfcbb0] rounded-2xl p-6 md:p-8 shadow-xs relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <div className="flex items-center gap-1.5 text-classic-gold">
            <Award className="w-5 h-5" />
            <span className="text-[11px] font-sans font-extrabold uppercase tracking-widest">
              Análise e Modulação Linguística Ativa
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-serif font-bold text-classic-ink leading-tight">
            Evolução e Habilidades Consolidadas
          </h3>
          <p className="text-[#5c5344] font-sans text-xs md:text-sm leading-relaxed">
            Aqui acompanhamos cada aspecto da sua expressão em inglês. À medida que você conversa espontaneamente com os personagens das salas ou realiza lições, o sistema ajusta o plano de treinamento para focar nos pontos que farão sua fluidez decolar de forma verdadeiramente orgânica.
          </p>
        </div>

        <div className="shrink-0 flex items-center justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowProgressModal(true)}
            className="flex items-center gap-2 px-5 py-3.5 bg-classic-green hover:bg-classic-green-light text-white rounded-xl text-xs font-serif font-bold transition-all shadow-sm shadow-[#1a3227]/20 border border-classic-green cursor-pointer"
          >
            <TrendingUp className="w-4.5 h-4.5" />
            📈 Ver Progresso Histórico
          </motion.button>
        </div>
      </div>

      {/* GRAMMAR MASTERY SHEET (Elegant, high-contrast, humanistic) */}
      <div className="bg-[#FAF6EE] border border-[#dfcbb0] rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#dfcbb0]/40 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-classic-gold">
              <span className="flex h-2.5 w-2.5 rounded-full bg-classic-gold" />
              <h4 className="text-[11px] font-sans font-bold uppercase tracking-wider">
                Grammar Mastery Mapping
              </h4>
            </div>
            <p className="text-classic-green text-lg font-serif font-semibold">
              Comparação de Domínio Prático (Acertos vs Erros)
            </p>
          </div>
          <p className="text-xs text-[#736957] max-w-sm leading-relaxed md:text-right">
            Nossa inteligência didática analisa suas construções livres no RPG para calibrar exercícios estruturados adicionais em tempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {comparisonData.map((item) => {
            const totalAttempts = item.successCount + item.errorCount;
            const hasActivity = totalAttempts > 0;
            
            let balanceStatus = "Sem Prática";
            let statusStyle = "text-gray-400 bg-transparent border border-dashed border-gray-300";
            let progressPercentage = 50;

            if (hasActivity) {
              progressPercentage = item.successCount === 0 && item.errorCount === 0 ? 50 : Math.round((item.successCount / totalAttempts) * 100);
              
              if (item.successCount > item.errorCount) {
                balanceStatus = "Domínio Fluido 🌟";
                statusStyle = "text-emerald-800 bg-[#edf3ef] border border-emerald-200/50";
              } else if (item.errorCount > item.successCount) {
                balanceStatus = "Ajustar Estrutura ⚠️";
                statusStyle = "text-amber-800 bg-[#fffbeb] border border-amber-200/50";
              } else {
                balanceStatus = "Em Equilíbrio 📈";
                statusStyle = "text-sky-800 bg-[#f0f9ff] border border-sky-200/50";
              }
            }

            return (
              <div 
                key={item.id} 
                className={`border rounded-2xl p-4 transition-all duration-300 bg-white ${
                  hasActivity 
                    ? 'border-[#dfcbb0]/60 hover:border-classic-gold hover:shadow-xs' 
                    : 'border-transparent opacity-50'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-sans font-bold text-classic-gold tracking-wider block uppercase">
                      {item.category}
                    </span>
                    <h5 className="font-serif font-bold text-classic-ink text-[13px] leading-tight-none">
                      {item.label}
                    </h5>
                  </div>
                  <span className={`text-[9px] font-sans px-2 py-0.5 rounded-lg shrink-0 ${statusStyle}`}>
                    {balanceStatus}
                  </span>
                </div>

                {hasActivity ? (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between text-[10px] font-sans text-[#736957]">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        <span>Acertos: <strong className="text-emerald-700">{item.successCount}x</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span>Erros: <strong className="text-rose-600">{item.errorCount}x</strong></span>
                      </div>
                    </div>

                    <div className="w-full bg-[#fdfbf7] rounded-full h-1 border border-[#dfcbb0]/40 overflow-hidden flex">
                      <div 
                        className="bg-emerald-600 transition-all duration-500" 
                        style={{ width: `${progressPercentage}%` }}
                      />
                      <div 
                        className="bg-rose-400 transition-all duration-500" 
                        style={{ width: `${100 - progressPercentage}%` }}
                      />
                    </div>

                    {item.lastSuccessPhrase && (
                      <p className="text-[10px] text-[#2b4939] bg-[#edf3ef]/60 border border-emerald-100 p-2 rounded-xl italic mt-2 line-clamp-1" title={item.lastSuccessPhrase}>
                        "{item.lastSuccessPhrase}"
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-[11px] font-sans text-gray-400 italic">
                    Ainda não praticado ativamente
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {globalErrors.length === 0 ? (
        <div className="bg-[#FAF6EE] border border-[#dfcbb0] rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-[#1a3227]/5 border border-dashed border-[#1a3227]/30 text-classic-green">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className="text-classic-ink font-serif font-bold text-lg">Expressão Prístina! Nenhuma fragilidade</h4>
            <p className="text-[#5c5344] text-xs max-w-sm mx-auto leading-relaxed">
              Incrível! Suas produções espontâneas estão plenamente coesas. Continue conversando na aba Stories para registrar novas interações.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: ACTIVE DIFFICULTIES DIRECTORY (7/12) */}
          <div className="lg:col-span-7 bg-white border border-[#dfcbb0] rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
            <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#736957] border-b border-[#dfcbb0]/30 pb-3">
              Dimensões de Habilidade Analisadas
            </h4>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {difficulties.map((diff) => {
                const isSelected = selectedDifficulty?.nodeId === diff.nodeId;
                
                let gravityStyle = "bg-gray-50 text-gray-700 border-gray-200";
                if (diff.gravity === 'Alta') {
                  gravityStyle = "bg-rose-50 border border-rose-200 text-rose-800 font-bold";
                } else if (diff.gravity === 'Média') {
                  gravityStyle = "bg-amber-50 border border-amber-200 text-amber-800";
                } else if (diff.gravity === 'Excelente') {
                  gravityStyle = "bg-[#edf3ef] border border-emerald-200 text-[#1a3227] font-semibold";
                }

                return (
                  <motion.div
                    key={diff.nodeId}
                    whileHover={{ scale: 1.002 }}
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`p-4 rounded-2xl border cursor-pointer select-none transition-all flex flex-col justify-between relative overflow-hidden ${
                      isSelected 
                        ? 'bg-[#FAF6EE] border-classic-gold ring-2 ring-classic-gold/15 shadow-xs' 
                        : 'bg-white border-[#dfcbb0]/40 hover:border-classic-gold/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="space-y-1">
                        <h5 className="text-[14px] font-serif font-bold text-classic-ink">
                          {diff.title}
                        </h5>
                        <p className="text-[11.5px] text-[#5c5344] leading-relaxed line-clamp-2 pr-4">
                          {diff.description}
                        </p>
                      </div>

                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-sans uppercase font-bold tracking-wider shrink-0 ${gravityStyle}`}>
                        {diff.gravity}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#dfcbb0]/30 flex items-center justify-between text-[11px] font-sans text-[#736957]">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-classic-gold" />
                        <span>Ocorrências: <strong className="text-classic-ink font-semibold">{diff.repetitionCount}x</strong></span>
                      </div>
                      
                      <div className="w-20 bg-gray-100 rounded-full h-1 border border-gray-200 overflow-hidden hidden sm:block">
                        <div 
                          className="h-full bg-classic-gold"
                          style={{ width: `${diff.gravity === 'Excelente' ? 0 : Math.min(100, diff.repetitionCount * 25)}%` }}
                        />
                      </div>

                      <span className="text-classic-gold font-serif font-bold hover:underline flex items-center gap-0.5 text-xs">
                        Analisar Detalhes →
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: INSPECTOR DRAWER (5/12) */}
          <div className="lg:col-span-5 space-y-6">
            {selectedDifficulty ? (
              <div className="bg-[#FAF6EE] border border-[#dfcbb0] rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-sans font-bold tracking-widest text-[#5c5344] uppercase border-b border-[#dfcbb0]/40 pb-3">
                  <ShieldAlert className="w-4 h-4 text-classic-gold" /> Pasta de Registro Clínico
                </div>

                <div>
                  <h4 className="text-[16px] font-serif font-bold text-classic-ink">
                    {selectedDifficulty.title}
                  </h4>
                  <p className="text-[11.5px] text-[#5c5344] leading-relaxed mt-1">
                    {selectedDifficulty.description}
                  </p>
                </div>

                <div className="bg-white border border-[#dfcbb0]/45 rounded-2xl p-4 space-y-1.5 text-xs text-[#5c5344]">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span>Pontuação Crítica:</span>
                    <span className="font-bold text-classic-gold">{selectedDifficulty.maxSeverityScore}/10</span>
                  </div>
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span>Foco de Treinamento:</span>
                    <span className="font-bold text-classic-green font-serif">{selectedDifficulty.gravity}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-classic-gold flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Amostras de Fala & Correções
                  </h5>

                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                    {selectedDifficulty.associatedErrors.length > 0 ? (
                      selectedDifficulty.associatedErrors.map((err, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-2xl border border-[#dfcbb0]/40 space-y-2 text-xs">
                          <div className="text-rose-900 bg-rose-50/50 p-2.5 border border-dashed border-rose-200 rounded-xl font-serif leading-relaxed">
                            ❌ Falado: <span className="line-through">"{err.user_phrase}"</span>
                          </div>
                          <div className="text-[#1a3227] bg-[#edf3ef] p-2.5 border border-emerald-100 rounded-xl font-bold font-serif leading-relaxed">
                            🏆 Ajuste Ideal: <span>"{err.correction}"</span>
                          </div>
                          {err.explanation && (
                            <p className="text-[#736957] text-[11px] leading-relaxed italic bg-classic-cream p-2.5 rounded-xl border border-[#dfcbb0]/30 mt-1">
                              {err.explanation}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center space-y-3 bg-white border border-dashed border-[#dfcbb0] rounded-2xl">
                        <CheckCircle className="w-6 h-6 text-emerald-700 mx-auto" />
                        <p className="text-emerald-950 font-bold font-serif text-sm">Domínio Perfeito!</p>
                        <p className="text-[#736957] font-sans text-[11px] leading-relaxed">
                          Nenhum desvio ou lacuna foi catalogado nesta área nas suas simulações de conversação livres até o momento.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#dfcbb0] rounded-3xl p-8 text-center text-gray-400 space-y-3">
                <HelpCircle className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-xs font-sans">Selecione uma dimensão para inspecionar.</p>
              </div>
            )}

            <div className="bg-classic-cream border border-[#dfcbb0] rounded-3xl p-5 space-y-2.5 shadow-xs">
              <h5 className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-classic-green flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-classic-green" /> Consolidação Gramatical Ativa
              </h5>
              <p className="text-[11.5px] text-[#5c5344] leading-relaxed">
                As fragilidades observadas de nível <strong>Média</strong> ou <strong>Alta</strong> são enviadas ao seu assistente de planejamento para reorganizar novos exercícios na aba <strong>Course</strong>. Assim, o estudo se ajusta à sua expressão real.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* SEÇÃO: PALAVRAS PESQUISADAS NO MINI TRADUTOR */}
      <div className="bg-[#FAF6EE] border border-[#dfcbb0] rounded-3xl p-6 md:p-8 shadow-xs space-y-6 mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#dfcbb0]/40 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-classic-gold">
              <span className="flex h-2.5 w-2.5 rounded-full bg-classic-gold" />
              <h4 className="text-[11px] font-sans font-bold uppercase tracking-wider">
                Auditoria de Vocabulário Adaptativo
              </h4>
            </div>
            <p className="text-classic-green text-lg font-serif font-semibold">
              Palavras Pesquisadas no Mini Tradutor (Stories)
            </p>
          </div>
          <p className="text-xs text-[#736957] max-w-sm leading-relaxed md:text-right">
            Esta lista exibe os termos consultados durante sua leitura no Modo Stories. Eles são priorizados nas aulas de Vocabulário do seu Curso Particular.
          </p>
        </div>

        {(() => {
          const searchedList = (globalErrors || [])
            .filter(e => e.is_translator_search || (e.explanation && e.explanation.toLowerCase().includes('mini tradutor')));

          if (searchedList.length === 0) {
            return (
              <div className="py-10 text-center bg-white border border-dashed border-[#dfcbb0]/60 rounded-2xl space-y-2">
                <p className="text-xs text-gray-400 font-sans italic">Nenhuma palavra pesquisada no Mini Tradutor ainda.</p>
                <p className="text-[10px] text-gray-400 font-sans">As palavras que você buscar usando o tradutor flutuante no Modo Stories aparecerão aqui em tempo real.</p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-1">
              {searchedList.map((word, idx) => {
                const count = word.search_count || 1;
                const lastSearched = word.last_searched_at || word.timestamp || 'N/A';
                return (
                  <div key={idx} className="bg-white border border-[#dfcbb0]/40 rounded-2xl p-4 hover:border-classic-gold transition-all duration-200">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-sans font-bold text-classic-gold block">Inglês</span>
                        <strong className="text-base font-serif font-bold text-classic-ink font-mono">{word.correction}</strong>
                      </div>
                      <span className="text-[10px] font-sans font-bold bg-[#edf3ef] text-emerald-800 border border-emerald-200/50 px-2 py-0.5 rounded-lg shrink-0">
                        {count}x {count === 1 ? 'pesquisa' : 'pesquisas'}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-50 space-y-1.5 text-[11px] font-sans text-[#736957]">
                      <div>
                        <span className="text-gray-400">Tradução:</span> <strong className="text-classic-ink font-medium">{word.user_phrase}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400">Última consulta:</span> <span className="font-mono text-[10px] text-[#5c5344]">{lastSearched}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* POPUP: ELEGANT HISTORICAL PROGRESSION TIMELINE MODAL */}
      <AnimatePresence>
        {showProgressModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Dark background dim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProgressModal(false)}
              className="absolute inset-0 bg-classic-ink/35 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="max-w-2xl w-full bg-classic-cream border border-[#dfcbb0] rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-[#dfcbb0]/40 pb-4 mb-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-sans font-extrabold uppercase tracking-widest text-classic-gold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Retrato Linguístico de Longo Prazo
                  </span>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-classic-ink">
                    📈 Acompanhamento de Progresso
                  </h3>
                </div>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="p-1.5 rounded-lg border border-[#dfcbb0] text-classic-ink hover:bg-classic-ivory cursor-pointer transition-all shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* PERIOD TABS SELECTOR */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-classic-ivory rounded-xl border border-[#dfcbb0]/50 mb-5 text-sm">
                <button
                  onClick={() => setCurrentPeriod('month')}
                  className={`py-2 px-3 text-center rounded-lg text-xs font-serif font-bold transition-all cursor-pointer ${
                    currentPeriod === 'month'
                      ? 'bg-classic-green text-white shadow-xs'
                      : 'text-classic-ink hover:bg-white/50'
                  }`}
                >
                  Último mês
                </button>
                <button
                  onClick={() => setCurrentPeriod('6months')}
                  className={`py-2 px-3 text-center rounded-lg text-xs font-serif font-bold transition-all cursor-pointer ${
                    currentPeriod === '6months'
                      ? 'bg-classic-green text-white shadow-xs'
                      : 'text-classic-ink hover:bg-white/50'
                  }`}
                >
                  Últimos 6 meses
                </button>
                <button
                  onClick={() => setCurrentPeriod('beginning')}
                  className={`py-2 px-3 text-center rounded-lg text-xs font-serif font-bold transition-all cursor-pointer ${
                    currentPeriod === 'beginning'
                      ? 'bg-classic-green text-white shadow-xs'
                      : 'text-classic-ink hover:bg-white/50'
                  }`}
                >
                  Desde o início
                </button>
              </div>

              {/* REPORT SCROLLER BLOCK */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-[250px] space-y-4">
                {loadingReport ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      {/* Dashed outer circular track */}
                      <div className="absolute inset-0 rounded-full border border-dashed border-[#dfcbb0]/65 animate-spin" style={{ animationDuration: '8s' }} />
                      
                      {/* Spinning wrapper for the dot forming a circle */}
                      <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-classic-gold shadow-[0_0_8px_rgba(212,163,89,0.6)]" />
                      </div>

                      <div className="w-11 h-11 rounded-full bg-classic-ivory border border-[#dfcbb0] flex items-center justify-center text-classic-gold z-10">
                        <TrendingUp className="w-4.5 h-4.5 animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-serif italic text-sm text-classic-gold">Mapeando evolução contínua...</p>
                      <p className="font-sans text-[11px] text-[#736957]">
                        Consultando os snapshots semanais e cruzando seu histórico de vocabulário no Stories...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-stone max-w-none text-classic-ink font-sans text-xs sm:text-sm leading-relaxed space-y-4">
                    {/* Render generated report elegantly with ReactMarkdown */}
                    <div className="markdown-body text-classic-ink [&>h2]:font-serif [&>h2]:text-base [&>h2]:sm:text-lg [&>h2]:font-bold [&>h2]:text-classic-green [&>h2]:mt-5 [&>h2]:mb-2.5 [&>h2]:border-b [&>h2]:border-classic-gold-light/40 [&>h2]:pb-1.5 [&>p]:leading-relaxed [&>p]:mb-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1.5 [&>ul]:mb-4">
                      <ReactMarkdown>
                        {reportText}
                      </ReactMarkdown>
                    </div>

                    {/* VINTAGE EXTRA GRAPHICAL COMPLEMENT */}
                    {parsedSnapshots.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-[#dfcbb0]/50 space-y-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-classic-gold">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-classic-gold">
                              Progresso Visível e Contínuo
                            </span>
                          </div>
                          <h4 className="text-sm sm:text-base font-serif font-bold text-classic-ink">
                            Evolução de Proximidade ao Inglês Aceitável
                          </h4>
                          <p className="text-[11.5px] text-[#5c5344] leading-relaxed">
                            Abaixo, acompanhe sua trajetória em relação ao patamar de <strong>comunicação prática independente</strong> (no qual você já se comunica com autonomia no dia a dia, mesmo contendo pequenos desvios aceitáveis).
                          </p>
                        </div>

                        {/* Beautiful custom vector graph */}
                        <div className="bg-white border border-[#dfcbb0]/45 rounded-2xl p-4 relative overflow-hidden">
                          <svg viewBox="0 0 500 200" className="w-full h-auto overflow-visible font-sans select-none">
                            {/* Grid, background vertical & horizontal lines */}
                            {[100, 75, 50, 25, 0].map((val) => {
                              const y = 170 - (val / 100) * 140;
                              return (
                                <g key={val} className="opacity-45">
                                  <line 
                                    x1="45" 
                                    y1={y} 
                                    x2="455" 
                                    y2={y} 
                                    stroke="#e5dcd0" 
                                    strokeWidth="0.8" 
                                    strokeDasharray="3,3" 
                                  />
                                  <text 
                                    x="12" 
                                    y={y + 3} 
                                    fill="#736957" 
                                    fontSize="7.5" 
                                    fontWeight="600" 
                                    textAnchor="start"
                                  >
                                    {val}%
                                  </text>
                                </g>
                              );
                            })}

                            {/* Subdued Axis */}
                            <line x1="45" y1="30" x2="45" y2="170" stroke="#dfcbb0" strokeWidth="1" />
                            <line x1="45" y1="170" x2="455" y2="170" stroke="#dfcbb0" strokeWidth="1" />

                            {/* Category labels on right side */}
                            <text x="460" y="33" fill="#1a3227" fontSize="7" fontWeight="bold" opacity="0.65">Aceitável</text>
                            <text x="460" y="103" fill="#736957" fontSize="7" opacity="0.55">Funcional</text>

                            {/* Main Curve and Points drawing */}
                            {(() => {
                              const points = parsedSnapshots.map((snap, idx) => {
                                const x = parsedSnapshots.length === 1 
                                  ? 250 
                                  : 50 + (idx / (parsedSnapshots.length - 1)) * 400;
                                const y = 170 - (snap.percentage / 100) * 140;
                                return { ...snap, x, y };
                              });

                              let linePath = "";
                              let areaPath = "";

                              if (points.length > 0) {
                                linePath = `M ${points[0].x} ${points[0].y}`;
                                points.slice(1).forEach((p) => {
                                  linePath += ` L ${p.x} ${p.y}`;
                                });

                                areaPath = `${linePath} L ${points[points.length - 1].x} 170 L ${points[0].x} 170 Z`;
                              }

                              return (
                                <>
                                  <defs>
                                    <linearGradient id="classicGoldGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#dfcbb0" />
                                      <stop offset="100%" stopColor="#FAF6EE" />
                                    </linearGradient>
                                  </defs>

                                  {/* Area under the line */}
                                  {areaPath && (
                                    <path 
                                      d={areaPath} 
                                      fill="url(#classicGoldGradient)" 
                                      opacity="0.32" 
                                      className="transition-all duration-500 ease-in-out" 
                                    />
                                  )}

                                  {/* Evolution Line itself */}
                                  {linePath && (
                                    <motion.path 
                                      d={linePath} 
                                      fill="none" 
                                      stroke="#1a3227" 
                                      strokeWidth="2.2" 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round"
                                      initial={{ pathLength: 0 }}
                                      animate={{ pathLength: 1 }}
                                      transition={{ duration: 0.8 }}
                                      className="transition-all duration-500 ease-in-out"
                                    />
                                  )}

                                  {/* Vertical tracking cursor line */}
                                  {activePoint && (
                                    <line 
                                      x1={activePoint.x} 
                                      y1="30" 
                                      x2={activePoint.x} 
                                      y2="170" 
                                      stroke="#dfcbb0" 
                                      strokeWidth="1.2" 
                                      strokeDasharray="3,3" 
                                    />
                                  )}

                                  {/* Touch areas, labels, and nodes */}
                                  {points.map((p, idx) => {
                                    const isSelected = activePoint?.timestamp === p.timestamp;
                                    const dateParts = p.date.split('-');
                                    const labelDate = `${dateParts[2]}/${dateParts[1]}`;

                                    return (
                                      <g key={p.timestamp}>
                                        <text 
                                          x={p.x} 
                                          y="185" 
                                          fill="#736957" 
                                          fontSize="7" 
                                          fontWeight="600" 
                                          textAnchor="middle"
                                        >
                                          {labelDate}
                                        </text>

                                        {/* Interaction trigger area */}
                                        <circle 
                                          cx={p.x} 
                                          cy={p.y} 
                                          r="18" 
                                          fill="transparent" 
                                          className="cursor-pointer"
                                          onMouseEnter={() => setActivePoint(p)}
                                          onClick={() => setActivePoint(p)}
                                        />

                                        {/* Highlight ring */}
                                        {isSelected && (
                                          <circle 
                                            cx={p.x} 
                                            cy={p.y} 
                                            r="8" 
                                            fill="#1a3227" 
                                            opacity="0.12" 
                                            className="animate-ping" 
                                          />
                                        )}

                                        {/* Visual point dot */}
                                        <circle 
                                          cx={p.x} 
                                          cy={p.y} 
                                          r={isSelected ? "5.5" : "3.5"} 
                                          fill={isSelected ? "#1a3227" : "#fbf9f4"} 
                                          stroke={isSelected ? "#dfcbb0" : "#1a3227"} 
                                          strokeWidth={isSelected ? "2" : "1.2"} 
                                          className="transition-all duration-200 cursor-pointer"
                                          onMouseEnter={() => setActivePoint(p)}
                                          onClick={() => setActivePoint(p)}
                                        />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </svg>

                          {/* Interative information card panel for the selected point */}
                          {activePoint ? (
                            <motion.div 
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-4 bg-[#fdfbf6] border border-classic-gold/50 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-1.5 font-bold font-serif text-classic-ink">
                                  <Calendar className="w-3.5 h-3.5 text-classic-gold" />
                                  <span>{formatDatePT(activePoint.date)}</span>
                                  {activePoint.confidenceRating && (
                                    <span className={`text-[9px] font-sans px-2 py-0.5 rounded-full font-bold ml-2 ${
                                      activePoint.confidenceRating === 'Confiança Alta' 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : activePoint.confidenceRating === 'Confiança Moderada'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                                    }`}>
                                      {activePoint.confidenceRating}
                                    </span>
                                  )}
                                </div>
                                {activePoint.textSummary && (
                                  <p className="text-[10.5px] italic text-[#5c5344] leading-relaxed">
                                    "{activePoint.textSummary}"
                                  </p>
                                )}
                                {activePoint.details && (
                                  <p className="text-[9.5px] text-[#8e8574] leading-relaxed">
                                    ℹ️ {activePoint.details}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col items-center sm:items-end justify-center bg-[#edf3ef] border border-emerald-100 px-3.5 py-2.5 rounded-xl text-emerald-800 font-sans font-bold text-center self-stretch sm:self-auto">
                                <span className="text-[14px] leading-tight font-serif">{activePoint.percentage}%</span>
                                <span className="text-[9px] text-emerald-700 font-normal">Margem de Erro: ±{activePoint.marginOfError}%</span>
                              </div>
                            </motion.div>
                          ) : (
                            <div className="mt-4 text-center py-2 text-[10.5px] font-sans text-[#736957] italic">
                              💡 Passe o mouse ou toque nos pontos do gráfico acima para inspecionar o andamento naquele período.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-[#dfcbb0]/40 pt-4 mt-4 flex items-center justify-between text-[11px] font-sans text-[#736957]">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-classic-gold" />
                  <span>Snapshots registrados aos sábados de forma autônoma.</span>
                </div>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="px-4 py-2 rounded-xl bg-classic-green hover:bg-classic-green-light text-white font-serif font-bold text-xs cursor-pointer transition-all shadow-xs"
                >
                  Fechar Diagnóstico
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
