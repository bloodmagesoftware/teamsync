// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import {
	createContext,
	useContext,
	useState,
	useCallback,
	type ReactNode,
	useRef,
	useEffect,
} from "react";

export interface CallState {
	ws: WebSocket | null;
	isInitiator: boolean;
	pc: RTCPeerConnection | null;
	localStream: MediaStream | null;
	localCameraStream: MediaStream | null;
	screenTrack: MediaStreamTrack | null;
	remoteStreams: MediaStream[];
	pendingRemoteCandidates: RTCIceCandidateInit[];
	pendingLocalCandidates: RTCIceCandidateInit[];
	hasPeerJoined: boolean;
	status: string;
	username: string;
	profileImageUrl: string | null;
	isAudioMuted: boolean;
	isVideoMuted: boolean;
	isScreenSharing: boolean;
}

interface CallContextValue {
	activeCall: CallState | null;
	startCall: (params: {
		conversationId: number;
		username: string;
		profileImageUrl: string | null;
	}) => Promise<void>;
	answerCall: (params: {
		messageId: number;
		username: string;
		profileImageUrl: string | null;
	}) => Promise<void>;
	endCall: () => void;
	updateStatus: (status: string) => void;
	toggleAudio: () => void;
	toggleVideo: () => void;
	toggleScreenShare: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
	const context = useContext(CallContext);
	if (!context) {
		throw new Error("useCall must be used within CallProvider");
	}
	return context;
}

