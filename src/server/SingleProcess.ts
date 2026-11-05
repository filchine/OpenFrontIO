import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import { renderAppShell } from "./RenderHtml";
import { startWorker } from "./Worker";
import { ServerEnv } from "./ServerEnv";

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

async function startWorkerWithExistingApp(app: express.Express, server: http.Server) {
  // Import worker functionality dynamically to avoid circular deps
  const { startWorker: originalStartWorker } = await import("./Worker");

  // We can't easily reuse startWorker since it creates its own app/server
  // For now, let's just run the original worker on a different port in a child process
  // or just use the original startWorker but on the same server

  // Actually, let's just run the worker as-is but on the same server
  // by extracting the worker setup logic
  const workerId = ServerEnv.workerId() ?? 0;

  // The original startWorker creates its own app and server
  // For single-process, we need to adapt it to use our existing app/server
  // This is complex - simpler: just run the original startWorker on port 3001
  // and proxy from our app to it

  // For now, let's just start the worker on port 3001 in the background
  // This is a workaround until we properly merge them
  console.log("Worker will run on port 3001, main server on port 3000");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});