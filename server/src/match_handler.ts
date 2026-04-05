//  Constants 
const moduleName = "tic-tac-toe_js";
const tickRate = 5;
const maxEmptySec = 30;
const delaybetweenGamesSec = 5;
const turnTimeFastSec = 10;
const turnTimeNormalSec = 20;

const winningPositions: number[][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
]

//  Interfaces 
interface MatchLabel {
    open: number
    fast: number
}

interface State {
    label: MatchLabel
    emptyTicks: number
    presences: { [userId: string]: nkruntime.Presence | null }
    joinsInProgress: number
    playing: boolean
    board: Board
    marks: { [userId: string]: Mark | null }
    mark: Mark
    deadlineRemainingTicks: number
    winner: Mark | null
    winnerPositions: BoardPosition[] | null
    nextGameRemainingTicks: number
}

//  Match Lifecycle 
let matchInit: nkruntime.MatchInitFunction<State> = function (ctx, logger, nk, params) {
    const fast = !!params['fast'];

    var label: MatchLabel = { open: 1, fast: fast ? 1 : 0 };

    var state: State = {
        label,
        emptyTicks: 0,
        presences: {},
        joinsInProgress: 0,
        playing: false,
        board: [],
        marks: {},
        mark: Mark.UNDEFINED,
        deadlineRemainingTicks: 0,
        winner: null,
        winnerPositions: null,
        nextGameRemainingTicks: 0,
    }

    return {
        state,
        tickRate,
        label: JSON.stringify(label),
    }
}

let matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<State> = function (ctx, logger, nk, dispatcher, tick, state, presence) {
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            state.joinsInProgress++;
            return { state, accept: false }
        } else {
            return { state, accept: false, rejectMessage: 'already joined' }
        }
    }

    if (connectedPlayers(state) + state.joinsInProgress >= 2) {
        return { state, accept: false, rejectMessage: 'match full' };
    }

    state.joinsInProgress++;
    return { state, accept: true }
}

let matchJoin: nkruntime.MatchJoinFunction<State> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    const t = msecToSec(Date.now());

    for (const presence of presences) {
        state.emptyTicks = 0;
        state.presences[presence.userId] = presence;
        state.joinsInProgress--;

        if (state.playing) {
            let update: UpdateMessage = {
                board: state.board,
                mark: state.mark,
                deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
            }
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify(update));
        } else if (state.board.length !== 0 && Object.keys(state.marks).length !== 0 && state.marks[presence.userId]) {
            let done: DoneMessage = {
                board: state.board,
                winner: state.winner,
                winnerPositions: state.winnerPositions,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate)
            }
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(done))
        }
    }

    if (Object.keys(state.presences).length >= 2 && state.label.open != 0) {
        state.label.open = 0;
        dispatcher.matchLabelUpdate(JSON.stringify(state.label));
    }

    return { state };
}

let matchLeave: nkruntime.MatchLeaveFunction<State> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (let presence of presences) {
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }

    return { state };
}

//  Game Loop 
let matchLoop: nkruntime.MatchLoopFunction<State> = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            return null;
        }
    }

    let t = msecToSec(Date.now());

    if (!state.playing) {
        for (let userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }

        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            dispatcher.matchLabelUpdate(JSON.stringify(state.label));
        }

        if (Object.keys(state.presences).length < 2) {
            return { state };
        }

        if (state.nextGameRemainingTicks > 0) {
            state.nextGameRemainingTicks--
            return { state };
        }

        state.playing = true;
        state.board = new Array(9);
        state.marks = {};
        let marks = [Mark.X, Mark.O];

        Object.keys(state.presences).forEach(userId => {
            state.marks[userId] = marks.shift() ?? null;
        });

        state.mark = Mark.X;
        state.winner = null;
        state.winnerPositions = null;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;

        let msg: StartMessage = {
            board: state.board,
            marks: state.marks,
            mark: state.mark,
            deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
        }
        dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));

        return { state };
    }

    for (const message of messages) {
        switch (message.opCode) {
            case OpCode.MOVE:
                let mark = state.marks[message.sender.userId] ?? null;
                if (mark === null || state.mark != mark) {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }

                let msg = {} as MoveMessage;
                try {
                    msg = JSON.parse(nk.binaryToString(message.data));
                } catch {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }

                if (state.board[msg.position]) {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }

                state.board[msg.position] = mark;
                state.mark = mark === Mark.O ? Mark.X : Mark.O;
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);

                const [winner, winningPos] = winCheck(state.board, mark);
                if (winner) {
                    state.winner = mark;
                    state.winnerPositions = winningPos;
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }

                let tie = state.board.every(v => v !== null);
                if (tie) {
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }

                let opCode: OpCode
                let outgoingMsg: Message

                if (state.playing) {
                    opCode = OpCode.UPDATE
                    outgoingMsg = {
                        board: state.board,
                        mark: state.mark,
                        deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                    }
                } else {
                    opCode = OpCode.DONE
                    outgoingMsg = {
                        board: state.board,
                        winner: state.winner,
                        winnerPositions: state.winnerPositions,
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                    }
                }

                dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
                break;

            default:
                dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
        }
    }

    if (state.playing) {
        state.deadlineRemainingTicks--;
        if (state.deadlineRemainingTicks <= 0) {
            state.playing = false;
            state.winner = state.mark === Mark.O ? Mark.X : Mark.O;
            state.deadlineRemainingTicks = 0;
            state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;

            let msg: DoneMessage = {
                board: state.board,
                winner: state.winner,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                winnerPositions: null,
            }
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
        }
    }

    return { state };
}

//  Utility Functions 
let matchTerminate: nkruntime.MatchTerminateFunction<State> = function (ctx, logger, nk, dispatcher, tick, state) {
    return { state };
}

let matchSignal: nkruntime.MatchSignalFunction<State> = function (ctx, logger, nk, dispatcher, tick, state) {
    return { state };
}

function calculateDeadlineTicks(l: MatchLabel): number {
    return l.fast === 1 ? turnTimeFastSec * tickRate : turnTimeNormalSec * tickRate;
}

function winCheck(board: Board, mark: Mark): [boolean, Mark[] | null] {
    for (let wp of winningPositions) {
        if (board[wp[0]] === mark &&
            board[wp[1]] === mark &&
            board[wp[2]] === mark) {
            return [true, wp];
        }
    }
    return [false, null];
}

function connectedPlayers(s: State): number {
    let count = 0;
    for (const p of Object.keys(s.presences)) {
        if (s.presences[p] !== null) count++;
    }
    return count;
}