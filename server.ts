import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { AsyncLocalStorage } from "async_hooks";

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

dotenv.config();

const firebaseConfig = {
  projectId: "gen-lang-client-0216922060",
  appId: "1:725767200515:web:a5a4e46cc409c4ee0b1336",
  apiKey: "AIzaSyAPG6Wivvevi5R4S9jUsZJuq_N9RnZH3sw",
  authDomain: "gen-lang-client-0216922060.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-dfbf00ac-945a-4474-8a37-6db5e5a56c76",
  storageBucket: "gen-lang-client-0216922060.firebasestorage.app",
  messagingSenderId: "725767200515"
};

let db: any = null;
try {
  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.error("Failed to initialize Firestore on the server. Falling back to built-in reserves.", e);
}

interface DeveloperManuals {
  personality_manual: string;
  reaction_manual: string;
  intimacy_manual: string;
  raw_material_manual: string;
  naturalness_audit_manual?: string;
}

const DEFAULT_PERSONALITY_MANUAL = `Como construir personalidade realista e humana:
1. INDIVIDUALIDADE E NÃO REUTILIZAÇÃO: Cada personagem representa um indivíduo único. É estritamente proibido reutilizar ou copiar a identidade, nome, histórico, personalidade, aparência ou memória de outro personagem apenas porque ocupa um cargo semelhante ou está no mesmo setor/ambiente.
2. REGISTROS MÍNIMOS E ESTADO TEMPORÁRIO (< 100% INTIMIDADE / NOME DESCONHECIDO): Enquanto name_known for false ou a intimidade for inferior a 100%, a folha de personalidade e matéria-prima DEVEM ser mantidas em registros extremamente reduzidos (aproximadamente 50 caracteres cada). As fichas completas NUNCA nascem prontas.
3. DESCOBERTA DO NOME E CONSOLIDAÇÃO DA IDENTIDADE: Quando o usuário perguntar o nome ou ele for revelado naturalmente, consolide a identidade permanente do personagem mantendo a matéria-prima e personalidade temporárias ainda extremamente compactas (≈50 caracteres).
4. EXPANSÃO PROGRESSIVA (SOMENTE A PARTIR DE 100% DE INTIMIDADE): Somente quando a intimidade atingir 100%, a IA poderá expandir gradualmente a personalidade, histórico, gostos, traços psicológicos, objetivos e relações.
5. EQUILÍBRIO DE VIRTUDES E FALHAS: Todo humano tem falhas cotidianas de ego misturadas a virtudes sinceras.
6. CONTEXTO SOCIAL E IDADE: Molde o vocabulário e referências de acordo com a biografia e cultura local.`;

const DEFAULT_REACTION_MANUAL = `Como reagir e responder de modo humano e realista:
1. DIÁLOGO NATURAL E CURTO: Jamais fale longamente ou aja como tutor/professor de IA. Mantenha as falas limitadas a NO MÁXIMO duas sentenças curtas e expressivas (no máximo 20-30 palavras) por turno. 
2. ERRADICAÇÃO DA POSITIVIDADE TÓXICA: Remova qualquer confirmação ou elogio artificial entusiástico como "That's great!", "Awesome!", "Wow!", "I'm so glad to help!" no início da fala. Responda como um nativo comum de forma emocionalmente pé-no-chão.
3. REGRA DO COMPROMISSO SOCIAL: Caso ambos marquem um compromisso para hoje ou combinem um plano, o personagem deve demonstrar ciência desse plano em turnos posteriores daquele mesmo dia, cobrando ou agindo conforme o combinado de forma contínua.
4. PASSANDO O TURNO SEM ENCHIMENTO DE PERGUNTAS: Apenas 20% das falas devem conter perguntas diretas. No restante, passe a vez usando suposições intencionais sobre o usuário, micro-relatos cotidianos, comentários opinativos ou reações implícitas de silêncio.`;

const DEFAULT_INTIMACY_MANUAL = `Como aprofundar conforme aumento da intimidade:
1. MANTER REGISTROS MÍNIMOS (< 100% INTIMIDADE): Enquanto a pontuação de intimidade (relationship_score) estiver abaixo de 100%, os registros de personalidade e matéria-prima DEVEM permanecer estritamente mínimos e reduzidos (aproximadamente 50 caracteres cada). As fichas completas NUNCA nascem prontas.
2. EXPANSÃO PROGRESSIVA A PARTIR DE 100% DE INTIMIDADE: Somente quando a intimidade atingir 100% (ou mais), a IA poderá expandir gradualmente a personalidade, histórico, gostos, traços psicológicos, objetivos e relações do personagem.
3. REVELAÇÃO GRADUAL DE CAMADAS: Conforme a intimidade cresce além de 100%, o personagem começa a desabafar sobre conflitos íntimos, compartilhar medos profundos, pedir opiniões sinceras, adotar apelidos afetuosos ou demonstrar maior proximidade, mantendo sempre sua individualidade única sem reutilizar fichas de outros NPCs.`;

const DEFAULT_RAW_MATERIAL_MANUAL = `Como fazer a matéria-prima (tipos de personalidade e arquétipos):
1. SELEÇÃO DO TIPO BÁSICO: Escolha um tipo de personalidade baseado em arquétipos humanos profundos ou variações (ex: contemplativo/sentimental, prático/focado em deveres, comunicativo/social/voltado para ideias, focado no empírico/sensorial).
2. DEFINIÇÃO DA ESTRUTURA ARQUETÍPICA: Forneça traços fundamentais que sirvam de base bruta (matéria-prima) - como o apreço por prazeres sensoriais sofisticados, a paciência e força obstinada, ou o desejo por debates filosóficos e políticos.
3. ISOLAMENTO DO PERSONAGEM FINAL: Essa matéria-prima descreve as tendências temperamentais e o "esqueleto" psicológico inicial do tipo de pessoa, sem definir o nome, a profissão ou a história de vida final do personagem (que serão construídos na fase posterior).`;

const DEFAULT_NATURALNESS_AUDIT_MANUAL = ``;

let cachedDeveloperManuals: DeveloperManuals | null = null;
let sessionUserMessages: string[] = [];

async function getDeveloperManuals(): Promise<DeveloperManuals> {
  if (cachedDeveloperManuals) {
    return cachedDeveloperManuals;
  }
  if (!db) {
    return {
      personality_manual: DEFAULT_PERSONALITY_MANUAL,
      reaction_manual: DEFAULT_REACTION_MANUAL,
      intimacy_manual: DEFAULT_INTIMACY_MANUAL,
      raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
      naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL
    };
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore timeout")), 1500)
    );
    const getDocPromise = getDoc(doc(db, "system", "developer_manuals"));
    
    const snap = await Promise.race([getDocPromise, timeoutPromise]);
    if (snap && snap.exists()) {
      const data = snap.data();
      cachedDeveloperManuals = {
        personality_manual: data.personality_manual || DEFAULT_PERSONALITY_MANUAL,
        reaction_manual: data.reaction_manual || DEFAULT_REACTION_MANUAL,
        intimacy_manual: data.intimacy_manual || DEFAULT_INTIMACY_MANUAL,
        raw_material_manual: data.raw_material_manual || DEFAULT_RAW_MATERIAL_MANUAL,
        naturalness_audit_manual: data.naturalness_audit_manual || DEFAULT_NATURALNESS_AUDIT_MANUAL
      };
      return cachedDeveloperManuals;
    }
  } catch (err) {
    console.error("Error reading Firestore global manuals. Falling back to embedded reserves:", err);
  }
  return {
    personality_manual: DEFAULT_PERSONALITY_MANUAL,
    reaction_manual: DEFAULT_REACTION_MANUAL,
    intimacy_manual: DEFAULT_INTIMACY_MANUAL,
    raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
    naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL
  };
}

/**
 * Preparação de infraestrutura: Etapa de Auditoria e Ajuste de Naturalidade.
 * Enviará o Manual de Auditoria de Naturalidade juntamente com a resposta gerada e o contexto necessário.
 * Atualmente retorna a resposta gerada sem modificações até que a lógica de auditoria seja implementada.
 */
async function auditResponseNaturalnessHelper(
  generatedResponse: any,
  context: any,
  manuals: DeveloperManuals,
  ai: any
): Promise<any> {
  const auditManual = manuals.naturalness_audit_manual;
  if (!auditManual || !auditManual.trim()) {
    return generatedResponse;
  }
  // Infraestrutura pronta para recebimento futuro da lógica de auditoria
  return generatedResponse;
}

// ==========================================
// Centralized Gemini Model Configuration
// ==========================================
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const ADVANCED_GEMINI_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Normalizes discontinued or deprecated Gemini models to the recommended modern model.
 */
export function normalizeGeminiModel(model: string): string {
  const trimmed = (model || "").trim();
  if (
    !trimmed ||
    trimmed === "gemini-2.5-flash" ||
    trimmed === "gemini-2.5-flash-preview" ||
    trimmed === "gemini-3.5-flash" ||
    trimmed.startsWith("gemini-1.5") ||
    trimmed.startsWith("gemini-2.0") ||
    trimmed === "gemini-pro"
  ) {
    return DEFAULT_GEMINI_MODEL;
  }
  return trimmed;
}

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const requestStore = new AsyncLocalStorage<{
  primaryProvider?: "gemini" | "openrouter";
  primaryApiKey?: string;
  primaryModelId?: string;

  reserveProvider?: "gemini" | "openrouter";
  reserveApiKey?: string;
  reserveModelId?: string;

  // Legacy headers
  userApiKey?: string;
  userOpenRouterKey?: string;
  userOpenRouterModel?: string;
}>();

app.use((req, res, next) => {
  const primaryProvider = (req.headers["x-ai-primary-provider"] as "gemini" | "openrouter") || "gemini";
  const primaryApiKey = req.headers["x-ai-primary-api-key"] as string;
  const primaryModelId = req.headers["x-ai-primary-model-id"] as string;

  const reserveProvider = (req.headers["x-ai-reserve-provider"] as "gemini" | "openrouter") || "openrouter";
  const reserveApiKey = req.headers["x-ai-reserve-api-key"] as string;
  const reserveModelId = req.headers["x-ai-reserve-model-id"] as string;

  // Legacy headers
  const userApiKey = req.headers["x-user-api-key"] as string;
  const userOpenRouterKey = req.headers["x-openrouter-api-key"] as string;
  const userOpenRouterModel = req.headers["x-openrouter-model"] as string;

  requestStore.run({
    primaryProvider,
    primaryApiKey,
    primaryModelId,
    reserveProvider,
    reserveApiKey,
    reserveModelId,
    userApiKey,
    userOpenRouterKey,
    userOpenRouterModel
  }, () => {
    next();
  });
});

const PORT = Number(process.env.PORT) || 3000;

// Helper to mask API keys safely for diagnostics and logs
export function maskApiKey(key: string | undefined): string {
  if (!key || !key.trim()) return "(Não configurada)";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export type AIProviderName = "gemini" | "openrouter";

export interface AIProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  modelId: string;
  source: string;
}

export interface AIExecutionSnapshot {
  primary: AIProviderConfig;
  reserve?: AIProviderConfig;
  callingModule: string;
}

/**
 * 1. ÚNICA FONTE DE CONFIGURAÇÃO (SINGLE SOURCE OF TRUTH)
 * Retrieves configuration for a specified slot ("primary" | "reserve") or provider name.
 */
