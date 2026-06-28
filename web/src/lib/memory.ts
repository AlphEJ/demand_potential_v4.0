// DPU 记忆层：6 层记忆的 IndexedDB 持久化实现
// L1 原始痕迹 · L2 原子事实 · L3 身份画像 · L4 会话摘要 · L5 心智模型 · L6 前瞻意图

import { NEED_NAMES, NEED_LAYERS, LEVEL_WEIGHTS } from './needs-const'

// ---------- 数据结构 ----------

export interface NeedSnapshot {
  need_id: number
  potential: number // 势能 0~1
  layer: number
}

export interface MemoryEntry {
  id: string
  timestamp: number
  // L1 原始痕迹
  raw_text: string
  role: 'user' | 'assistant'
  session_id?: string        // 来自 Agent 页面的会话 ID（区分不同对话）
  // L2 原子事实
  needs: NeedSnapshot[]
  top_need_ids: number[]
  has_conflict: boolean
  conflict_pair?: [number, number]
  emotional_tone: string
  // L3 画像增量（本次对话后，用户长期权重的变化）
  profile_delta: number[]
}

export interface UserProfile {
  weights: number[] // 12 维长期权重
  interaction_count: number
  first_interaction_at: number
  last_interaction_at: number
  // 跨会话的需求分布统计
  activation_counts: number[] // 各需求被激活次数
  co_occurrence_matrix: number[][] // 12×12 需求共现
  // L5 心智模型：主要决策模式
  decision_patterns: { name: string; strength: number; evidence: string }[]
  // L6 前瞻意图
  anticipated_next_needs: number[]
}

const DEFAULT_PROFILE: UserProfile = {
  weights: LEVEL_WEIGHTS.map(w => w * 0.3),
  interaction_count: 0,
  first_interaction_at: Date.now(),
  last_interaction_at: Date.now(),
  activation_counts: new Array(12).fill(0),
  co_occurrence_matrix: Array.from({ length: 12 }, () => new Array(12).fill(0)),
  decision_patterns: [],
  anticipated_next_needs: [],
}

// ---------- IndexedDB 简易封装 ----------

const DB_NAME = 'dpu_memory_v1'
const DB_VERSION = 1
const STORE_ENTRIES = 'entries'
const STORE_PROFILE = 'profile'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        db.createObjectStore(STORE_PROFILE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function dbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  }))
}

function dbPut<T>(store: string, value: T): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function dbClear(store: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function dbGetAll<T>(store: string): Promise<T[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  }))
}

// ---------- 内存 fallback（浏览器不支持 IndexedDB 时）----------

const memEntries: MemoryEntry[] = []
let memProfile: UserProfile = { ...DEFAULT_PROFILE }

// ---------- 主 API ----------

export async function getProfile(): Promise<UserProfile> {
  try {
    const stored = await dbGet<{ key: string; profile: UserProfile }>(STORE_PROFILE, 'main')
    if (stored?.profile) return stored.profile
  } catch {
    // 忽略
  }
  return memProfile
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  memProfile = profile
  try {
    await dbPut(STORE_PROFILE, { key: 'main', profile })
  } catch {}
}

export async function addEntry(entry: MemoryEntry): Promise<void> {
  memEntries.push(entry)
  if (memEntries.length > 500) memEntries.shift()
  try {
    await dbPut(STORE_ENTRIES, entry)
  } catch {}
}

export async function getAllEntries(): Promise<MemoryEntry[]> {
  try {
    const entries = await dbGetAll<MemoryEntry>(STORE_ENTRIES)
    return entries.sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return [...memEntries]
  }
}

export async function getRecentEntries(limit = 30): Promise<MemoryEntry[]> {
  const all = await getAllEntries()
  return all.slice(-limit)
}

export async function resetAllMemory(): Promise<void> {
  try {
    await dbClear(STORE_ENTRIES)
    await dbClear(STORE_PROFILE)
  } catch {}
  memEntries.length = 0
  memProfile = { ...DEFAULT_PROFILE, activation_counts: new Array(12).fill(0), co_occurrence_matrix: Array.from({ length: 12 }, () => new Array(12).fill(0)) }
  // 同步清理 localStorage 对话历史
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KEY_MESSAGES)
    }
  } catch {}
}

// ---------- 对话历史的 localStorage 持久化 ----------
// （比 IndexedDB 简单，且 messages 对象里含复杂 demands 数据，JSON 化存 localStorage 足够）

const LS_KEY_MESSAGES = 'dpu_agent_messages_v1'

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  demands?: any // ExtendedAnalysis JSON 化存
  timestamp: number
  method_label?: string
  tone?: string
  summary?: string
}

export function saveMessagesToStorage(messages: PersistedMessage[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(messages))
  } catch (e) {
    console.warn('[DPU Memory] 保存对话失败', e)
  }
}

export function loadMessagesFromStorage(): PersistedMessage[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY_MESSAGES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.warn('[DPU Memory] 恢复对话失败', e)
    return []
  }
}

export function clearMessagesStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KEY_MESSAGES)
    }
  } catch {}
}

// ---------- 画像更新逻辑 ----------

