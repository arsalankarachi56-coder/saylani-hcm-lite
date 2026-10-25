const { z } = require("zod");
const { User, Attendance, Leave, Payroll, AiLog, Company } = require("../models");
const { getLeaveBalance } = require("../services/leaveService");
const { localDateKey } = require("../services/timeService");

const isSalaryQuestion = (question) => /\b(salary|pay|compensation|wage|earn(?:s|ing|ings)?|tankhwa|tankha|pagar|maash)\b/i.test(question);
const isRomanUrdu = (question) => /\b(kya|kaise|kitna|kitni|mujhe|meri|mera|chhutti|chutti|daftar|hazri|tankhwa|pagar|aglay|agle|haftay|hafta|kal|aaj)\b/i.test(question);

const toolSpecs = [
  { type: "function", function: { name: "get_headcount", description: "Count active employees, optionally by department.", parameters: { type: "object", properties: { department: { type: "string" } } } } },
  { type: "function", function: { name: "get_attendance_summary", description: "Summarize attendance records for a date range.", parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } } } },
  { type: "function", function: { name: "get_late_comers", description: "List employees with late attendance in a date range.", parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } } } },
  { type: "function", function: { name: "get_leave_summary", description: "Summarize leave requests, optionally by status.", parameters: { type: "object", properties: { status: { type: "string" } } } } },
  { type: "function", function: { name: "get_my_leave_balance", description: "Get the signed-in employee's own leave balance.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_my_attendance_summary", description: "Get the signed-in employee's own recent attendance summary.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_leave_policy", description: "Read company leave types and approved weekend policy.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_payroll_summary", description: "Summarize finalized payroll totals.", parameters: { type: "object", properties: { month: { type: "string" } } } } },
  { type: "function", function: { name: "search_employees", description: "Search employee directory by name, code, or department without salary details.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }
];

async function executeTool(name, args, user) {
  const isEmployee = user.role === "employee";
  if (name === "get_my_leave_balance") return getLeaveBalance(user._id);
  if (name === "get_my_attendance_summary") {
    if (!isEmployee) return { error: "This tool is available only to employees." };
    const company = await Company.findOne().select("timezone");
    const today = localDateKey(new Date(), company?.timezone || "Asia/Karachi");
    const firstDay = new Date();
    firstDay.setUTCDate(firstDay.getUTCDate() - 30);
    const records = await Attendance.find({ employee: user._id, dateKey: { $gte: localDateKey(firstDay, company?.timezone || "Asia/Karachi"), $lte: today } }).sort({ dateKey: -1 });
    return {
      today: records.find((record) => record.dateKey === today) || null,
      recordedDays: records.length,
      lateArrivals: records.filter((record) => record.lateArrival || record.status === "late").length,
      halfDays: records.filter((record) => record.status === "half-day").length
    };
  }
  if (name === "get_leave_policy") {
    const company = await Company.findOne().select("leaveTypes weekends holidays");
    return {
      leaveTypes: company?.leaveTypes || [],
      weekends: company?.weekends || [0, 6],
      holidays: company?.holidays?.map((holiday) => ({ name: holiday.name, date: holiday.date })) || []
    };
  }
  if (isEmployee) return { error: "This tool is not available for employee accounts." };
  if (name === "get_headcount") {
    const filter = { role: "employee", active: true };
    if (args.department) filter.department = args.department;
    return { headcount: await User.countDocuments(filter) };
  }
  if (name === "get_attendance_summary") {
    const filter = {};
    if (args.from || args.to) filter.dateKey = { ...(args.from ? { $gte: args.from } : {}), ...(args.to ? { $lte: args.to } : {}) };
    const rows = await Attendance.find(filter);
    return { records: rows.length, present: rows.filter((row) => ["present", "late", "half-day"].includes(row.status)).length, late: rows.filter((row) => row.lateArrival || row.status === "late").length, missingCheckout: rows.filter((row) => !row.checkOut).length };
  }
  if (name === "get_late_comers") {
    const filter = { $or: [{ lateArrival: true }, { status: "late" }] };
    if (args.from || args.to) filter.dateKey = { ...(args.from ? { $gte: args.from } : {}), ...(args.to ? { $lte: args.to } : {}) };
    return Attendance.find(filter).populate("employee", "name employeeCode department").limit(50);
  }
  if (name === "get_leave_summary") {
    const filter = {};
    if (args.status) filter.status = args.status;
    else {
      const company = await Company.findOne().select("timezone");
      const today = localDateKey(new Date(), company?.timezone || "Asia/Karachi");
      filter.status = "approved";
      filter.startDate = { $lte: new Date(`${today}T23:59:59.999Z`) };
      filter.endDate = { $gte: new Date(`${today}T00:00:00.000Z`) };
    }
    const rows = await Leave.find(filter).populate("employee", "name department").limit(100);
    return { count: rows.length, requests: rows.map((row) => ({ employee: row.employee?.name, department: row.employee?.department, type: row.type, startDate: row.startDate, endDate: row.endDate, status: row.status })) };
  }
  if (name === "get_payroll_summary") {
    const filter = { status: "finalized" };
    if (args.month) filter.month = args.month;
    const rows = await Payroll.find(filter).select("month total");
    return { payrolls: rows };
  }
  if (name === "search_employees") {
    const term = String(args.query || "").slice(0, 100);
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return User.find({ role: "employee", active: true, $or: [
      { name: { $regex: safeTerm, $options: "i" } }, { employeeCode: { $regex: safeTerm, $options: "i" } }, { department: { $regex: safeTerm, $options: "i" } }
    ] }).select("name employeeCode department designation").limit(20);
  }
  return { error: "Unsupported tool." };
}

async function status(_req, res) {
  res.json({ configured: Boolean(process.env.GROQ_API_KEY) });
}

async function ask(req, res) {
  const { question } = z.object({ question: z.string().trim().min(2).max(2000), context: z.string().max(1000).optional() }).parse(req.body);
  if (req.user.role === "employee" && isSalaryQuestion(question)) {
    const answer = "I can't provide salary or compensation figures here. Please check your finalized payslip or contact HR.";
    await AiLog.create({ user: req.user._id, question, answer });
    return res.json({ answer, label: "AI-generated" });
  }
  if (!process.env.GROQ_API_KEY) {
    const answer = "AI assistant is not configured yet. Add GROQ_API_KEY on the server to enable AI responses.";
    await AiLog.create({ user: req.user._id, question, answer });
    return res.status(503).json({ message: answer, label: "AI-generated" });
  }
  const company = await Company.findOne().select("timezone");
  const timeZone = company?.timezone || "Asia/Karachi";
  const today = localDateKey(new Date(), timeZone);
  const languageInstruction = isRomanUrdu(question)
    ? "The user wrote in Roman Urdu; answer naturally in Roman Urdu. Understand Roman Urdu leave requests such as 'mujhe aglay Monday aur Tuesday chhutti chahiye', but keep leave JSON keys type, startDate, endDate, and reason unchanged and use ISO dates."
    : "Answer in the language used by the user.";
  const system = `You are the Saylani HCM assistant. Never reveal employee salary or compensation to an employee. Employees may access only their own leave balance and personal records. Use tools for factual company data. Do not invent database facts. If asked to create a leave form, return a concise JSON object with type, startDate, endDate and reason when possible, and say dates may need confirmation. Today is ${today} in the office timezone ${timeZone}; resolve relative dates against this date, and ask a brief clarification if the requested dates remain ambiguous. ${languageInstruction} All answers are AI-generated. Current role: ${req.user.role}.`;
  const messages = [{ role: "system", content: system }, { role: "user", content: question }];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS) || 20000);
  try {
    let response;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages, tools: toolSpecs, tool_choice: "auto", temperature: 0.2 })
      });
      if (!upstream.ok) throw new Error(`Groq request failed (${upstream.status}).`);
      response = await upstream.json();
      const message = response.choices?.[0]?.message;
      if (!message?.tool_calls?.length) break;
      if (attempt === 4) throw new Error("AI tool-call limit reached.");
      messages.push(message);
      for (const call of message.tool_calls) {
        const result = await executeTool(call.function.name, JSON.parse(call.function.arguments || "{}"), req.user);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    const answer = response?.choices?.[0]?.message?.content;
    if (!answer) throw new Error("AI returned an empty response.");
    await AiLog.create({ user: req.user._id, question, answer });
    res.json({ answer, label: "AI-generated" });
  } catch (error) {
    const answer = "The AI assistant is temporarily unavailable. Please try again shortly.";
    await AiLog.create({ user: req.user._id, question, answer });
    if (error.name === "AbortError") return res.status(504).json({ message: answer, label: "AI-generated" });
    console.error("AI request failed:", error.message);
    res.status(502).json({ message: answer, label: "AI-generated" });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { ask, status, isSalaryQuestion, isRomanUrdu };
