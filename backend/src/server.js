require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

const port = process.env.PORT || 5000;

async function start() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT_SECRET and JWT_REFRESH_SECRET are required");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => console.log(`HCM API listening on port ${port}`));
}

start().catch((error) => {
  console.error("Failed to start HCM API:", error.message);
  process.exitCode = 1;
});
