// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

export interface Conversation {
	id: number;
	type: string;
	name: string | null;
	lastMessageSeq: number;
	unreadCount: number;
	otherUser?: {
		id: number;
		username: string;
		profileImageUrl: string | null;
	};
}

export interface Message {
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

export function getConversationName(conv: Conversation): string {
	if (conv.type === "dm" && conv.otherUser) {
		return conv.otherUser.username;
	}
	return conv.name || "Unnamed conversation";
}

export function formatMessageTime(timestamp: string): string {
	const messageDate = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - messageDate.getTime();
	const diffHours = diffMs / (1000 * 60 * 60);

	if (diffHours < 24) {
		const diffMinutes = Math.floor(diffMs / (1000 * 60));

		if (diffMinutes < 1) {
			return "just now";
		} else if (diffMinutes < 60) {
			return `${diffMinutes}m ago`;
		} else {
			const hours = Math.floor(diffMinutes / 60);
			return `${hours}h ago`;
		}
	}

	return messageDate.toLocaleString();
}

export function sortConversationsByLastMessage<T extends Conversation>(
	conversations: T[],
): T[] {
	return [...conversations].sort((a, b) => b.lastMessageSeq - a.lastMessageSeq);
}

export function updateConversationUnreadCount(
	conversations: Conversation[],
	conversationId: number,
	unreadCount: number,
): Conversation[] {
	return conversations.map((conv) =>
		conv.id === conversationId ? { ...conv, unreadCount } : conv,
	);
}

export function updateConversationLastMessage(
	conversations: Conversation[],
	conversationId: number,
	seq: number,
): Conversation[] {
	return conversations.map((conv) =>
		conv.id === conversationId
			? { ...conv, lastMessageSeq: seq, unreadCount: 0 }
			: conv,
	);
}

export function checkShouldScroll(container: HTMLDivElement): boolean {
	const scrollThreshold = 32;
	const distanceFromBottom =
		container.scrollHeight - container.scrollTop - container.clientHeight;

	return distanceFromBottom <= scrollThreshold;
}

export function scrollToBottom(container: HTMLDivElement): void {
	container.scrollTo({
		top: container.scrollHeight,
		behavior: "smooth",
	});
}

export function isTouchDevice(): boolean {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
