use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "join")]
    Join {
        #[serde(rename = "gameID")]
        game_id: String,
        #[serde(default)]
        token: Option<String>,
        #[serde(default)]
        username: Option<String>,
        #[serde(rename = "clanTag", default)]
        clan_tag: Option<String>,
        #[serde(default)]
        spectator: Option<bool>,
        #[serde(rename = "gitCommit", default)]
        git_commit: Option<String>,
    },
    #[serde(rename = "intent")]
    Intent {
        intent: serde_json::Value,
    },
    #[serde(rename = "ping")]
    Ping {},
    #[serde(rename = "rejoin")]
    Rejoin {
        #[serde(rename = "gameID")]
        game_id: String,
        #[serde(rename = "lastTurn")]
        last_turn: u64,
        #[serde(default)]
        token: Option<String>,
    },
    #[serde(rename = "spectate")]
    Spectate {
        spectator: bool,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "lobby_info")]
    LobbyInfo {
        #[serde(rename = "gameInfo")]
        game_info: GameInfo,
        #[serde(rename = "myClientID")]
        my_client_id: String,
    },
    #[serde(rename = "start")]
    Start {
        turns: Vec<Turn>,
        #[serde(rename = "gameStartInfo")]
        game_start_info: WireGameStartInfo,
        #[serde(rename = "lobbyCreatedAt")]
        lobby_created_at: u64,
        #[serde(rename = "myClientID")]
        my_client_id: String,
        #[serde(rename = "groupToken", skip_serializing_if = "Option::is_none")]
        group_token: Option<String>,
    },
    #[serde(rename = "turn")]
    Turn {
        turn: Turn,
    },
    #[serde(rename = "ping")]
    Ping {},
    #[serde(rename = "pong")]
    Pong {},
    #[serde(rename = "error")]
    Error {
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    #[serde(rename = "turnNumber")]
    pub turn_number: u64,
    pub intents: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    #[serde(rename = "clientID")]
    pub client_id: String,
    pub username: String,
    #[serde(rename = "clanTag", skip_serializing_if = "Option::is_none")]
    pub clan_tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spectator: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInfo {
    #[serde(rename = "gameID")]
    pub game_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub clients: Vec<ClientInfo>,
    #[serde(rename = "lobbyCreatorClientID", skip_serializing_if = "Option::is_none")]
    pub lobby_creator_client_id: Option<String>,
    #[serde(rename = "startsAt", skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<u64>,
    #[serde(rename = "serverTime")]
    pub server_time: u64,
    #[serde(rename = "gameConfig", skip_serializing_if = "Option::is_none")]
    pub game_config: Option<serde_json::Value>,
    #[serde(rename = "publicGameType", skip_serializing_if = "Option::is_none")]
    pub public_game_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub listed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WirePlayer {
    #[serde(rename = "clientID")]
    pub client_id: String,
    pub username: String,
    #[serde(rename = "clanTag", skip_serializing_if = "Option::is_none")]
    pub clan_tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cosmetics: Option<serde_json::Value>,
    #[serde(rename = "isLobbyCreator", skip_serializing_if = "Option::is_none")]
    pub is_lobby_creator: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireGameStartInfo {
    #[serde(rename = "gameID")]
    pub game_id: String,
    #[serde(rename = "gameConfig")]
    pub game_config: serde_json::Value,
    pub players: Vec<WirePlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicLobbyFullMessage {
    #[serde(rename = "type")]
    pub msg_type: String, // "full"
    #[serde(rename = "serverTime")]
    pub server_time: u64,
    pub games: serde_json::Value,
    #[serde(rename = "gitCommit", skip_serializing_if = "Option::is_none")]
    pub git_commit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
}
