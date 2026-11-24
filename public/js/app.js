// Stack Tac Toe — a 2-player tic-tac-toe where bigger pieces can cover smaller ones.
//
// Rules
// - 3x3 board. Each player has 6 pieces: 2 small, 2 medium, 2 large.
// - On your turn, either place a piece from your hand or move one of your own pieces that
//   is on top of a stack. A piece may go on an empty cell or on top of a strictly smaller
//   piece (yours or your opponent's).
// - Three of your colour visible in a row wins. If your move reveals an opponent's line
//   (by lifting a piece) and it is still visible after the move, the opponent wins.
//
// Shared state lives in useCacheStore (leader-owned cache, backed up to the object data
// store). The cache is flat: the board is a JSON string.

const EVENT_PREFIX = 'stack-tac-toe:';
const COLORS = ['b', 'o'];
const COLOR_NAME = { b: 'Blue', o: 'Orange' };
const COLOR_CLASS = {
  b: { piece: 'bg-sky-500 border-sky-700', text: 'text-sky-600', ring: 'ring-sky-400' },
  o: { piece: 'bg-orange-400 border-orange-600', text: 'text-orange-600', ring: 'ring-orange-400' },
};
const SIZES = [3, 2, 1];
const PIECES_PER_SIZE = 2;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const emptyBoard = () => Array.from({ length: 9 }, () => []);
const parseBoard = s => {
  try {
    const b = JSON.parse(s);
    if (Array.isArray(b) && b.length === 9) return b;
  } catch (e) {}
  return emptyBoard();
};
const topOf = stack => (stack.length ? stack[stack.length - 1] : null);
const colorOf = piece => piece && piece[0];
const sizeOf = piece => (piece ? Number(piece[1]) : 0);
const other = c => (c === 'b' ? 'o' : 'b');

function handOf(board, color) {
  const hand = { 1: PIECES_PER_SIZE, 2: PIECES_PER_SIZE, 3: PIECES_PER_SIZE };
  board.forEach(stack => stack.forEach(p => colorOf(p) === color && hand[sizeOf(p)]--));
  return hand;
}

function linesFor(board, color) {
  return LINES.filter(line => line.every(i => colorOf(topOf(board[i])) === color));
}

function canPlace(board, size, to, from) {
  if (from === to) return false;
  return sizeOf(topOf(board[to])) < size;
}

// Returns the next game state, or null if the move is illegal.
function applyMove(state, color, from, size, to) {
  const board = state.board.map(s => s.slice());
  let piece;
  if (from === 'hand') {
    if (handOf(board, color)[size] <= 0) return null;
    piece = color + size;
  } else {
    piece = topOf(board[from]);
    if (colorOf(piece) !== color) return null;
    size = sizeOf(piece);
  }
  if (!canPlace(board, size, to, from)) return null;
  if (from !== 'hand') board[from].pop();
  board[to].push(piece);

  const theirs = linesFor(board, other(color));
  const mine = linesFor(board, color);
  let winner = '';
  let line = [];
  if (theirs.length) {
    winner = other(color);
    line = theirs[0];
  } else if (mine.length) {
    winner = color;
    line = mine[0];
  }
  return {
    board,
    turn: winner ? state.turn : other(color),
    winner,
    line,
    last: { from, to },
  };
}

// ---------- UI pieces ----------

const PIECE_SCALE = { 1: '42%', 2: '66%', 3: '90%' };

function Piece({ piece, highlight }) {
  if (!piece) return null;
  const c = COLOR_CLASS[colorOf(piece)];
  const d = PIECE_SCALE[sizeOf(piece)];
  return (
    <div
      className={`rounded-full border-2 shadow ${c.piece} ${highlight ? 'ring-4 ring-yellow-300' : ''}`}
      style={{ width: d, height: d }}
    />
  );
}

function Hand({ color, hand, active, selected, onSelect }) {
  const items = [];
  SIZES.forEach(size => {
    for (let i = 0; i < hand[size]; i++) items.push({ size, key: `${size}-${i}` });
  });
  return (
    <div className="flex items-center gap-1 h-9">
      {items.length === 0 && <span className="text-xs text-gray-400">no pieces in hand</span>}
      {items.map(({ size, key }, idx) => {
        const isSel =
          selected && selected.from === 'hand' && selected.size === size &&
          items.findIndex(it => it.size === size) === idx;
        return (
          <button
            key={key}
            disabled={!active}
            onClick={() => onSelect(size)}
            className={`w-9 h-9 flex items-center justify-center rounded ${
              active ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'
            } ${isSel ? 'bg-yellow-100 ring-2 ring-yellow-400' : ''}`}
          >
            <Piece piece={color + size} />
          </button>
        );
      })}
    </div>
  );
}

