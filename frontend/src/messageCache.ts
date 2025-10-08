// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Conversation, Message } from "./chatUtils";

interface StoredConversation extends Conversation {
	lastSyncTimestamp: string;
}

interface CacheMetaValue {
	lastCleanupTimestamp: string;
}

interface MetadataRecord<T = unknown> {
	key: string;
	value: T;
}

interface TeamSyncDB extends DBSchema {
	messages: {
		key: number;
		value: Message;
		indexes: {
			conversationId: number;
			createdAt: string;
			"conversationId_createdAt": [number, string];
		};
	};
	conversations: {
		key: number;
		value: StoredConversation;
	};
	metadata: {
		key: string;
		value: MetadataRecord;
	};
}

const DB_NAME = "teamsync_cache";
const DB_VERSION = 2;
const MESSAGES_STORE = "messages";
const CONVERSATIONS_STORE = "conversations";
const META_STORE = "metadata";
const CACHE_RETENTION_DAYS = 30;

class MessageCache {
	private db: IDBPDatabase<TeamSyncDB> | null = null;
	private initPromise: Promise<IDBPDatabase<TeamSyncDB>> | null = null;

	private async ensureDb(): Promise<IDBPDatabase<TeamSyncDB>> {
		if (this.db) {
			return this.db;
		}

		if (!this.initPromise) {
			this.initPromise = openDB<TeamSyncDB>(DB_NAME, DB_VERSION, {
				upgrade(db, oldVersion) {
					if (oldVersion < 1) {
						const messagesStore = db.createObjectStore(MESSAGES_STORE, {
							keyPath: "id",
						});
						messagesStore.createIndex("conversationId", "conversationId", {
							unique: false,
						});
						messagesStore.createIndex("createdAt", "createdAt", {
							unique: false,
						});
						messagesStore.createIndex("conversationId_createdAt", ["conversationId", "createdAt"], {
							unique: false,
						});

						db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
						db.createObjectStore(META_STORE, { keyPath: "key" });
						return;
					}

					if (oldVersion < 2) {
						if (db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
							db.deleteObjectStore(CONVERSATIONS_STORE);
						}
						db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
					}
				},
			});
		}

		this.db = await this.initPromise;
		return this.db;
	}

