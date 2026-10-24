const { Company, Attendance, Leave } = require("../models");

function countWorkingDaysInRange(startDate, endDate, weekends, holidays) {
  const holidayKeys = holidays instanceof Set ? holidays : new Set(holidays);
  const cursor = new Date(startDate);
  let days = 0;
  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    if (!weekends.includes(cursor.getUTCDay()) && !holidayKeys.has(key)) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function countWorkingDays(startDate, endDate) {
  const company = await Company.findOne().select("weekends holidays timezone");
  const weekends = company?.weekends || [0, 6];
  const timeZone = company?.timezone || "Asia/Karachi";
  const holidays = new Set((company?.holidays || []).map((holiday) => localDateKey(holiday.date, timeZone)));
  return countWorkingDaysInRange(startDate, endDate, weekends, holidays);
}

async function getLeaveBalance(employeeId, year = new Date().getFullYear()) {
  const company = await Company.findOne();
  const timeZone = company?.timezone || "Asia/Karachi";
  const weekends = company?.weekends || [0, 6];
  const holidays = new Set((company?.holidays || []).map((holiday) => localDateKey(holiday.date, timeZone)));
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
  const approved = await Leave.find({
    employee: employeeId, status: "approved",
    startDate: { $lte: yearEnd }, endDate: { $gte: yearStart }
  });
  const usedByType = new Map();
  for (const leave of approved) {
    const clippedStart = new Date(Math.max(leave.startDate.getTime(), yearStart.getTime()));
    const clippedEnd = new Date(Math.min(leave.endDate.getTime(), yearEnd.getTime()));
    const days = countWorkingDaysInRange(clippedStart, clippedEnd, weekends, holidays);
    usedByType.set(leave.type, (usedByType.get(leave.type) || 0) + days);
  }
  return (company?.leaveTypes || []).map((type) => {
    const used = usedByType.get(type.name) || 0;
    return { type: type.name, quota: type.unlimited ? null : type.yearlyQuota, used, remaining: type.unlimited ? null : Math.max(0, type.yearlyQuota - used) };
  });
}

async function validateLeave(employeeId, type, startDate, endDate, excludeLeaveId) {
  if (endDate < startDate) throw Object.assign(new Error("End date must be on or after start date."), { status: 400 });
  const overlapFilter = { employee: employeeId, status: { $in: ["pending", "approved"] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } };
  if (excludeLeaveId) overlapFilter._id = { $ne: excludeLeaveId };
  const overlap = await Leave.exists(overlapFilter);
  if (overlap) throw Object.assign(new Error("This request overlaps an existing leave request."), { status: 409 });
  const company = await Company.findOne();
  const leaveType = company?.leaveTypes.find((entry) => entry.name.toLowerCase() === type.toLowerCase());
  if (!leaveType) throw Object.assign(new Error("Unknown leave type."), { status: 400 });
  const timeZone = company?.timezone || "Asia/Karachi";
  const weekends = company?.weekends || [0, 6];
  const holidays = new Set((company?.holidays || []).map((holiday) => localDateKey(holiday.date, timeZone)));
  const days = countWorkingDaysInRange(startDate, endDate, weekends, holidays);
  if (!days) throw Object.assign(new Error("The selected dates contain no working days."), { status: 400 });
  if (!leaveType.unlimited) {
    for (let year = startDate.getUTCFullYear(); year <= endDate.getUTCFullYear(); year += 1) {
      const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
      const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
      const clippedStart = new Date(Math.max(startDate.getTime(), yearStart.getTime()));
      const clippedEnd = new Date(Math.min(endDate.getTime(), yearEnd.getTime()));
      const requestedDays = countWorkingDaysInRange(clippedStart, clippedEnd, weekends, holidays);
      if (!requestedDays) continue;
      const balances = await getLeaveBalance(employeeId, year);
      const balance = balances.find((entry) => entry.type === leaveType.name);
      const pending = await Leave.find({
        employee: employeeId, type: leaveType.name, status: "pending",
        ...(excludeLeaveId ? { _id: { $ne: excludeLeaveId } } : {}),
        startDate: { $lte: yearEnd }, endDate: { $gte: yearStart }
      });
      let reservedDays = 0;
      for (const request of pending) {
        const requestStart = new Date(Math.max(request.startDate.getTime(), yearStart.getTime()));
        const requestEnd = new Date(Math.min(request.endDate.getTime(), yearEnd.getTime()));
        reservedDays += countWorkingDaysInRange(requestStart, requestEnd, weekends, holidays);
      }
      if (balance.remaining - reservedDays < requestedDays) {
        throw Object.assign(new Error(`Insufficient ${year} ${leaveType.name.toLowerCase()} leave balance.`), { status: 400 });
      }
    }
  }
  return days;
}

async function attendanceSummary(employeeId, start, end) {
  return Attendance.find({ employee: employeeId, dateKey: { $gte: start, $lte: end } });
}

module.exports = { countWorkingDays, countWorkingDaysInRange, getLeaveBalance, validateLeave, attendanceSummary };
