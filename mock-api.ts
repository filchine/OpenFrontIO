import express from "express";
const app = express(); app.use(express.json());

app.get("/.well-known/jwks.json", (_, res) => res.json({
  keys: [{alg:"EdDSA",crv:"Ed25519",kty:"OKP",x:"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}]
}));

app.post("/cluster/checkin", (_, res) => res.json({state:"open"}));

app.get("/api/health", (_, res) => res.json({instanceId:"standalone-1",color:"blue"}));

// map_weights for standalone mode - return empty (all maps get default weight)
app.get("/map_weights", (_, res) => res.json({maps:{}}));

app.listen(8787,"0.0.0.0",()=>console.log("[mock-api] :8787"));