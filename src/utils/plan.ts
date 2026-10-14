import { WeekPlan, WeeklyPlanContent, DEFAULT_NODES, IdentifiedError } from '../types';

export const TOPIC_WORDS: Record<string, { en: string, pt: string }[]> = {
  "Expressões Idiomáticas do Cotidiano": [
    { en: "nevertheless", pt: "mesmo assim" },
    { en: "on the go", pt: "em movimento" },
    { en: "once in a while", pt: "de vez em quando" },
    { en: "by the way", pt: "a propósito" },
    { en: "so far so good", pt: "até aqui, tudo bem" }
  ],
  "Vocabulário de Viagens e Aeroportos": [
    { en: "boarding pass", pt: "cartão de embarque" },
    { en: "baggage claim", pt: "retirada de bagagem" },
    { en: "layover", pt: "escala" },
    { en: "gate", pt: "portão" },
    { en: "customs", pt: "alfândega" }
  ],
  "Termos de Negócios e Apresentações": [
    { en: "feedback", pt: "retorno" },
    { en: "forecast", pt: "previsão" },
    { en: "milestone", pt: "etapa importante" },
    { en: "outcome", pt: "resultado" },
    { en: "stakeholder", pt: "parte interessada" }
  ],
  "Vocabulário de Tecnologia e Inovação": [
    { en: "database", pt: "banco de dados" },
    { en: "cloud", pt: "nuvem" },
    { en: "framework", pt: "estrutura/modelo" },
    { en: "backup", pt: "cópia de segurança" },
    { en: "bandwidth", pt: "largura de banda" }
  ],
  "Termos de Culinária e Restaurantes": [
    { en: "reservation", pt: "reserva" },
    { en: "receipt", pt: "recibo" },
    { en: "waiter", pt: "garçom" },
    { en: "menu", pt: "cardápio" },
    { en: "tip", pt: "gorjeta" }
  ],
  "Vocabulário de Compras e Negociações": [
    { en: "discount", pt: "desconto" },
    { en: "bargain", pt: "pechincha" },
    { en: "receipt", pt: "recibo" },
    { en: "refund", pt: "reembolso" },
    { en: "wholesale", pt: "atacado" }
  ],
  "Termos de Saúde e Bem-Estar": [
    { en: "appointment", pt: "consulta" },
    { en: "prescription", pt: "receita médica" },
    { en: "symptom", pt: "sintoma" },
    { en: "checkup", pt: "exame de rotina" },
    { en: "wellness", pt: "bem-estar" }
  ],
  "Vocabulário de Lazer e Entretenimento": [
    { en: "gig", pt: "show/apresentação" },
    { en: "venue", pt: "local do evento" },
    { en: "blockbuster", pt: "sucesso de bilheteria" },
    { en: "hobby", pt: "passatempo" },
    { en: "cast", pt: "elenco" }
  ],
  "Termos de Educação e Mercado de Trabalho": [
    { en: "resume", pt: "currículo" },
    { en: "internship", pt: "estágio" },
    { en: "degree", pt: "diploma/grau" },
    { en: "scholarship", pt: "bolsa de estudos" },
    { en: "vacancy", pt: "vaga" }
  ],
  "Vocabulário de Meio Ambiente e Clima": [
    { en: "global warming", pt: "aquecimento global" },
    { en: "renewable", pt: "renovável" },
    { en: "pollution", pt: "poluição" },
    { en: "drought", pt: "seca" },
    { en: "biodiversity", pt: "biodiversidade" }
  ],
  "Termos de Mídia e Comunicação": [
    { en: "broadcast", pt: "transmissão" },
    { en: "headline", pt: "manchete" },
    { en: "coverage", pt: "cobertura" },
    { en: "audience", pt: "público" },
    { en: "press release", pt: "comunicado" }
  ],
  "Vocabulário de Finanças e Economia": [
    { en: "budget", pt: "orçamento" },
    { en: "revenue", pt: "receita" },
    { en: "assets", pt: "ativos" },
    { en: "liability", pt: "passivo" },
    { en: "interest rate", pt: "taxa de juros" }
  ],
  "Vocabulário de Relações Sociais e Família": [
    { en: "sibling", pt: "irmão" },
    { en: "spouse", pt: "cônjuge" },
    { en: "acquaintance", pt: "conhecido" },
    { en: "upbringing", pt: "criação" },
    { en: "kinship", pt: "parentesco" }
  ],
  "Termos de Arte e Cultura": [
    { en: "masterpiece", pt: "obra-prima" },
    { en: "exhibition", pt: "exposição" },
    { en: "heritage", pt: "patrimônio" },
    { en: "sculpture", pt: "escultura" },
    { en: "canvas", pt: "tela" }
  ],
  "Vocabulário de Esportes e Exercícios": [
    { en: "workout", pt: "treino" },
    { en: "referee", pt: "árbitro" },
    { en: "coach", pt: "treinador" },
    { en: "championship", pt: "campeonato" },
    { en: "athlete", pt: "atleta" }
  ],
  "Vocabulário de Trânsito e Mobilidade Urbana": [
    { en: "commute", pt: "trajeto diário" },
    { en: "gridlock", pt: "congestionamento" },
    { en: "pedestrian", pt: "pedestre" },
    { en: "fare", pt: "tarifa" },
    { en: "subway", pt: "metrô" }
  ],
  "Termos Jurídicos e Contratos Simples": [
    { en: "agreement", pt: "acordo" },
    { en: "clause", pt: "cláusula" },
    { en: "lawsuit", pt: "processo" },
    { en: "liability", pt: "responsabilidade" },
    { en: "witness", pt: "testemunha" }
  ],
  "Vocabulário de Ciência e Descobertas": [
    { en: "hypothesis", pt: "hipótese" },
    { en: "breakthrough", pt: "descoberta" },
    { en: "findings", pt: "conclusões" },
    { en: "experiment", pt: "experimento" },
    { en: "theory", pt: "teoria" }
  ],
  "Termos de Sentimentos e Emoções": [
    { en: "anxiety", pt: "ansiedade" },
    { en: "gratitude", pt: "gratidão" },
    { en: "grief", pt: "luto" },
    { en: "excitement", pt: "entusiasmo" },
    { en: "empathy", pt: "empatia" }
  ],
  "Vocabulário de Festas e Celebrações": [
    { en: "gathering", pt: "reunião" },
    { en: "toast", pt: "brinde" },
    { en: "anniversary", pt: "aniversário" },
    { en: "host", pt: "anfitrião" },
    { en: "venue", pt: "local" }
  ]
};

