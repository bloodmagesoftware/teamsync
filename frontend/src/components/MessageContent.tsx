// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import latteHighlightTheme from "@catppuccin/highlightjs/css/catppuccin-latte.css?inline";
import mochaHighlightTheme from "@catppuccin/highlightjs/css/catppuccin-mocha.css?inline";

interface MessageContentProps {
	body: string;
	contentType: string;
}

export function MessageContent({ body, contentType }: MessageContentProps) {
	const [isDark, setIsDark] = useState(true);
	const highlightStyleRef = useRef<HTMLStyleElement | null>(null);

	useEffect(() => {
		if (typeof document === "undefined" || typeof window === "undefined") {
			return;
		}

		const updateTheme = () => {
			const prefersDark = window.matchMedia(
				"(prefers-color-scheme: dark)",
			).matches;
			const classForcesDark =
				document.documentElement.classList.contains("dark");
			setIsDark(prefersDark || classForcesDark);
		};

		updateTheme();

		const observer = new MutationObserver(updateTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", updateTheme);

		return () => {
			observer.disconnect();
			mediaQuery.removeEventListener("change", updateTheme);
		};
	}, []);

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		const style = document.createElement("style");
		style.setAttribute("data-teamsync", "highlight-theme");
		document.head.appendChild(style);
		highlightStyleRef.current = style;

		return () => {
			highlightStyleRef.current = null;
			style.remove();
		};
	}, []);

	useEffect(() => {
		if (!highlightStyleRef.current) {
			return;
		}

		highlightStyleRef.current.textContent = isDark
			? mochaHighlightTheme
			: latteHighlightTheme;
	}, [isDark]);

	const components = useMemo<Components>(
		() => ({
			code(props) {
				const { children, className, ...rest } = props;
				const match = /language-(\w+)/.exec(className || "");
				return match ? (
					<code {...rest} className={className}>
						{children}
					</code>
				) : (
					<code
						{...rest}
						className="bg-ctp-crust p-2 rounded text-ctp-text text-xs font-mono"
					>
						{children}
					</code>
				);
			},
			pre(props) {
				return (
					<pre className="bg-ctp-crust p-2 rounded overflow-x-auto my-2">
						{props.children}
					</pre>
				);
			},
			a(props) {
				return (
					<a
						{...props}
						className="text-ctp-blue hover:underline"
						target="_blank"
						rel="noopener noreferrer"
					/>
				);
			},
			p(props) {
				return <p className="my-1" {...props} />;
			},
			ul(props) {
				return <ul className="list-disc list-inside my-1" {...props} />;
			},
			ol(props) {
				return <ol className="list-decimal list-inside my-1" {...props} />;
			},
			blockquote(props) {
				return (
					<blockquote
						className="border-l-4 border-ctp-surface1 pl-4 my-2 text-ctp-subtext0 italic"
						{...props}
					/>
				);
			},
			h1(props) {
				return <h1 className="text-2xl font-bold my-2" {...props} />;
			},
			h2(props) {
				return <h2 className="text-xl font-bold my-2" {...props} />;
			},
			h3(props) {
				return <h3 className="text-lg font-bold my-1" {...props} />;
			},
			table(props) {
				return (
					<table
						className="border-collapse border border-ctp-surface1 my-2"
						{...props}
					/>
				);
			},
			th(props) {
				return (
					<th
						className="border border-ctp-surface1 px-2 py-1 bg-ctp-surface0"
						{...props}
					/>
				);
			},
			td(props) {
				return (
					<td className="border border-ctp-surface1 px-2 py-1" {...props} />
				);
			},
		}),
		[],
	);

	if (contentType === "text/html") {
		return (
			<div
				className="text-ctp-text"
				dangerouslySetInnerHTML={{ __html: body }}
			/>
		);
	}

	if (contentType === "text/markdown") {
		return (
			<div className="text-ctp-text markdown-content">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeHighlight]}
					components={components}
				>
					{body}
				</ReactMarkdown>
			</div>
		);
	}

	return <div className="text-ctp-text whitespace-pre-wrap">{body}</div>;
}
