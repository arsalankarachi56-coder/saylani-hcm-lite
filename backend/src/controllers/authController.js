const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { User } = require("../models");
const { recordAudit } = require("../services/auditService");

const signAccess = (user) => jwt.sign({ sub: user._id.toString(), role: user.role, version: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "15m" });
const signRefresh = (user) => jwt.sign({ sub: user._id.toString(), type: "refresh", version: user.tokenVersion || 0 }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, employeeCode: user.employeeCode, temporaryPassword: user.temporaryPassword });

async function login(req, res) {
  const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash +refreshTokenHash");
  if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ message: "Invalid email or password." });
  const refreshToken = signRefresh(user);
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();
  await recordAudit(user, "auth.login", "User", user._id);
  res.json({ accessToken: signAccess(user), refreshToken, user: publicUser(user) });
}

async function refresh(req, res) {
  const token = req.body.refreshToken;
  if (!token) return res.status(401).json({ message: "Refresh token is required." });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Refresh session expired. Please sign in again." });
    }
    throw error;
  }
  if (payload.type !== "refresh") return res.status(401).json({ message: "Refresh session is invalid." });
  const user = await User.findById(payload.sub).select("+refreshTokenHash");
  if (!user || !user.active || !user.refreshTokenHash || user.refreshTokenHash !== hashToken(token) ||
      (payload.version || 0) !== (user.tokenVersion || 0)) return res.status(401).json({ message: "Refresh session is invalid." });
  const nextRefresh = signRefresh(user);
  user.refreshTokenHash = hashToken(nextRefresh);
  await user.save();
  res.json({ accessToken: signAccess(user), refreshToken: nextRefresh, user: publicUser(user) });
}

async function logout(req, res) {
  await User.updateOne({ _id: req.user._id }, { $unset: { refreshTokenHash: 1 }, $inc: { tokenVersion: 1 } });
  await recordAudit(req.user, "auth.logout", "User", req.user._id);
  res.json({ message: "Signed out." });
}

async function changePassword(req, res) {
  const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) }).parse(req.body);
  const user = await User.findById(req.user._id).select("+passwordHash +refreshTokenHash");
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) return res.status(400).json({ message: "Current password is incorrect." });
  user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  user.temporaryPassword = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();
  await recordAudit(user, "auth.password_changed", "User", user._id);
  res.json({ message: "Password updated.", accessToken, refreshToken, user: publicUser(user) });
}

module.exports = { login, refresh, logout, changePassword, publicUser };
