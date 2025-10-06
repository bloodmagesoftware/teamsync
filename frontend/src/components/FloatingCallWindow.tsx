// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useEffect, useRef, useState } from "react";
import { useCall } from "../CallContext";
import { Mic, MicOff, PhoneOff, Share, Video, VideoOff } from "react-feather";

function RemoteVideoStream({
	stream,
	username,
	profileImageUrl,
}: {
	stream: MediaStream;
	username: string;
	profileImageUrl: string | null;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [hasVideo, setHasVideo] = useState(false);

	useEffect(() => {
		if (!videoRef.current || !stream) return;

		videoRef.current.srcObject = stream;

		const video = videoRef.current;

		const checkVideo = () => {
			const videoTracks = stream.getVideoTracks() || [];
			setHasVideo(
				videoTracks.length > 0 &&
					videoTracks.some((t) => t.readyState === "live" && t.enabled),
			);
		};

		const handleLoadedMetadata = () => {
			if (video.videoWidth > 0 && video.videoHeight > 0) {
				setHasVideo(true);
			}
		};

		const handlePlay = () => {
			if (video.videoWidth > 0 && video.videoHeight > 0) {
				setHasVideo(true);
			}
		};

		const handleEmptied = () => checkVideo();

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("play", handlePlay);
		video.addEventListener("emptied", handleEmptied);

		const handleTrackChange = () => checkVideo();
		stream.addEventListener("addtrack", handleTrackChange);
		stream.addEventListener("removetrack", handleTrackChange);

		const videoTracks = stream.getVideoTracks() || [];
		videoTracks.forEach((track) => {
			track.addEventListener("ended", handleTrackChange);
			track.addEventListener("mute", handleTrackChange);
		});

		checkVideo();

		return () => {
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("play", handlePlay);
			video.removeEventListener("emptied", handleEmptied);
			stream.removeEventListener("addtrack", handleTrackChange);
			stream.removeEventListener("removetrack", handleTrackChange);
			videoTracks.forEach((track) => {
				track.removeEventListener("ended", handleTrackChange);
				track.removeEventListener("mute", handleTrackChange);
			});
		};
	}, [stream]);

	return (
		<div className="relative w-full h-full bg-ctp-surface1">
			<video
				ref={videoRef}
				className="absolute inset-0 w-full h-full object-cover pointer-events-none"
				autoPlay
				muted={false}
				playsInline
			/>

			{!hasVideo && (
				<div className="absolute inset-0 grid place-items-center">
					<div className="w-16 h-16 rounded-full overflow-hidden bg-ctp-surface2 grid place-items-center text-2xl font-bold">
						{profileImageUrl ? (
							<img
								src={profileImageUrl}
								alt={username}
								className="w-full h-full object-cover"
							/>
						) : (
							username.charAt(0).toUpperCase()
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function removeUserTextSelection() {
	const selection = window.getSelection();
	if (!selection) return;
	if (selection.empty) {
		selection.empty();
	} else if (selection.removeAllRanges) {
		selection.removeAllRanges();
	}
}

export function FloatingCallWindow() {
	const { activeCall, endCall, toggleAudio, toggleVideo, toggleScreenShare } =
		useCall();
	const localVideoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: 16, top: 16 });
	const [size, setSize] = useState({ width: 480, height: 360 });
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [resizeStart, setResizeStart] = useState({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});

	useEffect(() => {
		if (!activeCall) return;

		if (localVideoRef.current && activeCall.localCameraStream) {
			localVideoRef.current.srcObject = activeCall.localCameraStream;
		}
	}, [activeCall]);

	useEffect(() => {
		if (!isDragging && !isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (isDragging) {
				setPosition({
					left: e.clientX - dragStart.x,
					top: e.clientY - dragStart.y,
				});
			} else if (isResizing) {
				const deltaX = e.clientX - resizeStart.x;
				const deltaY = e.clientY - resizeStart.y;

				const newWidth = Math.max(320, resizeStart.width + deltaX);
				const newHeight = Math.max(240, resizeStart.height + deltaY);

				setSize({ width: newWidth, height: newHeight });

				removeUserTextSelection();
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			setIsResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, isResizing, dragStart, resizeStart]);

	const handleDragStart = (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest("button")) return;
		if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;

		setIsDragging(true);
		setDragStart({
			x: e.clientX - position.left,
			y: e.clientY - position.top,
		});
	};

	const handleResizeStart = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsResizing(true);
		setResizeStart({
			x: e.clientX,
			y: e.clientY,
			width: size.width,
			height: size.height,
		});
	};

	if (!activeCall) return null;

	const remoteStreamCount = activeCall.remoteStreams.length;
	const gridClass =
		remoteStreamCount === 1
			? "grid-cols-1"
			: remoteStreamCount === 2
				? "grid-cols-2"
				: remoteStreamCount <= 4
					? "grid-cols-2 grid-rows-2"
					: remoteStreamCount <= 6
						? "grid-cols-3 grid-rows-2"
						: "grid-cols-3 grid-rows-3";

	const isScreenShareAvailable =
		navigator.mediaDevices &&
		typeof navigator.mediaDevices.getDisplayMedia === "function";

	return (
		<div
			ref={containerRef}
			className="fixed bg-ctp-surface0 rounded-lg shadow-xl border border-ctp-surface1 overflow-hidden z-50 group pointer-events-[all]"
			style={{
				left: `${position.left}px`,
				top: `${position.top}px`,
				width: `${size.width}px`,
				height: `${size.height}px`,
				cursor: isDragging ? "grabbing" : "grab",
			}}
			onMouseDown={handleDragStart}
		>
			<div className="relative w-full h-full">
				{remoteStreamCount > 0 ? (
					<div className={`w-full h-full grid ${gridClass} gap-1 p-1`}>
						{activeCall.remoteStreams.map((stream) => (
							<RemoteVideoStream
								key={stream.id}
								stream={stream}
								username={activeCall.username}
								profileImageUrl={activeCall.profileImageUrl}
							/>
						))}
					</div>
				) : (
					<div className="w-full h-full bg-ctp-surface1 grid place-items-center">
						<p className="text-ctp-text text-lg">calling</p>
					</div>
				)}

				<div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
					<p className="text-white font-semibold">{activeCall.username}</p>
					<p className="text-white text-sm">{activeCall.status}</p>
				</div>

				<video
					ref={localVideoRef}
					className="absolute top-4 right-4 w-32 h-24 object-cover rounded-lg border-2 border-white pointer-events-none opacity-100 mouse-only:opacity-0 mouse-only:group-hover:opacity-100 transition-opacity duration-300 ease-out"
					autoPlay
					muted={true}
					playsInline
				/>

				<div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-100 mouse-only:opacity-0 mouse-only:group-hover:opacity-100 transition-opacity duration-300 ease-out">
					<div
						className={`grid ${isScreenShareAvailable ? "grid-cols-4" : "grid-cols-3"} gap-2 max-w-xs mx-auto`}
					>
						<button
							onClick={toggleAudio}
							className={`rounded-full p-3 transition-colors ${
								activeCall.isAudioMuted
									? "bg-red-500 hover:bg-red-600"
									: "bg-ctp-surface1 hover:bg-ctp-surface2"
							} text-white`}
							title={activeCall.isAudioMuted ? "Unmute" : "Mute"}
						>
							{activeCall.isAudioMuted ? (
								<MicOff className="w-6 h-6 m-auto" />
							) : (
								<Mic className="w-6 h-6 m-auto" />
							)}
						</button>

						<button
							onClick={toggleVideo}
							className={`rounded-full p-3 transition-colors text-center ${
								activeCall.isVideoMuted
									? "bg-red-500 hover:bg-red-600"
									: "bg-ctp-surface1 hover:bg-ctp-surface2"
							} text-white`}
							title={
								activeCall.isVideoMuted ? "Enable camera" : "Disable camera"
							}
						>
							{activeCall.isVideoMuted ? (
								<VideoOff className="w-6 h-6 m-auto" />
							) : (
								<Video className="w-6 h-6 m-auto" />
							)}
						</button>

						{isScreenShareAvailable && (
							<button
								onClick={() => toggleScreenShare()}
								className={`rounded-full p-3 transition-colors ${
									activeCall.isScreenSharing
										? "bg-green-500 hover:bg-green-600"
										: "bg-ctp-surface1 hover:bg-ctp-surface2"
								} text-white`}
								title={
									activeCall.isScreenSharing ? "Stop sharing" : "Share screen"
								}
							>
								<Share className="w-6 h-6 m-auto" />
							</button>
						)}

						<button
							onClick={endCall}
							className="bg-red-500 hover:bg-red-600 text-white rounded-full p-3 transition-colors"
							title="Hang up"
						>
							<PhoneOff className="w-6 h-6 m-auto" />
						</button>
					</div>
				</div>

				<div
					data-resize-handle
					className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
					onMouseDown={handleResizeStart}
					style={{
						background:
							"linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)",
					}}
				/>
			</div>
		</div>
	);
}
