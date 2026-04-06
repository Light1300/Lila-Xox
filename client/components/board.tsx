    "use client";
    import { useState, useEffect, useRef } from "react";
    import Square from "./square";
    import Leaderboard from "./Leaderboard";
    import { MatchData } from "@heroiclabs/nakama-js";
    import Nakama from "@/lib/nakama";
    import { OpCode, StartMessage, DoneMessage, UpdateMessage } from "@/lib/messages";
    import { Button } from "@/components/ui/button";

    const TURN_SECS = 30;

    export default function Game() {
        const [squares, setSquares] = useState<(number | null)[]>(Array(9).fill(null));
        const [playerIndex, setPlayerIndex] = useState<number>(-1);
        const [playerTurn, setPlayerTurn] = useState<number>(-1);
        const [deadline, setDeadline] = useState<number | null>(null);
        const [gameMessage, setMessage] = useState<string>("Welcome to TicTacToe");
        const [gameStarted, setGameStarted] = useState<boolean>(false);
        const [timeLeft, setTimeLeft] = useState<number>(0);
        const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
        const [nakamaReady, setNakamaReady] = useState<boolean>(false);

        // Use refs for values needed inside socket callbacks
        const nakamaRef = useRef<Nakama | undefined>(undefined);
        const playerIndexRef = useRef<number>(-1);

        function initSocket() {
            if (!nakamaRef.current?.socket || !nakamaRef.current?.session) return;
            const userId = nakamaRef.current.session.user_id;
            const socket = nakamaRef.current.socket;

            socket.onmatchdata = (matchState: MatchData) => {
                if (!nakamaRef.current) return;
                const json_string = new TextDecoder().decode(matchState.data);
                const json: any = json_string ? JSON.parse(json_string) : "";

                if (typeof json !== "object" || json === null) return;

                switch (matchState.op_code) {
                    case OpCode.START: {
                        const msg = json as StartMessage;
                        // Get MY mark from the marks map
                        const myMark = msg.marks[userId!];
                        if (myMark !== null && myMark !== undefined) {
                            playerIndexRef.current = myMark;
                            nakamaRef.current!.gameState.playerIndex = myMark;
                            setPlayerIndex(myMark);
                        }
                        setSquares(msg.board as any[]);
                        setPlayerTurn(msg.mark);
                        setGameStarted(true);
                        setDeadline(msg.deadline);
                        setMessage("Game Started!");
                        break;
                    }
                    case OpCode.UPDATE: {
                        const msg = json as UpdateMessage;
                        setPlayerTurn(msg.mark);
                        setSquares(msg.board as any[]);
                        setDeadline(msg.deadline);
                        setMessage(
                            msg.mark === playerIndexRef.current
                                ? "Your Turn!"
                                : "Opponent's Turn"
                        );
                        break;
                    }
                    case OpCode.DONE: {
                        const msg = json as DoneMessage;
                        setDeadline(msg.nextGameStart);
                        setGameStarted(false);
                        setSquares(msg.board as any[]);
                        setPlayerTurn(-1);
                        const myIdx = playerIndexRef.current;
                        if (msg.winner === null || msg.winner === undefined) {
                            setMessage("🤝 It's a draw!");
                        } else if (msg.winner === myIdx) {
                            setMessage("🎉 You won!");
                            nakamaRef.current!.recordWin().catch(() => {});
                        } else {
                            setMessage("😞 You lost!");
                        }
                        break;
                    }
                }
            };
        }

        useEffect(() => {
            const init = async () => {
                nakamaRef.current = new Nakama();
                await nakamaRef.current.authenticate();
                initSocket();
                setNakamaReady(true);
            };
            init();
        }, []);

        // Countdown timer synced to server deadline
        useEffect(() => {
            if (deadline === null) return;
            const interval = setInterval(() => {
                const remaining = deadline * 1000 - Date.now();
                setTimeLeft(Math.max(0, remaining));
            }, 250);
            return () => clearInterval(interval);
        }, [deadline]);

        function handleClick(i: number) {
            if (!gameStarted) { setMessage("Game has not started yet!"); return; }
            if (!nakamaRef.current) return;
            if (playerTurn === playerIndexRef.current && squares[i] === null) {
                const next = squares.slice();
                next[i] = playerIndexRef.current;
                setSquares(next);
                nakamaRef.current.makeMove(i);
                setMessage("Waiting for opponent...");
            } else if (playerTurn !== playerIndexRef.current) {
                setMessage("It's not your turn!");
            }
        }

        async function findMatch() {
            if (!nakamaRef.current) return;
            await nakamaRef.current.findMatch();
            if (!nakamaRef.current.matchId) {
                setMessage("Server Error: Failed to find match!");
                return;
            }
            setMessage("Waiting for opponent to join...");
        }

        const timeLeftSecs = Math.ceil(timeLeft / 1000);
        const timerPct = Math.min(100, (timeLeftSecs / TURN_SECS) * 100);
        const timerColor =
            timeLeftSecs <= 5 ? "bg-red-500"
            : timeLeftSecs <= 10 ? "bg-yellow-500"
            : "bg-cyan-500";
        const isMyTurn = gameStarted && playerTurn === playerIndexRef.current;

        return (
            <div className="flex flex-col items-center gap-4 py-4">

                {/* Status message */}
                <div className="text-lg font-semibold text-white">{gameMessage}</div>

                {/* Find Match */}
                {!gameStarted && (
                    <Button onClick={findMatch} className="w-40">Find Match</Button>
                )}

                {/* Player info */}
                {gameStarted && (
                    <div className="flex gap-3">
                        <div className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">
                            You are{" "}
                            <span className={`text-xl font-bold ${playerIndex === 0 ? "text-cyan-400" : "text-yellow-400"}`}>
                                {playerIndex === 0 ? "X" : "O"}
                            </span>
                        </div>
                        <div className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">
                            <span className={`text-xl font-bold ${playerTurn === 0 ? "text-cyan-400" : "text-yellow-400"}`}>
                                {playerTurn === 0 ? "X" : "O"}
                            </span>{" "}
                            {isMyTurn ? "← Your turn" : "← Opponent"}
                        </div>
                    </div>
                )}

                {/* Turn Timer */}
                {gameStarted && deadline !== null && (
                    <div className="w-full max-w-xs">
                        <div className="mb-1 flex justify-between text-xs text-gray-400">
                            <span>{isMyTurn ? "⏱ Your time" : "⏱ Opponent's time"}</span>
                            <span className={timeLeftSecs <= 5 ? "animate-pulse font-bold text-red-400" : ""}>
                                {timeLeftSecs}s
                            </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                            <div
                                className={`h-full rounded-full transition-all ${timerColor}`}
                                style={{ width: `${timerPct}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Board */}
                <div className="grid grid-cols-3 gap-1">
                    {squares.map((val, i) => (
                        <Square key={i} value={val} onSquareClick={() => handleClick(i)} />
                    ))}
                </div>

                {/* Leaderboard toggle */}
                <button
                    onClick={() => setShowLeaderboard(v => !v)}
                    className="mt-2 text-sm text-gray-400 underline hover:text-yellow-400 transition-colors"
                >
                    {showLeaderboard ? "Hide" : "🏆 Show"} Leaderboard
                </button>

                {showLeaderboard && nakamaReady && (
                    <Leaderboard nakamaInstance={nakamaRef.current ?? null} />
                )}
            </div>
        );
    }