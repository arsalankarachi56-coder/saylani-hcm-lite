const { Attendance, Company, Leave, User } = require("../models");
const { localDateKey } = require("./timeService");

function calculateTax(annualGross) {
  const annualTax = annualGross <= 600000 ? 0 :
    annualGross <= 1200000 ? (annualGross - 600000) * 0.05 :
    annualGross <= 2400000 ? 30000 + (annualGross - 1200000) * 0.15 :
    annualGross <= 3600000 ? 210000 + (annualGross - 2400000) * 0.25 :
    510000 + (annualGross - 3600000) * 0.35;
  return annualTax / 12;
}

function calculateLatePenalty(perDaySalary, lateCount, penaltyPercent, gross) {
  return Math.min(perDaySalary * lateCount * penaltyPercent / 100, gross);
}

async function buildPayroll(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Object.assign(new Error("Month must use YYYY-MM format."), { status: 400 });
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw Object.assign(new Error("Month must use a valid YYYY-MM month."), { status: 400 });
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0));
  const company = await Company.findOne();
  const weekends = company?.weekends || [0, 6];
  const holidays = new Set((company?.holidays || []).map((holiday) => new Date(holiday.date).toISOString().slice(0, 10)));
  const workdayKeys = [];
  for (let cursor = new Date(monthStart); cursor <= monthEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    if (!weekends.includes(cursor.getUTCDay()) && !holidays.has(key)) workdayKeys.push(key);
  }
  const today = localDateKey(new Date(), company?.timezone || "Asia/Karachi");
  const users = await User.find({
    role: "employee",
    $or: [
      { active: true },
      { separationDate: { $gte: monthStart, $lte: monthEnd } }
    ],
    $and: [{ $or: [{ joiningDate: null }, { joiningDate: { $lte: monthEnd } }] }]
  });
  const items = await Promise.all(users.map(async (employee) => {
    const basic = employee.salary.basic || 0;
    const gross = basic * 1.5;
    const employmentStart = employee.joiningDate
      ? new Date(Math.max(employee.joiningDate.getTime(), monthStart.getTime()))
      : monthStart;
    const employmentEnd = employee.separationDate
      ? new Date(Math.min(employee.separationDate.getTime(), monthEnd.getTime()))
      : monthEnd;
    const employmentWorkdays = workdayKeys.filter((key) => {
      const date = new Date(`${key}T00:00:00.000Z`);
      return date >= employmentStart && date <= employmentEnd;
    });
    const elapsedEmploymentWorkdays = employmentWorkdays.filter((key) => key < today);
    const workingDays = Math.max(1, workdayKeys.length);
    const perDay = gross / workingDays;
    const attendance = await Attendance.find({ employee: employee._id, dateKey: { $gte: monthStart.toISOString().slice(0, 10), $lte: monthEnd.toISOString().slice(0, 10) } });
    const approvedLeaves = await Leave.find({ employee: employee._id, status: "approved", startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } });
    const leaveKeys = new Set();
    for (const leave of approvedLeaves) {
      const cursor = new Date(Math.max(leave.startDate.getTime(), employmentStart.getTime()));
      const leaveEnd = new Date(Math.min(leave.endDate.getTime(), employmentEnd.getTime()));
      while (cursor <= leaveEnd) {
        const key = cursor.toISOString().slice(0, 10);
        if (employmentWorkdays.includes(key)) leaveKeys.add(key);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    const unpaidDays = approvedLeaves.filter((leave) => leave.type.toLowerCase() === "unpaid")
      .reduce((sum, leave) => {
        let days = 0;
        const cursor = new Date(Math.max(leave.startDate.getTime(), employmentStart.getTime()));
        const leaveEnd = new Date(Math.min(leave.endDate.getTime(), employmentEnd.getTime()));
        while (cursor <= leaveEnd) {
          const key = cursor.toISOString().slice(0, 10);
          if (elapsedEmploymentWorkdays.includes(key)) days += 1;
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return sum + days;
      }, 0);
    const halfDays = attendance.filter((record) => record.status === "half-day" && record.dateKey <= today).length;
    const lateCount = attendance.filter((record) => (record.lateArrival || record.status === "late") && record.dateKey <= today).length;
    const attendedKeys = new Set(attendance.map((record) => record.dateKey));
    const attendedElapsedDays = [...attendedKeys].filter((key) => elapsedEmploymentWorkdays.includes(key)).length;
    const elapsedLeaveDays = [...leaveKeys].filter((key) => elapsedEmploymentWorkdays.includes(key)).length;
    const absentDays = Math.max(0, elapsedEmploymentWorkdays.length - attendedElapsedDays - elapsedLeaveDays);
    const absentDeduction = perDay * absentDays;
    const unpaidDeduction = perDay * unpaidDays;
    const halfDayDeduction = perDay * 0.5 * halfDays;
    const latePenaltyDeduction = calculateLatePenalty(perDay, lateCount, company?.latePenaltyPercent || 0, gross);
    const tax = calculateTax(gross * 12);
    return {
      employee: employee._id, name: employee.name, employeeCode: employee.employeeCode,
      basic, hra: basic * 0.4, medical: basic * 0.1, gross,
      absentDeduction, unpaidDeduction, halfDayDeduction, latePenaltyDeduction, tax,
      net: Math.max(0, gross - absentDeduction - unpaidDeduction - halfDayDeduction - latePenaltyDeduction - tax)
    };
  }));
  return { items, total: items.reduce((sum, item) => sum + item.net, 0) };
}

module.exports = { buildPayroll, calculateTax, calculateLatePenalty };
