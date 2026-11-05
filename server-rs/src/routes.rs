use axum::{
    extract::{Path, State},
    response::Json,
};
use serde_json::{json, Value};

use crate::lobby::{now_ms, Room};
use crate::AppState;

pub async fn create_game(
    State(state): State<AppState>,
    payload: Option<Json<Value>>,
) -> Json<Value> {
    let game_id = format!("g_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..10]);
    let creator_id = format!("p_{}", &uuid::Uuid::new_v4().to_string()[..8]);

    let config = payload.map(|Json(val)| val);
    let room = std::sync::Arc::new(tokio::sync::RwLock::new(Room::new(game_id.clone(), creator_id.clone(), config)));

    let game_info = {
        let r = room.read().await;
        r.to_game_info()
    };

    state.rooms.write().await.insert(game_id.clone(), room);

    Json(json!(game_info))
}

pub async fn game_exists(
    State(state): State<AppState>,
    Path(game_id): Path<String>,
) -> Json<Value> {
    let exists = state.rooms.read().await.contains_key(&game_id);
    Json(json!({ "exists": exists }))
}

pub async fn list_lobbies(
    State(state): State<AppState>,
) -> Json<Value> {
    let rooms_guard = state.rooms.read().await;
    let mut custom_games = Vec::new();

    for room_arc in rooms_guard.values() {
        let r = room_arc.read().await;
        if !r.started {
            custom_games.push(json!({
                "gameID": r.game_id,
                "numClients": r.clients.len(),
                "publicGameType": "custom",
                "custom": true,
                "gameConfig": r.game_config
            }));
        }
    }

    Json(json!({
        "serverTime": now_ms(),
        "games": {
            "custom": custom_games
        }
    }))
}
