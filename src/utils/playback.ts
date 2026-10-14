import { SimCharacter } from '../types';

export interface EventBlock {
  type: 'speech' | 'action';
  text: string;
}

/**
 * Helper to safely extract a string from any property, protecting against non-string types.
 */
const getSafeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(v => getSafeString(v)).join(' ');
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return String(val);
};

/**
 * Calculates typing speed in milliseconds per letter based on character's traits and profile.
 */
export const getCharacterTypingSpeed = (character: SimCharacter | null): number => {
  if (!character) return 35; // Default speed
  const personality = getSafeString(character.personality).toLowerCase();
  const quirks = getSafeString(character.quirks).toLowerCase();
  
  // anxious / fast characters
  if (
    personality.includes('anxious') || personality.includes('ansioso') ||
    personality.includes('excited') || personality.includes('apressado') ||
    quirks.includes('fast') || quirks.includes('rápido') ||
    quirks.includes('nervous') || quirks.includes('nervoso')
  ) {
    return 18; // Fast typing speed
  }
  
  // calm / slow characters
  if (
    personality.includes('calm') || personality.includes('calmo') ||
    personality.includes('relaxed') || personality.includes('paciente') ||
    personality.includes('slow') || quirks.includes('slow') ||
    personality.includes('quiet')
  ) {
    return 55; // Slow typing speed
  }
  
  // emotional/sad characters
  if (
    personality.includes('emotional') || personality.includes('sensível') ||
    personality.includes('sad') || personality.includes('melancholy') ||
    personality.includes('triste')
  ) {
    return 45; // Emotional/hesitant speed
  }
  
  return 35; // Standard speed
};

/**
 * Simple seedable pseudo-random generator
 */
class SeededRandom {
  private seed: number;

  constructor(seedStr: string) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    this.seed = Math.abs(hash) || 123456789;
  }

  // Returns a pseudo-random number between 0 and 1
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  // Returns a pseudo-random integer between min and max (inclusive)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Pick a random element from an array deterministically
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/**
 * Splits a monolithic character response text into an alternating sequence of
 * spoken speech and visual-only physical action blocks.
 */
export function splitTextIntoAtmosphericBlocks(text: string, character: SimCharacter | null): EventBlock[] {
  const blocks: EventBlock[] = [];
  
  // Seed random generator with the text content and character info to make it 100% deterministic
  const rng = new SeededRandom(text + (character?.id || character?.name || ''));
  
  // Regex to match items inside asterisks *...* or brackets [...]
  const regex = /(\*[^*]+\*|\[[^\]]+\])/g;
  const parts = text.split(regex);
  
  const extractedActions: string[] = [];
  const extractedSpeech: string[] = [];
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    
    if ((trimmed.startsWith('*') && trimmed.endsWith('*')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const actionText = trimmed.slice(1, -1).trim();
      if (actionText) {
        extractedActions.push(actionText);
      }
    } else {
      extractedSpeech.push(trimmed);
    }
  });
  
  // Split speech into sentences for natural dialogue blocks
  const sentenceSpeechBlocks: string[] = [];
  extractedSpeech.forEach(speechPart => {
    const sentences = speechPart.match(/[^.!?]+[.!?]+/g) || [speechPart];
    sentences.forEach(s => {
      const sTrim = s.trim();
      if (sTrim) {
        sentenceSpeechBlocks.push(sTrim);
      }
    });
  });
  
  if (sentenceSpeechBlocks.length === 0) {
    return [{ type: 'speech', text }];
  }
  
  // Determine number of action blocks to insert (0 to 4)
  const isShort = text.split(/\s+/).length < 15;
  const personality = getSafeString(character?.personality).toLowerCase();
  const quirks = getSafeString(character?.quirks).toLowerCase();
  const lowerText = text.toLowerCase();
  
  const isEmotional = 
    personality.includes('emotional') || personality.includes('sensível') ||
    personality.includes('romantic') || personality.includes('melancholy') ||
    quirks.includes('nervous') || quirks.includes('nervoso') ||
    lowerText.includes('feel') || lowerText.includes('sorry') || 
    lowerText.includes('sad') || lowerText.includes('happy') || 
    lowerText.includes('worry') || lowerText.includes('love');
    
  let targetActionCount = 1;
  if (isShort) {
    targetActionCount = rng.next() < 0.5 ? 0 : 1;
  } else if (isEmotional) {
    targetActionCount = rng.nextInt(2, 4); // 2, 3, or 4
  } else {
    targetActionCount = rng.next() < 0.25 ? 0 : (rng.next() < 0.6 ? 1 : 2);
  }
  
  // Pool of high-quality Portuguese physical actions
  const poolOfActions = [
    "ajusta os óculos",
    "sorri discretamente",
    "apoia o braço na mesa",
    "cruza os braços",
    "suspira de leve",
    "olha rapidamente pela janela",
    "ajeita o casaco",
    "inclina a cabeça ligeiramente",
    "faz uma breve pausa e sorri",
    "olha nos seus olhos por um instante",
    "gesticula levemente com as mãos",
    "desvia o olhar pensativo",
    "dá de ombros sutilmente",
    "coça o queixo de leve",
    "muda o apoio do corpo de um pé para o outro",
    "assente com a cabeça devagar",
    "umedece os lábios antes de prosseguir",
    "dá um sorriso caloroso",
    "respira fundo por um momento"
  ];
  
  const chosenActions: string[] = [];
  if (extractedActions.length > 0) {
    extractedActions.forEach(act => {
      const lowerAct = act.toLowerCase();
      if (lowerAct.includes('smile')) chosenActions.push('sorri discretamente');
      else if (lowerAct.includes('sigh')) chosenActions.push('suspira de leve');
      else if (lowerAct.includes('nod')) chosenActions.push('assente com a cabeça devagar');
      else if (lowerAct.includes('laugh')) chosenActions.push('ri levemente');
      else if (lowerAct.includes('shrug')) chosenActions.push('dá de ombros sutilmente');
      else if (lowerAct.includes('frown')) chosenActions.push('franze a testa por um momento');
      else if (lowerAct.includes('look away')) chosenActions.push('olha para o lado por um instante');
      else if (lowerAct.includes('glasses')) chosenActions.push('ajusta os óculos');
      else if (lowerAct.includes('arm')) chosenActions.push('cruza os braços');
      else {
        chosenActions.push(act);
      }
    });
  }
  
  while (chosenActions.length < targetActionCount) {
    const randomAction = rng.pick(poolOfActions);
    if (!chosenActions.includes(randomAction)) {
      chosenActions.push(randomAction);
    }
  }
  
  if (chosenActions.length > targetActionCount && targetActionCount > 0) {
    chosenActions.length = targetActionCount;
  } else if (targetActionCount === 0) {
    chosenActions.length = 0;
  }
  
  let sentenceIdx = 0;
  let actionIdx = 0;
  
  while (sentenceIdx < sentenceSpeechBlocks.length || actionIdx < chosenActions.length) {
    if (sentenceIdx < sentenceSpeechBlocks.length) {
      blocks.push({ type: 'speech', text: sentenceSpeechBlocks[sentenceIdx++] });
    }
    
    if (actionIdx < chosenActions.length && (sentenceIdx === sentenceSpeechBlocks.length || rng.next() < 0.7)) {
      blocks.push({ type: 'action', text: chosenActions[actionIdx++] });
    }
  }
  
  return blocks;
}