	async init(): Promise<void> {
		await this.ensureDb();
	}

	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initPromise = null;
		}
	}

	async saveConversations(
		conversations: (Conversation & { lastSyncTimestamp?: string })[],
	): Promise<void> {
		if (conversations.length === 0) {
			return;
		}

		const db = await this.ensureDb();
		const tx = db.transaction(CONVERSATIONS_STORE, "readwrite");
		const store = tx.store;

		for (const conversation of conversations) {
			const existing = await store.get(conversation.id);
			const record: StoredConversation = {
				...existing,
				...conversation,
				id: conversation.id,
				lastSyncTimestamp:
					conversation.lastSyncTimestamp ??
					existing?.lastSyncTimestamp ??
					new Date(0).toISOString(),
			};
			await store.put(record);
		}

		await tx.done;
	}

	async getConversations(): Promise<StoredConversation[]> {
		const db = await this.ensureDb();
		return db.getAll(CONVERSATIONS_STORE);
	}

	async getConversation(conversationId: number): Promise<StoredConversation | null> {
		const db = await this.ensureDb();
		const record = await db.get(CONVERSATIONS_STORE, conversationId);
		return record ?? null;
	}

	async updateConversationMeta(
		conversationId: number,
		meta: Partial<Pick<StoredConversation, "lastSyncTimestamp" | "unreadCount" | "lastMessageSeq">>,
	): Promise<void> {
		const db = await this.ensureDb();
		const tx = db.transaction(CONVERSATIONS_STORE, "readwrite");
		const store = tx.store;
		const existing = (await store.get(conversationId)) ?? null;

		if (!existing) {
			const record: StoredConversation = {
				id: conversationId,
				type: "group",
				name: null,
				lastMessageSeq: meta.lastMessageSeq ?? 0,
				unreadCount: meta.unreadCount ?? 0,
				lastSyncTimestamp: meta.lastSyncTimestamp ?? new Date(0).toISOString(),
			};
			await store.put(record);
			await tx.done;
			return;
		}

		const updated: StoredConversation = {
			...existing,
			...meta,
			lastSyncTimestamp: meta.lastSyncTimestamp ?? existing.lastSyncTimestamp,
			unreadCount: meta.unreadCount ?? existing.unreadCount,
			lastMessageSeq: meta.lastMessageSeq ?? existing.lastMessageSeq,
		};

		await store.put(updated);
		await tx.done;
	}

	async saveMessages(messages: Message[]): Promise<void> {
		if (messages.length === 0) {
			return;
		}

		const db = await this.ensureDb();
		const tx = db.transaction(MESSAGES_STORE, "readwrite");
		const store = tx.store;

		for (const message of messages) {
			await store.put(message);
		}

		await tx.done;
	}

	async getMessage(messageId: number): Promise<Message | undefined> {
		const db = await this.ensureDb();
		return (await db.get(MESSAGES_STORE, messageId)) ?? undefined;
	}

	async getMessages(
		conversationId: number,
		limit?: number,
	): Promise<Message[]> {
		const db = await this.ensureDb();
		const tx = db.transaction(MESSAGES_STORE, "readonly");
		const index = tx.store.index("conversationId_createdAt");
		const range = IDBKeyRange.bound(
			[conversationId, ""],
			[conversationId, "\uffff"],
		);

		const messages: Message[] = [];
		let cursor = await index.openCursor(range, "prev");

		while (cursor && (!limit || messages.length < limit)) {
			messages.push(cursor.value);
			cursor = await cursor.continue();
		}

		await tx.done;
		return messages.reverse();
	}

	async getMessagesAfter(
		conversationId: number,
		afterTimestamp: string,
	): Promise<Message[]> {
		const db = await this.ensureDb();
		const tx = db.transaction(MESSAGES_STORE, "readonly");
		const index = tx.store.index("conversationId_createdAt");
		const range = IDBKeyRange.bound(
			[conversationId, afterTimestamp],
			[conversationId, "\uffff"],
			true,
			false,
		);

		const results = await index.getAll(range);
		await tx.done;
		return results.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
	}

	async getMessagesBefore(
		conversationId: number,
		beforeTimestamp: string,
		limit: number = 50,
	): Promise<Message[]> {
		const db = await this.ensureDb();
		const tx = db.transaction(MESSAGES_STORE, "readonly");
		const index = tx.store.index("conversationId_createdAt");
		const range = IDBKeyRange.bound(
			[conversationId, ""],
			[conversationId, beforeTimestamp],
			false,
			true,
		);

		const messages: Message[] = [];
		let cursor = await index.openCursor(range, "prev");

		while (cursor && messages.length < limit) {
			messages.push(cursor.value);
			cursor = await cursor.continue();
		}

		await tx.done;
		return messages.reverse();
	}

	async cleanupOldMessages(): Promise<void> {
		const db = await this.ensureDb();
		const metaEntry = (await db.get(META_STORE, "cleanup")) as
			| MetadataRecord<CacheMetaValue>
			| undefined;

		const now = new Date();
		const lastCleanup = metaEntry?.value
			? new Date(metaEntry.value.lastCleanupTimestamp)
			: new Date(0);
		const daysSinceCleanup =
			(now.getTime() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24);

		if (daysSinceCleanup < 1) {
			return;
		}

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - CACHE_RETENTION_DAYS);
		const cutoffTimestamp = cutoffDate.toISOString();

		const tx = db.transaction([MESSAGES_STORE, META_STORE], "readwrite");
		const messagesIndex = tx.objectStore(MESSAGES_STORE).index("createdAt");

		let cursor = await messagesIndex.openCursor(IDBKeyRange.upperBound(cutoffTimestamp));
		while (cursor) {
			await cursor.delete();
			cursor = await cursor.continue();
		}

		await tx.objectStore(META_STORE).put({
			key: "cleanup",
			value: { lastCleanupTimestamp: now.toISOString() },
		});

		await tx.done;
	}

	async clearConversation(conversationId: number): Promise<void> {
		const db = await this.ensureDb();
		const tx = db.transaction([MESSAGES_STORE, CONVERSATIONS_STORE], "readwrite");
		const messagesIndex = tx.objectStore(MESSAGES_STORE).index("conversationId");

		let cursor = await messagesIndex.openCursor(IDBKeyRange.only(conversationId));
		while (cursor) {
			await cursor.delete();
			cursor = await cursor.continue();
		}

		await tx.objectStore(CONVERSATIONS_STORE).delete(conversationId);
		await tx.done;
	}

	async clearAll(): Promise<void> {
		const db = await this.ensureDb();
		const tx = db.transaction(
			[MESSAGES_STORE, CONVERSATIONS_STORE, META_STORE],
			"readwrite",
		);

		await tx.objectStore(MESSAGES_STORE).clear();
		await tx.objectStore(CONVERSATIONS_STORE).clear();
		await tx.objectStore(META_STORE).clear();

		await tx.done;
	}

	async getLastMessageId(): Promise<number> {
		const db = await this.ensureDb();
		const tx = db.transaction(MESSAGES_STORE, "readonly");
		const cursor = await tx.store.openCursor(null, "prev");
		await tx.done;
		if (!cursor) {
			return 0;
		}
		const key = cursor.key;
		return typeof key === "number" ? key : Number(key);
	}
}

export const messageCache = new MessageCache();
export type { StoredConversation };