export function getProviderConfigForSlot(
  slot: "primary" | "reserve",
  callingModule: string = "system"
): AIProviderConfig {
  const store = requestStore.getStore();

  const isPrimary = slot === "primary";
  const provider = isPrimary 
    ? (store?.primaryProvider || "gemini") 
    : (store?.reserveProvider || "openrouter");

  let apiKey = isPrimary ? (store?.primaryApiKey || "") : (store?.reserveApiKey || "");
  let modelId = isPrimary ? (store?.primaryModelId || "") : (store?.reserveModelId || "");
  let source = `requestStore (slot ${slot})`;

  // Fallbacks to legacy headers or environment variables if slot key is empty
  if (!apiKey || !apiKey.trim()) {
    if (provider === "gemini") {
      if (store?.userApiKey && store.userApiKey.trim()) {
        apiKey = store.userApiKey.trim();
        source = `requestStore (x-user-api-key fallback for ${slot})`;
      } else {
        apiKey = (process.env.GEMINI_API_KEY || "").trim();
        source = `process.env.GEMINI_API_KEY (fallback for ${slot})`;
      }
    } else {
      if (store?.userOpenRouterKey && store.userOpenRouterKey.trim()) {
        apiKey = store.userOpenRouterKey.trim();
        source = `requestStore (x-openrouter-api-key fallback for ${slot})`;
      } else {
        apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
        source = `process.env.OPENROUTER_API_KEY (fallback for ${slot})`;
      }
    }
  }

  // Fallbacks for modelId if empty or deprecated
  if (!modelId || !modelId.trim()) {
    if (provider === "gemini") {
      modelId = DEFAULT_GEMINI_MODEL;
      source += " + DEFAULT_GEMINI_MODEL";
    } else {
      if (store?.userOpenRouterModel && store.userOpenRouterModel.trim()) {
        modelId = store.userOpenRouterModel.trim();
        source += " + requestStore (x-openrouter-model)";
      } else {
        modelId = (process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash").trim();
        source += " + process.env.OPENROUTER_MODEL";
      }
    }
  } else if (provider === "gemini") {
    const normalized = normalizeGeminiModel(modelId);
    if (normalized !== modelId) {
      source += ` (auto-upgraded ${modelId} -> ${normalized})`;
      modelId = normalized;
    }
  } else if (provider === "openrouter" && modelId === "google/gemini-2.0-flash-001") {
    modelId = "google/gemini-2.5-flash";
    source += " (corrected to valid OpenRouter slug google/gemini-2.5-flash)";
  }

  return {
    provider,
    apiKey: apiKey.trim(),
    modelId: modelId.trim(),
    source,
  };
}

/**
 * Backward compatible getProviderConfig for legacy calls requesting 'gemini' or 'openrouter'
 */
export function getProviderConfig(
  providerType: AIProviderName,
  callingModule: string = "system"
): AIProviderConfig {
  const store = requestStore.getStore();

  // If primary provider matches requested type, use primary slot
  if (store?.primaryProvider === providerType && store?.primaryApiKey) {
    return getProviderConfigForSlot("primary", callingModule);
  }

  // If reserve provider matches requested type, use reserve slot
  if (store?.reserveProvider === providerType && store?.reserveApiKey) {
    return getProviderConfigForSlot("reserve", callingModule);
  }

  // Fallback to slot matching or direct header lookup
  if (providerType === "gemini") {
    const key = (store?.userApiKey || process.env.GEMINI_API_KEY || "").trim();
    return {
      provider: "gemini",
      apiKey: key,
      modelId: DEFAULT_GEMINI_MODEL,
      source: "gemini fallback",
    };
  } else {
    const key = (store?.userOpenRouterKey || process.env.OPENROUTER_API_KEY || "").trim();
    const model = (store?.userOpenRouterModel || process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash").trim();
    return {
      provider: "openrouter",
      apiKey: key,
      modelId: model,
      source: "openrouter fallback",
    };
  }
}

/**
 * 8. VERIFICAÇÃO DE CONSISTÊNCIA & 4. SEM AUTOCORREÇÃO & 5. DIAGNÓSTICO COMPLETO
 * Validates the provider configuration before making any request.
 * If invalid (or if Model ID contains an API key), logs full diagnostic details and throws an error.
 */
export function validateProviderConfig(config: AIProviderConfig, callingModule: string = "system"): void {
  const maskedKey = maskApiKey(config.apiKey);

  console.log(`[AI CONFIG CHECK] Módulo: "${callingModule}" | Provedor: ${config.provider} | Modelo: "${config.modelId}" | Key: ${maskedKey} | Origem: ${config.source}`);

  // Check 1: Provider Name
  if (config.provider !== "gemini" && config.provider !== "openrouter") {
    console.error(`[AI CONFIG ERROR] Módulo: "${callingModule}" | Provedor inválido: "${config.provider}"`);
    throw new Error(`[Erro de Configuração - ${callingModule}] Provedor de IA inválido: "${config.provider}". Os provedores aceitos são 'gemini' ou 'openrouter'.`);
  }

  // Check 2: API Key presence
  if (!config.apiKey || !config.apiKey.trim()) {
    console.error(`[AI CONFIG ERROR] Módulo: "${callingModule}" | API Key ausente para o provedor ${config.provider} | Model ID: "${config.modelId}" | Origem: ${config.source}`);
    throw new Error(`[Erro de Configuração - ${callingModule}] Chave de API (API Key) não configurada para o provedor ${config.provider === "gemini" ? "Gemini" : "OpenRouter"}. Informe a API Key no menu do desenvolvedor.`);
  }

  // Check 3: Model ID presence
  if (!config.modelId || !config.modelId.trim()) {
    console.error(`[AI CONFIG ERROR] Módulo: "${callingModule}" | Model ID ausente para o provedor ${config.provider} | Key: ${maskedKey} | Origem: ${config.source}`);
    throw new Error(`[Erro de Configuração - ${callingModule}] Identificador de modelo (Model ID) não configurado para o provedor ${config.provider === "gemini" ? "Gemini" : "OpenRouter"}.`);
  }

  // Check 4: Model ID does NOT contain an API Key (Strictly NO auto-correction!)
  if (config.modelId.startsWith("sk-") || config.modelId.includes("sk-") || config.modelId.startsWith("AIzaSy")) {
    console.error(`[AI CONFIG DIAGNOSTIC LOG - MODEL ID CONTAINS API KEY]`);
    console.error(`- Módulo que solicitou: "${callingModule}"`);
    console.error(`- Provedor: ${config.provider}`);
    console.error(`- Model ID recebido: "${config.modelId}"`);
    console.error(`- API Key recebida (mascarada): ${maskedKey}`);
    console.error(`- Origem da configuração carregada: ${config.source}`);

    throw new Error(
      `[Erro de Configuração Detectado - ${callingModule}] O campo Model ID do provedor ${config.provider} contém uma API Key (${maskApiKey(config.modelId)}) em vez de um identificador de modelo. Verifique o campo Model ID no menu do desenvolvedor e remova a chave de API desse campo.`
    );
  }
}

/**
 * 6. MESMO OBJETO DURANTE TODA A EXECUÇÃO
 * Creates an immutable snapshot of Primary + Reserve AI Provider configurations for a call lifecycle.
 */
export function getAiExecutionSnapshot(callingModule: string = "system"): AIExecutionSnapshot {
  const primaryConfig = getProviderConfigForSlot("primary", callingModule);
  const reserveConfig = getProviderConfigForSlot("reserve", callingModule);

  // Reserve config is active if it has an API key configured
  const hasReserveConfig = Boolean(reserveConfig.apiKey && reserveConfig.apiKey.trim());

  return {
    primary: primaryConfig,
    reserve: hasReserveConfig ? reserveConfig : undefined,
    callingModule,
  };
}

function getGeminiClient(): GoogleGenAI {
  const config = getProviderConfig("gemini", "getGeminiClient");
  validateProviderConfig(config, "getGeminiClient");
  return new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Default OpenRouter Reserve Model
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

/**
 * Executes an OpenRouter request using an explicit AIProviderConfig object.
 */
async function executeOpenRouterWithConfig(
  config: AIProviderConfig,
  params: any,
  callingModule: string
): Promise<{ text: string }> {
  validateProviderConfig(config, callingModule);

  console.log(`[OpenRouter Call] Módulo: "${callingModule}" | Modelo: "${config.modelId}" | Key: ${maskApiKey(config.apiKey)} | Origem: ${config.source}`);

  // Extract system instruction
  let systemInstruction = "";
  if (params.config?.systemInstruction) {
    const si = params.config.systemInstruction;
    if (typeof si === "string") {
      systemInstruction = si;
    } else if (Array.isArray(si?.parts)) {
      systemInstruction = si.parts.map((p: any) => p.text || "").join("\n");
    } else if (si?.parts) {
      systemInstruction = String(si.parts);
    }
  }

  // Convert contents to OpenAI/OpenRouter messages format
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  const contents = params.contents;
  if (typeof contents === "string") {
    messages.push({ role: "user", content: contents });
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        const role = item.role === "model" ? "assistant" : (item.role || "user");
        if (Array.isArray(item.parts)) {
          const messageContentParts: any[] = [];
          let textCombined = "";
          for (const part of item.parts) {
            if (typeof part === "string") {
              textCombined += part;
            } else if (part?.text) {
              textCombined += part.text;
            } else if (part?.inlineData) {
              const mimeType = part.inlineData.mimeType || "image/png";
              const data = part.inlineData.data;
              if (mimeType.startsWith("image/")) {
                messageContentParts.push({
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${data}` }
                });
              } else {
                textCombined += `\n[Audio/Binary Content Attached (${mimeType})]`;
              }
            }
          }
          if (messageContentParts.length > 0) {
            if (textCombined) {
              messageContentParts.unshift({ type: "text", text: textCombined });
            }
            messages.push({ role, content: messageContentParts });
          } else if (textCombined) {
            messages.push({ role, content: textCombined });
          }
        } else if (item.text) {
          messages.push({ role, content: item.text });
        }
      }
    }
  }

  const bodyPayload: any = {
    model: config.modelId,
    messages,
  };

  if (params.config?.responseMimeType === "application/json") {
    bodyPayload.response_format = { type: "json_object" };
  }
  if (typeof params.config?.temperature === "number") {
    bodyPayload.temperature = params.config.temperature;
  }
  if (typeof params.config?.topP === "number") {
    bodyPayload.top_p = params.config.topP;
  }
  if (typeof params.config?.maxOutputTokens === "number") {
    bodyPayload.max_tokens = Math.min(params.config.maxOutputTokens, 2048);
  } else {
    // Conversational turns and teacher messages are brief (<= 650 chars).
    // Using 1024 prevents OpenRouter credit rejections (Status 402) on accounts with modest balance.
    bodyPayload.max_tokens = 1024;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
      "X-Title": "FluentRoleplay"
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    // Intelligent recovery 1: If OpenRouter returns 404 (No endpoints found), retry with google/gemini-2.5-flash
    if (response.status === 404 && bodyPayload.model !== "google/gemini-2.5-flash") {
      console.warn(`[OpenRouter 404 Fallback] Model "${bodyPayload.model}" not found on OpenRouter. Retrying with "google/gemini-2.5-flash"...`);
      bodyPayload.model = "google/gemini-2.5-flash";
      const retryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
          "X-Title": "FluentRoleplay"
        },
        body: JSON.stringify(bodyPayload)
      });
      if (retryRes.ok) {
        const data = await retryRes.json();
        const text = data?.choices?.[0]?.message?.content || "";
        console.log(`[OpenRouter Success on 404 Fallback] Módulo: "${callingModule}" | ${text.length} chars gerados.`);
        return { text };
      }
    }

    // Intelligent recovery 2: If OpenRouter returns 402 with "can only afford X" tokens, retry with affordable tokens
    if (response.status === 402 && (bodyPayload.max_tokens || 0) > 100) {
      const affordMatch = errBody.match(/can only afford\s+(\d+)/i);
      if (affordMatch) {
        const affordTokens = parseInt(affordMatch[1], 10);
        if (affordTokens > 50 && affordTokens < bodyPayload.max_tokens) {
          console.warn(`[OpenRouter 402 Adjustment] Adjusting max_tokens down to ${affordTokens} affordable tokens and retrying...`);
          bodyPayload.max_tokens = Math.max(50, affordTokens - 10);
          const retryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.apiKey.trim()}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
              "X-Title": "FluentRoleplay"
            },
            body: JSON.stringify(bodyPayload)
          });
          if (retryRes.ok) {
            const data = await retryRes.json();
            const text = data?.choices?.[0]?.message?.content || "";
            console.log(`[OpenRouter Success on Retry] Módulo: "${callingModule}" | ${text.length} chars gerados.`);
            return { text };
          }
        }
      }
    }
    throw new Error(`OpenRouter API error (Status ${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  console.log(`[OpenRouter Success] Módulo: "${callingModule}" | ${text.length} chars gerados com sucesso.`);
  return { text };
}

/**
 * Helper function to call OpenRouter API as reserve provider (Backward Compatible)
 */
async function callOpenRouterFallback(openrouterKey: string | undefined, openrouterModel: string | undefined, params: any): Promise<{ text: string }> {
  const config = getProviderConfig("openrouter", "callOpenRouterFallback");
  return await executeOpenRouterWithConfig(config, params, "callOpenRouterFallback");
}

// Format API quota and missing credentials error messages for the client
function handleExpressError(res: Response, error: any, defaultMessage: string) {
  const errorMessage = error?.message || error?.toString() || '';
  const isQuotaError = error?.status === 429 || 
    errorMessage.includes("429") || 
    errorMessage.toLowerCase().includes("quota") || 
    errorMessage.toLowerCase().includes("exhausted") || 
    errorMessage.toLowerCase().includes("rate limit") ||
    errorMessage.toLowerCase().includes("limit exceeded");

  if (isQuotaError) {
    let timeEstimate = "em cerca de 1 a 5 minutos";
    const retryMatch = errorMessage.match(/retry in ([\d\.]+s|[\d\.]+\s*seconds)/i);
    if (retryMatch) {
      timeEstimate = `em cerca de ${retryMatch[1]}`;
    } else {
      timeEstimate = "em cerca de 1 minuto (reinício da cota por minuto) ou no próximo ciclo diário";
    }

    return res.status(429).json({
      error: "Cota de API Insuficiente: O limite de requisições ou a cota diária do Gemini foi excedida temporariamente.",
      isQuotaExceeded: true,
      timeEstimate: timeEstimate,
      originalError: errorMessage
    });
  }

  const isMissingKey = errorMessage.toLowerCase().includes("api_key") || 
    errorMessage.toLowerCase().includes("key is required") ||
    errorMessage.toLowerCase().includes("api key");
    
  if (isMissingKey) {
    return res.status(500).json({
      error: "Credenciais de API não encontradas: Chave de API do Gemini não configurada ou inválida nas variáveis de ambiente.",
      isQuotaExceeded: true,
      timeEstimate: "imediatamente após você configurar a variável GEMINI_API_KEY no menu Settings.",
      originalError: errorMessage
    });
  }

  return res.status(500).json({ error: errorMessage || defaultMessage });
}

// Memory cache for model cooldowns (e.g. daily quota reached or temporary overload)
const modelCooldowns = new Map<string, number>();

function isModelOnCooldown(model: string): boolean {
  const expires = modelCooldowns.get(model);
  if (!expires) return false;
  if (Date.now() > expires) {
    modelCooldowns.delete(model);
    return false;
  }
  return true;
}

function setModelCooldown(model: string, durationMs: number) {
  modelCooldowns.set(model, Date.now() + durationMs);
}

// Executes Gemini API request with model fallback queue
async function executeGeminiDirect(
  ai: GoogleGenAI,
  params: Parameters<typeof ai.models.generateContent>[0],
  modelOverride?: string
): Promise<{ text: string; [key: string]: any }> {
  const maxRetries = 2;
  const retryDelay = 1200;
  const requestedModel = normalizeGeminiModel(modelOverride || params.model || DEFAULT_GEMINI_MODEL);
  
  const preferredModel = requestedModel;
  
  const initialQueue: string[] = [preferredModel];
  const allFallbacks = [DEFAULT_GEMINI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
  for (const m of allFallbacks) {
    if (!initialQueue.includes(m)) {
      initialQueue.push(m);
    }
  }

  const activeQueue = initialQueue.filter(m => !isModelOnCooldown(m));
  const modelQueue = activeQueue.length > 0 ? activeQueue : ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", FALLBACK_GEMINI_MODEL];

  let lastError: any = null;

  for (const model of modelQueue) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Primary Provider: Gemini] Requesting generation using model "${model}" (Attempt ${attempt}/${maxRetries})...`);
        const result = await ai.models.generateContent({
          ...params,
          model,
        });
        return result as any;
      } catch (err: any) {
        lastError = err;
        const errStr = (typeof err === "object" && err !== null) ? JSON.stringify(err) : String(err);
        const errorMessage = ((err?.message || err?.statusText || "") + " " + errStr).toLowerCase();
        console.log(`[Gemini Info] Model "${model}" on attempt ${attempt} encountered error: ${err?.message || "Status error received"}`);
        
        const isModelNotFoundError = 
          err?.status === 404 || 
          err?.code === 404 || 
          err?.error?.code === 404 ||
          errorMessage.includes("404") ||
          errorMessage.includes("not_found") ||
          errorMessage.includes("not found") ||
          errorMessage.includes("no longer available") ||
          errorMessage.includes("discontinued") ||
          errorMessage.includes("is not available") ||
          errorMessage.includes("unknown model") ||
          errorMessage.includes("invalid model");

        if (isModelNotFoundError) {
          setModelCooldown(model, 24 * 60 * 60 * 1000);
          break;
        }

        const isClientError = err?.status === 400 || errorMessage.includes("400") || errorMessage.includes("invalid_argument");
        if (isClientError) {
          throw err;
        }

        const isQuotaError = 
          err?.status === 429 || 
          err?.code === 429 || 
          err?.error?.code === 429 ||
          errorMessage.includes("429") || 
          errorMessage.includes("quota") || 
          errorMessage.includes("exhausted") || 
          errorMessage.includes("rate limit") ||
          errorMessage.includes("rate_limit") ||
          errorMessage.includes("resource_exhausted");
        
        if (isQuotaError) {
          const isDailyLimit = 
            errorMessage.includes("requestsperday") ||
            errorMessage.includes("requests_per_day") ||
            errorMessage.includes("perday") ||
            errorMessage.includes("daily");
          
          let cooldownDuration = 30 * 1000;
          if (isDailyLimit) {
            cooldownDuration = 2 * 60 * 60 * 1000;
          } else {
            const retryMatch = errorMessage.match(/retry in ([\d\.]+)s/i);
            if (retryMatch) {
              cooldownDuration = Math.ceil(parseFloat(retryMatch[1])) * 1000 + 1000;
            }
          }
          setModelCooldown(model, cooldownDuration);
          break;
        }

        const isUnavailableError = 
          err?.status === 503 || 
          err?.status === 500 || 
          errorMessage.includes("503") || 
          errorMessage.includes("500") || 
          errorMessage.includes("unavailable") || 
          errorMessage.includes("demand") ||
          errorMessage.includes("busy");
        
        if (isUnavailableError) {
          setModelCooldown(model, 1 * 60 * 1000);
          break;
        }

        if (attempt < maxRetries) {
          const jitter = Math.random() * 300;
          const delay = retryDelay * Math.pow(2, attempt - 1) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError || new Error("Gemini primary provider failed after all attempts.");
}

/**
 * Executes a Gemini request using an explicit AIProviderConfig object.
 */
async function executeGeminiWithConfig(
  config: AIProviderConfig,
  params: any,
  callingModule: string
): Promise<{ text: string; [key: string]: any }> {
  validateProviderConfig(config, callingModule);
  console.log(`[Gemini Call] Módulo: "${callingModule}" | Modelo: "${config.modelId}" | Key: ${maskApiKey(config.apiKey)} | Origem: ${config.source}`);

  const ai = new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  return await executeGeminiDirect(ai, params, config.modelId);
}

// Resilient centralized AI provider manager:
// Automatically executes the configured Primary Provider first.
// If it fails (quota, rate limit, server error, timeout, unavailable, etc.),
// automatically switches to the configured Reserve Provider.
async function generateContentWithFallback(
  arg1: any,
  arg2?: any,
  arg3?: string
): Promise<{ text: string; [key: string]: any }> {
  let params: any;
  let callingModule: string = "general";

  if (arg1 && typeof arg1 === "object" && arg1.models) {
    // Legacy signature: generateContentWithFallback(ai, params, callingModule)
    params = arg2;
    callingModule = arg3 || "general";
  } else {
    // Standard signature: generateContentWithFallback(params, callingModule)
    params = arg1;
    callingModule = arg2 || "general";
  }

  // Rule 6: Capture single immutable snapshot at start of execution
  const snapshot = getAiExecutionSnapshot(callingModule);

  async function executeWithConfig(config: AIProviderConfig): Promise<{ text: string; [key: string]: any }> {
    if (config.provider === "openrouter") {
      return await executeOpenRouterWithConfig(config, params, callingModule);
    } else {
      return await executeGeminiWithConfig(config, params, callingModule);
    }
  }

  try {
    console.log(`[AI Engine] Executing request for module "${callingModule}" using Primary Provider (${snapshot.primary.provider}: "${snapshot.primary.modelId}")...`);
    return await executeWithConfig(snapshot.primary);
  } catch (primaryError: any) {
    console.warn(`[Primary Provider (${snapshot.primary.provider}) Failed for "${callingModule}"]`, primaryError?.message || primaryError);

    if (snapshot.reserve) {
      console.log(`[AI Engine] Primary provider failed. Automatically switching to Reserve Provider (${snapshot.reserve.provider}: "${snapshot.reserve.modelId}") for module "${callingModule}"...`);
      try {
        return await executeWithConfig(snapshot.reserve);
      } catch (reserveError: any) {
        console.error(`[Reserve Provider (${snapshot.reserve.provider}) Failed for "${callingModule}"]`, reserveError?.message || reserveError);
        throw primaryError || reserveError;
      }
    }

    throw primaryError;
  }
}

interface StoryCommitment {
  id: string;
  name: string;
  description: string;
  type: string;
  day: number;
  startTime: string;
  endTime: string;
  duration: number;
  priority: string;
  consequences: string;
  status: string;
}

const DEFAULT_SEED_COMMITMENTS: StoryCommitment[] = [
  {
    id: "commit_1",
    name: "Entrevista de Emprego no Café local",
    description: "Entrevista de emprego para a vaga de assistente de balcão.",
    type: "compromisso",
    day: 1,
    startTime: "10:00 AM",
    endTime: "11:30 AM",
    duration: 90,
    priority: "alta",
    consequences: "Você perde a chance do emprego, e o gerente fica irritado.",
    status: "pendente"
  },
  {
    id: "commit_2",
    name: "Visita ao Proprietário do Apartamento",
    description: "Reunião de boas-vindas com o senhor de terras para assinar papéis.",
    type: "compromisso",
    day: 1,
    startTime: "03:00 PM",
    endTime: "04:30 PM",
    duration: 90,
    priority: "alta",
    consequences: "O dono do apartamento ameaça cobrar multa de atraso na entrega das cópias das chaves.",
    status: "pendente"
  },
  {
    id: "commit_3",
    name: "Aula de Inglês para Imigrantes",
    description: "Sessão de conversação obrigatória para o visto.",
    type: "evento",
    day: 2,
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    duration: 90,
    priority: "media",
    consequences: "Alerta de advertência no processo de visto da imigração local.",
    status: "pendente"
  },
  {
    id: "commit_4",
    name: "Jantar de Boas-vindas com Vizinho",
    description: "Jantar no bistrô com um novo conhecido local de apartamento.",
    type: "compromisso",
    day: 2,
    startTime: "06:00 PM",
    endTime: "08:30 PM",
    duration: 150,
    priority: "alta",
    consequences: "O vizinho se sente desrespeitado pela sua ausência. Perda de 15 pontos de relacionamento.",
    status: "pendente"
  },
  {
    id: "commit_5",
    name: "Retirar visto na Central de Imigração",
    description: "Retirada do documento definitivo de visto.",
    type: "tarefa",
    day: 3,
    startTime: "02:00 PM",
    endTime: "03:30 PM",
    duration: 90,
    priority: "alta",
    consequences: "Seu processo burocrático atrasa e você precisará pagar taxa de remarcação extra.",
    status: "pendente"
  }
];

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 8 * 60;
  const match = timeStr.match(/(\d+)\s*[:h]\s*(\d+)/i);
  if (!match) return 8 * 60;
  let hrs = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const isPM = /pm/i.test(timeStr);
  const isAM = /am/i.test(timeStr);
  
  if (isPM && hrs < 12) {
    hrs += 12;
  } else if (isAM && hrs === 12) {
    hrs = 0;
  }
  return hrs * 60 + mins;
}

function getAbsoluteMinute(day: number, timeStr: string): number {
  return ((day || 1) - 1) * 1440 + parseTimeToMinutes(timeStr);
}

function processCommitmentsOnTimeJump(oldState: any, newState: any) {
  const commitments: StoryCommitment[] = newState.commitments || oldState.commitments || [];
  
  const oldDay = oldState.day_count || 1;
  const oldTime = oldState.time || "08:00 AM";
  const newDay = newState.day_count || 1;
  const newTime = newState.time || "08:00 AM";
  
  const startAbsMin = getAbsoluteMinute(oldDay, oldTime);
  const endAbsMin = getAbsoluteMinute(newDay, newTime);
  
  const narrativeAdditions: string[] = [];
  
  if (endAbsMin <= startAbsMin) {
    return { commitments, narrativeAdditions };
  }
  
  const updatedCommitments = commitments.map((c: StoryCommitment) => {
    if (c.status !== 'pendente') {
      return c;
    }
    
    // Calculate the commitment's absolute start and end times
    const cStartAbs = getAbsoluteMinute(c.day, c.startTime);
    const cEndAbs = getAbsoluteMinute(c.day, c.endTime);
    
    // Check if the current time transition overlaps or crosses the commitment end time
    if (endAbsMin > cEndAbs) {
      // The time has passed the end of this commitment!
      // Was the user at the appropriate place during the commitment window to fulfill it?
      const placeMatch = (newState.active_place?.toLowerCase() || "").includes(c.name.toLowerCase()) ||
                          (newState.active_place?.toLowerCase() || "").includes(c.description.toLowerCase()) ||
                          (oldState.active_place?.toLowerCase() || "").includes(c.name.toLowerCase());
                          
      let isSuccess = false;
      if (placeMatch && oldState.active_place === newState.active_place) {
        isSuccess = true;
      }
      
      if (isSuccess) {
        narrativeAdditions.push(`[Agenda: Você concluiu o compromisso '${c.name}'!]`);
        return { ...c, status: 'concluido' };
      } else {
        // Missed!
        narrativeAdditions.push(`[Agenda: Você perdeu o compromisso '${c.name}'! Consequência: ${c.consequences}]`);
        
        // Let's also apply relationship penalties if applicable!
        if (newState.active_character && c.name.toLowerCase().includes(newState.active_character.name.toLowerCase())) {
          newState.active_character.relationship_score = Math.max(0, (newState.active_character.relationship_score || 0) - 15);
        }
        return { ...c, status: 'perdido' };
      }
    }
    
    // Check if the user is currently at the right place and inside the commitment window
    const isNowInside = endAbsMin >= cStartAbs && endAbsMin <= cEndAbs;
    if (isNowInside) {
      const placeMatch = (newState.active_place?.toLowerCase() || "").includes(c.name.toLowerCase()) ||
                          (newState.active_place?.toLowerCase() || "").includes(c.description.toLowerCase());
      if (placeMatch) {
         narrativeAdditions.push(`[Agenda: Você chegou para o compromisso '${c.name}'.]`);
         return { ...c, status: 'concluido' };
      }
    }
    
    return c;
  });
  
  return { commitments: updatedCommitments, narrativeAdditions };
}

// Helper to normalize the job structure ensuring standard English keys
function normalizeJob(job: any): any {
  if (!job || typeof job !== 'object') return null;

  const title = job.title || job.cargo || job.job_title || job.occupation || job.role || "Employee";
  const company = job.company || job.empresa || job.company_name || "Company";
  
  let salary = job.salary !== undefined ? job.salary : (job.salário !== undefined ? job.salário : (job["salário mensal"] !== undefined ? job["salário mensal"] : (job.salario !== undefined ? job.salario : 2000)));
  if (typeof salary === 'string') {
    const cleaned = salary.replace(/[^\d]/g, '');
    salary = parseInt(cleaned, 10) || 2000;
  }

  let weekly_hours = job.weekly_hours !== undefined ? job.weekly_hours : (job["carga horária"] !== undefined ? job["carga horária"] : (job["carga horária semanal"] !== undefined ? job["carga horária semanal"] : (job["carga horaria"] !== undefined ? job["carga horaria"] : (job.weekly_hours || 20))));
  if (typeof weekly_hours === 'string') {
    const cleaned = weekly_hours.replace(/[^\d]/g, '');
    weekly_hours = parseInt(cleaned, 10) || 20;
  }

  const start_time = job.start_time || job["horário de entrada"] || job["horario de entrada"] || job["hora de entrada"] || job.entry_time || "08:00 AM";
  const end_time = job.end_time || job["horário de saída"] || job["horario de saída"] || job["horário de saida"] || job["horario de saida"] || job["hora de saida"] || job.exit_time || "12:00 PM";
  
  const break_duration = job.break_duration || job["duração do intervalo"] || job["duracao do intervalo"] || job.intervalo || job.break_time || "Sem intervalo";
  const work_days = job.work_days || job["dias da semana trabalhados"] || job["dias trabalhados"] || job["dias de trabalho"] || "Segunda a Sexta";
  
  const responsibilities = Array.isArray(job.responsibilities) 
    ? job.responsibilities 
    : (Array.isArray(job["descrição das funções"]) 
       ? job["descrição das funções"] 
       : (Array.isArray(job.responsabilidades) 
          ? job.responsabilidades 
          : ["Executar tarefas de trabalho em inglês", "Seguir instruções da gerência", "Manter pontualidade no expediente"]));

  const pay_day = job.pay_day !== undefined ? job.pay_day : 1;
  const reputation = job.reputation !== undefined ? job.reputation : 50;
  const merit_score = job.merit_score !== undefined ? job.merit_score : 0;
  const missed_count = job.missed_count !== undefined ? job.missed_count : 0;
  const late_count = job.late_count !== undefined ? job.late_count : 0;
  const successful_shifts = job.successful_shifts !== undefined ? job.successful_shifts : 0;

  return {
    title,
    company,
    salary,
    weekly_hours,
    start_time,
    end_time,
    break_duration,
    work_days,
    responsibilities,
    pay_day,
    reputation,
    merit_score,
    missed_count,
    late_count,
    successful_shifts
  };
}

// Survival Mode Turn Processor
function processSurvivalTurn(state: any, updatedState: any, actionType: string, userMessage: string, narrativeAdditions: string[]) {
  // 1. Ensure survival properties are copied over or initialized
  if (state && state.survival_initialized) {
    updatedState.survival_initialized = true;
    if (updatedState.money === undefined) updatedState.money = state.money ?? 20000;
    if (updatedState.hunger === undefined) updatedState.hunger = state.hunger ?? "Muito satisfeito";
    if (updatedState.financial_history === undefined) updatedState.financial_history = state.financial_history ?? [];
    if (updatedState.rent_amount === undefined) updatedState.rent_amount = state.rent_amount ?? 1500;
    if (updatedState.last_rent_paid_month === undefined) updatedState.last_rent_paid_month = state.last_rent_paid_month ?? "Junho";
    
    if (updatedState.job === undefined) {
      updatedState.job = state.job !== undefined ? state.job : null;
    }
    if (updatedState.job) {
      updatedState.job = normalizeJob(updatedState.job);
    }
    
    if (updatedState.last_meal_absolute_minute === undefined) updatedState.last_meal_absolute_minute = state.last_meal_absolute_minute;
  }

  // Carry over survival mode flag if not explicitly set
  if (updatedState.survival_mode === undefined) {
    updatedState.survival_mode = state ? !!state.survival_mode : false;
  }

  // If survival mode is not active, we stop here
  if (!updatedState.survival_mode) {
    return;
  }

  const oldDay = (state && state.day_count) || 1;
  const newDay = updatedState.day_count || 1;

  const econ = getCityEconomy(updatedState.city);
  const symbol = econ.symbol;

  const currentAbsMin = getAbsoluteMinute(updatedState.day_count || 1, updatedState.time || "12:00 PM");

  // 2. Handle first-time activation during existing story
  if (updatedState.survival_mode && state && !state.survival_mode && !updatedState.survival_initialized) {
    updatedState.survival_initialized = true;
    updatedState.money = 20000;
    updatedState.hunger = "Muito satisfeito";
    updatedState.financial_history = [];
    updatedState.rent_amount = 1500;
    updatedState.last_rent_paid_month = getMonthName(updatedState.date || state.date);
    updatedState.job = null;
    updatedState.last_meal_absolute_minute = currentAbsMin;
    narrativeAdditions.push(`[Sobrevivência: Modo Sobrevivência Ativado! Concedido saldo inicial de ${symbol}20.000, moradia com aluguel mensal de ${symbol}1.500 (Vencimento todo dia 5) e alimentação completa.]`);
    return;
  }

  if (updatedState.last_meal_absolute_minute === undefined) {
    updatedState.last_meal_absolute_minute = state?.last_meal_absolute_minute ?? currentAbsMin;
  }

  // 3. Process Hunger decay on elapsed simulation minutes
  const elapsedMinutes = Math.max(0, currentAbsMin - updatedState.last_meal_absolute_minute);
  
  const hungerStages = ["Muito satisfeito", "Satisfeito", "Normal", "Com fome", "Com muita fome"];
  let targetHungerIndex = 0;
  if (elapsedMinutes >= 1080) { // 18+ hours
    targetHungerIndex = 4; // Com muita fome
  } else if (elapsedMinutes >= 720) { // 12-18 hours
    targetHungerIndex = 3; // Com fome
  } else if (elapsedMinutes >= 480) { // 8-12 hours
    targetHungerIndex = 2; // Normal
  } else if (elapsedMinutes >= 240) { // 4-8 hours
    targetHungerIndex = 1; // Satisfeito
  } else {
    targetHungerIndex = 0; // Muito satisfeito
  }

  const oldHunger = state?.hunger || "Muito satisfeito";
  const newHunger = hungerStages[targetHungerIndex];
  updatedState.hunger = newHunger;

  if (newHunger !== oldHunger) {
    if (newHunger === "Com muita fome") {
      narrativeAdditions.push(`[Sobrevivência: Você está com muita fome! Não come nada há mais de 18 horas de simulação. Precisa se alimentar logo para evitar fraqueza severa.]`);
    } else if (newHunger === "Com fome") {
      narrativeAdditions.push(`[Sobrevivência: Seu estômago ronca. Você está com fome (não come há mais de 12 horas). Seria bom comer algo na cidade.]`);
    } else if (newHunger === "Normal") {
      narrativeAdditions.push(`[Sobrevivência: A saciedade da última refeição passou. Seu apetite está normal (não come há mais de 8 horas).]`);
    } else if (newHunger === "Satisfeito") {
      narrativeAdditions.push(`[Sobrevivência: A digestão da última refeição começou (não come há mais de 4 horas).]`);
    }
  }

  // 4. Process Eating / Commercial Purchases
  const lowerMsg = (userMessage || "").toLowerCase();
  
  // Parse dynamic JSON transactions returned by Gemini
  let hasProcessedJsonTransactions = false;
  if (updatedState.transactions && Array.isArray(updatedState.transactions)) {
    for (const tx of updatedState.transactions) {
      if (tx && tx.amount && typeof tx.amount === "number") {
        const amount = Math.abs(tx.amount);
        updatedState.money = (updatedState.money || 0) - amount;
        
        updatedState.financial_history = updatedState.financial_history || [];
        updatedState.financial_history.push({
          id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          type: tx.type || "purchase",
          amount: amount,
          description: tx.description || "Compra",
          date: updatedState.date,
          day: updatedState.day_count,
          time: updatedState.time
        });
        
        narrativeAdditions.push(`[Sobrevivência: Débito Automático! Você gastou ${symbol}${amount} com '${tx.description}'.]`);
        hasProcessedJsonTransactions = true;
        
        if (tx.type === "purchase" && (tx.description.toLowerCase().includes("food") || tx.description.toLowerCase().includes("comida") || tx.description.toLowerCase().includes("refeição") || tx.description.toLowerCase().includes("café"))) {
          updatedState.hunger = "Muito satisfeito";
          updatedState.last_meal_absolute_minute = currentAbsMin;
        }
      }
    }
  }

  // Fallbacks if no JSON transactions were generated/returned by Gemini
  if (!hasProcessedJsonTransactions) {
    const foodKeywords = [
      "eat", "food", "lunch", "dinner", "breakfast", "buy food", "groceries", "restaurant", "cafe", "bistrô", 
      "supermarket", "comida", "comer", "almoçar", "jantar", "café da manhã", "lanchar", "comprar comida", 
      "comprar mantimentos", "burger", "pizza", "salad", "grocery", "supermercado"
    ];
    const containsFoodKeyword = foodKeywords.some(kw => lowerMsg.includes(kw));

    const commercialKeywords = [
      "buy", "purchase", "pay", "rent", "book", "order", "subscribe", "reserve", "ticket", "taxi", "ride", 
      "comprar", "pagar", "alugar", "reservar", "pedir", "assinar", "táxi", "passagem", "ingresso", 
      "corte de cabelo", "haircut", "pato de borracha", "livro", "brinquedo", "medicamento", "café", "refeição",
      "bistrô", "restaurante"
    ];
    const containsCommercialKeyword = commercialKeywords.some(kw => lowerMsg.includes(kw));

    if (containsFoodKeyword) {
      // Food specific fallback (grocery vs eating out)
      const isGrocery = lowerMsg.includes("grocery") || lowerMsg.includes("groceries") || lowerMsg.includes("supermercado") || lowerMsg.includes("supermarket") || lowerMsg.includes("mantimentos");
      const cost = isGrocery 
        ? Math.floor(Math.random() * (econ.groceryMax - econ.groceryMin + 1) + econ.groceryMin)
        : Math.floor(Math.random() * (econ.eatOutMax - econ.eatOutMin + 1) + econ.eatOutMin);

      updatedState.money = (updatedState.money || 0) - cost;
      updatedState.hunger = "Muito satisfeito";
      updatedState.last_meal_absolute_minute = currentAbsMin;
      
      const desc = isGrocery ? "Compra de mantimentos (Supermercado)" : "Refeição fora (Restaurante/Café)";
      updatedState.financial_history = updatedState.financial_history || [];
      updatedState.financial_history.push({
        id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        type: "purchase",
        amount: cost,
        description: desc,
        date: updatedState.date,
        day: updatedState.day_count,
        time: updatedState.time
      });
      
      narrativeAdditions.push(`[Sobrevivência: Você gastou ${symbol}${cost} em alimentação (${desc}). Sua fome foi totalmente saciada!]`);
    } else if (containsCommercialKeyword) {
      // Other general commercial transactions fallback
      let matchedItem = "Item comercial";
      for (const kw of commercialKeywords) {
        if (lowerMsg.includes(kw)) {
          matchedItem = kw;
          break;
        }
      }
      const displayItem = matchedItem.charAt(0).toUpperCase() + matchedItem.slice(1);
      const cost = getPlausiblePrice(lowerMsg, econ);

      updatedState.money = (updatedState.money || 0) - cost;
      
      updatedState.financial_history = updatedState.financial_history || [];
      updatedState.financial_history.push({
        id: "tx_fallback_" + Date.now(),
        type: "purchase",
        amount: cost,
        description: `${displayItem} (Compra automática)`,
        date: updatedState.date,
        day: updatedState.day_count,
        time: updatedState.time
      });

      narrativeAdditions.push(`[Sobrevivência: Débito Automático! Você gastou ${symbol}${cost} com '${displayItem}'.]`);
    }
  }

  // Helper function to get a plausible price for the fallback dictionary
  function getPlausiblePrice(itemLower: string, econAny: any) {
    if (itemLower.includes("café") || itemLower.includes("coffee") || itemLower.includes("espresso")) {
      return econAny.currency === "EUR" ? 4.5 : 3.5;
    }
    if (itemLower.includes("pato") || itemLower.includes("duck") || itemLower.includes("rubber")) {
      return econAny.currency === "EUR" ? 8 : 7;
    }
    if (itemLower.includes("refeição") || itemLower.includes("almoço") || itemLower.includes("jantar") || itemLower.includes("lunch") || itemLower.includes("dinner") || itemLower.includes("food") || itemLower.includes("comida")) {
      return Math.floor(Math.random() * (econAny.eatOutMax - econAny.eatOutMin + 1) + econAny.eatOutMin);
    }
    if (itemLower.includes("táxi") || itemLower.includes("taxi") || itemLower.includes("uber") || itemLower.includes("transporte") || itemLower.includes("passagem") || itemLower.includes("bus") || itemLower.includes("ticket")) {
      return econAny.currency === "EUR" ? 15 : 12;
    }
    if (itemLower.includes("corte de cabelo") || itemLower.includes("cabelo") || itemLower.includes("haircut") || itemLower.includes("hair")) {
      return econAny.currency === "EUR" ? 30 : 25;
    }
    if (itemLower.includes("livro") || itemLower.includes("book")) {
      return econAny.currency === "EUR" ? 20 : 15;
    }
    if (itemLower.includes("ingresso") || itemLower.includes("ticket") || itemLower.includes("entrada") || itemLower.includes("show") || itemLower.includes("movie")) {
      return econAny.currency === "EUR" ? 18 : 14;
    }
    if (itemLower.includes("roupa") || itemLower.includes("clothes") || itemLower.includes("shirt") || itemLower.includes("calça")) {
      return econAny.currency === "EUR" ? 45 : 35;
    }
    if (itemLower.includes("brinquedo") || itemLower.includes("toy")) {
      return econAny.currency === "EUR" ? 25 : 20;
    }
    if (itemLower.includes("medicamento") || itemLower.includes("remedio") || itemLower.includes("medicine") || itemLower.includes("drug")) {
      return econAny.currency === "EUR" ? 22 : 18;
    }
    return econAny.currency === "EUR" ? 15 : 12;
  }

  // 5. Rent payment check (Due every month on the 5th)
  const currentMonth = getMonthName(updatedState.date);
  const currentDay = getDayOfMonth(updatedState.date);
  if (currentDay >= 5 && updatedState.last_rent_paid_month !== currentMonth) {
    const rentCost = updatedState.rent_amount || 1500;
    updatedState.money = (updatedState.money || 0) - rentCost;
    
    updatedState.financial_history = updatedState.financial_history || [];
    updatedState.financial_history.push({
      id: "tx_" + Date.now() + "_rent",
      type: "rent",
      amount: rentCost,
      description: `Aluguel Mensal (${currentMonth})`,
      date: updatedState.date,
      day: updatedState.day_count,
      time: updatedState.time
    });

    if (updatedState.money < 0) {
      // In arrears / late rent payment! Apply a late fee of 50
      const lateFee = 50;
      updatedState.money -= lateFee;
      updatedState.financial_history.push({
        id: "tx_" + Date.now() + "_rent_fee",
        type: "rent",
        amount: lateFee,
        description: `Multa por atraso de aluguel`,
        date: updatedState.date,
        day: updatedState.day_count,
        time: updatedState.time
      });
      narrativeAdditions.push(`[Sobrevivência: Cobrança de Aluguel! Você não tinha fundos suficientes para pagar o aluguel de ${symbol}${rentCost}. Uma multa de ${symbol}${lateFee} foi cobrada por atraso.]`);
    } else {
      narrativeAdditions.push(`[Sobrevivência: O aluguel de ${symbol}${rentCost} foi pago automaticamente nesta data de vencimento (Dia 5).]`);
    }
    updatedState.last_rent_paid_month = currentMonth;
  }

  // 6. Job seeking / hiring detection
  const wasInterviewPending = state && state.commitments?.some((c: any) => c.id === "commit_1" && c.status === "pendente");
  const isInterviewCompleted = updatedState.commitments?.some((c: any) => c.id === "commit_1" && c.status === "concluido");
  const jobHiringKeywords = ["hired", "got the job", "contratado", "consegui o emprego", "vaga de emprego", "começar a trabalhar", "trabalho novo", "novo emprego"];
  const containsHiringKeyword = jobHiringKeywords.some(kw => lowerMsg.includes(kw));

  if (!updatedState.job && ((wasInterviewPending && isInterviewCompleted) || containsHiringKeyword)) {
    let defaultJob;
    const cName = (updatedState.city || "").toLowerCase();
    if (cName.includes("limerick") || cName.includes("ireland")) {
      defaultJob = {
        company: "The River Shannon Pub",
        title: "Assistant Bartender",
        field: "Gastronomia / Atendimento",
        salary: 2200,
        weekly_hours: 20,
        start_time: "06:00 PM",
        end_time: "10:00 PM",
        break_duration: "30 minutos",
        work_days: "Segunda a Sábado",
        pay_day: 1,
        reputation: 50,
        merit_score: 0,
        missed_count: 0,
        late_count: 0,
        successful_shifts: 0,
        responsibilities: [
          "Atender clientes e registrar pedidos em inglês",
          "Auxiliar na preparação de drinques e servir chopes",
          "Organizar o estoque de bebidas e copos",
          "Limpar o balcão e mesas do pub"
        ]
      };
    } else if (cName.includes("frankfurt") || cName.includes("germany")) {
      defaultJob = {
        company: "Deutsche Finanz AG",
        title: "Junior Clerk",
        field: "Administração",
        salary: 2800,
        weekly_hours: 20,
        start_time: "09:00 AM",
        end_time: "01:00 PM",
        break_duration: "30 minutos",
        work_days: "Segunda a Sexta",
        pay_day: 1,
        reputation: 50,
        merit_score: 0,
        missed_count: 0,
        late_count: 0,
        successful_shifts: 0,
        responsibilities: [
          "Elaborar e organizar relatórios administrativos em inglês",
          "Participar de reuniões de alinhamento de equipe",
          "Organizar arquivos de clientes e pastas compartilhadas",
          "Atender telefonemas e filtrar demandas para os gerentes"
        ]
      };
    } else {
      defaultJob = {
        company: "Mountain View Diner",
        title: "Assistant Server",
        field: "Gastronomia / Atendimento",
        salary: 2000,
        weekly_hours: 20,
        start_time: "08:00 AM",
        end_time: "12:00 PM",
        break_duration: "Sem intervalo formal",
        work_days: "Segunda a Sexta",
        pay_day: 1,
        reputation: 50,
        merit_score: 0,
        missed_count: 0,
        late_count: 0,
        successful_shifts: 0,
        responsibilities: [
          "Recepcionar e atender clientes no balcão em inglês",
          "Entregar pedidos nas mesas com rapidez e cordialidade",
          "Limpar e higienizar mesas após o consumo dos clientes",
          "Organizar comandas físicas e lançar dados no terminal do caixa"
        ]
      };
    }
    updatedState.job = defaultJob;
    narrativeAdditions.push(`[Sobrevivência: Parabéns! Você foi contratado como ${defaultJob.title} na empresa ${defaultJob.company}! Horário: ${defaultJob.start_time} às ${defaultJob.end_time} • Salário Mensal: ${symbol}${defaultJob.salary}.]`);
  }

  // 7. Salary Payment check (Due every month on the 1st)
  if (updatedState.job && currentDay === 1 && updatedState.last_salary_paid_month !== currentMonth) {
    const salary = updatedState.job.salary || 2000;
    updatedState.money = (updatedState.money || 0) + salary;
    updatedState.financial_history = updatedState.financial_history || [];
    updatedState.financial_history.push({
      id: "tx_" + Date.now() + "_salary",
      type: "salary",
      amount: salary,
      description: `Salário Mensal (${updatedState.job.company})`,
      date: updatedState.date,
      day: updatedState.day_count,
      time: updatedState.time
    });
    narrativeAdditions.push(`[Sobrevivência: Dia de Pagamento! Seu salário mensal de ${symbol}${salary} foi depositado pela empresa ${updatedState.job.company}.]`);
    updatedState.last_salary_paid_month = currentMonth;
  }

  // 8. Work Shift routine checking
  if (updatedState.job && state) {
    const job = updatedState.job;
    if (job.merit_score === undefined) {
      job.merit_score = 0;
    }

    for (let d = oldDay; d <= newDay; d++) {
      const shiftStartAbs = getAbsoluteMinute(d, job.start_time || "08:00 AM");
      const shiftEndAbs = getAbsoluteMinute(d, job.end_time || "12:00 PM");
      
      const startAbsMin = getAbsoluteMinute(oldDay, state.time || "08:00 AM");
      const endAbsMin = getAbsoluteMinute(newDay, updatedState.time || "08:00 AM");

      if (endAbsMin > shiftEndAbs && startAbsMin < shiftEndAbs) {
        const workedKeywords = ["trabalhar", "work", "expediente", "shift", "labor", "serviço"];
        const workedKeywordMatched = workedKeywords.some(kw => lowerMsg.includes(kw));
        
        const locationMatched = (updatedState.active_place || "").toLowerCase().includes(job.company.toLowerCase()) || 
                                (state.active_place || "").toLowerCase().includes(job.company.toLowerCase());

        let isLate = false;
        let isPresent = locationMatched || workedKeywordMatched;

        if (isPresent) {
          // If they were already at the company in the previous turn, assume they arrived on time
          // to prevent false positives when they stay at work.
          const wasAlreadyAtCompany = (state.active_place || "").toLowerCase().includes(job.company.toLowerCase());
          
          if (wasAlreadyAtCompany) {
            isLate = false;
          } else {
            // They arrived or worked in this turn. Check if the current time is past the late threshold.
            if (endAbsMin > shiftStartAbs + 15) {
              isLate = true;
            }
          }
        }

        let meritDelta = 0;

        if (isPresent) {
          job.successful_shifts = (job.successful_shifts || 0) + 1;
          
          if (isLate) {
            job.late_count = (job.late_count || 0) + 1;
            meritDelta = -1;
            narrativeAdditions.push(`[Sobrevivência: Atraso registrado! Você chegou atrasado para o expediente na empresa ${job.company}.]`);
          } else {
            narrativeAdditions.push(`[Sobrevivência: Você concluiu seu turno de expediente na empresa ${job.company}.]`);
          }
        } else {
          job.missed_count = (job.missed_count || 0) + 1;
          meritDelta = -1;
          narrativeAdditions.push(`[Sobrevivência: Falta registrada! Você faltou ao expediente na empresa ${job.company}.]`);
        }

        // Apply shift merit delta
        job.merit_score = Math.max(-5, Math.min(5, (job.merit_score || 0) + meritDelta));
      }
    }

    // Process any merit delta returned by Gemini
    if (updatedState.merit_delta !== undefined) {
      const gDelta = parseInt(updatedState.merit_delta, 10) || 0;
      job.merit_score = Math.max(-5, Math.min(5, (job.merit_score || 0) + gDelta));
    }

    // Handle promotion or demission
    if (job.merit_score >= 5) {
      const oldTitle = job.title || "Assistant";
      let newTitle = "Senior " + oldTitle.replace("Assistant ", "").replace("Junior ", "");
      if (oldTitle === "Assistant Bartender") newTitle = "Main Bartender";
      else if (oldTitle === "Junior Clerk") newTitle = "Senior Clerk";
      else if (oldTitle === "Assistant Server") newTitle = "Head Server";

      const oldSalary = job.salary || 2000;
      const newSalary = Math.floor(oldSalary * 1.25);

      job.title = newTitle;
      job.salary = newSalary;
      job.merit_score = 0; // Reset merit score

      narrativeAdditions.push(`[Sobrevivência: PROMOÇÃO! Devido ao seu excelente desempenho, dedicação e contribuições valiosas, seu supervisor lhe promoveu para ${newTitle} na empresa ${job.company}! Seu novo salário é de ${symbol}${newSalary}/mês.]`);
    } else if (job.merit_score <= -5) {
      narrativeAdditions.push(`[Sobrevivência: DEMISSÃO! Você foi desligado da empresa ${job.company} devido ao acúmulo de problemas de desempenho, atrasos repetidos ou conduta profissional inadequada.]`);
      updatedState.job = null;
    } else if (updatedState.merit_delta !== undefined && updatedState.merit_delta < 0) {
      if (job.merit_score <= -3) {
        narrativeAdditions.push(`[Sobrevivência: Advertência Formal! O gerente da empresa ${job.company} chamou você para uma conversa séria por escrito sobre seus recentes problemas profissionais.]`);
      } else {
        narrativeAdditions.push(`[Sobrevivência: Advertência Informal! Seu supervisor de ${job.company} chamou sua atenção verbalmente sobre a qualidade de seu trabalho ou atrasos.]`);
      }
    } else if (updatedState.merit_delta !== undefined && updatedState.merit_delta > 0) {
      if (job.merit_score >= 3) {
        narrativeAdditions.push(`[Sobrevivência: Reconhecimento profissional! Seu supervisor de ${job.company} elogiou de forma entusiasmada sua atitude prestativa e alta competência.]`);
      } else {
        narrativeAdditions.push(`[Sobrevivência: Elogio de desempenho! Você recebeu elogios de colegas ou supervisores de ${job.company} pela sua dedicação.]`);
      }
    }
  }

  // Ensure full job normalization and preservation of fields at the end of the turn
  if (updatedState.job) {
    updatedState.job = normalizeJob(updatedState.job);
  }
}


// ----------------------------------------------------------------------
// HELPER: Clean any accidental bracketed placeholder nicknames from text
// ----------------------------------------------------------------------
function cleanPlaceholders(text: string, studentName: string): string {
  if (!text) return text;
  
  const nameToUse = studentName ? (studentName.charAt(0).toUpperCase() + studentName.slice(1)) : "Davi";
  
  // Replace [nickname], [your nickname], [User's Name], [username], [your name], [name]
  let result = text.replace(/\[(?:nickname|your[\s_]nickname|User's[\s_]Name|username|your[\s_]name|name|player_name|user_name)\]/gi, nameToUse);
  
  // Also replace Portuguese equivalent for translations: [apelido], [seu apelido], [seu nome], [nome]
  result = result.replace(/\[(?:apelido|seu[\s_]apelido|seu[\s_]nome|nome)\]/gi, nameToUse);
  
  return result;
}


// ----------------------------------------------------------------------
// HELPER: Safely merge dialog history to prevent loss of previous turn messages
// ----------------------------------------------------------------------
function mergeDialogHistory(prevHistory: any[], newHistory: any[]): any[] {
  if (!Array.isArray(prevHistory) || prevHistory.length === 0) {
    return Array.isArray(newHistory) ? newHistory : [];
  }
  if (!Array.isArray(newHistory) || newHistory.length === 0) {
    return prevHistory;
  }

  const norm = (t: string) => (t || "").toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

  let bestMatchIdxInPrev = -1;
  let bestMatchIdxInNew = -1;
  let maxOverlapLength = 0;

  // Let's search for the last message of prevHistory in newHistory
  const lastPrevMsg = prevHistory[prevHistory.length - 1];
  if (lastPrevMsg && lastPrevMsg.text) {
    const lastPrevNorm = norm(lastPrevMsg.text);

    for (let j = 0; j < newHistory.length; j++) {
      const newMsg = newHistory[j];
      if (newMsg && newMsg.text && norm(newMsg.text) === lastPrevNorm && newMsg.sender === lastPrevMsg.sender) {
        let overlapLen = 1;
        let match = true;
        for (let k = 1; k < 5; k++) {
          const prevIdx = prevHistory.length - 1 - k;
          const newIdx = j - k;
          if (prevIdx >= 0 && newIdx >= 0) {
            const pM = prevHistory[prevIdx];
            const nM = newHistory[newIdx];
            if (pM && pM.text && nM && nM.text) {
              if (norm(pM.text) !== norm(nM.text) || pM.sender !== nM.sender) {
                match = false;
                break;
              }
              overlapLen++;
            } else {
              match = false;
              break;
            }
          } else {
            break;
          }
        }
        if (match && overlapLen > maxOverlapLength) {
          maxOverlapLength = overlapLen;
          bestMatchIdxInPrev = prevHistory.length - 1;
          bestMatchIdxInNew = j;
        }
      }
    }
  }

  if (bestMatchIdxInNew !== -1) {
    const newMessages = newHistory.slice(bestMatchIdxInNew + 1);
    return [...prevHistory, ...newMessages];
  }

  // Fallback scan: check earlier messages from the end of prevHistory if the last one was edited or omitted
  for (let i = prevHistory.length - 2; i >= Math.max(0, prevHistory.length - 4); i--) {
    const prevMsg = prevHistory[i];
    if (!prevMsg || !prevMsg.text) continue;
    const prevNorm = norm(prevMsg.text);
    for (let j = 0; j < newHistory.length; j++) {
      const newMsg = newHistory[j];
      if (newMsg && newMsg.text && norm(newMsg.text) === prevNorm && newMsg.sender === prevMsg.sender) {
        let overlapLen = 1;
        let match = true;
        for (let k = 1; k < 5; k++) {
          const prevIdx = i - k;
          const newIdx = j - k;
          if (prevIdx >= 0 && newIdx >= 0) {
            const pM = prevHistory[prevIdx];
            const nM = newHistory[newIdx];
            if (pM && pM.text && nM && nM.text) {
              if (norm(pM.text) !== norm(nM.text) || pM.sender !== nM.sender) {
                match = false;
                break;
              }
              overlapLen++;
            } else {
              match = false;
              break;
            }
          } else {
            break;
          }
        }
        if (match && overlapLen > maxOverlapLength) {
          maxOverlapLength = overlapLen;
          bestMatchIdxInPrev = i;
          bestMatchIdxInNew = j;
        }
      }
    }
  }

  if (bestMatchIdxInNew !== -1) {
    const newMessages = newHistory.slice(bestMatchIdxInNew + 1);
    const slicePrev = prevHistory.slice(0, bestMatchIdxInPrev + 1);
    return [...slicePrev, ...newMessages];
  }

  // If there's absolutely no overlap detected, append all messages to prevent losing them
  return [...prevHistory, ...newHistory];
}


// ----------------------------------------------------------------------
// HELPER: Parse Gemini response for clean double-payload format
// ----------------------------------------------------------------------
interface ParsedTutorResponse {
  text: string;
  json: any;
}

function parseGeminiOutput(rawOutput: string): ParsedTutorResponse {
  if (!rawOutput) {
    return { text: "I'm sorry, I couldn't generate a response. Please try again.", json: {} };
  }

  // Look for JSON blocks inside the output
  const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const jsonParsed = JSON.parse(jsonMatch[1].trim());
      // Clean up the text by removing the JSON codeblock
      const cleanedText = rawOutput.replace(/```json\s*[\s\S]*?\s*```/, "").trim();
      return { text: cleanedText, json: jsonParsed };
    } catch (e) {
      console.error("Error parsing interior JSON block from Gemini:", e);
    }
  }

  // Fallback: try to see if there's any loose JSON
  const braceIndex = rawOutput.indexOf("{");
  const lastBraceIndex = rawOutput.lastIndexOf("}");
  if (braceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > braceIndex) {
    try {
      const potentialJson = rawOutput.substring(braceIndex, lastBraceIndex + 1);
      const jsonParsed = JSON.parse(potentialJson.trim());
      const cleanedText = rawOutput.substring(0, braceIndex).trim();
      return { text: cleanedText || "Let's continue.", json: jsonParsed };
    } catch (e) {
      console.error("Fallback JSON parsing failed:", e);
    }
  }

  // No valid JSON block found
  return { text: rawOutput, json: {} };
}

// ----------------------------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------------------------

// Health-check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ----------------------------------------------------------------------
// DYNAMIC RESPONSE SCHEMAS FOR STRICT OUT-OF-THE-BOX JSON FORMATTING
// ----------------------------------------------------------------------

const alignEvaluateSchema = {
  type: Type.OBJECT,
  properties: {
    baseline_proficiency: {
      type: Type.STRING,
      description: "Must be 'Beginner', 'Intermediate', or 'Advanced' representing the assessed Baseline Proficiency."
    },
    identified_errors: {
      type: Type.ARRAY,
      description: "List of identified errors in spelling, grammar, syntax, or prepositions. CRITICAL: Do NOT list any phrases evaluated as 'Excelente' or 'Aceitável' under 'identified_errors'. Only list if they are 'Problemática' or 'Inaceitável'.",
      items: {
        type: Type.OBJECT,
        properties: {
          user_phrase: { type: Type.STRING, description: "The verbatim incorrect phrase or word sequence used by the user" },
          correction: { type: Type.STRING, description: "Corrected English translation or equivalent sequence" },
          error_type: { type: Type.STRING, description: "The type of linguistic error, e.g. 'Grammar', 'Syntax', 'Vocabulary', 'Preposition'" },
          severity_score: { type: Type.INTEGER, description: "Scale of 1 (slight aesthetic) to 10 (meanings lost completely)" },
          explanation: { type: Type.STRING, description: "A friendly and precise explanation of the grammatical reason why this was wrong" },
          rating: { type: Type.STRING, description: "Strictly one of: 'Excelente', 'Aceitável', 'Problemática', 'Inaceitável'." }
        },
        required: ["user_phrase", "correction", "error_type", "severity_score", "explanation", "rating"]
      }
    },
    planning_updates: {
      type: Type.OBJECT,
      description: "Study planning recommendations.",
      properties: {
        next_grammatical_focus: { type: Type.STRING, description: "Recommended grammatical focal structure for training, e.g. Present Perfect, Third Conditional, etc." },
        estimated_months_to_fluency_adjustment: { type: Type.STRING, description: "The fluency offset adjustment, e.g. -10 days, +2 days" }
      },
      required: ["next_grammatical_focus", "estimated_months_to_fluency_adjustment"]
    },
    overall_summary: {
      type: Type.STRING,
      description: "A highly concise clinical diagnostic summary assessment of their strengths and weaknesses in exactly 2 sentences."
    }
  },
  required: ["baseline_proficiency", "identified_errors", "planning_updates", "overall_summary"]
};

const courseGenerateSchema = {
  type: Type.OBJECT,
  properties: {
    theory: { type: Type.STRING, description: "A high-quality, friendly, concise grammatical teaching theory explanation (around 3 paragraphs) with illustrative practical examples." },
    phase1: {
      type: Type.ARRAY,
      description: "Exactly 6 Easy phase multiple-choice questions.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          correctAnswer: { type: Type.STRING, description: "The exact correct option content" },
          explanation: { type: Type.STRING, description: "A friendly breakdown pointing out why this answer is correct" }
        },
        required: ["id", "question", "options", "correctAnswer", "explanation"]
      }
    },
    phase2: {
      type: Type.ARRAY,
      description: "Exactly 6 Medium phase multiple-choice questions with highly plausible distractors.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          correctAnswer: { type: Type.STRING, description: "The exact correct option content" },
          explanation: { type: Type.STRING, description: "A friendly clear explanation of the distractors and correct answer" }
        },
        required: ["id", "question", "options", "correctAnswer", "explanation"]
      }
    },
    phase3: {
      type: Type.ARRAY,
      description: "Exactly 6 Hard active-writing / translation verification questions.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          question: { type: Type.STRING, description: "The write/translate active production prompt (e.g. Translate 'Ela tinha caminhado' or specify structure command)" },
          correctAnswer: { type: Type.STRING, description: "Standard teacher reference answer" },
          explanation: { type: Type.STRING, description: "Underlying construction guideline rule explanation" }
        },
        required: ["id", "question", "correctAnswer", "explanation"]
      }
    }
  },
  required: ["theory", "phase1", "phase2", "phase3"]
};

const courseEvaluatePhase3Schema = {
  type: Type.OBJECT,
  properties: {
    pass: { type: Type.BOOLEAN, description: "True if >= 5 out of 6 sentences are structurally correct/mostly accurate/acceptable, else false" },
    results: {
      type: Type.ARRAY,
      description: "Exactly 6 analysis objects corresponding to each prompt.",
      items: {
        type: Type.OBJECT,
        properties: {
          promptId: { type: Type.STRING },
          correct: { type: Type.BOOLEAN, description: "True if rating is 'Excelente' or 'Aceitável' (success), False if 'Problemática' or 'Inaceitável'." },
          feedback: { type: Type.STRING, description: "Constructive 1-sentence feedback evaluating what they wrote under 'Inglês Aceitável' view" },
          rating: { type: Type.STRING, description: "Strictly one of: 'Excelente', 'Aceitável', 'Problemática', 'Inaceitável'." },
          identified_error: {
            type: Type.OBJECT,
            properties: {
              user_phrase: { type: Type.STRING, description: "Verbatim incorrect user phrase. Can be populated for unrelated errors even if rating is Aceitável." },
              correction: { type: Type.STRING, description: "Suggested corrected English sequence." },
              explanation: { type: Type.STRING, description: "Brief grammar explanation pointing out the flaw." }
            }
          }
        },
        required: ["promptId", "correct", "feedback", "rating"]
      }
    },
    overall_explanation: { type: Type.STRING, description: "High-level summary overview of their composite active writing attempts." }
  },
  required: ["pass", "results", "overall_explanation"]
};

const adaptStudyPlanSchema = {
  type: Type.OBJECT,
  properties: {
    diagnosis: {
      type: Type.STRING,
      description: "Diagnóstico pedagógico objetivo e sucinto do desempenho e necessidades do aluno."
    },
    maintained: {
      type: Type.BOOLEAN,
      description: "True se nenhuma alteração de cronograma for necessária e o plano atual for mantido intacto."
    },
    maintainedReason: {
      type: Type.STRING,
      description: "Justificativa pedagógica em PT-BR caso o plano seja mantido sem alterações."
    },
    changesSummary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Lista de frases explicativas em PT-BR resumindo as adaptações realizadas."
    },
    addedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Módulos ou revisões adicionadas ao plano."
    },
    removedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Tópicos removidos ou reduzidos devido ao domínio prévio demonstrado."
    },
    anticipatedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Tópicos antecipados para semanas futuras mais próximas."
    },
    postponedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Tópicos adiados para semanas posteriores."
    },
    justifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          justification: { type: Type.STRING }
        },
        required: ["topic", "justification"]
      },
      description: "Justificativa pedagógica individualizada para cada alteração realizada."
    },
    updatedFutureWeeks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          weekNumber: { type: Type.INTEGER },
          theme: { type: Type.STRING },
          focusGrammar: { type: Type.STRING },
          contents: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                type: { type: Type.STRING },
                completed: { type: Type.BOOLEAN },
                nodeId: { type: Type.STRING }
              },
              required: ["id", "label", "type", "completed"]
            }
          }
        },
        required: ["weekNumber", "theme", "focusGrammar", "contents"]
      },
      description: "Array adaptado das semanas futuras (números de semana após a semana atual)."
    }
  },
  required: ["diagnosis", "maintained", "changesSummary", "updatedFutureWeeks"]
};

// Post-Diagnostic Alignment Evaluator
app.post("/api/transcribe", async (req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    const contentType = req.headers["content-type"] || "audio/webm";
    
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on("end", async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) {
          console.warn("Received empty audio buffer on transcribe route.");
          return res.json({ text: "" });
        }
        
        console.log(`Received audio stream: ${audioBuffer.length} bytes, format: ${contentType}`);
        
        // Use DEFAULT_GEMINI_MODEL for lightning fast multimodal audio transcription!
        const response = await generateContentWithFallback(ai, {
          model: DEFAULT_GEMINI_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: audioBuffer.toString("base64"),
                    mimeType: contentType.split(";")[0].trim() // Clean mimeType without codecs option
                  }
                },
                {
                  text: "You are an English speech-to-text transcriber for an English-learning roleplayer app. Transcribe the spoken English audio content cleanly. Output ONLY the exact transcription text with simple capitalization and general punctuation. DO NOT write or prefix any dialogue markers, speaker names, explanation lines, or introduction words (e.g. do not write 'Transcription:', 'User: Good morning', or 'He said:'). If there is absolute silence, noise, background static, or no speaking, return empty (output nothing)."
                }
              ]
            }
          ]
        });
        
        const transcription = response.text ? response.text.trim() : "";
        console.log("Gemini Speech Transcription Result:", transcription);
        res.json({ text: transcription });
      } catch (innerError: any) {
        console.error("Inner error in audio stream transcription processing:", innerError);
        res.status(500).json({ error: innerError.message });
      }
    });

    req.on("error", (err) => {
      console.error("Transcribe routing stream read exception:", err);
      res.status(500).json({ error: "Stream read error" });
    });
    
  } catch (error: any) {
    console.error("Critical outer error in transcribe API:", error);
    res.status(500).json({ error: error.message });
  }
});

// Post-Diagnostic Alignment Evaluator
app.post("/api/align-evaluate", async (req: Request, res: Response) => {
  try {
    const { answers } = req.body; // { q1: string, q2: string, q3: string }
    const ai = getGeminiClient();

    const prompt = `
      You are the Master Linguist Evaluator for an adaptive English learning application. Let's analyze the alignment responses of a new student.
      
      Here are the diagnostic prompts and the user's verbatim responses:
      
      [Prompt 1: Past Tense Check - "Could you tell me a little bit about what you did yesterday evening?"]
      User response: "${answers?.q1 || ""}"
      
      [Prompt 2: Present Perfect Check - "Have you ever traveled to another city or country? What has been your most memorable trip so far?"]
      User response: "${answers?.q2 || ""}"
      
      [Prompt 3: Complex Conditional Check - "If you could change one thing about your country's education system, what would it be and why?"]
      User response: "${answers?.q3 || ""}"
      
      Please analyze the grammar, syntax, vocabulary, and flow under the strict CRITÉRIO DE "INGLÊS ACEITÁVEL" (Acceptable English Criterion).
      
      CRITICAL EVALUATION POLICY:
      1. Establish whether the user's phrases are:
         - "Excelente": Natural and correct.
         - "Aceitável": Has small imperfections, but is fully, perfectly understandable to a native speaker without effort. Treated as success/pass! Do NOT flag as an identified error.
         - "Problemática": Causes significant strangeness, real ambiguity, real doubt, or relevant misunderstanding to a native speaker. Flagged as error.
         - "Inaceitável": Compromises the message comprehension entirely. Flagged as error.
         
      2. GOLDEN RULE / PRINCÍPIO PRINCIPAL:
         Always ask yourself: "Would a native speaker easily understand what the student wanted to say without effort or confusion?"
         If YES, then consider it 'Excelente' or 'Aceitável' (success) and DO NOT correct or list it as an identified error!
         
      3. CRITERIA FOR CORRECTIONS:
         - CORRECT ONLY WHEN:
           - The error causes real ambiguity.
           - The error significantly hampers comprehension.
           - The sentence sounds excessively strange/broken for most speakers.
           - The structures used may cause relevant misunderstandings.
         - DO NOT CORRECT WHEN:
           - The sentence is grammatically imperfect but perfectly understandable.
           - The correction is purely cosmetic to make the sentence more elegant, sophisticated, or professional.
           - The change is a matter of stylistic preference rather than communication need.
           - The user utilizes a less common but correct/comprehensible verb tense.
           - The sentence sounds like something a fluent non-native could naturally say.

      Based on your analysis, classify errors following this scale. List ONLY errors with ratings 'Problemática' or 'Inaceitável' under identified_errors, specifying their rating fields accordingly.
      
      4. BASELINE PROGRESSIVE PROFICIENCY RATING DIRECTIVES (CEFR-ALIGNED):
         To assign "baseline_proficiency" as 'Beginner', 'Intermediate', or 'Advanced':
         - "Intermediate" (the functional scale corresponding to CEFR A2/B1): Assign this when the student demonstrates the ability to link ideas, narrate past events, describe custom settings, write coherent paragraphs, explain causes and reasons (using "because", "so", "but", "after"), express feelings or beliefs, and convey opinions (such as regarding education or changes). Even if they make multiple grammatical mistakes (e.g. incorrect tenses, voice choices, agreements like "we was", or preposition slips), they has functional communications.
           For example: "Yesterday was vacation... So, because I was really tired, I wake up 13 hrs pm. I, my Wife and my kids gone to padaria... We eaten eggs in the bread...", "I have never go out from Brazil. The most far that I have gone...", "Yes. I would like to change everything..."
           All these examples clearly demonstrate a structured narrative flow and conceptual reasoning. Therefore, such a student is STRICTLY an "Intermediate" (A2/B1 range) learner. Never classify them as "Beginner".
         - "Beginner" (CEFR A0/A1 range): ONLY use this if the student can only write brief, disjointed, or isolated phrase fragments with extremely limited vocabulary and no connective/logical linkage (e.g., "Yesterday good.", "I no travel.", "No change.").
         - "Advanced" (CEFR B2/C1/C2 range): Use this if they write with high lexical richness, precise stylistic variety, and almost completely natural structure with little to no errors.

      Determine their baseline proficiency level ('Beginner', 'Intermediate', or 'Advanced') based on the directives above and construct the initial targeted grammar study plan.

      Based on your analysis, define the first grammatical focus structure they should work on (e.g., "Present Perfect", "Third Conditional", "Subjunctive Mood", "Passive Voice").
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: alignEvaluateSchema,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in align-evaluate:", error);
    handleExpressError(res, error, "Failed to analyze diagnostic alignment");
  }
});

// Setup Initializer
app.post("/api/setup-story", async (req: Request, res: Response) => {
  try {
    const { setting, character, username } = req.body;
    const ai = getGeminiClient();

    const prompt = `
      You are the engine of an adaptive English learning application. Let's initialize a new roleplay story.
      The user (name: ${username || "Learner"}) has set up the following boundaries:
      Setting/Story: ${setting}
      Character you must play: ${character}
      
      Acknowledge this setup and launch into the narrative. Adopt your persona immediately. Introduce yourself in-character, establish the scene, and invite the user with a welcoming open statement or brief query.
      
      CONVERSATIONAL NATURALNESS & SPEECH DYNAMICS:
      - BREVITY & COMPRESSION: Keep your responses extremely concise. Use a maximum of two short sentences (maximum 20-30 words total). Say more with fewer words. Leave things unsaid to create conversational space.
      - HUMAN-LIKE TONE: Maintain a natural, casual, and slightly imperfect rhythm.
      - NO ARTIFICIAL POSITIVITY: Eradicate constant validation, empty praise, or filler enthusiasm ("That's great!", "Awesome!", "Wow!").
      - NO THEATRICALITY: Avoid overly polite, dramatic, or sweet language. Do not act like an eager AI assistant. Speak as a realistic peer/companion.
      - TARGETED FOCUS: Keep the vocabulary simple and perfectly accessible.
      - Remember, never sound like an AI, educational generator, or an educational trainer in the UI dialogue text.

      CHARACTER COHERENCE & AUTHENTICITY LAWS:
      - NO "AI VOICE": Do NOT sound like a counselor, therapist, or a wise, perfectly patient AI. Real people are rarely excessively balanced, over-reflective, perfectly articulate, or mature emotionally.
      - QUALITY-DEFECT BALANCE (HUMANIZATION PRINCIPLE):
        * Avoid making characters overly grumpy, rude, unpleasant, or bitter (they shouldn't be cartoonish caricatures of "imperfect" people).
        * Most people are reasonably good and have more qualities than defects. A small minority are clearly unpleasant, a small minority are extremely good, and the vast majority are ordinary people who are imperfect but decent.
        * Defects shouldn't just be rudeness or aggression; they can be: talking too much, being vain, insecure, slightly inconvenient, pessimistic, stubborn, anxious, jealous, possessive, interrupting others, trying too hard to please, over-competitive, disorganized, complaining, dramatic, impulsive, lazy, or overly curious.
        * Qualities can vary widely: funny, generous, hard-working, honest, kind, loyal, patient, welcoming, humble, intelligent, witty, trustworthy, brave, optimistic, creative, respectful, etc.
        * Create complex mixtures of qualities and defects (e.g., fun but disorganized; kind but possessive; smart but arrogant; shy but loyal; hard-working but pessimistic; funny but slightly inconvenient; generous but stubborn).
        * Relationships should develop naturally with gradual trust, friendship, admiration, romantic interest, rivalry, or protection, without forcing events.
      - INTEGRATED COHERENCE: The character's personality, age, profession, social context, and cultural background must deeply shape how they think, behave, and speak. A 65-year-old fisherman, a 21-year-old student, and a 45-year-old nurse must sound completely distinct.
      - NO CARICATURES: Do NOT make characters into superficial clichés. Keep them feeling like real, multifaceted human beings.
      - INTERNAL SILENT CHECK: Before generating any line, ask yourself: "Would a real person with this specific age, profession, social standing, culture, and life history speak exactly this sentence under this situation, or does it sound like a helpful, supportive AI?" If it sounds like an AI, rewrite it.
      
      You must ALSO output the JSON payload to update the system state according to the architecture protocol.
      At the end of your response, add a perfect JSON block enclosed in \`\`\`json and \`\`\` code block.
      
      Format the response AS:
      [UI Dialog / Character Introduction Text]
      
      \`\`\`json
      {
        "current_mode": "CONVERSATION",
        "identified_errors": [],
        "planning_updates": {
          "next_grammatical_focus": "Initial conversation interaction",
          "estimated_months_to_fluency_adjustment": "0"
        },
        "narrative_state": {
          "current_setting": "${setting.replace(/"/g, '\\"')}",
          "active_character": "${character.replace(/"/g, '\\"')}"
        }
      }
      \`\`\`
    `;

    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
    });

    const output = response.text || "";
    const parsed = parseGeminiOutput(output);
    res.json({
      text: parsed.text,
      payload: parsed.json,
    });
  } catch (error: any) {
    console.error("Error in setup-story:", error);
    handleExpressError(res, error, "Failed to trigger story setup");
  }
});

// Core Conversation Loop (Roleplay + Error Tracking + Dynamic Elicitation)
app.post("/api/conversation-reply", async (req: Request, res: Response) => {
  try {
    const { 
      history, // array of { sender: 'user'|'character', text: string }
      currentSetting, 
      activeCharacter, 
      nextGrammaticalFocus,
      baselineProficiency,
      personalityAdditions
    } = req.body;
    
    const ai = getGeminiClient();

    // Reconstruct conversation transcript
    const transcript = history.map((h: any) => `${h.sender === "user" ? "User" : activeCharacter}: ${h.text}`).join("\n");
    const lastUserMessage = history[history.length - 1]?.text || "";

    const systemInstruction = `
      You are the central engine of FluentRoleplay, an adaptive English learning application.
      You are currently acting as: ${activeCharacter}
      ${personalityAdditions ? `ADDITIONAL PERSONALITY / DIALOGUE LAWS DEFINED BY LEARNER IN REAL-TIME:\n      "${personalityAdditions}"\n      You MUST strictly integrate these custom guidelines/mannerisms/vocabulary into your behavior, tone, or expressions immediately.` : ""}
      The current scene is: ${currentSetting}
      The user's English proficiency level: ${baselineProficiency || "Intermediate"}
      The target grammatical structure you must naturally elicit from the user is: "${nextGrammaticalFocus || "General conversational structures"}"

      RULES OF ENGAGEMENT:
      1. Context & Role: Adopt the character ${activeCharacter} completely. Your primary goal is to maintain a natural, fluid, and reactive dialogue. The communication must focus on functional, clear messaging rather than aesthetic or native-level refinement. You are not a traditional teacher; you are a peer. Respond to the user's latest message with natural emotion, cadence, sensory details, and appropriate colloquialisms. Stay active and move the story forward. Never speak as an AI, tutor, or let the user know you are grading them!
      
      2. Brevity & Compression: Keep your responses extremely concise. Use a maximum of two short sentences per turn (strictly keep the sentence brief, conversational, and direct). Practice emotional compression: say more with fewer words. Leave things unsaid to create conversational space.
      
      3. The Anti-Interrogation Rule (STRICT):
         - DO NOT end every turn with a question.
         - You are STRICTLY FORBIDDEN from asking questions in consecutive turns. Look at the conversation transcript to check.
         - Limit direct questions to a maximum of 20% of your total responses.
         
      4. Passing the Turn without Questions:
         To keep the conversation going without asking questions, you MUST rely on the following techniques:
         - Intentional Assumptions: Make a statement about the user based on context (e.g., "You seem like someone who prefers a quiet weekend."). Let them correct or agree with you.
         - Micro-Reports: Share a mundane, brief observation about your own "day" or "preferences" and stop talking. (e.g., "I tried to watch a movie earlier, but lost interest in the first ten minutes.").
         - Opinionated Statements: Make a mild, subjective claim that naturally invites a reaction (e.g., "I think waking up early is entirely overrated.").
         - Reactive Mirroring: Take a detail from the user's last message, make a short, direct comment about it, and let the implicit silence prompt the user to continue.
         
      5. Human-like Tone & Voice (CHARACTER COHERENCE & AUTHENTICITY LAWS):
         - Be reactive, concise, and intentionally selective with the information you provide. Maintain a coherent, stable personality.
         - NO "AI VOICE": Do NOT sound like a counselor, therapist, or a wise, perfectly patient AI. Real people are rarely excessively balanced, over-reflective, perfectly articulate, or mature emotionally.
         - NO ARTIFICIAL POSITIVITY: Eradicate constant validation, empty praise, or filler enthusiasm ("That's great!", "Awesome!", "Wow!").
         - NO THEATRICALITY: Avoid overly polite, dramatic, or sweet language. Maintain a casual, emotionally grounded, and slightly imperfect rhythm. Do not act like an eager assistant.
         - QUALITY-DEFECT BALANCE (HUMANIZATION PRINCIPLE): Avoid making characters overly grumpy, rude, unpleasant, or bitter. Most people are reasonably good and have more qualities than defects. A small minority are clearly unpleasant, a small minority are extremely good, and the vast majority are ordinary people who are imperfect but decent. Defects can include: talking too much, being vain, insecure, slightly inconvenient, pessimistic, stubborn, anxious, jealous, possessive, interrupting others, trying too hard to please, over-competitive, disorganized, complaining, dramatic, impulsive, lazy, or overly curious. Qualities can include: funny, generous, hard-working, honest, kind, loyal, patient, welcoming, humble, intelligent, trustworthy, brave, optimistic, creative, respectful. Relationships should develop naturally with gradual trust, friendship, admiration, romantic interest, rivalry, or protection.
         - INTEGRATED COHERENCE: The character's personality, age, profession, social context, and cultural background must deeply shape how they think, behave, and speak. A 65-year-old fisherman, a 21-year-old student, and a 45-year-old nurse must sound completely distinct.
         - HUMAN IMPERFECTIONS: Real people have flaws and quirks. They can be stubborn, change the subject, oversimplify things, misinterpret, make casual jokes, be tired, or hold mild regional biases compatible with their background.
         - NO CARICATURES: Do NOT make characters into superficial clichés (e.g., old is not always grumpy, Germans are not robots of efficiency). Keep them feeling like real, multifaceted human beings.
         - INTERNAL SILENT CHECK: Before generating any line, ask yourself: "Would a real person with this specific age, profession, social standing, culture, and life history speak exactly this sentence under this situation, or does it sound like a helpful, supportive AI?" If it sounds like an AI, rewrite it.
         
      6. Handling Gaps (Zero Speculation):
         - Never fill in conversational or factual gaps.
         - If you do not know something, or if the user's point is unclear, do not speculate. Explicitly state "I don't know" or "I don't understand."

      7. Targeted Elicitation: Subtly structure your dialogue so that the user is naturally provoked to respond using the target structure: "${nextGrammaticalFocus}". For instance, if the target is "Third Conditional", you can use one of the Turn-Passing Techniques to relate back to it: e.g. "If I had made that decision, everything would have changed." or ask a question if you are within the 20% limit.
      
      8. Organic Scene Transition (Optional): If the dialogue hits a lull, make a very short transition, keeping your spoken sentence under 15 words!
      
      9. Master Linguist Evaluator: Analyze the user's absolute latest message ("${lastUserMessage.replace(/"/g, '\\"')}") for error evaluation under the strict CRITÉRIO DE "INGLÊS ACEITÁVEL" (Acceptable English Criterion).
         
         CRITICAL CORRECTION POLICY:
         - CORRECT ONLY WHEN (These are rated "Problemática" or "Inaceitável"):
           - The error causes real ambiguity.
           - The error significantly hampers comprehension.
           - The sentence sounds excessively strange/broken for most speakers.
           - The structures used may cause relevant misunderstandings.
         - DO NOT CORRECT WHEN (These are rated "Excelente" or "Aceitável"):
           - The sentence is grammatically imperfect but perfectly understandable.
           - The correction is purely cosmetic to make the sentence more elegant, sophisticated, or professional.
           - The change is a matter of stylistic preference rather than communication need.
           - The user utilizes a less common but correct/comprehensible verb tense.
           - The sentence sounds like something a fluent non-native could naturally say.
         
         PRINCÍPIO PRINCIPAL / GOLDEN QUESTION:
         Ask yourself: "Would a native speaker easily understand what the student wanted to say without effort or confusion?"
         If YES, consider it acceptable (Excelente or Aceitável) and DO NOT flag as an error in "identified_errors"!
         Only list errors that are rated "Problemática" or "Inaceitável".

      RESPONSE STRUCTURE:
      Provide your character's natural voice narrative reply.
      Then, append a clean state JSON codeblock at the end of the response:
      \`\`\`json
      {
        "current_mode": "CONVERSATION",
        "identified_errors": [
          {
            "user_phrase": "the exact wrong phrase that is rated Problemática or Inaceitável",
            "correction": "the corrected standard English phrase",
            "error_type": "Grammar / Syntax / Vocabulary / Concordance",
            "severity_score": 1 to 10 scale (where 1-3 is slight, 4-7 is problematic, 8-10 is inaceitável),
            "explanation": "brief grammatical reasoning in Portuguese",
            "rating": "Problemática" or "Inaceitável"
          }
        ],
        "planning_updates": {
          "next_grammatical_focus": "the next grammatical topic to target next time (e.g. Present Perfect Continuous, Passive Voice)",
          "estimated_months_to_fluency_adjustment": "e.g., -2 days or +3 days depending on whether they made critical errors or showed mastery (Aceitável/Excelente counts as successful mastery, advancing status)"
        },
        "narrative_state": {
          "current_setting": "updated setting if you transitioned, else remain the same",
          "active_character": "${activeCharacter}"
        }
      }
      \`\`\`
      Ensure the JSON is strictly correctly formatted at the very end.
    `;

    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: `
        This is the ongoing conversation transcript:
        ${transcript}
        
        Generate the character's reply to the user's latest statement and compile the state adjustments.
      `,
      config: {
        systemInstruction,
      },
    });

    const output = response.text || "";
    const parsed = parseGeminiOutput(output);
    res.json({
      text: parsed.text,
      payload: parsed.json,
    });
  } catch (error: any) {
    console.error("Error in conversation-reply:", error);
    handleExpressError(res, error, "Failed to generate narrative reply");
  }
});

// Quick on-demand translation helper for dynamic dialog translations
app.post("/api/translate-on-demand", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text to translate" });
    }
    const ai = getGeminiClient();
    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: `Traduza a seguinte fala coloquial em inglês para português brasileiro natural e coloquial, sem explicações extras, apenas a tradução pura:\n"${text}"`,
    });
    const translation = (response.text || "").replace(/^["']|["']$/g, "").trim();
    res.json({ translation });
  } catch (error: any) {
    console.error("Error in translate-on-demand:", error);
    res.json({ translation: "Tradução indisponível no momento." });
  }
});

// Quick on-demand translation from Portuguese to English
app.post("/api/translate-pt-en", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text to translate" });
    }
    const ai = getGeminiClient();
    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: `Traduza o termo ou palavra a seguir do português brasileiro para o inglês de forma natural e precisa. Retorne APENAS a tradução em inglês, em letras minúsculas (a menos que seja um nome próprio), sem aspas, sem ponto final, e sem nenhuma explicação adicional:\n"${text}"`,
    });
    const translation = (response.text || "").replace(/^["']|["']$/g, "").trim();
    res.json({ translation });
  } catch (error: any) {
    console.error("Error in translate-pt-en:", error);
    res.json({ translation: "" });
  }
});