export function isUntaughtError(err: IdentifiedError): boolean {
  if (!err.last_taught_at) return true;
  if (err.last_error_at && new Date(err.last_error_at).getTime() > new Date(err.last_taught_at).getTime()) {
    return true;
  }
  if ((err.error_count_after_taught || 0) > 0) return true;
  return false;
}

export function getLearnedVocabWords(globalErrors: IdentifiedError[]): string[] {
  const learnedSet = new Set<string>();

  (globalErrors || []).forEach(err => {
    if (err.last_taught_at && !isUntaughtError(err)) {
      if (err.correction) {
        learnedSet.add(err.correction.trim().toLowerCase());
      }
    }
  });

  try {
    const stored = localStorage.getItem('fluent_learned_vocab');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        parsed.forEach((w: string) => {
          if (w && typeof w === 'string') {
            learnedSet.add(w.trim().toLowerCase());
          }
        });
      }
    }
  } catch {}

  try {
    const groupsRaw = localStorage.getItem('fluent_mandatory_vocab_groups');
    if (groupsRaw) {
      const groups = JSON.parse(groupsRaw);
      if (Array.isArray(groups)) {
        groups.forEach((g: any) => {
          if (g.words && Array.isArray(g.words)) {
            g.words.forEach((w: any) => {
              if (w.hasBeenLearned || w.lastTestedAt) {
                if (w.en) learnedSet.add(w.en.trim().toLowerCase());
              }
            });
          }
        });
      }
    }
  } catch {}

  return Array.from(learnedSet);
}

