import type { AppData, ChatMessage, Conversation } from './types'

const DB_NAME = 'food-app-db'
const DB_VERSION = 2
const STORE = 'store'
const KEY = 'app-data'
const CONVERSATIONS_STORE = 'conversations'
const CHAT_MESSAGES_STORE = 'chatMessages'
const LAST_ACTIVE_CONVERSATION_KEY = 'last-active-conversation-id'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('IndexedDB 打开超时，请关闭其他食光页面后重试'))
    }, 5_000)
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      reject(error)
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CHAT_MESSAGES_STORE)) {
        const messages = db.createObjectStore(CHAT_MESSAGES_STORE, { keyPath: 'id' })
        messages.createIndex('conversationId', 'conversationId')
      }
    }
    req.onblocked = () => fail(new Error('IndexedDB 升级被其他食光页面占用'))
    req.onsuccess = () => {
      if (settled) {
        req.result.close()
        return
      }
      settled = true
      window.clearTimeout(timeout)
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => fail(req.error ?? new Error('IndexedDB 打开失败'))
  })
}

export async function loadAll(): Promise<AppData | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function saveAll(data: AppData): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, KEY)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function clearAll(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, CONVERSATIONS_STORE, CHAT_MESSAGES_STORE], 'readwrite')
    tx.objectStore(STORE).clear()
    tx.objectStore(CONVERSATIONS_STORE).clear()
    tx.objectStore(CHAT_MESSAGES_STORE).clear()
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function loadConversations(): Promise<Conversation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(CONVERSATIONS_STORE, 'readonly').objectStore(CONVERSATIONS_STORE).getAll()
    req.onsuccess = () => {
      db.close()
      resolve((req.result as Conversation[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite')
    tx.objectStore(CONVERSATIONS_STORE).put(conversation)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function loadChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(CHAT_MESSAGES_STORE, 'readonly')
      .objectStore(CHAT_MESSAGES_STORE)
      .index('conversationId')
      .getAll(conversationId)
    req.onsuccess = () => {
      db.close()
      resolve((req.result as ChatMessage[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_MESSAGES_STORE, 'readwrite')
    tx.objectStore(CHAT_MESSAGES_STORE).put(message)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function loadLastActiveConversationId(): Promise<string | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(LAST_ACTIVE_CONVERSATION_KEY)
    req.onsuccess = () => { db.close(); resolve(typeof req.result === 'string' ? req.result : null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function saveLastActiveConversationId(conversationId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(conversationId, LAST_ACTIVE_CONVERSATION_KEY)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
