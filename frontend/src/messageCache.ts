// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

interface Message {
	id: number;
	conversationId: number;
	seq: number;
	senderId: number;
	senderUsername: string;
	senderProfileImageUrl: string | null;
	createdAt: string;
	editedAt?: string;
	contentType: string;
	body: string;
	replyToId?: number;
}

interface ConversationMeta {
	conversationId: number;
	lastSyncTimestamp: string;
	unreadCount: number;
}

interface CacheMeta {
	lastCleanupTimestamp: string;
}

const DB_NAME = "teamsync_cache";
const DB_VERSION = 1;
const MESSAGES_STORE = "messages";
const CONVERSATIONS_STORE = "conversations";
const META_STORE = "metadata";
const CACHE_RETENTION_DAYS = 30;

class MessageCache {
	private db: IDBDatabase | null = null;
	private initPromise: Promise<void> | null = null;

	async init(): Promise<void> {
		if (this.db) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				reject(new Error("Failed to open IndexedDB"));
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
					const messagesStore = db.createObjectStore(MESSAGES_STORE, {
						keyPath: "id",
					});
					messagesStore.createIndex("conversationId", "conversationId", {
						unique: false,
					});
					messagesStore.createIndex("createdAt", "createdAt", { unique: false });
					messagesStore.createIndex(
						"conversationId_createdAt",
						["conversationId", "createdAt"],
						{ unique: false },
					);
				}

				if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
					db.createObjectStore(CONVERSATIONS_STORE, {
						keyPath: "conversationId",
					});
				}

				if (!db.objectStoreNames.contains(META_STORE)) {
					db.createObjectStore(META_STORE, { keyPath: "key" });
				}
			};
		});

		return this.initPromise;
	}

	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initPromise = null;
		}
	}

	async saveMessages(messages: Message[]): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction([MESSAGES_STORE], "readwrite");
			const store = tx.objectStore(MESSAGES_STORE);

			for (const message of messages) {
				store.put(message);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getMessages(
		conversationId: number,
		limit?: number,
	): Promise<Message[]> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction([MESSAGES_STORE], "readonly");
			const store = tx.objectStore(MESSAGES_STORE);
			const index = store.index("conversationId_createdAt");
			const range = IDBKeyRange.bound(
				[conversationId, ""],
				[conversationId, "\uffff"],
			);

			const request = index.openCursor(range, "prev");
			const messages: Message[] = [];
			let count = 0;

			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest).result;
				if (cursor && (!limit || count < limit)) {
					messages.push(cursor.value);
					count++;
					cursor.continue();
				} else {
					resolve(messages.reverse());
				}
			};

			request.onerror = () => reject(request.error);
		});
	}

	async getMessagesAfter(
		conversationId: number,
		afterTimestamp: string,
	): Promise<Message[]> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction([MESSAGES_STORE], "readonly");
			const store = tx.objectStore(MESSAGES_STORE);
			const index = store.index("conversationId_createdAt");
			const range = IDBKeyRange.bound(
				[conversationId, afterTimestamp],
				[conversationId, "\uffff"],
				true,
				false,
			);

			const request = index.getAll(range);

			request.onsuccess = () => {
				const messages = request.result.sort(
					(a: Message, b: Message) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
				);
				resolve(messages);
			};

			request.onerror = () => reject(request.error);
		});
	}

	async updateConversationMeta(
		conversationId: number,
		meta: Partial<Omit<ConversationMeta, "conversationId">>,
	): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction([CONVERSATIONS_STORE], "readwrite");
			const store = tx.objectStore(CONVERSATIONS_STORE);

			const getRequest = store.get(conversationId);

			getRequest.onsuccess = () => {
				const existing = getRequest.result || {
					conversationId,
					lastSyncTimestamp: new Date(0).toISOString(),
					unreadCount: 0,
				};

				const updated = { ...existing, ...meta };
				store.put(updated);
			};

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getConversationMeta(
		conversationId: number,
	): Promise<ConversationMeta | null> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction([CONVERSATIONS_STORE], "readonly");
			const store = tx.objectStore(CONVERSATIONS_STORE);
			const request = store.get(conversationId);

			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	async cleanupOldMessages(): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		const metaTx = this.db.transaction([META_STORE], "readonly");
		const metaStore = metaTx.objectStore(META_STORE);
		const metaRequest = metaStore.get("cleanup");

		return new Promise((resolve, reject) => {
			metaRequest.onsuccess = () => {
				const meta: CacheMeta | undefined = metaRequest.result?.value;
				const now = new Date();
				const lastCleanup = meta
					? new Date(meta.lastCleanupTimestamp)
					: new Date(0);
				const daysSinceCleanup =
					(now.getTime() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24);

				if (daysSinceCleanup < 1) {
					resolve();
					return;
				}

				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - CACHE_RETENTION_DAYS);
				const cutoffTimestamp = cutoffDate.toISOString();

				const tx = this.db!.transaction(
					[MESSAGES_STORE, META_STORE],
					"readwrite",
				);
				const messagesStore = tx.objectStore(MESSAGES_STORE);
				const index = messagesStore.index("createdAt");
				const range = IDBKeyRange.upperBound(cutoffTimestamp);

				const request = index.openCursor(range);
				request.onsuccess = (event) => {
					const cursor = (event.target as IDBRequest).result;
					if (cursor) {
						cursor.delete();
						cursor.continue();
					}
				};

				tx.oncomplete = () => {
					const updateMetaTx = this.db!.transaction([META_STORE], "readwrite");
					const updateMetaStore = updateMetaTx.objectStore(META_STORE);
					updateMetaStore.put({
						key: "cleanup",
						value: { lastCleanupTimestamp: now.toISOString() },
					});

					updateMetaTx.oncomplete = () => resolve();
					updateMetaTx.onerror = () => reject(updateMetaTx.error);
				};

				tx.onerror = () => reject(tx.error);
			};

			metaRequest.onerror = () => reject(metaRequest.error);
		});
	}

	async clearConversation(conversationId: number): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(
				[MESSAGES_STORE, CONVERSATIONS_STORE],
				"readwrite",
			);
			const messagesStore = tx.objectStore(MESSAGES_STORE);
			const conversationsStore = tx.objectStore(CONVERSATIONS_STORE);
			const index = messagesStore.index("conversationId");
			const range = IDBKeyRange.only(conversationId);

			const request = index.openCursor(range);
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest).result;
				if (cursor) {
					cursor.delete();
					cursor.continue();
				}
			};

			conversationsStore.delete(conversationId);

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async clearAll(): Promise<void> {
		await this.init();
		if (!this.db) throw new Error("Database not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(
				[MESSAGES_STORE, CONVERSATIONS_STORE, META_STORE],
				"readwrite",
			);

			tx.objectStore(MESSAGES_STORE).clear();
			tx.objectStore(CONVERSATIONS_STORE).clear();
			tx.objectStore(META_STORE).clear();

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}

export const messageCache = new MessageCache();
export type { Message, ConversationMeta };
