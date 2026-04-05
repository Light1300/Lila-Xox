"use client";
import { useEffect, useState } from "react";
import Nakama from "@/lib/nakama";

interface LeaderboardRecord {
    ownerId: string;
    username: string;
    score: number;
    rank: number;
}

interface Props {
    nakamaInstance: Nakama | null;
}

export default function Leaderboard({ nakamaInstance }: Props) {
    const [records, setRecords] = useState<LeaderboardRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!nakamaInstance) return;
        const fetchLeaderboard = async () => {
            setLoading(true);
            const data = await nakamaInstance.getLeaderboard();
            setRecords(data);
            setLoading(false);
        };
        fetchLeaderboard();
    }, [nakamaInstance]);

    const medals = ["🥇", "🥈", "🥉"];

    return (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-4">
            <h2 className="mb-3 text-center text-lg font-bold text-yellow-400">
                🏆 Leaderboard
            </h2>

            {loading ? (
                <p className="text-center text-sm text-gray-400 animate-pulse">
                    Loading...
                </p>
            ) : records.length === 0 ? (
                <p className="text-center text-sm text-gray-400">
                    No records yet. Win a game to appear here!
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {records.map((r, i) => (
                        <li
                            key={r.ownerId ?? i}
                            className="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-2"
                        >
                            <span className="w-8 text-lg">
                                {i < 3 ? medals[i] : `${i + 1}.`}
                            </span>
                            <span className="flex-1 truncate px-2 text-sm font-medium text-white">
                                {r.username || "Unknown"}
                            </span>
                            <span className="text-sm font-bold text-cyan-400">
                                {r.score} {r.score === 1 ? "win" : "wins"}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}