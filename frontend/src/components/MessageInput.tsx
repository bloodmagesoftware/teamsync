// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { fetchChatSettings } from "../chatApi";
import { isTouchDevice } from "../chatUtils";
import { Send } from "react-feather";

export function MessageInput({
	onSend,
}: {
	onSend: (message: string) => void;
}) {
	const [message, setMessage] = useState("");
	const [enterSendsMessage, setEnterSendsMessage] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		loadChatSettings();
	}, []);

	const loadChatSettings = async () => {
		try {
			const data = await fetchChatSettings();
			setEnterSendsMessage(data.enterSendsMessage);
		} catch (error) {
			console.error("Failed to fetch chat settings:", error);
		}
	};

	const sendMessage = () => {
		if (!message.trim()) return;

		onSend(message);
		setMessage("");

		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (isTouchDevice()) {
			return;
		}

		if (enterSendsMessage) {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		} else {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				sendMessage();
			}
		}
	};

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const target = e.target as HTMLTextAreaElement;
		setMessage(target.value);

		target.style.height = "auto";
		target.style.height = Math.min(target.scrollHeight, 200) + "px";
	};

	return (
		<div className="border-t border-ctp-surface0 p-4">
			<div className="flex gap-2">
				<textarea
					ref={textareaRef}
					value={message}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					placeholder="Type a message..."
					className="flex-1 resize-none bg-ctp-surface0 text-ctp-text rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ctp-blue min-h-[40px] max-h-[200px]"
					rows={1}
				/>
				<button
					onClick={sendMessage}
					disabled={!message.trim()}
					className="px-4 py-2 bg-ctp-blue text-ctp-base rounded not-disabled:hover:bg-ctp-sapphire disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Send className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
