import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen } from 'lucide-react';
import { IdentifiedError, DEFAULT_NODES } from '../types';

interface CardItem {
  english: string;
  portuguese: string;
  isTip?: boolean;
}

interface ActivePassiveLoaderProps {
  title: string;
  subtitle?: string;
  extraBadge?: string;
  globalErrors?: IdentifiedError[];
}

const TOPIC_VOCABULARY: Record<string, CardItem[]> = {
  present_simple: [
    { english: "she doesn't watch", portuguese: "ela não assiste" },
    { english: "everyone is here", portuguese: "todo mundo está aqui" },
    { english: "people are nice", portuguese: "as pessoas são legais" },
    { english: "how often", portuguese: "com que frequência" },
    { english: "every single day", portuguese: "todo santo dia" },
    { english: "usually", portuguese: "geralmente" },
  ],
  past_simple: [
    { english: "buy -> bought", portuguese: "comprar -> comprou" },
    { english: "go -> went", portuguese: "ir -> foi" },
    { english: "write -> wrote", portuguese: "escrever -> escreveu" },
    { english: "think -> thought", portuguese: "pensar -> pensou" },
    { english: "try -> tried", portuguese: "tentar -> tentou" },
    { english: "I did not see", portuguese: "Eu não vi" },
    { english: "yesterday afternoon", portuguese: "ontem à tarde" },
    { english: "last night", portuguese: "ontem à noite" },
  ],
  present_perfect: [
    { english: "I have been working", portuguese: "Eu tenho estado trabalhando" },
    { english: "have you ever been", portuguese: "você alguma vez já esteve" },
    { english: "she has already left", portuguese: "ela já saiu" },
    { english: "I haven't done it yet", portuguese: "eu ainda não fiz isso" },
    { english: "since last year", portuguese: "desde o ano passado" },
    { english: "already", portuguese: "já (ações concluídas)" },
  ],
  prepositions: [
    { english: "depend on", portuguese: "depender de" },
    { english: "instead of", portuguese: "em vez de" },
    { english: "on the bus", portuguese: "no ônibus" },
    { english: "arrive at the airport", portuguese: "chegar ao aeroporto" },
    { english: "good at maths", portuguese: "bom em matemática" },
  ],
  relative_clauses: [
    { english: "although", portuguese: "embora" },
    { english: "however", portuguese: "porém" },
    { english: "the house where", portuguese: "a casa onde" },
    { english: "the person who", portuguese: "a pessoa que" },
    { english: "nevertheless", portuguese: "apesar disso" },
    { english: "even though", portuguese: "apesar de que" },
    { english: "on the other hand", portuguese: "por outro lado" },
  ],
  third_conditional: [
    { english: "if I had known", portuguese: "se eu soubesse" },
    { english: "I would have gone", portuguese: "eu teria ido" },
    { english: "should have told me", portuguese: "deveria ter me dito" },
    { english: "could have done", portuguese: "poderia ter feito" },
    { english: "at least", portuguese: "pelo menos" },
  ],
  subjunctive: [
    { english: "if I were you", portuguese: "se eu fosse você" },
    { english: "I wish I had", portuguese: "quem dera eu tivesse" },
    { english: "I insist that he speak", portuguese: "eu insisto que ele fale" },
    { english: "it is crucial that she study", portuguese: "é crucial que ela estude" },
  ],
  passive_voice: [
    { english: "was built in 1990", portuguese: "foi construído em 1990" },
    { english: "is being processed", portuguese: "está sendo processado" },
    { english: "has been completed", portuguese: "foi concluído" },
    { english: "by whom was this written", portuguese: "por quem isso foi escrito" },
  ],
  idiomatic_fluency: [
    { english: "at least", portuguese: "pelo menos" },
    { english: "pull someone's leg", portuguese: "brincar/debochar de alguém" },
    { english: "so far, so good", portuguese: "até aqui tudo bem" },
    { english: "costs an arm and a leg", portuguese: "custa os olhos da cara" },
    { english: "take it for granted", portuguese: "dar como garantido" },
    { english: "piece of cake", portuguese: "mamão com açúcar" },
  ]
};