function PlayerBar({ color, seat, isMe, isTurn, winner, canSit, onSit, onLeave, children }) {
  const c = COLOR_CLASS[color];
  return (
    <div className={`rounded px-1 ${isTurn && !winner ? 'bg-gray-50 ring-1 ' + c.ring : ''}`}>
      <div className="flex items-center gap-1 text-xs h-5">
        <span className={`font-bold ${c.text}`}>{COLOR_NAME[color]}</span>
        {seat ? (
          <span className="truncate">
            {seat.name}
            {isMe && <span className="text-gray-400"> (you)</span>}
          </span>
        ) : (
          <span className="text-gray-400">empty seat</span>
        )}
        {winner === color && <span className="font-bold">🏆</span>}
        <span className="flex-1" />
        {canSit && (
          <button className="px-2 rounded bg-gray-800 text-white" onClick={onSit}>
            Sit
          </button>
        )}
        {isMe && (
          <button className="px-2 rounded border text-gray-500" onClick={onLeave}>
            Leave
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------- App ----------

function App() {
  const client = useCustomObjectClient();
  const { user, users, isHost, broadcast, onMessageEvent } = client;
  const { cache, updateCache } = useCacheStore({ ...client, enableBackup: true });

  const state = {
    board: parseBoard(cache.board),
    turn: cache.turn || 'b',
    winner: cache.winner || '',
    line: cache.line ? String(cache.line).split(',').filter(Boolean).map(Number) : [],
    last: cache.last || null,
    starter: cache.starter || 'b',
    seats: { b: cache.pb || null, o: cache.po || null },
  };

  const [selected, setSelected] = React.useState(null); // { from: 'hand'|index, size }
  const [toast, setToast] = React.useState(null);

  const presentIds = new Set(users.map(u => String(u.id)));
  const myId = user.id ? String(user.id) : null;
  const myColor = COLORS.find(c => state.seats[c] && String(state.seats[c].id) === myId) || null;
  const isMyTurn = !!myColor && state.turn === myColor && !state.winner;
  const seatFree = c => !state.seats[c] || !presentIds.has(String(state.seats[c].id));
  const canSit = c => !!myId && !myColor && !user.isVisitor && seatFree(c);
  const canReset = !!myColor || isHost;

  // Clear the selection whenever the shared state changes under us.
  React.useEffect(() => setSelected(null), [cache.board, cache.turn]);

  // Fire-and-forget notifications (e.g. "X wins!") for everyone on the object.
  React.useEffect(
    () =>
      onMessageEvent(m => {
        if (m.event !== EVENT_PREFIX + 'toast') return;
        if (String(m.source) === myId) return;
        setToast(m.message.text);
      }),
    [onMessageEvent, myId]
  );
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const save = next =>
    updateCache({
      board: JSON.stringify(next.board),
      turn: next.turn,
      winner: next.winner,
      line: next.line.join(','),
      last: next.last,
      starter: next.starter,
      pb: next.seats.b,
      po: next.seats.o,
    });

  const sit = c => {
    save({ ...state, seats: { ...state.seats, [c]: { id: myId, name: user.name || 'Guest' } } });
  };
  const leave = () => save({ ...state, seats: { ...state.seats, [myColor]: null } });

  const reset = () => {
    const starter = other(state.starter);
    save({ ...state, board: emptyBoard(), turn: starter, starter, winner: '', line: [], last: null });
  };

  const clickCell = i => {
    if (!isMyTurn) return;
    const piece = topOf(state.board[i]);
    if (selected) {
      if (selected.from === i) return setSelected(null);
      const next = applyMove(state, myColor, selected.from, selected.size, i);
      if (next) {
        save({ ...state, ...next });
        setSelected(null);
        if (next.winner) {
          const text = `${COLOR_NAME[next.winner]} (${(state.seats[next.winner] && state.seats[next.winner].name) || '?'}) wins!`;
          setToast(text);
          broadcast(EVENT_PREFIX + 'toast', { text });
        }
        return;
      }
    }
    if (colorOf(piece) === myColor) setSelected({ from: i, size: sizeOf(piece) });
    else setSelected(null);
  };

  const selectFromHand = size => {
    if (!isMyTurn) return;
    if (selected && selected.from === 'hand' && selected.size === size) setSelected(null);
    else setSelected({ from: 'hand', size });
  };

  const isTarget = i =>
    selected && canPlace(state.board, selected.size, i, selected.from);

  const renderPlayer = c => (
    <PlayerBar
      color={c}
      seat={state.seats[c]}
      isMe={myColor === c}
      isTurn={state.turn === c}
      winner={state.winner}
      canSit={canSit(c)}
      onSit={() => sit(c)}
      onLeave={leave}
    >
      <Hand
        color={c}
        hand={handOf(state.board, c)}
        active={isMyTurn && myColor === c}
        selected={myColor === c ? selected : null}
        onSelect={selectFromHand}
      />
    </PlayerBar>
  );

  let status;
  if (state.winner) status = `${COLOR_NAME[state.winner]} wins!`;
  else if (!state.seats.b || !state.seats.o) status = 'Waiting for players…';
  else if (isMyTurn) status = selected ? 'Choose where to put it' : 'Your turn — pick a piece';
  else status = `${COLOR_NAME[state.turn]}'s turn`;

  // The player at the bottom is "me" (or Blue for spectators).
  const bottom = myColor || 'b';

  return (
    <div className="h-screen flex flex-col gap-1 p-2 text-sm select-none overflow-hidden">
      {renderPlayer(other(bottom))}

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          className="grid grid-cols-3 gap-1 bg-gray-300 p-1 rounded-lg h-full max-h-full"
          style={{ aspectRatio: '1 / 1', maxWidth: '100%' }}
        >
          {state.board.map((stack, i) => {
            const target = isTarget(i);
            const isLast = state.last && (state.last.to === i);
            return (
              <button
                key={i}
                onClick={() => clickCell(i)}
                className={`relative bg-white rounded flex items-center justify-center ${
                  target ? 'bg-yellow-50 ring-2 ring-yellow-300' : ''
                } ${selected && selected.from === i ? 'ring-2 ring-yellow-500' : ''} ${
                  isLast ? 'bg-gray-50' : ''
                }`}
                style={{ aspectRatio: '1 / 1' }}
              >
                <Piece piece={topOf(stack)} highlight={state.line.includes(i)} />
                {stack.length > 1 && (
                  <span className="absolute top-0 left-0.5 z-10 text-[10px] leading-none text-gray-500">
                    ×{stack.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {renderPlayer(bottom)}

      <div className="flex items-center gap-2 h-6">
        <span className="flex-1 truncate font-medium">{toast || status}</span>
        {canReset && (state.winner || state.last) && (
          <button className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs" onClick={reset}>
            New game
          </button>
        )}
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