export function CallProvider({ children }: { children: ReactNode }) {
	const [activeCall, setActiveCall] = useState<CallState | null>(null);
	const callStateRef = useRef<CallState | null>(null);
	const forceUpdate = useCallback(() => {
		setActiveCall((prev) => (prev ? { ...prev } : null));
	}, []);

	useEffect(() => {
		callStateRef.current = activeCall;
	}, [activeCall]);

	const updateStatus = useCallback((status: string) => {
		setActiveCall((prev) => (prev ? { ...prev, status } : null));
	}, []);

	const endCall = useCallback(() => {
		const state = callStateRef.current;
		if (!state) return;

		if (state.ws) {
			try {
				state.ws.close();
			} catch {}
		}

		if (state.localStream) {
			try {
				state.localStream.getTracks().forEach((track) => track.stop());
			} catch {}
		}

		if (state.localCameraStream) {
			try {
				state.localCameraStream.getTracks().forEach((track) => track.stop());
			} catch {}
		}

		if (state.remoteStreams) {
			try {
				state.remoteStreams.forEach((stream) => {
					stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
				});
			} catch {}
		}

		if (state.pc) {
			try {
				state.pc.onicecandidate = null;
				state.pc.ontrack = null;
				state.pc.oniceconnectionstatechange = null;
				state.pc.onconnectionstatechange = null;
				state.pc.close();
			} catch {}
		}

		setActiveCall(null);
	}, []);

	const startCall = useCallback(
		async (params: {
			conversationId: number;
			username: string;
			profileImageUrl: string | null;
		}) => {
			if (activeCall) {
				throw new Error("A call is already in progress");
			}

			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/calls/start", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ conversationId: params.conversationId }),
			});

			if (!response.ok) {
				throw new Error("Failed to start call");
			}

			const result = await response.json();
			const messageId = result.messageId;

			const newCallState: CallState = {
				ws: null,
				isInitiator: true,
				pc: null,
				localStream: null,
				localCameraStream: null,
				screenTrack: null,
				remoteStreams: [],
				pendingRemoteCandidates: [],
				pendingLocalCandidates: [],
				hasPeerJoined: false,
				status: "Connecting...",
				username: params.username,
				profileImageUrl: params.profileImageUrl,
				isAudioMuted: false,
				isVideoMuted: false,
				isScreenSharing: false,
			};

			setActiveCall(newCallState);

			const { ws, pc, localStream, localCameraStream, remoteStreams } =
				await initializeCall(
					messageId,
					true,
					updateStatus,
					endCall,
					forceUpdate,
				);

			setActiveCall((prev) =>
				prev
					? { ...prev, ws, pc, localStream, localCameraStream, remoteStreams }
					: null,
			);
		},
		[activeCall, updateStatus, endCall, forceUpdate],
	);

	const answerCall = useCallback(
		async (params: {
			messageId: number;
			username: string;
			profileImageUrl: string | null;
		}) => {
			if (activeCall) {
				throw new Error("A call is already in progress");
			}

			const newCallState: CallState = {
				ws: null,
				isInitiator: false,
				pc: null,
				localStream: null,
				localCameraStream: null,
				screenTrack: null,
				remoteStreams: [],
				pendingRemoteCandidates: [],
				pendingLocalCandidates: [],
				hasPeerJoined: false,
				status: "Connecting...",
				username: params.username,
				profileImageUrl: params.profileImageUrl,
				isAudioMuted: false,
				isVideoMuted: false,
				isScreenSharing: false,
			};

			setActiveCall(newCallState);

			const { ws, pc, localStream, localCameraStream, remoteStreams } =
				await initializeCall(
					params.messageId,
					false,
					updateStatus,
					endCall,
					forceUpdate,
				);

			setActiveCall((prev) =>
				prev
					? { ...prev, ws, pc, localStream, localCameraStream, remoteStreams }
					: null,
			);
		},
		[activeCall, updateStatus, endCall, forceUpdate],
	);

	const toggleAudio = useCallback(() => {
		const state = callStateRef.current;
		if (!state?.localStream) return;

		const audioTracks = state.localStream.getAudioTracks();
		audioTracks.forEach((track) => {
			track.enabled = !track.enabled;
		});

		setActiveCall((prev) =>
			prev ? { ...prev, isAudioMuted: !prev.isAudioMuted } : null,
		);
	}, []);

	const toggleVideo = useCallback(() => {
		const state = callStateRef.current;
		if (!state?.localStream) return;

		const videoTracks = state.localStream.getVideoTracks();
		videoTracks.forEach((track) => {
			track.enabled = !track.enabled;
		});

		setActiveCall((prev) =>
			prev ? { ...prev, isVideoMuted: !prev.isVideoMuted } : null,
		);
	}, []);

	const toggleScreenShare = useCallback(async () => {
		const state = callStateRef.current;
		if (!state?.pc || !state.localStream || !state.ws) return;

		if (state.isScreenSharing && state.screenTrack) {
			const senders = state.pc.getSenders();
			const screenSender = senders.find((s) => s.track === state.screenTrack);

			if (screenSender) {
				state.pc.removeTrack(screenSender);
			}

			if (state.screenTrack.readyState === "live") {
				state.screenTrack.stop();
			}

			const offer = await state.pc.createOffer();
			await state.pc.setLocalDescription(offer);
			state.ws.send(
				JSON.stringify({
					type: "renegotiate",
					payload: {
						sdp: state.pc.localDescription?.sdp,
						type: state.pc.localDescription?.type,
					},
				}),
			);

			setActiveCall((prev) =>
				prev ? { ...prev, isScreenSharing: false, screenTrack: null } : null,
			);
		} else {
			const screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
			});
			const screenTrack = screenStream.getVideoTracks()[0];

			state.pc.addTrack(screenTrack, screenStream);

			const offer = await state.pc.createOffer();
			await state.pc.setLocalDescription(offer);
			state.ws.send(
				JSON.stringify({
					type: "renegotiate",
					payload: {
						sdp: state.pc.localDescription?.sdp,
						type: state.pc.localDescription?.type,
					},
				}),
			);

			screenTrack.onended = async () => {
				const senders = state.pc!.getSenders();
				const screenSender = senders.find((s) => s.track === screenTrack);

				if (screenSender && state.ws) {
					state.pc!.removeTrack(screenSender);

					const offer = await state.pc!.createOffer();
					await state.pc!.setLocalDescription(offer);
					state.ws.send(
						JSON.stringify({
							type: "renegotiate",
							payload: {
								sdp: state.pc!.localDescription?.sdp,
								type: state.pc!.localDescription?.type,
							},
						}),
					);
				}

				setActiveCall((prev) =>
					prev ? { ...prev, isScreenSharing: false, screenTrack: null } : null,
				);
			};

			setActiveCall((prev) =>
				prev ? { ...prev, isScreenSharing: true, screenTrack } : null,
			);
		}
	}, []);

	return (
		<CallContext.Provider
			value={{
				activeCall,
				startCall,
				answerCall,
				endCall,
				updateStatus,
				toggleAudio,
				toggleVideo,
				toggleScreenShare,
			}}
		>
			{children}
		</CallContext.Provider>
	);
}

