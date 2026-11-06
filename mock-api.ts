import express from "express";
const app = express(); app.use(express.json());

app.get("/.well-known/jwks.json", (_, res) => res.json({
  keys: [{alg:"EdDSA",crv:"Ed25519",kty:"OKP",x:"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}]
}));

// cluster.json - server list endpoint (returns empty for standalone mode, client falls back to local values)
app.get("/cluster.json", (_, res) => res.json({latest: undefined, servers: {}}));

app.post("/cluster/checkin", (_, res) => res.json({state:"open"}));

app.get("/api/health", (_, res) => res.json({instanceId:"standalone-1",color:"blue"}));

// map_weights for standalone mode - return empty (all maps get default weight)
app.get("/map_weights", (_, res) => res.json({maps:{}}));

// cosmetics for standalone mode - empty catalog object
app.get("/cosmetics.json", (_, res) => res.json({
  colorPalettes: {},
  patterns: {},
  flags: {},
  crowns: {},
  skins: {},
  effects: {
    transportShipTrail: {},
    nukeTrail: {},
    nukeExplosion: {},
    structures: {},
    warship: {},
    train: {},
    railroad: {}
  },
  currencyPacks: {},
  packs: {},
  subscriptions: {},
  unlistedSubscriptions: {},
  tribeNames: {priceHard: 0, boostPriceHard: 0, boostDurationDays: 0},
  lobbyQueue: {priceHard: 0},
  promotions: []
}));

// reserved_clan_tags for standalone mode - empty array
app.get("/reserved_clan_tags", (_, res) => res.json([]));

app.listen(8787,"0.0.0.0",()=>console.log("[mock-api] :8787"));