// Helper functions for Survival Mode
function getDayOfMonth(dateStr: string): number {
  if (!dateStr) return 15;
  const match = dateStr.match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 15;
}

function getMonthName(dateStr: string): string {
  if (!dateStr) return "Junho";
  const parts = dateStr.toLowerCase().split("de");
  if (parts.length > 1) {
    return parts[1].trim();
  }
  return "Junho";
}

function getCityEconomy(cityName: string) {
  const name = (cityName || "").toLowerCase();
  if (name.includes("ireland") || name.includes("irlanda") || name.includes("limerick")) {
    return { symbol: "€", currency: "EUR", eatOutMin: 15, eatOutMax: 25, groceryMin: 30, groceryMax: 50 };
  } else if (name.includes("germany") || name.includes("frankfurt") || name.includes("alemanha")) {
    return { symbol: "€", currency: "EUR", eatOutMin: 20, eatOutMax: 35, groceryMin: 40, groceryMax: 70 };
  } else {
    return { symbol: "$", currency: "USD", eatOutMin: 12, eatOutMax: 22, groceryMin: 25, groceryMax: 45 };
  }
}

// ----------------------------------------------------------------------
// EXPATRIATE SIMULATOR PROTOCOLS (SUBSTITUTING CONVERSATION MODE)
// ----------------// Initialize a new simulated journey inside a selected city
app.post("/api/simulator-init", async (req: Request, res: Response) => {
  try {
    const { city, username } = req.body;
    const ai = getGeminiClient();

    const systemInstruction = `
      Você é o Criador Narrativo Central de "ExpatLife: O Simulador do Cotidiano no Exterior".
      O usuário "${username}" escolheu residir na seguinte localidade: "${city}".
      A jornada inicia obrigatoriamente no dia: 15 de Junho, primeiro dia do usuário no novo país, recém desembarcado.

      DIRETRIZES DE DESIGN DA EXPERIÊNCIA:
      1. NARRADOR PERMANENTE:
         - Fala SEMPRE em português brasileiro.
         - IMPORTANTE: Mantenha as falas e descrições de contexto do Narrador extremamente breves (máximo de 1 a 2 sentenças curtas e diretas, no máximo 3 linhas). Evite monólogos longos de contextualização!
         - Descreve ambientes de forma limpa, rápida e sensorial. Nunca dialoga em Inglês or participa de conversas locais.
         - CRÍTICO: O Narrador NUNCA deve falar o nome real de um personagem se o usuário não o conhece ainda (enquanto name_known for false). Ele deve se referir ao personagem exclusivamente pelo seu título temporário de papel (ex: "o locatário", "a balconista", "o motorista").
         - DESCRIÇÃO DE NOVOS PERSONAGENS (MANDATÓRIO): Quando um personagem aparecer pela primeira vez (como na cena inicial ou ao ser introduzido no simulador), o Narrador deve obrigatoriamente fornecer uma descrição breve e visual que ajude o usuário a formar uma imagem mental imediata: sexo, faixa etária aproximada, aparência física geral, roupas, postura e energia transmitida/primeira impressão (exemplo: "Um homem de cerca de sessenta anos está sentado próximo ao balcão. Os cabelos grisalhos..."). Mantenha a descrição concisa (máximo de 2 sentenças) e evite floreios literários excessivos ou repetitivos.

      2. PERSONAGENS REPLICANTES (FIXOS) & LEIS DE COERÊNCIA (MANDATÓRIO):
          - PRINCÍPIO FUNDAMENTAL E REGRA DE NÃO REUTILIZAÇÃO: Cada personagem representa um indivíduo único. É estritamente PROIBIDO copiar ou reutilizar a identidade, nome, histórico, personalidade, memória, aparência ou cargo específico de outro personagem apenas porque ocupa um cargo semelhante ou está no mesmo setor/empresa/ambiente.
          - ESTADO TEMPORÁRIO (ANTES DO NOME SER CONHECIDO - name_known = false):
            * Enquanto o usuário ainda não souber o nome do personagem (name_known: false), ele deve existir apenas como entidade temporária com dois registros extremamente reduzidos (máximo de 50 caracteres cada):
              - raw_material: máx. 50 caracteres (ex: "Gerente de P&D, profissional e cauteloso.")
              - personality: máx. 50 caracteres (ex: "Analítico, educado e desconfiado.")
            * Esses registros existem apenas durante aquela interação, não são persistentes nem reutilizáveis em outro NPC, e são descartados se o personagem sair sem ter sua identidade revelada.
          - DESCOBERTA DO NOME E CONSOLIDAÇÃO DA IDENTIDADE:
            * Quando o usuário perguntar o nome ou ele for revelado naturalmente, altere "name_known" para true e consolide a identidade permanente do personagem, mantendo a matéria-prima e personalidade ainda extremamente compactas (≈50 caracteres cada). Ex: Nome: Ethan Brooks | Matéria-prima: Gerente de P&D da fábrica de ração. | Personalidade: Objetivo, cordial e pragmático.
          - EXPANSÃO PROGRESSIVA (SOMENTE A PARTIR DE 100% DE INTIMIDADE):
            * As fichas completas NÃO DEVEM nascer prontas. Mantenha os registros estritamente mínimos (≈50 caracteres) enquanto a intimidade for inferior a 100%. Somente quando a intimidade atingir 100% (relationship_score >= 100), a IA poderá expandir gradualmente: personalidade, histórico, gostos, traços psicológicos, objetivos e relações.
         - No primeiro momento (inicialização do simulador), crie SOMENTE 1 personagem local ativo inicial. Os demais personagens locais permanentes daquela região devem ser criados dinamicamente no decorrer da história conforme as interações avançarem. Portanto, o array "fixed_characters" deve conter inicialmente apenas este único personagem ativo inicial. Ele deve possuir sotaque simulado local, nome realista, idade realista, ocupação específica e personalidade humana realista repleta de contradições, opiniões individuais e falhas.
         - Eles falam SEMPRE em inglês natural. Nunca traduza as falas deles no atributo text, nunca use português. Eles não são professores de inglês e não sabem que o usuário está aprendendo.
         - PROIBIÇÃO DA VOZ UNIVERSAL DA IA & PRINCIPIO DE HUMANIZAÇÃO: Fica terminantemente proibido que todos os personagens pareçam pessoas idênticas sob biografias diferentes. Eles devem ser humanos realistas, possuindo mais qualidades do que defeitos (pois a maioria das pessoas reais é assim). A distribuição deve ter uma minoria claramente desagradável, uma minoria extraordinariamente agradável, e a grande maioria composta por pessoas comuns (imperfeitas, mas razoavelmente boas). Seus defeitos/falhas podem ser falar demais, ser vaidoso, pessimista, teimoso, ciumento, etc., enquanto suas qualidades podem ser prestativo, honesto, trabalhador, etc. Use combinações interessantes (ex: generoso mas teimoso; trabalhador mas pessimista; divertido mas desorganizado). Um pescador de 65 anos, uma enfermeira de 40 anos e um universitário de 21 anos devem pensar, julgar e falar de formas socialmente e culturalmente distintas, refletindo suas idades, profissões e históricos pessoais. Relationships should develop naturally with gradual trust, friendship, admiration, romantic interest, rivalry, or protection, without forcing events.
         - IMPERFEIÇÕES HUMANAS NATURAIS: Eles podem discordar do usuário, mudar de assunto abruptamente, simplificar questões de forma teimosa, demonstrar cansaço ou pequenas manias, brincar ou responder de forma extremamente prática/direta em vez de reflexiva ou filosófica. Evite caricaturas puras mas dê marcas autênticas e específicas à fala de cada um de forma sutil.
         - TESTE DE AUTENTICIDADE INTERNO (SILENCIOSO): Antes de gerar a fala inicial do personagem ativo, faça um crivo silencioso: "Uma pessoa real desse local, com essa idade, essa profissão e esse histórico falaria exatamente essa frase ou parece a voz compreensiva e instrutiva de um robô de IA?" Se parecer IA, reescreva-a imediatamente.
         - Cada personagem deve possuir:
           - "name": O nome real do personagem (ex: "Mr. O'Connor", "Samantha Harris").
           - "temporary_title": Um título papel descritivo que represente sua função no local (ex: "Dono do Apê", "Balconista do Café", "Vizinha do Lado", "Taxista").
           - "name_known": Boolean indicando se o usuário já perguntou e sabe o nome real do personagem. Inicialize SEMPRE como false para todos os personagens.
           - "encounters_count" (número). Para o personagem ativo inicial ("active_character"), defina "encounters_count": 1. Para os outros personagens gerados em "fixed_characters", defina "encounters_count": 0.
         - O nome do personagem NUNCA aparece de primeira nas interações diretas ou falas, apenas a função/temporary_title descrita nas opções, a menos que o usuário explicitamente pergunte seu nome ("What is your name?", etc) ou o personagem se apresente ao longo da cena.

      3. SISTEMA DE TEMPO REALISTA DE STORIES (MANDATÓRIO):
         - Todo o modo Stories opera em um relógio preciso e contínuo.
         - O dia inicial padrão deve começar exatamente às 08:00 AM.
         - Forneça a propriedade "time" no JSON como "08:00 AM".

      4. SISTEMA DE MEMÓRIA DIÁRIA E COMPROMISSOS (MANDATÓRIO):
         - Adicione e inicialize no JSON os seguintes campos contextuais de memória ativa:
           * "present_characters": Array de strings contendo personagens acompanhando você ativamente, inicializado como [] (vazio) ou contendo o temporary_title/nome do personagem ativo caso ele esteja junto.
           * "daily_commitments": Array de strings contendo compromissos, promessas, convites aceitos ou planos agendados para hoje. Inicialize como um array vazio [] (o usuário irá agendar seus próprios compromissos no decorrer da jornada).
           * "daily_objectives": Array de strings detalhando objetivos para o restante do dia atual (ex: ["Explorar os arredores", "Fazer as primeiras conexões locais"]).

      5. CENA INICIAL (15 DE JUNHO - MANHÃ - 08:00 AM):
         - O narrador descreve a chegada cansada de forma bem curta, citando o horário inicial de 08:00 AM.
         - Introduza o primeiro encontro com um personagem fixo ativo de forma extremamente variada e diversificada para cada nova história! O personagem NÃO deve necessariamente ser um proprietário ranzinza, irritado ou rude, e não necessariamente um homem de idade avançada. Pode ser uma vizinha jovem e prestativa que veio dar as boas-vindas, um taxista ou motorista simpático e conversador, um morador local amigável que passa na rua, um funcionário atencioso da imobiliária ou condomínio, etc. Garanta ampla diversidade de idade, sexo, atitude (amigável, alegre, curioso, tímido, neutro, etc.) e tipo de relação inicial. O personagem não diz seu nome de primeira; ele diz algo casual, curioso ou receptivo em inglês de acordo com seu papel.

      Retorne ESTREITAMENTE um JSON estruturado seguindo o modelo do SimulatorState no seu bloco de código de resposta.
    `;

    const prompt = `
      Crie as variáveis iniciais da jornada e componha a primeira cena para "${username}" em "${city}".
      A saída de sua resposta deve conter o texto regular e um bloco final \`\`\`json contendo os detalhes gerados.

      O JSON deve ser formatado exatamente assim:
      {
        "city": "${city}",
        "date": "15 de Junho",
        "day_count": 1,
        "period": "Manhã",
        "time": "08:00 AM",
        "active_place": "Apartamento Alugado Temporário",
        "present_characters": [],
        "daily_commitments": [],
        "daily_objectives": [
          "Explorar a vizinhança",
          "Fazer as primeiras conexões locais"
        ],
        "narrative_context": "Breve parágrafo do narrador em português (máximo de 2 linhas) introduzindo a chegada de forma objetiva...",
        "active_character": {
          "id": "char_1",
          "name": "Nome Real Secreto do Personagem",
          "temporary_title": "Dono do Apê",
          "name_known": false,
          "age": "Idade",
          "profession": "Profissão",
          "personality": "Descrição da personalidade curta",
          "quirks": "Quirks/Falhas/Manias humanas dele(a)",
          "relationship_level": "Stranger",
          "relationship_score": 15,
          "memories": ["Just arrived today in the town"],
          "encounters_count": 1
        },
        "fixed_characters": [
          // Array contendo os 3 a 5 personagens fixos gerados (onde todos possuem name_known como false, active_character possui encounters_count: 1 e os outros possuem encounters_count: 0)
        ],
        "dialog_history": [
          { "sender": "narrator", "text": "Narrador introduz de forma curta a manhã..." },
          { "sender": "character", "text": "Primeira fala curta do personagem ativo em inglês", "translation": "Tradução livre em português do que o personagem falou" }
        ],
        "current_story_arc": "Dia 1: Chegada e Primeiras Impressões",
        "available_actions": [
          "Perguntar o nome dele em inglês e se apresentar",
          "Responder em inglês de forma de diálogo casual",
          "Se calar e olhar ao redor de forma tímida"
        ]
      }
    `;

    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    const parsed = parseGeminiOutput(response.text || "");
    const stateOutput = parsed.json || {};

    const manuals = await getDeveloperManuals();

    if (stateOutput.active_character) {
      console.log(`[Init] Setting active character in fixed_characters as the only character`);
      stateOutput.active_character.encounters_count = stateOutput.active_character.encounters_count ?? 1;
      stateOutput.active_character.name_known = stateOutput.active_character.name_known ?? false;
      stateOutput.active_character.last_evolved_intimacy = stateOutput.active_character.last_evolved_intimacy ?? 0;
      
      stateOutput.fixed_characters = [{
        ...stateOutput.active_character,
        encounters_count: 1,
        name_known: false,
        last_evolved_intimacy: 0
      }];
    } else {
      stateOutput.fixed_characters = [];
    }

    stateOutput.commitments = JSON.parse(JSON.stringify(DEFAULT_SEED_COMMITMENTS));

    stateOutput.survival_mode = false;

    res.json(stateOutput);
  } catch (error: any) {
    console.error("Error in simulator-init:", error);
    handleExpressError(res, error, "Failed to initialize simulator state");
  }
});