async function initializeCall(
	messageId: number,
	isInitiator: boolean,
	updateStatus: (status: string) => void,
	endCall: () => void,
	forceUpdate: () => void,
): Promise<{
	ws: WebSocket;
	pc: RTCPeerConnection;
	localStream: MediaStream;
	localCameraStream: MediaStream;
	remoteStreams: MediaStream[];
}> {
	const iceServers = await loadIceServers();

	const localStream = await navigator.mediaDevices.getUserMedia({
		video: true,
		audio: true,
	});

	const localCameraStream = localStream.clone();

	const remoteStreamsArray: MediaStream[] = [];

	const pc = new RTCPeerConnection({ iceServers });
	(globalThis as unknown as { pc: RTCPeerConnection }).pc = pc;

	for (const track of localStream.getTracks()) {
		pc.addTrack(track, localStream);
	}

	const ws = await connectWebSocket(
		messageId,
		isInitiator,
		pc,
		remoteStreamsArray,
		updateStatus,
		endCall,
		forceUpdate,
	);

	return {
		ws,
		pc,
		localStream,
		localCameraStream,
		remoteStreams: remoteStreamsArray,
	};
}

interface CallConfigResponse {
	iceServers: { urls: string[] }[];
	usernamePrefix: string;
	realm: string;
	relayAddress: string;
	port: string;
}

const DEFAULT_TURN_USERNAME_PREFIX = "teamsync:";
const DEFAULT_TURN_PORT = 3478;

let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceToken: string | null = null;

async function loadIceServers(): Promise<RTCIceServer[]> {
	const token = localStorage.getItem("accessToken");
	if (!token) {
		throw new Error("Access token not found");
	}

	if (cachedIceServers && cachedIceToken === token) {
		return cachedIceServers;
	}

	try {
		const response = await fetch("/api/calls/config", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			throw new Error("Failed to fetch call configuration");
		}

		const configuration = (await response.json()) as CallConfigResponse;
		const prefix = configuration.usernamePrefix || DEFAULT_TURN_USERNAME_PREFIX;
		const servers = configuration.iceServers.map((server) => {
			const isTurn = server.urls.some((url) => url.startsWith("turn:"));
			if (!isTurn) {
				return { urls: server.urls } satisfies RTCIceServer;
			}
			return {
				urls: server.urls,
				username: `${prefix}${token}`,
				credential: token,
			} satisfies RTCIceServer;
		});

		cachedIceServers = servers;
		cachedIceToken = token;
		return servers;
	} catch (error) {
		console.error("Falling back to local TURN configuration", error);
		const fallback = buildFallbackIceServers(
			token,
			DEFAULT_TURN_USERNAME_PREFIX,
		);
		cachedIceServers = fallback;
		cachedIceToken = token;
		return fallback;
	}
}

function buildFallbackIceServers(
	token: string | null,
	prefix: string,
): RTCIceServer[] {
	const hostname = window.location.hostname || "localhost";
	const formattedHost =
		hostname.includes(":") && !hostname.startsWith("[")
			? `[${hostname}]`
			: hostname;
	const stunUrl = `stun:${formattedHost}:${DEFAULT_TURN_PORT}`;
	const turnUrls = [
		`turn:${formattedHost}:${DEFAULT_TURN_PORT}?transport=udp`,
		`turn:${formattedHost}:${DEFAULT_TURN_PORT}?transport=tcp`,
	];

	const servers: RTCIceServer[] = [{ urls: [stunUrl] }];
	if (token) {
		servers.push({
			urls: turnUrls,
			username: `${prefix}${token}`,
			credential: token,
		});
	} else {
		servers.push({ urls: turnUrls });
	}
	return servers;
}

