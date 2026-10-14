import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, Award, RefreshCw, AlertTriangle, CheckCircle, Lock, 
  Play, Sparkles, AlertCircle, HelpCircle, ArrowRight, UserMinus, ShieldAlert,
  Volume2, ListRestart
} from 'lucide-react';
import { IdentifiedError, SkillNode, DEFAULT_NODES, AdaptationRecord } from '../types';
import { safeLocalStorageSet } from '../utils/safeStorage';

interface PlanningScreenProps {
  currentFocus: string;
  globalErrors: IdentifiedError[];
  baselineProficiency: string;
  estimatedMonths: number;
  onUpdatePlan: (newFocus: string, fluencyOffset: string) => void;
  onSwitchToCourse: () => void;
  adaptations: AdaptationRecord[];
}

export default function PlanningScreen({
  currentFocus,
  globalErrors,
  baselineProficiency,
  estimatedMonths,
  onUpdatePlan,
  onSwitchToCourse,
  adaptations
}: PlanningScreenProps) {
  const [completedNodes, setCompletedNodes] = useState<string[]>(() => {
    try {
      const persisted = localStorage.getItem('fluent_completed_nodes');
      if (persisted) return JSON.parse(persisted);
    } catch {}
    if (baselineProficiency === 'Advanced') {
      return ['present_simple', 'past_simple', 'present_perfect', 'prepositions', 'relative_clauses'];
    } else if (baselineProficiency === 'Intermediate') {
      return ['present_simple', 'past_simple'];
    }
    return [];
  });

  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [showAdaptationDialog, setShowAdaptationDialog] = useState(false);

  // Read adaptations voice function speaking standard Portuguese
  const speakPortugueseText = (text: string) => {
    if ((window as any).isTutorialActive) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';

      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt')) || null;
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onstart = () => {
        setIsPlayingVoice(true);
      };
      utterance.onend = () => {
        setIsPlayingVoice(false);
      };
      utterance.onerror = () => {
        setIsPlayingVoice(false);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      alert("Seu navegador atual não suporta síntese de voz nativa.");
    }
  };

  const handlePlayAdaptationVoice = () => {
    if ((window as any).isTutorialActive) return;
    if (isPlayingVoice) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);
      return;
    }

    if (!adaptations || adaptations.length === 0) {
      const defaultExp = `Com base no seu perfil ${baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediário' : 'Iniciante'}, estabelecemos o plano inicial de estudos focado em "${currentFocus}". Nenhuma readaptação secundária foi necessária até o momento.`;
      speakPortugueseText(defaultExp);
    } else {
      const lastAdaptation = adaptations[0];
      const audioText = `Última readaptação efetuada no planejamento. ${lastAdaptation.reason}`;
      speakPortugueseText(audioText);
    }
  };

  // Sync completion states to localStorage
  useEffect(() => {
    safeLocalStorageSet('fluent_completed_nodes', JSON.stringify(completedNodes));
  }, [completedNodes]);

  // Map nodes to error counts based on keywords matching user's global error logs
  const getNodeErrors = (node: SkillNode): IdentifiedError[] => {
    return globalErrors.filter(err => {
      const phrase = (err.user_phrase || '').toLowerCase();
      const type = (err.error_type || '').toLowerCase();
      const expl = (err.explanation || '').toLowerCase();
      
      return node.keywords.some(kw => 
        phrase.includes(kw) || type.includes(kw) || expl.includes(kw)
      );
    });
  };

  const getIsUnderConsolidation = (nodeId: string): boolean => {
    try {
      const recordsStr = localStorage.getItem('fluent_consolidation_records');
      if (!recordsStr) return false;
      const records = JSON.parse(recordsStr);
      const record = records.find((r: any) => r.id === nodeId && r.result === 'pass');
      if (!record) return false;
      const diff = Date.now() - new Date(record.completedAt).getTime();
      return diff >= 0 && diff < 3 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  // Determine actual status of an individual skill node
  const getNodeStatus = (node: SkillNode): 'completed' | 'active' | 'unlocked' | 'locked' | 'review' => {
    if (completedNodes.includes(node.id)) {
      if (getIsUnderConsolidation(node.id)) {
        return 'completed';
      }
      // If completed but user has errors on this topic, mark as REVIEW required to simulate adaptive calibration!
      const errorCount = getNodeErrors(node).length;
      return errorCount > 0 ? 'review' : 'completed';
    }
    
    // Check if the current focused target
    if (currentFocus.toLowerCase().trim() === node.label.toLowerCase().trim() || 
        node.keywords.some(kw => currentFocus.toLowerCase().includes(kw))) {
      return 'active';
    }

    // Check if dependencies are met
    const canUnlock = node.dependsOn.every(dep => completedNodes.includes(dep));
    return canUnlock ? 'unlocked' : 'locked';
  };

  // Check if chosen node can be manually targeted
  const handleSelectActiveTarget = (node: SkillNode) => {
    const status = getNodeStatus(node);
    if (status === 'locked') {
      alert(`Este tópico está bloqueado. Complete as habilidades antecedentes antes de ativá-lo como foco: ${node.dependsOn.map(id => DEFAULT_NODES.find(n => n.id === id)?.label).join(', ')}`);
      return;
    }
    // Update target focus
    onUpdatePlan(node.label, '0 days'); // Trigger state update
  };

  // Toggle manual node completion state - offers full custom learning flexibility
  const toggleNodeCompletion = (nodeId: string) => {
    setCompletedNodes(prev => {
      let next: string[];
      if (prev.includes(nodeId)) {
        // Remove and lock any downstream nodes that depend on this one
        next = prev.filter(id => id !== nodeId);
        // Cascading lock
        let changed = true;
        while (changed) {
          const startLen = next.length;
          next = next.filter(id => {
            const node = DEFAULT_NODES.find(n => n.id === id);
            if (!node) return true;
            return node.dependsOn.every(dep => next.includes(dep));
          });
          if (next.length === startLen) changed = false;
        }
      } else {
        // Add to completed
        next = [...prev, nodeId];
      }
      return next;
    });
  };

  // Auto select default selectedNode on mount
  useEffect(() => {
    if (!selectedNode && DEFAULT_NODES.length > 0) {
      const active = DEFAULT_NODES.find(n => getNodeStatus(n) === 'active') || DEFAULT_NODES[0];
      setSelectedNode(active);
    }
  }, [currentFocus]);

  const activeFocusNode = DEFAULT_NODES.find(n => getNodeStatus(n) === 'active');
  const alertNodesCount = DEFAULT_NODES.filter(n => getNodeStatus(n) === 'review').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Dynamic Header & Telemetry panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#0a0a0e] border border-[#ffffff10] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Compass className="w-48 h-48 text-[#00f2ff]" />
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#00f2ff10] border border-[#00f2ff30] text-[#00f2ff] font-bold uppercase tracking-widest">
              Linguistic Calibration Map
            </span>
            <span className="h-2 w-2 rounded-full bg-[#00ff88] animate-ping" />

            <button
              onClick={() => {
                handlePlayAdaptationVoice();
                setShowAdaptationDialog(true);
              }}
              className={`md:ml-auto px-3 py-1 rounded-xl text-[10px] font-sans font-extrabold uppercase tracking-wide flex items-center gap-1.5 transition-all outline-none border cursor-pointer ${
                isPlayingVoice 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse' 
                  : 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50'
              }`}
            >
              <Volume2 className="w-3 h-3" />
              <span>Adaptações</span>
            </button>
          </div>

          <h3 className="text-xl md:text-2xl font-sans font-extrabold text-slate-100 uppercase tracking-tight">
            Árvore de Habilidades Adaptativa (Adaptive Study Road)
          </h3>
          <p className="text-slate-400 text-xs md:text-sm leading-relaxed max-w-2xl">
            Abaixo está a sua árvore de maestria gramatical formulada pelo Auditor Linguístico. 
            Este planejamento é <strong>vitalmente flexível</strong>: ele recalibra de acordo com seus erros cometidos nas conversas e permite que você selecione livremente seu próximo foco curricular.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="bg-[#050507] border border-[#ffffff0a] rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00f2ff]" />
              <span className="text-slate-500">Próximo Alvo Ativo:</span>
              <strong className="text-[#00f2ff] font-semibold">{currentFocus}</strong>
            </div>

            <div className="bg-[#050507] border border-[#ffffff0a] rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]" />
              <span className="text-slate-500">Estimativa Fluência:</span>
              <strong className="text-[#00ff88] font-bold">{estimatedMonths} meses restantes</strong>
            </div>

            {alertNodesCount > 0 && (
              <div className="bg-[#ff4e0010] border border-[#ff4e0030] rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs animate-pulse">
                <ShieldAlert className="w-4 h-4 text-[#ff4e00]" />
                <span className="text-slate-300">Tópicos em Alerta:</span>
                <strong className="text-[#ff4e00] font-bold">{alertNodesCount}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Legend Panel */}
        <div className="lg:col-span-4 bg-[#050507]/60 border border-[#ffffff0a] rounded-xl p-4 space-y-2.5 text-xs">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Status dos Nódulos</h4>
          <div className="grid grid-cols-2 gap-2 text-[10px] md:text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <div className="w-3 h-3 rounded bg-slate-900 border border-[#ffffff10]" />
              <span>Bloqueado (Locked)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#00f2ff]">
              <div className="w-3 h-3 rounded bg-[#00f2ff20] border border-[#00f2ff]" />
              <span>Alvo Ativo (Active)</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <div className="w-3 h-3 rounded bg-[#0a0a0e] border border-dashed border-slate-700" />
              <span>Desbloqueado</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#00ff88]">
              <div className="w-3 h-3 rounded bg-[#00ff8815] border border-[#00ff88]" />
              <span>Concluído (Mastered)</span>
            </div>
            <div className="col-span-2 flex items-center gap-1.5 text-[#ff4e00]">
              <div className="w-3 h-3 rounded bg-[#ff4e0015] border border-[#ff4e00] animate-pulse" />
              <span>Alertas de Erros Recentes (Review Required)</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 leading-normal border-t border-[#ffffff0a] pt-2">
            🧠 <strong>Adaptação Dinâmica:</strong> Se você errar um tópico em Conversas, o nodulo acenderá em laranja para revisão e alterará a sua estimativa de tempo.
          </p>
        </div>
      </div>

      {/* Main interaction workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COMPONENT: The Interactive Skill Tree Render (8/12 width) */}
        <div className="xl:col-span-8 bg-[#0a0a0e] border border-[#ffffff10] rounded-2xl p-6 min-h-[580px] shadow-2xl relative flex flex-col justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />
          
          <div className="relative z-10 space-y-8 flex-1 flex flex-col justify-between py-4">
            
            {/* TIER 1: Foundations */}
            <div id="skill_tree_tier_1" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#ffffff0a] pb-2">
                <span className="text-[9px] font-mono text-slate-500">TIER 01</span>
                <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-[#00f2ff]">Estruturas de Fundação</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DEFAULT_NODES.filter(n => n.tier === 1).map(node => {
                  const status = getNodeStatus(node);
                  const errors = getNodeErrors(node);
                  const isSelected = selectedNode?.id === node.id;
                  
                  return (
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`relative p-4 rounded-xl border transition-all cursor-pointer select-none overflow-hidden ${
                        isSelected 
                          ? 'bg-[#12121a] border-[#00f2ff] shadow-[0_0_12px_#00f2ff20]'
                          : status === 'completed'
                            ? 'bg-[#00ff8803] border-[#00ff8825] hover:border-[#00ff8880]'
                            : status === 'review'
                              ? 'bg-[#ff4e0003] border-[#ff4e0040] hover:border-[#ff4e00] shadow-[0_0_8px_#ff4e0010] animate-pulse'
                              : status === 'active'
                                ? 'bg-[#00f2ff04] border-[#00f2ff] hover:border-[#00f2ff]'
                                : 'bg-slate-950/40 border-[#ffffff0a] hover:border-slate-800'
                      }`}
                    >
                      {/* Top ribbon node identifiers */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">{node.category}</span>
                        <div className="flex items-center gap-1">
                          {status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" />}
                          {status === 'review' && (
                            <span className="flex items-center gap-1 text-[9px] font-mono text-[#ff4e00] bg-[#ff4e0015] px-1.5 py-0.5 rounded border border-[#ff4e0020] uppercase font-bold">
                              {errors.length} Erros
                            </span>
                          )}
                          {status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-[#00f2ff] animate-ping" />}
                        </div>
                      </div>

                      <h5 className={`text-xs md:text-sm font-sans font-bold ${
                        status === 'locked' ? 'text-slate-600' : isSelected ? 'text-white' : 'text-slate-200'
                      }`}>
                        {node.label}
                      </h5>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {node.description}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between text-[9px] font-mono text-slate-500">
                        <span>Tempo: {node.timeEstimation}</span>
                        {status === 'locked' ? (
                          <span className="flex items-center gap-1 text-slate-600"><Lock className="w-3 h-3" /> Lock</span>
                        ) : (
                          <span className="text-[#00f2ff] hover:underline">Detalhes →</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Connecting Visual SVG Conduit (Static or simulated connection lines between Tiers on desktop) */}
            <div className="hidden md:flex justify-around items-center py-2 text-slate-700 select-none">
              <span className="text-[10px] font-mono tracking-widest text-[#ffffff07]">| ⚡ SECURE CONDUITS FLOWING |</span>
            </div>

            {/* TIER 2: Intermediate Progress */}
            <div id="skill_tree_tier_2" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#ffffff0a] pb-2">
                <span className="text-[9px] font-mono text-slate-500">TIER 02</span>
                <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-[#00f2ff]">Conexões Intermediárias</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {DEFAULT_NODES.filter(n => n.tier === 2).map(node => {
                  const status = getNodeStatus(node);
                  const errors = getNodeErrors(node);
                  const isSelected = selectedNode?.id === node.id;
                  
                  return (
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`relative p-3.5 rounded-xl border transition-all cursor-pointer select-none overflow-hidden ${
                        isSelected 
                          ? 'bg-[#12121a] border-[#00f2ff] shadow-[0_0_12px_#00f2ff20]'
                          : status === 'completed'
                            ? 'bg-[#00ff8803] border-[#00ff8825] hover:border-[#00ff8880]'
                            : status === 'review'
                              ? 'bg-[#ff4e0003] border-[#ff4e0040] hover:border-[#ff4e00] shadow-[0_0_8px_#ff4e0010] animate-pulse'
                              : status === 'active'
                                ? 'bg-[#00f2ff04] border-[#00f2ff] hover:border-[#00f2ff]'
                                : status === 'locked'
                                  ? 'bg-slate-950/20 border-slate-900 shadow-inner'
                                  : 'bg-slate-950/40 border-[#ffffff0a] hover:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[8px] font-mono text-slate-500 uppercase">{node.category}</span>
                        <div className="flex items-center gap-1">
                          {status === 'locked' ? (
                            <Lock className="w-3 h-3 text-slate-700" />
                          ) : status === 'completed' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" />
                          ) : status === 'review' ? (
                            <span className="text-[8px] font-mono text-[#ff4e00] bg-[#ff4e0015] px-1.5 py-0.5 rounded border border-[#ff4e0020] uppercase font-bold">
                              {errors.length} E
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <h5 className={`text-xs font-sans font-bold ${
                        status === 'locked' ? 'text-slate-600' : isSelected ? 'text-white' : 'text-slate-200'
                      }`}>
                        {node.label}
                      </h5>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {node.description}
                      </p>

                      <div className="mt-2 flex items-center justify-between text-[8px] font-mono text-slate-500">
                        <span>Requisito: {node.dependsOn.map(id => DEFAULT_NODES.find(n => n.id === id)?.label.split(' ')[0]).join(', ')}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="hidden md:flex justify-around items-center py-1 text-slate-700 select-none">
              <span className="text-[10px] font-mono tracking-widest text-[#ffffff07]">| ⚡ SECURE CONDUITS FLOWING |</span>
            </div>

            {/* TIER 3: Advanced Moods */}
            <div id="skill_tree_tier_3" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#ffffff0a] pb-2">
                <span className="text-[9px] font-mono text-slate-500">TIER 03</span>
                <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-[#00f2ff]">Modalidade Avançada & Narrativas</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {DEFAULT_NODES.filter(n => n.tier === 3).map(node => {
                  const status = getNodeStatus(node);
                  const errors = getNodeErrors(node);
                  const isSelected = selectedNode?.id === node.id;
                  
                  return (
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`relative p-3.5 rounded-xl border transition-all cursor-pointer select-none overflow-hidden ${
                        isSelected 
                          ? 'bg-[#12121a] border-[#00f2ff] shadow-[0_0_12px_#00f2ff20]'
                          : status === 'completed'
                            ? 'bg-[#00ff8803] border-[#00ff8825] hover:border-[#00ff8880]'
                            : status === 'review'
                              ? 'bg-[#ff4e0003] border-[#ff4e0040] hover:border-[#ff4e00] shadow-[0_0_8px_#ff4e0010] animate-pulse'
                              : status === 'active'
                                ? 'bg-[#00f2ff04] border-[#00f2ff] hover:border-[#00f2ff]'
                                : status === 'locked'
                                  ? 'bg-slate-950/20 border-slate-900 shadow-inner'
                                  : 'bg-slate-950/40 border-[#ffffff0a] hover:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[8px] font-mono text-slate-500 uppercase">{node.category}</span>
                        <div className="flex items-center gap-1">
                          {status === 'locked' ? (
                            <Lock className="w-3 h-3 text-slate-700" />
                          ) : status === 'completed' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" />
                          ) : status === 'review' ? (
                            <span className="text-[8px] font-mono text-[#ff4e00] bg-[#ff4e0015] px-1.5 py-0.5 rounded border border-[#ff4e0020] uppercase font-bold">
                              {errors.length} E
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <h5 className={`text-xs font-sans font-bold ${
                        status === 'locked' ? 'text-slate-600' : isSelected ? 'text-white' : 'text-slate-200'
                      }`}>
                        {node.label}
                      </h5>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {node.description}
                      </p>

                      <div className="mt-2 flex items-center justify-between text-[8px] font-mono text-slate-500">
                        <span>Gatilho posterior</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="hidden md:flex justify-around items-center py-1 text-slate-700 select-none">
              <span className="text-[10px] font-mono tracking-widest text-[#ffffff07]">| ⚡ FINAL GATE CHANNELS |</span>
            </div>

            {/* TIER 4: Mastery */}
            <div id="skill_tree_tier_4" className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#ffffff0a] pb-2">
                <span className="text-[9px] font-mono text-slate-500">TIER 04</span>
                <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">Pico de Fluência Vernácula (Creative Mastery)</h4>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {DEFAULT_NODES.filter(n => n.tier === 4).map(node => {
                  const status = getNodeStatus(node);
                  const errors = getNodeErrors(node);
                  const isSelected = selectedNode?.id === node.id;
                  
                  return (
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`relative p-4 rounded-xl border transition-all cursor-pointer select-none overflow-hidden ${
                        isSelected 
                          ? 'bg-[#12121a] border-[#00f2ff] shadow-[0_0_12px_#00f2ff20]'
                          : status === 'completed'
                            ? 'bg-[#00ff8803] border-[#00ff8825] hover:border-[#00ff8880]'
                            : status === 'review'
                              ? 'bg-[#ff4e0003] border-[#ff4e0040] hover:border-[#ff4e00] shadow-[0_0_8px_#ff4e0010] animate-pulse'
                              : status === 'active'
                                ? 'bg-[#00f2ff04] border-[#00f2ff] hover:border-[#00f2ff]'
                                : status === 'locked'
                                  ? 'bg-slate-950/20 border-slate-900 shadow-inner'
                                  : 'bg-slate-950/40 border-[#ffffff0a] hover:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono text-amber-500 font-bold uppercase tracking-widest">{node.category}</span>
                        <div className="flex items-center gap-1">
                          {status === 'locked' && <Lock className="w-4.5 h-4.5 text-slate-700" />}
                        </div>
                      </div>

                      <h5 className={`text-sm font-sans font-extrabold ${
                        status === 'locked' ? 'text-slate-600' : 'text-slate-100'
                      }`}>
                        {node.label}
                      </h5>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-normal">
                        {node.description}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Selected Node details / calibration console (4/12 width) */}
        <div className="xl:col-span-4 space-y-6">
          {selectedNode ? (
            <div className="bg-[#0a0a0e] border border-[#ffffff10] rounded-2xl p-5 shadow-xl space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#00f2ff] uppercase border-b border-[#ffffff0a] pb-3">
                <Award className="w-4 h-4 text-[#00f2ff]" /> Detalhes do Nodo Gramatical
              </div>

              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase">{selectedNode.category}</span>
                <h4 className="text-base md:text-lg font-sans font-extrabold text-slate-100 mt-1">
                  {selectedNode.label}
                </h4>
                <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                  {selectedNode.description}
                </p>
              </div>

              <div className="p-3.5 bg-[#050507] border border-[#ffffff0a] rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Duração Estimada:</span>
                  <span className="font-mono text-slate-200">{selectedNode.timeEstimation}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Status na Árvore:</span>
                  <span className={`font-mono font-bold capitalize ${
                    getNodeStatus(selectedNode) === 'completed'
                      ? 'text-[#00ff88]'
                      : getNodeStatus(selectedNode) === 'review'
                        ? 'text-[#ff4e00]'
                        : getNodeStatus(selectedNode) === 'active'
                          ? 'text-[#00f2ff]'
                          : getNodeStatus(selectedNode) === 'locked'
                            ? 'text-slate-500'
                            : 'text-slate-400'
                  }`}>
                    {getNodeStatus(selectedNode)}
                  </span>
                </div>
              </div>

              {/* Sub-panel displaying contextual errors for this exact node */}
              {getNodeErrors(selectedNode).length > 0 && (
                <div className="p-4 bg-[#ff4e0008] border border-[#ff4e0020] rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#ff4e00]" />
                    <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#ff4e00]">
                      Falhas de Conversão Registradas ({getNodeErrors(selectedNode).length})
                    </h5>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    O Auditor detectou erros nesta categoria enquanto você falava no sandbox. Corrija-os e treine para sanar a inconsistência.
                  </p>

                  <div className="space-y-3.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {getNodeErrors(selectedNode).map((err, i) => (
                      <div key={i} className="text-[10px] p-2 bg-[#050507] border border-[#ffffff05] rounded-lg space-y-1">
                        <div className="text-rose-400 font-sans">
                          ❌ Verbatim: <span className="line-through">"{err.user_phrase}"</span>
                        </div>
                        <div className="text-[#00ff88] font-semibold">
                          🏆 Correct: "{err.correction}"
                        </div>
                        <div className="text-slate-500 mt-1 italic text-[9px] leading-tight select-all">
                          {err.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Box */}
              <div className="space-y-3 pt-3 border-t border-[#ffffff00]">
                {/* Active Focus Trigger */}
                {getNodeStatus(selectedNode) !== 'locked' ? (
                  <button
                    onClick={() => handleSelectActiveTarget(selectedNode)}
                    disabled={getNodeStatus(selectedNode) === 'active'}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-sans font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      getNodeStatus(selectedNode) === 'active'
                        ? 'bg-slate-900 border border-[#ffffff05] text-[#00f2ff40]'
                        : 'bg-[#00f2ff] hover:bg-[#00d0dd] text-black shadow-[0_0_15px_#00f2ff30]'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    {getNodeStatus(selectedNode) === 'active' ? 'Ativo Como Tópico Foco' : 'Fixar Como Foco de Estudo'}
                  </button>
                ) : (
                  <div className="text-center py-2.5 px-4 bg-slate-950/20 border border-[#ffffff05] text-[10px] font-mono text-slate-500 rounded-xl">
                    🔒 Desbloqueie as habilidades antecedentes para poder focar neste tópico.
                  </div>
                )}

                {/* Switch directly into Course Training screen */}
                {getNodeStatus(selectedNode) !== 'locked' && (
                  <button
                    onClick={() => {
                        handleSelectActiveTarget(selectedNode);
                        onSwitchToCourse();
                    }}
                    className="w-full py-3 px-4 bg-[#7000ff]/10 hover:bg-[#7000ff]/20 border border-[#7000ff]/30 hover:border-[#7000ff]/60 text-[#dfd9ff] text-xs font-sans font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer rounded-xl"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#00f2ff]" />
                    Iniciar Curso Cooperativo
                  </button>
                )}

                {/* Manual completion toggle for total flexible design */}
                <button
                  onClick={() => toggleNodeCompletion(selectedNode.id)}
                  className="w-full py-2.5 px-4 bg-[#0a0a0e] hover:bg-slate-950 border border-[#ffffff10] text-slate-400 hover:text-slate-100 text-[10px] font-mono tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer rounded-xl"
                >
                  <RefreshCw className="w-3 h-3" />
                  {completedNodes.includes(selectedNode.id) ? 'Desmarcar Concluído Key' : 'Marcar Como Concluído/Estudado'}
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-[#0a0a0e] border border-[#ffffff10] rounded-2xl p-8 text-center text-slate-400 space-y-3">
              <Compass className="w-10 h-10 text-slate-600 mx-auto animate-pulse" />
              <p className="text-xs font-mono">Selecione uma habilidade para calibrar.</p>
            </div>
          )}

          {/* Quick interactive calibration tips card */}
          <div className="bg-[#0a0a0e] border border-[#ffffff10] rounded-2xl p-5 space-y-3 shadow-md">
            <h5 className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#00ff88] flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" /> Conselhos do Auditor
            </h5>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              O Auditor de Linguagem adaptou seu percurso. Se você selecionar um tópico como foco ativo, a IA moldará a sua 
              tabela de diálogo de conversação de RPG e gerará as próximas questões e testes em torno desta estrutura gramatical selecionada.
            </p>
          </div>
        </div>

      </div>

      {/* Adaptações Dialog modal overlay */}
      <AnimatePresence>
        {showAdaptationDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0c0c12] border border-[#ffffff10] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#ffffff10] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-[#00ff88]" />
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                    Mural de Adaptações Ativas
                  </h4>
                </div>
                <button
                  onClick={() => {
                    if (!(window as any).isTutorialActive) {
                      window.speechSynthesis.cancel();
                    }
                    setIsPlayingVoice(false);
                    setShowAdaptationDialog(false);
                  }}
                  className="text-xs text-slate-500 hover:text-white font-mono cursor-pointer transition-colors"
                >
                  FECHAR [X]
                </button>
              </div>

              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {(!adaptations || adaptations.length === 0) ? (
                  <div className="text-center py-8 space-y-2">
                    <ListRestart className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      Nenhum reajuste secundário foi feito pelo Auditor de Linguagem.
                    </p>
                    <p className="text-[11px] text-slate-500 leading-normal max-w-xs mx-auto">
                      O plano atual focado em "<strong>{currentFocus}</strong>" foi estabelecido no seu alinhamento diagnóstico e segue satisfatório.
                    </p>
                  </div>
                ) : (
                  adaptations.map((rec, index) => (
                    <div 
                      key={rec.id} 
                      className={`p-4 rounded-xl border space-y-2.5 text-xs transition-all ${
                        index === 0
                          ? 'bg-[#00ff8804] border-[#00ff8830] shadow-[0_0_12px_#00ff880a]'
                          : 'bg-[#050507]/40 border-[#ffffff05]'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 border-b border-white/[0.03] pb-1.5 align-middle">
                        <span className={index === 0 ? 'text-[#00ff88] font-bold text-[9px]' : 'text-[9px]'}>
                          {index === 0 ? '🏆 ÚLTIMA ADAPTAÇÃO' : `REAJUSTE #${adaptations.length - index}`}
                        </span>
                        <span>{new Date(rec.timestamp).toLocaleDateString('pt-BR')} {new Date(rec.timestamp).toLocaleTimeString('pt-BR')}</span>
                      </div>

                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="text-slate-400">Alvo Posterior: <strong className="text-rose-400">{rec.previousFocus}</strong></span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-slate-200">Novo Alvo Corretivo: <strong className="text-[#00ff88]">{rec.newFocus}</strong></span>
                      </div>

                      <p className="text-slate-300 leading-relaxed text-[11px] bg-slate-950/40 p-2.5 rounded border border-white/[0.02]">
                        {rec.reason}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Speak last adaptation button inside modal */}
              {adaptations && adaptations.length > 0 && (
                <button
                  onClick={handlePlayAdaptationVoice}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all outline-none border cursor-pointer ${
                    isPlayingVoice 
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse' 
                      : 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30 hover:bg-[#00ff88]/20'
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isPlayingVoice ? "Parar Reprodução de Áudio" : "Ouvir Explicação e Justificativa"}</span>
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
