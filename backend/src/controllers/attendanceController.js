const { z } = require("zod");
const { Attendance, User, Leave, Company } = require("../models");
const { recordAudit } = require("../services/auditService");
const { notifyUsers } = require("../services/notificationService");
const { localDateKey, localMinutes, parseOfficeDateTime } = require("../services/timeService");
const { validateCheckInPolicy } = require("../services/attendancePolicyService");

async function todayKey() {
  const company = await Company.findOne().select("timezone");
  return localDateKey(new Date(), company?.timezone || "Asia/Karachi");
}
const startOfDay = (key) => new Date(`${key}T00:00:00.000Z`);

async function checkIn(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Only employees can check in." });
  const company = await Company.findOne();
  const input = z.object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    cameraPresenceChecked: z.boolean().optional()
  }).strict().parse(req.body || {});
  const policyError = validateCheckInPolicy(company, input);
  if (policyError) return res.status(policyError.status).json({ message: policyError.message });
  const timeZone = company?.timezone || "Asia/Karachi";
  const today = localDateKey(new Date(), timeZone);
  if (await Attendance.exists({ employee: req.user._id, dateKey: today })) return res.status(409).json({ message: "You have already checked in today." });
  const [hour, minute] = (company?.officeStart || "09:00").split(":").map(Number);
  const lateAt = hour * 60 + minute + (company?.graceMinutes ?? 15);
  const now = new Date();
  const late = localMinutes(now, timeZone) > lateAt;
  const attendance = await Attendance.create({
    employee: req.user._id,
    dateKey: today,
    checkIn: now,
    status: late ? "late" : "present",
    lateArrival: late,
    cameraPresenceChecked: input.cameraPresenceChecked === true
  });
  await recordAudit(req.user, "attendance.check_in", "Attendance", attendance._id, null, attendance.toObject());
  res.status(201).json({ attendance });
}

async function checkOut(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Only employees can check out." });
  const attendance = await Attendance.findOne({ employee: req.user._id, dateKey: await todayKey() });
  if (!attendance) return res.status(404).json({ message: "No check-in found for today." });
  if (attendance.checkOut) return res.status(409).json({ message: "You have already checked out today." });
  const before = attendance.toObject();
  attendance.checkOut = new Date();
  const hours = (attendance.checkOut - attendance.checkIn) / 3600000;
  if (hours < 5) attendance.status = "half-day";
  await attendance.save();
  await recordAudit(req.user, "attendance.check_out", "Attendance", attendance._id, before, attendance.toObject());
  res.json({ attendance, hoursWorked: Number(hours.toFixed(2)) });
}

async function requestCorrection(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Only employees can request attendance corrections." });
  const input = z.object({
    dateKey: z.string().date(),
    requestedCheckIn: z.string().optional(),
    requestedCheckOut: z.string().optional(),
    reason: z.string().trim().min(5)
  }).parse(req.body);
  const company = await Company.findOne().select("timezone");
  const timeZone = company?.timezone || "Asia/Karachi";
  if (!input.requestedCheckIn && !input.requestedCheckOut) {
    return res.status(400).json({ message: "Provide at least one corrected check-in or check-out time." });
  }
  for (const field of ["requestedCheckIn", "requestedCheckOut"]) {
    if (input[field]) {
      const parsed = parseOfficeDateTime(input[field], timeZone);
      if (localDateKey(parsed, timeZone) !== input.dateKey) {
        return res.status(400).json({ message: "Correction timestamps must match the selected attendance date." });
      }
      input[field] = parsed;
    }
  }
  if (input.requestedCheckIn && input.requestedCheckOut && input.requestedCheckOut <= input.requestedCheckIn) {
    return res.status(400).json({ message: "Corrected check-out must be after corrected check-in." });
  }
  const attendance = await Attendance.findOne({ employee: req.user._id, dateKey: input.dateKey });
  if (!attendance) return res.status(404).json({ message: "Attendance record not found." });
  if (attendance.correction?.status === "pending") return res.status(409).json({ message: "A correction is already pending." });
  attendance.correction = { ...input, status: "pending" };
  await attendance.save();
  await recordAudit(req.user, "attendance.correction_requested", "Attendance", attendance._id, null, attendance.correction.toObject?.() || attendance.correction);
  const hrUsers = await User.find({ role: "hr", active: true }).select("_id");
  await notifyUsers(hrUsers.map((user) => user._id), `${req.user.name} requested an attendance correction for ${input.dateKey}.`, "Attendance", attendance._id);
  res.status(201).json({ attendance });
}

