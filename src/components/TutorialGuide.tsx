import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, VolumeX, SkipForward, Landmark, GraduationCap, Compass, BookOpen, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { AppMode, SimulatorState } from '../types';

export interface TutorialGuideProps {
  isActive: boolean;
  onFinish: () => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  isStoryLoaded?: boolean;
  setIsStoryLoaded?: (loaded: boolean) => void;
}

interface Step {
  id: string;
  voiceText: string;
  displayText: string;
  targetSelector?: string;
  actionType: 'click' | 'text_sent' | 'auto' | 'story_load_wait';
  requiredMode: AppMode;
}

const TUTORIAL_STEPS: Step[] = [
  {
    id: 'stories_intro',
    requiredMode: 'MENU',
    voiceText: "Vamos começar pelo Stories. Por favor, clique no botão de Stories indicado na tela para conhecermos este modo.",
    displayText: "Vamos começar pelo Stories! Clique no botão de Stories indicado na tela.",
    targetSelector: '#tutorial_btn_stories',
    actionType: 'click'
  },
  {
    id: 'choose_virginia',
    requiredMode: 'SETUP',
    voiceText: "Primeiro vamos escolher um destino. Clique no card de Virgínia Ocidental para carregar nossa história.",
    displayText: "Primeiro vamos escolher um destino. Clique no card de Virgínia Ocidental para embarcar nesta imersão.",
    targetSelector: '#setup_virginia',
    actionType: 'story_load_wait'
  },
  {
    id: 'journey_start',
    requiredMode: 'CONVERSATION',
    voiceText: "Pronto! O objetivo desse modo é praticar as falas para se tornarem fluidas. Caso só façamos exercícios, como de livros, em uma conversa real podemos não ter uma boa cadência na hora. Além disso, conversar ativamente é um dos melhores métodos para aprender, quase como se estivesse lá no país enfrentando as situações na marra. Clique em Continuar para prosseguir.",
    displayText: "Pronto! O objetivo do Stories é praticar falas reais e fluidas. A conversação direta é o melhor caminho para aprender de verdade, desafiando-se como no próprio país.",
    actionType: 'auto'
  },
  {
    id: 'explain_scenario',
    requiredMode: 'CONVERSATION',
    voiceText: "Neste modo, somos conduzidos por uma história imersiva realista. No dia 15 de junho, desembarcamos no nosso destino. Ao passar do tempo, as histórias mudam de manhã, tarde e noite. Você irá à padaria, fará compras no mercado, lidará com problemas de aluguel ou conversará com velhinhas no ponto de ônibus. Essa rica variedade de situações amplia muito o seu vocabulário cotidiano e flexibilidade! Para ver o calendário de nossa jornada, clique no mostrador no topo com o contorno dourado.",
    displayText: "Tempo Dinâmico: Clique no mostrador de data e horário indicado no topo para ver o calendário e prosseguir.",
    targetSelector: '#conversation_date_badge',
    actionType: 'click'
  },
  {
    id: 'close_scenario_calendar',
    requiredMode: 'CONVERSATION',
    voiceText: "Excelente! Esta tela mostra seu calendário de progresso diário de dias e períodos. Agora, para continuarmos nosso tour, por favor clique no botão Retornar ao Diálogo.",
    displayText: "Visão Geral do Tempo: Clique no botão Retornar ao Diálogo para fechar o calendário.",
    targetSelector: '#conversation_date_return_btn',
    actionType: 'click'
  },
  {
    id: 'explain_characters',
    requiredMode: 'CONVERSATION',
    voiceText: "Para que seja realista, os personagens foram treinados para agir de forma extremamente humana. Eles não são assistentes de IA certinhos: possuem personalidades fortes, sentimentos, preferências e até defeitos ou sotaques únicos que você encontraria no mundo real. Clique em Continuar no painel abaixo para prosseguir.",
    displayText: "Personagens Ultra-Humanos: Treinados com sentimentos, sotaques e até defeitos próprios, simulando pessoas de verdade.",
    actionType: 'auto'
  },
  {
    id: 'explain_name_hidden',
    requiredMode: 'CONVERSATION',
    voiceText: "Incrível, não é? E como na vida real, o nome do morador que está falando com você começará oculto! Ele só vai aparecer aqui no cabeçalho se você interagir e perguntar o nome dele durante a própria conversa. Clique em Continuar no painel abaixo para prosseguir.",
    displayText: "Identidade Oculta: Faça perguntas durante o diálogo para descobrir o nome de cada morador da cidade.",
    targetSelector: '#conversation_character_header',
    actionType: 'auto'
  },
  {
    id: 'explain_relationships',
    requiredMode: 'CONVERSATION',
    voiceText: "Outro diferencial fascinante é o nosso sistema de relacionamento. Se você criar uma boa afinidade, vocês se tornam amigos de verdade. Ele lembrará de conversas anteriores e, espontaneamente, poderá ligar ou mandar mensagens novas para continuar o contato! Clique em Continuar para prosseguir.",
    displayText: "Vínculos e Afinidade: Crie sintonia real. Alguns moradores podem se interessar em manter amizade e te procurar de volta.",
    targetSelector: '#conversation_contacts_btn',
    actionType: 'auto'
  },
  {
    id: 'explain_narrator',
    requiredMode: 'CONVERSATION',
    voiceText: "Antes de cada fala sua, repare que o Narrador traz pequenos parágrafos explicativos em português para ambientar a cena. Ele existe para te dar asas para imaginar cada detalhe rapidamente, mantendo seu foco totalmente no inglês no momento de falar. Clique em Continuar para prosseguir.",
    displayText: "Ambientação em Português: O Narrador guia seu olhar sobre a cena para que você domine o contexto sem parar o foco no inglês.",
    targetSelector: '#conversation_narrator_bubble',
    actionType: 'auto'
  },
  {
    id: 'explain_suggestions',
    requiredMode: 'CONVERSATION',
    voiceText: "Se bater aquela dúvida ou cansaço sobre o que responder, você pode abrir as sugestões contextualizadas aqui para se inspirar, mas lembre-se de que é livre para guiar a conversa como quiser! Clique em Continuar para prosseguir.",
    displayText: "Inspiração Extra: Use sugestões contextualizadas para se apoiar, mas guie a história como preferir.",
    targetSelector: '#conversation_suggestions_area',
    actionType: 'auto'
  },
  {
    id: 'listen_to_story',
    requiredMode: 'CONVERSATION',
    voiceText: "Agora que conhecemos todo o funcionamento, faremos silêncio. Ouça com atenção a ambientação em português do narrador da nossa história e a primeira fala em inglês do personagem. Prepare-se! Clique em Continuar para ouvi-los.",
    displayText: "Hora de ouvir! Clique em Continuar para encerrar as explicações gerais e reproduzir o áudio inicial e a fala do personagem.",
    actionType: 'auto'
  },
  {
    id: 'first_speech',
    requiredMode: 'CONVERSATION',
    voiceText: "Agora é a sua vez! Use o teclado ou toque no microfone para interagir com o personagem em inglês do seu próprio jeito.",
    displayText: "Use o microfone ou escreva em inglês sua fala inicial para interagir com o personagem.",
    targetSelector: '#conversation_input_area',
    actionType: 'text_sent'
  },
  {
    id: 'explain_reiniciar',
    requiredMode: 'CONVERSATION',
    voiceText: "Se você quiser recomeçar essa história do zero ou escolher uma cidade diferente para treinar outro sotaque no futuro, você sempre pode fazer isso clicando no menu de três pontos indicado no topo direito. Clique em Continuar para prosseguir.",
    displayText: "Opções de Reinício: Sinta-se livre para reiniciar a conversa do zero ou mudar de cidade no menu de opções no topo direito a qualquer momento. Clique em Continuar.",
    targetSelector: '#conversation_threedots_btn',
    actionType: 'auto'
  },
  {
    id: 'induct_back_menu',
    requiredMode: 'CONVERSATION',
    voiceText: "A nossa inovação mais significativa e o grande coração do aplicativo é a integração contínua entre os modos Stories e o seu Curso Particular. Enquanto você conversa e vive as histórias em inglês, nosso sistema atua em segundo plano pescando as suas reais dificuldades e facilidades sintáticas de cada dia para readaptar continuamente o curso inteiro sob medida para você! Para vermos o Curso Especial, primeiro vamos voltar ao menu principal. Clique no botão de Voltar ao menu no topo esquerdo com o contorno dourado.",
    displayText: "Integração Stories-Curso: Para conhecer seu Curso Particular dinâmico, clique no botão de Voltar no topo esquerdo para ir ao Menu.",
    targetSelector: '#conversation_back_menu',
    actionType: 'click'
  },
  {
    id: 'induct_click_course',
    requiredMode: 'MENU',
    voiceText: "Perfeito! Agora, clique no botão de Curso Particular para conhecermos o seu cronograma adaptativo sob medida.",
    displayText: "Abra o Curso Particular: Toque no botão do Curso Particular para continuarmos.",
    targetSelector: '#tutorial_btn_course',
    actionType: 'click'
  },
  {
    id: 'course_philosophy',
    requiredMode: 'COURSE',
    voiceText: "Enquanto você conversa imerso nas histórias, nosso sistema identifica seus pontos fortes e desvios sintáticos em segundo plano, projetando seu cronograma sob medida. Clique em Continuar para prosseguir.",
    displayText: "O Stories mapeia seus acertos espontâneos e desvios para esculpir e readaptar o curso. Clique em Continuar.",
    actionType: 'auto'
  },
  {
    id: 'explain_planning',
    requiredMode: 'COURSE',
    voiceText: "Este é o seu plano de estudos adaptativo. Ele altera os focos gramaticais e prioridades linguísticas em tempo real, baseando-se estritamente nas suas reais falas cotidianas. Clique em Continuar para prosseguir.",
    displayText: "Seu Plano de Estudos reflete prioridades linguísticas que mudam constantemente com seu uso. Clique em Continuar.",
    targetSelector: '#course_plan_button',
    actionType: 'auto'
  },
  {
    id: 'explain_difficulties',
    requiredMode: 'COURSE',
    voiceText: "Neste menu ficam organizados todos os desvios cometidos na conversação. Eles servem de catalisadores para seu aprendizado e somem assim que você demonstrar consolidação nas práticas. Clique em Continuar para prosseguir.",
    displayText: "As Dificuldades catalogam automaticamente os desvios cometidos para que você os encare sem pressões. Clique em Continuar.",
    targetSelector: '#course_diff_button',
    actionType: 'auto'
  },
  {
    id: 'explain_aula',
    requiredMode: 'COURSE',
    voiceText: "Aqui você estuda e desenvolve as correções de seus desvios. Clique em aula diária para conhecermos os formatos.",
    displayText: "Toque em Aula Diária para expandir e conhecer os formatos conduzidos pela Professora.",
    targetSelector: '#course_aula_button',
    actionType: 'click'
  },
  {
    id: 'explain_exercises',
    requiredMode: 'COURSE',
    voiceText: "Os exercícios fixadores contam com as fases de Teoria explicada, Múltipla Escolha sobre erros graves e Tradução Ativa Prática por escrita, consolidando seu aprendizado. Clique em Continuar para prosseguir.",
    displayText: "Exercícios Fixadores contam com as fases de Teoria, MCQ e Tradução Ativa Escrita. Clique em Continuar.",
    targetSelector: '#course_exercicios_subitem',
    actionType: 'auto'
  },
  {
    id: 'explain_teacher',
    requiredMode: 'COURSE',
    voiceText: "Se desejar um reinforcement detalhado, a professora virtual Madson conduzirá aulas e chamadas de voz explicativas em português, dando feedbacks precisos de sua pronúncia em tempo real. Clique em Continuar para prosseguir.",
    displayText: "A professora de voz Madson realiza ligações telefônicas virtuais para explicar tópicos individualmente. Clique em Continuar.",
    targetSelector: '#course_professora_subitem',
    actionType: 'auto'
  },
  {
    id: 'explain_integration',
    requiredMode: 'COURSE',
    voiceText: "Esta sinergia de duplo canal garante que você nunca mais passe horas estudando tópicos gramaticais aleatórios ou desinteressantes. Suas falas reais geram inteligência escolar, e as aulas eliminam suas travas sintáticas. Clique em Continuar para prosseguir.",
    displayText: "Trabalho em duplo canal: A comunicação gera inteligência de erros, e a aula elimina as dúvidas de cadência. Clique em Continuar.",
    actionType: 'auto'
  },
  {
    id: 'tutorial_finished',
    requiredMode: 'COURSE',
    voiceText: "Incrível! Esperamos que aproveite ao máximo sua simulação e sua prática gramatical adaptativa. Bons diálogos! Clique em Começar Minha Jornada para concluir.",
    displayText: "Sua decolagem está autorizada! Você dominou o manual de navegação do FluentRoleplay. Clique em Começar Minha Jornada.",
    actionType: 'auto'
  }
];

