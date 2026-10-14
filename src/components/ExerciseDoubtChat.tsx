import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Volume2, Sparkles, HelpCircle, MessageSquare } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet } from '../utils/safeStorage';

export interface ExerciseDoubtMessage {
  id: string;
  sender: 'user' | 'teacher';
  text: string;
  timestamp: string;
}

export interface ExerciseDoubtContext {
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  grammaticalFocus: string;
  exerciseType?: 'GRAMMAR' | 'VOCABULARY' | 'CHUNKS';
  phase: string;
  questionNumber: number;
  totalQuestions: number;
  userAnswer?: string;
  isAnswerChecked?: boolean;
  vocabWords?: Array<{ en: string; pt: string }>;
}

interface ExerciseDoubtChatProps {
  exerciseKey: string;
  exerciseContext: ExerciseDoubtContext;
  username?: string;
  baselineProficiency?: string;
}

export default function ExerciseDoubtChat({
  exerciseKey,
  exerciseContext,
  username = 'Aluno',
  baselineProficiency = 'Intermediate',
}: ExerciseDoubtChatProps) {
  const [messages, setMessages] = useState<ExerciseDoubtMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Load conversation from localStorage whenever exerciseKey changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fluent_exercise_doubts');
      if (stored) {
        const doubtsMap: Record<string, ExerciseDoubtMessage[]> = JSON.parse(stored);
        if (Array.isArray(doubtsMap[exerciseKey]) && doubtsMap[exerciseKey].length > 0) {
          setMessages(doubtsMap[exerciseKey]);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading exercise doubts from localStorage:', e);
    }
    // If no previous messages for this exercise, set empty array
    setMessages([]);
    setInputText('');
  }, [exerciseKey]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const saveMessages = (newMessages: ExerciseDoubtMessage[]) => {
    setMessages(newMessages);
    try {
      const stored = localStorage.getItem('fluent_exercise_doubts');
      let doubtsMap: Record<string, ExerciseDoubtMessage[]> = {};
      if (stored) {
        try {
          doubtsMap = JSON.parse(stored);
        } catch {}
      }
      doubtsMap[exerciseKey] = newMessages;
      safeLocalStorageSet('fluent_exercise_doubts', JSON.stringify(doubtsMap));
    } catch (e) {
      console.error('Error saving exercise doubts:', e);
    }
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || loading) return;

    const userMsg: ExerciseDoubtMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    const updatedWithUser = [...messages, userMsg];
    saveMessages(updatedWithUser);
    setInputText('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/exercise-doubt-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: updatedWithUser.map((m) => ({ sender: m.sender, text: m.text })),
          userQuery: trimmed,
          exerciseContext,
          username,
          baselineProficiency,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao obter resposta da professora');
      }

      const data = await response.json();
      const teacherReplyText =
        data.text ||
        'Estou aqui para ajudar! Pode me perguntar qualquer detalhe sobre este exercício.';

      const teacherMsg: ExerciseDoubtMessage = {
        id: `t_${Date.now()}`,
        sender: 'teacher',
        text: teacherReplyText,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...updatedWithUser, teacherMsg];
      saveMessages(finalMessages);
    } catch (err: any) {
      console.error('Error in exercise doubt reply:', err);
      const errorMsg: ExerciseDoubtMessage = {
        id: `t_${Date.now()}`,
        sender: 'teacher',
        text: 'Desculpe, tive uma instabilidade momentânea na conexão. Por favor, reformule ou envie novamente sua dúvida.',
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updatedWithUser, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const speakText = (text: string, msgId: string) => {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();

      if (speakingMessageId === msgId) {
        setSpeakingMessageId(null);
        return;
      }

      const cleanText = text.replace(/\*\*/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Try finding Portuguese or natural voice
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang.startsWith('pt') || v.lang.startsWith('pt-BR'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onstart = () => setSpeakingMessageId(msgId);
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Error speaking text:', e);
      setSpeakingMessageId(null);
    }
  };

  return (
    <div className="mt-5 pt-4 border-t border-[#f0ebe0] font-sans">
      {/* Header of Quick Doubts */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#FAF6EE] border border-[#e2dacb] flex items-center justify-center text-sm shadow-xs">
            👩‍🏫
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-serif font-bold text-classic-ink">
                Dúvidas com a Professora
              </h4>
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                Esclarecimento Rápido
              </span>
            </div>
            <p className="text-[10px] text-[#8e8574] leading-tight">
              Tire dúvidas pontuais sobre este exercício sem sair da tela
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-[10px] text-[#8e8574]">
          <HelpCircle className="w-3.5 h-3.5 text-classic-gold" />
          <span>Foco neste exercício</span>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-[#FAF6EE]/40 border border-[#e2dacb] rounded-2xl p-3 sm:p-4 space-y-3">
        {/* Messages List */}
        <div className="max-h-[220px] min-h-[70px] overflow-y-auto pr-1 space-y-2.5">
          {messages.length === 0 ? (
            <div className="flex items-start gap-2.5 p-3 bg-white/80 border border-[#e2dacb]/60 rounded-xl text-xs text-[#7d715e] font-serif leading-relaxed">
              <Sparkles className="w-4 h-4 text-classic-gold shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-classic-ink text-[11px] mb-0.5">
                  Ficou com alguma dúvida sobre esta questão?
                </p>
                <p className="text-[11px]">
                  Pergunte sobre o significado de uma palavra, a regra gramatical envolvida ou por que uma alternativa é correta/incorreta.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isTeacher = m.sender === 'teacher';
              return (
                <div
                  key={m.id}
                  className={`flex gap-2 items-start ${
                    isTeacher ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {isTeacher && (
                    <div className="w-6 h-6 rounded-full bg-white border border-[#dfcbb0] text-[11px] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      👩‍🏫
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed transition-all ${
                      isTeacher
                        ? 'bg-white border border-[#e2dacb] text-classic-ink shadow-xs'
                        : 'bg-emerald-900 text-white font-medium shadow-xs'
                    }`}
                  >
                    {/* Render message formatting */}
                    <div className="font-serif">
                      {m.text.split('\n\n').map((block, bi) => (
                        <p key={bi} className={bi > 0 ? 'mt-1.5' : ''}>
                          {block.split('**').map((part, pi) => {
                            if (pi % 2 === 1) {
                              return (
                                <strong
                                  key={pi}
                                  className={
                                    isTeacher
                                      ? 'text-classic-gold font-bold px-0.5'
                                      : 'text-emerald-200 font-bold px-0.5'
                                  }
                                >
                                  {part}
                                </strong>
                              );
                            }
                            return part;
                          })}
                        </p>
                      ))}
                    </div>

                    {/* Teacher Audio Listen Option */}
                    {isTeacher && (
                      <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-[#f0ebe0]">
                        <button
                          type="button"
                          onClick={() => speakText(m.text, m.id)}
                          className="flex items-center gap-1 text-[9px] font-mono text-[#8e8574] hover:text-classic-gold transition-colors cursor-pointer"
                        >
                          <Volume2
                            className={`w-3 h-3 ${
                              speakingMessageId === m.id
                                ? 'text-classic-gold animate-pulse'
                                : 'text-[#8e8574]'
                            }`}
                          />
                          <span>
                            {speakingMessageId === m.id ? 'Ouvindo...' : 'Ouvir'}
                          </span>
                        </button>
                        <span className="text-[8px] font-mono text-[#b0a590]">
                          Profª Madson
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex gap-2 items-center text-xs text-[#7d715e] pl-1 animate-pulse">
              <div className="w-6 h-6 rounded-full bg-white border border-[#dfcbb0] text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                👩‍🏫
              </div>
              <div className="bg-white border border-[#e2dacb] px-3 py-1.5 rounded-xl text-[11px] font-mono flex items-center gap-1.5 shadow-xs">
                <Loader2 className="w-3 h-3 text-classic-gold animate-spin" />
                <span>Professora Madson está explicando...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input & Send Controls */}
        <div className="pt-2 border-t border-[#e2dacb]/60 flex gap-2 items-center">
          <input
            type="text"
            placeholder="Tire sua dúvida sobre este exercício..."
            className="flex-1 bg-white border border-[#e2dacb] rounded-xl px-3.5 py-2 text-xs text-classic-ink placeholder-[#a89d88] focus:outline-none focus:border-classic-gold font-serif transition-colors"
            value={inputText}
            disabled={loading}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSendMessage();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={loading || !inputText.trim()}
            className="bg-classic-green hover:bg-classic-green-light disabled:opacity-40 text-white font-bold w-9 h-9 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
            title="Enviar dúvida"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
