import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Send, HelpCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { IdentifiedError } from '../types';
import ActivePassiveLoader from './ActivePassiveLoader';
import { apiFetch } from '../utils/api';


interface AlignmentScreenProps {
  username: string;
  onCompleted: (data: {
    baselineProficiency: string;
    identifiedErrors: IdentifiedError[];
    nextGrammaticalFocus: string;
    estimatedMonths: number;
    summary: string;
    answers: { q1: string; q2: string; q3: string };
  }) => void;
}

export default function AlignmentScreen({ username, onCompleted }: AlignmentScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState({ q1: '', q2: '', q3: '' });
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Setup Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => setIsRecording(true);
      rec.onend = () => setIsRecording(false);
      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        appendTranscription(text);
      };
      rec.onerror = (err: any) => {
        console.error("Speech Recognition Error:", err);
        setIsRecording(false);
      };
      setRecognition(rec);
    }
  }, [step]);

  const toggleRecording = () => {
    if (!recognition) {
      alert("O reconhecimento de voz não é totalmente suportado neste navegador. Digitar funciona perfeitamente!");
      return;
    }
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const appendTranscription = (text: string) => {
    setAnswers((prev) => {
      const current = prev[`q${step}` as keyof typeof prev] || '';
      return {
        ...prev,
        [`q${step}`]: current ? `${current} ${text}` : text,
      };
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setAnswers((prev) => ({
      ...prev,
      [`q${step}`]: value,
    }));
  };

  const handleNext = () => {
    if (step < 3) {
      setStep((prev) => (prev + 1) as any);
    } else {
      submitDiagnostic();
    }
  };

  const submitDiagnostic = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await apiFetch('/api/align-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to analyze your vocabulary and grammar alignment');
      }

      const result = await response.json();
      
      // Parse days offset adjustment to calculate estimated months to fluency
      let daysAdjustment = 0;
      const match = result.planning_updates?.estimated_months_to_fluency_adjustment?.match(/([+-]?\d+)/);
      if (match) {
        daysAdjustment = parseInt(match[1]);
      }
      
      const baselineMonths = result.baseline_proficiency === 'Beginner' ? 14 : result.baseline_proficiency === 'Intermediate' ? 8 : 4;
      const finalMonths = Math.max(2, baselineMonths + (daysAdjustment / 30));

      onCompleted({
        baselineProficiency: result.baseline_proficiency || 'Intermediate',
        identifiedErrors: result.identified_errors || [],
        nextGrammaticalFocus: result.planning_updates?.next_grammatical_focus || 'Present Perfect',
        estimatedMonths: parseFloat(finalMonths.toFixed(1)),
        summary: result.overall_summary || 'Conversa inicial concluída com sucesso.',
        answers
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Connecting to evaluation failed.');
    } finally {
      setLoading(false);
    }
  };

  const questions = {
    1: {
      question: "Could you tell me a little bit about what you did yesterday evening?",
    },
    2: {
      question: "Have you ever traveled to another city or country? What has been your most memorable trip so far?",
    },
    3: {
      question: "If you could change one thing about your country's education system, what would it be and why?",
    }
  };

  const currentQ = questions[step];

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-[#e8e2d5] rounded-3xl p-8 md:p-10 shadow-sm relative overflow-hidden"
      >
        {/* Elegant top ornament */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-classic-gold/30 via-classic-gold to-classic-gold/30" />

        {/* Diagnostic Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif font-semibold text-classic-ink">
            Antes de começarmos
          </h2>
          <p className="text-[#7d715e] text-sm font-light mt-2 max-w-sm mx-auto">
            Primeiro faremos um breve nivelamento para entender seu inglês.
          </p>
        </div>

        {/* Loader State */}
        {loading ? (
          <ActivePassiveLoader 
            title="Analisando suas respostas..."
            subtitle="Avaliando a estrutura gramatical e vocabulário espontâneo para planejar sua jornada de imersão."
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <span className="text-[11px] font-mono tracking-wider text-classic-gold uppercase block text-center mb-3">
                  Pergunta {step} de 3
                </span>
                <h3 className="text-xl md:text-2xl font-serif text-classic-ink text-center leading-snug px-2">
                  "{currentQ.question}"
                </h3>
              </div>

              {/* Dictation and Text Input area */}
              <div className="relative mt-6">
                <textarea
                  id={`diagnostic_textarea_${step}`}
                  className="w-full h-44 bg-classic-cream border border-[#e2dacb] rounded-2xl p-5 text-classic-ink placeholder-[#b0a590] focus:outline-none focus:ring-1 focus:ring-classic-gold/40 focus:border-classic-gold transition-all resize-none text-base font-serif"
                  placeholder="Escreva sua resposta em inglês aqui..."
                  value={answers[`q${step}` as keyof typeof answers]}
                  onChange={handleInputChange}
                />
                
                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#b28a52]/10 px-3 py-1 rounded-full border border-[#b28a52]/20">
                    <span className="h-2 w-2 rounded-full bg-classic-gold animate-ping" />
                    <span className="text-[10px] font-mono text-classic-gold font-bold">GRAVANDO</span>
                  </div>
                )}
              </div>

              {/* Audio Controls & Next actions */}
              <div className="flex items-center justify-between mt-6 gap-4">
                <button
                  id="toggle_mic_btn"
                  onClick={toggleRecording}
                  type="button"
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-mono tracking-wider transition-all cursor-pointer ${
                    isRecording 
                      ? 'bg-classic-gold text-white shadow-sm' 
                      : 'bg-classic-cream border border-[#e2dacb] text-[#7d715e] hover:bg-[#FAF6EE]'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  {isRecording ? "Parar de ouvir" : "Falar resposta"}
                </button>

                <button
                  id="diagnostic_next_btn"
                  onClick={handleNext}
                  disabled={!answers[`q${step}` as keyof typeof answers]?.trim()}
                  className="flex items-center gap-2 bg-classic-green hover:bg-classic-green-light disabled:opacity-40 disabled:hover:bg-classic-green text-white px-6 py-3 rounded-xl text-xs font-semibold tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  <span>{step === 3 ? 'Analisar e Começar' : 'Próxima pergunta'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {errorMessage && (
          <div className="bg-[#ff150008] border border-rose-500/20 text-classic-ink p-4 rounded-xl text-xs mt-6 text-left space-y-2">
            {errorMessage.toLowerCase().includes("quota") || errorMessage.includes("429") ? (
              <>
                <div className="flex items-center gap-2 text-rose-800 font-bold font-serif">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Modelo Ocupado (Limite Excedido)</span>
                </div>
                <p className="text-xs text-[#7d715e] leading-relaxed">
                  O limite temporário de uso gratuito da API do Gemini foi atingido. Aguarde alguns segundos e tente enviar novamente.
                </p>
              </>
            ) : (
              <span className="text-rose-800 block text-center leading-normal">{errorMessage}</span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
