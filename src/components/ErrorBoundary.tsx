import React, { Component, ErrorInfo, ReactNode } from 'react';
import { safeLocalStorageSet } from '../utils/safeStorage';

interface Props {
  children: ReactNode;
  onGoBackMenu: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  copied: boolean;
  saved: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: "",
    copied: false,
    saved: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message, copied: false, saved: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  private handleCopyLastMessage = () => {
    let lastMsg = '';
    try {
      lastMsg = localStorage.getItem('fluent_last_user_message') || '';
      if (!lastMsg) {
        const historyStr = localStorage.getItem('fluent_sim_state');
        if (historyStr) {
          const state = JSON.parse(historyStr);
          if (state && Array.isArray(state.dialog_history)) {
            const userMsgs = state.dialog_history.filter((m: any) => m && m.sender === 'user');
            if (userMsgs.length > 0) {
              lastMsg = userMsgs[userMsgs.length - 1].text || '';
              if (lastMsg.startsWith('[Ação: ') && lastMsg.endsWith(']')) {
                lastMsg = lastMsg.slice(7, -1);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Erro ao resgatar última mensagem:", e);
    }

    lastMsg = lastMsg.trim();
    if (lastMsg) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastMsg);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = lastMsg;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          document.execCommand('copy');
        } catch (e) {}
        document.body.removeChild(textarea);
      }
    }
    this.setState({ copied: true });
  };

  private handleSaveProgress = () => {
    try {
      const historyStr = localStorage.getItem('fluent_sim_state');
      if (historyStr) {
        safeLocalStorageSet('fluent_sim_state', historyStr);
        safeLocalStorageSet('fluent_backup_saved_sim_state', historyStr);
      }
      this.setState({ saved: true });
    } catch (e) {
      console.error("Erro ao salvar progresso no ErrorBoundary:", e);
      this.setState({ saved: true });
    }
  };

  private handleUndoLastAction = () => {
    try {
      const historyStr = localStorage.getItem('fluent_sim_state_history');
      if (historyStr) {
        const history = JSON.parse(historyStr);
        if (Array.isArray(history) && history.length > 0) {
          // Obtém o último estado válido do histórico
          const previousState = history[history.length - 1];
          // Remove do histórico o último item
          const updatedHistory = history.slice(0, history.length - 1);
          
          safeLocalStorageSet('fluent_sim_state', JSON.stringify(previousState));
          safeLocalStorageSet('fluent_sim_state_history', JSON.stringify(updatedHistory));
          
          // Recarrega a página para restabelecer a cena com o estado restaurado
          window.location.reload();
          return;
        }
      }
    } catch (e) {
      console.error("Erro ao tentar desfazer ação pelo ErrorBoundary:", e);
    }
    
    // Se não houver histórico ou falhar, sugere voltar ao menu
    alert("Não conseguimos recuperar o passo anterior automaticamente. Voltando ao menu principal...");
    this.handleGoToMenu();
  };

  private handleGoToMenu = () => {
    localStorage.removeItem('fluent_sim_state');
    localStorage.removeItem('fluent_sim_state_history');
    localStorage.removeItem('fluent_story_loaded');
    localStorage.removeItem('fluent_setting');
    localStorage.removeItem('fluent_character');
    localStorage.removeItem('fluent_init_reply');
    safeLocalStorageSet('fluent_app_mode', 'MENU');
    this.props.onGoBackMenu();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[85vh] flex items-center justify-center p-4 bg-[#FAF6EE]/30">
          <div className="max-w-md w-full bg-[#FAF6EE] border border-[#e8e2d5] rounded-3xl p-6 md:p-8 shadow-sm text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5">
              ⚠️
            </div>
            
            <h2 className="text-lg font-bold text-slate-800 font-sans tracking-tight mb-2">
              Opa! Ocorreu um problema ao carregar esta cena de história.
            </h2>
            
            <p className="text-xs text-[#7d715e] leading-relaxed mb-4 font-sans">
              Detectamos uma inconsistência temporária ou lentidão na resposta do simulador que impediu a renderização correta da interface. Não se preocupe! Seu progresso está seguro.
            </p>

            <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
              <button
                onClick={this.handleCopyLastMessage}
                className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Copiar última mensagem enviada"
              >
                <span className="text-base">📋</span>
                <span>Copiar mensagem</span>
              </button>
              {this.state.copied && (
                <span className="text-xs font-semibold text-emerald-700 animate-fadeIn">
                  (Última mensagem copiada)
                </span>
              )}

              <button
                onClick={this.handleSaveProgress}
                className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Salvar avanço do Stories"
              >
                <span className="text-base">💾</span>
                <span>Salvar avanço</span>
              </button>
              {this.state.saved && (
                <span className="text-xs font-semibold text-emerald-700 animate-fadeIn">
                  (Avanço salvo)
                </span>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleUndoLastAction}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Desfazer Última Ação
              </button>
              
              <button
                onClick={this.handleGoToMenu}
                className="w-full py-3 bg-white border border-[#e2dacb] hover:bg-amber-50/40 text-[#7d715e] font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Voltar ao Menu Principal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
