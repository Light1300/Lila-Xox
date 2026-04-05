let rpcFindMatch: nkruntime.RpcFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) throw Error("No user ID in context");
    if (!payload) throw Error("Expects payload.");

    let request = {} as RpcFindMatchRequest;
    try {
        request = JSON.parse(payload);
    } catch (error) {
        logger.error("Error parsing json message: %q", error);
        throw error;
    }

    let matches: nkruntime.Match[];
    try {
        const query = `+label.open:1 +label.fast:${request.fast ? 1 : 0}`;
        matches = nk.matchList(10, true, null, null, 1, query);
    } catch (error) {
        logger.error("Error listing matches: %v", error);
        throw error;
    }

    let matchIds: string[] = [];
    if (matches.length > 0) {
        matchIds = matches.map(m => m.matchId);
    } else {
        try {
            matchIds.push(nk.matchCreate(moduleName, { fast: request.fast }));
        } catch (error) {
            logger.error("Error creating match: %v", error);
            throw error;
        }
    }

    let res: RpcFindMatchResponse = { matchIds };
    return JSON.stringify(res);
}

let rpcRecordWin: nkruntime.RpcFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    try {
        const userId = ctx.userId as string;
        const username = ctx.username ?? "";
        nk.leaderboardRecordWrite("tictactoe_wins", userId, username, 1, 0, {});
        logger.info("Win recorded for: %s", userId);
        return JSON.stringify({ success: true });
    } catch (e) {
        logger.error("recordWin error: %v", e);
        return JSON.stringify({ success: false });
    }
}

let rpcGetLeaderboard: nkruntime.RpcFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    try {
        const result = nk.leaderboardRecordsList("tictactoe_wins", [], 10, undefined, 0);
        return JSON.stringify(result.records ?? []);
    } catch (e) {
        logger.error("getLeaderboard error: %v", e);
        return JSON.stringify([]);
    }
}