export function updateProfileWithEntry(profile: UserProfile, entry: MemoryEntry): UserProfile {
  const learningRate = Math.max(0.08, 0.35 - profile.interaction_count * 0.005)
  const decay = 0.9
  const nextWeights = profile.weights.map((w, i) => {
    // 找到本次激活值
    const snap = entry.needs.find(n => n.need_id === i)
    const activation = snap?.potential ?? (entry.top_need_ids.includes(i) ? 0.4 : 0.05)
    const decayed = w * decay
    const newInfo = activation * learningRate
    return Math.min(1.0, decayed + newInfo)
  })
  // 激活计数
  const activationCounts = profile.activation_counts.slice()
  entry.top_need_ids.forEach(id => { activationCounts[id] += 1 })
  // 共现矩阵
  const coMat = profile.co_occurrence_matrix.map(row => row.slice())
  for (const a of entry.top_need_ids) {
    for (const b of entry.top_need_ids) {
      if (a !== b) coMat[a][b] += 1
    }
  }
  const newPatterns = deriveDecisionPatterns(profile, entry)
  const anticipated = anticipateNeeds(profile, entry)
  return {
    ...profile,
    weights: nextWeights,
    interaction_count: profile.interaction_count + 1,
    last_interaction_at: entry.timestamp,
    activation_counts: activationCounts,
    co_occurrence_matrix: coMat,
    decision_patterns: newPatterns,
    anticipated_next_needs: anticipated,
  }
}

function deriveDecisionPatterns(
  profile: UserProfile,
  entry: MemoryEntry,
): { name: string; strength: number; evidence: string }[] {
  const patterns = [...profile.decision_patterns]
  // 简单启发式：检测"安全 ↔ 自由"冲突模式
  if (entry.conflict_pair) {
    const [a, b] = entry.conflict_pair
    const name = `${NEED_NAMES[a]} ↔ ${NEED_NAMES[b]} 矛盾`
    const existing = patterns.find(p => p.name === name)
    if (existing) {
      existing.strength = Math.min(1, existing.strength + 0.15)
      existing.evidence = `第 ${profile.interaction_count + 1} 轮出现此模式`
    } else {
      patterns.push({ name, strength: 0.3, evidence: `首次在第 ${profile.interaction_count + 1} 轮发现` })
    }
  }
  // 按强度排序，保留前 6 个
  patterns.sort((a, b) => b.strength - a.strength)
  return patterns.slice(0, 6)
}

function anticipateNeeds(profile: UserProfile, entry: MemoryEntry): number[] {
  // 简单启发：最近激活过的需求中，与顶层需求协同的需求可能是下一步方向
  const active = entry.top_need_ids
  if (active.length === 0) return []
  // 取最高层需求的相邻层
  const maxLayer = Math.max(...active.map(id => NEED_LAYERS[id]))
  const candidates: { id: number; score: number }[] = []
  for (let i = 0; i < 12; i++) {
    if (active.includes(i)) continue
    const layer = NEED_LAYERS[i]
    if (Math.abs(layer - maxLayer) <= 1) {
      const score = profile.weights[i] + 0.1 * profile.activation_counts[i] / Math.max(1, profile.interaction_count)
      candidates.push({ id: i, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 3).map(c => c.id)
}

// ---------- 工具：构建一条记忆条目 ----------

export interface AnalyzeInput {
  text: string
  ranking: { need_id: number; potential: number; layer_level: number }[]
  has_conflict?: boolean
  conflict_pair?: [number, number]
  emotional_tone?: string
  role?: 'user' | 'assistant'
  session_id?: string
}

export function buildMemoryEntry(input: AnalyzeInput): MemoryEntry {
  const needs: NeedSnapshot[] = input.ranking.map(r => ({
    need_id: r.need_id,
    potential: r.potential,
    layer: r.layer_level,
  }))
  const top = input.ranking.slice(0, 5).map(r => r.need_id)
  return {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    raw_text: input.text,
    role: input.role || 'user',
    needs,
    top_need_ids: top,
    has_conflict: !!input.has_conflict,
    conflict_pair: input.conflict_pair,
    emotional_tone: input.emotional_tone || '其他',
    profile_delta: new Array(12).fill(0),
    session_id: input.session_id,
  }
}

// ---------- 演化时间线（给图表用）----------

export async function getTimeLineData(limit = 50): Promise<{
  times: number[]
  labels: string[]
  curves: { need_id: number; need_name: string; values: number[] }[]
  profile: UserProfile
}> {
  const entries = (await getAllEntries()).slice(-limit)
  const times = entries.map(e => e.timestamp)
  const labels = entries.map((_, i) => `#${i + 1}`)
  // 选 top 4 长期权重最高的需求
  const profile = await getProfile()
  const top4 = profile.weights
    .map((w, i) => ({ id: i, w }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 4)
    .map(x => x.id)
  const curves = top4.map(id => ({
    need_id: id,
    need_name: NEED_NAMES[id],
    values: entries.map(e => {
      const snap = e.needs.find(n => n.need_id === id)
      return snap?.potential ?? 0
    }),
  }))
  return { times, labels, curves, profile }
}
