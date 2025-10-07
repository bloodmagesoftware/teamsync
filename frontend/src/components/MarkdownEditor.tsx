// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

import { useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap, Decoration, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { Extension, Range } from "@codemirror/state";
import { StateField, Prec } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	onSend?: (value: string) => void;
	enterSends?: boolean;
	placeholder?: string;
	className?: string;
}

// Widget for inline image preview
class ImageWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly alt: string,
	) {
		super();
	}

	toDOM() {
		const wrap = document.createElement("div");
		wrap.className = "inline-block align-middle mx-1";

		const img = document.createElement("img");
		img.src = this.src;
		img.alt = this.alt;
		img.className = "max-h-20 rounded border border-ctp-surface0";
		img.loading = "lazy";
		img.onerror = () => {
			img.className = "hidden";
			const span = document.createElement("span");
			span.className = "text-ctp-red text-xs";
			span.textContent = "[broken image]";
			wrap.appendChild(span);
		};

		wrap.appendChild(img);
		return wrap;
	}

	eq(other: ImageWidget) {
		return other.src === this.src && other.alt === this.alt;
	}
}

export function MarkdownEditor({
	value,
	onChange,
	onSend,
	enterSends = false,
	placeholder = "Type markdown here...",
	className = "",
}: MarkdownEditorProps) {
	const editorRef = useRef<ReactCodeMirrorRef>(null);

	// Handle changes
	const handleChange = useCallback(
		(val: string) => {
			onChange(val);
		},
		[onChange],
	);

	// Helper function to send message
	const sendMessage = useCallback(
		(view: EditorView) => {
			const text = view.state.doc.toString();
			if (onSend && text.trim()) {
				onSend(text);
				// Clear the editor
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: "" },
				});
				return true;
			}
			return false;
		},
		[onSend],
	);

	// Custom keymap for Enter behavior - use highest precedence
	const enterKeymap = useMemo(() => {
		return Prec.highest(
			keymap.of([
				{
					key: "Ctrl-Enter",
					run: sendMessage,
				},
				{
					key: "Cmd-Enter", // For Mac users
					run: sendMessage,
				},
				{
					key: "Enter",
					run: (view) => {
						// If enterSends is false, let default behavior happen
						if (!enterSends) {
							return false;
						}

						const state = view.state;
						const pos = state.selection.main.head;

						// Get the syntax tree node at cursor position
						const tree = syntaxTree(state);
						const startNode = tree.resolveInner(pos, -1);

						// Check if we're in a code block, list, or other special context
						let inSpecialContext = false;
						let node: SyntaxNode | null = startNode;

						while (node) {
							const type = node.type.name;

							// Check for contexts where Enter should insert newline
							if (
								type === "FencedCode" ||
								type === "CodeBlock" ||
								type === "CodeText" ||
								type === "InlineCode" ||
								type === "ListItem" ||
								type === "BulletList" ||
								type === "OrderedList"
							) {
								inSpecialContext = true;
								break;
							}

							node = node.parent;
						}

						if (inSpecialContext) {
							// Let default behavior handle newline in special contexts
							return false;
						}

						// Send the message
						return sendMessage(view);
					},
				},
				{
					key: "Shift-Enter",
					run: () => false, // Let default behavior insert newline
				},
			]),
		);
	}, [enterSends, sendMessage]);

	// Live preview decorations with image previews
	const livePreviewField = useMemo(
		() =>
			StateField.define<DecorationSet>({
				create() {
					return Decoration.none;
				},
				update(decorations, tr) {
					decorations = decorations.map(tr.changes);
					const decorationRanges: Range<Decoration>[] = [];
					const widgets: Range<Decoration>[] = [];

					syntaxTree(tr.state).iterate({
						enter: (node) => {
							const type = node.type.name;
							const from = node.from;
							const to = node.to;

							switch (type) {
								case "StrongEmphasis":
									decorationRanges.push(
										Decoration.mark({
											class: "font-bold text-ctp-text",
										}).range(from, to),
									);
									break;
								case "Emphasis":
									decorationRanges.push(
										Decoration.mark({
											class: "italic text-ctp-text",
										}).range(from, to),
									);
									break;
								case "ATXHeading1":
									decorationRanges.push(
										Decoration.line({
											class: "text-3xl font-bold text-ctp-lavender",
										}).range(from),
									);
									break;
								case "ATXHeading2":
									decorationRanges.push(
										Decoration.line({
											class: "text-2xl font-bold text-ctp-blue",
										}).range(from),
									);
									break;
								case "ATXHeading3":
									decorationRanges.push(
										Decoration.line({
											class: "text-xl font-bold text-ctp-sapphire",
										}).range(from),
									);
									break;
								case "InlineCode":
									decorationRanges.push(
										Decoration.mark({
											class:
												"bg-ctp-surface0 px-1 py-0.5 rounded text-ctp-pink font-mono text-sm",
										}).range(from, to),
									);
									break;
								case "FencedCode":
									// Apply line decoration to all lines in the code block
									const doc = tr.state.doc;
									const startLine = doc.lineAt(from);
									const endLine = doc.lineAt(to);
									for (
										let lineNum = startLine.number;
										lineNum <= endLine.number;
										lineNum++
									) {
										const line = doc.line(lineNum);
										decorationRanges.push(
											Decoration.line({
												class: "border-l-4 border-ctp-lavender pl-2",
											}).range(line.from),
										);
									}
									break;
								case "CodeInfo":
									// Style the language identifier with a readable color
									decorationRanges.push(
										Decoration.mark({
											class: "text-ctp-lavender",
										}).range(from, to),
									);
									break;
								case "Blockquote":
									decorationRanges.push(
										Decoration.line({
											class:
												"border-l-4 border-ctp-surface2 pl-4 text-ctp-subtext1 italic",
										}).range(from),
									);
									break;
								case "Link":
									decorationRanges.push(
										Decoration.mark({
											class:
												"text-ctp-sky underline decoration-ctp-sky/50 hover:decoration-ctp-sky cursor-pointer",
										}).range(from, to),
									);
									break;
								case "Image":
									const text = tr.state.doc.sliceString(from, to);
									const match = text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
									if (match) {
										const [, alt, src] = match;
										widgets.push(
											Decoration.widget({
												widget: new ImageWidget(src, alt || "Image"),
												side: 1,
											}).range(to),
										);
										decorationRanges.push(
											Decoration.mark({
												class: "text-ctp-surface2 text-sm",
											}).range(from, to),
										);
									}
									break;
							}
						},
					});

					return Decoration.set(
						[...decorationRanges, ...widgets].sort((a, b) => a.from - b.from),
					);
				},
				provide: (f) => EditorView.decorations.from(f),
			}),
		[],
	);

	// Catppuccin-styled theme
	const catppuccinTheme = useMemo(
		() =>
			EditorView.theme({
				"&": {
					fontSize: "14px",
				},
				".cm-content": {
					padding: "12px",
					lineHeight: "1.75",
					fontFamily:
						'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
					caretColor: "rgb(var(--ctp-rosewater))",
				},
				"&.cm-editor": {
					backgroundColor: "rgb(var(--ctp-base))",
					color: "rgb(var(--ctp-text))",
				},
				"&.cm-editor.cm-focused": {
					outline: "none",
				},
				"&.cm-focused .cm-selectionBackground, ::selection": {
					backgroundColor: "rgb(var(--ctp-surface2) / 0.5)",
				},
				".cm-cursor": {
					borderLeftColor: "rgb(var(--ctp-rosewater))",
					borderLeftWidth: "2px",
				},
				".cm-line": {
					padding: "0 2px",
				},
				".cm-placeholder": {
					color: "rgb(var(--ctp-overlay0))",
					fontStyle: "italic",
				},
				".cm-selectionMatch": {
					backgroundColor: "rgb(var(--ctp-surface1))",
				},
				".cm-activeLine": {
					backgroundColor: "rgb(var(--ctp-surface0) / 0.3)",
				},
				".cm-activeLineGutter": {
					backgroundColor: "rgb(var(--ctp-surface0) / 0.3)",
				},
				".cm-gutters": {
					backgroundColor: "rgb(var(--ctp-crust))",
					color: "rgb(var(--ctp-overlay0))",
					border: "none",
				},
				".cm-scroller": {
					fontFamily: "inherit",
				},
				".cm-tooltip": {
					backgroundColor: "rgb(var(--ctp-surface0))",
					color: "rgb(var(--ctp-text))",
					border: "1px solid rgb(var(--ctp-surface1))",
				},
				".cm-tooltip-autocomplete": {
					"& > ul > li[aria-selected]": {
						backgroundColor: "rgb(var(--ctp-surface1))",
						color: "rgb(var(--ctp-text))",
					},
				},
				// Override the specific class for code info/language identifier
				".ͼc": { color: "rgb(var(--ctp-lavender)) !important" },
				// Override any code-related markdown classes to ensure readable colors
				"span[class^='ͼ']": { color: "rgb(var(--ctp-text)) !important" },
				// Ensure code blocks have proper text color
				".cm-line .ͼb": { 
					color: "rgb(var(--ctp-text)) !important",
					fontFamily: "monospace",
				},
			}),
		[],
	);

	// Tab handling with highest precedence
	const tabKeymap = useMemo(
		() =>
			Prec.highest(
				keymap.of([
					{
						key: "Tab",
						run: (view) => {
							const state = view.state;
							const pos = state.selection.main.head;
							const tree = syntaxTree(state);
							const startNode = tree.resolveInner(pos, -1);

							let inCodeBlock = false;
							let inList = false;
							let node: SyntaxNode | null = startNode;

							while (node) {
								const type = node.type.name;
								if (type === "FencedCode" || type === "CodeBlock") {
									inCodeBlock = true;
									break;
								}
								if (
									type === "ListItem" ||
									type === "BulletList" ||
									type === "OrderedList"
								) {
									inList = true;
									break;
								}
								node = node.parent;
							}

							if (inCodeBlock) {
								view.dispatch({
									changes: { from: pos, insert: "\t" },
								});
							} else if (inList) {
								const line = state.doc.lineAt(pos);
								view.dispatch({
									changes: { from: line.from, insert: "  " },
								});
							} else {
								view.dispatch({
									changes: { from: pos, insert: "  " },
								});
							}
							return true;
						},
					},
					{
						key: "Shift-Tab",
						run: (view) => {
							const state = view.state;
							const pos = state.selection.main.head;
							const line = state.doc.lineAt(pos);
							const lineText = line.text;

							if (lineText.startsWith("  ")) {
								view.dispatch({
									changes: { from: line.from, to: line.from + 2, insert: "" },
								});
							} else if (lineText.startsWith("\t")) {
								view.dispatch({
									changes: { from: line.from, to: line.from + 1, insert: "" },
								});
							}
							return true;
						},
					},
				]),
			),
		[],
	);

	const extensions = useMemo(() => {
		const exts: Extension[] = [
			markdown({ codeLanguages: languages }),
			enterKeymap,
			tabKeymap,
			livePreviewField,
			catppuccinTheme,
			EditorView.lineWrapping,
		];
		return exts;
	}, [enterKeymap, tabKeymap, livePreviewField, catppuccinTheme]);

	return (
		<CodeMirror
			ref={editorRef}
			value={value}
			onChange={handleChange}
			height="auto"
			minHeight="40px"
			maxHeight="200px"
			extensions={extensions}
			placeholder={placeholder}
			className={`flex-1 rounded bg-ctp-surface0 overflow-hidden ${className}`}
			basicSetup={{
				lineNumbers: false,
				foldGutter: false,
				dropCursor: false,
				allowMultipleSelections: true,
				indentOnInput: true,
				bracketMatching: true,
				closeBrackets: true,
				autocompletion: true,
				rectangularSelection: true,
				highlightSelectionMatches: false,
				searchKeymap: false,
			}}
		/>
	);
}
