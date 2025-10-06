// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

type EventType = "message.new" | "conversation.updated" | "keepalive";

interface Event {
	type: EventType;
	data: unknown;
}

type EventCallback = (event: Event) => void;

class EventManager {
	private eventSource: EventSource | null = null;
	private listeners: Set<EventCallback> = new Set();
	private reconnectTimeout: number | null = null;
	private reconnectAttempts = 0;
	private maxReconnectDelay = 30000;
	private baseReconnectDelay = 1000;
	private isIntentionallyClosed = false;

	start(): void {
		if (this.eventSource) {
			return;
		}

		this.isIntentionallyClosed = false;
		this.connect();
	}

	private connect(): void {
		const accessToken = localStorage.getItem("accessToken");
		if (!accessToken) {
			return;
		}

		const url = new URL("/api/events/stream", window.location.origin);
		url.searchParams.set("token", accessToken);

		this.eventSource = new EventSource(url.toString());

		this.eventSource.onopen = () => {
			this.reconnectAttempts = 0;
		};

		this.eventSource.onmessage = (evt) => {
			try {
				const event: Event = JSON.parse(evt.data);
				this.notifyListeners(event);
			} catch (error) {
				console.error("Failed to parse SSE event:", error);
			}
		};

		this.eventSource.onerror = () => {
			this.eventSource?.close();
			this.eventSource = null;

			if (!this.isIntentionallyClosed) {
				this.scheduleReconnect();
			}
		};
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimeout !== null) {
			return;
		}

		const delay = Math.min(
			this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
			this.maxReconnectDelay,
		);

		this.reconnectTimeout = window.setTimeout(() => {
			this.reconnectTimeout = null;
			this.reconnectAttempts++;
			this.connect();
		}, delay);
	}

	stop(): void {
		this.isIntentionallyClosed = true;

		if (this.reconnectTimeout !== null) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.reconnectAttempts = 0;
	}

	addListener(callback: EventCallback): () => void {
		this.listeners.add(callback);

		return () => {
			this.listeners.delete(callback);
		};
	}

	private notifyListeners(event: Event): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error("Error in event listener:", error);
			}
		}
	}

	getConnectionState(): "connected" | "connecting" | "disconnected" {
		if (!this.eventSource) {
			return "disconnected";
		}

		switch (this.eventSource.readyState) {
			case EventSource.CONNECTING:
				return "connecting";
			case EventSource.OPEN:
				return "connected";
			case EventSource.CLOSED:
				return "disconnected";
			default:
				return "disconnected";
		}
	}
}

export const eventManager = new EventManager();
export type { Event, EventCallback };