export default function TutorialGuide({ 
  isActive, 
  onFinish, 
  appMode, 
  setAppMode,
  isStoryLoaded,
  setIsStoryLoaded
}: TutorialGuideProps) {
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [showVolumeWarning, setShowVolumeWarning] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  
  const [firstSpeechPhase, setFirstSpeechPhase] = useState<'idle' | 'waiting_user_sent' | 'waiting_char_reply' | 'char_speaking' | 'completed'>('idle');
  const [initialDialogLength, setInitialDialogLength] = useState<number | null>(null);

  const activeStep = stepIndex >= 0 && stepIndex < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[stepIndex] : null;

  // Track the history size of messages to auto-advance during 'first_speech' or 'first_turn'
  const lastHistoryLengthRef = useRef<number | null>(null);

  // Prevent tutorial guide dialog card from sitting on top of inputs/record micro buttons
  const isTargetInBottomHalf = targetRect 
    ? (targetRect.top + targetRect.height / 2) > window.innerHeight / 2 
    : (activeStep?.targetSelector === '#conversation_input_area' || activeStep?.targetSelector === '#conversation_suggestions_area');

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const change = () => setVoicesLoaded(true);
      window.speechSynthesis.addEventListener('voiceschanged', change);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', change);
    }
  }, []);

  // Sync index step based on active tab/state transitions when user manually navigates in case they miss standard hooks
  useEffect(() => {
    (window as any).isTutorialActive = isActive;
    return () => {
      (window as any).isTutorialActive = false;
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || stepIndex < 0) return;
    const step = TUTORIAL_STEPS[stepIndex];
    
    // Guard: If we are on 'choose_virginia' and appMode has naturally transitioned to 'CONVERSATION',
    // do NOT force it back to 'SETUP'. Instead, let the isStoryLoaded effect handle it.
    if (step && step.id === 'choose_virginia' && appMode === 'CONVERSATION') {
      return;
    }

    if (step && step.requiredMode !== appMode) {
      // Force app mode if it got shifted or needs sync
      setAppMode(step.requiredMode);
    }
  }, [stepIndex, appMode, isActive]);

  // Periodic pooling to capture highlighted element position
  useEffect(() => {
    if (!isActive || stepIndex < 0 || !activeStep) {
      setTargetRect(null);
      return;
    }

    const interval = setInterval(() => {
      if (activeStep.targetSelector) {
        const el = document.querySelector(activeStep.targetSelector);
        if (el) {
          const rect = el.getBoundingClientRect();
          setTargetRect(rect);
          
          // Apply pointer events & relative position dynamically so we don't break flex layouts
          const htmlEl = el as HTMLElement;
          htmlEl.style.position = 'relative';
          htmlEl.style.zIndex = '50';
          htmlEl.style.pointerEvents = 'auto';
        } else {
          setTargetRect(null);
        }
      } else {
        setTargetRect(null);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      // Clean up past styles
      if (activeStep?.targetSelector) {
        const el = document.querySelector(activeStep.targetSelector) as HTMLElement;
        if (el) {
          el.style.zIndex = '';
          el.style.pointerEvents = '';
        }
      }
    };
  }, [stepIndex, activeStep, isActive]);

  // Handle Speech synthesis speech when step changes
  useEffect(() => {
    if (!isActive || stepIndex < 0 || !activeStep) return;

    // Reset bypass block for other tutorial steps
    if (activeStep.id !== 'listen_to_story' && activeStep.id !== 'first_speech') {
      (window as any).bypassTutorialSpeechBlock = false;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleaned = activeStep.voiceText.replace(/\*.*?\*/g, "").replace(/\(.*?\)/g, "").trim();
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.5; // Increase speech speed to 1.5x
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt')) || voices.find(v => v.lang.startsWith('es'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }
      
      // We no longer trigger initial story speech automatically when 'listen_to_story' tutorial speech ends.
      // Instead, we wait for the user to explicitly click "Continuar" which advances the step to 'first_speech' and plays once.
      
      window.speechSynthesis.speak(utterance);
    }

    if (activeStep.id === 'first_speech') {
      if (typeof (window as any).triggerInitialStorySpeech === 'function') {
        (window as any).triggerInitialStorySpeech();
      }
    }
  }, [stepIndex, activeStep, isActive]);

  // Listen to external click mechanics or dynamic state changes to auto-advance steps!
  useEffect(() => {
    if (!isActive || stepIndex < 0 || !activeStep) return;

    // Fast-advancing click actions - clicking any highlighted element automatically advances the step (must be ActionType click)
    if (activeStep.actionType === 'click' && activeStep.targetSelector) {
      const el = document.querySelector(activeStep.targetSelector);
      if (el) {
        const handleTargetClick = () => {
          setTimeout(() => {
            handleNextStep();
          }, 300);
        };
        el.addEventListener('click', handleTargetClick);
        return () => el.removeEventListener('click', handleTargetClick);
      }
    }
  }, [stepIndex, activeStep, targetRect, isActive]);

  // Advance choose_virginia only when the story is actually loaded!
  useEffect(() => {
    if (isActive && activeStep?.id === 'choose_virginia' && isStoryLoaded) {
      handleNextStep();
    }
  }, [isActive, activeStep, isStoryLoaded]);

  // Event-based callback to advance first_speech on user reply
  useEffect(() => {
    if (!isActive) return;

    (window as any).onTutorialUserReplied = () => {
      if (activeStep?.id === 'first_speech') {
        setFirstSpeechPhase('completed');
        setTimeout(() => {
          handleNextStep();
        }, 1500);
      }
    };

    return () => {
      delete (window as any).onTutorialUserReplied;
    };
  }, [isActive, activeStep, stepIndex]);

  // Ensure and check automatic transitions when active selectors are missing or need next steps
  const handleNextStep = () => {
    if (stepIndex === TUTORIAL_STEPS.length - 1) {
      // Finished!
      handleQuit();
    } else {
      const nextIdx = stepIndex + 1;
      const nextStep = TUTORIAL_STEPS[nextIdx];

      // Exclusivity actions: If transition to course
      if (activeStep?.id === 'transition_to_course') {
        setAppMode('COURSE');
      }

      setStepIndex(nextIdx);
    }
  };

  const handleQuit = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // Clean all inline custom styles injected dynamically
    TUTORIAL_STEPS.forEach(step => {
      if (step.targetSelector) {
        const el = document.querySelector(step.targetSelector) as HTMLElement;
        if (el) {
          el.style.zIndex = '';
          el.style.pointerEvents = '';
          el.classList.remove('tutorial-highlight-pulsing');
        }
      }
    });
    onFinish();
  };

  // Initial trigger
  const handleStartOnboarding = () => {
    setShowVolumeWarning(true);
  };

  const handleBeginVoiceTutorial = () => {
    setHasConfirmed(true);
    setShowVolumeWarning(false);
    
    // Clear any previous active story so setup is predictively triggered during tutorial
    localStorage.removeItem('fluent_story_loaded');
    localStorage.removeItem('fluent_sim_state');
    if (setIsStoryLoaded) {
      setIsStoryLoaded(false);
    }

    // Initialize state
    setAppMode('MENU');
    setStepIndex(0);
  };

  if (!isActive) return null;

  return (
    <div id="tutorial_onboarding_controller" className="fixed inset-0 z-50 pointer-events-none font-sans select-none">
      
      {/* 1. GREET DIALOG (WANT TUTORIAL?) */}
      {!hasConfirmed && !showVolumeWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto font-serif">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white border border-[#e8e2d5] rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl text-center space-y-6 pointer-events-auto"
          >
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-classic-cream border border-[#dfcbb0]">
              <span className="text-3xl">🎓</span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-classic-gold block">Bem-vindo ao Onboarding</span>
              <h3 className="text-2xl font-serif font-bold text-classic-ink">Tutorial Inicial</h3>
              <p className="text-[#8e8574] text-xs font-sans leading-relaxed">
                Gostaria de conhecer rapidamente como o aplicativo funciona, sua lógica de ensino e a integração imersiva?
              </p>
            </div>

            <div className="space-y-2 pt-2 font-sans">
              <button
                id="btn_start_tutorial_yes"
                onClick={handleStartOnboarding}
                className="w-full py-3 px-4 bg-classic-green hover:bg-classic-green-light text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-sm"
              >
                Iniciar Tutorial
              </button>
              <button
                id="btn_start_tutorial_no"
                onClick={handleQuit}
                className="w-full py-3 px-4 bg-classic-cream border border-[#e2dacb] text-[#7d715e] hover:bg-[#F0EBE0] font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
              >
                Pular Tutorial
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 2. AUDIO WARNING MESSAGE */}
      {showVolumeWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto font-serif">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white border border-[#e8e2d5] rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl text-center space-y-6 pointer-events-auto"
          >
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-amber-50 border border-amber-200">
              <Volume2 className="w-6 h-6 text-classic-gold animate-bounce" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-serif font-bold text-classic-ink">Aviso de Som</h3>
              <p className="text-[#8e8574] text-xs font-sans leading-relaxed">
                Este tutorial é conduzido principalmente por voz artificial em português. Ajuste o volume para uma melhor experiência.
              </p>
            </div>

            <button
              id="warn_voice_start_btn"
              onClick={handleBeginVoiceTutorial}
              className="w-full py-3.5 bg-classic-green hover:bg-classic-green-light text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
            >
              Começar
            </button>
          </motion.div>
        </div>
      )}

      {/* 3. ACTIVE STEPS BACKDROP AND INTERACTION MASK */}
      {hasConfirmed && activeStep && (
        <>
          {/* Elegant, fully non-blocking localized glowing highlight border/aura on the targeted element */}
          {targetRect && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed pointer-events-none z-50 rounded-2xl border-3 border-classic-gold shadow-[0_0_25px_rgba(178,138,82,0.85)] transition-all duration-300"
              style={{
                top: targetRect.top - 5,
                left: targetRect.left - 5,
                width: targetRect.width + 10,
                height: targetRect.height + 10,
              }}
            >
              <span className="absolute -top-2 -right-2 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-classic-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-classic-gold"></span>
              </span>
            </motion.div>
          )}

          {/* Floating explanation Card panel at the bottom or top depending on where the highlighted target is */}
          <div className={`fixed inset-x-0 ${isTargetInBottomHalf ? 'top-20 md:top-24' : 'bottom-4'} z-50 flex justify-center px-4 pointer-events-auto transition-all duration-300`}>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white border border-[#e2dacb] rounded-3xl p-5 md:p-6 shadow-xl max-w-md w-full space-y-4 font-sans text-classic-ink"
            >
              <div className="flex justify-between items-center border-b border-dashed border-[#f0ebe0] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">👩‍🏫</span>
                  <span className="text-[10px] font-mono font-bold tracking-wider text-classic-gold uppercase">GUIADO POR VOZ</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-mono text-[#8e8574]">
                  <span>ETAPA</span>
                  <strong className="text-classic-ink">{stepIndex + 1}</strong>
                  <span>DE</span>
                  <span>{TUTORIAL_STEPS.length}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-[#8e8574] leading-relaxed italic font-serif">
                  " {activeStep.displayText} "
                </p>
                {activeStep.actionType === 'click' && (
                  <p className="text-[10px] font-mono text-[#b28a52] uppercase font-bold tracking-wide mt-1.5 animate-pulse">
                    👉 Ação necessária: Clique no elemento indicado na tela.
                  </p>
                )}
                {activeStep.actionType === 'text_sent' && (
                  <p className="text-[10px] font-mono text-[#b28a52] uppercase font-bold tracking-wide mt-1.5 animate-pulse">
                    💬 Ação necessária: Envie sua primeira fala para prosseguir.
                  </p>
                )}
              </div>

              {/* Progress triggers */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <button
                  onClick={handleQuit}
                  className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-wider text-[#8e8574] hover:text-rose-600 cursor-pointer transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Pular Tutorial</span>
                </button>

                {activeStep.actionType === 'auto' && (
                  <button
                    onClick={handleNextStep}
                    className="py-2.5 px-5 bg-classic-green hover:bg-classic-green-light text-white text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <span>{stepIndex === TUTORIAL_STEPS.length - 1 ? "Começar minha jornada" : "Continuar"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}

    </div>
  );
}
