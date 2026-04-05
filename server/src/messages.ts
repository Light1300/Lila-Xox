//  Enums 
enum Mark {
    X = 0,
    O = 1,
    UNDEFINED = 2,
}

enum OpCode {
    START = 1,
    UPDATE = 2,
    DONE = 3,
    MOVE = 4,
    REJECTED = 5
}

//  Types 
type BoardPosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
type Message = StartMessage | UpdateMessage | DoneMessage | MoveMessage | RpcFindMatchRequest | RpcFindMatchResponse
type Board = (Mark | null)[]

//  Messages 
interface StartMessage {
    board: Board
    marks: { [userID: string]: Mark | null }
    mark: Mark
    deadline: number
}

interface UpdateMessage {
    board: Board
    mark: Mark
    deadline: number
}

interface DoneMessage {
    board: Board
    winner: Mark | null
    winnerPositions: BoardPosition[] | null
    nextGameStart: number
}

interface MoveMessage {
    position: BoardPosition;
}

//  RPC 
interface RpcFindMatchRequest {
    fast: boolean
}

interface RpcFindMatchResponse {
    matchIds: string[]
}