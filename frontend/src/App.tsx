// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";

function App() {
	const [count, setCount] = useState(0);

	return (
		<div className="min-h-screen flex items-center justify-center bg-zinc-900 text-white">
			<div className="max-w-5xl mx-auto p-8 text-center">
				<div className="flex justify-center gap-8 mb-8">
					<a
						href="https://vite.dev"
						target="_blank"
						className="transition-all hover:drop-shadow-[0_0_2em_#646cffaa]"
					>
						<img src={viteLogo} className="h-24 p-6" alt="Vite logo" />
					</a>
					<a
						href="https://react.dev"
						target="_blank"
						className="transition-all hover:drop-shadow-[0_0_2em_#61dafbaa]"
					>
						<img
							src={reactLogo}
							className="h-24 p-6 animate-[spin_20s_linear_infinite]"
							alt="React logo"
						/>
					</a>
				</div>
				<h1 className="text-5xl font-bold leading-tight mb-8">Vite + React</h1>
				<div className="p-8">
					<button
						onClick={() => setCount((count) => count + 1)}
						className="rounded-lg border border-transparent px-5 py-3 text-base font-medium bg-zinc-800 cursor-pointer transition-colors hover:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
					>
						count is {count}
					</button>
					<p className="mt-4">
						Edit <code className="bg-zinc-800 px-2 py-1 rounded">src/App.tsx</code> and save to test
						HMR
					</p>
				</div>
				<p className="text-gray-400">Click on the Vite and React logos to learn more</p>
			</div>
		</div>
	);
}

export default App;
