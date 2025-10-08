// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import type { Conversation, Message } from "./chatUtils";

function getAuthHeaders(): HeadersInit {
	const accessToken = localStorage.getItem("accessToken");
	return {
		Authorization: `Bearer ${accessToken}`,
	};
}

function getAuthHeadersWithJson(): HeadersInit {
	return {
		...getAuthHeaders(),
		"Content-Type": "application/json",
	};
}

export async function fetchConversations(): Promise<Conversation[]> {
	const response = await fetch("/api/conversations", {
		headers: getAuthHeaders(),
	});

	if (!response.ok) {
		throw new Error("Failed to fetch conversations");
	}

	const data = await response.json();
	return data || [];
}

export async function fetchMessages(
	conversationId: number,
	since: string,
): Promise<Message[]> {
	const response = await fetch(
		`/api/messages?conversationId=${conversationId}&since=${encodeURIComponent(since)}`,
		{
			headers: getAuthHeaders(),
		},
	);

	if (!response.ok) {
		throw new Error("Failed to fetch messages");
	}

	const data = await response.json();
	return data || [];
}

export async function fetchOlderMessages(
	conversationId: number,
	before: string,
	limit: number = 50,
): Promise<Message[]> {
	const response = await fetch(
		`/api/messages?conversationId=${conversationId}&before=${encodeURIComponent(before)}&limit=${limit}`,
		{
			headers: getAuthHeaders(),
		},
	);

	if (!response.ok) {
		throw new Error("Failed to fetch older messages");
	}

	const data = await response.json();
	return data || [];
}

export async function sendMessage(
	conversationId: number,
	body: string,
): Promise<Message> {
	const response = await fetch("/api/messages/send", {
		method: "POST",
		headers: getAuthHeadersWithJson(),
		body: JSON.stringify({
			conversationId,
			body,
		}),
	});

	if (!response.ok) {
		throw new Error("Failed to send message");
	}

	return response.json();
}

export async function markAsRead(
	conversationId: number,
	lastReadSeq: number,
): Promise<void> {
	const response = await fetch("/api/messages/read", {
		method: "POST",
		headers: getAuthHeadersWithJson(),
		body: JSON.stringify({
			conversationId,
			lastReadSeq,
		}),
	});

	if (!response.ok) {
		throw new Error("Failed to update read state");
	}
}

export async function createDirectConversation(
	otherUserId: number,
): Promise<Conversation> {
	const response = await fetch("/api/conversations/dm", {
		method: "POST",
		headers: getAuthHeadersWithJson(),
		body: JSON.stringify({ otherUserId }),
	});

	if (!response.ok) {
		throw new Error("Failed to create conversation");
	}

	return response.json();
}

export interface UserSearchResult {
	id: number;
	username: string;
	displayName: string;
	profileImageUrl: string | null;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
	const response = await fetch(
		`/api/users/search?q=${encodeURIComponent(query)}`,
		{
			headers: getAuthHeaders(),
		},
	);

	if (!response.ok) {
		throw new Error("Failed to search users");
	}

	const data = await response.json();
	return data || [];
}

export async function fetchChatSettings(): Promise<{
	enterSendsMessage: boolean;
	markdownEnabled: boolean;
}> {
	const response = await fetch("/api/settings/chat", {
		headers: getAuthHeaders(),
	});

	if (!response.ok) {
		throw new Error("Failed to fetch chat settings");
	}

	return response.json();
}

export async function startCall(
	conversationId: number,
): Promise<{ callId: number; messageId: number }> {
	const response = await fetch("/api/calls/start", {
		method: "POST",
		headers: getAuthHeadersWithJson(),
		body: JSON.stringify({ conversationId }),
	});

	if (!response.ok) {
		throw new Error("startCall: Failed to start call");
	}

	const result = await response.json();
	localStorage.setItem(`call_initiator_${result.messageId}`, "true");
	return result;
}

export async function getCallStatus(
	messageId: number,
): Promise<{ active: boolean }> {
	const response = await fetch(`/api/calls/status?messageId=${messageId}`, {
		headers: getAuthHeaders(),
	});

	if (!response.ok) {
		throw new Error("Failed to get call status");
	}

	return response.json();
}
