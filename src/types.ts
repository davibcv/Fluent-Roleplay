export type AppMode = 'ALIGNMENT' | 'SETUP' | 'CONVERSATION' | 'COURSE' | 'PLANNING' | 'DIFFICULTIES' | 'MENU' | 'DEVELOPER';

export interface IdentifiedError {
  user_phrase: string;
  correction: string;
  error_type: 'Grammar' | 'Vocabulary' | 'Syntax' | string;
  severity_score: number; // 1-10
  explanation: string;
  rating?: 'Excelente' | 'Aceitável' | 'Problemática' | 'Inaceitável';
  timestamp?: string; // added client-side
  is_translator_search?: boolean;
  search_count?: number;
  last_searched_at?: string;
  last_taught_at?: string; // ISO date-time string when taught as a main topic in a lesson
  error_count_after_taught?: number; // count of new occurrences/searches after last_taught_at
  last_error_at?: string; // ISO date-time string of latest difficulty
}

export interface SkillNode {
  id: string;
  label: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  timeEstimation: string;
  category: string;
  dependsOn: string[];
  keywords: string[]; // keywords to match identified errors
}

export interface AdaptationRecord {
  id: string;
  timestamp: string;
  previousFocus: string;
  newFocus: string;
  reason: string; // Detail in Portuguese explaining why
  origin?: 'automática' | 'manual';
  diagnosis?: string;
  changesSummary?: string[];
  addedTopics?: string[];
  removedTopics?: string[];
  anticipatedTopics?: string[];
  postponedTopics?: string[];
  justifications?: { topic: string; justification: string }[];
  nextScheduledDate?: string;
}

export interface PlanScheduleState {
  planCreationDate: string; // ISO date string
  lastAdaptationDate: string; // ISO date string
  nextScheduledDate: string; // ISO date string
}

export const DEFAULT_NODES: SkillNode[] = [
  {
    id: 'present_simple',
    label: 'Present Simple & Concordance',
    description: 'Master auxiliary "do/does", plural/singular alignments (e.g. "she wants" vs "they want"), and static states.',
    tier: 1,
    timeEstimation: '1-2 semanas',
    category: 'Foundation',
    dependsOn: [],
    keywords: ['concordance', 'concordância', 'do', 'does', 'present', 'simple present', 'singular', 'plural', 'verbs']
  },
  {
    id: 'past_simple',
    label: 'Simple Past Conjugation',
    description: 'Conquer standard regular changes (-ed suffix) and common irregular past verbs (e.g. eat -> ate, buy -> bought).',
    tier: 1,
    timeEstimation: '2 semanas',
    category: 'Foundation',
    dependsOn: [],
    keywords: ['past', 'passed', 'simple past', 'passado', 'irregular', 'regular verb', 'did']
  },
  {
    id: 'present_perfect',
    label: 'Present Perfect Mastery',
    description: 'Bridge history with the present, denoting non-specific times, life experiences, and states that persist.',
    tier: 2,
    timeEstimation: '3 semanas',
    category: 'Perfect Tenses',
    dependsOn: ['present_simple', 'past_simple'],
    keywords: ['perfect', 'present perfect', 'have been', 'has been', 'seen', 'done', 'participle', 'particípio', 'had done']
  },
  {
    id: 'prepositions',
    label: 'Prepositional Nuance (In, On, At)',
    description: 'Master the boundaries of spatial and temporal connectors. Avoid confusing "in the bus" with "on the bus".',
    tier: 2,
    timeEstimation: '2 semanas',
    category: 'Structure',
    dependsOn: ['present_simple'],
    keywords: ['preposition', 'preposição', 'in', 'on', 'at', 'into', 'onto', 'by', 'for', 'with', 'about']
  },
  {
    id: 'relative_clauses',
    label: 'Relative Clauses & Linkers',
    description: 'Merge independent phrases fluently using relative terms like "who", "which", "whom", "whose", and "that".',
    tier: 2,
    timeEstimation: '2 semanas',
    category: 'Structure',
    dependsOn: ['present_simple'],
    keywords: ['relative', 'clause', 'connector', 'whom', 'which', 'whose', 'pronome relativo', 'that']
  },
  {
    id: 'third_conditional',
    label: 'Third Conditional & Speculation',
    description: 'Contemplate alternative timelines of past regrets ("If I had known, I would have answered differently").',
    tier: 3,
    timeEstimation: '3 semanas',
    category: 'Moods & Conditionals',
    dependsOn: ['present_perfect'],
    keywords: ['conditional', 'third conditional', 'would have', 'should have', 'could have', 'had been', 'condicional', 'if']
  },
  {
    id: 'subjunctive',
    label: 'Subjunctive Mood hypotheticals',
    description: 'Express mandates, demands, recommendations, and wishes correctly (e.g., "I demand that he be present").',
    tier: 3,
    timeEstimation: '2 semanas',
    category: 'Moods & Conditionals',
    dependsOn: ['third_conditional'],
    keywords: ['subjunctive', 'wish', 'demands', 'be present', 'subjuntivo', 'desejo']
  },
  {
    id: 'passive_voice',
    label: 'Passive Voice & Formality',
    description: 'Shift focus to actions and objects for formal or academic contexts (e.g. "The report was written by authorities").',
    tier: 3,
    timeEstimation: '2 semanas',
    category: 'Voice & Form',
    dependsOn: ['relative_clauses'],
    keywords: ['passive', 'passive voice', 'voice', 'compiled by', 'voz passiva', 'passiva']
  },
  {
    id: 'idiomatic_fluency',
    label: 'Idiomatic & Phrasal Integration',
    description: 'Unleash native fluency by adopting common phrasal verbs, idioms, and figurative vernacular gracefully.',
    tier: 4,
    timeEstimation: '4 semanas',
    category: 'Advanced Mastery',
    dependsOn: ['subjunctive', 'passive_voice'],
    keywords: ['idiom', 'phrasal', 'phrasal verb', 'expression', 'slang', 'gíria', 'expressão idiomática', 'colloquial']
  }
];

