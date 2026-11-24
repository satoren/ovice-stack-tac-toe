# Stack Tac Toe — ovice Custom Plugin

A two-player tic-tac-toe for an ovice custom object, where bigger pieces can cover smaller ones.

## Rules

- 3×3 board. Blue and Orange each have 6 pieces: 2 large, 2 medium, 2 small.
- On your turn, either place a piece from your hand or move one of your own pieces that is on top of a stack.
- A piece can go on an empty cell or on top of a **strictly smaller** piece (yours or your opponent's).
- Three of your colour showing in a row wins. If lifting a piece reveals an opponent's row and it is still showing after your move, the opponent wins.

## Who can do what

- Anyone near the object (except visitors) can take a free seat with **Sit**. A seat also counts as free when the player in it has left the object.
- Only the seated player whose turn it is can move. Everyone else watches.
- **New game** can be pressed by either player or by the owner of a dynamic object. The starting colour alternates each game.

## How it works

- No build step: static HTML + React 17 UMD + Babel standalone + Tailwind CDN (`public/`).
- Shared state is kept by `public/js/hooks/useCacheStore.js`. One leader owns the cache, late joiners ask the leader for it, and the last user to leave backs it up to the object data store.
- The win toast is a broadcast event named `stack-tac-toe:toast`.

## Run locally

```bash
python3 -m http.server 8080 -d public
```

Then open it in the mock ovice host from the `test-ovice-plugin` skill:
`mock-host.html?url=http://localhost:8080/&users=3&type=static`

## Deploy

Host the `public/` folder on any HTTPS static host (GitHub Pages, S3, Netlify…), then register that URL as a custom plugin in ovice's admin settings. Bump the `?v=` query strings in `index.html` when you deploy so ovice doesn't serve cached scripts.