const APP_TIPS: CardItem[] = [
  { english: "Dica", portuguese: "As conversas ajudam o sistema a identificar suas dificuldades.", isTip: true },
  { english: "Dica", portuguese: "Você pode alternar livremente entre Stories e Course.", isTip: true },
  { english: "Dica", portuguese: "Os personagens lembram de acontecimentos importantes.", isTip: true },
  { english: "Dica", portuguese: "Você pode estudar com exercícios ou com a Professora.", isTip: true },
  { english: "Dica", portuguese: "O planejamento se adapta conforme seu desempenho.", isTip: true }
];

export default function ActivePassiveLoader({ 
  title, 
  subtitle, 
  extraBadge,
  globalErrors: propErrors 
}: ActivePassiveLoaderProps) {
  
  // Resolve errors from either prop or localstorage
  const errorsToUse = useMemo<IdentifiedError[]>(() => {
    if (propErrors && propErrors.length > 0) return propErrors;
    try {
      const saved = localStorage.getItem('fluent_errors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [propErrors]);

  const activeFocus = useMemo(() => {
    return localStorage.getItem('fluent_next_focus') || 'present_simple';
  }, []);

  const completedNodes = useMemo<string[]>(() => {
    try {
      const saved = localStorage.getItem('fluent_completed_nodes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  // Assemble dynamic pool of target content
  const cardPool = useMemo<CardItem[]>(() => {
    const pool: CardItem[] = [];

    // 1. Process active user errors as priority
    errorsToUse.forEach(err => {
      // Avoid raw or unhelpful error explanations
      const englishText = err.correction || err.user_phrase;
      let portugueseText = '';

      if (err.explanation) {
        // Grab first sentence of grammatical explanation
        const sentences = err.explanation.split('.');
        portugueseText = sentences[0].trim();
        // Remove unnecessary technical prefixes
        portugueseText = portugueseText.replace(/Refere-se ao |Indica um erro de |Você /gi, '');
      } else {
        portugueseText = `Correção para: "${err.user_phrase}"`;
      }

      if (englishText && portugueseText && englishText.length < 50 && portugueseText.length < 75) {
        pool.push({
          english: englishText,
          portuguese: portugueseText
        });
      }
    });

    // 2. Identify the current focus node to prioritize its vocab
    const matchedFocusNode = DEFAULT_NODES.find(node =>
      node.label.toLowerCase().trim() === activeFocus.toLowerCase().trim() ||
      node.keywords.some(kw => activeFocus.toLowerCase().includes(kw))
    );

    if (matchedFocusNode && TOPIC_VOCABULARY[matchedFocusNode.id]) {
      pool.push(...TOPIC_VOCABULARY[matchedFocusNode.id]);
    }

    // 3. Include studied node vocab as active consolidation
    completedNodes.forEach(nodeId => {
      if (nodeId !== matchedFocusNode?.id && TOPIC_VOCABULARY[nodeId]) {
        // Interleave completed elements
        pool.push(...TOPIC_VOCABULARY[nodeId]);
      }
    });

    // 4. Fill with level-specific generic structures if needed
    const level = localStorage.getItem('fluent_proficiency') || 'Intermediate';
    if (level === 'Advanced') {
      pool.push(...(TOPIC_VOCABULARY.idiomatic_fluency || []));
      pool.push(...(TOPIC_VOCABULARY.subjunctive || []));
    } else {
      pool.push(...(TOPIC_VOCABULARY.present_simple || []));
      pool.push(...(TOPIC_VOCABULARY.prepositions || []));
    }

    // Filter duplicates
    const uniquePool: CardItem[] = [];
    const seen = new Set<string>();
    for (const card of pool) {
      const key = `${card.english.toLowerCase()}_${card.portuguese.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePool.push(card);
      }
    }

    // If still have no data or very few elements, fallback/interleave tips
    if (uniquePool.length < 3) {
      return APP_TIPS;
    }

    return uniquePool;
  }, [errorsToUse, activeFocus, completedNodes]);

  // Group into sets of 3
  const groupsOfThree = useMemo<CardItem[][]>(() => {
    const groups: CardItem[][] = [];
    for (let i = 0; i < cardPool.length; i += 3) {
      const chunk = cardPool.slice(i, i + 3);
      if (chunk.length === 3) {
        groups.push(chunk);
      } else if (chunk.length > 0) {
        // Pad with advice/tips to guarantee exactly 3 elements
        const padded = [...chunk];
        let tipIdx = 0;
        while (padded.length < 3) {
          padded.push(APP_TIPS[tipIdx % APP_TIPS.length]);
          tipIdx++;
        }
        groups.push(padded);
      }
    }
    return groups.length > 0 ? groups : [APP_TIPS.slice(0, 3)];
  }, [cardPool]);

  const [groupIndex, setGroupIndex] = useState(0);

  // Transition interval set to approximately 10 seconds (10000 ms)
  useEffect(() => {
    if (groupsOfThree.length <= 1) return;
    const timer = setInterval(() => {
      setGroupIndex((prev) => (prev + 1) % groupsOfThree.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [groupsOfThree]);

  const currentGroup = groupsOfThree[groupIndex] || APP_TIPS.slice(0, 3);

  return (
    <div className="w-full max-w-md mx-auto py-6 px-4 text-center font-serif text-classic-ink flex flex-col justify-between min-h-[355px]">
      
      {/* Header section with animations */}
      <div className="space-y-3.5 mb-8 flex flex-col items-center">
        <div className="relative w-16 h-16 flex items-center justify-center">
          {/* Dashed outer circular track */}
          <div className="absolute inset-0 rounded-full border border-dashed border-[#dfcbb0]/65 animate-spin" style={{ animationDuration: '8s' }} />
          
          {/* Spinning wrapper for the dot forming a circle */}
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-classic-gold shadow-[0_0_8px_rgba(212,163,89,0.6)]" />
          </div>

          <div className="w-11 h-11 rounded-full bg-classic-ivory border border-[#dfcbb0] flex items-center justify-center text-classic-gold z-10">
            <BookOpen className="w-4.5 h-4.5 animate-pulse" />
          </div>
        </div>

        <h3 className="text-xl md:text-2xl font-serif font-bold text-classic-ink tracking-tight animate-fade-in">
          {title}
        </h3>

        {subtitle && (
          <p className="text-xs text-[#8e8574] leading-relaxed max-w-xs mx-auto">
            {subtitle}
          </p>
        )}

        {extraBadge && (
          <span className="mt-2 inline-block px-3 py-1 bg-classic-cream border border-[#e2dacb] font-mono text-classic-gold text-xs rounded-full shadow-2xs">
            {extraBadge}
          </span>
        )}
      </div>

      <div className="h-0.5 w-16 bg-[#e2dacb]/40 mx-auto" />

      {/* Passive Learning Section */}
      <div className="my-auto py-6 relative overflow-hidden min-h-[190px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={groupIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="grid grid-cols-1 gap-4"
          >
            {currentGroup.map((item, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.15 }}
                className="bg-[#FAF6EE] border border-[#e2dacb]/50 rounded-2xl p-3.5 text-center transition-all duration-300 hover:border-[#dfcbb0] shadow-sm relative overflow-hidden group max-w-xs mx-auto w-full"
              >
                {/* Subtle visual design layout */}
                {item.isTip ? (
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-classic-gold block font-semibold">
                      {item.english}
                    </span>
                    <span className="text-xs text-[#5a5040] font-sans block leading-snug px-1">
                      {item.portuguese}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Deep aesthetic classic text alignment */}
                    <span className="text-sm font-sans font-semibold text-emerald-950 tracking-wide block">
                      {item.english}
                    </span>
                    <div className="flex items-center justify-center gap-1">
                      <div className="h-[1px] w-4 bg-classic-gold/30" />
                      <span className="text-[9px] text-[#b49e7b] font-serif font-bold">↓</span>
                      <div className="h-[1px] w-4 bg-classic-gold/30" />
                    </div>
                    <span className="text-xs text-[#7d715e] font-serif italic block font-light">
                      {item.portuguese}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Small passive notice */}
      <span className="text-[10px] text-[#b4aa98] font-sans tracking-wide block mt-4">
        Aproveite este instante para absorção rápida passiva • Atualizando a cada 10s
      </span>
    </div>
  );
}
