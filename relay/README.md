# relay

The server online players meet through. A host opens a room and gets a five-letter code; up to three guests join with
it; the relay passes their messages along. It knows nothing of any game: the host's browser runs the game, and the
relay only keeps rooms apart (by code, and by the game's name) and forwards bytes.

The rules - rooms, codes, seats, who gets what - are `packages/lib/src/net/RelayRooms.ts`, which `server.mjs` imports
as it is, with Node stripping the types. The games' in-memory `LoopbackRelay` runs the same file, so the two can't
drift apart. That file must import nothing and use only TypeScript that strips away (no enums, no parameter
properties). User guide chapter 15 and the API reference's "Net" section have the details.

This folder isn't one of the npm workspaces: it has its own `package.json` and `package-lock.json`, so the root lock
(and its pinned pixi tree) never sees `ws`.

## Running it

Node 22.18 or newer.

```
npm install --prefix relay
npm start --prefix relay        # ws://localhost:8787
```

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | 8787 | Port to listen on. |
| `HOST` | every interface | Address to listen on. |
| `ALLOWED_ORIGINS` | any | Comma-separated page origins allowed to connect (`https://you.github.io`); others are refused with 401. |
| `MAX_ROOMS` | 1000 | Rooms open at once before hosting is refused as busy. |

`GET /health` answers `{ "ok": true, "rooms": 0, "peers": 0 }`. Every connection is pinged every 15 s and dropped if it
didn't answer the last ping, freeing its seat; a host who leaves closes the room for everyone in it.

A dev build of in-dungeons-we-dwell connects to `ws://localhost:8787`, so `npm start` here is all it needs.

## Testing

`server.test.mjs` starts real relays on free ports and connects with Node's own WebSocket and lib's `RelaySession`. It
runs with everything else under `npm test` at the repo root, once `npm install --prefix relay` has been run (CI runs
`npm ci --prefix relay`).

## Deploying

It runs on [Fly.io](https://fly.io) as `logic-incubator-relay`, at `wss://logic-incubator-relay.fly.dev`, set up by
`fly.toml`: one small machine (shared CPU, 256 MB) in London, Fly's TLS in front of it, `ALLOWED_ORIGINS` set to the
games' GitHub Pages origin, and `/health` as its health check. The machine stops when no one is connected and starts
again, in a second or two, for the next connection, so it costs little more than its disk while idle (a machine
running all month is about $2).

It must stay **one machine**: rooms live in the relay's memory, so a host and their guests have to reach the same
one. Deploy with `--ha=false` (Fly otherwise makes a spare) and don't scale it out.

**Deploys** are `.github/workflows/relay.yml`: a push to master that changes this folder or `RelayRooms.ts`, or a run
started by hand from the Actions tab, builds the image on Fly's builders and deploys it. It needs the repository
secret `FLY_API_TOKEN`; without it the run notes that and stops.

**Setting it up the first time** (once, with [flyctl](https://fly.io/docs/flyctl/install/) installed; Fly needs a
card on the account once its trial ends):

```
fly auth login
fly apps create logic-incubator-relay
fly tokens create deploy -a logic-incubator-relay -x 999999h
```

Put the token it prints (all of it, `FlyV1 ...` included) in this repository's Settings > Secrets and variables >
Actions as `FLY_API_TOKEN`, then run the workflow (or merge something that changes the relay). If the app name is
taken, use another and change it in `fly.toml`, the workflow's comment and in-dungeons-we-dwell's
`.github/workflows/ci-deploy.yml`, which builds the published game pointing at the relay (`RELAY_URL`).

To deploy from your own machine instead, from the repo root:

```
fly deploy . --config relay/fly.toml --dockerfile relay/Dockerfile --ignorefile relay/Dockerfile.dockerignore --ha=false
```

**Anywhere else** that runs a Docker image will do too. The image is built from the repo root, since the rules live
in `packages/lib` (`Dockerfile.dockerignore` sends only the files it needs):

```
docker build -f relay/Dockerfile -t relay .
docker run -p 8787:8787 -e ALLOWED_ORIGINS=https://you.github.io relay
```

A game served over `https` can only open `wss://` connections, so the relay needs TLS in front of it - the host's
own, or a reverse proxy. `?relay=wss://...` on a game page's address overrides the relay it was built with, to try
another.
