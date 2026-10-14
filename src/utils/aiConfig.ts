export type AIProvider = 'gemini' | 'openrouter';

export interface AIClientConfig {
  primaryProvider: AIProvider;
  primaryApiKey: string;
  primaryModelId: string;

  reserveProvider: AIProvider;
  reserveApiKey: string;
  reserveModelId: string;

  // Legacy fields for backward compatibility
  geminiApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash';

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[localStorage] Failed to set ${key}:`, e);
  }
}

/**
 * Checks if a Gemini model ID is deprecated, discontinued, or obsolete.
 */
function isDeprecatedGeminiModel(m: string): boolean {
  const trimmed = (m || '').trim();
  return (
    !trimmed ||
    trimmed === 'gemini-2.5-flash' ||
    trimmed === 'gemini-2.5-flash-preview' ||
    trimmed === 'gemini-3.5-flash' ||
    trimmed.startsWith('gemini-1.5') ||
    trimmed.startsWith('gemini-2.0') ||
    trimmed === 'gemini-pro'
  );
}

/**
 * Single source of truth for reading and sanitizing AI configuration on the client.
 */
export function getAiConfig(): AIClientConfig {
  let primaryProvider = (localStorage.getItem('fluent_ai_primary_provider') as AIProvider) || 'gemini';
  let primaryApiKey = (localStorage.getItem('fluent_ai_primary_api_key') || '').trim();
  let primaryModelId = (localStorage.getItem('fluent_ai_primary_model_id') || '').trim();

  let reserveProvider = (localStorage.getItem('fluent_ai_reserve_provider') as AIProvider) || 'openrouter';
  let reserveApiKey = (localStorage.getItem('fluent_ai_reserve_api_key') || '').trim();
  let reserveModelId = (localStorage.getItem('fluent_ai_reserve_model_id') || '').trim();

  // Legacy keys
  let legacyGeminiKey = (localStorage.getItem('fluent_user_api_key') || '').trim();
  let legacyOpenRouterKey = (localStorage.getItem('fluent_openrouter_api_key') || '').trim();
  let legacyOpenRouterModel = (localStorage.getItem('fluent_openrouter_model') || '').trim();

  // Fallback for Primary API
  if (!primaryApiKey) {
    if (primaryProvider === 'gemini') {
      primaryApiKey = legacyGeminiKey;
    } else {
      primaryApiKey = legacyOpenRouterKey;
    }
  }
  if (!primaryModelId) {
    if (primaryProvider === 'gemini') {
      primaryModelId = DEFAULT_GEMINI_MODEL;
    } else {
      primaryModelId = legacyOpenRouterModel || DEFAULT_OPENROUTER_MODEL;
    }
  }

  // Fallback for Reserve API
  if (!reserveApiKey) {
    if (reserveProvider === 'openrouter') {
      reserveApiKey = legacyOpenRouterKey;
    } else {
      reserveApiKey = legacyGeminiKey;
    }
  }
  if (!reserveModelId) {
    if (reserveProvider === 'openrouter') {
      reserveModelId = legacyOpenRouterModel || DEFAULT_OPENROUTER_MODEL;
    } else {
      reserveModelId = DEFAULT_GEMINI_MODEL;
    }
  }

  // Auto-upgrade deprecated Gemini models in localStorage
  if (primaryProvider === 'gemini' && isDeprecatedGeminiModel(primaryModelId)) {
    primaryModelId = DEFAULT_GEMINI_MODEL;
    safeLocalStorageSet('fluent_ai_primary_model_id', DEFAULT_GEMINI_MODEL);
  }
  if (reserveProvider === 'gemini' && isDeprecatedGeminiModel(reserveModelId)) {
    reserveModelId = DEFAULT_GEMINI_MODEL;
    safeLocalStorageSet('fluent_ai_reserve_model_id', DEFAULT_GEMINI_MODEL);
  }
  if (primaryProvider === 'openrouter' && (primaryModelId === 'google/gemini-2.0-flash-001' || !primaryModelId)) {
    primaryModelId = DEFAULT_OPENROUTER_MODEL;
    safeLocalStorageSet('fluent_ai_primary_model_id', DEFAULT_OPENROUTER_MODEL);
  }
  if (reserveProvider === 'openrouter' && (reserveModelId === 'google/gemini-2.0-flash-001' || !reserveModelId)) {
    reserveModelId = DEFAULT_OPENROUTER_MODEL;
    safeLocalStorageSet('fluent_ai_reserve_model_id', DEFAULT_OPENROUTER_MODEL);
  }

  // Sanitization check: if Model ID field accidentally contains an API key, reposition or clear it
  if (primaryModelId.startsWith('sk-') || primaryModelId.includes('sk-') || primaryModelId.startsWith('AIzaSy')) {
    console.warn(`[AI Config Client Sanitizer] Primary Model ID contained an API key. Auto-sanitizing.`);
    if (!primaryApiKey) primaryApiKey = primaryModelId;
    primaryModelId = primaryProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }
  if (reserveModelId.startsWith('sk-') || reserveModelId.includes('sk-') || reserveModelId.startsWith('AIzaSy')) {
    console.warn(`[AI Config Client Sanitizer] Reserve Model ID contained an API key. Auto-sanitizing.`);
    if (!reserveApiKey) reserveApiKey = reserveModelId;
    reserveModelId = reserveProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }

  const geminiApiKey = primaryProvider === 'gemini' ? primaryApiKey : (reserveProvider === 'gemini' ? reserveApiKey : legacyGeminiKey);
  const openrouterApiKey = primaryProvider === 'openrouter' ? primaryApiKey : (reserveProvider === 'openrouter' ? reserveApiKey : legacyOpenRouterKey);
  const openrouterModel = primaryProvider === 'openrouter' ? primaryModelId : (reserveProvider === 'openrouter' ? reserveModelId : (legacyOpenRouterModel || DEFAULT_OPENROUTER_MODEL));

  return {
    primaryProvider,
    primaryApiKey,
    primaryModelId,
    reserveProvider,
    reserveApiKey,
    reserveModelId,
    geminiApiKey,
    openrouterApiKey,
    openrouterModel,
  };
}

/**
 * Single source of truth for saving AI configuration on the client.
 */
export function saveAiConfig(config: Partial<AIClientConfig>): AIClientConfig {
  const current = getAiConfig();

  let primaryProvider = config.primaryProvider || current.primaryProvider;
  let primaryApiKey = config.primaryApiKey !== undefined ? config.primaryApiKey.trim() : current.primaryApiKey;
  let primaryModelId = config.primaryModelId !== undefined ? config.primaryModelId.trim() : current.primaryModelId;

  let reserveProvider = config.reserveProvider || current.reserveProvider;
  let reserveApiKey = config.reserveApiKey !== undefined ? config.reserveApiKey.trim() : current.reserveApiKey;
  let reserveModelId = config.reserveModelId !== undefined ? config.reserveModelId.trim() : current.reserveModelId;

  // Legacy key setter handling
  if (config.geminiApiKey !== undefined) {
    if (primaryProvider === 'gemini') primaryApiKey = config.geminiApiKey.trim();
    if (reserveProvider === 'gemini') reserveApiKey = config.geminiApiKey.trim();
  }
  if (config.openrouterApiKey !== undefined) {
    if (primaryProvider === 'openrouter') primaryApiKey = config.openrouterApiKey.trim();
    if (reserveProvider === 'openrouter') reserveApiKey = config.openrouterApiKey.trim();
  }
  if (config.openrouterModel !== undefined) {
    if (primaryProvider === 'openrouter') primaryModelId = config.openrouterModel.trim();
    if (reserveProvider === 'openrouter') reserveModelId = config.openrouterModel.trim();
  }

  // Sanitization check
  if (primaryModelId.startsWith('sk-') || primaryModelId.includes('sk-') || primaryModelId.startsWith('AIzaSy')) {
    if (!primaryApiKey) primaryApiKey = primaryModelId;
    primaryModelId = primaryProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }
  if (reserveModelId.startsWith('sk-') || reserveModelId.includes('sk-') || reserveModelId.startsWith('AIzaSy')) {
    if (!reserveApiKey) reserveApiKey = reserveModelId;
    reserveModelId = reserveProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }

  if (!primaryModelId) {
    primaryModelId = primaryProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }
  if (!reserveModelId) {
    reserveModelId = reserveProvider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
  }

  safeLocalStorageSet('fluent_ai_primary_provider', primaryProvider);
  safeLocalStorageSet('fluent_ai_primary_api_key', primaryApiKey);
  safeLocalStorageSet('fluent_ai_primary_model_id', primaryModelId);

  safeLocalStorageSet('fluent_ai_reserve_provider', reserveProvider);
  safeLocalStorageSet('fluent_ai_reserve_api_key', reserveApiKey);
  safeLocalStorageSet('fluent_ai_reserve_model_id', reserveModelId);

  const geminiKey = primaryProvider === 'gemini' ? primaryApiKey : (reserveProvider === 'gemini' ? reserveApiKey : '');
  const openrouterKey = primaryProvider === 'openrouter' ? primaryApiKey : (reserveProvider === 'openrouter' ? reserveApiKey : '');
  const openrouterModel = primaryProvider === 'openrouter' ? primaryModelId : (reserveProvider === 'openrouter' ? reserveModelId : DEFAULT_OPENROUTER_MODEL);

  if (geminiKey) safeLocalStorageSet('fluent_user_api_key', geminiKey);
  if (openrouterKey) safeLocalStorageSet('fluent_openrouter_api_key', openrouterKey);
  if (openrouterModel) safeLocalStorageSet('fluent_openrouter_model', openrouterModel);

  return {
    primaryProvider,
    primaryApiKey,
    primaryModelId,
    reserveProvider,
    reserveApiKey,
    reserveModelId,
    geminiApiKey: geminiKey,
    openrouterApiKey: openrouterKey,
    openrouterModel,
  };
}

/**
 * Produces HTTP headers for forwarding AI configuration to backend endpoints.
 */
export function getAiConfigHeaders(): Record<string, string> {
  const config = getAiConfig();
  const headers: Record<string, string> = {
    'x-ai-primary-provider': config.primaryProvider,
    'x-ai-primary-api-key': config.primaryApiKey,
    'x-ai-primary-model-id': config.primaryModelId,
    'x-ai-reserve-provider': config.reserveProvider,
    'x-ai-reserve-api-key': config.reserveApiKey,
    'x-ai-reserve-model-id': config.reserveModelId,
  };

  if (config.geminiApiKey) {
    headers['x-user-api-key'] = config.geminiApiKey;
  }
  if (config.openrouterApiKey) {
    headers['x-openrouter-api-key'] = config.openrouterApiKey;
  }
  if (config.openrouterModel) {
    headers['x-openrouter-model'] = config.openrouterModel;
  }

  return headers;
}