async function list(req, res) {
  const filter = {};
  if (req.user.role === "employee") filter.employee = req.user._id;
  else if (req.query.employeeId) filter.employee = req.query.employeeId;
  const from = req.query.from || await todayKey();
  const to = req.query.to || from;
  filter.dateKey = { $gte: from, $lte: to };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const [records, total] = await Promise.all([
    Attendance.find(filter).populate("employee", "name employeeCode department").sort({ dateKey: -1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments(filter)
  ]);
  res.json({ today: await todayKey(), attendance: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function reviewCorrection(req, res) {
  const input = z.object({ status: z.enum(["approved", "rejected"]), comment: z.string().max(500).optional() }).parse(req.body);
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance?.correction || attendance.correction.status !== "pending") return res.status(404).json({ message: "Pending correction not found." });
  const before = attendance.toObject();
  if (input.status === "approved") {
    if (attendance.correction.requestedCheckIn) attendance.checkIn = attendance.correction.requestedCheckIn;
    if (attendance.correction.requestedCheckOut) attendance.checkOut = attendance.correction.requestedCheckOut;
    const company = await Company.findOne();
    const [officeHour, officeMinute] = (company?.officeStart || "09:00").split(":").map(Number);
    const threshold = officeHour * 60 + officeMinute + (company?.graceMinutes ?? 15);
    const timeZone = company?.timezone || "Asia/Karachi";
    attendance.lateArrival = localMinutes(attendance.checkIn, timeZone) > threshold;
    attendance.status = attendance.lateArrival ? "late" : "present";
    if (attendance.checkOut && (attendance.checkOut.getTime() - attendance.checkIn.getTime()) / 3600000 < 5) {
      attendance.status = "half-day";
    }
  }
  attendance.correction.status = input.status;
  attendance.correction.comment = input.comment;
  await attendance.save();
  await recordAudit(req.user, "attendance.correction_reviewed", "Attendance", attendance._id, before, attendance.toObject());
  await notifyUsers([attendance.employee], `Your attendance correction for ${attendance.dateKey} was ${input.status}.`, "Attendance", attendance._id);
  res.json({ attendance });
}

async function corrections(_req, res) {
  const records = await Attendance.find({ "correction.status": "pending" })
    .populate("employee", "name employeeCode department")
    .sort({ dateKey: -1 });
  res.json({ attendance: records });
}

async function board(req, res) {
  const date = String(req.query.date || await todayKey());
  const today = await todayKey();
  const company = await Company.findOne().select("weekends holidays timezone");
  const selectedDate = startOfDay(date);
  const isWeekend = (company?.weekends || [0, 6]).includes(selectedDate.getUTCDay());
  const isHoliday = (company?.holidays || []).some((holiday) => localDateKey(holiday.date, company?.timezone || "Asia/Karachi") === date);
  const employeeFilter = { role: "employee", active: true };
  if (req.query.department) employeeFilter.department = req.query.department;
  const employees = await User.find(employeeFilter).select("name employeeCode department");
  const [records, approvedLeaves] = await Promise.all([
    Attendance.find({ dateKey: date, employee: { $in: employees.map((user) => user._id) } }),
    Leave.find({ status: "approved", startDate: { $lte: startOfDay(date) }, endDate: { $gte: startOfDay(date) }, employee: { $in: employees.map((user) => user._id) } })
  ]);
  const byEmployee = new Map(records.map((record) => [record.employee.toString(), record]));
  const onLeave = new Set(approvedLeaves.map((leave) => leave.employee.toString()));
  const rows = employees.map((employee) => {
    const record = byEmployee.get(employee._id.toString());
    const status = record
      ? (!record.checkOut && date < today ? "missing-checkout" : record.status)
      : (onLeave.has(employee._id.toString()) ? "leave" : isWeekend ? "weekend" : isHoliday ? "holiday" : "absent");
    return { employee, attendance: record || null, status };
  });
  res.json({ date, summary: {
    present: rows.filter((row) => !!row.attendance).length,
    late: rows.filter((row) => row.attendance?.lateArrival || row.status === "late").length,
    leave: rows.filter((row) => row.status === "leave").length,
    missingCheckout: rows.filter((row) => row.status === "missing-checkout").length,
    absent: rows.filter((row) => row.status === "absent").length
  }, nonWorkingDay: isWeekend || isHoliday, rows });
}

module.exports = { checkIn, checkOut, requestCorrection, list, reviewCorrection, corrections, board };
