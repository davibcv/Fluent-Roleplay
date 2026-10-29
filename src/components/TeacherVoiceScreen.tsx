import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, MoreVertical, Volume2, VolumeX, Pause, RotateCcw, 
  Mic, MicOff, BookOpen, Sparkles, X, HelpCircle, GraduationCap, 
  Loader2, Keyboard, Send, CheckCircle2, Play, Check 
} from 'lucide-react';
import { IdentifiedError } from '../types';
import ActivePassiveLoader from './ActivePassiveLoader';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet } from '../utils/safeStorage';


interface TeacherVoiceScreenProps {
  grammaticalFocus: string;
  baselineProficiency: string;
  username: string;
  strengthsSummary?: string;
  globalErrors?: IdentifiedError[];
  onAdvanceProficiency: (adjustment: string, wasApproved?: boolean) => void;
  onTrackErrors: (errors: IdentifiedError[]) => void;
  onCompleteLesson: (summary: { pass: boolean; results: any[]; overall_explanation: string }) => void;
  onBackToTraditional: () => void;
  exerciseType?: 'GRAMMAR' | 'VOCABULARY' | 'CHUNKS';
  vocabWords?: { en: string; pt: string }[];
}

interface GrammarSummary {
  rule: string;
  examples: string[];
  pro_tip: string;
}