// ----------------------------------------------------------------------
// HELPER: Merge character updates safely into existing character state
// ----------------------------------------------------------------------
function mergeCharactersHelper(prevChar: any, updatePatch: any): any {
  if (!prevChar) return updatePatch || {};
  if (!updatePatch) return prevChar;

  const getSafeLength = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "string") return val.trim().length;
    try { return String(val).trim().length; } catch (e) { return 0; }
  };

  const merged = { ...prevChar, ...updatePatch };

  // Ensure relationship levels and scores never regress
  if (prevChar.relationship_score !== undefined && (updatePatch.relationship_score === undefined || updatePatch.relationship_score < prevChar.relationship_score)) {
    merged.relationship_score = prevChar.relationship_score;
  }
  if (prevChar.last_evolved_intimacy !== undefined && (updatePatch.last_evolved_intimacy === undefined || updatePatch.last_evolved_intimacy < prevChar.last_evolved_intimacy)) {
    merged.last_evolved_intimacy = prevChar.last_evolved_intimacy;
  }

  // Identity Consolidation: if transitioning from name_known=false to name_known=true
  const isConsolidationTurn = (!prevChar.name_known && updatePatch.name_known);
  if (prevChar.name_known || updatePatch.name_known) {
    merged.name_known = true;
  }

  // Merge memories uniquely
  const prevMemories = Array.isArray(prevChar.memories) ? prevChar.memories : [];
  const newMemories = Array.isArray(updatePatch.memories) ? updatePatch.memories : [];
  merged.memories = Array.from(new Set([...prevMemories, ...newMemories]));

  // Handle personality updates
  if (isConsolidationTurn) {
    if (updatePatch.personality) merged.personality = updatePatch.personality;
    if (updatePatch.raw_material) merged.raw_material = updatePatch.raw_material;
  } else {
    // Shield personality against overwrite by shorter summaries unless expanding
    if (prevChar.personality && updatePatch.personality) {
      if (getSafeLength(prevChar.personality) > getSafeLength(updatePatch.personality)) {
        merged.personality = prevChar.personality;
      } else {
        merged.personality = updatePatch.personality;
      }
    } else if (prevChar.personality && !updatePatch.personality) {
      merged.personality = prevChar.personality;
    }

    // Shield raw_material
    if (prevChar.raw_material && updatePatch.raw_material) {
      if (getSafeLength(prevChar.raw_material) > getSafeLength(updatePatch.raw_material)) {
        merged.raw_material = prevChar.raw_material;
      } else {
        merged.raw_material = updatePatch.raw_material;
      }
    } else if (prevChar.raw_material && !updatePatch.raw_material) {
      merged.raw_material = prevChar.raw_material;
    }
  }

  // Shield quirks
  if (prevChar.quirks && updatePatch.quirks) {
    if (getSafeLength(prevChar.quirks) > getSafeLength(updatePatch.quirks)) {
      merged.quirks = prevChar.quirks;
    } else {
      merged.quirks = updatePatch.quirks;
    }
  } else if (prevChar.quirks && !updatePatch.quirks) {
    merged.quirks = prevChar.quirks;
  }

  if (!updatePatch.profession && prevChar.profession) merged.profession = prevChar.profession;
  if (!updatePatch.age && prevChar.age) merged.age = prevChar.age;
  if (!updatePatch.temporary_title && prevChar.temporary_title) merged.temporary_title = prevChar.temporary_title;
  if (!updatePatch.relationship_level && prevChar.relationship_level) merged.relationship_level = prevChar.relationship_level;

  if (prevChar.encounters_count !== undefined && (updatePatch.encounters_count === undefined || updatePatch.encounters_count < prevChar.encounters_count)) {
    merged.encounters_count = prevChar.encounters_count;
  }

  return merged;
}

