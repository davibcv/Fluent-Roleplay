import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { safeLocalStorageSet, deduplicateAndLimitSnapshots, MAX_UNDO_HISTORY_ITEMS, MAX_SNAPSHOTS_ITEMS } from './utils/safeStorage';

// Credentials retrieved from firebase-applet-config.json
const firebaseConfig = {
  projectId: "gen-lang-client-0216922060",
  appId: "1:725767200515:web:a5a4e46cc409c4ee0b1336",
  apiKey: "AIzaSyAPG6Wivvevi5R4S9jUsZJuq_N9RnZH3sw",
  authDomain: "gen-lang-client-0216922060.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-dfbf00ac-945a-4474-8a37-6db5e5a56c76",
  storageBucket: "gen-lang-client-0216922060.firebasestorage.app",
  messagingSenderId: "725767200515"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with the exact mapped databaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Google Auth provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Keys to continuously synchronize
export const LOCAL_STORAGE_KEYS = [
  'fluent_username',
  'fluent_aligned',
  'fluent_proficiency',
  'fluent_est_months',
  'fluent_focus',
  'fluent_setting',
  'fluent_character',
  'fluent_init_reply',
  'fluent_story_loaded',
  'fluent_errors',
  'fluent_strengths_nodes',
  'fluent_adaptations',
  'fluent_app_mode',
  'fluent_strengths_summary',
  'fluent_sim_state',
  'fluent_voice_gender',
  'fluent_recommendation_last_action',
  'fluent_completed_nodes',
  'fluent_consolidation_records',
  'fluent_snapshots',
  'fluent_tutorial_done',
  'fluent_user_api_key',
  'fluent_mandatory_vocab',
  'fluent_mandatory_vocab_groups',
  'fluent_plan_schedule',
  'fluent_weekly_plan'
];

/**
 * Standard OperationType & FirestoreErrorInfo
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Error handler conforming strictly to FirestoreErrorInfo format
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errStr = String((error as any)?.message || error).toLowerCase();
  const isQuota = errStr.includes("resource-exhausted") || 
                  errStr.includes("quota") || 
                  errStr.includes("exhausted") || 
                  errStr.includes("limit exceeded") || 
                  (error as any)?.code === "resource-exhausted";
  
  if (isQuota) {
    isCloudWriteSuspended = true;
    safeLocalStorageSet('fluent_firestore_quota_exceeded', 'true');
    console.warn(`[Firebase Fallback] Quota de gravação/leitura diária excedida na operação ${operationType} em ${path}. Usando estado local.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Gets a parsed summary from local storage state
 */
export function summarizeState(state: Record<string, string | null>) {
  const isAligned = state['fluent_aligned'] === 'true';
  const setting = state['fluent_setting'] || 'Não definido';
  const username = state['fluent_username'] || 'Sem nome';
  
  let dayCount = 1;
  let characterCount = 0;
  if (state['fluent_sim_state']) {
    try {
      const parsedSim = JSON.parse(state['fluent_sim_state']);
      dayCount = parsedSim.day_count || 1;
      if (parsedSim.fixed_characters) {
        characterCount = parsedSim.fixed_characters.length;
      }
    } catch {}
  }

  let snapshotCount = 0;
  if (state['fluent_snapshots']) {
    try {
      snapshotCount = JSON.parse(state['fluent_snapshots']).length;
    } catch {}
  }

  return {
    isAligned,
    username,
    setting,
    dayCount,
    characterCount,
    snapshotCount,
    lastUpdatedAt: state['lastUpdatedAt'] || 'Agora'
  };
}

/**
 * Utility to construct solid local state snapshot object
 */
export function getLocalStateSnapshot(): Record<string, string | null> {
  const state: Record<string, string | null> = {};
  LOCAL_STORAGE_KEYS.forEach(k => {
    state[k] = localStorage.getItem(k);
  });
  state['lastUpdatedAt'] = new Date().toISOString();
  return state;
}

/**
 * Checks if a state is genuinely empty
 */
export function isStateEmpty(state: Record<string, string | null>): boolean {
  return !state['fluent_aligned'] || state['fluent_aligned'] !== 'true';
}

/**
 * Commits state data object to Local Storage
 */
export function applyStateToLocalStorage(state: Record<string, string | null>) {
  LOCAL_STORAGE_KEYS.forEach(k => {
    let val = state[k];
    if (val === null || val === undefined) {
      localStorage.removeItem(k);
    } else {
      if (k === 'fluent_sim_state_history' || k === 'fluent_snapshots') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const limit = k === 'fluent_sim_state_history' ? MAX_UNDO_HISTORY_ITEMS : MAX_SNAPSHOTS_ITEMS;
            val = JSON.stringify(deduplicateAndLimitSnapshots(parsed, limit));
          }
        } catch {}
      }
      safeLocalStorageSet(k, val);
    }
  });
}

