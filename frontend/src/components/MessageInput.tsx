// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { useUserSettings } from "../UserSettingsContext";
import { isTouchDevice } from "../chatUtils";
import { Send } from "react-feather";
import { MarkdownEditor } from "./MarkdownEditor";

export function MessageInput({
	onSend,
}: {
	onSend: (message: string) => void;
}) {
	const [message, setMessage] = useState("");
	const { settings } = useUserSettings();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const enterSendsMessage = settings?.enterSendsMessage ?? false;
	const markdownEnabled = settings?.markdownEnabled ?? false;

	const sendMessage = useCallback(() => {
		if (!message.trim()) return;

		onSend(message);
		setMessage("");

		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [message, onSend]);

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
				{markdownEnabled ? (
					<MarkdownEditor
						value={message}
						onChange={setMessage}
						onSend={sendMessage}
						enterSends={enterSendsMessage}
						placeholder="Type a message..."
					/>
				) : (
					<textarea
						ref={textareaRef}
						value={message}
						onChange={handleInput}
						onKeyDown={handleKeyDown}
						placeholder="Type a message..."
						className="flex-1 resize-none bg-ctp-surface0 text-ctp-text rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ctp-blue min-h-[40px] max-h-[200px]"
						rows={1}
					/>
				)}
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