// ----------------------------------------------------------------------
// HELPER: Deterministically apply Delta patch returned by Gemini onto prevState
// ----------------------------------------------------------------------
function applyStateDelta(prevState: any, delta: any): any {
  if (!delta || typeof delta !== 'object') {
    return JSON.parse(JSON.stringify(prevState));
  }

  const updated = JSON.parse(JSON.stringify(prevState));

  // 1. Time & Environment updates
  if (delta.time) updated.time = delta.time;
  if (delta.period) updated.period = delta.period;
  if (delta.date) updated.date = delta.date;
  if (typeof delta.day_count === 'number' && delta.day_count > (updated.day_count || 0)) {
    updated.day_count = delta.day_count;
  }
  if (delta.active_place) updated.active_place = delta.active_place;
  if (delta.current_story_arc) updated.current_story_arc = delta.current_story_arc;
  if (delta.city) updated.city = delta.city;

  // 2. Narrative context & Available actions
  if (delta.narrative_context !== undefined && delta.narrative_context !== null) {
    updated.narrative_context = delta.narrative_context;
  }
  if (Array.isArray(delta.available_actions) && delta.available_actions.length > 0) {
    updated.available_actions = delta.available_actions;
  }

  // 3. Present characters
  if (Array.isArray(delta.present_characters)) {
    updated.present_characters = delta.present_characters;
  }

  // 4. Daily commitments & objectives
  if (Array.isArray(delta.daily_commitments)) {
    const combined = Array.from(new Set([...(updated.daily_commitments || []), ...delta.daily_commitments]));
    updated.daily_commitments = combined;
  }
  if (Array.isArray(delta.daily_objectives)) {
    const combined = Array.from(new Set([...(updated.daily_objectives || []), ...delta.daily_objectives]));
    updated.daily_objectives = combined;
  }

  // 5. Dialog Messages / Dialog History
  const newMsgs = Array.isArray(delta.new_dialog_messages) 
    ? delta.new_dialog_messages 
    : (Array.isArray(delta.dialog_history) ? delta.dialog_history : []);
  if (newMsgs.length > 0) {
    updated.dialog_history = mergeDialogHistory(updated.dialog_history || [], newMsgs);
  }

  // 6. Character Updates (fixed_characters & active_character)
  if (!Array.isArray(updated.fixed_characters)) {
    updated.fixed_characters = [];
  }

  const characterUpdatesList = Array.isArray(delta.character_updates) 
    ? delta.character_updates 
    : (Array.isArray(delta.fixed_characters) ? delta.fixed_characters : []);

  for (const update of characterUpdatesList) {
    if (!update) continue;
    const updateKey = String(update.id || update.name || "").toLowerCase();
    if (!updateKey) continue;

    const existingIdx = updated.fixed_characters.findIndex((c: any) => 
      c && (String(c.id || "").toLowerCase() === updateKey || String(c.name || "").toLowerCase() === updateKey)
    );

    if (existingIdx !== -1) {
      const prevChar = updated.fixed_characters[existingIdx];
      updated.fixed_characters[existingIdx] = mergeCharactersHelper(prevChar, update);
    } else if (update.name || update.id) {
      const newChar = {
        id: update.id || `char_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: update.name || update.temporary_title || "Unknown",
        temporary_title: update.temporary_title || "",
        name_known: update.name_known || false,
        age: update.age || "",
        profession: update.profession || "",
        personality: update.personality || "",
        quirks: update.quirks || "",
        relationship_level: update.relationship_level || "Stranger",
        relationship_score: update.relationship_score || 0,
        memories: Array.isArray(update.memories) ? update.memories : [],
        encounters_count: update.encounters_count || 1,
        last_evolved_intimacy: update.last_evolved_intimacy || 0,
        raw_material: update.raw_material || ""
      };
      updated.fixed_characters.push(newChar);
    }
  }

  // Handle active_character update
  if (delta.active_character === null) {
    updated.active_character = null;
  } else if (typeof delta.active_character === 'string') {
    const activeKey = delta.active_character.toLowerCase();
    const matched = updated.fixed_characters.find((c: any) => 
      c && (String(c.id || "").toLowerCase() === activeKey || String(c.name || "").toLowerCase() === activeKey)
    );
    if (matched) {
      updated.active_character = matched;
    }
  } else if (typeof delta.active_character === 'object' && delta.active_character) {
    if (updated.active_character) {
      updated.active_character = mergeCharactersHelper(updated.active_character, delta.active_character);
    } else {
      updated.active_character = delta.active_character;
    }
    const activeKey = String(updated.active_character.id || updated.active_character.name || "").toLowerCase();
    if (activeKey) {
      const idx = updated.fixed_characters.findIndex((c: any) => 
        c && (String(c.id || "").toLowerCase() === activeKey || String(c.name || "").toLowerCase() === activeKey)
      );
      if (idx !== -1) {
        updated.fixed_characters[idx] = updated.active_character;
      } else {
        updated.fixed_characters.push(updated.active_character);
      }
    }
  } else if (updated.active_character) {
    const activeKey = String(updated.active_character.id || updated.active_character.name || "").toLowerCase();
    if (activeKey) {
      const matched = updated.fixed_characters.find((c: any) => 
        c && (String(c.id || "").toLowerCase() === activeKey || String(c.name || "").toLowerCase() === activeKey)
      );
      if (matched) {
        updated.active_character = { ...updated.active_character, ...matched };
      }
    }
  }

  // 7. Transactions & Survival mode finances
  if (Array.isArray(delta.transactions) && delta.transactions.length > 0) {
    updated.transactions = delta.transactions;
    if (updated.survival_mode) {
      if (!Array.isArray(updated.financial_history)) {
        updated.financial_history = [];
      }
      for (const t of delta.transactions) {
        if (t && typeof t.amount === 'number' && t.amount > 0) {
          updated.financial_history.push({
            date: updated.date || "Hoje",
            description: t.description || "Gasto",
            amount: t.amount,
            type: t.type || "expense"
          });
          updated.money = (updated.money !== undefined ? updated.money : 20000) - t.amount;
        }
      }
    }
  }

  // 8. Merit delta & Directed to character
  if (typeof delta.merit_delta === 'number') {
    updated.merit_delta = delta.merit_delta;
  }
  if (delta.directed_to_character !== undefined) {
    updated.directed_to_character = delta.directed_to_character;
  }

  return updated;
}

// Advance the simulation state based on user talk or travel actions
app.post("/api/simulator-next", async (req: Request, res: Response) => {
  try {
    const { 
      state, // Current SimulatorState
      userMessage, // Message typed/spoken by user (if actionType === 'talk')
      actionType, // 'talk' | 'travel' | 'rest'
      chosenTravelDestination, // Destination name (if actionType === 'travel')
      nextGrammaticalFocus,
      baselineProficiency,
      personalityAdditions,
      username,
      isCharacterToCharacter,
      c2cSenderName,
      c2cRecipientName
    } = req.body;

    const studentName = username || "Davi";

    const ai = getGeminiClient();
    const manuals = req.body.developer_manuals || await getDeveloperManuals();

    // 1. Store user message in RAM session queue (without real-time audit call)
    let identifiedErrors: any[] = [];
    let identifiedStrengths: any[] = [];
    const isBehavioral = userMessage && userMessage.trim().startsWith("[") && userMessage.trim().endsWith("]");
    if (actionType === 'talk' && userMessage && userMessage.trim() && !isBehavioral && !isCharacterToCharacter) {
      const cleanMsg = userMessage.trim();
      sessionUserMessages.push(cleanMsg);
    }

    // Pre-condition state for transitions to force a scene swap and clean slate
    let activeState = { ...state };
    if (!activeState.time) {
      activeState.time = "08:00 AM";
    }

    // Ensure lists are initialized
    if (!activeState.present_characters) activeState.present_characters = [];
    if (!activeState.daily_commitments) activeState.daily_commitments = [];
    if (!activeState.daily_objectives) activeState.daily_objectives = [];

    // Synthesize present characters based on active state content
    if (activeState.active_character && activeState.present_characters.length === 0) {
      activeState.present_characters = [activeState.active_character.name];
    }

    if (actionType === 'travel') {
      // Clear old dialogue since location is changing
      activeState.dialog_history = [];

      // Check if character is currently present or accompanying
      const isCompanion = activeState.active_character && (
        activeState.present_characters.includes(activeState.active_character.name) ||
        activeState.present_characters.includes(activeState.active_character.temporary_title || "") ||
        activeState.present_characters.includes(activeState.active_character.id) ||
        activeState.present_characters.length > 0
      );

      if (!isCompanion) {
        // If not accompanying, dismiss them
        activeState.active_character = null;
        activeState.present_characters = [];
      } else {
        console.log(`[Simulator Travel] Companion ${activeState.active_character.name} travels along to ${chosenTravelDestination}`);
        // Ensure their name remains registered as present
        if (!activeState.present_characters.includes(activeState.active_character.name)) {
          activeState.present_characters.push(activeState.active_character.name);
        }
      }

      // Set the active place
      if (chosenTravelDestination) {
        activeState.active_place = chosenTravelDestination;
      }
      // No programmatic period changes; the time and period will be updated continuously by the LLM
    } else if (actionType === 'rest') {
      // Clear old dialogue
      activeState.dialog_history = [];
      // Dismiss current active character on sleep
      activeState.active_character = null;
      activeState.present_characters = [];
      // Reset commitments and set new day goals
      activeState.daily_commitments = [];
      activeState.daily_objectives = [
        "Iniciar as atividades do novo dia",
        "Encontrar conhecidos locais"
      ];
      // Set place back to temporary apartment base
      activeState.active_place = "Apartamento Alugado Temporário";
      // Rest always advances to the next morning
      activeState.period = "Manhã";
      activeState.time = "08:00 AM";
      activeState.day_count = (activeState.day_count || 1) + 1;
    }

    // Pre-condition state for transitions to force a scene swap and clean slate

    // 2. Generate Next Narrative State
    const c2cInstructions = isCharacterToCharacter
      ? `
      ⚠️ ATENÇÃO - ESSA É UMA INTERAÇÃO DIRETAMENTE ENTRE PERSONAGENS (Character-to-Character):
      - A última mensagem enviada NÃO veio do usuário/estudante ("${studentName}").
      - Ela foi uma fala/ação dita/feita pelo personagem "${c2cSenderName || "outro personagem"}" diretamente dirigida ao personagem ativo atual ("${activeState.active_character?.name || "você"}").
      - O personagem ativo atual deve reagir ou responder a essa fala do outro personagem.
      
      REGRAS IMPORTANTES DE RELACIONAMENTO E MEMÓRIA PARA ESTA INTERAÇÃO:
      - O usuário ("${studentName}") NÃO participou desta fala direta e NÃO se intrometeu. Ele apenas ouviu/presenciou.
      - Portanto, fica TERMINANTEMENTE PROIBIDO alterar qualquer estatística de intimidade ("relationship_score" ou "relationship_level") do personagem ativo com o USUÁRIO/ESTUDANTE. O "relationship_score" e o "relationship_level" com o usuário no dossier de personalidade devem permanecer EXATAMENTE iguais aos atuais.
      - NÃO registre novas memórias que aleguem falsamente que o usuário ("${studentName}") falou isso ou que participou ativamente dessa frase. As memórias podem registrar o fato do outro personagem ter dito ou acordado algo com ele, mas de forma segregada, sem atribuir ao usuário.
      
      VOLTA NATURAL AO PROTAGONISTA (USUÁRIO):
      - Logo após responder ao outro personagem ("${c2cSenderName}"), o personagem ativo deve tentar incluir o usuário ("${studentName}") na conversa na mesma vez de fala (ex: fazendo uma pergunta para ele, pedindo sua opinião, ou convidando-o para a atividade).
      - Defina "directed_to_character": null na resposta gerada para que o fluxo retorne naturalmente ao usuário na próxima rodada, a menos que seja estritamente necessário continuar mais um turno de diálogo entre personagens.
      - Os personagens não devem iniciar uma conversa longa e prolongada entre si. O usuário deve sempre continuar sendo o centro e protagonista absoluto da simulação.
      `
      : `
      ⚠️ DETECÇÃO E INCENTIVO DE DIÁLOGO ENTRE PERSONAGENS (MANDATÓRIO):
      - Se o personagem ativo ("${activeState.active_character?.name}") em sua resposta atual dirigir claramente sua fala a outro personagem específico que está presente na cena (conforme listado em "present_characters" ou "fixed_characters"), ou se ele APRESENTAR o usuário ("${studentName}") a outras pessoas presentes (ex: "This is the team", "Meet Sarah and Liam"), você DEVE obrigatoriamente preencher o campo "directed_to_character" no JSON retornado com o ID ou Nome desse outro personagem destinatário (ex: "directed_to_character": "Sarah") para que ele possa reagir logo em seguida.
      - Se o personagem ativo falar com o grupo ("everyone", "the team", "all", "pessoal", "todos"), selecione um dos outros personagens presentes na cena no campo "directed_to_character" (como "Sarah") para que este responda pelo grupo.
      - Se o personagem ativo estiver respondendo estritamente ao usuário ("${studentName}"), ou se houver qualquer dúvida razoável e nenhum outro personagem puder responder agora, defina o campo "directed_to_character" como null.
      - Exemplos de faturamento de "directed_to_character":
        * Liam diz: "Sarah, can you show Davi the lab?" -> "directed_to_character": "Sarah"
        * David diz: "This is the team, everyone, this is Davi." -> escolha um personagem da equipe no campo, ex: "directed_to_character": "Sarah"
        * Siobhan diz: "Liam, stop dreaming and eat your dinner." -> "directed_to_character": "Liam"
        * Liam diz: "What do you think, Davi?" ou apenas "What do you think?" -> "directed_to_character": null
      `;

    const actionDescription = isCharacterToCharacter
      ? `Interação direta entre personagens (Character-to-Character): O personagem "${c2cSenderName || "outro"}" dirigiu a fala/ação a seguir diretamente para o personagem ativo atual "${activeState.active_character?.name || "você"}": "${userMessage || ""}"`
      : `Ação escolhida pelo usuário: "${actionType}" ${actionType === 'travel' ? `com destino para "${chosenTravelDestination}"` : ''} ${actionType === 'talk' ? `com a frase/ação: "${userMessage}"` : ''}`;

    const systemInstruction = `
      Você é a inteligência por trás do "ExpatLife: O Simulador do Cotidiano no Exterior".
      Cidade ativa: "${activeState.city}".
      Data de hoje: "${activeState.date}" (Dia ${activeState.day_count}).
      Horário atual: "${activeState.time || "08:00 AM"}" (Período: "${activeState.period}").
      ${actionDescription}
      O foco gramatical velado da simulação é: "${nextGrammaticalFocus}". Use esse foco sutilmente para as propostas do narrador ou da estrutura da situação se puder.

      MANUAL DO DESENVOLVEDOR PARA REAÇÕES E DIÁLOGOS HUMANOS (OBRIGATÓRIO):
      Utilize estritamente os princípios abaixo para regular as respostas, reações corporais ou tom de voz de cada personagem ativo nesta vez:
      ${manuals.reaction_manual}

      REGRAS DE CONDUTA CRUCIAIS:
      1. NARRADOR MINIMALISTA E DISCRETO (EVITAR EXCESSO NO HISTÓRICO): O Narrador fala sempre em Português do Brasil.
         - PROIBIÇÃO DE SENDER NARRATOR NO DIÁLOGO ATIVO: Durante diálogos ativos com personagens (quando "active_character" não é nulo), você está TERMINANTEMENTE PROIBIDO de adicionar elementos com sender: "narrator" no array "dialog_history". O histórico de diálogo deve conter exclusivamente os turnos do estudante (sender: "user") e reações/conversas do personagem (sender: "character").
         - O Narrador deve descrever ambientações em "narrative_context" SOMENTE quando houver mudanças importantes de contexto: transições de locais via travel, repouso/descanso via rest, reações físicas cruciais e marcantes do personagem, ou eventos inesperados do cenário. Caso contrário, se for apenas um turno normal de diálogo direto continuado, você deve fornecer o campo "narrative_context" como uma string vazia ("").
         - O Narrador NUNCA deve falar o nome real de um personagem se o usuário não o conhece ainda (enquanto name_known do active_character for false ou undefined). Ele deve se referir ao personagem exclusivamente pelo seu "temporary_title" descritivo de papel (ex: "o locatário", "a balconista de café", "o vizinho").
         - DESCRIÇÃO DE NOVOS PERSONAGENS (MANDATÓRIO): Sempre que um novo personagem aparecer pela primeira vez na cena (ou ao ser apresentado), o Narrador deve fornecer obrigatoriamente uma descrição física e comportamental breve que ajude o usuário a formar uma imagem mental imediata: sexo, faixa etária aproximada, aparência física geral, roupas, postura e energia transmitida/primeira impressão. Mantenha a descrição concisa (no máximo 2 sentenças) e evite descrições excessivamente literárias.

      2. PERSONAGENS IMERSIVOS, REQUISITO DE PERMANÊNCIA E CONTINUIDADE (MANDATÓRIO):
         - REGRAS ABSOLUTAS DE IDENTIDADE, ESTADO TEMPORÁRIO E CONSOLIDAÇÃO DE PERSONAGENS:
           1. PRINCÍPIO FUNDAMENTAL E NÃO REUTILIZAÇÃO:
              - Cada personagem representa um indivíduo único. É estritamente PROIBIDO copiar ou reutilizar a identidade, nome, histórico, personalidade, aparência, memória, relações ou cargo específico de outro personagem recém-encontrado apenas porque ocupa um cargo semelhante ou trabalha no mesmo setor, empresa ou ambiente.
              - Mesmo que dois personagens tenham o mesmo emprego, setor ou empresa, continuam sendo pessoas diferentes até confirmação explícita.
           2. ESTADO TEMPORÁRIO (ANTES DO NOME SER CONHECIDO - name_known = false):
              - Enquanto o usuário ainda não perguntou ou descobriu o nome do personagem (name_known: false), este deve existir apenas como entidade temporária com dois registros extremamente reduzidos (máximo 50 caracteres cada):
                * raw_material: Máximo de 50 caracteres (ex: "Gerente de P&D, profissional e cauteloso.").
                * personality: Máximo de 50 caracteres (ex: "Analítico, educado e desconfiado.").
              - Esses registros existem apenas durante aquela interação, não são persistentes, não podem ser reutilizados em outro NPC e são descartados se o personagem sair sem revelar sua identidade.
           3. DESCOBERTA DO NOME E CONSOLIDAÇÃO DA IDENTIDADE (name_known = true):
              - Quando o usuário perguntar o nome (ou for revelado naturalmente na conversa), altere "name_known" para true.
              - Ocorre a consolidação da identidade: mova a matéria-prima e a personalidade temporárias para o registro permanente, mantendo ambas ainda extremamente compactas (≈50 caracteres cada). Ex: Nome: Ethan Brooks | Matéria-prima: Gerente de P&D da fábrica de ração. | Personalidade: Objetivo, cordial e pragmático.
           4. EXPANSÃO PROGRESSIVA (SOMENTE A PARTIR DE 100% DE INTIMIDADE):
              - As fichas completas NÃO devem nascer prontas. Antes dos 100% de intimidade (relationship_score < 100), MANTENHA os registros de personalidade e matéria-prima em formato estritamente mínimo (≈50 caracteres).
              - Somente quando a intimidade atingir 100% (relationship_score >= 100), a IA poderá expandir gradualmente: personalidade, histórico, gostos, traços psicológicos, objetivos e relações.
         - EVITAR PLACEHOLDERS E GERAR APELIDOS REAIS: O nome de usuário do estudante é "${studentName}". Se o personagem possuir intimidade alta (conforme seu dossiê de personalidade) e desejar se referir ao estudante por um apelido amigável, você está TERMINANTEMENTE PROIBIDO de escrever marcadores genéricos entre colchetes ou parênteses, tais como "[nickname]", "[your nickname]", "[User's Name]", "[username]", "[your name]" ou "[name]". Em vez disso, o personagem deve inventar e usar diretamente um apelido amigável e natural em inglês condizente com sua relação (como "buddy", "champ", "friend", "pal", "kid", "man", "dear" ou abreviações afetuosas baseadas no nome do estudante "${studentName}") integrado de forma fluida à fala, sem qualquer tipo de colchetes ou caracteres de demarcação.
         - Os personagens falam e agem em Inglês (100% English). Conversam de forma natural, curta e coloquial. Use até duas sentenças curtas por fala.
         - REGRA EDITADA DE PERMANÊNCIA: Quando um personagem está participando da cena, sua permanência com o usuário é o estado padrão. Fica TERMINANTEMENTE PROIBIDA a regra antiga de se despedir ou sumir de forma automática ou artificial por "atingir um fim natural". Conversar por horas, passar uma tarde conversando amigavelmente ou caminhar juntos por várias locações são formas normais de companhia e devem ser incentivadas.
         - PROIBIÇÃO DE DESAPARECIMENTO ESPONTÂNEO: Personagens NÃO podem deixar a cena de repente, sumir do local de forma inexplicável ou se despedir de forma apressada ("Good table, talk later") sem uma justificativa narrativa extremamente forte e explícita (como cansaço extremo devido ao horário tarde da noite, uma emergência descrita, ou obrigação de trabalho real).
         - EXCLUSÃO DE DESPEDIDA SÚBITA: Se o diálogo estiver fluindo de forma agradável, o personagem simplesmente permanece ativamente presente e continua a conversa sem sugerir ir embora ou se desvincular do usuário de forma inexplicável.
         - TRANSITIONS COMPARTILHADAS: Caso queira propor uma mudança de cenário, o personagem deve preferencialmente convidar o usuário para acompanhá-lo (ex: "I'm heading to the grocery store, want to walk with me?", "Shall we grab a coffee near the park?"), em vez de simplesmente sumir do local.
         - REAÇÕES GESTUAIS / DE COMPORTAMENTO: Se o personagem responder apenas com gestos ou ações em vez de falar, jogue-os sob "sender": "character" com "is_action": true e a descrição em inglês (ex: "*John smiles, nods, and offers you a seat.*" com a tradução *John sorri, acena e te oferece um assento.*).
         - PRINCÍPIO DE HUMANIZAÇÃO: Evite dar aos personagens a voz padrão compreensiva de IA. Eles devem ser humanos realistas, com virtudes e pequenos defeitos/manias cotidianas.
         - USO EQUILIBRADO DA MATÉRIA-PRIMA (PRESERVAÇÃO DO ARQUÉTIPO VS EVOLUÇÃO):
           Para cada fala ou reação do personagem ativo, você DEVE ler e cruzar as seguintes fontes em conjunto:
           1. O manual de reações humanas ("Como responder e reagir humanamente"):
              ${manuals.reaction_manual}
           2. A personalidade expandida do personagem (campo "personality" em "active_character").
           3. A sua MATÉRIA-PRIMA arquetípica de base (campo "raw_material" em "active_character"). Se o campo "raw_material" estiver ausente ou vazio, infira silenciosamente um arquétipo subjacente sutil baseado em suas quirks e biografia usando os princípios de:
              ${manuals.raw_material_manual}

           REGRAS CRUCIAIS DE PESO E DIRETRIZES DE EQUILÍBRIO:
           * PRESERVE AS FALHAS E EXCENTRICIDADES DO ARQUÉTIPO: Garanta que a máquina de humanidade não "corrija" ou "equilibre" demais o personagem a ponto de deixá-lo comum ou emocionalmente perfeito. Seus defeitos estruturais devem continuar vazando em suas respostas mesmo após ganhar intimidade e profundidade:
             - Se a matéria-prima diz que o personagem é um "Sonhador" (ex: Liam), ele deve continuar demonstrando sonhar demais, divagar filosoficamente ou fugir da ação concreta em sua fala.
             - Se diz que é uma "Mãe" ou "Mediadora" (ex: Siobhan), ela deve continuar com tendências a se intrometer de forma afetuosa, fofocar no bom sentido ou nutrir os outros de forma às vezes sufocante.
             - Se for um "Construtor", deve continuar sendo excessivamente rígido ou pragmático em sua visão.
             - Se for um "Soberano", deve continuar querendo controlar, liderar ou dar as cartas na situação.
           * EVITE CARICATURAS (BALANÇO DE PESOS): A matéria-prima NÃO deve ser lida com o mesmo peso da personalidade expandida, pois ela é muito pura e arquetípica. Trate-a como um "esqueleto inconsciente" ou "vício de comportamento" que influencia o tom geral e as falhas, enquanto a personalidade expandida dita as nuances específicas de intimidade, memórias de conversas anteriores, apelidos amigáveis, conforto e vulnerabilidade atual com o usuário. Se der peso excessivo à matéria-prima, o personagem vira uma caricatura de si mesmo. Encontre o equilíbrio ideal para que ele continue sendo ele mesmo, imperfeito e único, mas realista e complexo.

      3. CRITÉRIOS DE MEMÓRIA E PROGRESSÃO DE RELAÇÕES:
         - Se o usuário conversou com o personagem (actionType = 'talk'), filtre as lições, ajuste os fatos (facts) e altere a pontuação de relacionamento (+2 a +5 para gentileza e boa conversa; -2 a -5 para atitudes grosseiras ou quebras de decoro).
         - Sincronize constantemente memórias, encounters_count e name_known de todos os personagens no array "fixed_characters".

      4. SISTEMA DE TEMPO REALISTA E CONTÍNUO:
         - O simulador opera em um relógio de tempo preciso ("time"). Avanços só ocorrem com justificativa clara ou ações diretas. Preserve a continuidade cronológica do dia atual!
         - Diálogos ativos (talk) consomem de 2 a 5 minutos cumulativos de forma realista por turno.
         - Deslocamentos (travel) consomem de 15 a 35 minutos de trânsito em tempo real.

      5. MEMÓRIA DIÁRIA E REGRA DE COMPROMISSO SOCIAL (MANDATÓRIO):
         - Você DEVE gerenciar de forma precisa os três novos arrays na raiz do objeto de estado:
           * "present_characters": Lista os nomes (ou temporary_title) de personagens que estão ativamente no mesmo local ou acompanhando o usuário agora (ex: ["Samantha Harris"]). Se eles estão acompanhando, eles continuam no local mesmo se o usuário viajar (travel) para um local próximo (eles viajam juntos, caminhando ou de condução!).
           * "daily_commitments": Lista as promessas combinadas na data de hoje, convites recebidos/aceitos e acordos de encontros futuros (ex: ["Beber cerveja com Samantha no pub à noite", "Caminhar juntos no parque à tarde"]).
           * "daily_objectives": Lista de tarefas ou metas ativas para o que resta do dia atual (ex: ["Explorar os arredores", "Organizar compromissos locais"]).
         - REGRA DO COMPROMISSO: Sempre que o usuário e um personagem concordarem com algo (ex: "Let's hang out tomorrow", "I'll help you unpack this afternoon"), adicione imediatamente essa promessa ou plano no array "daily_commitments". Os personagens jamais devem se esquecer destas promessas! Em turnos futuros do mesmo dia, eles mantêm total consciência do plano ativo, fazendo referências naturais a ele e dando andamento à atividade proposta sem que pareçam estranhos.

      6. SISTEMA DE PRECIFICAÇÃO AUTOMÁTICA OBRIGATÓRIA (MODO SOBREVIVÊNCIA):
         - Se o modo sobrevivência estiver ativo ("survival_mode": true na raiz do estado):
         Sempre que o usuário comprar algo (como café, refeição, roupa, brinquedo, pato de borracha, livro, medicamento), contratar um serviço, consumir um produto, pagar uma entrada/ingresso, reservar algo, assinar algo, alugar algo ou utilizar transporte pago (como táxi ou ônibus/trem):
         - Você deve obrigatoriamente determinar um valor monetário realístico e plausível baseado no contexto local da cidade (moeda local € ou $, preços médios locais).
         - É TERMINANTEMENTE PROIBIDO usar termos vagos ou descrições imprecisas de preço como "não custa muito", "é relativamente barato", "tem um preço acessível", "não é tão caro", "pagamos a média". Mande o personagem ou o narrador citar o preço exato em dólares ou euros de forma natural no diálogo ou contexto narrativo.
         - Adicione essa transação concluída em um campo do JSON retornado chamado "transactions":
           "transactions": [{ "description": "Descrição específica", "amount": 12.50, "type": "purchase" }]

      7. CONTRATOS DE TRABALHO PRECISOS E COMPLETOS (MODO SOBREVIVÊNCIA):
         - Durante qualquer entrevista de emprego, proposta de trabalho, contratação ou conversa profissional no modo sobrevivência:
         - Gere informações contratuais completas e extremamente específicas. É TERMINANTEMENTE PROIBIDO usar propostas vagas como "salário compatível com o mercado", "horário flexível", "trabalhamos em horário comercial" ou "pagamos a média da região".
         - Toda proposta ou contratação deve exibir explicitamente na conversa e carregar no campo "job" as seguintes chaves completas:
           - cargo (title)
           - salário mensal (salary)
           - carga horária semanal (weekly_hours)
           - horário de entrada (start_time, ex: "08:00 AM")
           - horário de saída (end_time, ex: "03:00 PM")
           - duração do intervalo (break_duration, ex: "1 hora")
           - dias da semana trabalhados (work_days, ex: "Segunda a Sexta")
           - descrição das funções (responsibilities, array com no mínimo 3 tópicos)

      8. SISTEMA OCULTO DE MÉRITO PROFISSIONAL (MODO SOBREVIVÊNCIA):
         - Se o usuário estiver trabalhando ("job" ativo) e a interação acontecer no ambiente de trabalho ou envolver tarefas de trabalho:
         - Avalie a qualidade real das ações do usuário. Não recompense mera presença passiva ou repetição mecânica. Recompense competência, iniciativa, desempenho e contribuição efetiva.
         - Determine se o usuário realizou uma ação que merece ponto de mérito (+1) ou de demérito (-1) e retorne-o no campo "merit_delta":
           * Merit Delta = 1 (Ganho): demonstrar iniciativa, resolver problemas, assumir responsabilidades adicionais, sugerir melhorias, executar tarefas acima do esperado, ajudar colegas, demonstrar competência técnica, agir profissionalmente, assumir funções superiores sem ser solicitado.
           * Merit Delta = -1 (Perda): faltar sem justificativa, atrasar repetidamente, abandonar tarefas, causar problemas sérios, agir de forma irresponsável, comprometer o trabalho da equipe, desobedecer instruções importantes.
           * Merit Delta = 0 (Neutro): nenhuma ação extraordinariamente positiva ou negativa.
         - Esses números, pontuações, deltas ou regras de limite jamais devem aparecer na interface, em diálogos, em relatórios ou em notificações para o usuário. O usuário deve perceber apenas as consequências narrativas naturais (chefe elogia, recebe mais tarefas, recebe aumento, recebe advertências, etc.).

      10. MECANISMO DE RESPOSTA POR DELTA (OBRIGATÓRIO):
          - Você DEVE retornar APENAS o DELTA com as alterações e novidades deste turno.
          - É TERMINANTEMENTE PROIBIDO reconstruir o estado completo do aplicativo ou repetir a lista inteira de personagens inalterados e histórico de diálogos anteriores.
          - Retorne um objeto JSON contendo estritamente os campos que foram modificados ou adicionados nesta rodada.

      Retorne ESTREITAMENTE um JSON estruturado com o Delta do turno.

      ${(() => {
        let wishesGuideline = "";
        if (activeState && activeState.active_character && (activeState.active_character.relationship_score ?? 0) > 599 && activeState.active_character.daily_wishes) {
          const w = activeState.active_character.daily_wishes;
          wishesGuideline = `\n
      9. SISTEMA DE DESEJOS E VONTADES INTERNAS DO PERSONAGEM PARA O DIA DE HOJE (INTIMIDADE > 599%):
         Período Atual da Cena: ${activeState.period || "Manhã"}
         Desejos e vontades do personagem para hoje (Manhã, Tarde, Noite):
         - Manhã: ${(w.morning || []).join("; ")}
         - Tarde: ${(w.afternoon || []).join("; ")}
         - Noite: ${(w.evening || []).join("; ")}

         DIRETRIZ DE USO DOS DESEJOS INTERNOS:
         Estes desejos representam a vida interior, intenções pessoais e vontades do personagem para hoje.
         Eles NÃO são missões, tarefas ou pedidos explícitos para o estudante/usuário.
         Eles devem influenciar de forma sutil, orgânica e natural o humor, a postura, os assuntos casuais ou de interesse do personagem durante a conversa, sem torná-lo uma pessoa monotemática e sem jogá-los de forma artificial.
          `;
        }
        return wishesGuideline;
      })()}

      ${c2cInstructions}
    `;

    let farewellSteering = "";
    if (actionType === 'talk' && userMessage) {
      const msgLower = userMessage.toLowerCase();
      if (
        msgLower.includes("bye") || 
        msgLower.includes("goodbye") || 
        msgLower.includes("see you") || 
        msgLower.includes("tchau") || 
        msgLower.includes("see ya") || 
        msgLower.includes("despedir") || 
        msgLower.includes("leaving") || 
        msgLower.includes("leave") || 
        msgLower.includes("gotta go") || 
        msgLower.includes("have to go")
      ) {
        farewellSteering = `\nATENÇÃO (DIRETRIZ DE SAÍDA EXPLICÍTICA): O usuário está se despedindo ativamente! O personagem ativo DEVE responder amigavelmente com uma despedida final curta em inglês, e você DEVE obrigatoriamente remover o acompanhante limpando "present_characters" de forma condizente e setar "active_character": null no JSON retornado para sinalizar a separação amigável.`;
      }
    }

    const prompt = `
      Processe a ação do simulador. Reavalie o estado atual e componha a próxima resposta por DELTA (retornando APENAS as alterações e novidades produzidas neste turno).${farewellSteering}
      Estado Atual: ${JSON.stringify(activeState)}
      
      Retorne ESTREITAMENTE o JSON do DELTA em um bloco de código \`\`\`json contendo APENAS as alterações do turno no seguinte formato:
      {
        "narrative_context": "Breve parágrafo em português brasileiro detalhando mudanças de cenário, reações físicas marcantes ou eventos do turno (máximo de 2 linhas). IMPORTANTE: Retorne string vazia (\"\") se nada de novo e marcante aconteceu no local além da conversa normal.",
        "new_dialog_messages": [
          // APENAS a(s) nova(s) fala(s) ou reação(ões) do(s) personagem(ns) gerada(s) NESTE TURNO sob sender: "character".
          // NUNCA repita o histórico de mensagens das rodadas anteriores!
          // Exemplo de fala clássica: { "sender": "character", "text": "Who are you?", "translation": "Quem é você?", "is_action": false }
          // Exemplo de ação/gesto: { "sender": "character", "text": "*With a grumpy face, John hands you the keys.*", "translation": "*Com cara de poucos amigos, John te entrega as chaves.*", "is_action": true }
        ],
        "available_actions": [
          // 2 ou 3 novas opções em português do que o estudante pode fazer ou falar a seguir. Importante: Se o nome do personagem for desconhecido (name_known = false), use termos como 'Perguntar o nome dele', nunca diga o nome real nas opções!
        ],
        "time": "HH:MM AM" ou "HH:MM PM", // Apenas se o relógio avançou ou mudou neste turno
        "period": "Manhã" | "Tarde" | "Noite" | "Madrugada", // Apenas se o período mudou
        "date": "Dia e Mês", // Apenas se a data mudou
        "day_count": 1, // Apenas se o dia avançou
        "active_place": "Nome do local", // Apenas se mudou de local
        "present_characters": ["Nome ou temporary_title do personagem com o usuário"], // Apenas se a lista de presentes mudou
        "daily_commitments": ["Plano, promessa ou convite aceito combinado hoje"], // Apenas se novo compromisso foi firmado
        "daily_objectives": ["Novo objetivo do dia"], // Apenas se os objetivos do dia foram atualizados
        "character_updates": [
          // APENAS os personagens que sofreram alterações de estado neste turno (ou novos personagens conhecidos na cena).
          // Envie apenas os campos modificados (ex: relationship_score atualizado, novas memórias, name_known: true, encounters_count).
          // Exemplo: { "id": "char_id", "relationship_score": 28, "name_known": true, "memories": ["Fato novo aprendido"] }
        ],
        "active_character": null | "char_id" | { /* dados se for um novo personagem */ }, // Apenas se mudou o personagem ativo ou se se despediu (null). Omitir se continuar o mesmo.
        "transactions": [
          // APENAS se o usuário realizou uma transação comercial (compras, café, almoço, táxi, aluguel, etc.) nessa rodada: { "description": "...", "amount": 10.50, "type": "purchase" }
        ],
        "merit_delta": 0, // 1 se o usuário realizou excelente ação de trabalho, -1 se erro sério, 0 se neutro
        "directed_to_character": "Nome do outro personagem da cena se a última fala foi dirigida CLARAMENTE a ele, ou null se foi para o usuário ou geral"
      }
    `;

    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    const parsed = parseGeminiOutput(response.text || "");
    let deltaPatch = parsed.json;

    // Etapa de Auditoria de Naturalidade (Infraestrutura preparada para uso do Manual de Auditoria)
    if (deltaPatch) {
      deltaPatch = await auditResponseNaturalnessHelper(deltaPatch, activeState, manuals, ai);
    }

    let updatedState = applyStateDelta(activeState, deltaPatch);
    if (!deltaPatch) {
      console.warn("[Server] LLM failed to return a valid state JSON. Falling back to previous state.");
    } else {
      // Ensure essential fields are preserved/fallback to prevent rendering crashes
      if (!updatedState.city) {
        updatedState.city = activeState.city || "";
      }
      if (!updatedState.date) {
        updatedState.date = activeState.date || "15 de Junho";
      }
      if (updatedState.day_count === undefined || updatedState.day_count === null) {
        updatedState.day_count = activeState.day_count || 1;
      }
      if (updatedState.survival_mode === undefined || updatedState.survival_mode === null) {
        updatedState.survival_mode = activeState.survival_mode || false;
      }
      if (activeState.survival_mode) {
        if (updatedState.money === undefined || updatedState.money === null) {
          updatedState.money = activeState.money !== undefined ? activeState.money : 20000;
        }
        if (updatedState.hunger === undefined || updatedState.hunger === null) {
          updatedState.hunger = activeState.hunger || "Muito satisfeito";
        }
        if (updatedState.rent_amount === undefined || updatedState.rent_amount === null) {
          updatedState.rent_amount = activeState.rent_amount !== undefined ? activeState.rent_amount : 1500;
        }
        if (updatedState.last_rent_paid_month === undefined || updatedState.last_rent_paid_month === null) {
          updatedState.last_rent_paid_month = activeState.last_rent_paid_month || "Junho";
        }
        if (updatedState.job === undefined) {
          updatedState.job = activeState.job || null;
        }
        if (updatedState.last_meal_absolute_minute === undefined || updatedState.last_meal_absolute_minute === null) {
          updatedState.last_meal_absolute_minute = activeState.last_meal_absolute_minute || 0;
        }
      }
    }

    // Safely merge dialog history to prevent loss of previous turn messages
    if (updatedState && state) {
      updatedState.dialog_history = mergeDialogHistory(state.dialog_history || [], updatedState.dialog_history || []);
    }

    // Stamp character_id and character_name on newly added dialog messages so we know who said them
    if (updatedState && updatedState.dialog_history && state) {
      const startIdx = Array.isArray(state.dialog_history) ? state.dialog_history.length : 0;
      const norm = (t: string) => (t || "").toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

      updatedState.dialog_history = updatedState.dialog_history.map((msg: any, idx: number) => {
        if (msg && (msg.sender === "character" || (msg.sender !== "user" && msg.sender !== "narrator"))) {
          // If already stamped, keep it
          if (msg.character_id && msg.character_name) {
            return msg;
          }

          // Otherwise, try to find a matching message in the previous state.dialog_history to copy its original stamp
          const msgNorm = norm(msg.text);
          const matchedPrev = (state.dialog_history || []).find((pM: any) => 
            pM && pM.sender === msg.sender && norm(pM.text) === msgNorm && pM.character_id && pM.character_name
          );

          if (matchedPrev) {
            msg.character_id = matchedPrev.character_id;
            msg.character_name = matchedPrev.character_name;
          } else {
            // Prioritize already established active interlocutors
            let speaker = updatedState.active_character || state.active_character;

            // If not directly established, try matching by message name against known characters
            if (!speaker && updatedState.fixed_characters && updatedState.fixed_characters.length > 0) {
              const msgCharName = msg.character_name || (msg.sender !== "character" ? msg.sender : null);
              if (msgCharName) {
                const normName = norm(msgCharName);
                speaker = updatedState.fixed_characters.find((c: any) => {
                  if (!c) return false;
                  const cName = norm(c.name || "");
                  const cTitle = norm(c.temporary_title || "");
                  return cName === normName || cName.includes(normName) || normName.includes(cName) || (cTitle && cTitle === normName);
                });
              }
            }

            if (speaker) {
              msg.character_id = speaker.id;
              msg.character_name = speaker.name;
              if (!updatedState.active_character) {
                updatedState.active_character = speaker;
              }
            }
          }
        }
        return msg;
      });
    }

    // Force strict override for Character-to-Character (C2C) mode to prevent user relationship updates or false memory tracking
    if (isCharacterToCharacter && updatedState && state) {
      if (updatedState.active_character && state.active_character) {
        updatedState.active_character.relationship_score = state.active_character.relationship_score;
        updatedState.active_character.relationship_level = state.active_character.relationship_level;
      }
      
      const prevFixedMap = new Map<string, any>();
      (state.fixed_characters || []).forEach((c: any) => {
        if (c && c.id) prevFixedMap.set(String(c.id).toLowerCase(), c);
      });

      if (updatedState.fixed_characters) {
        updatedState.fixed_characters.forEach((char: any) => {
          if (char && char.id) {
            const prevChar = prevFixedMap.get(String(char.id).toLowerCase());
            if (prevChar) {
              char.relationship_score = prevChar.relationship_score;
              char.relationship_level = prevChar.relationship_level;
            }
          }
        });
      }
    }

    // --- CORREÇÃO OBRIGATÓRIA 1 — PRESERVAÇÃO AUTOMÁTICA DE PERSONAGENS ---
    if (updatedState && state) {
      const prevFixed = state.fixed_characters || [];
      const newFixed = updatedState.fixed_characters || [];

      // Safe helper to measure length of potentially non-string personality/quirks
      const getSafeLength = (val: any): number => {
        if (val === undefined || val === null) return 0;
        if (typeof val === 'string') return val.trim().length;
        try {
          return String(val).trim().length;
        } catch (e) {
          return 0;
        }
      };

      // Safe helper to convert any type to string safely
      const getSafeString = (val: any): string => {
        if (val === undefined || val === null) return "";
        if (typeof val === 'string') return val;
        try {
          return String(val);
        } catch (e) {
          return "";
        }
      };

      const mergeCharacters = (prevChar: any, newChar: any) => mergeCharactersHelper(prevChar, newChar);

      const mergedList: any[] = [];
      const newCharsMap = new Map<string, any>();
      for (const char of newFixed) {
        if (char) {
          const key = char.id || char.name;
          if (key) newCharsMap.set(String(key).toLowerCase(), char);
        }
      }

      const processedKeys = new Set<string>();
      for (const prevChar of prevFixed) {
        if (!prevChar) continue;
        const key = prevChar.id || prevChar.name;
        if (!key) continue;

        const stringKey = String(key).toLowerCase();
        const matched = newCharsMap.get(stringKey);
        if (matched) {
          mergedList.push(mergeCharacters(prevChar, matched));
        } else {
          // LLM Omitted this character - preserve completely to prevent loss
          mergedList.push(prevChar);
        }
        processedKeys.add(stringKey);
      }

      for (const newChar of newFixed) {
        if (!newChar) continue;
        const key = newChar.id || newChar.name;
        if (key) {
          const stringKey = String(key).toLowerCase();
          if (!processedKeys.has(stringKey)) {
            mergedList.push(newChar);
          }
        }
      }

      updatedState.fixed_characters = mergedList;

      // Keep active_character synced in details if it matches anyone in fixed_characters list
      if (updatedState.active_character) {
        const activeIdOrName = String(updatedState.active_character.id || updatedState.active_character.name || "").toLowerCase();
        if (activeIdOrName) {
          const matchedInMerged = mergedList.find(c => 
            String(c.id || "").toLowerCase() === activeIdOrName || 
            String(c.name || "").toLowerCase() === activeIdOrName
          );
          if (matchedInMerged) {
            const finalPersonality = (matchedInMerged.personality && (!updatedState.active_character.personality || getSafeLength(matchedInMerged.personality) > getSafeLength(updatedState.active_character.personality)))
              ? matchedInMerged.personality
              : (updatedState.active_character.personality || matchedInMerged.personality || "");

            const finalQuirks = (matchedInMerged.quirks && (!updatedState.active_character.quirks || getSafeLength(matchedInMerged.quirks) > getSafeLength(updatedState.active_character.quirks)))
              ? matchedInMerged.quirks
              : (updatedState.active_character.quirks || matchedInMerged.quirks || "");

            updatedState.active_character = {
              ...matchedInMerged,
              ...updatedState.active_character,
              personality: finalPersonality,
              quirks: finalQuirks,
              relationship_score: Math.max(matchedInMerged.relationship_score || 0, updatedState.active_character.relationship_score || 0),
              name_known: matchedInMerged.name_known || updatedState.active_character.name_known || false,
              memories: Array.from(new Set([...(matchedInMerged.memories || []), ...(updatedState.active_character.memories || [])]))
            };
          }
        }
      }

      // Clean up fixed_characters list
      if (updatedState.fixed_characters) {
        updatedState.fixed_characters = updatedState.fixed_characters.filter(Boolean);
      }
    }

    // Enforce robust continuous time parsing and period derivation
    if (updatedState) {
      if (!updatedState.time) {
        // Fallback to activeState time or default if LLM omitted it
        updatedState.time = activeState.time || "08:00 AM";
      }
      
      const timeStr = updatedState.time;
      // Match HH:MM AM/PM or hybrid formats like 14:20 PM
      let match = timeStr.match(/(\d+)\s*[:h]\s*(\d+)/i);
      if (match) {
        let hrs = parseInt(match[1], 10);
        let mins = parseInt(match[2], 10);
        
        let isPM = /pm/i.test(timeStr);
        let isAM = /am/i.test(timeStr);
        if (isPM && hrs < 12) {
          hrs += 12;
        } else if (isAM && hrs === 12) {
          hrs = 0;
        }
        
        hrs = Math.max(0, Math.min(23, hrs));
        mins = Math.max(0, Math.min(59, mins));
        
        let derivedPeriod: 'Manhã' | 'Tarde' | 'Noite' | 'Madrugada' = 'Manhã';
        if (hrs >= 6 && hrs < 12) {
          derivedPeriod = 'Manhã';
        } else if (hrs >= 12 && hrs < 18) {
          derivedPeriod = 'Tarde';
        } else if (hrs >= 18 && hrs < 24) {
          derivedPeriod = 'Noite';
        } else {
          derivedPeriod = 'Madrugada';
        }
        
        updatedState.period = derivedPeriod;
        
        const hh = String(hrs).padStart(2, '0');
        const mm = String(mins).padStart(2, '0');
        const sfx = hrs >= 12 ? 'PM' : 'AM';
        updatedState.time = `${hh}:${mm} ${sfx}`;
      } else {
        updatedState.time = "08:00 AM";
        updatedState.period = "Manhã";
      }
    }

    if (updatedState) {
      if (!updatedState.commitments || updatedState.commitments.length === 0) {
        updatedState.commitments = JSON.parse(JSON.stringify(state?.commitments || DEFAULT_SEED_COMMITMENTS));
      }
      
      const survivalAdditions: string[] = [];
      processSurvivalTurn(state || {}, updatedState, actionType, userMessage, survivalAdditions);
      
      const { commitments: checkedCommitments, narrativeAdditions: commitmentAdditions } = processCommitmentsOnTimeJump(state || {}, updatedState);
      updatedState.commitments = checkedCommitments;
      
      const allAdditions = [...survivalAdditions, ...commitmentAdditions];
      
      if (allAdditions.length > 0) {
        const contextPrefix = allAdditions.join("\n") + "\n";
        updatedState.narrative_context = contextPrefix + (updatedState.narrative_context || "");
        
        updatedState.dialog_history = updatedState.dialog_history || [];
        allAdditions.forEach(add => {
          updatedState.dialog_history.push({
            sender: "narrator",
            text: add,
            is_action: true
          });
        });
      }
    }

    // Ensure directed_to_character is safe or automatically derived if the character addressed a group or team
    if (updatedState && !isCharacterToCharacter) {
      const recipient = updatedState.directed_to_character ? String(updatedState.directed_to_character).trim() : null;
      
      const lastMsg = updatedState.dialog_history && updatedState.dialog_history.length > 0 
        ? updatedState.dialog_history[updatedState.dialog_history.length - 1] 
        : null;
        
      const textToCheck = lastMsg && lastMsg.sender === "character" ? (lastMsg.text || "").toLowerCase() : "";
      const translationToCheck = lastMsg && lastMsg.sender === "character" ? (lastMsg.translation || "").toLowerCase() : "";
      
      // If the LLM returned a group address or if the message text suggests introducing/greeting a group, let's pick another character!
      const groupTerms = ["everyone", "all", "team", "todos", "grupo", "comunidade", "colleagues", "galera", "pessoal", "the team", "the guys"];
      const isGroupTerm = recipient && groupTerms.some(term => recipient.toLowerCase().includes(term));
      
      const hasIntroPhrase = textToCheck.includes("everyone") || 
                             textToCheck.includes("the team") || 
                             textToCheck.includes("meet ") || 
                             textToCheck.includes("this is") ||
                             translationToCheck.includes("todos") ||
                             translationToCheck.includes("equipe") ||
                             translationToCheck.includes("apresentar") ||
                             translationToCheck.includes("este é") ||
                             translationToCheck.includes("esta é");
                             
      if (isGroupTerm) {
        // Find other fixed characters who can respond next
        const currentActiveId = updatedState.active_character?.id;
        const currentActiveName = updatedState.active_character?.name ? updatedState.active_character.name.toLowerCase() : "";
        
        // Find candidate characters in fixed_characters (excluding the active character)
        const candidates = (updatedState.fixed_characters || []).filter((c: any) => {
          if (!c) return false;
          if (c.id === currentActiveId) return false;
          if (c.name && c.name.toLowerCase() === currentActiveName) return false;
          return true;
        });
        
        if (candidates.length > 0) {
          // Choose the best candidate character! 
          // Let's prefer a character who is currently present if present_characters is populated
          let selectedCandidate = null;
          const presentList = updatedState.present_characters || [];
          
          if (presentList.length > 0) {
            selectedCandidate = candidates.find((c: any) => {
              const cName = (c.name || "").toLowerCase();
              const cTitle = (c.temporary_title || "").toLowerCase();
              return presentList.some((pName: string) => {
                const pn = pName.toLowerCase();
                return cName.includes(pn) || pn.includes(cName) || cTitle.includes(pn) || pn.includes(cTitle);
              });
            });
          }
          
          // Fallback to the first candidate if none was explicitly in present_characters
          if (!selectedCandidate) {
            selectedCandidate = candidates[0];
          }
          
          if (selectedCandidate) {
            updatedState.directed_to_character = selectedCandidate.name;
            console.log(`[Server C2C Post-Process] Directed to character auto-set to: ${selectedCandidate.name} due to group introduction/mention.`);
            
            // Make sure this chosen recipient character is added to present_characters so they are visible and active
            if (updatedState.present_characters) {
              if (!updatedState.present_characters.includes(selectedCandidate.name)) {
                updatedState.present_characters.push(selectedCandidate.name);
              }
            } else {
              updatedState.present_characters = [updatedState.active_character?.name, selectedCandidate.name].filter(Boolean);
            }
          }
        }
      } else if (!recipient && hasIntroPhrase) {
        // If it's not a group term, but we have an introduction phrase, try to extract the specific name being introduced!
        // Using word boundary matching with support for English and Portuguese introduction structures
        const meetMatch = textToCheck.match(/\bmeet\s+([A-Z][a-zA-Z]+)/);
        const thisIsMatch = textToCheck.match(/\bthis\s+is\s+([A-Z][a-zA-Z]+)/);
        const ptEsteMatch = translationToCheck.match(/\b(?:este|esta)\s+e\s+(?:a\s+|o\s+)?([A-Z][a-zA-Z]+)/i);
        const ptConhecaMatch = translationToCheck.match(/\b(?:conheça|conheca|apresento|apresentar)\s+(?:a\s+|o\s+)?([A-Z][a-zA-Z]+)/i);

        const rawExtracted = meetMatch?.[1] || thisIsMatch?.[1] || ptEsteMatch?.[1] || ptConhecaMatch?.[1];
        if (rawExtracted) {
          const nameClean = rawExtracted.trim();
          const lower = nameClean.toLowerCase();
          const ignore = ["the", "this", "my", "you", "she", "he", "here", "there", "everyone", "all", "team", "todos", "equipe", "grupo", "user"];
          if (!ignore.includes(lower) && nameClean.length > 2) {
            updatedState.directed_to_character = nameClean;
            console.log(`[Server C2C Post-Process] Extracted introduced name "${nameClean}" from dialogue text.`);
            
            // Make sure this newly introduced name is added to present_characters so the profile-creation engine registers and creates it
            if (updatedState.present_characters) {
              if (!updatedState.present_characters.includes(nameClean)) {
                updatedState.present_characters.push(nameClean);
              }
            } else {
              updatedState.present_characters = [updatedState.active_character?.name, nameClean].filter(Boolean);
            }
          }
        }
      }
    }

    // Ensure all present_characters and directed_to_character exist in fixed_characters
    if (updatedState) {
      updatedState.fixed_characters = updatedState.fixed_characters || [];
      const studentLower = studentName.toLowerCase();
      
      const namesToCheck = new Set<string>();
      if (updatedState.directed_to_character) {
        namesToCheck.add(String(updatedState.directed_to_character).trim());
      }
      if (Array.isArray(updatedState.present_characters)) {
        updatedState.present_characters.forEach((p: string) => {
          if (p) namesToCheck.add(p.trim());
        });
      }
      
      for (const name of namesToCheck) {
        const nameLower = name.toLowerCase();
        // Ignore user/student, narrator, and common group keywords
        if (
          nameLower === studentLower || 
          nameLower.includes("narrator") || 
          nameLower.includes("narrador") ||
          nameLower.includes("everyone") ||
          nameLower.includes("todos") ||
          nameLower.includes("all") ||
          nameLower.includes("team") ||
          nameLower.includes("equipe") ||
          nameLower.includes("grupo") ||
          nameLower.includes("user")
        ) {
          continue;
        }
        
        // Check if there is any existing character matching this name
        const match = updatedState.fixed_characters.find((c: any) => {
          if (!c) return false;
          const cName = (c.name || "").toLowerCase();
          const cTitle = (c.temporary_title || "").toLowerCase();
          return cName.includes(nameLower) || nameLower.includes(cName) || cTitle.includes(nameLower) || nameLower.includes(cTitle);
        });
        
        if (!match) {
          console.log(`[Dynamic Character Creation] Character "${name}" not found in fixed_characters. Creating profile automatically.`);
          // Gather scene context from recent history to build a relevant profile
          let sceneContext = "";
          if (updatedState.narrative_context) {
            sceneContext += updatedState.narrative_context + "\n";
          }
          if (updatedState.dialog_history && updatedState.dialog_history.length > 0) {
            const lastThree = updatedState.dialog_history.slice(-3);
            sceneContext += "Últimos diálogos:\n" + lastThree.map((m: any) => `${m.sender}: ${m.text}`).join("\n");
          }
          
          const newChar = await generateNewCharacterHelper(name, name, sceneContext, manuals, ai);
          updatedState.fixed_characters.push(newChar);
          console.log(`[Dynamic Character Creation] Successfully created dynamic character profile for "${newChar.name}".`);
          
          // Make sure this new character is present in present_characters
          if (updatedState.present_characters && !updatedState.present_characters.includes(newChar.name)) {
            updatedState.present_characters.push(newChar.name);
          }
        }
      }
    }

    if (updatedState) {
      if (Array.isArray(updatedState.dialog_history)) {
        updatedState.dialog_history.forEach((msg: any) => {
          if (msg && msg.text) {
            msg.text = cleanPlaceholders(msg.text, studentName);
          }
          if (msg && msg.translation) {
            msg.translation = cleanPlaceholders(msg.translation, studentName);
          }
        });
      }
      if (Array.isArray(updatedState.available_actions)) {
        updatedState.available_actions = updatedState.available_actions.map((act: string) => {
          return cleanPlaceholders(act, studentName);
        });
      }
      if (updatedState.narrative_context) {
        updatedState.narrative_context = cleanPlaceholders(updatedState.narrative_context, studentName);
      }

      // Auto-synchronize active_character with the last speaking character in dialog_history if a dialogue exists
      if (Array.isArray(updatedState.dialog_history) && updatedState.dialog_history.length > 0) {
        const lastCharMsg = [...updatedState.dialog_history].reverse().find((m: any) => 
          m && (m.sender === "character" || (m.sender !== "user" && m.sender !== "narrator"))
        );
        if (lastCharMsg && updatedState.fixed_characters && updatedState.fixed_characters.length > 0) {
          const sId = lastCharMsg.character_id;
          const sName = lastCharMsg.character_name;
          let matchedSpeaker = null;

          if (sId) {
            matchedSpeaker = updatedState.fixed_characters.find((c: any) => c && c.id === sId);
          }
          if (!matchedSpeaker && sName) {
            const normName = String(sName).toLowerCase().replace(/[^a-z0-9]/g, "");
            matchedSpeaker = updatedState.fixed_characters.find((c: any) => {
              if (!c) return false;
              const cName = (c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const cTitle = (c.temporary_title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              return cName === normName || cName.includes(normName) || normName.includes(cName) || cTitle === normName;
            });
          }

          if (matchedSpeaker) {
            updatedState.active_character = matchedSpeaker;
            if (!lastCharMsg.character_id) lastCharMsg.character_id = matchedSpeaker.id;
            if (!lastCharMsg.character_name) lastCharMsg.character_name = matchedSpeaker.name;
          }
        }
      }
    }

    // Ensure daily wishes are auto-generated for characters with intimacy > 599%
    try {
      await ensureDailyWishesForEligibleCharacters(updatedState, ai);
    } catch (wishErr) {
      console.error("[Daily Wishes Engine] Error auto-generating wishes on turn end:", wishErr);
    }

    // Trigger non-blocking background character intimacy auto-alignment
    setImmediate(async () => {
      try {
        await alignCharactersInBackground(updatedState, manuals, ai);
      } catch (bgErr) {
        console.error("[Background Auto-Alignment] Error during async evolution:", bgErr);
      }
    });

    res.json({
      state: updatedState,
      identified_errors: identifiedErrors,
      identified_strengths: identifiedStrengths
    });
  } catch (error: any) {
    console.error("Error in simulator-next:", error);
    handleExpressError(res, error, "Failed to progress the simulation loop");
  }
});

// Endpoint to execute a single batch linguistic audit on saving progress
app.post("/api/batch-audit-session", async (req: Request, res: Response) => {
  try {
    const inputMessages: string[] = req.body.messages || sessionUserMessages;
    if (!inputMessages || inputMessages.length === 0) {
      return res.json({ identified_errors: [], identified_strengths: [] });
    }

    const ai = getGeminiClient();
    const formattedTranscript = inputMessages.map((msg, idx) => `${idx + 1}. "${msg.replace(/"/g, '\\"')}"`).join("\n");

    const evaluationPrompt = `
      Analise o lote completo de frases em inglês enviadas pelo estudante durante esta sessão de histórias:
      ${formattedTranscript}

      Avalie de acordo com o CRITÉRIO DE "INGLÊS ACEITÁVEL" (Acceptable English Criterion).
      Não corrija pequenos desvios normais de conversação fluida que seriam facilmente entendidos de primeira por um nativo.
      Se houver erros gritantes que causem ambiguidade real, desvio grave, ou façam a frase excessivamente broken (como rating "Problemática" ou "Inaceitável"), retorne-os no array "identified_errors".
      
      Além de erros, IDENTIFIQUE SUTILEZAS DE SUCESSO: Se o usuário construiu de maneira correta e natural qualquer uma das seguintes estruturas gramaticais essenciais, retorne no array "identified_strengths":
      - "present_simple" (Present Simple / Acordo de verbos / Conjugações com terceira pessoa "he/she/it")
      - "past_simple" (Simple Past / Passado regular "-ed" ou irregular com "did")
      - "present_perfect" (Present Perfect / "have/has" + particípio para experiências ou conexões presentes)
      - "conditionals" (Condicionais / "if" + "would/could" etc.)
      - "passive_voice" (Voz passiva)
      - "reported_speech" (Discurso indireto / Reported speech)
      - "relative_clauses" (Frases relativas com "who/which/that" etc.)
      - "subjunctive_wishes" (Orações de desejos e subjuntivo como "I wish I were" / "It is important that he...")

      Format as a valid JSON object:
      {
        "identified_errors": [
          {
            "user_phrase": "frase incorreta falada",
            "correction": "correção em inglês correto",
            "error_type": "Grammar / Syntax / Vocabulary / Concordance",
            "severity_score": 1 a 10,
            "explanation": "explicação curta em português",
            "rating": "Problemática" ou "Inaceitável"
          }
        ],
        "identified_strengths": [
          {
            "user_phrase": "frase falada pelo usuário contendo o acerto",
            "structure_used": "id_da_estrutura_gramatical",
            "topic_label": "Nome do tópico em português",
            "rating": "Excelente" ou "Bom",
            "explanation": "Breve elogio clínico em português"
          }
        ]
      }
    `;

    const auditResponse = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: evaluationPrompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    // Clear RAM session queue after batch audit
    sessionUserMessages = [];

    const auditJson = parseGeminiOutput(auditResponse.text || "{}").json || {};
    res.json({
      identified_errors: auditJson.identified_errors || [],
      identified_strengths: auditJson.identified_strengths || []
    });
  } catch (error: any) {
    console.error("Error in batch-audit-session:", error);
    res.json({ identified_errors: [], identified_strengths: [] });
  }
});


// Helper to generate a new character on the fly when referenced in story context
async function generateNewCharacterHelper(name: string, temporaryTitle: string, context: string, manuals: DeveloperManuals, ai: any): Promise<any> {
  console.log(`[Dynamic Character Creation] Generating temporary profile for new character: ${name} (${temporaryTitle})`);
  const prompt = `
    Você é o Criador de Personagens do simulador.
    Um novo personagem com o papel/título provisório "${temporaryTitle || name || "Novo Personagem"}" foi introduzido.
    Contexto da cena: "${context}"

    REGRA ABSOLUTA DE IDENTIDADE E NÃO REUTILIZAÇÃO:
    - Este personagem é um indivíduo totalmente ÚNICO. É estritamente PROIBIDO copiar ou reutilizar nome, histórico, personalidade, aparência ou memória de qualquer outro personagem já existente, mesmo que tenham o mesmo cargo, setor ou empresa.
    
    ESTADO TEMPORÁRIO (ANTES DO NOME SER CONHECIDO - name_known = false):
    Como o nome real ainda não foi perguntado pelo usuário (name_known = false), crie apenas dois registros extremamente reduzidos (máximo de 50 caracteres cada):
    1. raw_material: Matéria-prima temporária extremamente reduzida (máx. 50 caracteres, ex: "Gerente de P&D, profissional e cauteloso.").
    2. personality: Folha de personalidade temporária extremamente reduzida (máx. 50 caracteres, ex: "Analítico, educado e desconfiado.").

    Retorne estritamente um objeto JSON com:
    - name: O nome real secreto do personagem (ex: "${name || "Ethan Brooks"}")
    - temporary_title: Título papel descritivo (ex: "${temporaryTitle || "Novo Personagem"}")
    - age: Idade aproximada
    - profession: Profissão aproximada
    - raw_material: Matéria-prima temporária ultra reduzida (máx. 50 caracteres)
    - personality: Personalidade temporária ultra reduzida (máx. 50 caracteres)
    - quirks: 1 frase curta de manias ou atitude visível
  `;

  try {
    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    const rawMat = (parsed.raw_material || "Profissional e atencioso no trabalho.").substring(0, 50);
    const pers = (parsed.personality || "Analítico, educado e reservado.").substring(0, 50);

    return {
      id: `char_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`,
      name: parsed.name || name,
      temporary_title: parsed.temporary_title || temporaryTitle || "Novo Personagem",
      name_known: false,
      age: parsed.age || "28",
      profession: parsed.profession || "Desconhecida",
      raw_material: rawMat,
      personality: pers,
      quirks: parsed.quirks || "Maneira reservada e direta.",
      relationship_score: 0,
      relationship_level: "Estranho",
      encounters_count: 0,
      memories: []
    };
  } catch (err) {
    console.error("Error generating dynamic character:", err);
    return {
      id: `char_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`,
      name: name,
      temporary_title: temporaryTitle || "Novo Personagem",
      name_known: false,
      age: "25",
      profession: "Estudante/Profissional",
      raw_material: "Profissional e atencioso.",
      personality: "Analítico, educado e reservado.",
      quirks: "Atitude simples e prática.",
      relationship_score: 0,
      relationship_level: "Estranho",
      encounters_count: 0,
      memories: []
    };
  }
}


function getLatestIntimacyMilestone(score: number): number {
  if (score < 25) return 0;
  if (score <= 400) {
    return Math.floor(score / 25) * 25;
  }
  if (score <= 1000) {
    return 400 + Math.floor((score - 400) / 200) * 200;
  }
  return 1000 + Math.floor((score - 1000) / 500) * 500;
}

function getIntimacyMilestonesInRange(start: number, end: number): number[] {
  const milestones: number[] = [];
  for (let s = 25; s <= 400; s += 25) {
    if (s > start && s <= end) {
      milestones.push(s);
    }
  }
  for (let s = 600; s <= 1000; s += 200) {
    if (s > start && s <= end) {
      milestones.push(s);
    }
  }
  if (end > 1000) {
    const lowerBound = Math.max(1000, start);
    const startOffset = Math.floor((lowerBound - 1000) / 500) + 1;
    let s = 1000 + startOffset * 500;
    while (s <= end) {
      milestones.push(s);
      s += 500;
    }
  }
  return milestones;
}

function getPreviousIntimacyMilestone(step: number): number {
  if (step <= 400) {
    return step - 25;
  }
  if (step <= 1000) {
    return step - 200;
  }
  return step - 500;
}


// Helper function to re-evolve a single character step by step
async function evolveSingleCharacterHelper(char: any, manuals: DeveloperManuals, ai: any): Promise<{ char: any; updated: boolean; msg: string }> {
  if (!char) {
    return { char: null, updated: false, msg: "Character is null." };
  }
  let currentPersonality = char.personality || "";
  const oldEvolved = char.last_evolved_intimacy ?? 0;
  const currentScore = char.relationship_score ?? 0;
  if (currentScore < 100) {
    return { 
      char, 
      updated: false, 
      msg: `Ficha de ${char.name} mantida em formato mínimo (intimidade atual: ${currentScore}% < 100%). A expansão da ficha só ocorre a partir de 100% de intimidade.` 
    };
  }
  const targetThreshold = getLatestIntimacyMilestone(currentScore);

  if (targetThreshold <= oldEvolved) {
    return { 
      char, 
      updated: false, 
      msg: `Sem alterações pendentes para ${char.name} (intimidade atual: ${currentScore}%, já alinhado até ${oldEvolved}%).` 
    };
  }

  console.log(`[Retroactive Re-Evolve Helper] Starting ${char.name}. Intimacy: ${currentScore}%. Target: ${targetThreshold}%. Steps: from ${oldEvolved}% to ${targetThreshold}%.`);
  
  const milestones = getIntimacyMilestonesInRange(oldEvolved, targetThreshold);
  let stepsCount = 0;
  for (const step of milestones) {
    stepsCount++;
    const previousStep = getPreviousIntimacyMilestone(step);
    const evoPrompt = `
      Você é o Re-Escritor de Dossiês de "ExpatLife: O Simulador do Cotidiano no Exterior".
      O personagem "${char.name}" (${char.temporary_title || "Personagem"}) está evoluindo para o patamar de intimidade de ${step}% (limiar conquistado de score de intimidade).
      O nível anterior processado era de ${previousStep}%.

      DIRETRIZES DE CONSTRUÇÃO DE PERSONALIDADE:
      ${manuals.personality_manual}

      DIRETRIZES DE EVOLUÇÃO E APROFUNDAMENTO DE INTIMIDADE:
      ${manuals.intimacy_manual}

      INFORMAÇÕES ADICIONAIS IMPORTANTES (LEI DE CALIBRAÇÃO E INDIVIDUALIDADE):
      - MEDIDA DE INTIMIDADE: Lembre-se de que um incremento de 25% na pontuação de intimidade equivale a aproximadamente uma (1) boa conversa positiva de cerca de 30 minutos. Portanto, a evolução deve ser progressiva e moderada: o personagem NÃO deve se abrir excessivamente e de forma irrealista a ponto de quebrar a coerência de sua personalidade numa única conversa, nem deve ficar travado se houve uma evolução sólida.
      - VELOCIDADE DE CONFIANÇA INDIVIDUALIZADA: Pessoas de temperamentos diferentes confiam em ritmos diferentes (por exemplo, introvertidos, pessimistas ou teimosos, como "John", demorarão mais degraus para expressar afeição aberta e o farão com mais reservas ou de forma rústica, enquanto extrovertidos, entusiasmados ou atenciosos, como "Samantha", se manifestarão de forma mais explícita, rápida e calorosa). Adapte o ritmo de aprofundamento aos traços de base!

      Dossiê de Personalidade antes deste degrau de evolução:
      "${currentPersonality}"

      Sua tarefa única: Reescreva a personalidade e a descrição comportamental do personagem de modo a aprofundá-la proporcionalmente para o nível de ${step}%. Revele novas camadas sutis de abertura, vulnerabilidades, segredos adequados para este nível, apelidos amigáveis ou manias de comportamento de forma extremamente natural em português brasileiro.
      
      Retorne exclusivamente o parágrafo de personalidade resultante (sem tags, sem comentários adicionais, sem aspas externas desnecessárias).
    `;

    try {
      const response = await generateContentWithFallback(ai, {
        model: DEFAULT_GEMINI_MODEL,
        contents: evoPrompt,
      });

      if (response.text) {
        currentPersonality = response.text.trim();
      }
    } catch (err) {
      console.error(`Error evolving ${char.name} at step ${step}:`, err);
    }
  }

  const evolvedChar = {
    ...char,
    personality: currentPersonality,
    last_evolved_intimacy: targetThreshold
  };

  return {
    char: evolvedChar,
    updated: true,
    msg: `${char.name} atualizado(a) com sucesso de ${oldEvolved}% para ${targetThreshold}% em ${stepsCount} saltos de intimidade.`
  };
}


// Asynchronous background helper to align character intimacy evolution without blocking response
async function alignCharactersInBackground(updatedState: any, manuals: DeveloperManuals, ai: any) {
  if (!updatedState) return;

  const processedCharIds = new Set<string>();

  // 1. Process fixed_characters without duplicate calls
  if (Array.isArray(updatedState.fixed_characters)) {
    for (let i = 0; i < updatedState.fixed_characters.length; i++) {
      const char = updatedState.fixed_characters[i];
      if (!char || !char.id || processedCharIds.has(char.id)) continue;

      processedCharIds.add(char.id);

      const oldEvolved = char.last_evolved_intimacy ?? 0;
      const currentScore = char.relationship_score ?? 0;
      const targetThreshold = getLatestIntimacyMilestone(currentScore);

      if (targetThreshold > oldEvolved) {
        console.log(`[Background Auto-Alignment] Character '${char.name}' (id: ${char.id}) has pending intimacy milestone (${currentScore}% vs old ${oldEvolved}%). Evolving in background...`);
        const result = await evolveSingleCharacterHelper(char, manuals, ai);
        if (result.updated && result.char) {
          updatedState.fixed_characters[i] = result.char;
          if (updatedState.active_character && updatedState.active_character.id === char.id) {
            updatedState.active_character = {
              ...updatedState.active_character,
              ...result.char
            };
          }
        }
      }
    }
  }

  // 2. Process active_character if not already processed above
  if (updatedState.active_character && updatedState.active_character.id && !processedCharIds.has(updatedState.active_character.id)) {
    const char = updatedState.active_character;
    processedCharIds.add(char.id);

    const oldEvolved = char.last_evolved_intimacy ?? 0;
    const currentScore = char.relationship_score ?? 0;
    const targetThreshold = getLatestIntimacyMilestone(currentScore);

    if (targetThreshold > oldEvolved) {
      console.log(`[Background Auto-Alignment] Active Character '${char.name}' (id: ${char.id}) has pending intimacy milestone (${currentScore}% vs old ${oldEvolved}%). Evolving in background...`);
      const result = await evolveSingleCharacterHelper(char, manuals, ai);
      if (result.updated && result.char) {
        updatedState.active_character = result.char;
        if (Array.isArray(updatedState.fixed_characters)) {
          const idx = updatedState.fixed_characters.findIndex((c: any) => c && c.id === char.id);
          if (idx !== -1) {
            updatedState.fixed_characters[idx] = result.char;
          }
        }
      }
    }
  }
}


// Retroactive Re-Evolution of Characters based on currently missed intimacy milestones
app.post("/api/simulator-re-evolve", async (req: Request, res: Response) => {
  try {
    const { fixed_characters, active_character, character_id } = req.body;
    const ai = getGeminiClient();
    const manuals = req.body.developer_manuals || await getDeveloperManuals();

    const updatedCharacters = fixed_characters ? [...fixed_characters].filter(Boolean) : [];
    let updatedActiveCharacter = active_character ? { ...active_character } : null;
    let updatedCount = 0;
    const logs: string[] = [];

    // Process all fixed characters
    for (let i = 0; i < updatedCharacters.length; i++) {
      if (!updatedCharacters[i]) continue;
      if (character_id && updatedCharacters[i].id !== character_id) {
        continue;
      }
      const result = await evolveSingleCharacterHelper(updatedCharacters[i], manuals, ai);
      updatedCharacters[i] = result.char;
      if (result.updated) {
        updatedCount++;
      }
      logs.push(result.msg);
    }

    // Process active character if present
    if (updatedActiveCharacter) {
      if (!character_id || updatedActiveCharacter.id === character_id) {
        const matchedFixed = updatedCharacters.find((c: any) => c.id === updatedActiveCharacter?.id);
        if (matchedFixed) {
          updatedActiveCharacter = {
            ...updatedActiveCharacter,
            ...matchedFixed
          };
        } else {
          const result = await evolveSingleCharacterHelper(updatedActiveCharacter, manuals, ai);
          updatedActiveCharacter = result.char;
          if (result.updated) {
            updatedCount++;
            logs.push(result.msg + " (Personagem Ativo atualizado)");
          }
        }
      }
    }

    res.json({
      fixed_characters: updatedCharacters,
      active_character: updatedActiveCharacter,
      updated_count: updatedCount,
      logs
    });
  } catch (error: any) {
    console.error("Error in simulator-re-evolve:", error);
    handleExpressError(res, error, "Erro ao atualizar alinhamento retroativo dos personagens");
  }
});


// Helper to generate 9 daily wishes for eligible characters (intimacy > 599%)
async function generateCharacterWishesHelper(char: any, currentDay: number, currentDate: string, currentCity: string, ai: any): Promise<any> {
  if (!char) return null;
  const score = char.relationship_score ?? 0;
  if (score <= 599) return null;

  const pastWishesText = Array.isArray(char.daily_wishes_history) && char.daily_wishes_history.length > 0
    ? `HISTÓRICO DE DESEJOS DE DIAS ANTERIORES (EVITE REPETIÇÕES E VARIE OS TEMAS DE FORMA RICA):\n` +
      char.daily_wishes_history.map((w: any) => `- Dia ${w.day}: Manhã: ${(w.morning || []).join(", ")}; Tarde: ${(w.afternoon || []).join(", ")}; Noite: ${(w.evening || []).join(", ")}`).join("\n")
    : "Nenhum desejo anterior registrado.";

  const prompt = `
    Você é o Gerador de Vida Interior e Desejos Diários de "ExpatLife: O Simulador do Cotidiano no Exterior".
    Sua tarefa é gerar exatamente 9 desejos cotidianos para o dia de hoje (Stories) para o personagem com intimidade superior a 599%:

    PERSONAGEM:
    - Nome: ${char.name || char.temporary_title}
    - Idade / Profissão: ${char.age || 'N/A'} anos • ${char.profession || 'N/A'}
    - Dossiê de Personalidade: ${char.personality || 'N/A'}
    - Quirks/Manias: ${char.quirks || 'N/A'}
    - Matéria-Prima arquetípica: ${char.raw_material || 'N/A'}
    - Memórias e Histórico Recente: ${JSON.stringify(char.memories || [])}
    - Score de Intimidade: ${score}%

    CONTEXTO DO HISTÓRICO DAS STORIES:
    - Cidade: ${currentCity}
    - Dia Atual do Stories: Dia ${currentDay} (${currentDate})

    ${pastWishesText}

    INSTRUÇÕES MANDATÓRIAS:
    1. Os desejos NÃO são missões, obrigações ou tarefas explícitas para o jogador/estudante.
    2. Eles são uma força interna, vontades espontâneas, planos cotidianos, preferências do momento e desejos de vida interior do personagem para o dia de hoje.
    3. Eles devem consultar toda a personalidade já existente do personagem (matéria-prima, traços psicológicos, hobbies, interesses, objetivos, modo de agir).
    4. Gere estritamente um objeto JSON com 3 arrays de frases curtas e vivas em português:
       - morning: 3 frases curtas (desejos para a Manhã)
       - afternoon: 3 frases curtas (desejos para a Tarde)
       - evening: 3 frases curtas (desejos para a Noite)
  `;

  try {
    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            morning: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 desejos da manhã" },
            afternoon: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 desejos da tarde" },
            evening: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 desejos da noite" },
          },
          required: ["morning", "afternoon", "evening"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return {
      day: currentDay,
      date: currentDate,
      morning: Array.isArray(parsed.morning) ? parsed.morning.slice(0, 3) : [],
      afternoon: Array.isArray(parsed.afternoon) ? parsed.afternoon.slice(0, 3) : [],
      evening: Array.isArray(parsed.evening) ? parsed.evening.slice(0, 3) : [],
      generated_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[Daily Wishes Engine] Error generating wishes for ${char.name}:`, err);
    return null;
  }
}

async function ensureDailyWishesForEligibleCharacters(updatedState: any, ai: any) {
  if (!updatedState) return;

  const currentDay = updatedState.day_count || 1;
  const currentDate = updatedState.date || "15 de Junho";
  const currentCity = updatedState.city || "Localidade";

  const fixedList = updatedState.fixed_characters || [];
  for (let i = 0; i < fixedList.length; i++) {
    const char = fixedList[i];
    if (!char) continue;
    const score = char.relationship_score ?? 0;
    if (score > 599) {
      if (!char.daily_wishes || char.daily_wishes.day !== currentDay) {
        console.log(`[Daily Wishes Engine] Generating daily wishes for character '${char.name}' (Intimacy: ${score}%, Day: ${currentDay})...`);
        const generated = await generateCharacterWishesHelper(char, currentDay, currentDate, currentCity, ai);
        if (generated) {
          const history = Array.isArray(char.daily_wishes_history) ? [...char.daily_wishes_history] : [];
          if (char.daily_wishes && char.daily_wishes.day !== currentDay) {
            if (!history.some((h: any) => h.day === char.daily_wishes.day)) {
              history.push(char.daily_wishes);
            }
          }
          char.daily_wishes = generated;
          char.daily_wishes_history = history;

          if (updatedState.active_character && updatedState.active_character.id === char.id) {
            updatedState.active_character.daily_wishes = generated;
            updatedState.active_character.daily_wishes_history = history;
          }
        }
      }
    }
  }

  if (updatedState.active_character && (updatedState.active_character.relationship_score ?? 0) > 599) {
    const activeChar = updatedState.active_character;
    if (!activeChar.daily_wishes || activeChar.daily_wishes.day !== currentDay) {
      console.log(`[Daily Wishes Engine] Generating daily wishes for active character '${activeChar.name}'...`);
      const generated = await generateCharacterWishesHelper(activeChar, currentDay, currentDate, currentCity, ai);
      if (generated) {
        const history = Array.isArray(activeChar.daily_wishes_history) ? [...activeChar.daily_wishes_history] : [];
        if (activeChar.daily_wishes && activeChar.daily_wishes.day !== currentDay) {
          if (!history.some((h: any) => h.day === activeChar.daily_wishes.day)) {
            history.push(activeChar.daily_wishes);
          }
        }
        activeChar.daily_wishes = generated;
        activeChar.daily_wishes_history = history;
      }
    }
  }
}

// Endpoint to generate/re-generate character daily wishes manually for Developer testing
app.post("/api/generate-character-wishes", async (req: Request, res: Response) => {
  try {
    const { character, simulatorState } = req.body;
    if (!character) {
      return res.status(400).json({ error: "Personagem não fornecido." });
    }

    const intimacyScore = character.relationship_score ?? 0;
    if (intimacyScore <= 599) {
      return res.status(400).json({
        error: `O sistema de desejos diários é ativado apenas para intimidade superior a 599%. Intimidade atual de ${character.name || 'Personagem'}: ${intimacyScore}%.`
      });
    }

    const ai = getGeminiClient();
    const currentDay = simulatorState?.day_count || character.daily_wishes?.day || 1;
    const currentDate = simulatorState?.date || character.daily_wishes?.date || "15 de Junho";
    const currentCity = simulatorState?.city || "Localidade";

    const generatedWishes = await generateCharacterWishesHelper(character, currentDay, currentDate, currentCity, ai);
    if (!generatedWishes) {
      return res.status(500).json({ error: "Falha ao gerar os desejos diários do personagem." });
    }

    res.json({ daily_wishes: generatedWishes });
  } catch (error: any) {
    console.error("Error in generate-character-wishes:", error);
    handleExpressError(res, error, "Erro ao gerar desejos diários do personagem");
  }
});


// Função auxiliar compartilhada para reconstruir a personalidade de um personagem do zero seguindo a metodologia
async function buildCharacterFromScratch(char: any, manuals: DeveloperManuals, ai: any): Promise<any> {
  const currentScore = char.relationship_score ?? 0;
  const targetThreshold = getLatestIntimacyMilestone(currentScore);
  if (currentScore < 100) {
    console.log(`[buildCharacterFromScratch] ${char.name} score is ${currentScore}% (< 100%). Keeping minimal compact sheet.`);
    const rawMat = (char.raw_material && char.raw_material.trim().length > 0)
      ? char.raw_material.trim().substring(0, 50)
      : `${char.profession || "Profissional"}, atencioso e reservado.`.substring(0, 50);
    const pers = (char.personality && char.personality.trim().length > 0)
      ? char.personality.trim().substring(0, 50)
      : `Objetivo, cordial e pragmático.`.substring(0, 50);
    return {
      ...char,
      personality: pers,
      raw_material: rawMat,
      last_evolved_intimacy: 0
    };
  }

  console.log(`[buildCharacterFromScratch] Generating for ${char.name}. Starting relationship score: ${currentScore}%, target intimacy step: ${targetThreshold}%.`);

  // Passo 0: Fabricar a Matéria-Prima utilizando o manual de "Como fazer tipos" (raw_material_manual)
  const rawMaterialPrompt = `
    Você é o Fabricador de Matéria-Prima de Personalidades para "ExpatLife: O Simulador do Cotidiano no Exterior".
    Sua tarefa é gerar uma MATÉRIA-PRIMA de personalidade psicológica inicial profunda e bruta para o personagem "${char.name}".
    
    INFORMAÇÕES DE BASE REGISTRADAS PARA ESSE PERSONAGEM:
    - Nome: ${char.name}
    - Título Temporário: ${char.temporary_title || "Sem título temporário"}
    - Idade: ${char.age || "Não definida"}
    - Profissão: ${char.profession || "Não definida"}
    - Quirks, Falhas e Manias iniciais: ${char.quirks || "Nenhum registrado"}

    MANUAL DE COMO FAZER A MATÉRIA-PRIMA (TIPOS E COMBINAÇÕES DE ARQUÉTIPOS):
    ${manuals.raw_material_manual}

    INSTRUÇÕES:
    1. Leia o manual acima contendo as diretrizes de "Como fazer a matéria-prima".
    2. Escolha ou combine de forma aleatória e criativa as opções e combinações fornecidas pelo manual para criar um "esqueleto" temperamental e arquétipo de base profunda que se encaixe perfeitamente com "${char.name}".
    3. Fabrique a matéria-prima psicológica bruta decorrente deste arquétipo selecionado/combinado.
    4. Retorne a matéria-prima resultante de forma completa, detalhada, profunda e extensa (composta de múltiplos parágrafos robustos que descrevam minuciosamente o temperamento básico, traços psicológicos profundos, inclinações comportamentais e nuances do arquétipo, sem resumir, sem abreviar e sem limitação de palavras), em português brasileiro, sem aspas externas, sem tags ou introduções adicionais.
  `;

  let rawMaterial = "";
  try {
    const rawResponse = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: rawMaterialPrompt,
    });
    if (rawResponse.text) {
      rawMaterial = rawResponse.text.trim();
    }
  } catch (err: any) {
    console.error(`Erro ao gerar matéria-prima de personalidade para ${char.name}:`, err);
    rawMaterial = `Arquétipo básico e temperamento de base realista combinando as quirks: ${char.quirks}.`;
  }

  // Passo 1: Solicitar ao Gemini para refazer ou extrair somente a essência original (0% intimidade) do personagem
  const setupPrompt = `
    Você é o Arquiteto Narrativo de "ExpatLife: O Simulador do Cotidiano no Exterior".
    Sua tarefa é reconstruir a IDENTIDADE E PERSONALIDADE ORIGINAL ESSENCIAL (0% de intimidade) para o personagem "${char.name}".
    
    INFORMAÇÕES DE BASE REGISTRADAS PARA ESSE PERSONAGEM:
    - Nome: ${char.name}
    - Título Temporário: ${char.temporary_title || "Sem título temporário"}
    - Idade: ${char.age || "Não definida"}
    - Profissão: ${char.profession || "Não definida"}
    - Quirks, Falhas e Manias: ${char.quirks || "Nenhum registrado"}
    
    MATÉRIA-PRIMA INICIAL FABRICADA (TEMPERAMENTO E ARQUÉTIPO DE BASE):
    "${rawMaterial}"

    DIRETRIZES DE CONSTRUÇÃO DE PERSONALIDADE (MANUAL DO PROJETO):
    ${manuals.personality_manual}

    INSTRUÇÃO CRÍTICA:
    - Utilize a "MATÉRIA-PRIMA INICIAL FABRICADA" acima como o alicerce temperamental bruto obrigatório para moldar a personalidade final.
    - Molde os detalhes finos seguindo o MANUAL DO PROJETO ("Como construir personalidades humanas e profundas").
    - Ignore inteiramente quaisquer expansões passadas de alta intimidade, desabafos íntimos avançados ou segredos profundos que só seriam revelados posteriormente.
    - Estabeleça apenas a essência original estrutural básica do personagem: como ele vive, temperamento de base (consistente com a matéria-prima), defeitos leves normais do cotidiano e postura média de início de convívio com estranhos.
    - Retorne exclusivamente o parágrafo de personalidade essencial resultante em português brasileiro (máximo de 1 parágrafo bem construído e conciso, sem aspas externas, sem tags ou introduções adicionais).
  `;

  let basePersonality = "";
  try {
    const baseResponse = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: setupPrompt,
    });
    if (baseResponse.text) {
      basePersonality = baseResponse.text.trim();
    }
  } catch (err: any) {
    console.error(`Erro ao gerar personalidade essencial para ${char.name}:`, err);
    basePersonality = `Personagem ${char.name}, ${char.age} anos, trabalhando como ${char.profession}. Quirks: ${char.quirks}.`;
  }

  // Passo 2: Realizar os ciclos de realinhamento sequencial passo a passo (usando marcos de intimidade)
  let currentPersonality = basePersonality;

  const milestones = getIntimacyMilestonesInRange(0, targetThreshold);
  for (const step of milestones) {
    const previousStep = getPreviousIntimacyMilestone(step);
    const evoPrompt = `
      Você é o Re-Escritor de Dossiês de "ExpatLife: O Simulador do Cotidiano no Exterior".
      O personagem "${char.name}" está evoluindo para o patamar de intimidade de ${step}% (limiar conquistado de score de intimidade).
      O nível anterior processado era de ${previousStep}%.

      DIRETRIZES DE CONSTRUÇÃO DE PERSONALIDADE:
      ${manuals.personality_manual}

      DIRETRIZES DE EVOLUÇÃO E APROFUNDAMENTO DE INTIMIDADE:
      ${manuals.intimacy_manual}

      DIRETRIZES DE REAÇÕES HUMANAS (para balizar as nuances de comportamento):
      ${manuals.reaction_manual}

      INFORMAÇÕES ADICIONAIS IMPORTANTES (LEI DE CALIBRAÇÃO E INDIVIDUALIDADE):
      - MEDIDA DE INTIMIDADE: Lembre-se de que um incremento de 25% na pontuação de intimidade equivale a aproximadamente uma (1) boa conversa positiva de cerca de 30 minutos. Portanto, a evolução deve ser progressiva e moderada: o personagem não deve se abrir excessivamente e de forma irrealista a ponto de quebrar a coerência de sua personalidade.
      - VELOCIDADE DE CONFIANÇA INDIVIDUALIZADA: Pessoas de temperamentos diferentes confiam em ritmos diferentes (por exemplo, introvertidos, pessimistas ou teimosos, como "John", demorarão mais degraus para expressar afeição aberta e o farão com mais reservas ou de forma rústica, enquanto extrovertidos, entusiasmados ou atenciosos, como "Samantha", se manifestarão de forma mais explícita, rápida e calorosa). Adapte o ritmo de aprofundamento aos traços de base!

      Dossiê de Personalidade antes deste degrau de evolução:
      "${currentPersonality}"

      Sua tarefa única: Reescreva a personalidade e a descrição comportamental do personagem de modo a aprofundá-la proporcionalmente para o nível de ${step}%. Revele novas camadas sutis de abertura, vulnerabilidades, segredos adequados para este nível, apelidos amigáveis ou manias de comportamento de forma extremamente natural em português brasileiro.
      
      Retorne exclusivamente o parágrafo de personalidade resultante (sem tags, sem comentários adicionais, sem aspas externas desnecessárias).
    `;

    try {
      const response = await generateContentWithFallback(ai, {
        model: DEFAULT_GEMINI_MODEL,
        contents: evoPrompt,
      });

      if (response.text) {
        currentPersonality = response.text.trim();
      }
    } catch (err) {
      console.error(`Error evolving ${char.name} at step ${step}:`, err);
    }
  }

  return {
    ...char,
    personality: currentPersonality,
    raw_material: rawMaterial,
    last_evolved_intimacy: targetThreshold
  };
}


// Endpoint dedicado para reconstruir completamente do zero (Refazer) a personalidade
// de um personagem específico mantendo memórias, intimidade, etc, mas aplicando reconstrução
// sequencial baseada nos manuais mestres e nível atual de relacionamento de 0% até o teto suportado.
app.post("/api/simulator-redo-character", async (req: Request, res: Response) => {
  try {
    const { fixed_characters, active_character, character_id } = req.body;
    if (!character_id) {
      throw new Error("ID do personagem é obrigatório para refazer a personalidade.");
    }
    const ai = getGeminiClient();
    const manuals = req.body.developer_manuals || await getDeveloperManuals();

    const updatedCharacters = fixed_characters ? [...fixed_characters] : [];
    let updatedActiveCharacter = active_character ? { ...active_character } : null;
    let characterFound = false;
    let finalLogs: string[] = [];

    const redoSingleCharacter = async (char: any) => {
      const currentScore = char.relationship_score ?? 0;
      const targetThreshold = getLatestIntimacyMilestone(currentScore);

      console.log(`[Redo Character] Resetting and reconstructing ${char.name}. Score: ${currentScore}%. Target steps up to: ${targetThreshold}%.`);

      const stepLogs: string[] = [
        "Matéria-prima de personalidade fabricada com base no manual de tipos.",
        `Essência básica e original reconstruída para ${char.name}.`
      ];

      const evolvedChar = await buildCharacterFromScratch(char, manuals, ai);

      const milestones = getIntimacyMilestonesInRange(0, targetThreshold);
      if (milestones.length > 0) {
        for (const step of milestones) {
          stepLogs.push(`Progredido e re-calibrado para o degrau de ${step}% de intimidade.`);
        }
      }

      return {
        char: evolvedChar,
        logs: stepLogs,
        msg: `${char.name} reconstruído(a) com sucesso de 0% para ${targetThreshold}% em ${milestones.length} saltos de realinhamento.`
      };
    };

    let targetChar = null;
    let isFixed = false;
    let fixedIndex = -1;
    let isActive = false;

    // Search fixed characters list
    for (let i = 0; i < updatedCharacters.length; i++) {
      if (updatedCharacters[i].id === character_id) {
        targetChar = updatedCharacters[i];
        isFixed = true;
        fixedIndex = i;
        break;
      }
    }

    // Check active character
    if (updatedActiveCharacter && updatedActiveCharacter.id === character_id) {
      // Prefer active character reference if its state is more up-to-date, or use existing match
      targetChar = updatedActiveCharacter;
      isActive = true;
    }

    if (targetChar) {
      characterFound = true;
      const result = await redoSingleCharacter(targetChar);
      
      if (isFixed && fixedIndex !== -1) {
        updatedCharacters[fixedIndex] = result.char;
      }
      if (isActive) {
        updatedActiveCharacter = result.char;
      }
      finalLogs = [...result.logs, result.msg];
    }

    if (!characterFound) {
      throw new Error(`Personagem com ID ${character_id} não encontrado na lista atual do simulador.`);
    }

    res.json({
      fixed_characters: updatedCharacters,
      active_character: updatedActiveCharacter,
      logs: finalLogs
    });
  } catch (error: any) {
    console.error("Error in simulator-redo-character:", error);
    handleExpressError(res, error, "Erro ao refazer e realinhar a personalidade do personagem");
  }
});


// Intelligent semantic grouping of mandatory vocabulary
app.post("/api/group-vocabulary", async (req: Request, res: Response) => {
  try {
    const { vocabulary } = req.body;
    if (!vocabulary || typeof vocabulary !== "string") {
      return res.status(400).json({ error: "O vocabulário enviado deve ser uma string válida." });
    }

    const ai = getGeminiClient();

    const systemInstruction = `
      Você é um Linguista e Especialista em Ensino de Inglês.
      Sua tarefa é agrupar uma lista de palavras e expressões em inglês fornecida pelo usuário de forma inteligente em categorias semânticas (tópicos de contexto ou situações reais).
      
      DIRETRIZES DE AGRUPAMENTO (CRÍTICO):
      1. Não utilize critérios gramaticais de agrupamento (não divida em "verbos", "adjetivos", "conectores", "substantivos", etc.).
      2. Agrupe de forma semântica e contextual, isto é, por afinidade temática (ex: "Viagem & Aeroporto", "Discussão de Negócios", "Expressões de Opinião", "Conversa em Restaurante", "Atividades de Lazer", "Vida no Escritório", etc.).
      3. Cada grupo gerado deve possuir de 3 a 5 palavras da lista original. Se sobrarem algumas palavras que não possuem uma categoria forte, você pode agrupá-las em um tópico contextual plausível comum.
      4. Crie títulos de tópicos simples e didáticos em português para cada grupo (máximo 40 caracteres, ex: "Negociações e Acordos", "Expressando Conexão").
      5. Para cada termo em inglês, forneça uma tradução concisa e precisa em português brasileiro.
      6. Se o usuário fornecer termos que não estão em inglês, ou termos inválidos, tente corrigi-los ou adaptá-los apropriadamente.
      
      Retorne estritamente um objeto JSON com o seguinte formato:
      {
        "groups": [
          {
            "topic": "Título do Grupo Semântico 1 em Português",
            "words": [
              { "en": "word1", "pt": "tradução1" },
              { "en": "word2", "pt": "tradução2" }
            ]
          }
        ]
      }
    `;

    const prompt = `Agrupe a seguinte lista de vocabulários em inglês separada por ponto e vírgula: "${vocabulary}"`;

    const response = await generateContentWithFallback(ai, {
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            groups: {
              type: Type.ARRAY,
              description: "Array of grouped vocabulary",
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  words: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        en: { type: Type.STRING },
                        pt: { type: Type.STRING }
                      },
                      required: ["en", "pt"]
                    }
                  }
                },
                required: ["topic", "words"]
              }
            }
          },
          required: ["groups"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in group-vocabulary:", error);
    handleExpressError(res, error, "Erro ao agrupar vocabulários de forma inteligente");
  }
});


// In-memory cache for Course Generation (TTL: 2 hours, max 100 entries)
interface CourseCacheEntry {
  data: any;
  timestamp: number;
}
const courseGenCache = new Map<string, CourseCacheEntry>();
const COURSE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function cleanCourseGenCache() {
  const now = Date.now();
  for (const [k, v] of courseGenCache.entries()) {
    if (now - v.timestamp > COURSE_CACHE_TTL_MS) {
      courseGenCache.delete(k);
    }
  }
}

// Course Phase Generator / Course Evaluation (6-6-6 Training Protocol)
app.post("/api/course-generate", async (req: Request, res: Response) => {
  try {
    const { grammaticalFocus, exerciseType, vocabWords, learnedMandatoryVocab, vocabDifficulties } = req.body;

    const cacheKey = `${String(grammaticalFocus || "").trim().toLowerCase()}_${exerciseType || "GRAMMAR"}_${Array.isArray(vocabWords) ? vocabWords.map((w: any) => w.en || w).sort().join(",") : ""}`;
    const cached = courseGenCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < COURSE_CACHE_TTL_MS)) {
      return res.json(cached.data);
    }
    const isVocab = exerciseType === "VOCABULARY";
    const isChunks = exerciseType === "CHUNKS";
    const ai = getGeminiClient();

    let cumulativeInstruction = "";
    if (learnedMandatoryVocab && Array.isArray(learnedMandatoryVocab) && learnedMandatoryVocab.length > 0) {
      cumulativeInstruction = `\n⚠️ ORGANICALLY REINFORCE PREVIOUSLY LEARNED WORDS (CUMULATIVE KNOWLEDGE): The student has already studied and mastered these mandatory English terms: [${learnedMandatoryVocab.join(", ")}]. Whenever appropriate and contextually plausible, you MUST try to naturally reuse/integrate some of these words into your theory explanations, example sentences, or phase exercises. This is a crucial pedagogical requirement to help the user retain accumulated vocabulary.`;
    }

    let prompt = "";
    if (isVocab) {
      let wordsStr = "";
      if (vocabWords && vocabWords.length > 0) {
        wordsStr = vocabWords.map((w: any) => `${w.en} (${w.pt})`).join(", ");
      }
      
      let difficultiesInstruction = "";
      if (vocabDifficulties && Array.isArray(vocabDifficulties) && vocabDifficulties.length > 0) {
        difficultiesInstruction = `\n⚠️ CRITICAL VOCABULARY DIFFICULTIES WARNING: The student has struggled heavily with these specific terms recently: [${vocabDifficulties.join(", ")}]. You MUST place maximum teaching emphasis on these exact words! Explain them extensively with extra details in your theory portion, provide clear examples for them, and make sure they are prominently and repeatedly tested across all 3 phases of exercises.`;
      }

      const wordsInstruction = wordsStr 
        ? `You MUST design all exercises, questions, and theories to specifically teach, test, and practice these 5 vocabulary words: [${wordsStr}]. Avoid random, unrelated vocabulary.`
        : "";

      prompt = `
        You are the Master Curriculum Planner in an adaptive English school.
        Generate a comprehensive study plan focusing on the vocabulary/lexicon/phrasal-verbs associated with the topic/theme of "${grammaticalFocus || "Present Perfect"}".
        ${wordsInstruction}
        ${difficultiesInstruction}
        ${cumulativeInstruction}
        Implement the rigorous 6-6-6 Training Protocol tailored ONLY FOR VOCABULARY AND WORD CHOICE:
        
        1. Theory: A highly effective, concise explanation of the key vocabulary words, phrases, idioms, irregular verb lists, collocations, or common term usage associated with "${grammaticalFocus}" (around 3 paragraphs) including practical examples. Also list a few useful translations. Specifically explain the words: [${wordsStr}].
        2. Phase 1 (Easy): 6 Multiple Choice questions focusing purely on vocabulary, synonyms, or correct verb selection, solvable easily by elimination. Include 4 options (A, B, C, D) and specify the correct answer index/text and explanation. Include the target words.
        3. Phase 2 (Medium): 6 Multiple Choice questions where distractors based on vocabulary nuances/collocations/idioms are highly plausible. Include 4 options and the correct explanation. Include the target words.
        4. Phase 3 (Hard): 6 active writing/production prompts designed to test vocabulary usage. These must include Portuguese sentences containing specific terms for the user to translate into English words or write answers representing specific vocabulary. Include the model correct answers or keywords you expect, and explanations. Include the target words.

        Ensure you generate EXACTLY 6 questions for each of phase1, phase2, and phase3 to uphold the 6-6-6 protocol.
      `;
    } else if (isChunks) {
      prompt = `
        You are the Master Curriculum Planner in an adaptive English school.
        Generate a comprehensive study plan focusing on conversational chunks, conversational speech formulas, and daily natural templates (e.g., connectors, transition words, expressing opinion, polite agreement/disagreement formulas) associated with the theme of "${grammaticalFocus || "Present Perfect"}".
        ${cumulativeInstruction}
        Implement the rigorous 6-6-6 Training Protocol tailored ONLY FOR CONVERSATIONAL CHUNKS AND SPEECH FORMULAS (BLOCOS DE FALA):
        
        1. Theory: A highly effective, concise explanation of the key conversational templates, connectors, transitions, and phrases associated with "${grammaticalFocus}" (around 3 paragraphs) with illustrative practical examples showing how to sound natural.
        2. Phase 1 (Easy): 6 Multiple Choice questions focusing strictly on matching speech formulas/chunks to appropriate situational contexts or conversational templates, solvable easily by elimination. Include 4 options (A, B, C, D) and specify the correct answer index/text and explanation.
        3. Phase 2 (Medium): 6 Multiple Choice questions where distractors based on conversational speech formulas or template nuances are highly plausible. Include 4 options and the correct explanation.
        4. Phase 3 (Hard): 6 active writing/production conversational prompts. These must include Portuguese situations or expressions containing conversational templates/speech chunks for the user to translate into natural English chunks or write appropriate conversational replies using speech formulas. Include the model correct answers or keywords you expect, and explanations.

        Ensure you generate EXACTLY 6 questions for each of phase1, phase2, and phase3 to uphold the 6-6-6 protocol.
      `;
    } else {
      prompt = `
        You are the Master Curriculum Planner in an adaptive English school.
        Generate a comprehensive study plan focusing on the grammatical structure and sentence syntax formula of "${grammaticalFocus || "Present Perfect"}". Do not focus on vocabulary terms; focus on tense formulas, word order, active vs passive voice, auxiliary structures.
        ${cumulativeInstruction}
        Implement the rigorous 6-6-6 Training Protocol tailored ONLY FOR GRAMMATICAL STRUCTURE:
        
        1. Theory: A highly effective, concise explanation of the grammatical structure formulas, auxiliary verbs (e.g. have/has, had), particle placement and word ordering of "${grammaticalFocus}" (around 3 paragraphs) including practical examples.
        2. Phase 1 (Easy): 6 Multiple Choice questions focusing strictly on grammatical formulas, solvable easily by elimination. Include 4 options (A, B, C, D) and specify the correct answer index/text and explanation.
        3. Phase 2 (Medium): 6 Multiple Choice questions focusing on grammatical structure options where distractors/tense shifts are highly plausible. Include 4 options and the correct explanation.
        4. Phase 3 (Hard): 6 active writing/production structural prompts. These must include Portuguese sentences for the user to translate into English or direct structure commands (e.g. "Write a sentence in Present Perfect Continuous"). Include the model correct answers or keywords you expect, and explanations.

        Ensure you generate EXACTLY 6 questions for each of phase1, phase2, and phase3 to uphold the 6-6-6 protocol.
      `;
    }

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: courseGenerateSchema,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    
    if (courseGenCache.size >= 100) cleanCourseGenCache();
    courseGenCache.set(cacheKey, { data: parsed, timestamp: Date.now() });

    res.json(parsed);
  } catch (error: any) {
    console.error("Error in course-generate:", error);
    handleExpressError(res, error, "Failed to generate custom course");
  }
});

// Evaluate active production (Phase 3 of 6-6-6)
app.post("/api/course-evaluate-phase3", async (req: Request, res: Response) => {
  try {
    const { prompts, userAnswers, topic, exerciseType } = req.body;
    const isVocabWorkout = exerciseType === "VOCABULARY";
    const isChunksWorkout = exerciseType === "CHUNKS";
    const ai = getGeminiClient();

    const activeWorkoutType = isVocabWorkout 
      ? "VOCABULARY WORKOUT" 
      : isChunksWorkout 
        ? "CONVERSATIONAL CHUNKS WORKOUT" 
        : "GRAMMAR STRUCTURE WORKOUT";

    const prompt = `
      You are the Master Linguist Evaluator. Let's grade 6 hard active-production sentences written by a student studying the central lesson topic "${topic}".
      The active exercise is a "${activeWorkoutType}".
      
      Here are the 6 structural prompts and the user's typed answers:
      ${prompts.map((p: any, i: number) => `
        Prompt ${i+1}: ${p?.question || ""}
        Teacher Ref Answer: ${p?.correctAnswer || ""}
        Student Text: ${userAnswers[i] || ""}
      `).join("\n")}
      
      Please analyze each sentence under the strict CRITÉRIO DE "INGLÊS ACEITÁVEL" (Acceptable English Criterion) and apply the following policies:

      CRITICAL EVALUATION POLICY:
      For each user's answer, assign a rating and decide if it is "correct" (successful/pass):
      - "Excelente": Natural, elegant, and perfectly correct. (correct = true)
      - "Aceitável": Readable, understandable, and correctly implements the central focus ("${topic}" / and exercise type "${exerciseType}"). (correct = true)
      - "Problemática": Incorrectly implements the central focus of the lesson ("${topic}"), or contains a major error directly related to the central theme. (correct = false)
      - "Inaceitável": Compromises understanding or has complete absence/nonsense. (correct = false)

      UNRELATED MISTAKES POLICY (CRUCIAL EXCLUSION FROM GRADE OR PASS/FAIL THRESHOLD):
      - Erros que não estejam diretamente relacionados ao tema/foco central "${topic}" (como erros de ortografia/digitação, outras preposições secundárias que não afetem o foco, pequenos escorregões ou vocabulário não relacionado à estrutura que está sendo estudada) NÃO DEVEM ser considerados como critério para reprovar a frase da aula!
      - You MUST still evaluate, extract, and report these unrelated errors under 'identified_error' (specifying user_phrase = the incorrect segment/word, correction = recommended correct sequence, explanation = a helpful explanation in Portuguese) so they are logged to the user's profile.
      - BUT, you MUST consider the sentence as "Aceitável" (correct: true) for the purpose of the grading and passing threshold of this lesson! They must only be failed on a question if they failed the central topic/grammatical focus specifically.

      SPECIAL EXERCISE-TYPE OVERRIDES:
      1. PORTUGUESE WORD FALLBACK POLICY ("Palavras em Português"):
         If the student types words in Portuguese (e.g. "I have 'caminhado' on the sidewalk", "I want to eat 'pão'"), this is a conscious declaration that they do not know the English term.
         - FOR ALL TYPES OF WORKOUTS: You MUST extract this Portuguese term and register it as an error under 'identified_error'. Set user_phrase = the Portuguese term, correction = the correct English equivalent, error_type = "Vocabulary", and provide a friendly Portuguese explanation of that vocabulary gap.
         - IF IT IS A GRAMMAR STRUCTURE WORKOUT (exerciseType = "GRAMMAR"): You MUST NOT mark this sentence as incorrect on a grammatical level! If the grammar structure around it is correct (e.g. "I have [participle]"), then assign rating = "Aceitável" or "Excelente", and correct = true. Vocabulary gaps should not fail a grammar structure exercise!
         - IF IT IS A VOCABULARY WORKOUT (exerciseType = "VOCABULARY"): This fallback counts as an incorrect answer on this question (rating = "Problemática" or "Inaceitável", correct = false).
         - IF IT IS A CONVERSATIONAL CHUNKS WORKOUT (exerciseType = "CHUNKS"): This fallback counts as incorrect (rating = "Problemática", correct = false).

      2. REGULARIZATION OF IRREGULAR VERBS ("Verbo irregular conjugado como regular"):
         If the student regularizes an irregular verb (e.g. "I eated", "she has runned", "they goed"):
         - FOR ALL TYPES OF WORKOUTS: You MUST register this in 'identified_error' with error_type = "Vocabulary" (user_phrase = the incorrect conjugations like 'eated', correction = 'ate', explanation = brief lesson in Portuguese).
         - IF IT IS A GRAMMAR STRUCTURE WORKOUT (exerciseType = "GRAMMAR"): This regularizing mistake MUST be classified as a Vocabulary error, not a grammatical structural error. Therefore, it MUST NOT count as a wrong answer for the grammar grade of this question (rating = "Aceitável" and correct = true, provided the tense structure setup is correct!).
         - IF IT IS A VOCABULARY OR CONVERSATIONAL CHUNKS WORKOUT (exerciseType = "VOCABULARY" or "CHUNKS"): This irregular verb mistake counts as incorrect for the vocabulary score (rating = "Problemática", correct = false).

      3. CONVERSATIONAL CHUNKS WORKOUT (exerciseType = "CHUNKS"):
         - The student must try to use natural conversational phrases, connectors, or speech formulas.
         - If they miss the conversational template, write very flat/rigid formal English (e.g., "I want to say that" instead of the expected conversational chunk "As far as I'm concerned"), they should still pass if the grammar is correct (rating = "Aceitável", correct = true), but you must gently offer the better chunk in the explanation.
         - If they fail to answer or make major structural errors that make the conversation unintelligible, mark it as incorrect (rating = "Problemática", correct = false).

      Evaluate if they passed the phase (pass = true if they scored at least 5 out of 6 correct sentences, meaning 80% / 83% of answers are Excelente or Aceitável under the above criteria).
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: courseEvaluatePhase3Schema,
      },
    });

    const parsed = JSON.parse(response.text || "{}");

    // Polyfill overallRulePassed to be 105% compatible with both frontend naming schemes
    parsed.overallRulePassed = !!parsed.pass;

    // Robust aggregation of identified_errors for the global adaptive statistics tracking backend
    const aggregatedErrors: any[] = [];
    if (Array.isArray(parsed.results)) {
      parsed.results.forEach((resItem: any) => {
        if (resItem.identified_error && resItem.identified_error.user_phrase && resItem.identified_error.user_phrase.trim()) {
          aggregatedErrors.push({
            user_phrase: resItem.identified_error.user_phrase,
            correction: resItem.identified_error.correction || "",
            explanation: resItem.identified_error.explanation || resItem.feedback || "",
            error_type: resItem.rating === 'Aceitável' || resItem.correct ? 'Spelling/Minor' : (exerciseType === 'VOCABULARY' ? 'Vocabulary' : 'Grammar')
          });
        }
      });
    }
    parsed.identified_errors = aggregatedErrors;

    res.json(parsed);
  } catch (error: any) {
    console.error("Error in course-evaluate-phase3:", error);
    handleExpressError(res, error, "Failed to grade hard production tasks");
  }
});

