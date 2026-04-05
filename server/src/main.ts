const rpcIdRewards        = "rewards_js";
const rpcIdFindMatch      = "find_match_js";
const rpcIdRecordWin      = "record_win_js";
const rpcIdGetLeaderboard = "get_leaderboard_js";

function InitModule(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    initializer: nkruntime.Initializer
) {
    initializer.registerRpc(rpcIdRewards,        rpcReward);
    initializer.registerRpc(rpcIdFindMatch,      rpcFindMatch);
    initializer.registerRpc(rpcIdRecordWin,      rpcRecordWin);
    initializer.registerRpc(rpcIdGetLeaderboard, rpcGetLeaderboard);

    initializer.registerMatch(moduleName, {
        matchInit,
        matchJoinAttempt,
        matchJoin,
        matchLeave,
        matchLoop,
        matchTerminate,
        matchSignal,
    });

    try {
        nk.leaderboardCreate("tictactoe_wins", false, nkruntime.SortOrder.DESCENDING, nkruntime.Operator.INCREMENTAL, "", {});
        logger.info("Leaderboard tictactoe_wins ready");
    } catch (e) {
        // already exists
        logger.error("Error occured in leaderboard ::: ", e)
    }

    logger.info("JavaScript logic loaded.");
}