import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, MicOff, Volume2, VolumeX, Copy, Check, Users, Calendar, 
  RotateCcw, Keyboard, Send, ChevronRight, Languages, MoreVertical, X, HelpCircle, BookOpen, Clock
} from 'lucide-react';
import { IdentifiedError, SimulatorState, SimCharacter, SimMessage } from '../types';
import ActivePassiveLoader from './ActivePassiveLoader';
import { apiFetch } from '../utils/api';
import { getCharacterTypingSpeed, splitTextIntoAtmosphericBlocks } from '../utils/playback';
import TypingBubble from './TypingBubble';
import { safeLocalStorageSet, deduplicateAndLimitSnapshots, MAX_UNDO_HISTORY_ITEMS } from '../utils/safeStorage';


interface ConversationScreenProps {
  initialReply: string;
  narrativeSetting: string;
  activeCharacter: string;
  baselineProficiency: string;
  nextGrammaticalFocus: string;
  onTrackError: (error: IdentifiedError) => void;
  onTrackStrength?: (strength: { topicId: string; user_phrase: string; topicLabel: string }) => void;
  onUpdatePlan: (focus: string, adjustment: string) => void;
  onSwitchSetting: (newSetting: string) => void;
  onGoBackMenu?: () => void;
  onResetStory?: () => void;
  globalErrors?: IdentifiedError[];
}

const WEEKDAY_NAMES = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo"
];

const WEEKDAY_ABBRS = [
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
  "Dom"
];

function getStoryDateInfo(day: number) {
  const zeroBasedDay = Math.max(0, (day || 1) - 1);
  const dayOfWeekIndex = zeroBasedDay % 7;
  const dayOfWeekName = WEEKDAY_NAMES[dayOfWeekIndex];
  const dayOfWeekAbbr = WEEKDAY_ABBRS[dayOfWeekIndex];
  
  const weekNum = Math.floor(zeroBasedDay / 7) + 1;
  const monthNum = Math.floor(zeroBasedDay / 30) + 1;
  const dayOfMonth = (zeroBasedDay % 30) + 1;
  
  return {
    dayOfWeekName,
    dayOfWeekAbbr,
    weekNum,
    monthNum,
    dayOfMonth,
    day: Math.max(1, day || 1)
  };
}

const getDynamicWaitingMessages = (
  charName: string,
  focus: string,
  setting: string,
  proficiency: string,
  simState: SimulatorState | null
) => {
  const messages: string[] = [];
  
  const placeClean = (simState?.active_place || setting || "").toLowerCase();
  const contextClean = (simState?.narrative_context || "").toLowerCase();
  const period = simState?.period || "Tarde";
  const char = charName || simState?.active_character?.name || "O personagem";
  
  // Clima / Weather detection from context
  const isRainy = contextClean.includes("chuva") || contextClean.includes("chove") || contextClean.includes("rain") || contextClean.includes("tempestade") || contextClean.includes("storm") || placeClean.includes("rain");
  const isCold = contextClean.includes("frio") || contextClean.includes("cold") || contextClean.includes("neve") || contextClean.includes("snow") || contextClean.includes("gelo") || contextClean.includes("winter") || contextClean.includes("inverno");
  const isSunny = contextClean.includes("sol") || contextClean.includes("sun") || contextClean.includes("ensolarado") || contextClean.includes("sunny") || contextClean.includes("calor") || contextClean.includes("hot") || contextClean.includes("verão") || contextClean.includes("summer");
  const isWindy = contextClean.includes("vento") || contextClean.includes("ventando") || contextClean.includes("wind") || contextClean.includes("windy") || contextClean.includes("brisa") || contextClean.includes("breeze");

  // Other present characters
  let otherCharName = "";
  if (simState?.present_characters && simState.present_characters.length > 0) {
    const activeName = simState.active_character?.name || "";
    const filtered = simState.present_characters.filter(
      (n: string) => n && n.toLowerCase() !== activeName.toLowerCase() && n.toLowerCase() !== (charName || "").toLowerCase()
    );
    if (filtered.length > 0) {
      otherCharName = filtered[0];
    }
  }

  // Environment type detection
  const isCafe = placeClean.includes("cafe") || placeClean.includes("café") || placeClean.includes("cafetaria") || placeClean.includes("pub") || placeClean.includes("bar") || placeClean.includes("restaurant") || placeClean.includes("restaurante");
  const isLab = placeClean.includes("laboratorio") || placeClean.includes("laboratório") || placeClean.includes("pesquisa") || placeClean.includes("lab") || placeClean.includes("equipamento") || placeClean.includes("science");
  const isBeach = placeClean.includes("praia") || placeClean.includes("beach") || placeClean.includes("mar") || placeClean.includes("sea") || placeClean.includes("areia") || placeClean.includes("costa");
  const isAirport = placeClean.includes("aeroporto") || placeClean.includes("airport") || placeClean.includes("imigração") || placeClean.includes("terminal") || placeClean.includes("embarque") || placeClean.includes("voo") || placeClean.includes("vôo");
  const isHotel = placeClean.includes("hotel") || placeClean.includes("recepção") || placeClean.includes("reception") || placeClean.includes("lobby");
  const isOffice = placeClean.includes("escritorio") || placeClean.includes("escritório") || placeClean.includes("office") || placeClean.includes("empresa") || placeClean.includes("work") || placeClean.includes("reunião") || placeClean.includes("meeting");
  const isStreetOutdoor = placeClean.includes("rua") || placeClean.includes("street") || placeClean.includes("avenida") || placeClean.includes("road") || placeClean.includes("parque") || placeClean.includes("park") || placeClean.includes("floresta") || placeClean.includes("forest") || placeClean.includes("outdoor") || placeClean.includes("ar livre");

  if (isCafe) {
    messages.push("O vapor da máquina de expresso sobe ao fundo, misturando-se aos murmúrios das mesas próximas.");
    messages.push("Uma colher de metal bate de leve contra uma xícara perto do balcão principal.");
    messages.push("O aroma forte de café moído preenche o ar enquanto o barista limpa o balcão.");
    messages.push("Uma pessoa lê um livro perto da janela, aproveitando a luz do dia.");
    messages.push("A música ambiente em volume baixo se mistura ao barulho sutil de pires empilhados.");
    messages.push("O sol da tarde bate direto na vitrine de doces e pães frescos.");
    messages.push(`${char} mexe na xícara sobre a mesa antes de prosseguir.`);

    if (period === "Noite" || period === "Madrugada") {
      messages.push("As luminárias suspensas mantêm uma luz amarelada sobre as mesas de madeira escura.");
    } else {
      messages.push("A claridade da janela muda ligeiramente conforme as nuvens passam.");
    }

    if (isRainy) {
      messages.push("O som das gotas de chuva contra o vidro da janela abafa o barulho interno.");
    }
    if (isCold) {
      messages.push("O ar quente da cafeteria contrasta com a temperatura baixa da rua.");
    }
  } else if (isLab) {
    messages.push("Tubos de ensaio e amostras com etiquetas adesivas estão organizados sobre a bancada cinza.");
    messages.push("Um equipamento digital pisca luzes amarelas e verdes em silêncio ao fundo.");
    messages.push("Frascos de vidro temperado e ferramentas estão alinhados nas prateleiras metálicas.");
    messages.push("Uma tela de controle exibe dados e gráficos que mudam em intervalos regulares.");
    messages.push("O zumbido do sistema de ventilação artificial preenche todo o espaço.");
    messages.push("A luz fria das lâmpadas fluorescentes reflete nas superfícies de metal polido.");
    messages.push(`${char} olha rápido para o painel principal antes de continuar.`);

    if (isRainy) {
      messages.push("Chove de forma constante do lado de fora da janela de vidro duplo.");
    }
    if (isCold) {
      messages.push("O ar-condicionado mantém a sala fria e com umidade controlada.");
    }
  } else if (isBeach) {
    messages.push("A areia úmida perto da água exibe conchas pequenas e marcas de espuma.");
    messages.push("Alguns guarda-sóis de lona estão fincados na areia em intervalos espaçados.");
    messages.push("O som das ondas que quebram na praia abafa o ruído da avenida próxima.");
    messages.push("Gaivotas voam baixo sobre a água, seguindo a direção do vento.");
    messages.push("Poucas pessoas caminham devagar pela beira da água, olhando o horizonte.");
    messages.push(`${char} olha para o mar por um instante, respirando o ar salgado.`);

    if (isRainy) {
      messages.push("A chuva fina cai direto na água escura, deixando a praia vazia.");
    } else if (isSunny) {
      messages.push("O sol brilha forte no céu sem nuvens, deixando a superfície da água muito reflexiva.");
    }
    if (isCold) {
      messages.push("O vento frio afasta os banhistas, restando apenas caminhantes agasalhados.");
    }
    if (isWindy) {
      messages.push("A brisa forte levanta grãos de areia perto do chão e mexe a vegetação rasteira.");
    }
  } else if (isAirport) {
    messages.push("O painel digital pisca para atualizar os portões de embarque dos voos.");
    messages.push("Fileiras de cadeiras de metal estão ocupadas por passageiros com malas de viagem.");
    messages.push("O som das rodinhas das malas deslizando pelo piso de granito ecoa no saguão.");
    messages.push("Uma voz faz um anúncio rápido nos alto-falantes, antecedida por um toque curto.");
    messages.push("O corredor principal continua movimentado com pessoas carregando mochilas e casacos.");
    messages.push("A vidraça imensa do terminal dá vista direta para os aviões na pista.");
    messages.push(`${char} confere os documentos em mãos por um instante.`);

    if (isRainy) {
      messages.push("Gotas de chuva correm rápidas pelo vidro grosso sob a luz cinzenta do dia.");
    }
  } else if (isHotel) {
    messages.push("O carpete grosso amortece o barulho dos passos no corredor comprido.");
    messages.push("O balcão de recepção tem um pequeno sino de metal fosco ao lado do computador.");
    messages.push("As arandelas na parede emitem uma luz suave, projetando sombras nas cortinas.");
    messages.push("Um carrinho de limpeza com lençóis brancos está estacionado no corredor.");
    messages.push("O som baixo do elevador chegando quebra o silêncio do saguão.");
    messages.push(`${char} aponta com a mão em direção ao balcão de atendimento.`);

    if (period === "Noite" || period === "Madrugada") {
      messages.push("A luz baixa do lobby deixa o ambiente silencioso e tranquilo a essa hora.");
    }
  } else if (isOffice) {
    messages.push("Pastas com documentos impressos e canetas pretas estão organizadas sobre a mesa.");
    messages.push("O monitor do computador projeta um brilho azulado de descanso na divisória.");
    messages.push("A prateleira exibe manuais técnicos e fichários alinhados por ano.");
    messages.push("O silêncio da sala é quebrado apenas pelo sopro contínuo do ar-condicionado.");
    messages.push("Passos ritmados soam no corredor de fora, indicando alguém passando.");
    messages.push(`${char} ajeita as folhas de anotações sobre a mesa.`);

    if (period === "Noite" || period === "Madrugada") {
      messages.push("As luzes principais estão desligadas, restando apenas a iluminação do corredor.");
    } else {
      messages.push("A luz do sol passa pelas persianas semiabertas, desenhando faixas no carpete.");
    }
  } else if (isStreetOutdoor) {
    messages.push("O calçamento de pedras tem pequenas irregularidades com algumas folhas secas acumuladas.");
    messages.push("Carros e ônibus passam na avenida próxima, gerando um ruído contínuo.");
    messages.push("As pessoas caminham com pressa pela calçada larga de concreto.");
    messages.push(`${char} ajusta o casaco enquanto olha o movimento da rua.`);

    if (isRainy) {
      messages.push("A água corre pela sarjeta, refletindo o brilho das luzes no asfalto molhado.");
    } else if (isSunny) {
      messages.push("O sol forte bate direto nas fachadas de concreto dos prédios vizinhos.");
    }

    if (isCold) {
      messages.push("O vento frio joga pequenas folhas secas contra o meio-fio.");
    }
    if (isWindy) {
      messages.push("Os galhos das árvores plantadas na calçada balançam com as rajadas de vento.");
    }
  } else {
    // Default grounded fallback with rich natural detail, fully compliant
    messages.push("O barulho do trânsito lá fora entra abafado pelas frestas da janela.");
    messages.push("A luz bate de lado nos móveis de madeira e metal.");
    messages.push("O vento da janela mexe de leve as folhas de um vaso de plantas.");
    messages.push("Alguém caminha pelo corredor externo, e o som dos passos vai diminuindo.");
    messages.push("O ponteiro de segundos do relógio de parede gira sem fazer barulho.");
    messages.push(`${char} se ajeita no assento e olha rápido ao redor.`);

    if (period === "Manhã") {
      messages.push("A claridade fraca do começo do dia começa a iluminar os cantos do cômodo.");
    } else if (period === "Tarde") {
      messages.push("A luz da tarde projeta sombras compridas no piso.");
    } else {
      messages.push("As lâmpadas do teto projetam luzes e sombras comuns pelas paredes.");
    }

    if (isRainy) {
      messages.push("O barulho abafado da chuva lá fora traz silêncio para dentro do quarto.");
    }
    if (isCold) {
      messages.push("O ar dentro da sala continua agradável e protegido do vento externo.");
    }
  }

  // Intertwine present characters if found (very subtle, non-disruptive)
  if (otherCharName) {
    messages.push(`Próximo dali, ${otherCharName} observa os arredores de forma discreta.`);
    messages.push(`${otherCharName} ajusta a postura de maneira silenciosa, acompanhando o rumo da conversa.`);
    messages.push(`Em silêncio, ${otherCharName} acompanha as movimentações ao redor.`);
  }

  // General character physical actions
  messages.push(`${char} mexe no casaco de forma sutil, olhando o ambiente.`);
  messages.push(`${char} ajusta sua postura de forma discreta.`);

  // Return unique messages
  return Array.from(new Set(messages)).filter(msg => msg && msg.trim() !== "");
};

const cleanNameForCompare = (str: string) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

