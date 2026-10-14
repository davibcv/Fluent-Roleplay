/**
 * Algoritmo de Progressão Unificado, Isento de Vieses e Baseado em Amostragem de Dados Reais
 * Avaliação da Proximidade da Meta de "Inglês Aceitável" com Margem de Incerteza
 */

export interface ProgressionResult {
  estimatedPercentage: number;
  marginOfError: number;
  confidenceRating: 'Amostragem Insuficiente' | 'Confiança Baixa' | 'Confiança Moderada' | 'Confiança Alta';
  indicators: {
    baselineScore: number;
    completedBonus: number;
    hitsBonus: number;
    errorsPenalty: number;
    temporaryAdjustment: number;
    uncertaintySanction: number;
  };
  details: string;
}

export function calculateProgression(
  baselineProficiency: string,
  completedNodesCount: number,
  globalStrengthsCount: number,
  globalErrorsCount: number,
  estimatedMonths: number
): ProgressionResult {
  // 1. BASELINE DE ENTRADA (Mapeamento inicial isento de distorções de escala)
  let baselineScore = 32; // Iniciante
  if (baselineProficiency === 'Intermediate') {
    baselineScore = 54;
  } else if (baselineProficiency === 'Advanced') {
    baselineScore = 76;
  }

  // 2. BÔNUS DE CONCLUSÃO DE MÓDULOS (Consistência e estudo direcionado)
  // Cada módulo concluído com aprovação da Professora Madson adiciona +3.0%, até o teto de +24%
  const completedBonus = Math.min(24, completedNodesCount * 3.0);

  // 3. BÔNUS DE DIALOGOS BEM SUCEDIDOS (Sucessos observados no Stories)
  // Cada tópico de sucesso registrado em conversas reais adiciona +1.2%, até o teto de +12%
  const hitsBonus = Math.min(12, globalStrengthsCount * 1.2);

  // 4. PENALIDADE DE DESVIOS ATIVOS (Erros recorrentes e não sanados)
  // Cada erro catalogado subtrai -1.0%, indicando lacunas de gramática/vocabulário, até o teto de -15%
  const errorsPenalty = Math.min(15, globalErrorsCount * 1.0);

  // 5. AJUSTE DE FLUIDEZ RELACIONADO AO CRONOGRAMA DE MESES ESTIMADOS
  // Se o tempo estimado para proficiência está sendo reduzido (indicando avanço), bônus relativo de até +10%
  const monthsOffset = 10 - estimatedMonths;
  const temporaryAdjustment = Math.max(-10, Math.min(10, monthsOffset * 1.5));

  // 6. CÁLCULO DA QUANTIDADE DE INTERAÇÕES E CALIBRAÇÃO DE CONFIANÇA/INCERTEZA (Margem de Erro)
  // Evita o "Viés de Otimismo" (sobrevalorizar nível do aluno com poucos dados) ou de "Pessimismo"
  const totalInteractions = globalStrengthsCount + globalErrorsCount;
  
  let marginOfError = 18;
  let confidenceRating: ProgressionResult['confidenceRating'] = 'Amostragem Insuficiente';
  let uncertaintySanction = 8; // Sanção de incerteza: reduzimos a nota estimada se não houver provas reais suficientes
  let details = 'A estimativa possui alta incerteza devido à ausência de conversações reais registradas e avaliadas.';

  if (totalInteractions >= 15) {
    marginOfError = 3;
    confidenceRating = 'Confiança Alta';
    uncertaintySanction = 0; // Dados sólidos, sem sanção de fidelidade
    details = 'Estimativa altamente confiável baseada em amostragem abrangente de diálogos e exercícios.';
  } else if (totalInteractions >= 6) {
    marginOfError = 6;
    confidenceRating = 'Confiança Moderada';
    uncertaintySanction = 2; // Sanção mínima para cobertura aceitável de dados
    details = 'Nível de incerteza controlado. Amostragem moderada de interações linguísticas registradas.';
  } else if (totalInteractions > 0) {
    marginOfError = 12;
    confidenceRating = 'Confiança Baixa';
    uncertaintySanction = 5; // Sanção média por insuficiência de diálogos
    details = 'Incerteza moderada-alta. Poucas interações foram concluídas para o cálculo de proficiência real.';
  }

  // 7. COMPILAÇÃO DO PERCENTUAL BRUTO E LIMITADORES
  const rawPercentage = baselineScore + completedBonus + hitsBonus - errorsPenalty + temporaryAdjustment - uncertaintySanction;
  
  // O teto é 98.8% (sempre há espaço para aprofundamento), piso é 15%
  const estimatedPercentage = parseFloat(Math.min(98.8, Math.max(15.0, rawPercentage)).toFixed(1));

  return {
    estimatedPercentage,
    marginOfError,
    confidenceRating,
    indicators: {
      baselineScore,
      completedBonus,
      hitsBonus,
      errorsPenalty,
      temporaryAdjustment: parseFloat(temporaryAdjustment.toFixed(1)),
      uncertaintySanction
    },
    details
  };
}
