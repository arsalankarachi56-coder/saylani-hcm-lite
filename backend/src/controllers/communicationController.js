const { z } = require("zod");
const { Announcement, AuditLog, Notification, User } = require("../models");
const { recordAudit } = require("../services/auditService");
const { notifyUsers } = require("../services/notificationService");

async function listAnnouncements(_req, res) {
  res.json({ announcements: await Announcement.find().populate("author", "name").sort({ createdAt: -1 }) });
}

async function createAnnouncement(req, res) {
  const input = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(5000) }).parse(req.body);
  const announcement = await Announcement.create({ ...input, author: req.user._id });
  await recordAudit(req.user, "announcement.created", "Announcement", announcement._id, null, announcement.toObject());
  const recipients = await User.find({ active: true }).select("_id");
  await notifyUsers(recipients.map((user) => user._id), `New announcement: ${announcement.title}`, "Announcement", announcement._id);
  res.status(201).json({ announcement });
}

async function listNotifications(req, res) {
  const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ notifications, unread: notifications.filter((notification) => !notification.readAt).length });
}

async function readNotification(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) return res.status(404).json({ message: "Unread notification not found." });
  res.json({ notification });
}

async function auditFeed(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const [logs, total] = await Promise.all([
    AuditLog.find().sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments()
  ]);
  res.json({ logs, pagination: { page, limit, total } });
}

async function directory(req, res) {
  if (req.user.role === "employee") return res.status(403).json({ message: "Employee directory is restricted." });
  const users = await User.find({ role: { $in: ["hr", "employee"] }, active: true }).select("name email role employeeCode department designation");
  res.json({ users });
}

module.exports = { listAnnouncements, createAnnouncement, listNotifications, readNotification, auditFeed, directory };