export default function ConversationScreen({
  initialReply,
  narrativeSetting,
  activeCharacter: initialCharName,
  baselineProficiency,
  nextGrammaticalFocus,
  onTrackError,
  onTrackStrength,
  onUpdatePlan,
  onSwitchSetting,
  onGoBackMenu,
  onResetStory,
  globalErrors
}: ConversationScreenProps) {
  const username = localStorage.getItem('fluent_username') || 'Você';
  
  // 1. Core Simulator state loaded from disk
  const [simState, setSimState] = useState<SimulatorState | null>(() => {
    try {
      const saved = localStorage.getItem('fluent_sim_state');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse simulation state from LocalStorage", e);
    }
    return null;
  });

  // Single source of truth for active character currently in conversation
  const activeChar = simState?.active_character || (() => {
    if (simState?.dialog_history && simState.dialog_history.length > 0) {
      const lastCharMsg = [...simState.dialog_history].reverse().find((m: any) => 
        m && (m.sender === "character" || (m.sender !== "user" && m.sender !== "narrator"))
      );
      if (lastCharMsg) {
        const sId = lastCharMsg.character_id;
        const sName = lastCharMsg.character_name;
        if (sId || sName) {
          const found = simState.fixed_characters?.find((c: any) => {
            if (!c) return false;
            if (sId && c.id === sId) return true;
            if (sName) {
              const cName = (c.name || "").toLowerCase();
              const target = String(sName).toLowerCase();
              return cName === target || cName.includes(target) || target.includes(cName);
            }
            return false;
          });
          if (found) return found;
        }
      }
    }
    return null;
  })();

  // Action History for Undo
  const [stateHistory, setStateHistory] = useState<SimulatorState[]>(() => {
    try {
      const saved = localStorage.getItem('fluent_sim_state_history');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse simulation state history from LocalStorage", e);
    }
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [typingCharacterName, setTypingCharacterName] = useState<string | null>(null);
  const c2cCountRef = useRef(0);
  const [currentWaitingMsg, setCurrentWaitingMsg] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [showKeyboardFallback, setShowKeyboardFallback] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showActionInput, setShowActionInput] = useState(false);
  const [actionInputText, setActionInputText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speakingStatus, setSpeakingStatus] = useState<'idle' | 'recording' | 'processing' | 'speaking'>('idle');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [activeDossierChar, setActiveDossierChar] = useState<SimCharacter | null>(null);
  const [showTranslations, setShowTranslations] = useState<Record<string, boolean>>({});
  const [showTranscriptions, setShowTranscriptions] = useState<Record<string, boolean>>({});
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string>>({});
  const [translatingIndices, setTranslatingIndices] = useState<Record<string, boolean>>({});

  // Playback & sequential presentation states for Stories response
  const [textDisplayMode, setTextDisplayMode] = useState<'audio' | 'text'>(() => {
    try {
      const saved = localStorage.getItem('fluent_text_display_mode');
      return (saved === 'audio' || saved === 'text') ? saved : 'text';
    } catch {
      return 'text';
    }
  });
  const [currentPlaybackMessageIndex, setCurrentPlaybackMessageIndex] = useState<number | null>(null);
  const [playbackBlocks, setPlaybackBlocks] = useState<{ type: 'speech' | 'action'; text: string }[]>([]);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(-1);
  const [isPlaybackActive, setIsPlaybackActive] = useState<boolean>(false);
  const lastProcessedMessageIndexRef = useRef<number>(0);

  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Elegant Popups/Modals state
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState(false);
  const [showDateTimePopup, setShowDateTimePopup] = useState(false);
  const [showDossierPopup, setShowDossierPopup] = useState(false);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [showJourneyInfoPopup, setShowJourneyInfoPopup] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [calendarActiveView, setCalendarActiveView] = useState<'hoje' | 'semana' | 'mes'>('hoje');
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<number>(1);
  const [journeyPopupTab, setJourneyPopupTab] = useState<'geral' | 'job' | 'history'>('geral');

  const [showReprocessConfirm, setShowReprocessConfirm] = useState(false);
  const [reprocessMsgText, setReprocessMsgText] = useState<string>('');
  const [reprocessCopied, setReprocessCopied] = useState(false);
  const [reprocessSaved, setReprocessSaved] = useState(false);

  // Mini Translator State
  const [showMiniTranslator, setShowMiniTranslator] = useState(false);
  const [translatorInput, setTranslatorInput] = useState('');
  const [translatorOutput, setTranslatorOutput] = useState('');
  const [isTranslatingMini, setIsTranslatingMini] = useState(false);

  const miniTranslatorRef = useRef<HTMLDivElement>(null);
  const miniTranslatorToggleRef = useRef<HTMLButtonElement>(null);

  // Click outside listener to close the mini translator
  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (showMiniTranslator) {
        if (
          miniTranslatorRef.current &&
          !miniTranslatorRef.current.contains(event.target as Node) &&
          miniTranslatorToggleRef.current &&
          !miniTranslatorToggleRef.current.contains(event.target as Node)
        ) {
          setShowMiniTranslator(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMiniTranslator]);

  // Auto-translation logic with debounce
  useEffect(() => {
    if (!translatorInput.trim()) {
      setTranslatorOutput('');
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsTranslatingMini(true);
      try {
        const response = await apiFetch('/api/translate-pt-en', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: translatorInput.trim() }),
        });
        if (response.ok) {
          const data = await response.json();
          const translation = data.translation || '';
          setTranslatorOutput(translation);

          // Register as difficulty if there's a valid translation, minimum length of 2, and it's not a duplicate
          if (translation && translation.toLowerCase() !== "translation unavailable" && translatorInput.trim().length >= 2) {
            registerMiniTranslatorDifficulty(translatorInput.trim(), translation);
          }
        }
      } catch (e) {
        console.error("Error translating in mini translator", e);
      } finally {
        setIsTranslatingMini(false);
      }
    }, 600); // 600ms debounce to avoid spamming calls

    return () => clearTimeout(delayDebounceFn);
  }, [translatorInput]);

  const registerMiniTranslatorDifficulty = (portuguese: string, english: string) => {
    const ptTrim = portuguese.trim();
    const enTrim = english.trim();
    if (!ptTrim || !enTrim) return;

    // Create a new vocabulary difficulty record
    const newVocabError: IdentifiedError = {
      user_phrase: ptTrim,
      correction: enTrim,
      error_type: 'Vocabulary',
      severity_score: 3, // Standard severity for lookup vocabulary gaps
      explanation: `Consulta rápida no mini tradutor do Modo Stories para aprender "${ptTrim}".`,
      rating: 'Problemática',
      timestamp: new Date().toISOString(),
      is_translator_search: true,
      search_count: 1,
      last_searched_at: new Date().toLocaleString('pt-BR')
    };

    onTrackError(newVocabError);
  };

  // Active voice setting
  const [selectedVoiceGender, setSelectedVoiceGender] = useState<'female' | 'male'>(() => {
    return (localStorage.getItem('fluent_voice_gender') as 'female' | 'male') || 'female';
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const previousStateRef = useRef<SimulatorState | null>(null);

  // Microphone and MediaRecorder refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);

  // Sync state to local storage
  useEffect(() => {
    if (simState) {
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(simState));
    }
  }, [simState]);

  // Sync state history to local storage
  useEffect(() => {
    const deduplicatedHistory = deduplicateAndLimitSnapshots(stateHistory, MAX_UNDO_HISTORY_ITEMS);
    safeLocalStorageSet('fluent_sim_state_history', JSON.stringify(deduplicatedHistory));
  }, [stateHistory]);

  // Scroll to bottom of dialogue history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simState?.dialog_history, loading]);

  // Rotate Portuguese micro-descriptions/reactions while preparing character speech
  useEffect(() => {
    if (!loading) {
      setCurrentWaitingMsg('');
      return;
    }

    const msgs = getDynamicWaitingMessages(
      initialCharName,
      nextGrammaticalFocus,
      narrativeSetting,
      baselineProficiency,
      simState
    );
    const shuffle = [...msgs].sort(() => 0.5 - Math.random());
    let idx = 0;
    setCurrentWaitingMsg(shuffle[idx % shuffle.length]);

    const interval = setInterval(() => {
      idx++;
      setCurrentWaitingMsg(shuffle[idx % shuffle.length]);
    }, 10000);

    return () => clearInterval(interval);
  }, [loading, initialCharName, nextGrammaticalFocus, narrativeSetting, baselineProficiency, simState]);

  // Handle Text-to-Speech voices and setup
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      };
    }
  }, []);

  // Sequential voice queue system for zero-overlap immersive narration
  const speechQueueRef = useRef<{ text: string; lang: 'en' | 'pt' }[]>([]);
  const isCurrentlySpeakingRef = useRef(false);
  const spokenMessagesCountRef = useRef(0);
  const isFirstHistoryProcessRef = useRef(true);
  const lastActiveCharacterRef = useRef<SimCharacter | null>(null);
  const lastSpokenNarrativeRef = useRef<string>('');

  const applyNewSimState = (nextState: SimulatorState) => {
    const history = nextState?.dialog_history || [];
    const currentLength = history.length;
    const previousLength = simState?.dialog_history?.length || 0;

    if (currentLength > previousLength) {
      const newMessages = history.slice(previousLength);
      
      let playedBack = false;
      newMessages.forEach((msg, idx) => {
        if (msg && msg.sender === 'character' && !msg.is_action) {
          const globalMsgIdx = previousLength + idx;
          
          const character = nextState.active_character || activeChar || lastActiveCharacterRef.current;
          const blocks = splitTextIntoAtmosphericBlocks(msg.text, character);
          
          setPlaybackBlocks(blocks);
          setCurrentPlaybackMessageIndex(globalMsgIdx);
          setActiveBlockIndex(0);
          setIsPlaybackActive(true);
          
          playedBack = true;
        }
      });

      if (playedBack) {
        spokenMessagesCountRef.current = currentLength;
        lastProcessedMessageIndexRef.current = currentLength;
      }
    }

    if (nextState.active_character) {
      lastActiveCharacterRef.current = nextState.active_character;
    } else {
      lastActiveCharacterRef.current = null;
    }

    setSimState(nextState);
  };

  const processSpeechQueue = () => {
    if (!('speechSynthesis' in window) || isCurrentlySpeakingRef.current) return;
    if (speechQueueRef.current.length === 0) {
      setSpeakingStatus('idle');
      return;
    }

    const nextSpeech = speechQueueRef.current.shift()!;
    isCurrentlySpeakingRef.current = true;
    setSpeakingStatus('speaking');

    const cleaned = nextSpeech.text.replace(/\[Narrator:.*?\]/g, "")
                                   .replace(/\*.*?\*/g, "")
                                   .replace(/\(.*?\)/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleaned);

    if (nextSpeech.lang === 'pt') {
      utterance.lang = 'pt-BR';
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt')) || voices.find(v => v.lang.startsWith('es')) || null;
      if (ptVoice) {
        utterance.voice = ptVoice;
      }
    } else {
      utterance.lang = 'en-US';
      const voice = getSimulatedVoice();
      if (voice) {
        utterance.voice = voice;
      }
    }

    utterance.onend = () => {
      isCurrentlySpeakingRef.current = false;
      setTimeout(() => {
        processSpeechQueue();
      }, 350); // micro-pause
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis issue, skipping item:", e);
      isCurrentlySpeakingRef.current = false;
      processSpeechQueue();
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleToggleTranslation = async (key: string, text: string) => {
    if (showTranslations[key]) {
      setShowTranslations(prev => ({ ...prev, [key]: false }));
      return;
    }

    const alreadyResolved = dynamicTranslations[key];
    if (alreadyResolved) {
      setShowTranslations(prev => ({ ...prev, [key]: true }));
      return;
    }

    setTranslatingIndices(prev => ({ ...prev, [key]: true }));
    try {
      const response = await apiFetch('/api/translate-on-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.translation) {
          setDynamicTranslations(prev => ({ ...prev, [key]: data.translation }));
        }
      }
    } catch (err) {
      console.error("Failed to translate on demand:", err);
    } finally {
      setTranslatingIndices(prev => ({ ...prev, [key]: false }));
      setShowTranslations(prev => ({ ...prev, [key]: true }));
    }
  };

  const startSequentialPlayback = (fullText: string, messageIndex: number) => {
    // 1. Stop any ongoing playback and voice
    stopPlayback();
    
    // 2. Parse the text into speech and physical action blocks
    const character = simState?.active_character || lastActiveCharacterRef.current;
    const blocks = splitTextIntoAtmosphericBlocks(fullText, character);
    
    setPlaybackBlocks(blocks);
    setCurrentPlaybackMessageIndex(messageIndex);
    setActiveBlockIndex(0);
    setIsPlaybackActive(true);
  };

  const stopPlayback = () => {
    setIsPlaybackActive(false);
    setCurrentPlaybackMessageIndex(null);
    setPlaybackBlocks([]);
    setActiveBlockIndex(-1);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speakSingleSpeechBlock = (text: string) => {
    if ((window as any).isTutorialActive && !(window as any).bypassTutorialSpeechBlock) return;
    if (!isTTSActive) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const cleaned = text.replace(/\[Narrator:.*?\]/g, "")
                          .replace(/\*.*?\*/g, "")
                          .replace(/\(.*?\)/g, "").trim();
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = 'en-US';
      const voice = getSimulatedVoice();
      if (voice) {
        utterance.voice = voice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const queueSpeech = (text: string, lang: 'en' | 'pt') => {
    if ((window as any).isTutorialActive && !(window as any).bypassTutorialSpeechBlock) return;
    if (!isTTSActive) return;
    speechQueueRef.current.push({ text, lang });
    processSpeechQueue();
  };

  const clearSpeechAndStop = () => {
    speechQueueRef.current = [];
    isCurrentlySpeakingRef.current = false;
    setSpeakingStatus('idle');
    stopPlayback();
    if ((window as any).isTutorialActive && !(window as any).bypassTutorialSpeechBlock) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const reSpeakMessage = (text: string, lang: 'en' | 'pt') => {
    if ((window as any).isTutorialActive && !(window as any).bypassTutorialSpeechBlock) return;
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    speechQueueRef.current = [{ text, lang }];
    isCurrentlySpeakingRef.current = false;
    processSpeechQueue();
  };

  // Speak index & playback controller
  useEffect(() => {
    if (!simState) {
      spokenMessagesCountRef.current = 0;
      isFirstHistoryProcessRef.current = true;
      lastProcessedMessageIndexRef.current = 0;
      lastSpokenNarrativeRef.current = '';
      return;
    }

    if (activeChar) {
      lastActiveCharacterRef.current = activeChar;
      try {
        safeLocalStorageSet('fluent_character', activeChar.name);
      } catch (e) {}
    } else {
      lastActiveCharacterRef.current = null;
      try {
        safeLocalStorageSet('fluent_character', '');
      } catch (e) {}
    }

    if (simState.narrative_context && simState.narrative_context !== lastSpokenNarrativeRef.current) {
      lastSpokenNarrativeRef.current = simState.narrative_context;
    }

    const history = simState.dialog_history || [];
    const currentLength = history.length;

    if (currentLength < spokenMessagesCountRef.current) {
      spokenMessagesCountRef.current = currentLength;
      lastProcessedMessageIndexRef.current = currentLength;
      clearSpeechAndStop();
      return;
    }

    if (currentLength > spokenMessagesCountRef.current) {
      if (isFirstHistoryProcessRef.current) {
        isFirstHistoryProcessRef.current = false;
        spokenMessagesCountRef.current = currentLength;
        lastProcessedMessageIndexRef.current = currentLength;

        if (isTTSActive && currentLength > 0) {
          const lastMsg = history[currentLength - 1];
          if (lastMsg && lastMsg.sender === 'character' && !lastMsg.is_action) {
            queueSpeech(lastMsg.text, 'en');
          }
        }
        return;
      }

      const newMessages = history.slice(spokenMessagesCountRef.current);
      spokenMessagesCountRef.current = currentLength;
      lastProcessedMessageIndexRef.current = currentLength;

      newMessages.forEach((msg, idx) => {
        if (msg && msg.sender === 'character' && !msg.is_action) {
          const globalMsgIdx = currentLength - newMessages.length + idx;
          startSequentialPlayback(msg.text, globalMsgIdx);
        }
      });
    }
  }, [simState?.dialog_history, isTTSActive]);

  // Scroll to bottom during sequential presentation
  useEffect(() => {
    if (isPlaybackActive) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeBlockIndex, isPlaybackActive, playbackBlocks.length]);

  // Advance sequential playback block by block
  useEffect(() => {
    if (!isPlaybackActive || activeBlockIndex < 0 || activeBlockIndex >= playbackBlocks.length) {
      if (isPlaybackActive && activeBlockIndex >= playbackBlocks.length) {
        // Playback completed!
        setIsPlaybackActive(false);
      }
      return;
    }
    
    const currentBlock = playbackBlocks[activeBlockIndex];
    
    if (currentBlock.type === 'action') {
      // It's an action block. Playback it instantly, wait 1500ms, then advance
      const timeout = setTimeout(() => {
        setActiveBlockIndex(prev => prev + 1);
      }, 1500);
      return () => clearTimeout(timeout);
    } else {
      // It's a speech block. Speak it!
      speakSingleSpeechBlock(currentBlock.text);
      // Notice: TypingBubble component will handle the letter-by-letter typing internally,
      // and call its onComplete prop which will advance activeBlockIndex!
    }
  }, [isPlaybackActive, activeBlockIndex, playbackBlocks.length]);

  // Expose a function to trigger initial narrative + character audio for tutorial guide
  useEffect(() => {
    (window as any).triggerInitialStorySpeech = () => {
      if (!simState) return;
      (window as any).bypassTutorialSpeechBlock = true;
      
      // Clear any active tutorial speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      // Reset queues
      speechQueueRef.current = [];
      isCurrentlySpeakingRef.current = false;

      const textsQueued = new Set<string>();

      // 1. Queue Dialog History (English Characters only)
      const history = simState.dialog_history || [];
      history.forEach((msg) => {
        const textTrimmed = msg.text.trim();
        if (textsQueued.has(textTrimmed)) return;

        if (msg.sender === 'character') {
          speechQueueRef.current.push({ text: msg.text, lang: 'en' });
          textsQueued.add(textTrimmed);
        }
      });

      // 3. Process
      processSpeechQueue();
    };

    return () => {
      delete (window as any).triggerInitialStorySpeech;
      delete (window as any).bypassTutorialSpeechBlock;
    };
  }, [simState, isTTSActive]);

  // Voice configurations gender chooser
  const getSimulatedVoice = (): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    if (selectedVoiceGender === 'male') {
      const maleKeywords = ['David', 'Daniel', 'Mark', 'Microsoft David', 'Google UK English Male', 'James'];
      for (const name of maleKeywords) {
        const match = englishVoices.find(v => v.name.includes(name));
        if (match) return match;
      }
    } else {
      const femaleKeywords = ['Zira', 'Samantha', 'Google US English', 'Microsoft Zira', 'Karen', 'Tessa', 'Google UK English Female'];
      for (const name of femaleKeywords) {
        const match = englishVoices.find(v => v.name.includes(name));
        if (match) return match;
      }
    }
    return englishVoices[0] || null;
  };

  const handleGenderToggle = () => {
    const nextGender = selectedVoiceGender === 'female' ? 'male' : 'female';
    setSelectedVoiceGender(nextGender);
    safeLocalStorageSet('fluent_voice_gender', nextGender);
    showToast(`Gênero da voz nativa alterado para: ${nextGender === 'female' ? 'Feminino' : 'Masculino'}`, 'success');
    setShowThreeDotsMenu(false);
  };

  const stopAudioAnalyzer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    setAudioLevel(0);
  };

  const startRecording = async () => {
    try {
      if (!(window as any).isTutorialActive) {
        window.speechSynthesis.cancel();
      }
      setLiveTranscript('');
      setSpeechError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

      const updateLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          sum += dataArrayRef.current[i];
        }
        const level = Math.min(100, Math.round((sum / dataArrayRef.current.length) / 80 * 100));
        setAudioLevel(level);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);

      audioChunksRef.current = [];
      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/ogg' };
        if (!MediaRecorder.isTypeSupported('audio/ogg')) {
          options = { mimeType: 'audio/mp4' };
          if (!MediaRecorder.isTypeSupported('audio/mp4')) {
            options = { mimeType: '' };
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setSpeakingStatus('processing');
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size === 0) {
          showToast("Não conseguimos captar sua voz. Tente falar novamente.", "error");
          setSpeakingStatus('idle');
          return;
        }

        try {
          const response = await apiFetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: audioBlob
          });

          if (!response.ok) throw new Error('Falha na conexão do áudio');
          const data = await response.json();
          const text = data.text || '';

          if (text.trim()) {
            submitAction('talk', text);
          } else {
            showToast("Não compreendemos sua fala em inglês. Tente falar mais lentamente ou use o teclado.", "error");
            setSpeakingStatus('idle');
          }
        } catch (e) {
          console.error("Transcription error:", e);
          setSpeakingStatus('idle');
        }
      };

      mediaRecorder.start(200);
      isRecordingRef.current = true;
      setIsRecording(true);
      setSpeakingStatus('recording');
    } catch (err: any) {
      console.error(err);
      setSpeechError(err.name || "not-allowed");
      setSpeakingStatus('idle');
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      stopAudioAnalyzer();
    } else {
      startRecording();
    }
  };

  const handleC2CFollowUp = async (currentState: any) => {
    if (!currentState) return;
    const nextRecipient = currentState.directed_to_character;
    if (!nextRecipient) {
      setTypingCharacterName(null);
      return;
    }

    const target = cleanNameForCompare(nextRecipient);

    // Find the recipient character in fixed_characters to be set as the new active character
    let recipientChar = currentState.fixed_characters?.find((c: any) => {
      if (!c) return false;
      const cId = cleanNameForCompare(String(c.id || ""));
      const cName = cleanNameForCompare(String(c.name || ""));
      const cTitle = cleanNameForCompare(String(c.temporary_title || ""));
      
      return (
        cId === target ||
        cName === target ||
        cTitle === target ||
        cName.includes(target) ||
        target.includes(cName) ||
        (cTitle && (cTitle.includes(target) || target.includes(cTitle)))
      );
    });

    // Smart C2C Fallback: If recipientChar is not found OR nextRecipient matches a group term
    const groupTerms = ["everyone", "all", "team", "todos", "grupo", "comunidade", "colleagues", "galera", "pessoal", "the team", "the guys"];
    const isGroupTerm = groupTerms.some(term => target.includes(term) || term.includes(target));

    if (isGroupTerm) {
      console.log(`[C2C Fallback] Recipient "${nextRecipient}" is a group. Attempting to select an alternate present/fixed character.`);
      
      const currentActiveId = currentState.active_character?.id;
      const currentActiveName = currentState.active_character?.name ? cleanNameForCompare(currentState.active_character.name) : "";
      
      // Look for present characters (other than the active speaker and the user)
      const eligibleNames = currentState.present_characters || [];
      const cleanStudentName = cleanNameForCompare(localStorage.getItem('fluent_username') || 'Davi');
      
      const candidateNames = eligibleNames.filter((name: string) => {
        if (!name) return false;
        const cn = cleanNameForCompare(name);
        return cn !== cleanStudentName && cn !== currentActiveName && !cn.includes("narrator") && !cn.includes("user");
      });

      // Try to find a character from candidateNames first
      let selectedChar = null;
      for (const name of candidateNames) {
        const cleanN = cleanNameForCompare(name);
        selectedChar = currentState.fixed_characters?.find((c: any) => {
          if (!c || c.id === currentActiveId) return false;
          const cName = cleanNameForCompare(c.name || "");
          const cTitle = cleanNameForCompare(c.temporary_title || "");
          return cName.includes(cleanN) || cleanN.includes(cName) || (cTitle && (cTitle.includes(cleanN) || cleanN.includes(cTitle)));
        });
        if (selectedChar) break;
      }

      // If no present character matched, look for ANY other character in fixed_characters that is not the active one
      if (!selectedChar) {
        selectedChar = currentState.fixed_characters?.find((c: any) => {
          return c && c.id !== currentActiveId;
        });
      }

      if (selectedChar) {
        recipientChar = selectedChar;
        console.log(`[C2C Fallback] Selected alternative character "${recipientChar.name}" as recipient.`);
      }
    }

    if (!recipientChar) {
      console.log(`[C2C] Recipient character "${nextRecipient}" not found in fixed_characters.`);
      setTypingCharacterName(null);
      return;
    }

    // Ensure the recipient is in present_characters, or mentioned in the last dialogue message, or is a valid fixed character
    const lastMsgText = currentState.dialog_history?.[currentState.dialog_history.length - 1]?.text || "";
    const isMentioned = lastMsgText.toLowerCase().includes(nextRecipient.toLowerCase()) || 
                        nextRecipient.toLowerCase().includes(lastMsgText.toLowerCase());

    const isPresent = (currentState.present_characters?.some((name: string) => {
      if (!name) return false;
      const cleanName = cleanNameForCompare(name);
      return cleanName.includes(target) || target.includes(cleanName);
    })) || isMentioned;

    if (!isPresent) {
      // Graceful fallback: we still log a warning but proceed because the recipient is a valid fixed_character
      console.log(`[C2C] Recipient ${nextRecipient} is not explicitly in present_characters, but is a valid fixed character. Proceeding anyway to keep simulation alive.`);
    }

    if (c2cCountRef.current >= 2) {
      console.log(`[C2C] Maximum consecutive character-to-character turns reached. Returning to user.`);
      setTypingCharacterName(null);
      return;
    }

    // Increment consecutive C2C turns count
    c2cCountRef.current += 1;

    // Get the last dialogue history message text (which is the message to respond to)
    const lastMsg = currentState.dialog_history?.[currentState.dialog_history.length - 1];
    if (!lastMsg || lastMsg.sender === 'user') {
      console.log(`[C2C] No valid last message to respond to.`);
      setTypingCharacterName(null);
      return;
    }

    // Wait a short duration (natural typing feel) before making the API call
    setLoading(true);
    setSpeakingStatus('idle');
    setTypingCharacterName(recipientChar.name_known ? recipientChar.name : (recipientChar.temporary_title || "Personagem"));

    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      // Prepare the payload state
      // We swap the active_character to the recipient character!
      const payloadState = {
        ...currentState,
        active_character: recipientChar
      };

      let localManuals = null;
      try {
        const raw = localStorage.getItem('fluent_developer_manuals');
        if (raw) localManuals = JSON.parse(raw);
      } catch (e) {}

      const response = await apiFetch('/api/simulator-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: payloadState,
          userMessage: lastMsg.text, // The prompt is Character A's message
          actionType: 'talk',
          chosenTravelDestination: '',
          nextGrammaticalFocus,
          baselineProficiency,
          developer_manuals: localManuals,
          username: localStorage.getItem('fluent_username') || 'Davi',
          isCharacterToCharacter: true,
          c2cSenderName: currentState.active_character?.name || "Personagem",
          c2cRecipientName: recipientChar.name
        })
      });

      if (!response.ok) {
        throw new Error("Erro na ponte de simulação C2C.");
      }

      const result = await response.json();
      applyNewSimState(result.state);

      // Recursive check for further follow-up if needed (limited by c2cCountRef)
      if (result.state?.directed_to_character) {
        setTypingCharacterName(null);
        setLoading(false);
        setSpeakingStatus('idle');
        setTimeout(() => {
          handleC2CFollowUp(result.state);
        }, 2000);
      } else {
        setTypingCharacterName(null);
        setLoading(false);
        setSpeakingStatus('idle');
      }

    } catch (err) {
      console.error("[C2C Error]", err);
      setTypingCharacterName(null);
      setLoading(false);
      setSpeakingStatus('idle');
    }
  };

  const submitAction = async (actionType: 'talk' | 'travel' | 'rest', userMsg?: string, destName?: string, forceReprocess?: boolean) => {
    if (!simState || loading) return;

    safeLocalStorageSet('fluent_recommendation_last_action', 'story');

    setLoading(true);
    setSpeakingStatus('idle');
    
    // Set the typing character name to the active character who is about to respond
    if (activeChar) {
      setTypingCharacterName(activeChar.name_known ? activeChar.name : (activeChar.temporary_title || "Personagem"));
    } else {
      setTypingCharacterName("Narrador");
    }

    c2cCountRef.current = 0; // Reset consecutive character dialogues on user input
    
    let nextC2CState: any = null;
    let optimHistory = [...simState.dialog_history];
    let isRetry = false;

    if (forceReprocess) {
      const lastUserIdx = optimHistory.reduce((lastIdx, msg, idx) => {
        if (!msg) return lastIdx;
        const msgIsChar = msg.sender === 'character' || (msg.sender !== 'user' && msg.sender !== 'narrator');
        const msgText = msg.text || '';
        const msgIsAction = !msgIsChar && (msgText.startsWith('[Ação:') || msgText.startsWith('[Ação '));
        if (msg.sender === 'user' && !msgIsAction) {
          return idx;
        }
        return lastIdx;
      }, -1);
      
      if (lastUserIdx !== -1) {
        optimHistory = optimHistory.slice(0, lastUserIdx + 1);
        isRetry = true;
      }
    } else {
      const lastMsg = optimHistory[optimHistory.length - 1];
      isRetry = lastMsg && lastMsg.sender === 'user' && lastMsg.text === userMsg;
    }

    if (actionType === 'talk' && userMsg && !isRetry) {
      optimHistory.push({ sender: 'user', text: userMsg });
    }

    if (userMsg && userMsg.trim()) {
      let cleanMsg = userMsg.trim();
      if (cleanMsg.startsWith('[Ação: ') && cleanMsg.endsWith(']')) {
        cleanMsg = cleanMsg.slice(7, -1).trim();
      }
      try {
        safeLocalStorageSet('fluent_last_user_message', cleanMsg);
      } catch (e) {}
    }

    const payloadState = {
      ...simState,
      dialog_history: optimHistory
    };

    setSimState(prev => prev ? { ...prev, dialog_history: optimHistory } : null);

    let localManuals = null;
    try {
      const raw = localStorage.getItem('fluent_developer_manuals');
      if (raw) localManuals = JSON.parse(raw);
    } catch (e) {}

    try {
      const response = await apiFetch('/api/simulator-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: payloadState,
          userMessage: userMsg || '',
          actionType,
          chosenTravelDestination: destName || '',
          nextGrammaticalFocus,
          baselineProficiency,
          developer_manuals: localManuals,
          username: localStorage.getItem('fluent_username') || 'Davi'
        })
      });

      if (!response.ok) {
        throw new Error("Erro na ponte de simulação.");
      }

      const result = await response.json();
      nextC2CState = result.state;
      
      if (simState) {
        setStateHistory(prev => deduplicateAndLimitSnapshots([...prev, simState], MAX_UNDO_HISTORY_ITEMS));
      }
      
      applyNewSimState(result.state);

      if ((window as any).isTutorialActive && typeof (window as any).onTutorialUserReplied === 'function') {
        (window as any).onTutorialUserReplied();
      }

      const errors: IdentifiedError[] = result.identified_errors || [];
      if (errors.length > 0) {
        errors.forEach((err) => {
          const stampedError = { ...err, timestamp: new Date().toLocaleTimeString() };
          onTrackError(stampedError);
        });
      }

      const strengths = result.identified_strengths || [];
      if (strengths.length > 0 && onTrackStrength) {
        strengths.forEach((str: any) => {
          onTrackStrength({
            topicId: str.structure_used,
            user_phrase: str.user_phrase,
            topicLabel: str.topic_label
          });
        });
      }

    } catch (err: any) {
      console.error(err);
      showToast("Não foi possível processar a ação. Ocorreu um erro temporário.", "error");
      if (userMsg) {
        let cleanMsg = userMsg.trim();
        if (cleanMsg.startsWith('[Ação: ') && cleanMsg.endsWith(']')) {
          cleanMsg = cleanMsg.slice(7, -1).trim();
        }
        setReprocessMsgText(cleanMsg);
        setReprocessCopied(false);
        setReprocessSaved(false);
        setShowReprocessConfirm(true);
      }
    } finally {
      setLoading(false);
      setSpeakingStatus('idle');
      setInputText('');
      setTypingCharacterName(null);
    }

    if (nextC2CState && nextC2CState.directed_to_character) {
      setTimeout(() => {
        handleC2CFollowUp(nextC2CState);
      }, 2000);
    }
  };

  const handleKeyboardSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (showActionInput) {
      const trimText = actionInputText.trim();
      if (trimText && !loading) {
        submitAction('talk', `[Ação: ${trimText}]`);
        setActionInputText('');
        setShowActionInput(false);
      }
    } else {
      const trimText = inputText.trim();
      if (trimText && !loading) {
        submitAction('talk', trimText);
        setInputText('');
      }
    }
  };

  const handleCopyNarrative = () => {
    if (!simState) return;
    const dialogueLines = simState.dialog_history.map(
      msg => `${msg.sender.toUpperCase()}: ${msg.text}`
    ).join("\n");
    navigator.clipboard.writeText(dialogueLines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUndoAction = () => {
    if (stateHistory.length === 0) {
      showToast("Nenhuma ação anterior registrada para voltar.", "info");
      return;
    }

    const previousState = stateHistory[stateHistory.length - 1];
    
    // Pop the last state from history
    setStateHistory(prev => prev.slice(0, prev.length - 1));
    
    // Apply previous state
    setSimState(previousState);
    
    // Stop speaking, playing audio or recording
    clearSpeechAndStop();
    
    // Clear ephemeral inputs
    setInputText('');
    setActionInputText('');
    setLiveTranscript('');
    setSpeakingStatus('idle');
  };

  const handleFullResetSimulator = () => {
    clearSpeechAndStop();
    if (onResetStory) {
      onResetStory();
    } else {
      const confirmChoice = window.confirm("Isso vai fazer que uma nova jornada se inicia. Confirmar / Cancelar");
      if (confirmChoice) {
        localStorage.removeItem('fluent_sim_state');
        localStorage.removeItem('fluent_sim_state_history');
        localStorage.removeItem('fluent_story_loaded');
        localStorage.removeItem('fluent_setting');
        localStorage.removeItem('fluent_character');
        localStorage.removeItem('fluent_init_reply');
        safeLocalStorageSet('fluent_app_mode', 'MENU');
        window.location.reload();
      }
    }
  };

  if (!simState) {
    return (
      <ActivePassiveLoader 
        title="Carregando cenário e imigração..."
        subtitle="Organizando os diálogos locais e estabelecendo o contexto geográfico da sua imersão."
      />
    );
  }

  // Time labels mappings
  const timeInfoMap: Record<string, { label: string; icon: string }> = {
    'Manhã': { label: 'Manhã', icon: '🌅' },
    'Tarde': { label: 'Tarde', icon: '☀️' },
    'Noite': { label: 'Noite', icon: '🌙' },
    'Madrugada': { label: 'Madrugada', icon: '🌌' }
  };
  const timeInfo = timeInfoMap[simState.period] || { label: simState.period, icon: '🕒' };

  return (
    <div className="max-w-2xl mx-auto py-4 px-3 md:px-0 min-h-[85vh] flex flex-col justify-between relative">
      
      {/* ============================================================= */}
      {/* HEADER DE STORIES                                             */}
      {/* ============================================================= */}
      <header className="flex items-center justify-between border-b border-[#e8e2d5] pb-4 mb-5">
        <div className="flex items-center gap-3">
          {onGoBackMenu && (
            <button
               id="conversation_back_menu"
              onClick={() => {
                clearSpeechAndStop();
                onGoBackMenu();
              }}
              className="px-2.5 py-1.5 rounded-lg border border-[#e2dacb] hover:bg-[#FAF6EE] text-xs text-[#7d715e] transition-colors cursor-pointer"
            >
              ← Menu
            </button>
          )}
          <div id="conversation_character_header">
            <h1 className="text-xl font-serif font-semibold text-emerald-900 tracking-tight leading-none">
              Stories
            </h1>
            <p className="text-[11px] text-[#8e8574] leading-normal font-sans tracking-wide mt-1">
              {simState.city} • <strong className="font-medium text-classic-ink">{simState.active_place}</strong>
            </p>
          </div>
        </div>

        {/* Dynamic header options aligned closely */}
        <div className="relative flex items-center gap-2">
          
          {/* Calendar and Time popup toggle */}
          <button
            id="conversation_date_badge"
            onClick={() => {
              setCalendarActiveView('hoje');
              setCalendarSelectedDay(simState.day_count || 1);
              setShowDateTimePopup(true);
            }}
            className="px-3 h-8 rounded-full border border-[#e2dacb] hover:bg-[#FAF6EE] hover:border-amber-400/60 flex items-center gap-1.5 text-xs text-[#5c4f3c] font-mono font-semibold transition-all shadow-2xs tracking-tight cursor-pointer bg-[#FAF6EE]/50 animate-fade-in"
            title="Hora e Data da Simulação"
          >
            <span className="text-sm">{timeInfo.icon}</span>
            <span className="text-[11px] font-sans font-semibold tracking-normal text-[#5c4f3c]">{simState.time || "08:00 AM"}</span>
          </button>

          {/* Voice Native Toggle Button */}
          <button
            onClick={() => setIsTTSActive(!isTTSActive)}
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              isTTSActive 
                ? 'bg-amber-50 border-[#dfcbb0] text-classic-gold' 
                : 'bg-rose-50 border-rose-200 text-rose-500 line-through'
            }`}
            title={isTTSActive ? "Voz nativa ativa" : "Voz nativa desativada"}
          >
            {isTTSActive ? "🔊" : "🔇"}
          </button>

          {/* Audio vs Transcription Mode Toggle Button */}
          <button
            onClick={() => {
              const nextMode = textDisplayMode === 'audio' ? 'text' : 'audio';
              setTextDisplayMode(nextMode);
              safeLocalStorageSet('fluent_text_display_mode', nextMode);
              showToast(`Modo alterado para: ${nextMode === 'audio' ? 'Apenas Áudio' : 'Transcrição Direta'}`, 'success');
            }}
            className={`h-8 px-2.5 rounded-full border flex items-center gap-1.5 transition-all text-[11px] font-semibold cursor-pointer ${
              textDisplayMode === 'audio'
                ? 'bg-amber-50 border-[#dfcbb0] text-classic-gold shadow-2xs'
                : 'bg-[#FAF6EE] border-[#e2dacb] text-[#5c4f3c] hover:bg-[#FAF6EE] shadow-2xs'
            }`}
            title={textDisplayMode === 'audio' ? "Modo Áudio ativo (as falas são narradas por áudio, sem exibição do texto)" : "Modo Transcrição ativo (as falas são exibidas diretamente escritas)"}
          >
            {textDisplayMode === 'audio' ? (
              <>
                <span className="text-xs">🎧</span>
                <span>Modo Áudio</span>
              </>
            ) : (
              <>
                <span className="text-xs">✍️</span>
                <span>Modo Transcrição</span>
              </>
            )}
          </button>

          {/* Contacts dossier button trigger */}
          <button
            id="conversation_contacts_btn"
            onClick={() => setShowDossierPopup(true)}
            className="w-8 h-8 rounded-full border border-[#e2dacb] hover:bg-[#FAF6EE] flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Dossiê de relacionamentos"
          >
            <span className="text-sm">👥</span>
          </button>

          {/* Botão Desfazer/Voltar uma ação */}
          <button
            id="conversation_undo_btn"
            onClick={handleUndoAction}
            disabled={stateHistory.length === 0 || loading}
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
              stateHistory.length > 0 && !loading
                ? 'border-[#e2dacb] bg-[#FAF6EE]/80 text-[#8b7558] hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 active:scale-95' 
                : 'border-dashed border-gray-200 bg-gray-50/30 text-gray-300 cursor-not-allowed'
            }`}
            title={stateHistory.length > 0 ? `Desfazer última ação (${stateHistory.length} disponíveis)` : "Nenhuma ação para desfazer"}
          >
            <RotateCcw className="w-3.5 h-3.5 animate-duration-1000" />
          </button>

          {/* Triple dot menu toggle */}
          <div className="relative">
            <button
              id="conversation_threedots_btn"
              onClick={() => setShowThreeDotsMenu(!showThreeDotsMenu)}
              className="w-8 h-8 rounded-full border border-[#e2dacb] hover:bg-[#FAF6EE] flex items-center justify-center text-[#7d715e] transition-colors cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            {showThreeDotsMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowThreeDotsMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e8e2d5] rounded-xl shadow-lg z-40 py-2 text-xs text-classic-ink animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowJourneyInfoPopup(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#FAF6EE] transition-colors flex items-center gap-2"
                  >
                    📝 Informações da Jornada
                  </button>
                  <button
                    onClick={handleGenderToggle}
                    className="w-full text-left px-4 py-2 hover:bg-[#FAF6EE] transition-colors flex items-center gap-2"
                  >
                    🗣️ Alterar Voz ({selectedVoiceGender === 'female' ? 'Feminina' : 'Masculina'})
                  </button>
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowHelpPopup(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#FAF6EE] transition-colors flex items-center gap-2"
                  >
                    ❓ Ajuda & Guia
                  </button>
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      handleUndoAction();
                    }}
                    disabled={stateHistory.length === 0 || loading}
                    className={`w-full text-left px-4 py-2 transition-colors flex items-center gap-2 ${
                      stateHistory.length > 0 && !loading
                        ? 'hover:bg-[#FAF6EE] text-[#5c4f3c] cursor-pointer'
                        : 'text-gray-300 cursor-not-allowed'
                    }`}
                    title="Volta um comando para onde estava antes, including hora e dia"
                  >
                    ↩️ Desfazer Última Ação {stateHistory.length > 0 ? `(${stateHistory.length})` : ''}
                  </button>
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setSimState(prev => {
                        if (!prev) return prev;
                        if (prev.survival_mode) {
                          return { ...prev, survival_mode: false };
                        } else {
                          const updated = { ...prev, survival_mode: true };
                          if (!prev.survival_initialized) {
                            updated.survival_initialized = true;
                            updated.money = 20000;
                            updated.hunger = "Muito satisfeito";
                            updated.financial_history = [];
                            updated.rent_amount = 1500;
                            
                            // Client-side helper to calculate initial last meal absolute minutes
                            const parseTimeToMinutesLocal = (tStr: string) => {
                              const clean = tStr.replace(/[^0-9a-zA-Z:]/g, "").toUpperCase();
                              const isPM = clean.includes("PM");
                              const isAM = clean.includes("AM");
                              const timeOnly = clean.replace("AM", "").replace("PM", "");
                              const parts = timeOnly.split(":");
                              let hrs = parseInt(parts[0], 10) || 8;
                              const mins = parseInt(parts[1], 10) || 0;
                              if (isPM && hrs < 12) {
                                hrs += 12;
                              } else if (isAM && hrs === 12) {
                                hrs = 0;
                              }
                              return hrs * 60 + mins;
                            };
                            const getAbsoluteMinuteLocal = (day: number, timeStr: string) => {
                              return ((day || 1) - 1) * 1440 + parseTimeToMinutesLocal(timeStr);
                            };
                            updated.last_meal_absolute_minute = getAbsoluteMinuteLocal(prev.day_count || 1, prev.time || "12:00 PM");

                            const parts = (prev.date || "15 de Junho").toLowerCase().split("de");
                            const currentMonth = parts.length > 1 ? parts[1].trim() : "Junho";
                            updated.last_rent_paid_month = currentMonth;
                            updated.job = null;
                            
                            const econName = (prev.city || "").toLowerCase();
                            const symbol = (econName.includes("ireland") || econName.includes("limerick") || econName.includes("germany") || econName.includes("frankfurt")) ? "€" : "$";
                            
                            updated.dialog_history = [
                              ...(prev.dialog_history || []),
                              {
                                sender: "narrator",
                                text: `[Sobrevivência: Modo Sobrevivência Ativado! Concedido saldo inicial de ${symbol}20.000, moradia com aluguel mensal de ${symbol}1.500 (Vencimento todo dia 5) e alimentação completa.]`,
                                is_action: true
                              }
                            ];
                          }
                          return updated;
                        }
                      });
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#FAF6EE] text-amber-700 transition-colors flex items-center gap-2 font-medium"
                  >
                    {simState.survival_mode ? "🕊️ Desativar Sobrevivência" : "⚡ Ativar Sobrevivência"}
                  </button>
                  <hr className="my-1 border-[#FAF6EE]" />
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      handleFullResetSimulator();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 font-medium transition-colors flex items-center gap-2"
                  >
                    🔄 Reiniciar Jornada
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </header>



      {/* ============================================================= */}
      {/* AREA DE CONVERSA PRINCIPAL (DOMINANTE)                         */}
      {/* ============================================================= */}
      <div className="flex-1 bg-white border border-[#e8e2d5] rounded-3xl p-5 md:p-6 shadow-sm flex flex-col justify-between min-h-[460px] relative">
        
        {/* Dialogue scroll panel */}
        <div className="space-y-4 max-h-[390px] overflow-y-auto pr-1 pb-4 flex-1">
          
          {/* Message bubbles list */}
          {(simState.dialog_history || []).map((msg, i) => {
            if (!msg) return null;
            const msgText = msg.text || '';
            const msgSender: string = msg.sender || '';

            if (msgSender === 'narrator') {
              if (activeChar || i !== simState.dialog_history.length - 1) {
                return null;
              }
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#FAF6EE]/50 border-l-2 border-slate-300 p-4 rounded-xl text-xs text-[#7d715e] italic leading-relaxed"
                >
                  <span className="text-slate-400 font-mono text-[9px] font-bold uppercase block mb-1">
                    Cena
                  </span>
                  {msgText}
                </motion.div>
              );
            }

            const isChar = msgSender === 'character' || (msgSender !== 'user' && msgSender !== 'narrator');
            const isCharAction = isChar && !!msg.is_action;
            const isAction = !isChar && (msgText.startsWith('[Ação:') || msgText.startsWith('[Ação '));
            const actionCleanText = isAction ? msgText.replace(/^\[Ação:\s*|\]$/gi, '').trim() : '';

            let charReference = activeChar || lastActiveCharacterRef.current;
            const senderId = msg.character_id || msg.character_name || (msgSender !== 'character' && msgSender !== 'user' && msgSender !== 'narrator' ? msgSender : null);
            if (senderId) {
              const target = cleanNameForCompare(String(senderId));
              const foundChar = simState.fixed_characters?.find((c: any) => {
                if (!c) return false;
                const cId = cleanNameForCompare(String(c.id || ""));
                const cName = cleanNameForCompare(String(c.name || ""));
                const cTitle = cleanNameForCompare(String(c.temporary_title || ""));
                return (
                  cId === target ||
                  cName === target ||
                  cTitle === target ||
                  cName.includes(target) ||
                  target.includes(cName) ||
                  (cTitle && (cTitle.includes(target) || target.includes(cTitle)))
                );
              });
              if (foundChar) {
                charReference = foundChar;
              }
            }
            const charRelationship = charReference?.relationship_level || 'Stranger';
            const charDisplayName = isAction
              ? "Gesto / Ação"
              : isChar 
                ? `${charReference?.name_known ? charReference.name : (charReference?.temporary_title || "Personagem")}${isCharAction ? " (Ação)" : ""}`
                : `${username || "Você"}`;

            const isLastMessage = i === simState.dialog_history.length - 1;
            const lastUserIdx = simState.dialog_history.reduce((lastIdx, m, idx) => {
              if (!m) return lastIdx;
              const mIsChar = m.sender === 'character' || (m.sender !== 'user' && m.sender !== 'narrator');
              const mText = m.text || '';
              const mIsAction = !mIsChar && (mText.startsWith('[Ação:') || mText.startsWith('[Ação '));
              if (m.sender === 'user' && !mIsAction) {
                return idx;
              }
              return lastIdx;
            }, -1);
            const showRetryOnUser = i === lastUserIdx && !loading;

            // SPECIAL INTERCEPTION FOR ACTIVE PLAYBACK OF NEW RESPONSES
            if (i === currentPlaybackMessageIndex && isPlaybackActive) {
              const playbackElement = (
                <div key={i} className="space-y-4">
                  {playbackBlocks.slice(0, activeBlockIndex + 1).map((block, bIdx) => {
                    const blockKey = `${i}-${bIdx}`;
                    const isLastBlock = bIdx === activeBlockIndex;
                    
                    if (block.type === 'action') {
                      return (
                        <motion.div
                          key={`block-act-${bIdx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4 }}
                          className="flex justify-start"
                        >
                          <div className="max-w-[85%] rounded-2xl p-3 text-xs font-sans relative bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-tl-none font-serif italic shadow-2xs">
                            <div className="flex items-center gap-1.5 mb-1 text-emerald-950">
                              <span className="text-[12px]">🏃</span>
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Ação Física</span>
                            </div>
                            <p className="font-serif leading-relaxed">
                              {block.text}
                            </p>
                          </div>
                        </motion.div>
                      );
                    } else {
                      return (
                        <motion.div
                          key={`block-speech-${bIdx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4 }}
                          className="flex justify-start"
                        >
                          <div className="max-w-[85%] rounded-2xl p-4 text-sm font-sans relative bg-classic-cream border border-[#e2dacb] text-classic-ink rounded-tl-none shadow-2xs">
                            <div className="flex items-center justify-between gap-4 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-classic-gold">
                                  {charDisplayName}
                                </span>
                                {charReference && (
                                  <span className="text-[8px] bg-amber-50 border border-[#dfcbb0] px-1 rounded text-classic-gold font-mono">
                                    {charRelationship}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reSpeakMessage(block.text, 'en');
                                }}
                                className="p-0.5 rounded text-[#8e8574] hover:text-classic-gold transition-colors cursor-pointer"
                                title="Ouvir novamente"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            {isLastBlock ? (
                              <TypingBubble
                                text={block.text}
                                speed={getCharacterTypingSpeed(charReference)}
                                textDisplayMode={textDisplayMode}
                                onComplete={() => {
                                  setTimeout(() => {
                                    setActiveBlockIndex(prev => prev + 1);
                                  }, 1000);
                                }}
                              />
                            ) : textDisplayMode === 'audio' ? (
                              <div className="flex items-center gap-2 py-1 text-xs text-[#8e8574] italic">
                                <span>🔊</span>
                                <span>Mensagem de voz reproduzida</span>
                              </div>
                            ) : (
                              <p className="font-serif leading-relaxed text-classic-ink">
                                {block.text}
                              </p>
                            )}

                            {!isLastBlock && textDisplayMode === 'text' && (
                              <div className="mt-2.5 pt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleTranslation(blockKey, block.text);
                                  }}
                                  disabled={translatingIndices[blockKey]}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#e2dacb] bg-[#FAF6EE] hover:bg-[#eae3d5] text-[10px] text-classic-gold transition-colors cursor-pointer"
                                >
                                  <span>
                                    {showTranslations[blockKey] 
                                      ? 'Ocultar Tradução' 
                                      : translatingIndices[blockKey] 
                                        ? 'Traduzindo...' 
                                        : 'Traduzir'}
                                  </span>
                                </button>
                                
                                {showTranslations[blockKey] && (
                                  <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-2 text-xs text-[#7d715e] italic leading-normal p-2 rounded bg-classic-cream/50 border border-t border-slate-200"
                                  >
                                    {dynamicTranslations[blockKey] || 'Buscando tradução...'}
                                  </motion.p>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    }
                  })}
                </div>
              );

              if (isLastMessage && simState.narrative_context && simState.narrative_context.trim() !== "") {
                return (
                  <React.Fragment key={`narrative-group-${i}`}>
                    <motion.div
                      key="injected-narrator"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#FAF6EE] border-l-2 border-[#dfcbb0] p-4 rounded-xl text-xs text-[#7d715e] italic leading-relaxed my-2 max-w-[85%] mr-auto"
                    >
                      <span className="text-classic-gold font-mono text-[9px] font-bold uppercase block mb-1">
                        Cenário / Reação do Personagem
                      </span>
                      {simState.narrative_context}
                    </motion.div>
                    {playbackElement}
                  </React.Fragment>
                );
              }
              return playbackElement;
            }

            // STATIC RENDERING OF CHARACTER MESSAGES SPLIT INTO SPEECH & ACTION BUBBLES
            if (isChar && !isCharAction) {
              const blocks = splitTextIntoAtmosphericBlocks(msgText, charReference);
              const splitElements = (
                <div key={i} className="space-y-4">
                  {blocks.map((block, bIdx) => {
                    const blockKey = `${i}-${bIdx}`;
                    
                    if (block.type === 'action') {
                      return (
                        <motion.div
                          key={`block-act-${bIdx}`}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-start"
                        >
                          <div className="max-w-[85%] rounded-2xl p-3 text-xs font-sans relative bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-tl-none font-serif italic shadow-2xs">
                            <div className="flex items-center gap-1.5 mb-1 text-emerald-950">
                              <span className="text-[12px]">🏃</span>
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Ação Física</span>
                            </div>
                            <p className="font-serif leading-relaxed">
                              {block.text}
                            </p>
                          </div>
                        </motion.div>
                      );
                    } else {
                      return (
                        <motion.div
                          key={`block-speech-${bIdx}`}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-start"
                        >
                          <div className="max-w-[85%] rounded-2xl p-4 text-sm font-sans relative bg-classic-cream border border-[#e2dacb] text-classic-ink rounded-tl-none shadow-2xs">
                            <div className="flex items-center justify-between gap-4 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-classic-gold">
                                  {charDisplayName}
                                </span>
                                {charReference && (
                                  <span className="text-[8px] bg-amber-50 border border-[#dfcbb0] px-1 rounded text-classic-gold font-mono">
                                    {charRelationship}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reSpeakMessage(block.text, 'en');
                                }}
                                className="p-0.5 rounded text-[#8e8574] hover:text-classic-gold transition-colors cursor-pointer"
                                title="Ouvir novamente"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            {textDisplayMode === 'audio' ? (
                              <div className="flex items-center gap-2 py-1 text-xs text-[#8e8574] italic">
                                <span>🔊</span>
                                <span>Mensagem de voz reproduzida</span>
                              </div>
                            ) : (
                              <p className="font-serif leading-relaxed text-classic-ink">
                                {block.text}
                              </p>
                            )}

                            {textDisplayMode === 'text' && (
                              <div className="mt-2.5 pt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleTranslation(blockKey, block.text);
                                  }}
                                  disabled={translatingIndices[blockKey]}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#e2dacb] bg-[#FAF6EE] hover:bg-[#eae3d5] text-[10px] text-classic-gold transition-colors cursor-pointer"
                                >
                                  <span>
                                    {showTranslations[blockKey] 
                                      ? 'Ocultar Tradução' 
                                      : translatingIndices[blockKey] 
                                        ? 'Traduzindo...' 
                                        : 'Traduzir'}
                                  </span>
                                </button>
                                
                                {showTranslations[blockKey] && (
                                  <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-2 text-xs text-[#7d715e] italic leading-normal p-2 rounded bg-classic-cream/50 border border-t border-slate-200"
                                  >
                                    {dynamicTranslations[blockKey] || 'Buscando tradução...'}
                                  </motion.p>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    }
                  })}
                </div>
              );

              if (isLastMessage && simState.narrative_context && simState.narrative_context.trim() !== "") {
                return (
                  <React.Fragment key={`narrative-group-${i}`}>
                    <motion.div
                      key="injected-narrator"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#FAF6EE] border-l-2 border-[#dfcbb0] p-4 rounded-xl text-xs text-[#7d715e] italic leading-relaxed my-2 max-w-[85%] mr-auto"
                    >
                      <span className="text-classic-gold font-mono text-[9px] font-bold uppercase block mb-1">
                        Cenário / Reação do Personagem
                      </span>
                      {simState.narrative_context}
                    </motion.div>
                    {splitElements}
                  </React.Fragment>
                );
              }
              return splitElements;
            }

            // DEFAULT STATIC BUBBLE FOR NON-CHARACTER OR CHARACTER ACTIONS
            const bubbleElement = (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isChar ? 'justify-start' : 'justify-end'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl p-4 text-sm font-sans relative ${
                    isChar 
                    ? (isCharAction 
                      ? 'bg-[#FAF6EE] border border-dashed border-[#dfcbb0] text-[#5c4f3c] rounded-tl-none font-serif italic' 
                      : 'bg-classic-cream border border-[#e2dacb] text-classic-ink rounded-tl-none')
                    : isAction
                      ? 'bg-[#FCF9F2] border border-dashed border-[#dfcbb0] text-[#7d715e] rounded-tr-none shadow-xs'
                      : 'bg-[#FAF6EE] border border-[#dfcbb0] text-emerald-950 rounded-tr-none shadow-xs'
                  }`}
                  style={{ cursor: showRetryOnUser ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (showRetryOnUser) {
                      setReprocessMsgText(msgText);
                      setReprocessCopied(false);
                      setReprocessSaved(false);
                      setShowReprocessConfirm(true);
                    }
                  }}
                  title={showRetryOnUser ? "Toque para reprocessar resposta do personagem se necessário" : undefined}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                        isChar 
                        ? (isCharAction ? 'text-[#8e8574]' : 'text-classic-gold')
                        : isAction
                          ? 'text-[#8e8574] flex items-center gap-1'
                          : 'text-emerald-800'
                      }`}>
                        {isAction && <span className="text-[12px]">🏃</span>}
                        {charDisplayName}
                      </span>
                      {isChar && charReference && (
                        <span className="text-[8px] bg-amber-50 border border-[#dfcbb0] px-1 rounded text-classic-gold font-mono">
                          {charRelationship}
                        </span>
                      )}
                    </div>

                    {isChar && !isCharAction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reSpeakMessage(msgText, 'en');
                        }}
                        className="p-0.5 rounded text-[#8e8574] hover:text-classic-gold transition-colors cursor-pointer"
                        title="Ouvir novamente"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  
                  {isChar ? (
                    isCharAction ? (
                      <p className="font-serif leading-relaxed text-[#5c4f3c]">
                        {msgText}
                      </p>
                    ) : (
                      <p className="font-serif leading-relaxed text-classic-ink">
                        {msgText}
                      </p>
                    )
                  ) : isAction ? (
                    <p className="font-serif leading-relaxed text-[#7d715e] italic">
                      "{actionCleanText}"
                    </p>
                  ) : (
                    <p className="font-serif leading-relaxed text-emerald-950 font-medium">
                      {msgText}
                    </p>
                  )}

                  {/* Manual Retry micro action */}
                  {showRetryOnUser && (
                    <div className="mt-2 pt-2 border-t border-emerald-900/10 flex justify-end">
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-classic-gold font-semibold uppercase tracking-wider">
                        <RotateCcw className="w-2.5 h-2.5" /> Toque para reprocessar
                      </span>
                    </div>
                  )}

                  {isChar && isCharAction && (
                    <div className="mt-2.5 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTranslation(`${i}-action`, msgText);
                        }}
                        disabled={translatingIndices[`${i}-action`]}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#e2dacb] bg-[#FAF6EE] hover:bg-[#eae3d5] text-[10px] text-classic-gold transition-colors cursor-pointer"
                      >
                        <span>
                          {showTranslations[`${i}-action`] 
                            ? 'Ocultar Tradução' 
                            : translatingIndices[`${i}-action`] 
                              ? 'Traduzindo...' 
                              : 'Traduzir'}
                        </span>
                      </button>
                      
                      {showTranslations[`${i}-action`] && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-2 text-xs text-[#7d715e] italic leading-normal p-2 rounded bg-classic-cream/50 border border-t border-slate-200"
                        >
                          {msg.translation || dynamicTranslations[`${i}-action`] || 'Buscando tradução...'}
                        </motion.p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );

            if (isLastMessage && isChar && simState.narrative_context && simState.narrative_context.trim() !== "") {
              return (
                <React.Fragment key={`narrative-group-${i}`}>
                  <motion.div
                    key="injected-narrator"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#FAF6EE] border-l-2 border-[#dfcbb0] p-4 rounded-xl text-xs text-[#7d715e] italic leading-relaxed my-2 max-w-[85%] mr-auto"
                  >
                    <span className="text-classic-gold font-mono text-[9px] font-bold uppercase block mb-1">
                      Cenário / Reação do Personagem
                    </span>
                    {simState.narrative_context}
                  </motion.div>
                  {bubbleElement}
                </React.Fragment>
              );
            }

            return bubbleElement;
          })}

          {/* Typing Loading indicator (three dots) */}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-classic-cream border border-[#e2dacb] rounded-2xl p-4 rounded-tl-none max-w-[85%] shadow-xs">
                <div className="flex flex-col gap-2">
                  {typingCharacterName && (
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-classic-gold flex items-center gap-1.5 mb-0.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-classic-gold opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-classic-gold"></span>
                      </span>
                      {typingCharacterName} está digitando...
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 py-0.5">
                    <span className="h-2 w-2 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {currentWaitingMsg && (
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={currentWaitingMsg}
                        initial={{ opacity: 0, x: -3 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 3 }}
                        transition={{ duration: 0.3 }}
                        className="text-[11px] text-[#8e8574] italic font-serif leading-tight border-t border-[#f0ebe0]/65 pt-1.5 min-w-[150px]"
                      >
                        {currentWaitingMsg}
                      </motion.p>
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* User's Audio Transcription Loading indicator */}
          {speakingStatus === 'processing' && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="bg-[#FAF6EE] border border-[#dfcbb0] rounded-2xl p-4 rounded-tr-none shadow-xs">
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-800 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-800 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-800 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ============================================================= */}
        {/* INPUT SPEECH & TEXT MODULE                                     */}
        {/* ============================================================= */}
        <div 
          id="conversation_input_area" 
          className={`border-t border-[#f0ebe0] pt-4 mt-auto relative pb-10 sm:pb-16 transition-all duration-300 ${
            (isPlaybackActive || loading)
              ? 'blur-[3px] pointer-events-none opacity-60' 
              : ''
          }`}
        >
          
          {/* Compact Mini Translator Panel */}
          <AnimatePresence>
            {showMiniTranslator && (
              <motion.div
                ref={miniTranslatorRef}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute bottom-12 left-2.5 sm:bottom-14 sm:left-4 z-30 w-48 bg-white border border-[#dfcbb0] rounded-2xl p-2.5 shadow-lg space-y-2 font-sans text-left"
              >
                <div className="flex items-center justify-between border-b border-[#f5efe4] pb-1">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-classic-gold font-bold">Mini Tradutor</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMiniTranslator(false);
                    }}
                    className="text-[#8e8574] hover:text-classic-ink transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    maxLength={25}
                    placeholder="Português..."
                    value={translatorInput}
                    onChange={(e) => setTranslatorInput(e.target.value)}
                    className="w-full bg-classic-cream border border-[#e2dacb] rounded-lg px-2 py-1 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all font-sans"
                  />
                  
                  <div className="bg-classic-ivory border border-[#dfcbb0]/40 rounded-lg p-2 min-h-[36px] flex flex-col justify-center">
                    {isTranslatingMini ? (
                      <div className="flex items-center gap-1.5 justify-center py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-classic-gold animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : translatorOutput ? (
                      <div className="space-y-0.5">
                        <span className="text-[8px] font-mono text-[#8e8574] uppercase block">Inglês</span>
                        <p className="text-xs font-serif font-semibold text-classic-ink select-all leading-tight break-all">
                          {translatorOutput}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#8e8574]/75 italic text-center block">
                        Tradução aparecerá aqui
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Wallet and Mini Translator Button Group at Bottom Left */}
          <div className="absolute bottom-2 left-2.5 sm:bottom-2 sm:left-4 z-20 flex items-center gap-2">
            {(() => {
              const hasLowMoney = simState.survival_mode && (simState.money !== undefined ? simState.money : 20000) < 500;
              const hasHunger = simState.survival_mode && (simState.hunger === 'Com fome' || simState.hunger === 'Com muita fome');
              
              let emoji = '👛';
              let text = 'Carteira';
              let title = 'Informações da Jornada (Carteira)';
              
              if (hasLowMoney && hasHunger) {
                emoji = '🚨';
                text = 'Perigo!';
                title = 'Fome e Pouco Dinheiro! Toque para ver';
              } else if (hasLowMoney) {
                emoji = '💸';
                text = 'Sem Saldo!';
                title = 'Carteira quase vazia! Toque para ver';
              } else if (hasHunger) {
                emoji = '🍽️';
                text = 'Fome!';
                title = 'Você precisa comer! Toque para ver';
              }

              return (
                <button
                  type="button"
                  onClick={() => {
                    setJourneyPopupTab('geral');
                    setShowJourneyInfoPopup(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                    (hasLowMoney || hasHunger)
                      ? 'bg-rose-50 border border-rose-300 text-rose-800 shadow-xs animate-pulse'
                      : 'bg-classic-cream border border-[#e2dacb] hover:border-classic-gold text-[#7d715e] hover:bg-[#FAF6EE]'
                  }`}
                  title={title}
                >
                  <span className={(hasLowMoney || hasHunger) ? "animate-bounce inline-block" : ""}>
                    {emoji}
                  </span>
                  <span>
                    {text}
                  </span>
                  {(hasLowMoney || hasHunger) && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                  )}
                </button>
              );
            })()}

            {/* Discreet Mini Translator Toggle Button */}
            <button
              ref={miniTranslatorToggleRef}
              type="button"
              onClick={() => {
                if (!showMiniTranslator) {
                  setTranslatorInput('');
                  setTranslatorOutput('');
                }
                setShowMiniTranslator(!showMiniTranslator);
              }}
              className={`p-1.5 rounded-full border transition-all cursor-pointer shadow-2xs flex items-center justify-center ${
                showMiniTranslator
                  ? 'bg-amber-50 border-classic-gold text-classic-gold ring-2 ring-classic-gold/15'
                  : 'bg-classic-cream border border-[#e2dacb] hover:border-classic-gold text-[#7d715e] hover:bg-[#FAF6EE]'
              }`}
              title="Mini Tradutor Rápido"
            >
              <Languages className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col items-center justify-center space-y-3">
            
            {/* Action Bar with Keyboard Fallback & Suggestions toggle */}
            <div className="flex w-full items-center justify-between gap-4 border-b border-[#f5efe4] pb-2 mb-1">
              
              <button
                id="conversation_suggestions_area"
                onClick={() => setShowSuggestionsPanel(true)}
                className="flex items-center gap-1 text-xs text-classic-gold font-semibold uppercase tracking-wider hover:text-classic-gold-hover transition-colors cursor-pointer"
              >
                <span>✨ Sugestões</span>
              </button>

              <button
                onClick={() => setShowKeyboardFallback(!showKeyboardFallback)}
                className="text-xs text-[#8e8574] hover:text-classic-ink transition-colors flex items-center gap-1 cursor-pointer"
                title="Escrever pelo teclado"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>{showKeyboardFallback ? 'Falar por Áudio' : 'Digitar'}</span>
              </button>
            </div>

            {/* Glowing Big mic circle or Text keyboard fallback */}
            {activeChar ? (
              <div className="w-full">
                {!showKeyboardFallback ? (
                  <div className="py-2 flex flex-col items-center justify-center w-full">
                    {/* Compact popup text field for manual action narrative */}
                    <AnimatePresence>
                      {showActionInput && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="w-full bg-[#FCF9F2] border border-[#dfcbb0] rounded-2xl p-3 shadow-md mb-4"
                        >
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimText = actionInputText.trim();
                              if (trimText && !loading) {
                                submitAction('talk', `[Ação: ${trimText}]`);
                                setActionInputText('');
                                setShowActionInput(false);
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              autoFocus
                              className="flex-1 bg-white border border-[#dfcbb0] rounded-xl px-3.5 py-2.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all font-sans"
                              placeholder="O que você faz agora? Ex: Sento na cadeira e sorrio..."
                              value={actionInputText}
                              onChange={(e) => setActionInputText(e.target.value)}
                            />
                            <button
                              type="submit"
                              disabled={!actionInputText.trim() || loading}
                              className="bg-classic-green hover:bg-classic-green-light text-white px-3.5 py-2.5 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-xs transition-colors text-xs font-serif font-semibold"
                            >
                              Realizar
                            </button>
                          </form>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center justify-center gap-6 relative w-full max-w-xs my-1">
                      {/* Left Side: 🏃 Action Button */}
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setShowActionInput(!showActionInput);
                          if (!showActionInput) {
                            setActionInputText('');
                          }
                        }}
                        className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                          showActionInput
                          ? 'bg-amber-50 border-classic-gold text-classic-gold ring-2 ring-classic-gold/15'
                          : 'bg-classic-cream border-[#e2dacb] hover:border-classic-gold text-[#8e8574] hover:text-classic-gold hover:bg-[#FAF6EE] shadow-xs'
                        }`}
                        title="Descrever Ação Narrativa Física"
                      >
                        <span className="text-lg">🏃</span>
                      </motion.button>

                      {/* Center: Glowing Recording Mic */}
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={toggleRecording}
                        className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                          isRecording
                          ? 'bg-rose-50 border-rose-300 text-rose-500 shadow-md ring-4 ring-rose-500/10'
                          : 'bg-classic-cream border-classic-gold/30 hover:border-classic-gold text-classic-gold hover:bg-[#FAF6EE] shadow-sm'
                        }`}
                        title={isRecording ? "Parar gravação" : "Falar por Áudio"}
                      >
                        {isRecording ? <MicOff className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
                      </motion.button>

                      {/* Spacer to keep balance alignment */}
                      <div className="w-11 h-11" />
                    </div>

                    <span className="text-[10px] text-[#8e8574] font-medium tracking-wide mt-2 block uppercase text-center">
                      {isRecording ? "Sua voz está sendo captada... toque para parar" : "Fale no microfone ou toque no 🏃 para fazer uma ação"}
                    </span>
                  </div>
                ) : (
                  <div className="w-full">
                    {/* Compact action form for typing mode if toggled */}
                    <AnimatePresence>
                      {showActionInput && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="w-full bg-[#FCF9F2] border border-[#dfcbb0] p-3 rounded-2xl mb-3 shadow-xs"
                        >
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimText = actionInputText.trim();
                              if (trimText && !loading) {
                                submitAction('talk', `[Ação: ${trimText}]`);
                                setActionInputText('');
                                setShowActionInput(false);
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              autoFocus
                              className="flex-1 bg-white border border-[#dfcbb0] rounded-xl px-3.5 py-2.5 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all font-sans"
                              placeholder="O que você faz agora? Ex: Sorrio e me sento..."
                              value={actionInputText}
                              onChange={(e) => setActionInputText(e.target.value)}
                            />
                            <button
                              type="submit"
                              disabled={!actionInputText.trim() || loading}
                              className="bg-classic-green hover:bg-classic-green-light text-white px-3.5 py-2.5 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-xs transition-colors text-xs font-serif font-semibold"
                            >
                              Realizar
                            </button>
                          </form>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleKeyboardSend} className="w-full flex items-center gap-2 py-2">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setShowActionInput(!showActionInput);
                          if (!showActionInput) {
                            setActionInputText('');
                          }
                        }}
                        className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                          showActionInput
                          ? 'bg-amber-50 border-classic-gold text-classic-gold ring-2 ring-classic-gold/15'
                          : 'bg-classic-cream border-[#e2dacb] hover:border-classic-gold text-[#8e8574] hover:text-classic-gold hover:bg-[#FAF6EE] shadow-xs'
                        }`}
                        title="Alternar para Ação Física"
                      >
                        <span className="text-lg">🏃</span>
                      </motion.button>

                      <input
                        type="text"
                        className="flex-1 bg-classic-cream border border-[#e2dacb] rounded-xl px-4 py-3 text-sm text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all font-sans"
                        placeholder="Responda ao personagem em inglês..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={showActionInput}
                      />
                      <button
                        type="submit"
                        disabled={(!inputText.trim() || loading) || showActionInput}
                        className="bg-classic-green hover:bg-classic-green-light text-white w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-sm transition-all"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex flex-col space-y-3.5 pt-1">
                {/* Visual Direct Actions / Suggestions */}
                {simState.available_actions && simState.available_actions.length > 0 && (
                  <div className="w-full">
                    <p className="text-[10px] font-bold text-[#8e8574] uppercase tracking-wider mb-2">
                      Opções Recomendadas de Continuidade:
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {(simState.available_actions || []).map((act, idx) => (
                        <button
                          key={idx}
                          id={`free_suggestion_btn_${idx}`}
                          onClick={() => {
                            const isRest = (act || "").toLowerCase().includes("descansar") || (act || "").toLowerCase().includes("dormir") || (act || "").toLowerCase().includes("voltar para casa") || (act || "").toLowerCase().includes("acordar") || (act || "").toLowerCase().includes("ir deitar");
                            const isTravel = !isRest && (
                              (act || "").toLowerCase().includes("ir para") || 
                              (act || "").toLowerCase().includes("ir ao") || 
                              (act || "").toLowerCase().includes("ir à") || 
                              (act || "").toLowerCase().includes("viajar") || 
                              (act || "").toLowerCase().includes("sair") || 
                              (act || "").toLowerCase().includes("visitar") || 
                              (act || "").toLowerCase().includes("caminhar até") || 
                              (act || "").toLowerCase().includes("andar até") || 
                              (act || "").toLowerCase().includes("pegar metrô") || 
                              (act || "").toLowerCase().includes("pegar ônibus") || 
                              (act || "").toLowerCase().includes("procurar um") || 
                              (act || "").toLowerCase().includes("ir pro") || 
                              (act || "").toLowerCase().includes("ir pra")
                            );
                            
                            if (isTravel) {
                              let destName = act.replace(/Ir para|Ir ao|Ir à|Viajar para|Ir pro|Ir pra|Voltar para|deslocar para|caminhar até|andar até/gi, "").trim();
                              if (destName.endsWith(".")) destName = destName.slice(0, -1);
                              submitAction('travel', '', destName || 'Local Próximo');
                            } else if (isRest) {
                              submitAction('rest');
                            } else {
                              submitAction('talk', `[Ação: ${act}]`);
                            }
                          }}
                          className="bg-classic-cream hover:bg-[#FAF6EE] border border-[#e2dacb] hover:border-classic-gold px-3.5 py-2 rounded-xl text-xs leading-normal text-classic-ink font-serif font-medium transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5"
                        >
                          <span className="text-classic-gold">✨</span>
                          <span>{act}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open Free-form Action Input Field */}
                <div className="w-full">
                  <p className="text-[10px] font-bold text-[#8e8574] uppercase tracking-wider mb-2">
                    Ou Escolha uma Ação Própria (Ação Livre):
                  </p>
                  <form 
                    id="free_action_form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimText = inputText.trim();
                      if (trimText && !loading) {
                        const lower = trimText.toLowerCase();
                        const isRest = lower.includes("descansar") || lower.includes("dormir") || lower.includes("ir deitar") || lower.includes("ir dormir") || lower.includes("fim do dia");
                        const isTravel = !isRest && (
                          lower.startsWith("ir para ") || 
                          lower.startsWith("ir ao ") || 
                          lower.startsWith("ir à ") || 
                          lower.startsWith("viajar para ") || 
                          lower.startsWith("viajar ao ") || 
                          lower.startsWith("ir pro ") || 
                          lower.startsWith("ir pra ") || 
                          lower.startsWith("visitar ") || 
                          lower.startsWith("caminhar até ") || 
                          lower.startsWith("andar até ") || 
                          lower.startsWith("pegar metrô para ") || 
                          lower.startsWith("pegar ônibus para ")
                        );
                        
                        if (isTravel) {
                          let destName = trimText.replace(/Ir para|Ir ao|Ir à|Viajar para|Ir pro|Ir pra|Voltar para|deslocar para|caminhar até|andar até/gi, "").trim();
                          if (destName.endsWith(".")) destName = destName.slice(0, -1);
                          submitAction('travel', '', destName || 'Local Próximo');
                        } else if (isRest) {
                          submitAction('rest');
                        } else {
                          submitAction('talk', `[Ação: ${trimText}]`);
                        }
                        setInputText('');
                      }
                    }}
                    className="w-full flex items-center gap-2"
                  >
                    <input
                      id="free_action_input"
                      type="text"
                      className="flex-1 bg-classic-cream border border-[#e2dacb] rounded-xl px-4 py-3 text-xs text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold transition-all font-sans"
                      placeholder="Para onde vai ou o que faz agora? Ex: ir à lanchonete, arrumar o quarto..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      id="free_action_submit_btn"
                      type="submit"
                      disabled={!inputText.trim() || loading}
                      className="bg-classic-green hover:bg-classic-green-light text-white w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-sm transition-all"
                      title="Realizar Ação Livre"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Active Voice recognition transcription line */}
            {liveTranscript && (
              <div className="w-full text-xs text-center bg-[#FAF6EE] p-2.5 rounded-xl border border-[#e2dacb] font-serif text-[#7d715e]">
                {liveTranscript}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ============================================================= */}
      {/* OVERLAY POPUPS (REVERSED PARCHMENT / SOFT CONTRAST)            */}
      {/* ============================================================= */}
      
      {/* 1. Date and Time Info Popup */}
      <AnimatePresence>
        {showDateTimePopup && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-md w-full shadow-lg relative flex flex-col max-h-[90vh]"
            >
              <button 
                onClick={() => setShowDateTimePopup(false)}
                className="absolute top-4 right-4 text-[#8e8574] hover:text-classic-ink"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="text-center mb-2">
                <h3 className="text-lg font-serif font-bold text-classic-ink flex items-center justify-center gap-1.5">
                  📅 Agenda e Calendário
                </h3>
                <p className="text-[#8e8574] text-[10px] mt-0.5">Navegue pelas tarefas, compromissos e história</p>
              </div>

              {/* Tab Selector */}
              <div className="flex border-b border-[#e2dacb] my-3">
                <button
                  onClick={() => {
                    setCalendarActiveView('hoje');
                    setCalendarSelectedDay(simState.day_count || 1);
                  }}
                  className={`flex-1 pb-2 text-xs font-serif font-bold cursor-pointer border-b-2 transition-all ${
                    calendarActiveView === 'hoje'
                      ? 'border-emerald-800 text-emerald-800'
                      : 'border-transparent text-[#8e8574] hover:text-[#5c4f3c]'
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => setCalendarActiveView('semana')}
                  className={`flex-1 pb-2 text-xs font-serif font-bold cursor-pointer border-b-2 transition-all ${
                    calendarActiveView === 'semana'
                      ? 'border-emerald-800 text-emerald-800'
                      : 'border-transparent text-[#8e8574] hover:text-[#5c4f3c]'
                  }`}
                >
                  Esta Semana
                </button>
                <button
                  onClick={() => setCalendarActiveView('mes')}
                  className={`flex-1 pb-2 text-xs font-serif font-bold cursor-pointer border-b-2 transition-all ${
                    calendarActiveView === 'mes'
                      ? 'border-emerald-800 text-emerald-800'
                      : 'border-transparent text-[#8e8574] hover:text-[#5c4f3c]'
                  }`}
                >
                  Este Mês
                </button>
              </div>

              {/* View Content */}
              <div className="flex-1 overflow-y-auto pr-1 py-1">
                {calendarActiveView === 'hoje' && (() => {
                  const dayInfo = getStoryDateInfo(calendarSelectedDay);
                  const dayCommitments = (simState.commitments || []).filter(c => c.day === calendarSelectedDay);
                  return (
                    <div className="space-y-4">
                      {/* Day Header */}
                      <div className="text-center bg-[#FAF6EE] p-3 rounded-2xl border border-[#e2dacb]">
                        <div className="text-[10px] text-emerald-800 font-bold font-mono tracking-wider uppercase">
                          {dayInfo.dayOfWeekName}
                        </div>
                        <div className="text-xl font-serif font-black text-classic-ink mt-0.5">
                          Dia {dayInfo.day}
                        </div>
                        <div className="text-[10px] text-[#8e8574] mt-0.5">
                          Semana {dayInfo.weekNum} • Mês {dayInfo.monthNum} • Dia {dayInfo.dayOfMonth} do Mês
                        </div>
                        {dayInfo.day === simState.day_count ? (
                          <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-semibold">
                            Dia Atual da Simulação • {simState.time || "08:00 AM"}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCalendarSelectedDay(simState.day_count || 1);
                            }}
                            className="inline-block mt-2 px-2 py-0.5 bg-amber-100 hover:bg-amber-100/80 text-amber-900 border border-amber-200 rounded-full text-[9px] font-semibold transition-colors cursor-pointer animate-pulse"
                          >
                            Ir para o Dia Atual da História
                          </button>
                        )}
                      </div>

                      {/* Commitments List */}
                      <div>
                        <h4 className="text-xs font-serif font-bold text-classic-ink mb-2">
                          Compromissos do Dia ({dayCommitments.length})
                        </h4>
                        {dayCommitments.length === 0 ? (
                          <div className="text-center py-8 text-[#8e8574] text-xs bg-[#FAF6EE]/50 border border-dashed border-[#e2dacb] rounded-2xl">
                            📭 Nenhum compromisso especial agendado para hoje.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {dayCommitments.map((c) => {
                              let statusBg = "bg-amber-50 text-amber-900 border-amber-200";
                              let statusLabel = "Pendente";
                              if (c.status === 'concluido') {
                                statusBg = "bg-emerald-50 text-emerald-900 border-emerald-200";
                                statusLabel = "Concluído";
                              } else if (c.status === 'perdido') {
                                statusBg = "bg-rose-50 text-rose-900 border-rose-200";
                                statusLabel = "Perdido";
                              } else if (c.status === 'cancelado') {
                                statusBg = "bg-gray-50 text-gray-800 border-gray-200";
                                statusLabel = "Cancelado";
                              }

                              const priorityColor = c.priority === 'alta' ? 'text-red-700 bg-red-50 border-red-100' : 'text-amber-700 bg-amber-50 border-amber-150';

                              return (
                                <div key={c.id} className="p-3 bg-white border border-[#e2dacb] rounded-2xl text-left shadow-2xs">
                                  <div className="flex justify-between items-start mb-1.5">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBg}`}>
                                      {statusLabel}
                                    </span>
                                    <span className="text-[9px] font-mono font-semibold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                      ⏰ {c.startTime} - {c.endTime}
                                    </span>
                                  </div>
                                  <h5 className="text-[11px] font-serif font-black text-classic-ink flex items-center gap-1">
                                    {c.type === 'compromisso' ? '🤝' : c.type === 'tarefa' ? '📋' : '🎟️'} {c.name}
                                  </h5>
                                  <p className="text-[10px] text-[#8e8574] mt-1 pr-1 leading-relaxed">
                                    {c.description}
                                  </p>
                                  {c.status === 'perdido' && c.consequences && (
                                    <div className="mt-2 p-1.5 bg-rose-50/50 rounded-lg border border-rose-100 text-[9px] text-rose-700 leading-normal">
                                      ⚠️ <strong>Consequência:</strong> {c.consequences}
                                    </div>
                                  )}
                                  <div className="mt-2 pt-2 border-t border-[#e2dacb]/60 flex justify-between items-center text-[9px] text-[#8e8574]">
                                    <span className="flex items-center gap-1">
                                      Prioridade: 
                                      <strong className={`px-1 rounded border text-[8px] font-bold uppercase ${priorityColor}`}>
                                        {c.priority}
                                      </strong>
                                    </span>
                                    <span>Duração: <strong>{c.duration} min</strong></span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {calendarActiveView === 'semana' && (() => {
                  const currentWeekNum = Math.floor(((simState.day_count || 1) - 1) / 7) + 1;
                  const startDayOfWeek = (currentWeekNum - 1) * 7 + 1;
                  const daysOfWeek = Array.from({ length: 7 }, (_, i) => startDayOfWeek + i);

                  return (
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
                        <h4 className="text-xs font-serif font-bold text-emerald-950 flex items-center gap-1">
                          🗓️ Semana {currentWeekNum} do Calendário
                        </h4>
                        <p className="text-[10px] text-emerald-850 mt-1 leading-relaxed">
                          Os dias em <span className="font-semibold text-emerald-955 underline">Verde Escuro</span> têm compromissos ativos ou passados. Clique em qualquer bloco para acessar a aba diária.
                        </p>
                      </div>

                      <div className="grid grid-cols-7 gap-1.5">
                        {daysOfWeek.map(dayNum => {
                          const dayInfo = getStoryDateInfo(dayNum);
                          const isCurrentDay = dayNum === simState.day_count;
                          const dayCommitments = (simState.commitments || []).filter(c => c.day === dayNum);
                          const hasSpecialCommitments = dayCommitments.length > 0;

                          const tileClass = hasSpecialCommitments
                            ? "bg-emerald-950 text-emerald-50 hover:bg-emerald-900 border-emerald-800 font-semibold"
                            : "bg-[#FAF6EE] text-classic-ink border-[#e2dacb] hover:bg-[#ebdcb9]/40";

                          return (
                            <button
                              key={dayNum}
                              onClick={() => {
                                setCalendarSelectedDay(dayNum);
                                setCalendarActiveView('hoje');
                              }}
                              className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${tileClass} ${
                                isCurrentDay ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                              }`}
                            >
                              <span className="text-[9px] font-bold opacity-80 uppercase font-mono">{dayInfo.dayOfWeekAbbr}</span>
                              <span className="text-sm font-serif font-black mt-0.5">{dayNum}</span>
                              {hasSpecialCommitments && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Lists the week's commitments briefly */}
                      <div className="bg-[#FAF6EE]/50 border border-[#e2dacb] p-3 rounded-2xl">
                        <h5 className="text-[11px] font-serif font-black text-classic-ink mb-1.5">Compromissos nesta Semana:</h5>
                        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                          {(simState.commitments || []).filter(c => daysOfWeek.includes(c.day)).length === 0 ? (
                            <div className="text-[10px] text-[#8e8574] italic">Nenhuma obrigação extraordinária agendada para esta semana.</div>
                          ) : (
                            (simState.commitments || []).filter(c => daysOfWeek.includes(c.day)).map(c => (
                              <div key={c.id} className="text-[10px] text-[#5c4f3c] flex items-center justify-between">
                                <span className="font-semibold flex items-center gap-1">
                                  <span>Dia {c.day}:</span>
                                  <span>{c.name}</span>
                                </span>
                                <span className="text-[8px] font-mono px-1 py-0.2 bg-amber-100 text-amber-800 rounded border border-amber-200">
                                  {c.startTime}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {calendarActiveView === 'mes' && (() => {
                  const currentMonthNum = Math.floor(((simState.day_count || 1) - 1) / 30) + 1;
                  const startDayOfMonth = (currentMonthNum - 1) * 30 + 1;
                  const daysOfMonth = Array.from({ length: 30 }, (_, i) => startDayOfMonth + i);

                  const offset = (startDayOfMonth - 1) % 7;
                  const emptyCells = Array.from({ length: offset });

                  return (
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl text-left">
                        <h4 className="text-xs font-serif font-bold text-emerald-950 flex items-center gap-1">
                          🌙 Mês {currentMonthNum} do Calendário
                        </h4>
                        <p className="text-[10px] text-emerald-800 mt-1 leading-normal">
                          Calendário integral do mês de faturamento e obrigações. Toque em qualquer bloco para visitar a aba Hoje no dia correspondente.
                        </p>
                      </div>

                      <div className="bg-[#FAF6EE]/50 p-3 rounded-2xl border border-[#e2dacb]">
                        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] font-black text-[#8e8574] mb-2 uppercase">
                          <span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1.5">
                          {emptyCells.map((_, i) => (
                            <div key={`empty-${i}`} className="p-1" />
                          ))}
                          {daysOfMonth.map(dayNum => {
                            const isCurrentDay = dayNum === simState.day_count;
                            const dayCommitments = (simState.commitments || []).filter(c => c.day === dayNum);
                            const hasSpecialCommitments = dayCommitments.length > 0;

                            const tileClass = hasSpecialCommitments
                              ? "bg-emerald-950 text-emerald-50 hover:bg-emerald-900 border-emerald-800 font-semibold shadow-xs"
                              : "bg-white text-classic-ink border-[#e2dacb] hover:bg-[#ebdcb9]/30";

                            return (
                              <button
                                key={dayNum}
                                onClick={() => {
                                  setCalendarSelectedDay(dayNum);
                                  setCalendarActiveView('hoje');
                                }}
                                className={`h-8 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer ${tileClass} ${
                                  isCurrentDay ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                                }`}
                              >
                                <span className="font-serif font-bold text-[10.5px]">{dayNum}</span>
                                {hasSpecialCommitments && (
                                  <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5 animate-pulse" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <button
                id="conversation_date_return_btn"
                onClick={() => setShowDateTimePopup(false)}
                className="mt-4 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Retornar ao Diálogo
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. SUGGESTIONS BOTTOM PANEL SHEET */}
      <AnimatePresence>
        {showSuggestionsPanel && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-end justify-center z-50">
            <div className="fixed inset-0" onClick={() => setShowSuggestionsPanel(false)} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white border-t border-[#e8e2d5] rounded-t-3xl max-w-xl w-full p-6 shadow-xl relative z-10"
            >
              <div className="w-12 h-1 bg-classic-gold/30 rounded-full mx-auto mb-4" />
              
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-serif font-bold text-classic-ink">Próximos Passos Sugeridos</h3>
                  <p className="text-[#8e8574] text-xs">Caminhos indicados pela simulação</p>
                </div>
                <button 
                  onClick={() => setShowSuggestionsPanel(false)}
                  className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-[#8e8574]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {simState.available_actions && simState.available_actions.length > 0 ? (
                  (simState.available_actions || []).map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setShowSuggestionsPanel(false);
                        const isRest = (act || "").toLowerCase().includes("descansar") || (act || "").toLowerCase().includes("dormir") || (act || "").toLowerCase().includes("voltar para casa") || (act || "").toLowerCase().includes("acordar") || (act || "").toLowerCase().includes("ir deitar");
                        const isTravel = !isRest && (
                          (act || "").toLowerCase().includes("ir para") || 
                          (act || "").toLowerCase().includes("ir ao") || 
                          (act || "").toLowerCase().includes("ir à") || 
                          (act || "").toLowerCase().includes("viajar") || 
                          (act || "").toLowerCase().includes("sair") || 
                          (act || "").toLowerCase().includes("visitar") || 
                          (act || "").toLowerCase().includes("caminhar até") || 
                          (act || "").toLowerCase().includes("andar até") || 
                          (act || "").toLowerCase().includes("pegar metrô") || 
                          (act || "").toLowerCase().includes("pegar ônibus") || 
                          (act || "").toLowerCase().includes("procurar um") || 
                          (act || "").toLowerCase().includes("ir pro") || 
                          (act || "").toLowerCase().includes("ir pra")
                        );
                        
                        if (isTravel) {
                          let destName = act.replace(/Ir para|Ir ao|Ir à|Viajar para|Ir pro|Ir pra|Voltar para/gi, "").trim();
                          submitAction('travel', '', destName || 'Local Próximo');
                        } else if (isRest) {
                          submitAction('rest');
                        } else {
                          submitAction('talk', `[Ação: ${act}]`);
                        }
                      }}
                      className="w-full text-left bg-classic-cream hover:bg-[#FAF6EE] border border-[#e2dacb] p-3.5 rounded-xl transition-colors flex items-start gap-2 group cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 text-classic-gold mt-0.5 group-hover:translate-x-1 transition-transform" />
                      <span className="text-classic-ink text-xs font-serif leading-relaxed">
                        {act}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-center italic text-[#8e8574] py-4">
                    Nenhuma sugestão adicional para este exato momento. Responda em inglês ao personagem para avançar a conversa!
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REPROCESS CONFIRMATION MODAL */}
      <AnimatePresence>
        {showReprocessConfirm && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-sm w-full shadow-lg relative flex flex-col"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FAF6EE] border border-[#e2dacb] flex items-center justify-center text-classic-gold animate-spin-slow">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-bold text-classic-ink">Reprocessar Resposta</h3>
                  <p className="text-[#8e8574] text-xs">Atualizar turno do personagem</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-xs text-[#5c4f3c] leading-relaxed">
                  Deseja reenviar sua última mensagem para reprocessar e gerar uma nova resposta do personagem?
                </p>
                {reprocessMsgText && (
                  <div className="bg-[#FAF6EE] border border-[#e2dacb] rounded-xl p-3 text-xs text-classic-ink italic">
                    "{reprocessMsgText}"
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy = reprocessMsgText || localStorage.getItem('fluent_last_user_message') || '';
                      let clean = textToCopy.trim();
                      if (clean.startsWith('[Ação: ') && clean.endsWith(']')) {
                        clean = clean.slice(7, -1).trim();
                      }
                      if (clean) {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(clean);
                        } else {
                          const textarea = document.createElement("textarea");
                          textarea.value = clean;
                          textarea.style.position = "fixed";
                          textarea.style.left = "-9999px";
                          document.body.appendChild(textarea);
                          textarea.focus();
                          textarea.select();
                          try { document.execCommand('copy'); } catch (e) {}
                          document.body.removeChild(textarea);
                        }
                        setReprocessCopied(true);
                      }
                    }}
                    className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Copiar última mensagem enviada"
                  >
                    <span className="text-sm">📋</span>
                    <span>Copiar mensagem</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        if (simState) {
                          safeLocalStorageSet('fluent_sim_state', JSON.stringify(simState));
                          safeLocalStorageSet('fluent_backup_saved_sim_state', JSON.stringify(simState));
                        }
                        setReprocessSaved(true);
                      } catch (e) {
                        console.error("Erro ao salvar no reprocessamento:", e);
                        setReprocessSaved(true);
                      }
                    }}
                    className="px-3.5 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Salvar avanço do Stories"
                  >
                    <span className="text-sm">💾</span>
                    <span>Salvar avanço</span>
                  </button>

                  {reprocessCopied && (
                    <span className="text-xs font-semibold text-emerald-700 animate-fadeIn">
                      (Última mensagem copiada)
                    </span>
                  )}

                  {reprocessSaved && (
                    <span className="text-xs font-semibold text-emerald-700 animate-fadeIn">
                      (Avanço salvo)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowReprocessConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-[#8e8574] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowReprocessConfirm(false);
                    submitAction('talk', reprocessMsgText, undefined, true);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-classic-gold hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Reprocessar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. DOSSIER RELATIONSHIPS POPUP MODAL */}
      <AnimatePresence>
        {showDossierPopup && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-md w-full shadow-lg relative flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-serif font-bold text-classic-ink">Dossiê de Relacionamentos</h3>
                  <p className="text-[#8e8574] text-xs">Lista de contatos e afeição local</p>
                </div>
                <button 
                  onClick={() => setShowDossierPopup(false)}
                  className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-[#8e8574]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {(() => {
                  const visibleCharacters = (simState.fixed_characters || []).filter(
                    (char) => char && char.encounters_count !== undefined && char.encounters_count >= 3
                  );

                  if (visibleCharacters.length > 0) {
                    return visibleCharacters.map((char) => {
                      const isActiveChar = activeChar?.id === char.id;
                      const isExpanded = activeDossierChar?.id === char.id;

                      return (
                        <div
                          key={char.id}
                          onClick={() => setActiveDossierChar(isExpanded ? null : char)}
                          className={`bg-classic-cream border rounded-xl p-4 cursor-pointer transition-all ${
                            isActiveChar 
                            ? 'border-classic-gold bg-classic-ivory' 
                            : 'border-[#e2dacb]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-classic-ink font-serif font-bold text-sm flex items-center gap-1.5">
                                {char.name}
                                {isActiveChar && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-600 shadow-xs" title="Cena Ativa" />
                                )}
                              </h4>
                              <p className="text-[#8e8574] text-[10px] font-mono capitalize">
                                {char.profession} (Idade: {char.age})
                              </p>
                            </div>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white text-classic-gold border border-[#e2dacb]">
                              {char.relationship_level}
                            </span>
                          </div>

                          {/* Progress relational bar */}
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-[8px] font-mono text-[#8e8574] leading-none">
                              <span>Confiança / Afinidade</span>
                              <span>{char.relationship_score}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-classic-gold"
                                style={{ width: `${char.relationship_score}%` }}
                              />
                            </div>
                          </div>

                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-3 pt-3 border-t border-[#e2dacb] text-xs text-[#7d715e] space-y-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div>
                                <span className="text-[9px] font-mono tracking-wider block text-classic-gold uppercase mb-0.5">Descrição & Quirks:</span>
                                <p className="italic bg-white p-2 rounded border border-[#e2dacb] font-serif leading-relaxed">
                                  {char.personality}. {char.quirks}
                                </p>
                              </div>
                              <div>
                                <span className="text-[9px] font-mono tracking-wider block text-emerald-800 uppercase mb-0.5">Fatos que ele sabe de você:</span>
                                {char.memories && char.memories.length > 0 ? (
                                  <ul className="list-disc list-inside space-y-1 bg-white p-2 rounded border border-[#e2dacb] font-sans">
                                    {(char.memories || []).map((memo, mIdx) => (
                                      <li key={mIdx}>{memo}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[10px] italic text-[#8e8574]">Nenhuma conversa gravada na memória ainda.</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    });
                  } else {
                    return (
                      <div className="text-center py-8 px-4 bg-classic-cream rounded-2xl border border-[#e2dacb] space-y-3">
                        <span className="text-2xl block">🕵️‍♂️</span>
                        <h4 className="text-classic-ink font-serif font-bold text-sm">Contatos Desconhecidos</h4>
                        <p className="text-[#8e8574] text-xs leading-relaxed max-w-xs mx-auto">
                          Os personagens da sua viagem serão mantidos de forma permanente no dossiê após você acumular pelo menos <strong className="font-semibold text-classic-ink">3 encontros/diálogos</strong> individuais com eles.
                        </p>
                      </div>
                    );
                  }
                })()}
              </div>

              <button
                onClick={() => setShowDossierPopup(false)}
                className="mt-6 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl"
              >
                Fechar Dossiê
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. JOURNEY INFORMATION POPUP */}
      {/* 4. JOURNEY INFORMATION POPUP */}
      <AnimatePresence>
        {showJourneyInfoPopup && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`bg-white border border-[#e8e2d5] rounded-3xl p-6 ${simState.survival_mode ? 'max-w-md' : 'max-w-sm'} w-full shadow-lg relative text-left`}
            >
              <button 
                onClick={() => setShowJourneyInfoPopup(false)}
                className="absolute top-4 right-4 text-[#8e8574] hover:text-classic-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full bg-[#FAF6EE] flex items-center justify-center mx-auto mb-2 text-xl">
                  {simState.survival_mode ? '⚡' : '🗺️'}
                </div>
                <h3 className="text-xl font-serif font-bold text-classic-ink mb-1">
                  {simState.survival_mode ? 'Status de Sobrevivência' : 'Informações da Jornada'}
                </h3>
                <p className="text-[#8e8574] text-xs">
                  {simState.survival_mode ? 'Seu desempenho financeiro e vital' : 'Seu status de adaptação em tempo real'}
                </p>
              </div>

              {simState.survival_mode && (
                <div className="flex border-b border-[#e8e2d5] mb-4 text-xs font-semibold uppercase tracking-wider">
                  <button
                    onClick={() => setJourneyPopupTab('geral')}
                    className={`flex-1 pb-2 border-b-2 transition-all cursor-pointer text-center ${
                      journeyPopupTab === 'geral' ? 'border-amber-500 text-amber-800 font-bold' : 'border-transparent text-[#8e8574]'
                    }`}
                  >
                    Geral
                  </button>
                  <button
                    onClick={() => setJourneyPopupTab('job')}
                    className={`flex-1 pb-2 border-b-2 transition-all cursor-pointer text-center ${
                      journeyPopupTab === 'job' ? 'border-amber-500 text-amber-800 font-bold' : 'border-transparent text-[#8e8574]'
                    }`}
                  >
                    Emprego
                  </button>
                  <button
                    onClick={() => setJourneyPopupTab('history')}
                    className={`flex-1 pb-2 border-b-2 transition-all cursor-pointer text-center ${
                      journeyPopupTab === 'history' ? 'border-amber-500 text-amber-800 font-bold' : 'border-transparent text-[#8e8574]'
                    }`}
                  >
                    Histórico
                  </button>
                </div>
              )}

              {(!simState.survival_mode || journeyPopupTab === 'geral') && (
                <div className="space-y-4">
                  {/* Standard Journey Info Block */}
                  <div className="space-y-3 bg-classic-cream p-4 rounded-2xl border border-[#e2dacb] text-xs">
                    <div>
                      <span className="text-[#8e8574] block">Cidade Selecionada</span>
                      <strong className="text-classic-ink text-sm font-serif">{simState.city}</strong>
                    </div>
                    <div>
                      <span className="text-[#8e8574] block">Foco Gramatical Sugerido</span>
                      <strong className="text-classic-gold font-serif text-sm">{nextGrammaticalFocus}</strong>
                    </div>
                    <div>
                      <span className="text-[#8e8574] block">Proficiência de Entrada</span>
                      <strong className="text-classic-ink font-serif text-sm">
                        {baselineProficiency === 'Advanced' ? 'Avançado' : baselineProficiency === 'Intermediate' ? 'Intermediáro' : 'Iniciante'}
                      </strong>
                    </div>
                  </div>

                  {simState.survival_mode && (
                    <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/60 text-xs space-y-3">
                      <h4 className="font-serif font-bold text-amber-900 text-sm">Status Vital & Financeiro</h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {/* Money Status */}
                        <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100/60 flex flex-col justify-between">
                          <span className="text-[#8e8574] text-[10px] block font-medium">💰 Saldo Atual</span>
                          <span className={`font-semibold font-mono text-sm mt-1 ${(simState.money ?? 20000) < 500 ? 'text-rose-600 animate-pulse font-bold' : 'text-classic-ink'}`}>
                            {((simState.city || "").toLowerCase().includes("ireland") || (simState.city || "").toLowerCase().includes("limerick") || (simState.city || "").toLowerCase().includes("germany") || (simState.city || "").toLowerCase().includes("frankfurt")) ? "€" : "$"}
                            {(simState.money !== undefined ? simState.money : 20000).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        {/* Hunger/Food Status */}
                        <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100/60 flex flex-col justify-between">
                          <span className="text-[#8e8574] text-[10px] block font-medium">🍽️ Alimentação</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-1 text-center whitespace-nowrap ${
                            simState.hunger === 'Muito satisfeito' || simState.hunger === 'Satisfeito'
                              ? 'bg-emerald-100 text-emerald-800'
                              : simState.hunger === 'Normal'
                              ? 'bg-blue-100 text-blue-800'
                              : simState.hunger === 'Com fome'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-rose-100 text-rose-800 animate-pulse'
                          }`}>
                            {simState.hunger || 'Muito satisfeito'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-amber-200/40 text-[11px] text-amber-800 leading-relaxed font-sans space-y-1.5">
                        <div className="flex justify-between items-center bg-white/40 px-2 py-1 rounded-lg">
                          <span>🏠 Aluguel Mensal:</span>
                          <span className="font-semibold font-mono">
                            {((simState.city || "").toLowerCase().includes("ireland") || (simState.city || "").toLowerCase().includes("limerick") || (simState.city || "").toLowerCase().includes("germany") || (simState.city || "").toLowerCase().includes("frankfurt")) ? "€" : "$"}
                            {(simState.rent_amount !== undefined ? simState.rent_amount : 1500).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center bg-white/40 px-2 py-1 rounded-lg">
                          <span>📅 Vencimento de Aluguel:</span>
                          <span className="font-semibold">Todo dia 5</span>
                        </div>
                        <div className="text-[10px] text-amber-700 italic pt-1">
                          ⚠️ Mantenha saldo suficiente no dia 5 para evitar endividamento.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {simState.survival_mode && journeyPopupTab === 'job' && (
                <div className="space-y-4">
                  {simState.job ? (
                    <div className="space-y-3 bg-classic-cream p-4 rounded-2xl border border-[#e2dacb] text-xs animate-fadeIn">
                      <div>
                        <span className="text-[#8e8574] block">Cargo</span>
                        <strong className="text-classic-ink text-sm font-serif">{simState.job.title}</strong>
                      </div>
                      <div>
                        <span className="text-[#8e8574] block">Empresa</span>
                        <strong className="text-classic-ink text-sm">{simState.job.company}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t border-[#f0ebe0] pt-2">
                        <div>
                          <span className="text-[#8e8574] block">Salário Mensal:</span>
                          <strong className="text-emerald-800 font-mono text-sm">
                            {((simState.city || "").toLowerCase().includes("ireland") || (simState.city || "").toLowerCase().includes("limerick") || (simState.city || "").toLowerCase().includes("germany") || (simState.city || "").toLowerCase().includes("frankfurt")) ? "€" : "$"}
                            {simState.job.salary || 2000}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#8e8574] block">Carga Horária:</span>
                          <strong className="text-classic-ink font-mono text-sm">
                            {simState.job.weekly_hours || 20}h/semana
                          </strong>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 border-t border-[#f0ebe0] pt-2">
                        <div>
                          <span className="text-[#8e8574] block">Horário:</span>
                          <span className="text-classic-ink font-mono font-semibold">
                            {simState.job.start_time} às {simState.job.end_time}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8e8574] block">Intervalo:</span>
                          <span className="text-classic-ink font-semibold">
                            {simState.job.break_duration || "Sem intervalo"}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-[#f0ebe0] pt-2">
                        <span className="text-[#8e8574] block">Dias de Trabalho:</span>
                        <span className="text-classic-ink font-semibold">
                          {simState.job.work_days || "Segunda a Sexta"}
                        </span>
                      </div>

                      {simState.job.responsibilities && simState.job.responsibilities.length > 0 && (
                        <div className="border-t border-[#f0ebe0] pt-2">
                          <span className="text-[#8e8574] block mb-1">Descrição das Funções:</span>
                          <ul className="list-disc list-inside space-y-1 text-[#5c5547]">
                            {(simState.job.responsibilities || []).map((resp: string, idx: number) => (
                              <li key={idx} className="text-[11px] leading-relaxed">{resp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 px-4 bg-classic-cream rounded-2xl border border-[#e2dacb] space-y-2">
                      <span className="text-2xl block">💼</span>
                      <h4 className="text-classic-ink font-serif font-bold text-sm">Sem Emprego Ativo</h4>
                      <p className="text-[#8e8574] text-xs leading-relaxed max-w-xs mx-auto">
                        Você está atualmente desempregado. Use o tempo livre para explorar a cidade, fazer amizades ou procurar oportunidades de trabalho nos estabelecimentos locais.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {simState.survival_mode && journeyPopupTab === 'history' && (
                <div className="space-y-3">
                  <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                    {simState.financial_history && simState.financial_history.length > 0 ? (
                      (simState.financial_history || []).slice().reverse().map((tx: any, idx: number) => {
                        const isExpense = tx.amount < 0;
                        return (
                          <div key={idx} className="bg-classic-cream border border-[#e2dacb]/60 rounded-xl p-2.5 text-xs flex items-center justify-between">
                            <div className="text-left">
                              <span className="font-medium text-classic-ink block leading-snug">{tx.description}</span>
                              <span className="text-[10px] text-[#8e8574] block mt-0.5">{tx.date}</span>
                            </div>
                            <span className={`font-mono font-bold whitespace-nowrap ${isExpense ? 'text-rose-700' : 'text-emerald-800'}`}>
                              {isExpense ? '' : '+'}
                              {((simState.city || "").toLowerCase().includes("ireland") || (simState.city || "").toLowerCase().includes("limerick") || (simState.city || "").toLowerCase().includes("germany") || (simState.city || "").toLowerCase().includes("frankfurt")) ? "€" : "$"}
                              {tx.amount.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-[#8e8574] italic text-center py-8">Nenhuma transação financeira registrada.</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowJourneyInfoPopup(false)}
                className="mt-6 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl uppercase tracking-wider transition-all cursor-pointer"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. HELP POPUP */}
      <AnimatePresence>
        {showHelpPopup && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#e8e2d5] rounded-3xl p-6 max-w-sm w-full shadow-lg relative"
            >
              <button 
                onClick={() => setShowHelpPopup(false)}
                className="absolute top-4 right-4 text-[#8e8574] hover:text-classic-ink"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#FAF6EE] flex items-center justify-center mx-auto mb-3 text-xl">
                  ❓
                </div>
                <h3 className="text-xl font-serif font-bold text-classic-ink mb-1">Guia de Stories</h3>
                <p className="text-[#8e8574] text-xs">Como tirar proveito da imersão</p>
              </div>

              <div className="mt-5 text-xs text-[#7d715e] space-y-3 leading-relaxed font-sans">
                <p>
                  • <strong className="text-classic-ink">Voz Nativa (🔊):</strong> Use para escutar a pronúncia nativa dos diálogos e treinar seu listening auditivo.
                </p>
                <p>
                  • <strong className="text-classic-ink">Dossiê (👥):</strong> Conversar repetidamente com um vizinho permite que ele guarde memórias e mude de afeição contigo.
                </p>
                <p>
                  • <strong className="text-classic-ink">Traduções:</strong> Toque no botão "Traduzir" nas falas se tiver dúvidas sobre expressões do cotidiano.
                </p>
                <p>
                  • <strong className="text-classic-ink">Sugestões:</strong> Abra o menu inferior para explorar outros aposentos e avançar o dia fictício.
                </p>
              </div>

              <button
                onClick={() => setShowHelpPopup(false)}
                className="mt-6 w-full py-2.5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`px-5 py-3 rounded-2xl shadow-xl text-sm font-sans flex items-center gap-2 border pointer-events-auto ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 hover:opacity-80 text-xs font-bold font-mono focus:outline-none"
            >
              ✕
            </button>
          </motion.div>
        </div>
      )}

    </div>
  );
}