export function getVocabularyWordsForTopic(
  topic: string,
  globalErrors: IdentifiedError[],
  mandatoryGroups?: any[]
): { en: string, pt: string }[] {
  // If this topic matches a mandatory vocabulary group topic, use its words directly!
  if (mandatoryGroups && Array.isArray(mandatoryGroups)) {
    const matchedGroup = mandatoryGroups.find(g => g.topic.toLowerCase().trim() === topic.toLowerCase().trim());
    if (matchedGroup && matchedGroup.words && matchedGroup.words.length > 0) {
      // Prioritize words that have active untaught errors
      const activeErrors = (globalErrors || []).filter(isUntaughtError);
      
      const sortedWords = [...matchedGroup.words].sort((a: any, b: any) => {
        const aHasError = activeErrors.some(err => 
          (err.correction || '').toLowerCase().includes((a.en || '').toLowerCase()) ||
          (err.user_phrase || '').toLowerCase().includes((a.en || '').toLowerCase())
        );
        const bHasError = activeErrors.some(err => 
          (err.correction || '').toLowerCase().includes((b.en || '').toLowerCase()) ||
          (err.user_phrase || '').toLowerCase().includes((b.en || '').toLowerCase())
        );
        if (aHasError && !bHasError) return -1;
        if (!aHasError && bHasError) return 1;
        return 0;
      });

      return sortedWords.map((w: any) => ({
        en: w.en || w.word || '',
        pt: w.pt || w.translation || ''
      })).slice(0, 5); // Ensure maximum of 5 target words
    }
  }

  const defaultWords = TOPIC_WORDS[topic] || [
    { en: "schedule", pt: "agenda" },
    { en: "appointment", pt: "compromisso" },
    { en: "commute", pt: "trajeto" },
    { en: "groceries", pt: "compras de mercado" },
    { en: "deadline", pt: "prazo" }
  ];

  // Pick ONLY active UNTAUGHT vocabulary errors from globalErrors
  const activeVocabErrors = (globalErrors || []).filter(err => {
    if (!isUntaughtError(err)) return false; // Already taught as main topic and no new errors!
    const type = (err.error_type || '').toLowerCase();
    const expl = (err.explanation || '').toLowerCase();
    const isVocab = type.includes('vocab') || type.includes('word') || type.includes('lexic') || expl.includes('vocabulário') || expl.includes('termo') || expl.includes('palavra') || err.is_translator_search;
    const isShort = err.correction && err.correction.split(' ').length <= 3 && err.correction.length <= 25;
    return isVocab && isShort;
  });

  // Only prioritize errors that explicitly relate/belong to this specific topic
  const topicLower = topic.toLowerCase();
  const topicKeywords = topicLower.split(/[\s,.\-()]+/).filter(w => w.length > 3);

  const matchingTopicErrors: { en: string, pt: string }[] = [];
  const seenEn = new Set<string>();

  activeVocabErrors.forEach(err => {
    const enClean = err.correction.trim().toLowerCase();
    if (seenEn.has(enClean)) return;

    const matchesDefault = defaultWords.some(dw => 
      dw.en.toLowerCase() === enClean || enClean.includes(dw.en.toLowerCase()) || dw.en.toLowerCase().includes(enClean)
    );
    const matchesKeyword = topicKeywords.some(kw => 
      enClean.includes(kw) || (err.explanation || '').toLowerCase().includes(kw)
    );

    if (matchesDefault || matchesKeyword) {
      seenEn.add(enClean);
      matchingTopicErrors.push({ en: err.correction.trim(), pt: err.user_phrase.trim() });
    }
  });

  const result: { en: string, pt: string }[] = [];

  // Prioritize up to 3 matching untaught error words
  for (let i = 0; i < Math.min(matchingTopicErrors.length, 3); i++) {
    result.push(matchingTopicErrors[i]);
  }

  // Fill remaining slots with default words
  for (const item of defaultWords) {
    if (result.length >= 5) break;
    const enClean = item.en.toLowerCase();
    if (!seenEn.has(enClean)) {
      seenEn.add(enClean);
      result.push(item);
    }
  }

  // Fallback duplicates if we don't have enough
  for (const item of defaultWords) {
    if (result.length >= 5) break;
    result.push(item);
  }

  return result.slice(0, 5);
}