export let isCloudWriteSuspended = typeof window !== 'undefined' && localStorage.getItem('fluent_firestore_quota_exceeded') === 'true';

/**
 * RESTORATIVE WRITE: Saves target state dictionary to Cloud Firestore
 */
export async function writeStateToCloud(userId: string, state: Record<string, string | null>) {
  if (localStorage.getItem('fluent_disable_firestore_sync') === 'true') {
    console.log("[Firebase] Cloud writes are disabled by developer choice. Changes remain local.");
    return;
  }
  if (isCloudWriteSuspended || localStorage.getItem('fluent_firestore_quota_exceeded') === 'true') {
    console.log("[Firebase] Cloud writes are suspended due to quota limitations. Changes will remain local.");
    return;
  }
  const path = `users/${userId}`;
  try {
    const safeData: Record<string, any> = {};
    Object.entries(state).forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        safeData[k] = v;
      }
    });
    safeData.lastUpdatedAt = new Date().toISOString();
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, safeData, { merge: false });
  } catch (error: any) {
    const errStr = String(error?.message || error).toLowerCase();
    if (errStr.includes("resource-exhausted") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit exceeded") || error?.code === "resource-exhausted") {
      isCloudWriteSuspended = true;
      safeLocalStorageSet('fluent_firestore_quota_exceeded', 'true');
      console.warn("[Firebase] Detected Firestore write quota limit exceeded. Suspending cloud sync writes for this session.");
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * FETCH READ: Pulls document from Cloud Firestore
 */
export async function fetchStateFromCloud(userId: string): Promise<Record<string, string | null> | null> {
  if (localStorage.getItem('fluent_disable_firestore_sync') === 'true' || isCloudWriteSuspended || localStorage.getItem('fluent_firestore_quota_exceeded') === 'true') {
    console.log("[Firebase] Cloud reads are disabled or suspended due to quota limitations. Returning local storage contents.");
    return getLocalStateSnapshot();
  }
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    
    const data = snap.data();
    const result: Record<string, string | null> = {};
    
    LOCAL_STORAGE_KEYS.forEach(k => {
      result[k] = data[k] !== undefined ? data[k] : null;
    });
    result['lastUpdatedAt'] = data.lastUpdatedAt || null;
    
    return result;
  } catch (error: any) {
    const errStr = String(error?.message || error).toLowerCase();
    if (errStr.includes("resource-exhausted") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit exceeded") || error?.code === "resource-exhausted") {
      isCloudWriteSuspended = true;
      safeLocalStorageSet('fluent_firestore_quota_exceeded', 'true');
      console.warn("[Firebase] Detected Firestore read quota limit exceeded. Switching to local fallback.");
      return getLocalStateSnapshot();
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Trigger pop-up authenticate
 */
export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Log out current session
 */
export async function logoutUser() {
  await signOut(auth);
}

/**
 * Developer Manuals structure & fallbacks
 */
export interface DeveloperManuals {
  personality_manual: string;
  reaction_manual: string;
  intimacy_manual: string;
  raw_material_manual: string;
  naturalness_audit_manual?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PERSONALITY_MANUAL = `Como construir personalidade realista e humana:
1. INDIVIDUALIDADE E NÃO REUTILIZAÇÃO: Cada personagem representa um indivíduo único. É estritamente proibido reutilizar ou copiar a identidade, nome, histórico, personalidade, aparência ou memória de outro personagem apenas porque ocupa um cargo semelhante ou está no mesmo setor/ambiente.
2. REGISTROS MÍNIMOS E ESTADO TEMPORÁRIO (< 100% INTIMIDADE / NOME DESCONHECIDO): Enquanto name_known for false ou a intimidade for inferior a 100%, a folha de personalidade e matéria-prima DEVEM ser mantidas em registros extremamente reduzidos (aproximadamente 50 caracteres cada). As fichas completas NUNCA nascem prontas.
3. DESCOBERTA DO NOME E CONSOLIDAÇÃO DA IDENTIDADE: Quando o usuário perguntar o nome ou ele for revelado naturalmente, consolide a identidade permanente do personagem mantendo a matéria-prima e personalidade temporárias ainda extremamente compactas (≈50 caracteres).
4. EXPANSÃO PROGRESSIVA (SOMENTE A PARTIR DE 100% DE INTIMIDADE): Somente quando a intimidade atingir 100%, a IA poderá expandir gradualmente a personalidade, histórico, gostos, traços psicológicos, objetivos e relações.
5. EQUILÍBRIO DE VIRTUDES E FALHAS: Todo humano tem falhas cotidianas de ego misturadas a virtudes sinceras.
6. CONTEXTO SOCIAL E IDADE: Molde o vocabulário e referências de acordo com a biografia e cultura local.`;

export const DEFAULT_REACTION_MANUAL = `Como reagir e responder de modo humano e realista:
1. DIÁLOGO NATURAL E CURTO: Jamais fale longamente ou aja como tutor/professor de IA. Mantenha as falas limitadas a NO MÁXIMO duas sentenças curtas e expressivas (no máximo 20-30 palavras) por turno. 
2. ERRADICAÇÃO DA POSITIVIDADE TÓXICA: Remova qualquer confirmação ou elogio artificial entusiástico como "That's great!", "Awesome!", "Wow!", "I'm so glad to help!" no início da fala. Responda como um nativo comum de forma emocionalmente pé-no-chão.
3. REGRA DO COMPROMISSO SOCIAL: Caso ambos marquem um compromisso para hoje ou combinem um plano, o personagem deve demonstrar ciência desse plano em turnos posteriores daquele mesmo dia, cobrando ou agindo conforme o combinado de forma contínua.
4. PASSANDO O TURNO SEM ENCHIMENTO DE PERGUNTAS: Apenas 20% das falas devem conter perguntas diretas. No restante, passe a vez usando suposições intencionais sobre o usuário, micro-relatos cotidianos, comentários opinativos ou reações implícitas de silêncio.`;

export const DEFAULT_INTIMACY_MANUAL = `Como aprofundar conforme aumento da intimidade:
1. MANTER REGISTROS MÍNIMOS (< 100% INTIMIDADE): Enquanto a pontuação de intimidade (relationship_score) estiver abaixo de 100%, os registros de personalidade e matéria-prima DEVEM permanecer estritamente mínimos e reduzidos (aproximadamente 50 caracteres cada). As fichas completas NUNCA nascem prontas.
2. EXPANSÃO PROGRESSIVA A PARTIR DE 100% DE INTIMIDADE: Somente quando a intimidade atingir 100% (ou mais), a IA poderá expandir gradualmente a personalidade, histórico, gostos, traços psicológicos, objetivos e relações do personagem.
3. REVELAÇÃO GRADUAL DE CAMADAS: Conforme a intimidade cresce além de 100%, o personagem começa a desabafar sobre conflitos íntimos, compartilhar medos profundos, pedir opiniões sinceras, adotar apelidos afetuosos ou demonstrar maior proximidade, mantendo sempre sua individualidade única sem reutilizar fichas de outros NPCs.`;

export const DEFAULT_RAW_MATERIAL_MANUAL = `Como fazer a matéria-prima (tipos de personalidade e arquétipos):
1. SELEÇÃO DO TIPO BÁSICO: Escolha um tipo de personalidade baseado em arquétipos humanos profundos ou variações (ex: contemplativo/sentimental, prático/focado em deveres, comunicativo/social/voltado para ideias, focado no empírico/sensorial).
2. DEFINIÇÃO DA ESTRUTURA ARQUETÍPICA: Forneça traços fundamentais que sirvam de base bruta (matéria-prima) - como o apreço por prazeres sensoriais sofisticados, a paciência e força obstinada, ou o desejo por debates filosóficos e políticos.
3. ISOLAMENTO DO PERSONAGEM FINAL: Essa matéria-prima descreve as tendências temperamentais e o "esqueleto" psicológico inicial do tipo de pessoa, sem definir o nome, a profissão ou a história de vida final do personagem (que serão construídos na fase posterior).`;

export const DEFAULT_NATURALNESS_AUDIT_MANUAL = ``;

/**
 * Saves manuals to global Firestore document /system/developer_manuals
 */
export async function writeDeveloperManualsToCloud(manuals: DeveloperManuals, userId: string): Promise<void> {
  // Always save locally first so we can always recover even if offline/suspended
  safeLocalStorageSet('fluent_developer_manuals', JSON.stringify(manuals));

  if (localStorage.getItem('fluent_disable_firestore_sync') === 'true') {
    console.log("[Firebase] Cloud writes are disabled by developer. Saved manuals to localStorage.");
    return;
  }
  if (isCloudWriteSuspended || localStorage.getItem('fluent_firestore_quota_exceeded') === 'true') {
    console.log("[Firebase] Cloud writes are suspended due to quota limitations.");
    return;
  }
  const path = 'system/developer_manuals';
  try {
    const updatedBy = auth.currentUser?.email || userId;
    await setDoc(doc(db, 'system', 'developer_manuals'), {
      ...manuals,
      updatedAt: new Date().toISOString(),
      updatedBy
    }, { merge: true });
  } catch (error: any) {
    const errStr = String(error?.message || error).toLowerCase();
    if (errStr.includes("resource-exhausted") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit exceeded") || error?.code === "resource-exhausted") {
      isCloudWriteSuspended = true;
      safeLocalStorageSet('fluent_firestore_quota_exceeded', 'true');
      console.warn("[Firebase] Detected Firestore write quota limit exceeded for manuals.");
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Reads developer manuals from global Firestore document /system/developer_manuals
 */
export async function fetchDeveloperManualsFromCloud(): Promise<DeveloperManuals | null> {
  // Try loading from localStorage if disabled or quota is exceeded
  if (localStorage.getItem('fluent_disable_firestore_sync') === 'true' || isCloudWriteSuspended || localStorage.getItem('fluent_firestore_quota_exceeded') === 'true') {
    const local = localStorage.getItem('fluent_developer_manuals');
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return {
      personality_manual: DEFAULT_PERSONALITY_MANUAL,
      reaction_manual: DEFAULT_REACTION_MANUAL,
      intimacy_manual: DEFAULT_INTIMACY_MANUAL,
      raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
      naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL
    };
  }

  const path = 'system/developer_manuals';
  try {
    const snap = await getDoc(doc(db, 'system', 'developer_manuals'));
    if (!snap.exists()) {
      const local = localStorage.getItem('fluent_developer_manuals');
      if (local) {
        try { return JSON.parse(local); } catch {}
      }
      return null;
    }
    const data = snap.data();
    const manuals = {
      personality_manual: data.personality_manual || '',
      reaction_manual: data.reaction_manual || '',
      intimacy_manual: data.intimacy_manual || '',
      raw_material_manual: data.raw_material_manual || '',
      naturalness_audit_manual: data.naturalness_audit_manual || '',
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy
    };
    // Cache locally
    safeLocalStorageSet('fluent_developer_manuals', JSON.stringify(manuals));
    return manuals;
  } catch (error: any) {
    const errStr = String(error?.message || error).toLowerCase();
    if (errStr.includes("resource-exhausted") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit exceeded") || error?.code === "resource-exhausted") {
      isCloudWriteSuspended = true;
      safeLocalStorageSet('fluent_firestore_quota_exceeded', 'true');
      console.warn("[Firebase] Detected Firestore read quota limit exceeded for manuals. Returning cached or default manuals.");
      const local = localStorage.getItem('fluent_developer_manuals');
      if (local) {
        try { return JSON.parse(local); } catch {}
      }
      return {
        personality_manual: DEFAULT_PERSONALITY_MANUAL,
        reaction_manual: DEFAULT_REACTION_MANUAL,
        intimacy_manual: DEFAULT_INTIMACY_MANUAL,
        raw_material_manual: DEFAULT_RAW_MATERIAL_MANUAL,
        naturalness_audit_manual: DEFAULT_NATURALNESS_AUDIT_MANUAL
      };
    }
    const local = localStorage.getItem('fluent_developer_manuals');
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

