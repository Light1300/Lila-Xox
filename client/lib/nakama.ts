import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import { v4 as uuidv4 } from "uuid";
import { OpCode } from "@/lib/messages";

class GameState {
    public playerIndex = 0;
}

class Nakama {
    public client: Client;
    public session: Session | null = null;
    public socket: Socket | null = null;
    public matchId: string | null = null;
    public gameState: GameState = new GameState();

    constructor() {
        this.client = new Client(
            "defaultkey",
            process.env.NEXT_PUBLIC_SERVER_API,
            process.env.NEXT_PUBLIC_SERVER_PORT,
            process.env.NEXT_PUBLIC_USE_SSL === "true"
        );
    }

    async authenticate(): Promise<void> {
        let deviceId = localStorage.getItem("deviceId");
        if (!deviceId) {
            deviceId = uuidv4();
            localStorage.setItem("deviceId", deviceId);
        }
        try {
            this.session = await this.client.authenticateDevice(deviceId, true);
        } catch (err: any) {
            console.error("Auth error:", err.statusCode, err.message);
            return;
        }
        if (!this.session?.user_id) return;
        localStorage.setItem("user_id", this.session.user_id);

        const useSSL = process.env.NEXT_PUBLIC_USE_SSL === "true";
        this.socket = this.client.createSocket(useSSL, false);

        // Handle socket errors gracefully
        this.socket.ondisconnect = (event) => {
            console.log("Socket disconnected:", event);
        };

        try {
            await this.socket.connect(this.session, true);
            console.log("Socket connected successfully");
        } catch (err) {
            console.error("Socket connection failed:", err);
            this.socket = null;
        }
    }

    async findMatch(): Promise<void> {
        const rpc_name = "find_match_js";
        if (!this.session || !this.socket) {
            console.log("Session or socket not found");
            return;
        }
        try {
            const matches = await this.client.rpc(this.session, rpc_name, {});
            if (typeof matches === "object" && matches !== null) {
                const safeParsedJson = matches as { payload: { matchIds: string[] } };
                this.matchId = safeParsedJson.payload.matchIds[0];
                await this.socket.joinMatch(this.matchId);
                console.log("Match joined:", this.matchId);
            }
        } catch (err) {
            console.error("findMatch error:", err);
        }
    }

    async makeMove(index: number): Promise<void> {
        if (!this.socket || !this.matchId) return;
        const data = { position: index };
        await this.socket.sendMatchState(this.matchId, OpCode.MOVE, JSON.stringify(data));
    }

    async recordWin(): Promise<void> {
        if (!this.session) return;
        try {
            await this.client.rpc(this.session, "record_win_js", {});
            console.log("Win recorded!");
        } catch (e) {
            console.error("Failed to record win:", e);
        }
    }

    async getLeaderboard(): Promise<any[]> {
        if (!this.session) return [];
        try {
            const result = await this.client.rpc(this.session, "get_leaderboard_js", {});
            const payload = result.payload;
            if (Array.isArray(payload)) return payload;
            if (typeof payload === "string") return JSON.parse(payload);
            return [];
        } catch (e) {
            console.error("Failed to get leaderboard:", e);
            return [];
        }
    }
}

export default Nakama;