export const VOCABULARY_TOPICS = [
  "Expressões Idiomáticas do Cotidiano",
  "Vocabulário de Viagens e Aeroportos",
  "Termos de Negócios e Apresentações",
  "Vocabulário de Tecnologia e Inovação",
  "Termos de Culinária e Restaurantes",
  "Vocabulário de Compras e Negociações",
  "Termos de Saúde e Bem-Estar",
  "Vocabulário de Lazer e Entretenimento",
  "Termos de Educação e Mercado de Trabalho",
  "Vocabulário de Meio Ambiente e Clima",
  "Termos de Mídia e Comunicação",
  "Vocabulário de Finanças e Economia",
  "Vocabulário de Relações Sociais e Família",
  "Termos de Arte e Cultura",
  "Vocabulário de Esportes e Exercícios",
  "Vocabulário de Trânsito e Mobilidade Urbana",
  "Termos Jurídicos e Contratos Simples",
  "Vocabulário de Ciência e Descobertas",
  "Termos de Sentimentos e Emoções",
  "Vocabulário de Festas e Celebrações"
];

export const CHUNKS_TOPICS = [
  "Como Concordar e Discordar Educadamente",
  "Expressões para Pedir Esclarecimentos",
  "Estruturas para Dar Opiniões Fortes",
  "Como Iniciar Conversas (Small Talk)",
  "Expressões de Desculpa e Agradecimento",
  "Como Interromper Educadamente",
  "Estruturas de Negociação e Persuasão",
  "Como Expressar Certeza e Dúvida",
  "Frases para Mudar de Assunto",
  "Estruturas para Consolar e Apoiar",
  "Como Fazer Perguntas Educadas",
  "Expressões de Surpresa e Espanto",
  "Como Fazer Recomendações e Conselhos",
  "Estruturas para Conversas Telefônicas",
  "Como Descrever Planos Futuros",
  "Expressões para Encontros Sociais",
  "Como Descrever Experiências Passadas",
  "Estruturas para Argumentação Clara",
  "Como Expressar Preferências e Desejos",
  "Estruturas de Despedida e Fechamento"
];

export function generateWeeklyPlan(
  estimatedMonths: number,
  baselineProficiency: string,
  completedNodesList: string[],
  mandatoryGroups?: any[]
): WeekPlan[] {
  // 1 month is estimated as 4 weeks
  const totalWeeks = Math.max(4, Math.ceil(estimatedMonths * 4));
  const plan: WeekPlan[] = [];
  
  // Continuous balanced alternation between Grammar, Vocabulary, and Blocos de fala
  const types: ('Grammar' | 'Vocabulary' | 'Blocos de fala')[] = ['Grammar', 'Vocabulary', 'Blocos de fala'];
  
  let grammarCount = 0;
  let vocabCount = 0;
  let chunkCount = 0;
  
  const mandatoryTopics = (mandatoryGroups || []).map(g => g.topic);
  
  for (let w = 1; w <= totalWeeks; w++) {
    const contents: WeeklyPlanContent[] = [];
    for (let c = 0; c < 4; c++) {
      const slotIndex = (w - 1) * 4 + c;
      const type = types[slotIndex % 3];
      
      let label = "";
      let nodeId: string | undefined = undefined;
      let completed = false;
      
      if (type === 'Grammar') {
        const node = DEFAULT_NODES[grammarCount % DEFAULT_NODES.length];
        label = node.label;
        nodeId = node.id;
        completed = completedNodesList.includes(node.id);
        grammarCount++;
      } else if (type === 'Vocabulary') {
        // Yield mandatory topics consecutively at the beginning, then standard topics
        if (vocabCount < mandatoryTopics.length) {
          label = mandatoryTopics[vocabCount];
        } else {
          const standardIndex = vocabCount - mandatoryTopics.length;
          label = VOCABULARY_TOPICS[standardIndex % VOCABULARY_TOPICS.length];
        }
        completed = false;
        vocabCount++;
      } else {
        label = CHUNKS_TOPICS[chunkCount % CHUNKS_TOPICS.length];
        completed = false;
        chunkCount++;
      }
      
      contents.push({
        id: `w${w}_c${c + 1}`,
        type,
        label,
        nodeId,
        completed
      });
    }
    
    plan.push({
      weekNumber: w,
      contents
    });
  }
  
  return plan;
}

export function getNextUncompletedLesson(plan: WeekPlan[]): WeeklyPlanContent | null {
  for (const week of plan) {
    for (const content of week.contents) {
      if (!content.completed) {
        return content;
      }
    }
  }
  return null;
}