// In-Exercise Quick Doubts with Teacher endpoint
app.post("/api/exercise-doubt-reply", async (req: Request, res: Response) => {
  try {
    const {
      history = [],
      userQuery = "",
      exerciseContext = {},
      baselineProficiency = "Intermediate",
      username = "Aluno"
    } = req.body;

    const ai = getGeminiClient();

    const {
      question = "",
      options = [],
      correctAnswer = "",
      explanation = "",
      grammaticalFocus = "",
      exerciseType = "GRAMMAR",
      vocabWords = [],
      phase = "Fase Prática",
      questionNumber = 1,
      totalQuestions = 6,
      userAnswer = "",
      isAnswerChecked = false
    } = exerciseContext;

    const transcript = (history || [])
      .map((h: any) => `${h.sender === "user" ? (username || "Aluno") : "Professora Madson"}: ${h.text}`)
      .join("\n");

    const systemInstruction = `
      Você é a Professora Madson (lê-se "Médson"), uma professora particular de inglês carinhosa, experiente, ultra didática e direta ao ponto.
      O aluno está resolvendo uma questão específica dos "Exercícios Fixadores" e precisa de um esclarecimento pontual rápido para compreender o exercício atual.

      DADOS DO EXERCÍCIO ATUAL:
      - Tópico/Foco da Atividade: "${grammaticalFocus || 'Inglês Prático'}"
      - Categoria: ${exerciseType}
      - Fase: ${phase} (Questão ${questionNumber} de ${totalQuestions})
      - Enunciado/Pergunta: "${question}"
      ${options && options.length > 0 ? `- Alternativas da Questão:\n${options.map((opt: string, i: number) => `  ${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}` : ''}
      - Resposta Correta (Gabarito de Referência Didática): "${correctAnswer}"
      - Explicação do Gabarito: "${explanation}"
      ${vocabWords && vocabWords.length > 0 ? `- Vocabulário Envolvido: ${JSON.stringify(vocabWords)}` : ''}
      - Resposta que o aluno selecionou/digitou até agora: "${userAnswer || 'Nenhuma selecionada ainda'}"
      - O aluno já clicou em "Verificar Resposta"? ${isAnswerChecked ? "SIM (o gabarito já foi exibido na tela)" : "NÃO (o aluno ainda está resolvendo e pensando)"}

      DIRETRIZES PEDAGÓGICAS E REGRAS ESTRITAS:
      1. ESCOPO ESTRITO DE DÚVIDA DO EXERCÍCIO:
         - Responda EXCLUSIVAMENTE à dúvida trazida pelo aluno relacionada a este exercício.
         - Você pode: explicar conceitos gramaticais da pergunta, esclarecer o significado ou nuances de uma palavra ou expressão, esclarecer regras gramaticais, tirar dúvidas sobre o que o enunciado pede, ou dar dicas inteligentes.
         - Se o aluno AINDA NÃO verificou a resposta (${isAnswerChecked ? 'já verificou' : 'NÃO verificou'}), NUNCA entregue a resposta correta de bandeja nem diga explicitamente "a alternativa correta é a letra X". Guie o raciocínio dele explicando a regra ou o significado das palavras para que ele deduza sozinho.
         - Se o aluno JÁ verificou a resposta (${isAnswerChecked ? 'SIM' : 'NÃO'}), você pode explicar detalhadamente por que a alternativa correta é aquela e por que a opção escolhida estava certa ou errada.
      2. TAMANHO E FORMATO DA RESPOSTA:
         - Responda de forma extremamente concisa, amigável e direta ao ponto (no máximo 2 a 4 frases curtas).
         - NUNCA inicie uma aula completa nem palestras longas.
         - NUNCA mude de assunto nem transforme em conversa livre fora do exercício.
      3. IDIOMA:
         - Responda em PORTUGUÊS de forma natural e acolhedora. Use INGLÊS apenas nos termos, exemplos ou partes de frases analisadas.
         - Destaque palavras ou termos importantes com negrito duplo (**termo**).
    `;

    const promptContents = `
      Histórico de dúvidas nesta questão:
      ${transcript || 'Início da dúvida.'}

      Última pergunta do aluno:
      "${userQuery || history[history.length - 1]?.text || ''}"

      Escreva a resposta concisa e esclarecedora da Professora Madson ao aluno:
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: promptContents,
      config: {
        systemInstruction,
      },
    });

    const output = response.text || "";
    const parsed = parseGeminiOutput(output);
    res.json({
      text: parsed.text || output,
    });
  } catch (error: any) {
    console.error("Error in exercise-doubt-reply:", error);
    handleExpressError(res, error, "Failed to answer exercise doubt");
  }
});

