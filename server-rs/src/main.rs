mod html;
mod lobby;
mod models;
mod routes;
mod ws;

use axum::{
    extract::{ws::WebSocketUpgrade, State},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::info;

use html::index_handler;
use routes::{create_game, game_exists, list_lobbies};
use ws::{handle_lobbies_socket, handle_socket};

#[derive(Clone)]
pub struct AppState {
    pub rooms: Arc<RwLock<HashMap<String, Arc<RwLock<lobby::Room>>>>>,
    pub room_ticks: Arc<RwLock<HashSet<String>>>,
}

async fn ws_handler(
    ws: Option<WebSocketUpgrade>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if let Some(ws) = ws {
        ws.on_upgrade(move |socket| handle_socket(socket, state.rooms, state.room_ticks))
            .into_response()
    } else {
        index_handler().await.into_response()
    }
}

async fn lobbies_handler(
    ws: Option<WebSocketUpgrade>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if let Some(ws) = ws {
        ws.on_upgrade(move |socket| handle_lobbies_socket(socket, state.rooms))
            .into_response()
    } else {
        list_lobbies(State(state)).await.into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server_rs=info,tower_http=info".into()),
        )
        .init();

    let rooms = Arc::new(RwLock::new(HashMap::new()));
    let room_ticks = Arc::new(RwLock::new(HashSet::new()));

    let state = AppState {
        rooms,
        room_ticks,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Primary HTML SPA routes
        .route("/", get(index_handler))
        .route("/index.html", get(index_handler))
        // API routes
        .route("/api/create_game", post(create_game))
        .route("/w0/api/create_game", post(create_game))
        .route("/api/game/:id/exists", get(game_exists))
        .route("/w0/api/game/:id/exists", get(game_exists))
        .route("/lobbies", get(lobbies_handler).post(list_lobbies))
        .route("/w0/lobbies", get(lobbies_handler).post(list_lobbies))
        .route("/api/lobbies", get(list_lobbies))
        // WebSocket / Game routes
        .route("/ws", get(ws_handler))
        .route("/w0", get(ws_handler))
        .route("/game/:id", get(ws_handler))
        .route("/w0/game/:id", get(ws_handler))
        // Static assets fallback
        .fallback_service(ServeDir::new("static").fallback(get(index_handler)))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("OpenFront Rust Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
