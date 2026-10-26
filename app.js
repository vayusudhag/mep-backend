// app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import cookieParser from "cookie-parser";

// routes
import userRoutes from "./routes/auth.routes.js";
import eventRoutes from "./routes/event.routes.js";
import teamRoutes from "./routes/team.routes.js";
import eventRegistraionRoutes from "./routes/eventRegistration.routes.js";
import adminRegistrationRoutes from "./routes/adminEventRegistration.routes.js";
import performanceRoutes from "./routes/performance.routes.js";
import eventDayRoutes from "./routes/eventDay.routes.js";
import eventDayEntryRoutes from "./routes/eventDayEntry.routes.js";
import leaderboardRoutes from "./routes/leaderboard.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import bullRoutes from "./routes/bull.routes.js";
import bullProfileRoutes from "./routes/bullProfile.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import adminManagementRoutes from "./routes/adminManagement.routes.js";

// global error handler

import { globalErrorHandler } from "./middleware/error.middleware.js";

const app = express();

// Behind a reverse proxy (Vercel/Render/Nginx): needed so req.ip and the
// rate limiters see the real client IP instead of the proxy's.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

// Security headers
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      const allowed = new Set([
        "http://localhost:5174",
        "http://localhost:5173",
        "https://manaedlapandalu.com",
        "https://www.manaedlapandalu.com",
      ]);

      const extra = (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      extra.forEach((o) => allowed.add(o));

      if (!origin || allowed.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
// app.use(express.urlencoded({ extended: true }));

// app.use(
//   mongoSanitize({
//     replaceWith: undefined,
//   })
// );

// app.use(xss());

// routes
app.use("/api/auth", userRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/events", eventRegistraionRoutes);
app.use("/api/admin/registrations", adminRegistrationRoutes);
app.use("/api/admin", adminManagementRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/event-days", eventDayRoutes);
app.use("/api/event-day-entries", eventDayEntryRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/bulls", bullRoutes);
app.use("/api/bulls/profile", bullProfileRoutes);
app.use("/api/drivers", driverRoutes);

// global error handler - must be after routes
app.use(globalErrorHandler);

export default app;