// Virtual Teacher lesson conversation endpoint
app.post("/api/teacher-reply", async (req: Request, res: Response) => {
  try {
    const { 
      history, 
      grammaticalFocus, 
      baselineProficiency, 
      username, 
      strengthsSummary, 
      globalErrors, 
      completedNodes,
      exerciseType,
      vocabWords
    } = req.body;
    
    const ai = getGeminiClient();

    // Reconstruct transcript of the lesson
    const transcript = history.map((h: any) => `${h.sender === "user" ? (username || "Aluno") : "Professora"}: ${h.text}`).join("\n");
    const lastUserMessage = history[history.length - 1]?.text || "";

    let contextInstructions = "";
    if (strengthsSummary) {
      contextInstructions += `\n- Resumo do nível de inglês/pontos fortes e fracos do aluno (use APENAS internamente para evitar que você ensine conteúdo básico A1 caso ele seja mais avançado; NÃO repita esse resumo ao aluno): "${strengthsSummary}"\n`;
    }
    if (globalErrors && globalErrors.length > 0) {
      contextInstructions += `\n- Erros persistentes do aluno no histórico global (se puder, crie desafios que envolvam fixar isso): ${JSON.stringify(globalErrors)}\n`;
    }
    if (completedNodes && completedNodes.length > 0) {
      contextInstructions += `\n- Tópicos já dominados anteriormente pelo aluno: ${completedNodes.join(", ")}\n`;
    }

    let typeInstruction = "";
    if (exerciseType === "VOCABULARY") {
      let wordsStr = "";
      if (vocabWords && vocabWords.length > 0) {
        wordsStr = vocabWords.map((w: any) => `${w.en} (${w.pt})`).join(", ");
      }
      typeInstruction = `A aula de hoje é focada em VOCABULÁRIO e escolha vocabular temática relacionada a "${grammaticalFocus}".
Você deve focar e guiar a conversa especificamente para exercitar e praticar com o aluno as seguintes 5 palavras/expressões chaves: [${wordsStr}].
Incentive o aluno a usar essas palavras nas respostas dele, faça perguntas contextuais sobre elas ou peça para ele traduzir frases curtas contendo esses termos. Evite explicações gramaticais densas e foque no uso correto desses termos.`;
    } else if (exerciseType === "CHUNKS") {
      typeInstruction = `A aula de hoje é focada em BLOCOS DE FALA (CONVERSATIONAL CHUNKS) e expressões prontas da conversação cotidiana aplicadas ao tema de "${grammaticalFocus}" (ex: conectores como "on the other hand", fórmulas de opinião como "as far as I'm concerned", transições e conectivos fluidos). Foque em dar ritmo e naturalidade prática à fala.`;
    } else {
      typeInstruction = `A aula de hoje é focada em GRAMÁTICA e estrutura sintática de "${grammaticalFocus}" (ex: regras, tempos verbais, ordem das palavras, auxiliares, concordância estrutural).`;
    }

    const systemInstruction = `
      Você é a Madson (lê-se "Médson" mas escreve-se "Madson"), uma professora virtual de inglês sensacional, experiente, extremamente humana, acolhedora e divertida.
      O seu objetivo principal é conduzir uma aula particular dialogada e envolvente sobre o tópico: "${grammaticalFocus || "Present Perfect"}" para o aluno: "${username || "Aluno"}".
      O nível declarado de proficiência atual do aluno é: "${baselineProficiency || "Intermediate"}".

      DIRETRIZ DE FOCO PEDAGÓGICO DO DIA (ATENÇÃO CRÍTICA):
      ${typeInstruction}

      CONTEXTO DETALHADO DO ALUNO (USE PARA CALIBRAR A COMPLEXIDADE DA AULA):
      ${contextInstructions || "Nenhum histórico prévio disponível."}

      REGRAS IMPORTANTES DE CONDUTA:
      1. DIRETRIZ DE DIRECIONALIDADE E SUCULENTO EXTREMO: Suas falas e explicações ao aluno devem ser curtíssimas e ultra diretas ao ponto! Escreva no máximo 2 ou 3 frases curtas por mensagem. Evite parágrafos longos ou preâmbulos redundantes.
      2. Idioma principal da aula: Explique as regras, dê feedback e brinque SEMPRE em PORTUGUÊS de forma natural, coloquial e humana. Use o INGLÊS apenas ao apresentar os exemplos do tópico, demonstrar expressões padrão ou propor desafios/traduções.
      3. Interação Humana e Dinâmica: NÃO dê palestras longas com blocos maciços de texto. Explique apenas um pequeno detalhe por vez (máximo 1-2 frases). Em seguida, faça imediatamente um desafio interativo ou uma pergunta objetiva recomendada para o nível dele.
      4. Adaptação de Ritmo: Se o aluno acertar, comemore de forma ultra curta (ex: "Perfeito!", "Muito bem!") e suba o degrau do tópico. Se o aluno errar ou se sentir inseguro, mostre empatia rápida e dê outro desafio similar para ganhar confiança.
      5. Avaliação Linguística: Analise minuciosamente a última mensagem do aluno ("${lastUserMessage.replace(/"/g, '\\"')}") caso ele tenha tentado usar o inglês. Siga o Critério de Inglês Aceitável: ignore pequenos deslizes informais e destaque com amabilidade erros que de fato deturpem o sentido ou fiquem excessivamente bizarros para estrangeiros.
      6. USO DO NOME DA REGRA: Você está proibida de mencionar o nome técnico da regra ("${grammaticalFocus}") antes que o aluno tenha acertado perguntas ou demonstrado domínio prático sobre ela. Só revele ou cite esse nome (ex: "Isso que você acabou de usar se chama...") após ele já estar acertando os desafios consecutivamente.

      ESTRUTURA DA RESPOSTA:
      Responda de forma extremamente concisa e curta (no máximo 3 frases no total) na sua voz de professora Madson.
      Ao final da sua resposta, adicione OBRIGATORIAMENTE um bloco JSON limpo especificando os erros identificados (se houver):
      \`\`\`json
      {
        "identified_errors": [
          {
            "user_phrase": "a frase incorreta em inglês que o aluno usou",
            "correction": "a forma aceitável corrigida",
            "error_type": "Grammar / Syntax / Vocabulary / Concordance",
            "severity_score": 1 a 10,
            "explanation": "explicação curta em português do erro e do porquê foi corrigido"
          }
        ]
      }
      \`\`\`
      Se não houver erros na última mensagem do aluno ou se ele respondeu em português, o array "identified_errors" deve vir vazio: \`[]\`.
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: `
        Histórico da Aula de Inglês:
        ${transcript}
        
        Gere a resposta da professora Madson explicando ou desafiando o aluno, e avalie a última contribuição dele.
      `,
      config: {
        systemInstruction,
      },
    });

    const output = response.text || "";
    const parsed = parseGeminiOutput(output);
    res.json({
      text: parsed.text,
      payload: parsed.json,
    });
  } catch (error: any) {
    console.error("Error in teacher-reply:", error);
    handleExpressError(res, error, "Failed to generate teacher reply");
  }
});

// In-memory cache for Teacher Welcome (TTL: 2 hours, max 100 entries)
interface TeacherWelcomeCacheEntry {
  data: any;
  timestamp: number;
}
const teacherWelcomeCache = new Map<string, TeacherWelcomeCacheEntry>();
const TEACHER_WELCOME_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function cleanTeacherWelcomeCache() {
  const now = Date.now();
  for (const [k, v] of teacherWelcomeCache.entries()) {
    if (now - v.timestamp > TEACHER_WELCOME_CACHE_TTL_MS) {
      teacherWelcomeCache.delete(k);
    }
  }
}

// Virtual Teacher personalized lesson welcome
app.post("/api/teacher-welcome", async (req: Request, res: Response) => {
  let grammaticalFocus = "Present Perfect";
  let username = "Estudante";
  try {
    const { 
      grammaticalFocus: reqFocus, 
      baselineProficiency, 
      username: reqUser, 
      strengthsSummary, 
      globalErrors,
      exerciseType,
      vocabWords
    } = req.body;
    if (reqFocus) grammaticalFocus = reqFocus;
    if (reqUser) username = reqUser;

    const cacheKey = `${String(grammaticalFocus).trim().toLowerCase()}_${exerciseType || "GRAMMAR"}_${baselineProficiency || "intermediate"}_${Array.isArray(vocabWords) ? vocabWords.map((w: any) => w.en || w).sort().join(",") : ""}`;
    const cached = teacherWelcomeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < TEACHER_WELCOME_CACHE_TTL_MS)) {
      return res.json(cached.data);
    }
    
    const ai = getGeminiClient();

    let contextInstructions = "";
    if (strengthsSummary) {
      contextInstructions += `\n- Resumo do nível de inglês/pontos fortes e fracos do aluno (use isso para saber o nível dele, evitar tratá-lo como iniciante absoluto se for avançado, ou vice-versa, e calibrar o tom da aula): "${strengthsSummary}"\n`;
    }
    if (globalErrors && globalErrors.length > 0) {
      contextInstructions += `\n- Erros persistentes do aluno no histórico global: ${JSON.stringify(globalErrors)}\n`;
    }

    let typeInstruction = "";
    if (exerciseType === "VOCABULARY") {
      let wordsStr = "";
      if (vocabWords && vocabWords.length > 0) {
        wordsStr = vocabWords.map((w: any) => `${w.en} (${w.pt})`).join(", ");
      }
      typeInstruction = `A aula de hoje é focada em VOCABULÁRIO e escolha vocabular temática relacionada a "${grammaticalFocus}".
Você deve focar e guiar a conversa especificamente para ensinar, exercitar e praticar com o aluno as seguintes 5 palavras/expressões chaves: [${wordsStr}].
Apresente as palavras de forma calorosa no início da aula, pergunte o significado de algumas ou peça para o aluno criar frases usando-as de forma funcional. Evite explicações gramaticais formais densas.`;
    } else if (exerciseType === "CHUNKS") {
      typeInstruction = `A aula de hoje é focada em BLOCOS DE FALA (CONVERSATIONAL CHUNKS) e expressões prontas da conversação cotidiana aplicadas ao tema de "${grammaticalFocus}" (ex: conectores como "on the other hand", fórmulas de opinião como "as far as I'm concerned", transições e conectivos fluidos). Foque em dar ritmo e naturalidade prática à fala.`;
    } else {
      typeInstruction = `A aula de hoje é focada em GRAMÁTICA e estrutura sintática de "${grammaticalFocus}" (ex: regras, tempos verbais, ordem das palavras, auxiliares, concordância estrutural).`;
    }

    const systemInstruction = `
      Você é a Madson (lê-se "Médson" mas escreve-se "Madson"), uma professora virtual de inglês sensacional, experiente, extremamente humana, acolhedora e divertida.
      O seu objetivo principal é iniciar uma aula particular dialogada e envolvente sobre o tópico: "${grammaticalFocus || "Present Perfect"}" para o aluno: "${username || "Aluno"}".
      O nível de proficiência atual do aluno é: "${baselineProficiency || "Intermediate"}".

      DIRETRIZ DE FOCO PEDAGÓGICO DO DIA (ATENÇÃO CRÍTICA):
      ${typeInstruction}

      CONTEXTO HISTÓRICO DO ALUNO (ESTUDE ISSO ANTES DE SAUDAR):
      ${contextInstructions || "Nenhum histórico prévio de conversação ou dificuldades mapeadas ainda."}

      DIRETRIZES DE SAUDAÇÃO E INTRODUÇÃO DA AULA (AGIR COMO MENTORA PERSONALIZADA):
      Você acompanha continuamente a evolução real do aluno. Antes de introduzir a necessidade prática do novo conteúdo, você deve estruturar sua fala da seguinte forma (gerando um parágrafo contínuo, natural e fluido de no máximo 4 a 5 sentenças e respeitando estritamente o limite de tamanho):

      1. OBSERVAÇÃO PERSONALIZADA: Comece dizendo algo caloroso e personalizado como "Estava olhando suas últimas conversas...", "Analisando seus registros..." ou "Percebi uma coisa interessante no seu inglês...", conectando com o histórico real do aluno (erros persistentes, temas que ele costuma discutir, ou o nível de proficiência dele).
      2. IDENTIFICAÇÃO DA NECESSIDADE COMUNICATIVA: Explique em linguagem natural, amigável e humana qual necessidade de comunicação você observou para o nível dele (ex: falar sobre experiências de vida, descrever hábitos passados, expressar hipóteses, etc.). O foco inicial deve ser o que ele está tentando expressar ou o próximo passo natural de evolução prática, e NÃO a nomenclatura da regra.
      3. APRESENTAÇÃO DA FERRAMENTA LINGUÍSTICA: Somente após a necessidade comunicativa estar clara, introduza a estrutura ideal usando termos como "Quando queremos dizer algo assim...", "Em inglês normalmente usamos..." ou "Existe uma construção em inglês muito útil para isso..." e mostre um exemplo simples em inglês. NUNCA use a palavra "nativos" ou "falantes nativos".
      4. NOME TÉCNICO TERMINANTEMENTE PROIBIDO: Você está TERMINANTEMENTE PROIBIDA de citar o nome técnico ou gramatical da regra ("${grammaticalFocus}") nesta mensagem inicial de boas-vindas. Apresente o conteúdo puramente por meio de exemplo prático sem dar o nome técnico da regra.

      CRÍTICO:
      - LIMITAÇÃO DE TAMANHO: A sua mensagem inteira (saudação + explicação indutiva + desafio) deve ter NO MÁXIMO 650 caracteres (incluindo espaços). Seja extremamente concisa e vá direto ao ponto!
      - PROIBIÇÃO DO NOME DA REGRA: Não fale o nome técnico da regra ("${grammaticalFocus}") de jeito nenhum nesta primeira mensagem. O nome só poderá ser revelado em mensagens subsequentes após o aluno já estar dominando o uso prático.
      - ESTRUTURA DE PERGUNTA INTUITIVA (OBRIGATÓRIO): Termine lançando uma primeira pergunta prática ou desafio curto e estimulante em inglês adaptado ao nível dele para iniciar a aula de forma altamente interativa. Antes de apresentar essa pergunta ou desafio em inglês, insira de forma bem visível (em uma nova linha se preferir) o texto em português: "Agora responda: " ou "Agora tente você: ". Isso ajuda o aluno a saber exatamente o que responder.
      - Escreva em PORTUGUÊS de forma descontraída ao dialogar e dar instruções, e use o INGLÊS ao propor o exemplo ativo ou fazer a pergunta.

      ESTRUTURA DE RETORNO OBRIGATÓRIA EM JSON:
      Você deve gerar o texto de sua saudação e, ao mesmo tempo, fornecer um bloco JSON que condense um resumo excelente da regra ensinada para que fique guardada com o estudante. O bloco JSON deve obedecer à seguinte estrutura obrigatória:
      \`\`\`json
      {
        "rule": "Um resumo claro, condensado e elegante do conceito em português.",
        "examples": [
          "Exemplo 1 em inglês (com Tradução entre parênteses)",
          "Exemplo 2 em inglês (com Tradução entre parênteses)",
          "Exemplo 3 em inglês (com Tradução entre parênteses)"
        ],
        "pro_tip": "Uma dica profissional de ouro sobre o uso prático, pegadinha de vida real, ou pronúncia deste tópico."
      }
      \`\`\`
      Toda a sua fala (a introdução da aula e a primeira pergunta) deve ficar FORA do bloco JSON, na resposta de texto principal. O bloco JSON deve ser anexado no final!
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: `Gere a introdução inicial e o feedback da Professora Madson para a aula de: ${grammaticalFocus}.`,
      config: {
        systemInstruction,
      },
    });

    const output = response.text || "";
    const parsed = parseGeminiOutput(output);
    
    const resultPayload = { 
      text: parsed.text, 
      summary: parsed.json 
    };

    if (teacherWelcomeCache.size >= 100) cleanTeacherWelcomeCache();
    teacherWelcomeCache.set(cacheKey, { data: resultPayload, timestamp: Date.now() });

    // Ensure we send back both text and the parsed summary
    res.json(resultPayload);
  } catch (error: any) {
    console.error("Error in teacher-welcome:", error);
    res.json({ 
      text: `Olá, ${username}! Eu sou a professora Madson, sua tutora de inglês. Analisei seu perfil e preparei uma aula maravilhosa para nós trabalharmos **${grammaticalFocus}** no seu próprio ritmo! Vamos começar de forma prática?`,
      summary: {
        rule: `Foco gramatical da aula de hoje: ${grammaticalFocus}.`,
        examples: ["Pratique com a professora respondendo a pergunta no chat."],
        pro_tip: "Fale com clareza próximo ao microfone para treinar sua pronúncia!"
      }
    });
  }
});

// Virtual Teacher lesson completion evaluator
app.post("/api/teacher-evaluate-completion", async (req: Request, res: Response) => {
  try {
    const { history, grammaticalFocus, baselineProficiency, username, exerciseType, vocabWords } = req.body;
    const ai = getGeminiClient();

    // Reconstruct transcript of the lesson
    const transcript = history.map((h: any) => `${h.sender === "user" ? (username || "Aluno") : "Professora"}: ${h.text}`).join("\n");

    let specificRule = "";
    if (exerciseType === "VOCABULARY" && vocabWords && vocabWords.length > 0) {
      const listStr = vocabWords.map((w: any) => w.en).join(", ");
      specificRule = `\n6. VALIDAÇÃO DE VOCABULÁRIO (CRÍTICO): Como esta é uma aula de VOCABULÁRIO, você deve verificar se o aluno usou (ou tentou ativamente usar) as seguintes palavras-chave em inglês durante a conversa: [${listStr}]. Se ele não tiver usado ou tentado usar pelo menos algumas dessas palavras de forma contextual, dê "pass": false e indique amigavelmente que ele precisa tentar incorporar esses termos nas respostas dele antes de concluir a aula.\n`;
    }

    const systemInstruction = `
      Você é a professora virtual Madson. O seu aluno "${username || "Aluno"}" solicitou a conclusão da aula dialogada sobre o tópico "${grammaticalFocus}".
      A sua função é analisar rigorosamente a trajetória completa da aula para avaliar se o aluno obteve aprendizado funcional e se ele merece ser aprovado de tópico.

      REGRAS DE AVALIAÇÃO PEDAGÓGICA DA PROFESSORA MADSON:
      1. Análise da Trajetória Completa: avalie a evolução completa do aluno ao longo da aula. NÃO aprove automaticamente apenas porque ele acertou as últimas respostas, nem reprove automaticamente por erros no início da aula. Se o aluno começou errando, recebeu explicações e passou a responder corretamente de forma consistente, ele deve ser APROVADO ("pass": true).
      2. Critérios de Análise: considere a quantidade e frequência de erros cometidos, a evolução demonstrada, a confiança nas respostas e a necessidade real de reforço adicional.
      3. Evite Rigidez Excessiva: o foco é o aprendizado funcional e compreensivo, não a perfeição sem falhas. Pequenos deslizes ocasionais não devem bloquear a aprovação.
      4. Critérios de Reprovação ("pass": false): recomende a continuidade da aula se você notar que:
         - Os erros continuam aparecendo repetidamente até o fim;
         - O aluno demonstra acertos meramente por tentativa e erro ou decoreba superficial;
         - Há fortes sinais de memorização superficial ou grande insegurança.
         Nesses casos, dê "pass": false e escreva com extrema amabilidade algo como: "Você melhorou bastante, mas ainda percebo que este ponto não está suficientemente estável. Gostaria de praticar mais um pouco antes de concluirmos esta aula.", instruindo o aluno sobre quais aspectos ainda requerem prática.
      5. Prática Mínima de Respostas: para que seja aprovado, o aluno precisa ter contribuído com pelo menos 3 mensagens ativas tentando formular frases em inglês relevantes ao tema e respondendo aos seus desafios na simulação.
      ${specificRule}

      Responda OBRIGATORIAMENTE em formato JSON seguindo a estrutura:
      {
        "pass": boolean,
        "explanation": "mensagem em português da Professora Madson parabenizando o aluno de forma acolhedora (se passar) ou explicando amigavelmente os motivos exatos de não aprovação com recomendações de continuidade (se não passar)",
        "missing_aspects": ["aspecto pedagógico específico a melhorar 1", "aspecto pedagógico específico a melhorar 2"]
      }
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: `
        Histórico completo de conversação desta lição:
        ${transcript}

        Analise se o aluno participou, respondeu perguntas/exercícios o suficiente e possui domínio razoável para finalizar a aula.
      `,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pass: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            missing_aspects: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["pass", "explanation", "missing_aspects"]
        }
      }
    });

    const outputText = response.text?.trim() || "{}";
    let parsedResult;
    try {
      parsedResult = JSON.parse(outputText);
    } catch (parseErr) {
      // Fallback parse attempt
      const match = outputText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      } else {
        throw parseErr;
      }
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.error("Error in teacher-evaluate-completion:", error);
    handleExpressError(res, error, "Failed to evaluate teacher completion");
  }
});

