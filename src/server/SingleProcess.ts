import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import { renderAppShell } from "./RenderHtml";

// Load environment variables before we read configuration values derived from them.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run the server in single-process mode (combines master + worker)
async function main() {
  console.log("Starting single-process server...");

  const app = express();
  const server = http.createServer(app);

  // Serve the app shell for the root document (like Master does)
  app.use(async (req, res, next) => {
    if (req.path === "/") {
      try {
        await renderAppShell(
          res,
          path.join(__dirname, "../../static/index.html"),
        );
      } catch (error) {
        console.error("Error rendering index.html:", error);
        res.status(500).send("Internal Server Error");
      }
    } else {
      next();
    }
  });

  // Now initialize the worker functionality
  await startWorkerWithExistingApp(app, server);

  // Start the combined server on port 3000
  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Single-process server listening on port ${PORT}`);
  });
}

async function startWorkerWithExistingApp(_app: express.Express, _server: http.Server) {
  // For now, let's just start the worker on port 3001 in the background
  console.log("Worker will run on port 3001, main server on port 3000");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});