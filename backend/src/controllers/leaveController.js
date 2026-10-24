const { z } = require("zod");
const { Leave, User } = require("../models");
const { getLeaveBalance, validateLeave } = require("../services/leaveService");
const { recordAudit } = require("../services/auditService");
const { notifyUsers } = require("../services/notificationService");

async function balance(req, res) {
  const employeeId = req.user.role === "employee" ? req.user._id : req.query.employeeId;
  if (!employeeId) return res.status(400).json({ message: "employeeId is required." });
  res.json({ balances: await getLeaveBalance(employeeId) });
}

async function list(req, res) {
  const filter = {};
  if (req.user.role === "employee") filter.employee = req.user._id;
  else if (req.query.employeeId) filter.employee = req.query.employeeId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    const range = z.object({ from: z.string().date(), to: z.string().date() })
      .refine((value) => value.from <= value.to, "from must be on or before to.")
      .parse({ from: req.query.from, to: req.query.to });
    filter.startDate = { $lte: new Date(`${range.to}T23:59:59.999Z`) };
    filter.endDate = { $gte: new Date(`${range.from}T00:00:00.000Z`) };
  }
  const leaves = await Leave.find(filter).populate("employee", "name employeeCode department").populate("reviewer", "name").sort({ createdAt: -1 }).limit(200);
  res.json({ leaves });
}

async function create(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Only employees can submit leave requests." });
  const input = z.object({ type: z.string().trim().min(1), startDate: z.coerce.date(), endDate: z.coerce.date(), reason: z.string().trim().min(3).max(1000) }).parse(req.body);
  const days = await validateLeave(req.user._id, input.type, input.startDate, input.endDate);
  const leave = await Leave.create({ ...input, employee: req.user._id, days });
  await recordAudit(req.user, "leave.requested", "Leave", leave._id, null, leave.toObject());
  const hrUsers = await User.find({ role: "hr", active: true }).select("_id");
  await notifyUsers(hrUsers.map((user) => user._id), `${req.user.name} submitted a ${leave.type} leave request.`, "Leave", leave._id);
  res.status(201).json({ leave });
}

async function cancel(req, res) {
  const leave = await Leave.findOne({ _id: req.params.id, employee: req.user._id });
  if (!leave) return res.status(404).json({ message: "Leave request not found." });
  if (!["pending", "approved"].includes(leave.status)) return res.status(409).json({ message: "This leave request cannot be cancelled." });
  const before = leave.toObject();
  leave.status = "cancelled";
  await leave.save();
  await recordAudit(req.user, "leave.cancelled", "Leave", leave._id, before, leave.toObject());
  res.json({ leave });
}

async function review(req, res) {
  const input = z.object({ status: z.enum(["approved", "rejected"]), comment: z.string().trim().max(500).optional() }).parse(req.body);
  const leave = await Leave.findById(req.params.id);
  if (!leave || leave.status !== "pending") return res.status(404).json({ message: "Pending leave request not found." });
  if (input.status === "approved") {
    const companyType = leave.type;
    await validateLeave(leave.employee, companyType, leave.startDate, leave.endDate, leave._id);
  }
  const before = leave.toObject();
  leave.status = input.status;
  leave.comment = input.comment;
  leave.reviewer = req.user._id;
  await leave.save();
  await recordAudit(req.user, `leave.${input.status}`, "Leave", leave._id, before, leave.toObject());
  await notifyUsers([leave.employee], `Your ${leave.type} leave request was ${input.status}.`, "Leave", leave._id);
  res.json({ leave });
}

module.exports = { balance, list, create, cancel, review };
