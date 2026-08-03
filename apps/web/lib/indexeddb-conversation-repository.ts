import type { Conversation } from "@heather/core";
import type { ConversationType } from "./conversations/types";

const DATABASE_NAME = "heather-conversation-storage";
const DATABASE_VERSION = 1;
const STORE_NAME = "conversations";
const TYPE_INDEX = "conversation_type";

type StoredConversation = Conversation & {
  conversationType: ConversationType;
  archived?: boolean;
};

export class IndexedDbConversationRepository {
  async list(type: ConversationType): Promise<Conversation[]> {
    const database = await openDatabase();
    const rows = await request<StoredConversation[]>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index(TYPE_INDEX).getAll(type)
    );
    database.close();
    return rows
      .filter((conversation) => !conversation.archived)
      .sort((left, right) => timestamp(right).localeCompare(timestamp(left)));
  }

  async get(id: string, type: ConversationType): Promise<Conversation | null> {
    const database = await openDatabase();
    const row = await request<StoredConversation | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id)
    );
    database.close();
    return row && row.conversationType === type && !row.archived ? row : null;
  }

  async save(conversation: Conversation, type: ConversationType): Promise<Conversation> {
    const stored: StoredConversation = {
      ...conversation,
      conversationType: type,
      archived: false
    };
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(stored);
    await transactionDone(transaction);
    database.close();
    return stored;
  }

  async archive(id: string, type: ConversationType): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const current = await request<StoredConversation | undefined>(store.get(id));
    if (current?.conversationType === type) store.delete(id);
    await transactionDone(transaction);
    database.close();
  }

  async clear(type?: ConversationType): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (!type) {
      store.clear();
    } else {
      const keys = await request<IDBValidKey[]>(store.index(TYPE_INDEX).getAllKeys(type));
      keys.forEach((key) => store.delete(key));
    }
    await transactionDone(transaction);
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available."));
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    opening.onerror = () => reject(opening.error || new Error("IndexedDB could not be opened."));
    opening.onupgradeneeded = () => {
      const database = opening.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? opening.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains(TYPE_INDEX)) store.createIndex(TYPE_INDEX, "conversationType", { unique: false });
    };
    opening.onsuccess = () => resolve(opening.result);
  });
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error || new Error("IndexedDB operation failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
  });
}

function timestamp(conversation: Conversation) {
  return conversation.updatedAt || conversation.createdAt || "";
}
