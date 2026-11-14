import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export type GameModeLabel = 'Emoji' | 'Anime' | 'Баатар';

export interface SaveScoreInput {
  name: string;
  score: number;
  mode: string;
}

export interface ScoreRecord {
  id: string;
  name: string;
  score: number;
  game: string;
  mode: string;
  createdAt: string;
}

const ALLOWED_MODES = new Set<string>(['Emoji', 'Anime', 'Баатар']);

export async function saveScore(input: SaveScoreInput): Promise<string> {
  const cleanName = String(input.name || '').trim().slice(0, 40);
  if (!cleanName) {
    throw new Error('Тоглогчийн нэрээ оруулна уу.');
  }

  const numericScore = Math.max(0, Math.min(2000, Math.round(Number(input.score) || 0)));
  const cleanMode = ALLOWED_MODES.has(input.mode) ? input.mode : 'Emoji';

  const path = 'scores';
  try {
    const docRef = await addDoc(collection(db, path), {
      name: cleanName,
      score: numericScore,
      game: 'Anime Guess',
      mode: cleanMode,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

function formatDate(ts: unknown): string {
  if (ts instanceof Timestamp) {
    const d = ts.toDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return '';
}

export interface LeaderboardsByMode {
  Emoji: ScoreRecord[];
  Anime: ScoreRecord[];
  Баатар: ScoreRecord[];
  all: ScoreRecord[];
}

function dedupeByName(records: ScoreRecord[]): ScoreRecord[] {
  const seen = new Set<string>();
  const unique: ScoreRecord[] = [];
  for (const r of records) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return unique;
}

export async function fetchTopScores(maxCount = 5, modeFilter?: string): Promise<ScoreRecord[]> {
  const path = 'scores';
  try {
    const fetchLimit = Math.max(100, maxCount * 5);
    const q = query(
      collection(db, path),
      where('score', '>=', 0),
      orderBy('score', 'desc'),
      limit(fetchLimit)
    );
    const snap = await getDocs(q);
    const rows: ScoreRecord[] = snap.docs
      .filter((docSnap) => docSnap.id !== 'yER1U99ogb4Eexr5xlIP')
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: String(data.name || ''),
          score: Number(data.score || 0),
          game: String(data.game || 'Anime Guess'),
          mode: String(data.mode || ''),
          createdAt: formatDate(data.createdAt),
        };
      });
    if (modeFilter) {
      return dedupeByName(rows.filter((r) => r.mode === modeFilter)).slice(0, maxCount);
    }
    return rows.slice(0, maxCount);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchLeaderboardsByMode(perMode = 5): Promise<LeaderboardsByMode> {
  const allRows = await fetchTopScores(100);
  return {
    Emoji: dedupeByName(allRows.filter((r) => r.mode === 'Emoji')).slice(0, perMode),
    Anime: dedupeByName(allRows.filter((r) => r.mode === 'Anime')).slice(0, perMode),
    Баатар: dedupeByName(allRows.filter((r) => r.mode === 'Баатар')).slice(0, perMode),
    all: dedupeByName(allRows).slice(0, perMode),
  };
}

declare global {
  interface Window {
    AnimeGuessScores?: {
      saveScore: typeof saveScore;
      fetchTopScores: typeof fetchTopScores;
      fetchLeaderboardsByMode: typeof fetchLeaderboardsByMode;
    };
  }
}

window.AnimeGuessScores = {
  saveScore,
  fetchTopScores,
  fetchLeaderboardsByMode,
};
window.dispatchEvent(new Event('anime-scores-ready'));
