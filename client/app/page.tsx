import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function IndexPage() {
  return (
    <section className="container grid items-center gap-6 pb-8 pt-6 md:py-10">

      
      <div className="rounded-lg border border-yellow-600 px-4 py-2 text-sm text-white-400 w-fit">
         Built as an assignment for <span className="font-bold">Lila Gaming Studios</span>
      </div>

      {/* Title */}
      <div className="flex max-w-[980px] flex-col items-start gap-2">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
          TicTacToe Game <br className="hidden sm:inline" />
          built with Next.js and Nakama.
        </h1>
        <p className="max-w-[700px] text-lg text-muted-foreground">
          Server-authoritative real-time multiplayer game with matchmaking,
          turn timers, leaderboard, and mobile support. Open source.
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-wrap gap-3">
        <Link href="/tictactoe" rel="noreferrer" className={buttonVariants()}>
          🎮 Start Game
        </Link>
        <Link
          href="http://github.com/Light1300/"
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          GitHub
        </Link>
        <Link
          href="https://x.com/SarveshPat21415"
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          𝕏 Twitter
        </Link>
      </div>

      {/* Divider */}
      <div className="h-px w-full max-w-2xl bg-gray-800" />

      {/* About the Developer */}
      <div className="flex max-w-2xl flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <p className="text-xs uppercase tracking-widest text-gray-500">About the Developer</p>
        <div className="flex flex-col">
          <span className="text-lg font-bold text-white">Sarvesh Patil</span>
          <span className="text-sm text-gray-400">
            Backend Developer at{" "}
            <a
              href="https://flickit.app"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline"
            >
              Flickit.app
            </a>
          </span>
        </div>
        <p className="text-sm text-gray-400">
          MERN stack developer experienced in Node.js, TypeScript, and real-time
          systems. This project demonstrates server-authoritative multiplayer
          architecture using Nakama game server.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://www.linkedin.com/in/sarvesh-patil-559b3124b/"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-blue-800 bg-blue-950/40 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-900/40 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://light1300.github.io/Sarvesh.dev/"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-purple-800 bg-purple-950/40 px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-900/40 transition-colors"
          >
            Portfolio
          </a>
          <a
            href="http://github.com/Light1300/"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://x.com/SarveshPat21415"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors"
          >
            𝕏 Twitter
          </a>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="flex flex-wrap gap-2">
        {["Next.js 13", "Nakama Server", "TypeScript", "WebSockets", "Tailwind CSS", "Docker"].map(t => (
          <span key={t} className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
            {t}
          </span>
        ))}
      </div>

    </section>
  );
}