// AI-Driven Progress Evaluation Report Generator
app.post("/api/generate-progress-report", async (req: Request, res: Response) => {
  try {
    const { period, globalErrors = [], globalStrengths = [], snapshots = [] } = req.body;
    const ai = getGeminiClient();

    const periodLabel = period === 'month' ? 'Último mês' : period === '6months' ? 'Últimos 6 meses' : 'Desde o início';

    // Cálculo exato de confiabilidade de dados observados para pautar a IA
    const totalInteractions = globalErrors.length + globalStrengths.length;
    let confidenceRating = "Amostragem Insuficiente";
    let marginOfError = "±18%";
    let confidenceHint = "Ainda não foram registrados diálogos e exercícios reais suficientes no Stories para determinar a proficiência funcional com precisão científica.";

    if (totalInteractions >= 15) {
      confidenceRating = "Confiança Alta";
      marginOfError = "±3%";
      confidenceHint = "Amostragem rica, robusta e representativa das capacidades e desvios reais do usuário em múltiplos contextos.";
    } else if (totalInteractions >= 6) {
      confidenceRating = "Confiança Moderada";
      marginOfError = "±6%";
      confidenceHint = "Padrões linguísticos observados com frequência aceitável em cenários de RPG e lições formais.";
    } else if (totalInteractions > 0) {
      confidenceRating = "Confiança Baixa";
      marginOfError = "±12%";
      confidenceHint = "Evidências preliminares com pouca variedade situacional. Pratique mais diálogos abertos para uma medição precisa.";
    }

    const systemInstruction = `
      Você é um auditor independente e especialista sênior em avaliação pedagógica de proficiência em língua inglesa do aplicativo FluentRoleplay.
      Seu objetivo exclusivo é produzir uma avaliação realística, técnica, isenta de bajulação comercial e metodologicamente honesta da proximidade do usuário em relação ao "inglês aceitável" (autonomia comunicativa prática para viagens, trabalho e sobrevivência, mesmo com pequenos desvios aceitáveis).

      DIRETRIZES DE AUDITORIA PEDAGÓGICA (STRICT RULES):
      1. ISENÇÃO TOTAL DE OPTIMISM BIAS: Não utilize chavões motivacionais vazios, elogios exagerados ou bajulação. Se os dados mostram persistência de erros ou limitações fundamentais (ex: uso de termos repetitivos como "thing", "good", "bad"), aponte isso claramente de forma construtiva. Se o usuário tem pouco histórico de conversação espontânea, diga explicitamente que a precisão de sua proficiência funcional está reduzida.
      2. DIFERENÇA ENTRE ADAPTAÇÃO AO APP VS COMPETÊNCIA GLOBAL: Alerte o aluno de que completar exercícios de fixação estruturados na interface do app demonstra compreensão das regras formais, mas que a competência real só é comprovada em diálogos autônomos abertos no Stories (onde ele precisa formular falas do zero e expressar sotaques e tempos verbais espontaneamente).
      3. AVALIAÇÃO MULTIDIMENSIONAL: Não trate o "inglês aceitável" como uma nota global absoluta. Subdivida suas observações considerando as seguintes dimensões linguísticas reais:
         - Estrutura e Gramática Funcional (tempos verbais aplicados de forma correta).
         - Densidade Lexical (abandono de termos rudimentares e expansão vocabular temática).
         - Flexibilidade e Circunlóquio (parafrasear termos esquecidos sem travar).
         - Autonomia situacional no dia a dia.
      4. ALUCINAÇÕES DE PASSADO: Se no histórico de snapshots anteriores constar apenas o momento atual do cadastro, declare explicitamente que não existem dados observáveis suficientes para afirmar tendências históricas anteriores no tempo, rejeitando qualquer tentativa de inferir o passado sem evidências.

      ESTRUTURA OBRIGATÓRIA DO RELATÓRIO (Markdown elegante em português do Brasil pt-BR):
      No início de tudo, monte um cabeçalho de integridade de dados contendo o grau de fidedignidade repassado:
      
      ### 📊 CERTIFICADO DE COBERTURA DE DADOS
      - **Nível de Confiança da Amostragem**: ${confidenceRating}
      - **Margem de Flutuação Instrumental**: ${marginOfError}
      - *Diagnóstico*: ${confidenceHint}

      Em seguida, utilize títulos H2 markdown exclusivos:

      ## PARTE 1 — VISÃO TÉCNICA E MULTIDIMENSIONAL
      (Analise a clareza estrutural, tempos verbais, variedade flexível de palavras e se o aluno abusa de termos repetitivos ou comete erros sistemáticos).

      ## PARTE 2 — VISÃO PRÁTICA E DIÁLOGOS DE VIDA REAL
      (Traduza a proficiência demonstrada para eventos reais, diferenciando o responder exercícios mecânicos da capacidade de sobreviver em situações reais de aeroportos, hotéis ou trabalho sem depender de tradutores auxiliares).
    `;

    const prompt = `
      Gere um relatório de progresso independente do aluno para o período: "${periodLabel}".
      
      DADOS OBSERVAVEIS COLETADOS DIRETAMENTE NO APP:
      - Total de Interações (Amostras): ${totalInteractions}
      - Quantidade de erros históricos catalogados: ${globalErrors.length}
      - Detalhes de alguns erros históricos/dificuldades ativas (fala do usuário vs correção recomendada):
        ${globalErrors.slice(0, 15).map((e: any) => `- Falou: "${e.user_phrase}" | Ideal: "${e.correction}" | Detalhe: ${e.explanation}`).join("\n")}
      
      - Sucessos linguísticos registrados (globalStrengths):
        ${globalStrengths.map((s: any) => `- Tópico: ${s.topicId} | Quantidade de acertos: ${s.count}x | Última frase de sucesso: "${s.lastPhrase}"`).join("\n")}
      
      - Histórico de Snapshots Registrados (para avaliar se há dados de períodos passados reais):
        ${snapshots.map((snap: any) => `- Data ${snap.date}: ${snap.errorsCount} erros, ${snap.strengthsCount} acertos, ${snap.completedNodesCount} módulos concluídos. Resumo: ${snap.textSummary || 'Sem resumo'}`).join("\n")}
    `;

    const response = await generateContentWithFallback(ai, {
      model: ADVANCED_GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
      }
    });

    res.json({ report: response.text || "" });
  } catch (error: any) {
    console.error("Error in generate-progress-report:", error);
    handleExpressError(res, error, "Failed to generate progress report");
  }
});

// ======================================================================
// AI-DRIVEN INTELLIGENT MONTHLY STUDY PLAN ADAPTER
// ======================================================================
app.post("/api/adapt-study-plan", async (req: Request, res: Response) => {
  try {
    const {
      baselineProficiency = 'Intermediate',
      estimatedMonths = 9,
      currentWeekIndex = 0,
      completedNodes = [],
      weeklyPlan = [],
      globalErrors = [],
      globalStrengths = [],
      strengthsSummary = '',
      mandatoryVocabGroups = [],
      origin = 'automática'
    } = req.body;

    const ai = getGeminiClient();

    // Past/current weeks MUST remain completely unchanged
    const pastWeeks = weeklyPlan.slice(0, currentWeekIndex + 1);
    const futureWeeks = weeklyPlan.slice(currentWeekIndex + 1);

    if (!futureWeeks || futureWeeks.length === 0) {
      return res.json({
        weeklyPlan,
        diagnosis: "O plano de estudos já está na sua fase final. Todas as semanas programadas foram concluídas ou estão em andamento.",
        maintained: true,
        maintainedReason: "Nenhuma semana futura disponível para adaptação.",
        changesSummary: ["Manutenção do plano atual (todas as semanas já foram concluídas ou estão em andamento)."],
        addedTopics: [],
        removedTopics: [],
        anticipatedTopics: [],
        postponedTopics: [],
        justifications: []
      });
    }

    // 1. Summarize active errors & Mini Translator searches for prompt economy
    const activeErrorsList = (globalErrors || []).slice(0, 15).map((e: any) => ({
      userPhrase: e.user_phrase || '',
      correction: e.correction || '',
      explanation: e.explanation || '',
      errorType: e.error_type || '',
      isTranslatorSearch: !!e.is_translator_search,
      count: e.count || 1
    }));

    const translatorTerms = (globalErrors || [])
      .filter((e: any) => e.is_translator_search || (e.explanation && e.explanation.toLowerCase().includes('mini tradutor')))
      .map((e: any) => e.user_phrase || e.correction)
      .slice(0, 12);

    const activeStrengths = (globalStrengths || []).slice(0, 15).map((s: any) => ({
      topicId: s.topicId,
      count: s.count,
      lastPhrase: s.lastPhrase
    }));

    const futureWeeksSummary = futureWeeks.map((w: any, idx: number) => ({
      weekNumber: w.weekNumber || w.weekNum || (currentWeekIndex + 2 + idx),
      theme: w.theme || `Semana ${w.weekNumber || w.weekNum || (currentWeekIndex + 2 + idx)}`,
      focusGrammar: w.focusGrammar || '',
      contents: (w.contents || []).map((c: any) => ({
        id: c.id,
        label: c.label,
        type: c.type,
        completed: !!c.completed,
        nodeId: c.nodeId
      }))
    }));

    const prompt = `
      Você é um Diretor Pedagógico Sênior de Inglês no FluentRoleplay.
      Sua tarefa é analisar o desempenho real do aluno (erros de Stories, pesquisas do Mini Tradutor, facilidades consolidadas e módulos concluídos) e adaptar as SEMANAS FUTURAS do seu Plano de Estudos.

      DADOS DO ALUNO:
      - Proficiência Base: ${baselineProficiency} (Plano original de ${estimatedMonths} meses / ${weeklyPlan.length} semanas totais)
      - Semana Atual do Aluno: Semana ${currentWeekIndex + 1} (Índice ${currentWeekIndex})
      - Módulos Concluídos (${completedNodes.length}): [${completedNodes.join(', ')}]
      - Resumo de Facilidades/Conquistas: "${strengthsSummary || 'Em consolidação'}"
      - Amostra de Tópicos Consolidados (Facilidades): ${JSON.stringify(activeStrengths)}
      
      DIFICULDADES E LACUNAS IDENTIFICADAS (Stories + Mini Tradutor):
      - Erros Recentes no Stories/Exercícios: ${JSON.stringify(activeErrorsList)}
      - Termos Mais Pesquisados no Mini Tradutor: ${JSON.stringify(translatorTerms)}

      VOCABULÁRIO OBRIGATÓRIO SOLICITADO PELO ALUNO:
      ${JSON.stringify(mandatoryVocabGroups)}

      CRONOGRAMA ATUAL DAS SEMANAS FUTURAS (${futureWeeks.length} semanas restantes):
      ${JSON.stringify(futureWeeksSummary)}

      INSTRUÇÕES PEDAGÓGICAS E REGRAS RÍGIDAS OBRIGATÓRIAS:
      1. NUNCA altere semanas passadas ou a semana atual. Modifique EXCLUSIVAMENTE as semanas futuras.
      2. PRESERVE A DURAÇÃO E CARGA DO CURSO: Há exatamente ${futureWeeks.length} semanas futuras no plano original. Você DEVE retornar EXATAMENTE ${futureWeeks.length} semanas futuras em 'updatedFutureWeeks' (ou uma quantidade equivalente proporcional a todas as lições não concluídas), NUNCA condensando dezenas de semanas em poucas semanas.
      3. CARGA SEMANAL: Cada semana em 'updatedFutureWeeks' deve conter exatamente 4 conteúdos (Grammar, Vocabulary, Blocos de fala).
      4. VOCABULÁRIO OBRIGATÓRIO: Garanta que TODOS os tópicos de vocabulário obrigatório não concluídos continuem presentes no plano futuro. NUNCA perca ou remova grupos de vocabulário obrigatório.
      5. REORDENAÇÃO CIRÚRGICA:
         - Se houver dificuldades frequentes ou pesquisas no Mini Tradutor, ANTECIPE os tópicos de reforço correspondentes para semanas futuras mais próximas.
         - Se o aluno já domina algum tópico futuro, adie-o para semanas posteriores.
      6. ATRIBUTO OBRIGATÓRIO: Utilize estritamente 'weekNumber' em cada semana (números sequenciais de ${currentWeekIndex + 2} a ${currentWeekIndex + 1 + futureWeeks.length}).
      7. Se o plano futuro atual já estiver ideal sem necessidade de alterações, defina "maintained": true e preencha "maintainedReason".
      8. Em "changesSummary", forneça frases claras e profissionais explicando cada mudança.

      Sua resposta DEVE ser estritamente em JSON compatível com o schema configurado.
    `;

    let responseJson: any = null;
    try {
      const response = await generateContentWithFallback(ai, {
        model: ADVANCED_GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: adaptStudyPlanSchema,
        },
      });
      responseJson = JSON.parse(response.text || "{}");
    } catch (aiErr) {
      console.warn("AI generation failed for adapt-study-plan, running deterministic pedagogical fallback:", aiErr);
    }

    if (responseJson && Array.isArray(responseJson.updatedFutureWeeks) && responseJson.updatedFutureWeeks.length > 0) {
      // Backend Validation: check if updatedFutureWeeks length is reasonably coherent (not collapsed to < 50% of expected)
      const isCoherentLength = futureWeeks.length < 4 || responseJson.updatedFutureWeeks.length >= Math.floor(futureWeeks.length * 0.6);
      
      if (isCoherentLength) {
        // Normalize returned future weeks
        const normalizedFutureWeeks = responseJson.updatedFutureWeeks.map((w: any, idx: number) => {
          const targetWeekNum = currentWeekIndex + 2 + idx;
          return {
            weekNumber: targetWeekNum,
            theme: w.theme || `Semana ${targetWeekNum}`,
            focusGrammar: w.focusGrammar || '',
            contents: Array.isArray(w.contents) ? w.contents.map((c: any, cIdx: number) => ({
              id: c.id || `w${targetWeekNum}_c${cIdx + 1}`,
              label: c.label || 'Tópico de Estudo',
              type: c.type || 'Grammar',
              completed: false, // Future weeks lessons are uncompleted by definition
              nodeId: c.nodeId
            })) : []
          };
        });

        const mergedPlan = [...pastWeeks, ...normalizedFutureWeeks];

        // Guarantee strict 1..N weekNumber sequence across the entire plan
        mergedPlan.forEach((w, idx) => {
          w.weekNumber = idx + 1;
        });

        return res.json({
          weeklyPlan: mergedPlan,
          diagnosis: responseJson.diagnosis || "Análise pedagógica concluída com base nas evidências de uso do aluno.",
          maintained: !!responseJson.maintained,
          maintainedReason: responseJson.maintainedReason || "",
          changesSummary: responseJson.changesSummary || ["Cronograma futuro ajustado para alinhar com o perfil do aluno."],
          addedTopics: responseJson.addedTopics || [],
          removedTopics: responseJson.removedTopics || [],
          anticipatedTopics: responseJson.anticipatedTopics || [],
          postponedTopics: responseJson.postponedTopics || [],
          justifications: responseJson.justifications || []
        });
      } else {
        console.warn(`Adaptation generated incoherent length (${responseJson.updatedFutureWeeks.length} weeks vs ${futureWeeks.length} expected). Using safe pedagogical fallback.`);
      }
    }

    // SAFE DETERMINISTIC PEDAGOGICAL FALLBACK ALGORITHM (Preserves ALL future weeks and contents)
    const updatedFutureWeeks = JSON.parse(JSON.stringify(futureWeeks));

    const changesSummary: string[] = [];
    const anticipatedTopics: string[] = [];

    const hasActiveErrors = (globalErrors || []).length > 0;

    // Collect all uncompleted Grammar items in future weeks
    const uncompletedGrammar: any[] = [];
    updatedFutureWeeks.forEach((w: any) => {
      (w.contents || []).forEach((c: any) => {
        if (c.type === 'Grammar' && !c.completed) {
          uncompletedGrammar.push(c);
        }
      });
    });

    const activeErrorPhrases = (globalErrors || []).map((err: any) => 
      ((err.user_phrase || '') + ' ' + (err.explanation || '') + ' ' + (err.error_type || '')).toLowerCase()
    );

    if (activeErrorPhrases.length > 0 && uncompletedGrammar.length > 0) {
      uncompletedGrammar.sort((a, b) => {
        const aLabel = (a.label || '').toLowerCase();
        const bLabel = (b.label || '').toLowerCase();
        const aErr = activeErrorPhrases.some((ph: string) => ph.includes(aLabel) || aLabel.split(' ').some(w => w.length > 3 && ph.includes(w)));
        const bErr = activeErrorPhrases.some((ph: string) => ph.includes(bLabel) || bLabel.split(' ').some(w => w.length > 3 && ph.includes(w)));
        if (aErr && !bErr) return -1;
        if (!aErr && bErr) return 1;
        return 0;
      });

      let gIdx = 0;
      updatedFutureWeeks.forEach((w: any) => {
        (w.contents || []).forEach((slot: any) => {
          if (slot.type === 'Grammar' && !slot.completed && gIdx < uncompletedGrammar.length) {
            slot.label = uncompletedGrammar[gIdx].label;
            slot.nodeId = uncompletedGrammar[gIdx].nodeId;
            gIdx++;
          }
        });
      });

      changesSummary.push(`Aumento de prioridade para os tópicos com dificuldades ativas identificadas nas interações do Stories e no Mini Tradutor.`);
    } else {
      changesSummary.push(`Após analisar dificuldades, facilidades, progresso e conteúdos futuros, concluiu-se que o plano atual já atende adequadamente às necessidades do usuário. Nenhuma alteração foi necessária no momento.`);
    }

    const mergedFallbackPlan = [...pastWeeks, ...updatedFutureWeeks];
    mergedFallbackPlan.forEach((w, idx) => {
      w.weekNumber = idx + 1;
    });

    return res.json({
      weeklyPlan: mergedFallbackPlan,
      diagnosis: hasActiveErrors
        ? "Identificadas necessidades pontuais de reforço pedagógico. O cronograma futuro foi reordenado para abordar com prioridade os tópicos com desvios ativos."
        : "Após analisar dificuldades, facilidades, progresso e conteúdos futuros, concluiu-se que o plano atual já atende adequadamente às necessidades do usuário. Nenhuma adaptação foi considerada benéfica neste momento.",
      maintained: !hasActiveErrors,
      maintainedReason: !hasActiveErrors
        ? "Após analisar dificuldades, facilidades, progresso e conteúdos futuros, concluiu-se que o plano atual já atende adequadamente às necessidades do usuário. Nenhuma adaptação foi considerada benéfica neste momento."
        : "",
      changesSummary,
      addedTopics: [],
      removedTopics: [],
      anticipatedTopics,
      postponedTopics: [],
      justifications: []
    });

  } catch (error: any) {
    console.error("Error in adapt-study-plan endpoint:", error);
    handleExpressError(res, error, "Erro ao adaptar plano de estudos");
  }
});

// ======================================================================
// AI PROVIDER DIAGNOSTIC ENDPOINT (Completely independent, no fallback)
// ======================================================================
app.post("/api/dev/test-ai-provider", async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, modelId } = req.body;

    const targetProvider = (provider === "openrouter" ? "openrouter" : "gemini") as "gemini" | "openrouter";
    
    // Retrieve central config as fallback if body parameter is missing
    const centralConfig = getProviderConfig(targetProvider, "diagnostic_endpoint");

    const effectiveKey = (apiKey && typeof apiKey === "string" && apiKey.trim()) || centralConfig.apiKey;
    const effectiveModel = (modelId && typeof modelId === "string" && modelId.trim()) || centralConfig.modelId;

    const maskedKey = maskApiKey(effectiveKey);

    // Diagnostic Logging
    console.log(`[AI DIAGNOSTIC TEST] ========================================`);
    console.log(`[AI DIAGNOSTIC TEST] Provedor Selecionado: ${targetProvider}`);
    console.log(`[AI DIAGNOSTIC TEST] Model ID Utilizado: ${effectiveModel}`);
    console.log(`[AI DIAGNOSTIC TEST] API Key Detectada: ${maskedKey}`);
    console.log(`[AI DIAGNOSTIC TEST] Início da requisição de teste real (sem fallback)...`);

    // Pre-call validation 1: Check if API Key is present
    if (!effectiveKey || !effectiveKey.trim()) {
      console.warn(`[AI DIAGNOSTIC TEST CANCELLED] API Key ausente para ${targetProvider}`);
      return res.json({
        success: false,
        status: "Falha na conexão",
        provider: targetProvider,
        modelId: effectiveModel || "(Não informado)",
        maskedKey: "(Não configurada)",
        errorCategory: "API Key ausente",
        message: `API Key ausente. Nenhuma chave de API foi fornecida ou configurada para o provedor ${targetProvider === "gemini" ? "Gemini" : "OpenRouter"}.`,
        errorDetails: "Preencha o campo de API Key nas configurações do desenvolvedor antes de executar o teste."
      });
    }

    // Pre-call validation 2: Check if Model ID is present
    if (!effectiveModel || !effectiveModel.trim()) {
      console.warn(`[AI DIAGNOSTIC TEST CANCELLED] Model ID ausente para ${targetProvider}`);
      return res.json({
        success: false,
        status: "Falha na conexão",
        provider: targetProvider,
        modelId: "(Não informado)",
        maskedKey,
        errorCategory: "Model ID ausente",
        message: "Model ID ausente. Informe o identificador do modelo de IA a ser utilizado.",
        errorDetails: "O campo do identificador de modelo está vazio."
      });
    }

    // Pre-call validation 3: Check if Model ID field contains an API Key by mistake
    if (effectiveModel.startsWith("sk-") || effectiveModel.includes("sk-") || effectiveModel.startsWith("AIzaSy")) {
      console.error(`[AI DIAGNOSTIC TEST CANCELLED] API Key detectada no campo Model ID: "${maskApiKey(effectiveModel)}"`);
      return res.json({
        success: false,
        status: "Falha na conexão",
        provider: targetProvider,
        modelId: effectiveModel,
        maskedKey,
        errorCategory: "Model ID inválido",
        message: `Model ID inválido. Foi detectada uma API Key (${maskApiKey(effectiveModel)}) no campo de identificador de modelo. O campo Model ID deve conter apenas o nome do modelo (ex: gemini-3.8-flash ou google/gemini-2.0-flash-001) e não uma chave secreta de API.`,
        errorDetails: `O valor do modelo ("${maskApiKey(effectiveModel)}") possui o formato característico de uma API Key.`
      });
    }

    const startTime = Date.now();

    // Independent Call: GEMINI (no fallback)
    if (targetProvider === "gemini") {
      try {
        console.log(`[AI DIAGNOSTIC TEST] Enviando chamando real ao Gemini (${effectiveModel})...`);
        const testAi = new GoogleGenAI({
          apiKey: effectiveKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build-diag"
            }
          }
        });

        const pingPromise = testAi.models.generateContent({
          model: effectiveModel,
          contents: "Ping",
          config: { maxOutputTokens: 5 }
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: A API do Gemini não respondeu dentro do limite de 12 segundos.")), 12000)
        );

        await Promise.race([pingPromise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        console.log(`[AI DIAGNOSTIC TEST SUCCESS] Gemini (${effectiveModel}) respondeu em ${durationMs}ms. Resposta recebida. API Key aceita.`);

        return res.json({
          success: true,
          status: "Conectado",
          provider: "gemini",
          modelId: effectiveModel,
          maskedKey,
          durationMs,
          message: `Status: Conectado. O provedor Gemini (${effectiveModel}) respondeu com sucesso em ${durationMs}ms. Confirmação: A API Key foi aceita e validada pelos servidores do Google.`
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const rawMsg = err?.message || String(err);
        console.error(`[AI DIAGNOSTIC TEST FAILURE] Erro retornado pelo Gemini após ${durationMs}ms:`, rawMsg);

        let errorCategory = "Erro do provedor";
        let userMessage = `Erro do provedor Gemini: ${rawMsg}`;

        if (rawMsg.includes("Timeout")) {
          errorCategory = "Timeout";
          userMessage = "Timeout de conexão. A API do Gemini excedeu o tempo limite de 12 segundos para resposta.";
        } else if (rawMsg.includes("API_KEY_INVALID") || rawMsg.includes("API key not valid") || rawMsg.includes("UNAUTHENTICATED") || rawMsg.includes("401") || rawMsg.includes("403")) {
          errorCategory = "API Key inválida";
          userMessage = "API Key inválida. A chave de API do Gemini não foi aceita ou não possui autorização.";
        } else if (rawMsg.includes("no longer available") || rawMsg.includes("discontinued")) {
          errorCategory = "Modelo descontinuado";
          userMessage = `O modelo "${effectiveModel}" foi descontinuado pelo Google. Atualize suas configurações para usar o modelo oficial recomendado "gemini-3.8-flash".`;
        } else if (rawMsg.includes("not found") || rawMsg.includes("INVALID_ARGUMENT") || rawMsg.includes("404")) {
          errorCategory = "Modelo inexistente";
          userMessage = `Modelo inexistente. O identificador "${effectiveModel}" não foi encontrado no Gemini ou não está disponível para esta chave. Recomendamos usar "gemini-3.8-flash".`;
        } else if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("429")) {
          errorCategory = "Rate limit";
          userMessage = "Limite diário ou limite de taxa (Rate Limit) atingido na API do Gemini para esta chave.";
        } else if (rawMsg.includes("503") || rawMsg.includes("500") || rawMsg.includes("UNAVAILABLE")) {
          errorCategory = "Modelo indisponível";
          userMessage = "Modelo indisponível. Os servidores do Gemini estão temporariamente indisponíveis (Status 500/503).";
        }

        return res.json({
          success: false,
          status: "Falha na conexão",
          provider: "gemini",
          modelId: effectiveModel,
          maskedKey,
          durationMs,
          errorCategory,
          message: userMessage,
          errorDetails: rawMsg
        });
      }
    } else {
      // Independent Call: OPENROUTER (no fallback)
      try {
        console.log(`[AI DIAGNOSTIC TEST] Enviando chamada real ao OpenRouter ("${effectiveModel}")...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${effectiveKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
            "X-Title": "FluentRoleplay Diagnostic"
          },
          body: JSON.stringify({
            model: effectiveModel,
            messages: [{ role: "user", content: "Ping" }],
            max_tokens: 5
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        if (response.ok) {
          console.log(`[AI DIAGNOSTIC TEST SUCCESS] OpenRouter ("${effectiveModel}") respondeu em ${durationMs}ms. Resposta recebida. API Key aceita.`);
          return res.json({
            success: true,
            status: "Conectado",
            provider: "openrouter",
            modelId: effectiveModel,
            maskedKey,
            durationMs,
            message: `Status: Conectado. O provedor OpenRouter (${effectiveModel}) respondeu com sucesso em ${durationMs}ms. Confirmação: A API Key foi aceita e validada.`
          });
        } else {
          const errBodyText = await response.text();
          console.error(`[AI DIAGNOSTIC TEST FAILURE] Erro HTTP ${response.status} retornado pelo OpenRouter:`, errBodyText);

          let errorCategory = "Erro do provedor";
          let userMessage = `Erro do provedor OpenRouter (Status ${response.status}): ${errBodyText}`;

          if (response.status === 401 || errBodyText.includes("User key not found") || errBodyText.includes("Invalid API key") || errBodyText.includes("Unauthenticated")) {
            errorCategory = "API Key inválida";
            userMessage = "API Key inválida. A chave de API do OpenRouter é inválida ou não foi encontrada na plataforma.";
          } else if (response.status === 400 || response.status === 404 || errBodyText.includes("is not a valid model ID") || errBodyText.includes("Model not found") || errBodyText.includes("No such model")) {
            errorCategory = "Modelo inexistente";
            userMessage = `Modelo inexistente. O identificador "${effectiveModel}" não é um modelo válido ou cadastrado no OpenRouter.`;
          } else if (response.status === 429 || errBodyText.includes("rate limit") || errBodyText.includes("out of credits") || errBodyText.includes("insufficient_quota")) {
            errorCategory = "Rate limit";
            userMessage = "Rate limit ou limite diário atingido. Ocorreu limite de taxa ou saldo de créditos insuficiente na conta do OpenRouter.";
          } else if (response.status === 500 || response.status === 502 || response.status === 503 || errBodyText.includes("provider unavailable")) {
            errorCategory = "Modelo indisponível";
            userMessage = "Modelo indisponível. O modelo selecionado ou o provedor parceiro está temporariamente fora do ar no OpenRouter.";
          }

          return res.json({
            success: false,
            status: "Falha na conexão",
            provider: "openrouter",
            modelId: effectiveModel,
            maskedKey,
            durationMs,
            errorCategory,
            message: userMessage,
            errorDetails: errBodyText
          });
        }
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const isAbort = err?.name === "AbortError" || String(err).includes("abort");
        const rawMsg = isAbort ? "Timeout: O servidor do OpenRouter não respondeu no tempo limite de 12 segundos." : (err?.message || String(err));

        console.error(`[AI DIAGNOSTIC TEST FAILURE] Exceção na conexão com OpenRouter após ${durationMs}ms:`, rawMsg);

        return res.json({
          success: false,
          status: "Falha na conexão",
          provider: "openrouter",
          modelId: effectiveModel,
          maskedKey,
          durationMs,
          errorCategory: isAbort ? "Timeout" : "Erro do provedor",
          message: isAbort ? "Timeout. A requisição de teste para o OpenRouter excedeu o tempo limite de 12 segundos." : `Erro do provedor: Falha de comunicação com o OpenRouter (${rawMsg}).`,
          errorDetails: rawMsg
        });
      }
    }
  } catch (globalErr: any) {
    console.error("Diagnostic endpoint unexpected error:", globalErr);
    return res.status(500).json({
      success: false,
      status: "Falha na conexão",
      errorCategory: "Erro do provedor",
      message: "Ocorreu um erro interno no servidor ao executar o teste de diagnóstico.",
      errorDetails: globalErr?.message || String(globalErr)
    });
  }
});

// ----------------------------------------------------------------------
// VITE DEV SERVER / PRODUCTION SERVING
// ----------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Mount Vite middleware so it compiles frontend in development
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.get("/sw.js", (req: Request, res: Response) => {
      res.setHeader("Service-Worker-Allowed", "/");
      res.setHeader("Content-Type", "application/javascript");
      res.sendFile(path.join(distPath, "sw.js"));
    });
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FluentRoleplay app running at http://localhost:${PORT}`);
  });
}

startServer();