function connectWebSocket(
	messageId: number,
	isInitiator: boolean,
	pc: RTCPeerConnection,
	remoteStreams: MediaStream[],
	updateStatus: (status: string) => void,
	endCall: () => void,
	forceUpdate: () => void,
): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const accessToken = localStorage.getItem("accessToken");
		if (!accessToken) throw new Error("Access token not found");
		const wsUrl = new URL(
			"/api/calls/signaling",
			window.location.origin.replace(/^http/, "ws"),
		);
		wsUrl.searchParams.set("messageId", messageId.toString());
		wsUrl.searchParams.set("token", accessToken);

		console.log("Creating WebSocket...");
		const ws = new WebSocket(wsUrl);

		const state = {
			hasPeerJoined: false,
			pendingLocalCandidates: [] as RTCIceCandidateInit[],
			pendingRemoteCandidates: [] as RTCIceCandidateInit[],
		};

		const flushPendingLocalCandidates = () => {
			if (!ws || !state.hasPeerJoined) {
				return;
			}

			if (state.pendingLocalCandidates.length === 0) {
				return;
			}

			console.log(
				`Flushing ${state.pendingLocalCandidates.length} local candidates`,
			);

			const queued = state.pendingLocalCandidates.slice();
			state.pendingLocalCandidates = [];

			for (let index = 0; index < queued.length; index += 1) {
				const candidate = queued[index];
				try {
					console.log(
						`Sending ICE candidate from flush: ${candidate.candidate}`,
					);
					ws.send(
						JSON.stringify({
							type: "ice-candidate",
							payload: candidate,
						}),
					);
				} catch (error) {
					console.error(
						"Sending buffered ICE candidate failed:",
						error,
						candidate,
					);
					break;
				}
			}
		};

		const flushPendingRemoteCandidates = async () => {
			if (state.pendingRemoteCandidates.length > 0) {
				console.log(
					`Flushing ${state.pendingRemoteCandidates.length} candidates`,
				);
				for (const candidate of state.pendingRemoteCandidates) {
					try {
						await pc.addIceCandidate(new RTCIceCandidate(candidate));
					} catch (error) {
						console.error("Flushing ICE candidate failed:", error, candidate);
					}
				}
				state.pendingRemoteCandidates = [];
			}
		};

		const waitForIceGatheringComplete = async (pc: RTCPeerConnection) => {
			if (pc.iceGatheringState === "complete") {
				return;
			}

			await new Promise<void>((resolve) => {
				const checkState = () => {
					if (pc.iceGatheringState === "complete") {
						pc.removeEventListener("icegatheringstatechange", checkState);
						resolve();
					}
				};
				pc.addEventListener("icegatheringstatechange", checkState);
			});
		};

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				const payload = event.candidate.toJSON();
				if (!ws || !state.hasPeerJoined) {
					console.log(`Buffering ICE candidate: ${payload.candidate}`);
					state.pendingLocalCandidates.push(payload);
				} else {
					try {
						console.log(`Sending ICE candidate: ${payload.candidate}`);
						ws.send(
							JSON.stringify({
								type: "ice-candidate",
								payload,
							}),
						);
					} catch (error) {
						console.error("Sending ICE candidate failed:", error, payload);
						state.pendingLocalCandidates.push(payload);
					}
				}
			}
		};

		pc.oniceconnectionstatechange = () => {
			console.log(`ICE: ${pc.iceConnectionState}`);
		};

		pc.onconnectionstatechange = () => {
			console.log(`PC: ${pc.connectionState}`);
		};

		const cleanupEmptyStreams = () => {
			const activeStreams = remoteStreams.filter(
				(s) => s.getTracks().length > 0,
			);
			if (activeStreams.length !== remoteStreams.length) {
				remoteStreams.length = 0;
				remoteStreams.push(...activeStreams);
				forceUpdate();
			}
		};

		pc.ontrack = (event) => {
			console.log(`Received: track ${event.track.kind}`);

			const attach = () => {
				let needsUpdate = false;

				if (event.streams && event.streams[0]) {
					const streamId = event.streams[0].id;
					let stream = remoteStreams.find((s) => s.id === streamId);

					if (!stream) {
						stream = event.streams[0];
						remoteStreams.push(stream);
						needsUpdate = true;

						stream.addEventListener("removetrack", () => {
							console.log(`Track removed from stream ${streamId}`);
							cleanupEmptyStreams();
						});
					}
				} else {
					let stream = remoteStreams.find((s) =>
						s.getTracks().some((t) => t.id === event.track.id),
					);

					if (!stream) {
						stream = new MediaStream();
						remoteStreams.push(stream);
						needsUpdate = true;

						stream.addEventListener("removetrack", () => {
							console.log("Track removed from stream");
							cleanupEmptyStreams();
						});
					}

					if (!stream.getTracks().includes(event.track)) {
						stream.addTrack(event.track);
						needsUpdate = true;
					}
				}

				event.track.addEventListener("ended", () => {
					console.log(`Track ended: ${event.track.kind}`);
					cleanupEmptyStreams();
				});

				if (needsUpdate) {
					forceUpdate();
				}
			};

			if (event.track.muted) {
				event.track.onunmute = () => attach();
			} else {
				attach();
			}
		};

		ws.onopen = () => {
			console.log("WebSocket connected");
			updateStatus("Waiting for other participant...");
			resolve(ws);
		};

		ws.onmessage = async (event: MessageEvent) => {
			try {
				const message = JSON.parse(event.data);

				switch (message.type) {
					case "peer-joined": {
						console.log("Peer joined the call");
						updateStatus("");

						if (isInitiator) {
							console.log("I am the initiator, sending offer");
							const offerDescription = await pc.createOffer();
							await pc.setLocalDescription(offerDescription);
							await waitForIceGatheringComplete(pc);

							const localDescription = pc.localDescription;
							if (!localDescription) {
								throw new Error(
									"Local description missing after ICE gathering",
								);
							}

							ws.send(
								JSON.stringify({
									type: "offer",
									payload: {
										sdp: localDescription.sdp,
										type: localDescription.type,
									},
								}),
							);
							console.log("Sent: offer");
						} else {
							console.log("Waiting for offer...");
						}

						state.hasPeerJoined = true;
						flushPendingLocalCandidates();
						break;
					}
					case "offer": {
						console.log("Received: offer");
						await pc.setRemoteDescription(
							new RTCSessionDescription(message.payload),
						);
						await flushPendingRemoteCandidates();

						const answerDescription = await pc.createAnswer();
						await pc.setLocalDescription(answerDescription);
						await waitForIceGatheringComplete(pc);

						const localDescription = pc.localDescription;
						if (!localDescription) {
							throw new Error("Local description missing after ICE gathering");
						}

						ws.send(
							JSON.stringify({
								type: "answer",
								payload: {
									sdp: localDescription.sdp,
									type: localDescription.type,
								},
							}),
						);
						console.log("Sent: answer");
						flushPendingLocalCandidates();
						break;
					}
					case "answer": {
						console.log("Received: answer");
						const answerDescription = new RTCSessionDescription(
							message.payload,
						);
						await pc.setRemoteDescription(answerDescription);
						await flushPendingRemoteCandidates();
						flushPendingLocalCandidates();
						break;
					}
					case "ice-candidate": {
						console.log("Received: ICE candidate");
						const init: RTCIceCandidateInit = message.payload;
						if (!pc.remoteDescription) {
							state.pendingRemoteCandidates.push(init);
						} else {
							try {
								await pc.addIceCandidate(new RTCIceCandidate(init));
							} catch (error) {
								console.error("Adding ICE candidate failed:", error, init);
							}
						}
						break;
					}
					case "renegotiate": {
						console.log("Received: renegotiate");
						await pc.setRemoteDescription(
							new RTCSessionDescription(message.payload),
						);

						const answerDescription = await pc.createAnswer();
						await pc.setLocalDescription(answerDescription);

						ws.send(
							JSON.stringify({
								type: "renegotiate-answer",
								payload: {
									sdp: answerDescription.sdp,
									type: answerDescription.type,
								},
							}),
						);
						console.log("Sent: renegotiate-answer");
						break;
					}
					case "renegotiate-answer": {
						console.log("Received: renegotiate-answer");
						const answerDescription = new RTCSessionDescription(
							message.payload,
						);
						await pc.setRemoteDescription(answerDescription);
						break;
					}
				}
			} catch (error) {
				console.error("Error handling WebSocket message:", error);
			}
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
			updateStatus("Error");
			reject(error);
		};

		ws.onclose = (event) => {
			console.log(
				"WebSocket closed:",
				event.code,
				event.reason,
				"wasClean:",
				event.wasClean,
			);
			updateStatus("Disconnected");
			endCall();
		};
	});
}
