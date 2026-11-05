use axum::response::Html;
use tracing::warn;

pub fn render_index_html() -> String {
    let raw = match std::fs::read_to_string("static/index.html") {
        Ok(s) => s,
        Err(_) => match std::fs::read_to_string("index.html") {
            Ok(s) => s,
            Err(e) => {
                warn!("Failed to read index.html: {}", e);
                return "<html><body><h1>OpenFront Self-Hosted Server</h1></body></html>".to_string();
            }
        },
    };

    let manifest_str = std::fs::read_to_string("static/asset-manifest.json")
        .unwrap_or_else(|_| "{}".to_string());

    let mut html = raw;

    // Replace CDN placeholders
    html = html.replace("<%- locals.cdnBaseRaw || \"\" %>", "");
    html = html.replace("<%- cdnBaseRaw %>", "");
    html = html.replace("<%- manifestHref %>", "/manifest.json");
    html = html.replace("<%- faviconHref %>", "/images/Favicon.svg");
    html = html.replace("<%- backgroundImageUrl %>", "/images/background.webp");
    html = html.replace("<%- mobileLogoImageUrl %>", "/images/OpenFrontLogo.svg");
    html = html.replace("<%- desktopLogoImageUrl %>", "/images/OpenFront.png");
    html = html.replace("<%- gameplayScreenshotUrl %>", "/images/GameplayScreenshot.png");

    // Replace BOOTSTRAP_CONFIG block
    let start_marker = "window.BOOTSTRAP_CONFIG = {";
    let end_marker = "};";

    if let Some(start_idx) = html.find(start_marker) {
        if let Some(end_offset) = html[start_idx..].find(end_marker) {
            let end_idx = start_idx + end_offset + end_marker.len();
            let config_replacement = format!(
                r#"window.BOOTSTRAP_CONFIG = {{
        gitCommit: "selfhosted",
        assetManifest: {},
        cdnBase: "",
        gameEnv: "dev",
        cluster: {{"a": {{"version": "selfhosted", "numWorkers": 1}}}},
        instanceLetter: "a",
        turnstileSiteKey: "",
        jwtAudience: "localhost"
      }};"#,
                manifest_str.trim()
            );
            html.replace_range(start_idx..end_idx, &config_replacement);
        }
    }

    html
}

pub async fn index_handler() -> Html<String> {
    Html(render_index_html())
}
