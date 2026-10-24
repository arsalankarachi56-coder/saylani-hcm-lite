const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const apiRoutes = require("./routes");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || 1);
app.use(helmet());
const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((origin) => origin.trim());
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use("/api/ai", rateLimit({ windowMs: 60 * 1000, limit: 20 }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", apiRoutes);
app.use((error, _req, res, _next) => {
  if (error.name === "ZodError") {
    return res.status(400).json({ message: "Please check the submitted fields.", errors: error.issues });
  }
  if (error.code === 11000) return res.status(409).json({ message: "A record with this value already exists." });
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : "An unexpected server error occurred." });
});

module.exports = app;
