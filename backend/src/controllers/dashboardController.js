const { z } = require("zod");
const { User, Attendance, Leave, Payroll, Announcement, Company, AuditLog } = require("../models");
const { localDateKey } = require("../services/timeService");
const { countWorkingDays } = require("../services/leaveService");

async function getDashboard(req, res) {
  const user = req.user;
  const company = await Company.findOne().select("timezone weekends holidays");
  const today = localDateKey(new Date(), company?.timezone || "Asia/Karachi");
  if (user.role === "employee") {
    const [todayRecord, lateCount, leaves, payrolls, announcements] = await Promise.all([
      Attendance.findOne({ employee: user._id, dateKey: today }),
      Attendance.countDocuments({ employee: user._id, $or: [{ lateArrival: true }, { status: "late" }] }),
      Leave.find({ employee: user._id }),
      Payroll.find({ status: "finalized", "items.employee": user._id }).sort({ month: -1 }).limit(1),
      Announcement.find().sort({ createdAt: -1 }).limit(5)
    ]);
    const hoursWorked = todayRecord ? Number((((todayRecord.checkOut || new Date()) - todayRecord.checkIn) / 3600000).toFixed(2)) : 0;
    const balances = require("../services/leaveService").getLeaveBalance(user._id);
    return res.json({
      role: user.role,
      today: { attendance: todayRecord, hoursWorked },
      lateCount,
      balances: await balances,
      lastPayslip: payrolls[0] ? {
        month: payrolls[0].month,
        item: payrolls[0].items.find((item) => item.employee.toString() === user._id.toString())
      } : null,
      announcements,
      leaveRequests: leaves
    });
  }

  const filter = { role: "employee", active: true };
  if (req.query.department) filter.department = String(req.query.department);
  const employees = await User.find(filter).select("name department joiningDate");
  const ids = employees.map((employee) => employee._id);
  const from = String(req.query.from || today.slice(0, 7) + "-01");
  const to = String(req.query.to || today);
  z.object({ from: z.string().date(), to: z.string().date() }).refine((range) => range.from <= range.to, "from must be before to").parse({ from, to });
  const recentDepartureStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [records, leaveRecords, pendingLeaves, pendingCorrections, payrolls, departures, recentDepartures, announcements] = await Promise.all([
    Attendance.find({ employee: { $in: ids }, dateKey: { $gte: from, $lte: to } }),
    Leave.find({ employee: { $in: ids }, status: "approved", startDate: { $lte: new Date(`${to}T23:59:59.999Z`) }, endDate: { $gte: new Date(`${from}T00:00:00.000Z`) } }),
    Leave.countDocuments({ employee: { $in: ids }, status: "pending" }),
    Attendance.countDocuments({ employee: { $in: ids }, "correction.status": "pending" }),
    Payroll.find({ status: "finalized", month: { $gte: from.slice(0, 7), $lte: to.slice(0, 7) } }),
    User.countDocuments({
      role: "employee",
      active: false,
      separationDate: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
      ...(req.query.department ? { department: String(req.query.department) } : {})
    }),
    User.countDocuments({
      role: "employee",
      active: false,
      separationDate: { $gte: recentDepartureStart, $lte: new Date() },
      ...(req.query.department ? { department: String(req.query.department) } : {})
    }),
    Announcement.find().sort({ createdAt: -1 }).limit(5)
  ]);
  const leaves = await Promise.all(leaveRecords.map(async (leave) => {
    const clippedStart = new Date(Math.max(leave.startDate.getTime(), new Date(`${from}T00:00:00.000Z`).getTime()));
    const clippedEnd = new Date(Math.min(leave.endDate.getTime(), new Date(`${to}T23:59:59.999Z`).getTime()));
    return { type: leave.type, days: await countWorkingDays(clippedStart, clippedEnd) };
  }));
  const observedTo = to < today ? to : today;
  const holidayKeys = new Set((company?.holidays || []).map((holiday) => localDateKey(holiday.date, company?.timezone || "Asia/Karachi")));
  const attendedByEmployee = new Map();
  for (const record of records) {
    const employeeId = record.employee.toString();
    if (!attendedByEmployee.has(employeeId)) attendedByEmployee.set(employeeId, new Set());
    attendedByEmployee.get(employeeId).add(record.dateKey);
  }
  const approvedLeaveRanges = leaveRecords.map((leave) => ({
    employeeId: leave.employee.toString(),
    from: localDateKey(leave.startDate, company?.timezone || "Asia/Karachi"),
    to: localDateKey(leave.endDate, company?.timezone || "Asia/Karachi")
  }));
  const absenceAnomalies = employees.flatMap((employee) => {
    const eligibleStart = employee.joiningDate
      ? localDateKey(employee.joiningDate, company?.timezone || "Asia/Karachi") > from
        ? localDateKey(employee.joiningDate, company?.timezone || "Asia/Karachi")
        : from
      : from;
    if (eligibleStart > observedTo) return [];
    let workdays = 0;
    let unexplainedAbsences = 0;
    const attended = attendedByEmployee.get(employee._id.toString()) || new Set();
    for (let cursor = new Date(`${eligibleStart}T00:00:00.000Z`); cursor <= new Date(`${observedTo}T00:00:00.000Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = cursor.toISOString().slice(0, 10);
      if ((company?.weekends || [0, 6]).includes(cursor.getUTCDay()) || holidayKeys.has(key)) continue;
      workdays += 1;
      const onApprovedLeave = approvedLeaveRanges.some((leave) =>
        leave.employeeId === employee._id.toString() && leave.from <= key && leave.to >= key
      );
      if (!attended.has(key) && !onApprovedLeave) unexplainedAbsences += 1;
    }
    if (unexplainedAbsences < 3 || (workdays < 5 && unexplainedAbsences / Math.max(workdays, 1) < 0.25)) return [];
    return [{
      employee: employee.name,
      department: employee.department || "Unassigned",
      absenceDays: unexplainedAbsences,
      workdays,
      signal: "Repeated unrecorded absence; review records before taking action."
    }];
  });

  const attendanceByDay = new Map();
  for (const record of records) {
    const current = attendanceByDay.get(record.dateKey) || { present: 0, late: 0, halfDay: 0 };
    if (record.lateArrival || record.status === "late") current.late += 1;
    else if (record.status === "half-day") current.halfDay += 1;
    else current.present += 1;
    attendanceByDay.set(record.dateKey, current);
  }
  const trend = [...attendanceByDay].sort(([left], [right]) => left.localeCompare(right)).map(([date, counts]) => ({ date, ...counts }));
  const leaveByType = leaves.reduce((accumulator, leave) => {
    accumulator[leave.type] = (accumulator[leave.type] || 0) + leave.days;
    return accumulator;
  }, {});
  const lateByEmployee = new Map();
  for (const record of records.filter((entry) => entry.lateArrival || entry.status === "late")) {
    const id = record.employee.toString();
    lateByEmployee.set(id, (lateByEmployee.get(id) || 0) + 1);
  }
  const topLateEmployees = [...lateByEmployee].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({
    name: employees.find((employee) => employee._id.toString() === id)?.name || "Employee", count
  }));
  const employeeIds = new Set(ids.map((id) => id.toString()));
  const payrollCost = payrolls.reduce((sum, payroll) => sum + payroll.items.reduce((itemTotal, item) => (
    employeeIds.has(item.employee.toString()) ? itemTotal + (item.net || 0) : itemTotal
  ), 0), 0);
  const response = {
    role: user.role,
    headcount: employees.length,
    present: records.filter((record) => ["present", "late", "half-day"].includes(record.status)).length,
    late: records.filter((record) => record.lateArrival || record.status === "late").length,
    leave: leaves.reduce((sum, leave) => sum + leave.days, 0),
    pendingApprovals: pendingLeaves + pendingCorrections,
    attendanceTrend: trend,
    leaveTrend: Object.entries(leaveByType).map(([type, days]) => ({ type, days })),
    topLateEmployees,
    absenceAnomalies,
    payrollCost,
    departures,
    attritionRate: Number((departures / Math.max(1, employees.length + departures) * 100).toFixed(1)),
    attritionForecast: {
      recentDepartures90Days: recentDepartures,
      monthlyRunRate: Number((recentDepartures / 3).toFixed(1)),
      estimatedNext30Days: Number((recentDepartures / 3).toFixed(1)),
      label: "Simple historical run-rate projection only; not a trained model or individual prediction."
    },
    averageSalary: employees.length ? await User.aggregate([
      { $match: { _id: { $in: ids } } },
      { $group: { _id: null, average: { $avg: { $multiply: ["$salary.basic", 1.5] } } } }
    ]).then((result) => result[0]?.average || 0) : 0,
    departmentDistribution: Object.entries(employees.reduce((result, employee) => {
      const name = employee.department || "Unassigned";
      result[name] = (result[name] || 0) + 1;
      return result;
    }, {})).map(([department, count]) => ({ department, count })),
    announcements
  };
  if (user.role === "admin") response.auditFeed = await AuditLog.find().sort({ timestamp: -1 }).limit(8).select("actorName action entity timestamp");
  if (user.role === "hr") response.attendanceBoard = { records: records.length, missingCheckout: records.filter((record) => !record.checkOut && record.dateKey < today).length };
  res.json(response);
}

module.exports = { getDashboard };