export default function TeacherVoiceScreen({
  grammaticalFocus,
  baselineProficiency,
  username,
  strengthsSummary = '',
  globalErrors = [],
  onAdvanceProficiency,
  onTrackErrors,
  onCompleteLesson,
  onBackToTraditional,
  exerciseType = 'GRAMMAR',
  vocabWords = []
}: TeacherVoiceScreenProps) {
  // Loading & Flow State
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'teacher'; text: string }>>([]);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [inputText, setInputText] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [sessionErrors, setSessionErrors] = useState<IdentifiedError[]>([]);
  
  // Custom Popup Modals
  const [showOptionsPopup, setShowOptionsPopup] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  
  // Static/Dynamic Rule Summary loaded from welcome request
  const [grammarSummary, setGrammarSummary] = useState<GrammarSummary>({
    rule: `Focaremos no estudo de ${grammaticalFocus} para calibrar sua flexibilidade e fluência natural.`,
    examples: ["Pratique conversando diretamente com a tutora por voz ou pelo teclado."],
    pro_tip: "Fale com clareza próximo ao microfone. O sotaque livre é aceitável, o foco está na estrutura correta!"
  });

  // Recording & Audio Analysis States
  const [isRecording, setIsRecording] = useState(false);
  const [speakingStatus, setSpeakingStatus] = useState<'idle' | 'recording' | 'processing' | 'speaking'>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');

  // Lesson Finalisation Screen
  const [evaluatingCompletion, setEvaluatingCompletion] = useState(false);
  const [completionPassed, setCompletionPassed] = useState(false);
  const [completionFeedback, setCompletionFeedback] = useState<{
    pass: boolean;
    explanation: string;
    missing_aspects: string[];
  } | null>(null);

  // Refs for media and scrolling
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const getTeacherCacheKey = () => `fluent_teacher_welcome_${grammaticalFocus}_${exerciseType || "GRAMMAR"}_${baselineProficiency || "intermediate"}`;

  // Initialize personalized welcome on mount with cache support
  useEffect(() => {
    let active = true;
    const cacheKey = getTeacherCacheKey();

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.text) {
          setMessages([{ sender: 'teacher', text: data.text }]);
          if (data.summary) setGrammarSummary(data.summary);
          setWelcomeLoading(false);
          setTimeout(() => {
            if (active && isTTSActive) {
              speakText(data.text);
            }
          }, 400);
          return;
        }
      }
    } catch (e) {
      console.warn("[TeacherVoiceScreen] Failed reading cached welcome:", e);
    }
    
    const loadPersonalizedWelcome = async () => {
      setWelcomeLoading(true);
      try {
        const response = await apiFetch('/api/teacher-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grammaticalFocus,
            baselineProficiency,
            username,
            strengthsSummary,
            globalErrors,
            exerciseType,
            vocabWords
          })
        });

        if (!response.ok) throw new Error("Erro de resposta");
        const data = await response.json();

        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (saveErr) {
          console.warn("[TeacherVoiceScreen] Failed saving welcome to cache:", saveErr);
        }

        if (active) {
          setMessages([{ sender: 'teacher', text: data.text }]);
          if (data.summary) {
            setGrammarSummary(data.summary);
          }
          setWelcomeLoading(false);
          
          // Auto speak if TTS active
          setTimeout(() => {
            if (active && isTTSActive) {
              speakText(data.text);
            }
          }, 600);
        }
      } catch (e) {
        console.error("Failed to load personalized welcome:", e);
        if (active) {
          const fallback = `Olá, ${username || 'Estudante'}! Eu sou a professora Madson, sua tutora particular de inglês. Hoje faremos uma aula focada em **${grammaticalFocus}** de acordo com sua proficiência. Vamos dar o primeiro passo prático?`;
          setMessages([{ sender: 'teacher', text: fallback }]);
          setWelcomeLoading(false);
          setTimeout(() => {
            if (active && isTTSActive) {
              speakText(fallback);
            }
          }, 600);
        }
      }
    };

    loadPersonalizedWelcome();

    return () => {
      active = false;
      stopAudioAnalyzer();
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    };
  }, [grammaticalFocus]);

  // Scroll downwards when new dialog messages are appended
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, welcomeLoading]);

  // Speech Helper to locate our lovely female Brazilian/US English friendly voice
  const getTeacherFemaleVoice = (): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const portugueseVoices = voices.filter(v => v.lang.startsWith('pt'));
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    const preferredKeywords = [
      'Google português do Brasil',
      'Luciana',
      'Maria',
      'Heloisa',
      'Daniela',
      'Microsoft Maria',
      'Google US English',
      'Samantha',
      'Zira'
    ];

    for (const kw of preferredKeywords) {
      const pMatch = portugueseVoices.find(v => v.name.includes(kw) || v.name.toLowerCase().includes(kw.toLowerCase()));
      if (pMatch) return pMatch;
      const eMatch = englishVoices.find(v => v.name.includes(kw) || v.name.toLowerCase().includes(kw.toLowerCase()));
      if (eMatch) return eMatch;
    }

    return portugueseVoices[0] || englishVoices[0] || null;
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Clears running queues

      const sanitised = text
        .replace(/\*\*([\s\S]*?)\*\*/g, "$1") // strip bold markers
        .replace(/\*([\s\S]*?)\*/g, "$1") // strip italics
        .replace(/`([^`]+)`/g, "$1") // strip backticks
        .trim();

      const utterance = new SpeechSynthesisUtterance(sanitised);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.5; // High speed speech rate set to 1.5x as requested

      const voice = getTeacherFemaleVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      utterance.onstart = () => setSpeakingStatus('speaking');
      utterance.onend = () => setSpeakingStatus('idle');
      utterance.onerror = () => setSpeakingStatus('idle');

      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingStatus('idle');
    }
  };

  const handleRepeatExplanation = () => {
    const lastTeacherMsg = [...messages].reverse().find(m => m.sender === 'teacher');
    if (lastTeacherMsg) {
      speakText(lastTeacherMsg.text);
    }
  };

  // Recording management services
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
      window.speechSynthesis.cancel();
      setLiveTranscript('');
      
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
        const average = sum / dataArrayRef.current.length;
        const level = Math.min(100, Math.round((average / 80) * 100));
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

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setSpeakingStatus('processing');
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size === 0) {
          alert("Não conseguimos capturar nenhum sinal de voz. Verifique o seu microfone e tente novamente!");
          setSpeakingStatus('idle');
          return;
        }

        try {
          setLiveTranscript("Processando voz...");
          const response = await apiFetch('/api/transcribe', {
            method: 'POST',
            body: audioBlob,
            headers: { 'Content-Type': mimeType }
          });

          if (!response.ok) throw new Error();
          
          const result = await response.json();
          const spokenText = (result.text || '').trim();
          
          if (spokenText) {
            setLiveTranscript(spokenText);
            submitStudentPhrase(spokenText);
          } else {
            alert("Não compreendemos bem as palavras. Tente falar mais pausadamente.");
            setSpeakingStatus('idle');
          }
        } catch (e) {
          console.error("Transcription failed", e);
          alert("Ajuste de rede temporário. Tente digitar usando o teclado clicando em Responder Digitando!");
          setSpeakingStatus('idle');
        }
      };

      mediaRecorder.start(200);
      isRecordingRef.current = true;
      setIsRecording(true);
      setSpeakingStatus('recording');
    } catch (err: any) {
      console.error(err);
      alert("Microfone negado ou não suportado no navegador.");
      setSpeakingStatus('idle');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
      stopAudioAnalyzer();
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const submitStudentPhrase = async (text: string) => {
    if (!text.trim()) return;

    const updatedHistory = [...messages, { sender: 'user' as const, text: text.trim() }];
    setMessages(updatedHistory);
    setInputText('');
    setLoading(true);
    setSpeakingStatus('processing');

    const savedNodesStr = localStorage.getItem('fluent_completed_nodes');
    let completedNodes: string[] = [];
    try {
      completedNodes = savedNodesStr ? JSON.parse(savedNodesStr) : [];
    } catch (e) {}

    try {
      const response = await apiFetch('/api/teacher-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: updatedHistory,
          grammaticalFocus,
          baselineProficiency,
          username,
          strengthsSummary,
          globalErrors,
          completedNodes,
          exerciseType,
          vocabWords
        })
      });

      if (!response.ok) throw new Error();

      const resData = await response.json();
      const replyText = resData.text || "Excelente raciocínio, vamos continuar trabalhando!";
      
      setMessages(prev => [...prev, { sender: 'teacher', text: replyText }]);

      // Error checking highlights
      if (resData.payload && resData.payload.identified_errors && resData.payload.identified_errors.length > 0) {
        const errorsWithTime = resData.payload.identified_errors.map((err: IdentifiedError) => ({
          ...err,
          timestamp: new Date().toLocaleTimeString()
        }));
        setSessionErrors(prev => [...errorsWithTime, ...prev]);
        onTrackErrors(errorsWithTime);
      }

      if (isTTSActive) {
        speakText(replyText);
      } else {
        setSpeakingStatus('idle');
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { sender: 'teacher', text: "Houve uma instabilidade rápida na minha conexão de áudio. Pode repetir por favor?" }]);
      setSpeakingStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSend = () => {
    if (!inputText.trim()) return;
    submitStudentPhrase(inputText);
  };

  const handleRestartLesson = () => {
    setShowOptionsPopup(false);
    setMessages([]);
    setSessionErrors([]);
    setCompletionFeedback(null);

    const cacheKey = getTeacherCacheKey();
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.text) {
          setMessages([{ sender: 'teacher', text: data.text }]);
          if (data.summary) setGrammarSummary(data.summary);
          setWelcomeLoading(false);
          if (isTTSActive) speakText(data.text);
          return;
        }
      }
    } catch (e) {
      console.warn("[TeacherVoiceScreen] Error reading cache on restart:", e);
    }

    setWelcomeLoading(true);

    apiFetch('/api/teacher-welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grammaticalFocus,
        baselineProficiency,
        username,
        strengthsSummary,
        globalErrors,
        exerciseType,
        vocabWords
      })
    })
    .then(res => res.json())
    .then(data => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (err) {
        console.warn("[TeacherVoiceScreen] Error caching on restart:", err);
      }
      setMessages([{ sender: 'teacher', text: data.text }]);
      if (data.summary) setGrammarSummary(data.summary);
      setWelcomeLoading(false);
      if (isTTSActive) speakText(data.text);
    })
    .catch(() => {
      const fallback = `Olá, ${username || 'Estudante'}! Vamos recomeçar nossa aula focada em **${grammaticalFocus}**.`;
      setMessages([{ sender: 'teacher', text: fallback }]);
      setWelcomeLoading(false);
      if (isTTSActive) speakText(fallback);
    });
  };

  const handleRefazerTutorial = () => {
    localStorage.removeItem('fluent_tutorial_done');
    window.location.reload();
  };

  // Evaluation criteria submit
  const handleFinaliseLesson = async () => {
    setEvaluatingCompletion(true);
    setCompletionFeedback(null);
    try {
      const response = await apiFetch('/api/teacher-evaluate-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messages,
          grammaticalFocus,
          baselineProficiency,
          username,
          exerciseType,
          vocabWords
        })
      });

      if (!response.ok) throw new Error();

      const result = await response.json();
      if (result.pass) {
        setCompletionPassed(true);
        setCompletionFeedback({
          pass: true,
          explanation: result.explanation || "Sua aula com a tutora particular Madson foi fantástica! Você aplicou o vocabulário e a gramática com maestria.",
          missing_aspects: []
        });

        // Save exerciseType to localStorage to support lesson distribution tracking
        if (exerciseType) {
          safeLocalStorageSet('fluent_last_exercise_type', exerciseType);
        }
        
        // Immediately trigger parent progress update and clear difficulties
        onAdvanceProficiency('-4 Days', true);

        // Speak completion text gracefully
        if (isTTSActive) {
          speakText(result.explanation || "Parabéns! Aula concluída e plano de estudos atualizado com sucesso!");
        }
      } else {
        setCompletionFeedback({
          pass: false,
          explanation: result.explanation || "Muito bem, mas ainda restam alguns exercícios ou interações para fixar completamente a regra. Vamos continuar praticando por voz!",
          missing_aspects: result.missing_aspects || []
        });
        if (isTTSActive) {
          speakText(result.explanation || "Ainda faltam alguns pontos para dominar de vez esse conteúdo, vamos conversar mais!");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Houve uma instabilidade para conectar com a avaliação da Professora. Tente de novo!");
    } finally {
      setEvaluatingCompletion(false);
    }
  };

  // Return option button styling helper
  const handleOptionExit = () => {
    setShowOptionsPopup(false);
    onBackToTraditional();
  };

  // Render the Success State
  if (completionPassed && completionFeedback) {
    return (
      <div className="min-h-screen bg-classic-cream flex items-center justify-center p-4 sm:p-6 font-sans text-classic-ink">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border-2 border-[#e2dacb] rounded-3xl p-6 sm:p-10 max-w-xl w-full text-center space-y-6 shadow-md"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-500/20 text-[#2b5c43] flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-classic-gold bg-classic-ivory px-3 py-1 rounded-full border border-[#dfcbb0]">
              Aula Concluída com Sucesso
            </span>
            <h2 className="text-3xl font-serif font-black tracking-tight text-classic-ink pt-2">
              Progresso Consolidado!
            </h2>
            <p className="text-[#7d715e] text-sm font-medium">
              O próximo passo no estudo adaptativo já foi incorporado ao seu plano de estudos.
            </p>
          </div>

          <div className="bg-classic-cream border border-[#e2dacb] rounded-2xl p-5 text-left text-xs leading-relaxed text-classic-ink space-y-3 font-serif whitespace-pre-line shadow-inner max-h-[220px] overflow-y-auto">
            {completionFeedback.explanation}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <button
              onClick={() => {
                onCompleteLesson({
                  pass: true,
                  results: [],
                  overall_explanation: completionFeedback.explanation
                });
              }}
              className="bg-classic-green hover:bg-classic-green-light py-3 px-4 rounded-xl text-white font-serif font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-colors text-center"
            >
              Continuar Estudando
            </button>
            
            <button
              onClick={onBackToTraditional}
              className="bg-white border border-[#e2dacb] hover:bg-classic-cream py-3 px-4 rounded-xl text-classic-ink font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
            >
              Voltar ao Course
            </button>

            <button
              onClick={onBackToTraditional}
              className="bg-classic-cream border border-[#dfcbb0] hover:bg-[#F0EBE0] py-3 px-4 rounded-xl text-[#7d715e] font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
            >
              Menu Principal
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-classic-cream font-serif text-classic-ink flex flex-col relative">
      
      {/* 1. Header Bar following exact requested layout */}
      <header className="border-b border-[#e2dacb] bg-white/70 backdrop-blur-md px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs select-none">
        
        {/* Left Action */}
        <button
          onClick={onBackToTraditional}
          className="flex items-center gap-1.5 text-xs text-[#7d715e] hover:text-classic-gold transition-colors font-sans font-bold uppercase tracking-wider cursor-pointer bg-transparent border-0"
        >
          <ChevronLeft className="w-4 h-4 text-classic-gold" />
          <span>← Menu Principal</span>
        </button>

        {/* Center Title */}
        <div className="text-center">
          <h1 className="text-base sm:text-lg font-serif font-bold tracking-tight">Professora</h1>
        </div>

        {/* Right Action */}
        <div className="relative">
          <button
            onClick={() => setShowOptionsPopup(!showOptionsPopup)}
            className="p-1.5 rounded-lg border border-[#e2dacb] hover:bg-classic-cream text-[#7d715e] hover:text-classic-ink transition-all cursor-pointer bg-white"
            title="Menu de Ajustes"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Options Dropdown Menu */}
          <AnimatePresence>
            {showOptionsPopup && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowOptionsPopup(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-52 bg-white border border-[#e2dacb] rounded-2xl shadow-lg p-2.5 z-40 space-y-1 font-sans text-xs"
                >
                  <button
                    onClick={handleOptionExit}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-rose-700 hover:text-rose-800 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Encerrar Aula</span>
                  </button>
                  <button
                    onClick={handleOptionExit}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-classic-ink transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <GraduationCap className="w-4 h-4 text-classic-gold" />
                    <span>Escolher Outra Aula</span>
                  </button>
                  <button
                    onClick={handleRestartLesson}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-classic-ink transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4 text-classic-gold" />
                    <span>Refazer Aula Atual</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowOptionsPopup(false);
                      setShowVoiceSettings(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-classic-ink transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Volume2 className="w-4 h-4 text-classic-gold" />
                    <span>Configurações de Voz</span>
                  </button>
                  <button
                    onClick={handleRefazerTutorial}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-classic-ink transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-classic-gold" />
                    <span>Refazer Tutorial</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowOptionsPopup(false);
                      setShowHelpPopup(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-classic-cream rounded-xl text-classic-ink transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4 text-classic-gold" />
                    <span>Ajuda</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* 2. Main Content Body Area structured as study desk layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        
        {vocabWords && vocabWords.length > 0 && (
          <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-lg">📙</span>
              <div>
                <h4 className="text-xs font-serif font-bold text-amber-900">Palavras-Chave para Praticar</h4>
                <p className="text-[10px] text-amber-700 font-sans mt-0.5">
                  Use estas 5 palavras em suas falas com a Madson para demonstrar domínio!
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
              {vocabWords.map((word, idx) => (
                <span key={idx} className="text-[10px] bg-white border border-amber-200 text-amber-900 rounded-lg px-2.5 py-1 font-mono font-bold shadow-xs">
                  {word.en} <span className="text-[8px] text-amber-600 font-normal">({word.pt})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Class metadata with avatar and objective */}
        <div className="bg-white border border-[#e2dacb] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-full border border-[#dfcbb0] bg-classic-cream flex items-center justify-center text-2xl shadow-sm tracking-normal">
              👩‍🏫
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-serif font-extrabold text-sm text-classic-ink">Professora Madson</span>
                <span className="bg-[#FAF6EE] text-[9.5px] text-[#7d715e] font-mono border border-[#e2dacb] px-2 py-0.5 rounded-full font-bold">
                  TUTORIA INDIVIDUAL
                </span>
              </div>
              <h3 className="font-sans text-[#7d715e] text-[11px] uppercase tracking-wider font-extrabold flex items-center gap-1 mt-0.5">
                Conteúdo: <span className="text-classic-gold font-bold">{grammaticalFocus}</span>
              </h3>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] font-mono text-[#b0a590] uppercase tracking-widest block font-bold">
              Lição em andamento
            </span>
          </div>
        </div>

        {/* Open Workbook Workspace style, replacing typical messy multi-bubble chat */}
        <div className="bg-white border border-[#e2dacb] rounded-3xl flex-1 flex flex-col h-[380px] sm:h-[450px] overflow-hidden shadow-xs relative">
          
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
            
            {welcomeLoading ? (
              <ActivePassiveLoader 
                title="Preparando sua aula..."
                subtitle="A Professora Madson está formulando um roteiro adaptado com base no seu histórico pedagógico."
                globalErrors={globalErrors}
              />
            ) : (
              <>
                {/* Clean dialogue log, open workbook format */}
                {messages.map((m, idx) => {
                  const isTeacher = m.sender === 'teacher';
                  
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3.5 max-w-2xl ${isTeacher ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                    >
                      {/* Quiet symbol marker */}
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs shrink-0 select-none ${
                        isTeacher ? 'bg-[#FAF6EE] border-[#dfcbb0] text-classic-gold text-sm' : 'bg-classic-ink border-classic-ink text-white'
                      }`}>
                        {isTeacher ? '👩‍🏫' : 'U'}
                      </div>

                      {/* Quietly refined sheet paper segment */}
                      <div className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed border shadow-xs transition-colors ${
                        isTeacher 
                          ? 'bg-white border-[#e2dacb] text-classic-ink font-serif' 
                          : 'bg-[#FAF6EE] border-[#e2dacb]/60 text-[#4c4438] font-sans'
                      }`}>
                        
                        {/* Highlights bold text patterns within the spoken dialogue */}
                        {m.text.split('\n\n').map((block, bi) => (
                          <p key={bi} className={bi > 0 ? "mt-2" : ""}>
                            {block.split('**').map((part, pi) => {
                              if (pi % 2 === 1) {
                                return <strong key={pi} className="text-classic-gold font-extrabold px-0.5 bg-classic-cream/50 rounded">{part}</strong>;
                              }
                              return part;
                            })}
                          </p>
                        ))}

                        {/* Auditory assistance buttons inside the teacher message block */}
                        {isTeacher && (
                          <div className="mt-3 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => speakText(m.text)}
                              className="flex items-center gap-1.5 text-[9px] font-mono text-[#7d715e] hover:text-classic-gold bg-classic-cream border border-[#e2dacb] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3 text-classic-gold" /> Ouvir Novamente
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {loading && (
                  <div className="flex gap-3.5 mr-auto items-center animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-classic-cream border border-[#dfcbb0] text-xs flex items-center justify-center">
                      👩‍🏫
                    </div>
                    <div className="bg-white border border-[#e2dacb] px-4.5 py-3 rounded-2xl text-[11px] font-mono text-[#7d715e] flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-classic-gold animate-spin" /> A Professora Madson está formulando áudio adaptado...
                    </div>
                  </div>
                )}
              </>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Subtitle speaking status & active transcription */}
          <div className="border-t border-[#e2dacb] bg-[#FAF6EE]/50 px-4 py-2 flex items-center justify-center gap-2 font-sans select-none shrink-0 min-h-[36px]">
            {liveTranscript ? (
              <span className="text-[11px] text-[#7d715e] italic text-center leading-normal">
                "{liveTranscript}"
              </span>
            ) : speakingStatus === 'speaking' ? (
              <div className="flex items-center gap-1.5 text-[10px] text-classic-gold uppercase tracking-wider font-extrabold animate-pulse">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Professora Madson Falando...</span>
              </div>
            ) : speakingStatus === 'recording' ? (
              <div className="flex items-center gap-1.5 text-[10px] text-rose-600 uppercase tracking-wider font-extrabold animate-pulse">
                <Mic className="w-3.5 h-3.5" />
                <span>Gravando seu áudio em inglês...</span>
              </div>
            ) : (
              <span className="text-[10px] text-[#b0a590] uppercase tracking-wider font-bold">
                Mantenha paciência e use o controle de áudio abaixo
              </span>
            )}
          </div>

          {/* Fallback Keyboard Input Area */}
          <AnimatePresence>
            {showKeyboard && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-[#e2dacb] bg-[#FAF6EE]/20 p-2.5 flex gap-2 shrink-0 font-sans"
              >
                <input
                  type="text"
                  placeholder="Se preferir, digite sua frase para a Professora Madson..."
                  className="flex-1 bg-[#FAF6EE] border border-[#e2dacb]/60 rounded-xl px-4.5 py-2.5 text-sm text-classic-ink placeholder-[#b0a590] focus:outline-none focus:border-classic-gold font-serif"
                  value={inputText}
                  disabled={loading || isRecording || welcomeLoading}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManualSend();
                  }}
                />
                <button
                  type="button"
                  onClick={handleManualSend}
                  disabled={loading || !inputText.trim() || isRecording || welcomeLoading}
                  className="bg-classic-green hover:bg-classic-green-light disabled:opacity-40 text-white font-bold w-10 h-10 rounded-xl transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. Dedicated Audio Focal Controls following user specifications */}
        <div className="bg-white border border-[#e2dacb] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
          
          {/* Functional utilities button array */}
          <div className="flex flex-wrap items-center justify-center gap-2 w-full md:w-auto">
            
            {/* Audio Toggle button */}
            <button
              onClick={() => {
                const nextVal = !isTTSActive;
                setIsTTSActive(nextVal);
                if (!nextVal) stopSpeaking();
              }}
              className={`px-3.5 py-2 rounded-xl border font-sans font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isTTSActive 
                  ? 'bg-classic-cream border-[#dfcbb0] text-classic-gold' 
                  : 'bg-white border-[#e2dacb] text-[#b0a590]'
              }`}
            >
              {isTTSActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{isTTSActive ? "Áudio Ativado" : "Áudio Mudo"}</span>
            </button>

            {/* Stop current audio */}
            <button
              onClick={stopSpeaking}
              disabled={speakingStatus !== 'speaking'}
              className="px-3.5 py-2 bg-white border border-[#e2dacb] hover:bg-classic-cream rounded-xl font-sans font-bold text-xs text-[#7d715e] active:text-classic-ink transition-all cursor-pointer disabled:opacity-40"
              title="Pausar voz artificial"
            >
              <Pause className="w-3.5 h-3.5 text-classic-gold inline mr-1" /> Pausar
            </button>

            {/* Re-Speak last message */}
            <button
              onClick={handleRepeatExplanation}
              disabled={loading || welcomeLoading || messages.length === 0}
              className="px-3.5 py-2 bg-white border border-[#e2dacb] hover:bg-classic-cream rounded-xl font-sans font-bold text-xs text-[#7d715e] active:text-classic-ink transition-all cursor-pointer disabled:opacity-40"
              title="Repetir última fala"
            >
              <RotateCcw className="w-3.5 h-3.5 text-classic-gold inline mr-1" /> Repetir Esplanada
            </button>

            {/* Display grammar popup */}
            <button
              onClick={() => setShowSummaryPopup(true)}
              className="px-3.5 py-2 bg-white border border-classic-gold/30 hover:border-classic-gold rounded-xl font-sans font-bold text-xs text-classic-gold hover:bg-classic-cream transition-all cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 inline mr-1 text-classic-gold" /> Ver Resumo
            </button>

            {/* Keyboard activator */}
            <button
              type="button"
              onClick={() => setShowKeyboard(!showKeyboard)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                showKeyboard 
                  ? 'bg-classic-cream border-[#dfcbb0]' 
                  : 'bg-white border-[#e2dacb] hover:bg-classic-cream'
              }`}
              title="Responder escrevendo"
            >
              <Keyboard className="w-4 h-4 text-classic-gold" />
            </button>
          </div>

          {/* Central Microphone active Orb */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end shrink-0">
            <span className="text-[10px] font-sans font-extrabold text-[#7d715e] uppercase tracking-wider block text-right">
              {speakingStatus === 'recording' ? "Escutando..." : "Responder por Voz:"}
            </span>
            <button
              onClick={handleToggleRecording}
              disabled={loading || welcomeLoading}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 relative shadow-xs ${
                speakingStatus === 'recording'
                  ? 'bg-rose-600 border-rose-600 text-white scale-105'
                  : 'bg-classic-cream border-[#dfcbb0] hover:border-classic-gold text-classic-gold'
              }`}
            >
              {speakingStatus === 'recording' ? (
                <MicOff className="w-5 h-5 text-white animate-pulse" />
              ) : (
                <Mic className="w-5 h-5 text-classic-gold" />
              )}

              {speakingStatus === 'recording' && (
                <span className="absolute -inset-1 rounded-full border-2 border-rose-500/20 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Failed requirements block, customized from completion evaluations */}
        {completionFeedback && !completionFeedback.pass && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#faf1ed] border border-amber-600/20 rounded-2xl p-5 space-y-3 font-sans text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">👩‍🏫</span>
              <h4 className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-[#7d715e]">
                Observação da Tutora Madson
              </h4>
            </div>
            <p className="text-classic-ink leading-relaxed font-serif text-sm">
              {completionFeedback.explanation}
            </p>
            {completionFeedback.missing_aspects && completionFeedback.missing_aspects.length > 0 && (
              <div className="pt-2 border-t border-[#e2da7b]/30 space-y-1.5 text-[11px]">
                <span className="font-bold text-classic-gold">Práticas que você deve tentar antes de concluir:</span>
                {completionFeedback.missing_aspects.map((aspect, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[#7d715e]">
                    <span className="text-rose-600 font-bold shrink-0">✕</span>
                    <span>{aspect}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Lesson Consolidator action card */}
        <div className="bg-[#FAF6EE] border border-[#e2dacb] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-inner">
          <div className="space-y-1 max-w-lg text-center sm:text-left">
            <h4 className="font-serif font-extrabold text-sm text-classic-ink">Consolidação Conversacional</h4>
            <p className="font-sans text-[#7d715e] text-xs leading-relaxed">
              Deseja submeter a conversa à Professora para atestar sua proficiência e atualizar seu plano de estudos?
            </p>
          </div>

          <button
            onClick={handleFinaliseLesson}
            disabled={evaluatingCompletion || loading || welcomeLoading || messages.length < 2}
            className="px-5 py-3.5 bg-classic-green hover:bg-classic-green-light disabled:opacity-40 text-white font-serif font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform shadow-sm"
          >
            {evaluatingCompletion ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analisando aula...</span>
              </>
            ) : (
              "Finalizar Aula e Concluir"
            )}
          </button>
        </div>
      </main>

      {/* ========================================================= */}
      {/* OVERLAY POPUP MODALS                                      */}
      {/* ========================================================= */}

      {/* 1. Voice settings configurations sub-popup */}
      <AnimatePresence>
        {showVoiceSettings && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans text-classic-ink">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#e2dacb] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-lg relative"
            >
              <button
                onClick={() => setShowVoiceSettings(false)}
                className="absolute top-4 right-4 text-[#7d715e] hover:text-classic-ink cursor-pointer bg-transparent border-0"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center space-y-1">
                <span className="text-[9px] font-mono text-classic-gold font-bold uppercase tracking-wider block">Estilo de Som</span>
                <h3 className="text-lg font-serif font-extrabold leading-tight">Configurações de Voz</h3>
              </div>

              <div className="space-y-3.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#7d715e]">Falar respostas em áudio</span>
                  <button
                    onClick={() => setIsTTSActive(!isTTSActive)}
                    className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold ${
                      isTTSActive 
                        ? 'bg-classic-cream border-[#dfcbb0] text-classic-gold' 
                        : 'bg-white border-[#e2dacb] text-[#b0a590]'
                    }`}
                  >
                    {isTTSActive ? "LIGADO" : "MUTADO"}
                  </button>
                </div>

                <div className="bg-classic-cream p-3 rounded-xl border border-[#e2dacb] text-[11px] leading-relaxed text-[#7d715e] space-y-1">
                  <p className="font-bold">⚡ Velocidade Inteligente:</p>
                  <p>A velocidade de fala está ajustada em <strong className="text-classic-gold font-bold">1,5x</strong> para treinar seu listening de forma ágil e otimizar o tempo de conversação.</p>
                </div>
              </div>

              <button
                onClick={() => setShowVoiceSettings(false)}
                className="bg-classic-green hover:bg-classic-green-light py-2 px-4 rounded-xl text-white font-bold text-xs uppercase tracking-wider cursor-pointer w-full mt-2"
              >
                Salvar Ajustes
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Ajuda / Guidance dialog popup */}
      <AnimatePresence>
        {showHelpPopup && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans text-classic-ink">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#e2dacb] rounded-3xl p-6 max-w-md w-full space-y-5 shadow-lg relative"
            >
              <button
                onClick={() => setShowHelpPopup(false)}
                className="absolute top-4 right-4 text-[#7d715e] hover:text-classic-ink cursor-pointer bg-transparent border-0"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 pb-1.5 border-b border-[#e2dacb]">
                <HelpCircle className="w-5 h-5 text-classic-gold shrink-0" />
                <h3 className="text-base font-serif font-extrabold">Como estudar com a Madson</h3>
              </div>

              <div className="space-y-3 text-xs leading-relaxed text-[#7d715e] max-h-[300px] overflow-y-auto pr-1">
                <p>
                  • <strong className="text-classic-ink">Privacidade Total:</strong> A aula simula uma mentoria tradicional. Use a sua voz clicando no ícone do microfone para treinar sua pronúncia.
                </p>
                <p>
                  • <strong className="text-classic-ink">Voz Express / 1,5x:</strong> O sotaque da professora é modelado de forma clara a 1,5x permitindo que você ouça explicações sintéticas sem delongas.
                </p>
                <p>
                  • <strong className="text-classic-ink">Plano Adaptativo:</strong> Ela já conhece o seu histórico. Não tenha medo de errar: eventuais deslizes serão mapeados e integrados silenciosamente ao seu portfólio.
                </p>
                <p>
                  • <strong className="text-classic-ink">Como Concluir:</strong> Quando sentir que domina a regra gramática e dialogou de forma significativa, clique no botão inferior de "Finalizar Aula" para avaliar seu andamento!
                </p>
              </div>

              <button
                onClick={() => setShowHelpPopup(false)}
                className="bg-classic-green hover:bg-classic-green-light py-2.5 px-4 rounded-xl text-white font-bold text-xs uppercase tracking-wider cursor-pointer w-full text-center"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Ver Resumo Dynamic Pop-up Modal */}
      <AnimatePresence>
        {showSummaryPopup && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans text-classic-ink">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#e2dacb] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-lg relative flex flex-col max-h-[90vh]"
            >
              <button
                onClick={() => setShowSummaryPopup(false)}
                className="absolute top-4 right-4 text-[#7d715e] hover:text-classic-ink cursor-pointer bg-transparent border-0"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#e2dacb] shrink-0">
                <BookOpen className="w-5 h-5 text-classic-gold" />
                <div>
                  <span className="text-[9px] font-mono text-classic-gold font-bold uppercase tracking-wider block">Resumo de Estudo</span>
                  <h3 className="text-base font-serif font-extrabold">{grammaticalFocus}</h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs sm:text-sm leading-relaxed text-classic-ink py-2">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-[#7d715e] font-sans text-[10px] uppercase tracking-wider">A Regra Prática:</h4>
                  <p className="font-serif italic leading-relaxed text-[#2b261f]">
                    {grammarSummary.rule}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-[#e2dacb]/60">
                  <h4 className="font-bold text-[#7d715e] font-sans text-[10px] uppercase tracking-wider">Exemplos Práticos:</h4>
                  <ul className="space-y-1.5 list-disc pl-4 font-serif">
                    {grammarSummary.examples.map((ex, idx) => (
                      <li key={idx} className="text-[#3c362d]">{ex}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-classic-cream border border-[#e2dacb] p-3.5 rounded-xl space-y-1.5 shrink-0">
                  <h5 className="font-bold text-[10px] font-sans uppercase tracking-wider text-classic-gold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Dica de Ouro:
                  </h5>
                  <p className="text-[11px] leading-relaxed font-sans text-[#7d715e]">
                    {grammarSummary.pro_tip}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSummaryPopup(false)}
                className="bg-classic-green hover:bg-classic-green-light py-2.5 px-4 rounded-xl text-white font-bold text-xs uppercase tracking-wider cursor-pointer w-full text-center shrink-0"
              >
                Fechar Resumo
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
