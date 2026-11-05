use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

use crate::lobby::Room;
use crate::models::{ClientMessage, PublicLobbyFullMessage, ServerMessage};

pub async fn handle_socket(
    socket: WebSocket,
    rooms: Arc<RwLock<std::collections::HashMap<String, Arc<RwLock<Room>>>>>,
    room_ticks: Arc<RwLock<std::collections::HashSet<String>>>,
) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Task to forward outgoing messages to WebSocket
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match serde_json::to_string(&msg) {
                Ok(text) => {
                    if sender.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Failed to serialize server message: {}", e);
                }
            }
        }
    });

    let mut current_room: Option<Arc<RwLock<Room>>> = None;
    let mut current_client_id: Option<String> = None;
    let mut current_game_id: Option<String> = None;

    while let Some(msg_result) = receiver.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                warn!("WebSocket read error: {}", e);
                break;
            }
        };

        let text = match msg {
            Message::Text(t) => t,
            Message::Binary(b) => match String::from_utf8(b) {
                Ok(s) => s,
                Err(_) => continue,
            },
            Message::Ping(_) => continue,
            Message::Pong(_) => continue,
            Message::Close(_) => break,
        };

        let client_msg: ClientMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                warn!("Failed to parse client message: {} from text: {}", e, text);
                continue;
            }
        };

        match client_msg {
            ClientMessage::Join {
                game_id,
                username,
                clan_tag,
                spectator,
                ..
            } => {
                let assigned_client_id = format!("p_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                let user_name = username.unwrap_or_else(|| "Player".to_string());
                let is_spectator = spectator.unwrap_or(false);

                let room_arc = {
                    let mut rooms_guard = rooms.write().await;
                    rooms_guard
                        .entry(game_id.clone())
                        .or_insert_with(|| {
                            info!("Creating new room {}", game_id);
                            Arc::new(RwLock::new(Room::new(
                                game_id.clone(),
                                assigned_client_id.clone(),
                                None,
                            )))
                        })
                        .clone()
                };

                {
                    let mut room = room_arc.write().await;
                    room.add_player(
                        assigned_client_id.clone(),
                        user_name,
                        clan_tag,
                        is_spectator,
                        tx.clone(),
                    );

                    if room.started {
                        // Late join / reconnect
                        let start_msg = ServerMessage::Start {
                            turns: room.turns.clone(),
                            game_start_info: crate::models::WireGameStartInfo {
                                game_id: room.game_id.clone(),
                                game_config: room.game_config.clone(),
                                players: room
                                    .clients
                                    .values()
                                    .filter(|p| !p.spectator)
                                    .map(|p| crate::models::WirePlayer {
                                        client_id: p.client_id.clone(),
                                        username: p.username.clone(),
                                        clan_tag: p.clan_tag.clone(),
                                        cosmetics: None,
                                        is_lobby_creator: Some(p.client_id == room.creator_client_id),
                                    })
                                    .collect(),
                            },
                            lobby_created_at: room.created_at,
                            my_client_id: assigned_client_id.clone(),
                            group_token: Some("selfhosted-group".to_string()),
                        };
                        let _ = tx.send(start_msg);
                    }
                }

                current_room = Some(room_arc);
                current_client_id = Some(assigned_client_id);
                current_game_id = Some(game_id);
            }
            ClientMessage::Intent { intent } => {
                if let (Some(room_arc), Some(client_id)) = (&current_room, &current_client_id) {
                    let intent_type = intent
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    if intent_type == "toggle_game_start_timer" {
                        let mut room = room_arc.write().await;
                        if !room.started {
                            room.start_game();

                            // Spawn room tick loop if not running
                            if let Some(gid) = &current_game_id {
                                let mut ticks_guard = room_ticks.write().await;
                                if !ticks_guard.contains(gid) {
                                    ticks_guard.insert(gid.clone());
                                    let r_clone = room_arc.clone();
                                    let gid_clone = gid.clone();
                                    let ticks_clone = room_ticks.clone();
                                    tokio::spawn(async move {
                                        let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
                                        loop {
                                            interval.tick().await;
                                            let mut r = r_clone.write().await;
                                            if r.clients.is_empty() {
                                                ticks_clone.write().await.remove(&gid_clone);
                                                break;
                                            }
                                            r.tick();
                                        }
                                    });
                                }
                            }
                        }
                    } else if intent_type == "update_game_config" {
                        let mut room = room_arc.write().await;
                        if let Some(config_patch) = intent.get("config") {
                            if let Some(obj) = room.game_config.as_object_mut() {
                                if let Some(patch_obj) = config_patch.as_object() {
                                    for (k, v) in patch_obj {
                                        obj.insert(k.clone(), v.clone());
                                    }
                                }
                            }
                            room.broadcast_lobby_info();
                        }
                    } else {
                        let mut room = room_arc.write().await;
                        room.queue_intent(client_id, intent);
                    }
                }
            }
            ClientMessage::Ping {} => {
                let _ = tx.send(ServerMessage::Pong {});
            }
            ClientMessage::Rejoin { game_id, .. } => {
                let assigned_client_id = format!("p_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                let rooms_guard = rooms.read().await;
                if let Some(room_arc) = rooms_guard.get(&game_id).cloned() {
                    let mut room = room_arc.write().await;
                    room.add_player(
                        assigned_client_id.clone(),
                        "Rejoined Player".to_string(),
                        None,
                        false,
                        tx.clone(),
                    );
                    if room.started {
                        let start_msg = ServerMessage::Start {
                            turns: room.turns.clone(),
                            game_start_info: crate::models::WireGameStartInfo {
                                game_id: room.game_id.clone(),
                                game_config: room.game_config.clone(),
                                players: room
                                    .clients
                                    .values()
                                    .filter(|p| !p.spectator)
                                    .map(|p| crate::models::WirePlayer {
                                        client_id: p.client_id.clone(),
                                        username: p.username.clone(),
                                        clan_tag: p.clan_tag.clone(),
                                        cosmetics: None,
                                        is_lobby_creator: Some(p.client_id == room.creator_client_id),
                                    })
                                    .collect(),
                            },
                            lobby_created_at: room.created_at,
                            my_client_id: assigned_client_id.clone(),
                            group_token: Some("selfhosted-group".to_string()),
                        };
                        let _ = tx.send(start_msg);
                    }
                    drop(room);
                    current_room = Some(room_arc);
                    current_client_id = Some(assigned_client_id);
                    current_game_id = Some(game_id);
                } else {
                    let _ = tx.send(ServerMessage::Error {
                        error: "Game not found".to_string(),
                        message: Some("The requested game does not exist on this server.".to_string()),
                    });
                }
            }
            _ => {}
        }
    }

    // Cleanup on disconnect
    if let (Some(room_arc), Some(client_id)) = (current_room, current_client_id) {
        let is_empty = {
            let mut room = room_arc.write().await;
            room.remove_player(&client_id)
        };
        if is_empty {
            if let Some(gid) = current_game_id {
                info!("Room {} is now empty, removing", gid);
                rooms.write().await.remove(&gid);
            }
        }
    }

    forward_task.abort();
}

pub async fn handle_lobbies_socket(
    mut socket: WebSocket,
    rooms: Arc<RwLock<std::collections::HashMap<String, Arc<RwLock<Room>>>>>,
) {
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(2000));
    loop {
        tokio::select! {
            _ = interval.tick() => {
                let rooms_guard = rooms.read().await;
                let mut custom_games = Vec::new();
                for room_arc in rooms_guard.values() {
                    let r = room_arc.read().await;
                    if !r.started {
                        custom_games.push(serde_json::json!({
                            "gameID": r.game_id,
                            "numClients": r.clients.len(),
                            "publicGameType": "custom",
                            "custom": true,
                            "gameConfig": r.game_config
                        }));
                    }
                }
                let msg = PublicLobbyFullMessage {
                    msg_type: "full".to_string(),
                    server_time: crate::lobby::now_ms(),
                    games: serde_json::json!({ "custom": custom_games }),
                    git_commit: Some("selfhosted".to_string()),
                    active: Some(true),
                };
                if let Ok(text) = serde_json::to_string(&msg) {
                    if socket.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
            }
            msg = socket.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
