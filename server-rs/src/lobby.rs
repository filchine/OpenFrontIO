use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use tracing::info;

use crate::models::{
    ClientInfo, GameInfo, ServerMessage, Turn, WireGameStartInfo, WirePlayer,
};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub struct PlayerSession {
    pub client_id: String,
    pub username: String,
    pub clan_tag: Option<String>,
    pub spectator: bool,
    pub sender: mpsc::UnboundedSender<ServerMessage>,
}

pub struct Room {
    pub game_id: String,
    pub creator_client_id: String,
    pub game_config: serde_json::Value,
    pub clients: HashMap<String, PlayerSession>,
    pub started: bool,
    pub turn_number: u64,
    pub turns: Vec<Turn>,
    pub pending_intents: Vec<serde_json::Value>,
    pub created_at: u64,
}

impl Room {
    pub fn new(game_id: String, creator_client_id: String, game_config: Option<serde_json::Value>) -> Self {
        let default_config = serde_json::json!({
            "gameMap": "World",
            "gameMapSize": "Normal",
            "gameType": "FreeForAll",
            "difficulty": "Medium",
            "bots": 10,
            "maxPlayers": 50,
            "tickRate": 10
        });

        Self {
            game_id,
            creator_client_id,
            game_config: game_config.unwrap_or(default_config),
            clients: HashMap::new(),
            started: false,
            turn_number: 0,
            turns: Vec::new(),
            pending_intents: Vec::new(),
            created_at: now_ms(),
        }
    }

    pub fn to_game_info(&self) -> GameInfo {
        let clients = self
            .clients
            .values()
            .map(|p| ClientInfo {
                client_id: p.client_id.clone(),
                username: p.username.clone(),
                clan_tag: p.clan_tag.clone(),
                spectator: Some(p.spectator),
                verified: Some(false),
            })
            .collect();

        GameInfo {
            game_id: self.game_id.clone(),
            clients,
            lobby_creator_client_id: Some(self.creator_client_id.clone()),
            starts_at: None,
            server_time: now_ms(),
            game_config: Some(self.game_config.clone()),
            public_game_type: Some("custom".to_string()),
            listed: Some(true),
        }
    }

    pub fn broadcast(&self, msg: &ServerMessage) {
        for session in self.clients.values() {
            let _ = session.sender.send(msg.clone());
        }
    }

    pub fn broadcast_lobby_info(&self) {
        let game_info = self.to_game_info();
        for session in self.clients.values() {
            let msg = ServerMessage::LobbyInfo {
                game_info: game_info.clone(),
                my_client_id: session.client_id.clone(),
            };
            let _ = session.sender.send(msg);
        }
    }

    pub fn add_player(
        &mut self,
        client_id: String,
        username: String,
        clan_tag: Option<String>,
        spectator: bool,
        sender: mpsc::UnboundedSender<ServerMessage>,
    ) {
        let session = PlayerSession {
            client_id: client_id.clone(),
            username,
            clan_tag,
            spectator,
            sender,
        };
        self.clients.insert(client_id, session);

        if !self.started {
            self.broadcast_lobby_info();
        }
    }

    pub fn remove_player(&mut self, client_id: &str) -> bool {
        self.clients.remove(client_id);
        if !self.started {
            if self.creator_client_id == client_id {
                if let Some(new_creator) = self.clients.keys().next() {
                    self.creator_client_id = new_creator.clone();
                }
            }
            self.broadcast_lobby_info();
        }
        self.clients.is_empty()
    }

    pub fn start_game(&mut self) {
        if self.started {
            return;
        }
        self.started = true;
        info!("Room {} game started with {} players", self.game_id, self.clients.len());

        let players: Vec<WirePlayer> = self
            .clients
            .values()
            .filter(|p| !p.spectator)
            .map(|p| WirePlayer {
                client_id: p.client_id.clone(),
                username: p.username.clone(),
                clan_tag: p.clan_tag.clone(),
                cosmetics: None,
                is_lobby_creator: Some(p.client_id == self.creator_client_id),
            })
            .collect();

        let game_start_info = WireGameStartInfo {
            game_id: self.game_id.clone(),
            game_config: self.game_config.clone(),
            players,
        };

        for session in self.clients.values() {
            let msg = ServerMessage::Start {
                turns: Vec::new(),
                game_start_info: game_start_info.clone(),
                lobby_created_at: self.created_at,
                my_client_id: session.client_id.clone(),
                group_token: Some("selfhosted-group".to_string()),
            };
            let _ = session.sender.send(msg);
        }
    }

    pub fn queue_intent(&mut self, client_id: &str, mut intent: serde_json::Value) {
        if let Some(obj) = intent.as_object_mut() {
            obj.insert("clientID".to_string(), serde_json::Value::String(client_id.to_string()));
        }
        self.pending_intents.push(intent);
    }

    pub fn tick(&mut self) -> Option<ServerMessage> {
        if !self.started {
            return None;
        }

        self.turn_number += 1;
        let intents = std::mem::take(&mut self.pending_intents);

        let turn = Turn {
            turn_number: self.turn_number,
            intents,
            hash: None,
        };

        self.turns.push(turn.clone());

        let msg = ServerMessage::Turn { turn };
        self.broadcast(&msg);
        Some(msg)
    }
}
