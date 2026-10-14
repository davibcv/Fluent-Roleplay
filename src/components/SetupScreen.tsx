import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Compass, Navigation, Loader2, AlertCircle } from 'lucide-react';
import ActivePassiveLoader from './ActivePassiveLoader';
import { apiFetch } from '../utils/api';
import { safeLocalStorageSet } from '../utils/safeStorage';


interface SetupScreenProps {
  username: string;
  baselineProficiency: string;
  nextGrammaticalFocus: string;
  onCompleted: (data: {
    setting: string;
    character: string;
    initialReply: string;
    narrativeSetting: string;
    activeCharacter: string;
  }) => void;
  onGoBackMenu?: () => void;
}

export default function SetupScreen({ username, baselineProficiency, nextGrammaticalFocus, onCompleted, onGoBackMenu }: SetupScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cities = [
    {
      id: "limerick_ireland",
      name: "Limerick, Irlanda",
      country: "Irlanda 🇮🇪",
      tagline: "Pubs tradicionais, chuvas constantes, humor afiado",
      desc: "Prepare-se para viver em uma autêntica cidade irlandesa às margens do Rio Shannon. O clima é quase sempre úmido e as conversas giram em torno de xícaras de chá, cervejas escuras e piadas rápidas.",
      accent: "Sotaque Irlandês (Irish Accent) cerrado e expressões locais como 'grand', 'craic', 'cuppa'.",
      vibe: "Acolhedora, rústica, focada em estudantes locais e vizinhos fofoqueiros.",
      icon: "🍀"
    },
    {
      id: "appalachia_westvirginia",
      name: "West Virginia, EUA",
      country: "Estados Unidos 🇺🇸",
      tagline: "Montanhas exuberantes, diners de estrada, caminhonetes",
      desc: "Uma pequena cidade encravada no interior da cadeia montanhosa dos Apalaches. O ritmo de vida é lento, as pessoas se conhecem desde a infância e tudo se resolve na lanchonete local ou no posto de gasolina.",
      accent: "Sotaque caipira americano do sul (Southern drawl) com dizeres folclóricos e expressões como 'y'all', 'folks'.",
      vibe: "Pé-no-chão, bucólica, fofocas correndo soltas e vizinhos intrometidos mas solicitas.",
      icon: "🏔️"
    },
    {
      id: "frankfurt_germany",
      name: "Frankfurt, Alemanha",
      country: "Alemanha 🇩🇪 / Expatriados",
      tagline: "Burocracia rígida, trens pontuais, polo global",
      desc: "Para quem quer o clássico cenário corporativo europeu. Regras rígidas de convivência em condomínio, pontualidade britânica (alemã) e uma mistura cosmopolita de pessoas de todo o planeta falando inglês técnico e casual.",
      accent: "Clássico inglês com sotaque germânico ou o inglês cosmopolita (Global English) de expatriados.",
      vibe: "Moderna, organizada, fria, voltada a finanças e discussões burocráticas eficientes.",
      icon: "🏙️"
    }
  ];

  const [showSurvivalConfirm, setShowSurvivalConfirm] = useState(false);
  const [pendingCityName, setPendingCityName] = useState('');

  const handleSelectCity = async (cityName: string, survivalMode = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/simulator-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: cityName, username, survivalMode }),
      });

      if (!response.ok) {
        throw new Error('Falha ao conectar com o gerador da imigração virtual.');
      }

      const result = await response.json();
      
      // Save full simulation state to local disk for ConversationScreen to read
      safeLocalStorageSet('fluent_sim_state', JSON.stringify(result));
      safeLocalStorageSet('fluent_story_loaded', 'true');

      // Satisfy App.tsx callback signature
      onCompleted({
        setting: result.city,
        character: result.active_character?.name || "Landlord",
        initialReply: result.narrative_context,
        narrativeSetting: result.active_place,
        activeCharacter: result.active_character?.name || "Landlord",
      });
    } catch (err: any) {
      setError(err.message || 'Falha ao processar simulação. Aguarde e tente de novo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      {onGoBackMenu && (
        <button
          onClick={onGoBackMenu}
          className="mb-8 inline-flex items-center gap-1 text-xs text-[#8e8574] hover:text-classic-gold transition-colors font-sans cursor-pointer"
        >
          ← Menu Principal
        </button>
      )}

      {/* Immersive Welcome Block */}
      <div className="mb-10 text-center space-y-2">
        <h2 className="text-3xl md:text-4xl font-serif font-semibold text-classic-ink">
          Para onde você gostaria de viajar?
        </h2>
        <p className="text-[#8e8574] text-sm max-w-xl mx-auto leading-relaxed">
          Sua jornada começará em <strong className="font-semibold text-classic-ink">15 de Junho</strong>, seu primeiro dia de vida no exterior. Escolha seu destino e o modo de jogo:
        </p>
      </div>

      {loading ? (
        <ActivePassiveLoader 
          title="Preparando viagem..."
          subtitle="Emitindo o passaporte simbólico, selecionando as residências e configurando o sotaque dos personagens locais."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cities.map((city) => (
            <motion.div
              key={city.id}
              id={city.id === 'appalachia_westvirginia' ? 'setup_virginia' : undefined}
              whileHover={{ y: -3 }}
              className="bg-white border border-[#e8e2d5] hover:border-classic-gold rounded-2xl p-6 transition-all flex flex-col justify-between shadow-sm group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{city.icon}</span>
                  <span className="text-[9px] font-mono text-classic-gold bg-classic-ivory px-2 py-0.5 rounded border border-[#e2dacb] uppercase tracking-wider font-semibold">
                    {city.country}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-serif font-bold text-classic-ink group-hover:text-classic-gold transition-colors">
                    {city.name}
                  </h3>
                  <p className="text-[#8e8574] text-xs italic font-serif">
                    {city.tagline}
                  </p>
                </div>

                <p className="text-[#7d715e] text-xs leading-relaxed font-sans">
                  {city.desc}
                </p>

                <div className="border-t border-[#f0ebe0] pt-4 space-y-2 text-[11px] text-sans text-[#7d715e]">
                  <div>
                    <span className="text-[9px] font-mono uppercase tracking-wider block text-classic-gold mb-0.5">Sotaque:</span>
                    <span className="italic block leading-normal">{city.accent}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase tracking-wider block text-classic-gold mb-0.5">Atmosfera:</span>
                    <span>{city.vibe}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#f0ebe0] space-y-2">
                <button
                  onClick={() => handleSelectCity(city.name, false)}
                  className="w-full flex items-center justify-center gap-1.5 bg-classic-cream border border-[#e2dacb] hover:bg-classic-green hover:text-white hover:border-classic-green text-[#7d715e] py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Modo Pacífico
                </button>
                <button
                  onClick={() => {
                    setPendingCityName(city.name);
                    setShowSurvivalConfirm(true);
                    
                    // Trigger TTS
                    const textToSpeak = "O modo Sobrevivência adiciona elementos de simulação como dinheiro, alimentação, aluguel e responsabilidades profissionais. Ele foi criado para quem gosta de simuladores de vida ou prefere ter objetivos práticos que impulsionem a história. Se você deseja uma experiência mais casual, relaxada e focada apenas nas histórias, relacionamentos e exploração, recomendamos o modo Pacífico. Você poderá retornar ao modo Pacífico a qualquer momento posteriormente caso deseje.";
                    if ('speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(textToSpeak);
                      utterance.lang = 'pt-BR';
                      utterance.rate = 1.0;
                      // Try to find a Portuguese voice if possible
                      const voices = window.speechSynthesis.getVoices();
                      const ptVoice = voices.find(v => v.lang.toLowerCase().includes('pt'));
                      if (ptVoice) utterance.voice = ptVoice;
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-600 hover:text-white hover:border-amber-600 text-amber-800 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                >
                  ⚡ Modo Sobrevivência
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showSurvivalConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl max-w-lg w-full border border-[#e8e2d5] p-6 shadow-xl space-y-4"
          >
            <h3 className="text-xl font-serif font-bold text-classic-ink flex items-center gap-2">
              ⚡ Ativar Modo Sobrevivência?
            </h3>
            <p className="text-sm text-[#7d715e] leading-relaxed">
              O modo Sobrevivência adiciona elementos de simulação como dinheiro, alimentação, aluguel e responsabilidades profissionais. Ele foi criado para quem gosta de simuladores de vida ou prefere ter objetivos práticos que impulsionem a história.
            </p>
            <p className="text-xs text-[#8e8574] leading-relaxed">
              Se você deseja uma experiência mais casual, relaxada e focada apenas nas histórias, relacionamentos e exploração, recomendamos o modo Pacífico. Você poderá retornar ao modo Pacífico a qualquer momento posteriormente caso deseje.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  setShowSurvivalConfirm(false);
                }}
                className="px-4 py-2 bg-classic-ivory border border-[#e2dacb] text-[#7d715e] rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-classic-cream transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  setShowSurvivalConfirm(false);
                  handleSelectCity(pendingCityName, true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                Ativar e Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {error && (
        <div className="max-w-md mx-auto mt-8 bg-[#ff150008] border border-rose-500/20 text-rose-900 p-4 rounded-xl text-xs text-left space-y-2">
          <div className="flex items-center gap-2 font-serif font-bold text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Erro ao processar embarque</span>
          </div>
          <p className="leading-relaxed">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
