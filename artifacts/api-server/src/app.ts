import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSession = connectPgSimple(session);

const app: Express = express();

// Trust the Replit reverse proxy so cookies work correctly behind HTTPS
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.use(
  session({
    // Do NOT use createTableIfMissing — esbuild loses the table.sql file path.
    // The table is created explicitly in index.ts before the server starts.
    store: new PgSession({ pool, tableName: "session" }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

app.use("/api", router);


import { join } from "path";
import { existsSync } from "fs";
 
// Serve built frontend in production
// (Dockerfile copies artifacts/meet-app/dist → /public)
if (process.env["NODE_ENV"] === "production") {
  const publicDir = join(process.cwd(), "public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // Send index.html for any unmatched route (React SPA routing)
    app.get("*", (_req, res) => {
      res.sendFile(join(publicDir, "index.html"));
    });
  }
}
 
export default app;