export interface PlanningUpdates {
  next_grammatical_focus: string;
  estimated_months_to_fluency_adjustment: string; // e.g., "+3 days" or "-5 days"
}

export interface ConsolidationRecord {
  id: string; // topic node ID
  completedAt: string; // ISO date-time string
  result: 'pass' | 'fail';
}

export interface NarrativeState {
  current_setting: string;
  active_character: string;
}

export interface GeminiResponsePayload {
  current_mode: AppMode;
  identified_errors: IdentifiedError[];
  planning_updates: PlanningUpdates;
  narrative_state: NarrativeState;
}

export interface CourseQuestion {
  id: string;
  question: string;
  options?: string[]; // Multiple choice for Phase 1 & 2
  correctAnswer: string; // Direct text or index
  explanation: string;
}

export interface CoursePhaseState {
  currentPhase: 'THEORY' | 'EASY' | 'MEDIUM' | 'HARD' | 'COMPLETED';
  theoryText: string;
  questions: CourseQuestion[];
  currentQuestionIndex: number;
  score: number;
  userAnswers: string[];
}

export interface AlignmentQuestion {
  id: number;
  question: string;
  difficulty: 'Basic' | 'Intermediate' | 'Complex';
  expectedFocus: string;
}

export interface DailyWishes {
  day: number;
  date: string;
  morning: string[];
  afternoon: string[];
  evening: string[];
  generated_at?: string;
}

export interface SimCharacter {
  id: string;
  name: string;
  temporary_title?: string; // descriptive role like 'Balconista', 'Estropiado', 'Motorista de Táxi'
  name_known?: boolean; // true if the user asked and knows their name
  age: number | string;
  profession: string;
  personality: string;
  quirks: string;
  relationship_level: 'Stranger' | 'Acquaintance' | 'Neighbor/Colleague' | 'Friend' | 'Close Friend';
  relationship_score: number; // 0-100 or higher (e.g. >599)
  memories: string[];
  is_fixed?: boolean;
  encounters_count?: number;
  last_evolved_intimacy?: number;
  raw_material?: string;
  daily_wishes?: DailyWishes;
  daily_wishes_history?: DailyWishes[];
}

export interface SimMessage {
  sender: 'narrator' | 'character' | 'user';
  text: string;
  translation?: string; // Portuguese translation of the character's message
  is_action?: boolean; // true if the message represents an action or gesture instead of spoken dialogue
  character_id?: string;
  character_name?: string;
}

export interface StoryCommitment {
  id: string;
  name: string;
  description: string;
  type: 'compromisso' | 'tarefa' | 'evento' | string;
  day: number;
  startTime: string; // e.g. "10:00 AM" or "03:00 PM"
  endTime: string; // e.g. "11:30 AM" or "04:30 PM"
  duration: number; // in minutes
  priority: 'baixa' | 'media' | 'alta' | string;
  consequences: string;
  status: 'pendente' | 'concluido' | 'perdido' | 'cancelado' | string;
}

export interface SimulatorState {
  city: string;
  date: string;
  day_count: number;
  period: 'Manhã' | 'Tarde' | 'Noite' | 'Madrugada';
  active_place: string;
  narrative_context: string;
  active_character: SimCharacter | null;
  fixed_characters: SimCharacter[];
  dialog_history: SimMessage[];
  current_story_arc: string;
  available_actions: string[];
  time?: string;
  present_characters?: string[];
  directed_to_character?: string | null;
  daily_commitments?: string[];
  daily_objectives?: string[];
  commitments?: StoryCommitment[];
}

export interface WeeklyPlanContent {
  id: string; // e.g. "w1_c1"
  type: 'Grammar' | 'Vocabulary' | 'Blocos de fala';
  label: string;
  nodeId?: string; // Links to DEFAULT_NODES id if type is 'Grammar'
  completed: boolean;
}

export interface WeekPlan {
  weekNumber: number;
  contents: WeeklyPlanContent[];
}


export interface MandatoryVocabularyWord {
  en: string;
  pt: string;
  timesEncountered?: number;
  timesCorrect?: number;
  lastTestedAt?: string;
  hasBeenLearned?: boolean;
}

export interface MandatoryVocabularyGroup {
  topic: string;
  words: MandatoryVocabularyWord[];
}



