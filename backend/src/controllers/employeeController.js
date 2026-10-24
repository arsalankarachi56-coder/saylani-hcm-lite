const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { User, Company } = require("../models");
const { recordAudit } = require("../services/auditService");

const employeeInput = z.object({
  name: z.string().trim().min(2), email: z.string().email(), phone: z.string().optional(),
  address: z.string().optional(), department: z.string().optional(), designation: z.string().optional(),
  joiningDate: z.coerce.date().optional(), basicSalary: z.coerce.number().nonnegative().default(0)
});

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = { role: "employee", active: true };
  if (req.query.department) filter.department = req.query.department;
  if (req.query.q) filter.$text = { $search: String(req.query.q) };
  if (req.user.role === "employee") filter._id = req.user._id;
  const [employees, total] = await Promise.all([
    User.find(filter).select("-passwordHash -refreshTokenHash").sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  res.json({ employees, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function create(req, res) {
  const input = employeeInput.parse(req.body);
  if (await User.exists({ email: input.email.toLowerCase() })) return res.status(409).json({ message: "Email already exists." });
  const company = await Company.findOne();
  if (input.department) {
    const department = company?.departments.find((item) => item.name.toLowerCase() === input.department.toLowerCase());
    if (!department) return res.status(400).json({ message: "Choose a department configured by the administrator." });
    input.department = department.name;
  }
  if (input.designation) {
    const designation = company?.designations.find((item) => item.name.toLowerCase() === input.designation.toLowerCase());
    if (!designation) return res.status(400).json({ message: "Choose a designation configured by the administrator." });
    input.designation = designation.name;
  }
  const employeeCode = `EMP-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;
  const temporaryPassword = `Welcome-${cryptoRandom()}`;
  const employee = await User.create({
    name: input.name, email: input.email.toLowerCase(), phone: input.phone, address: input.address,
    department: input.department, designation: input.designation, joiningDate: input.joiningDate,
    employeeCode, salary: { basic: input.basicSalary, hra: input.basicSalary * 0.4, medical: input.basicSalary * 0.1 },
    passwordHash: await bcrypt.hash(temporaryPassword, 12), temporaryPassword: true, role: "employee"
  });
  await recordAudit(req.user, "employee.created", "User", employee._id, null, { name: employee.name, email: employee.email, employeeCode });
  res.status(201).json({ employee: { id: employee._id, name: employee.name, email: employee.email, employeeCode }, temporaryPassword });
}

function cryptoRandom() {
  return require("crypto").randomBytes(5).toString("hex");
}

async function update(req, res) {
  const employee = await User.findOne({ _id: req.params.id, role: "employee" });
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  const before = employee.toObject();
  const input = employeeInput.partial().parse(req.body);
  const company = await Company.findOne();
  if (input.department) {
    const department = company?.departments.find((item) => item.name.toLowerCase() === input.department.toLowerCase());
    if (!department) return res.status(400).json({ message: "Choose a department configured by the administrator." });
    input.department = department.name;
  }
  if (input.designation) {
    const designation = company?.designations.find((item) => item.name.toLowerCase() === input.designation.toLowerCase());
    if (!designation) return res.status(400).json({ message: "Choose a designation configured by the administrator." });
    input.designation = designation.name;
  }
  if (input.name !== undefined) employee.name = input.name;
  for (const field of ["phone", "address", "department", "designation", "joiningDate"] ) {
    if (input[field] !== undefined) employee[field] = input[field];
  }
  if (input.basicSalary !== undefined) employee.salary = { basic: input.basicSalary, hra: input.basicSalary * 0.4, medical: input.basicSalary * 0.1 };
  await employee.save();
  await recordAudit(req.user, "employee.updated", "User", employee._id, before, employee.toObject());
  res.json({ employee });
}

async function getOne(req, res) {
  const employee = await User.findOne({ _id: req.params.id, role: "employee", active: true })
    .select("-passwordHash -refreshTokenHash");
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  res.json({ employee });
}

async function offboard(req, res) {
  const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  const employee = await User.findOne({ _id: req.params.id, role: "employee", active: true });
  if (!employee) return res.status(404).json({ message: "Active employee not found." });
  const before = { active: employee.active, separationDate: employee.separationDate };
  employee.active = false;
  employee.tokenVersion = (employee.tokenVersion || 0) + 1;
  employee.separationDate = new Date();
  employee.terminationReason = input.reason;
  employee.refreshTokenHash = undefined;
  await employee.save();
  await recordAudit(req.user, "employee.offboarded", "User", employee._id, before, {
    active: employee.active, separationDate: employee.separationDate, reason: input.reason
  });
  res.json({ message: "Employee account deactivated.", separationDate: employee.separationDate });
}

async function me(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Employee profile is only available to employees." });
  res.json({ employee: await User.findById(req.user._id).select("-passwordHash -refreshTokenHash") });
}

async function updateMe(req, res) {
  if (req.user.role !== "employee") return res.status(403).json({ message: "Only employees can update their own contact details." });
  const input = z.object({ phone: z.string().trim().max(40).optional(), address: z.string().trim().max(300).optional() }).strict().parse(req.body);
  const employee = await User.findById(req.user._id);
  const before = { phone: employee.phone, address: employee.address };
  if (input.phone !== undefined) employee.phone = input.phone;
  if (input.address !== undefined) employee.address = input.address;
  await employee.save();
  await recordAudit(req.user, "employee.contact_updated", "User", employee._id, before, { phone: employee.phone, address: employee.address });
  res.json({ employee: { id: employee._id, name: employee.name, phone: employee.phone, address: employee.address } });
}

async function importEmployees(req, res) {
  const input = z.object({ dryRun: z.boolean().default(true), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500) }).parse(req.body);
  const company = await Company.findOne();
  const seen = new Set();
  const preview = [];
  const ready = [];
  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const parsed = employeeInput.safeParse(row);
    const errors = [];
    if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    const email = typeof row.email === "string" ? row.email.toLowerCase().trim() : "";
    if (email && seen.has(email)) errors.push("Duplicate email in this file.");
    if (email) seen.add(email);
    if (email && await User.exists({ email })) errors.push("Email already exists.");
    if (typeof row.department === "string" && row.department && !company?.departments.some((item) => item.name.toLowerCase() === row.department.trim().toLowerCase())) {
      errors.push("Unknown department.");
    }
    if (typeof row.designation === "string" && row.designation && !company?.designations.some((item) => item.name.toLowerCase() === row.designation.trim().toLowerCase())) {
      errors.push("Unknown designation.");
    }
    preview.push({ row: index + 2, email: email || "", valid: errors.length === 0, errors });
    if (!errors.length && parsed.success) {
      const normalized = { ...parsed.data };
      if (normalized.department) normalized.department = company.departments.find((item) => item.name.toLowerCase() === normalized.department.toLowerCase()).name;
      if (normalized.designation) normalized.designation = company.designations.find((item) => item.name.toLowerCase() === normalized.designation.toLowerCase()).name;
      ready.push(normalized);
    }
  }
  if (!input.dryRun) {
    const created = [];
    for (const employeeInputRow of ready) {
      const employeeCode = `EMP-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;
      const temporaryPassword = `Welcome-${cryptoRandom()}`;
      const employee = await User.create({
        name: employeeInputRow.name,
        email: employeeInputRow.email.toLowerCase(),
        phone: employeeInputRow.phone,
        address: employeeInputRow.address,
        department: employeeInputRow.department,
        designation: employeeInputRow.designation,
        joiningDate: employeeInputRow.joiningDate,
        employeeCode,
        salary: { basic: employeeInputRow.basicSalary, hra: employeeInputRow.basicSalary * 0.4, medical: employeeInputRow.basicSalary * 0.1 },
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        temporaryPassword: true,
        role: "employee"
      });
      await recordAudit(req.user, "employee.imported", "User", employee._id, null, { name: employee.name, email: employee.email, employeeCode });
      created.push({ email: employee.email, employeeCode, temporaryPassword });
    }
    return res.status(201).json({ dryRun: false, imported: created.length, credentials: created, rows: preview });
  }
  res.json({ dryRun: true, valid: ready.length, invalid: preview.length - ready.length, rows: preview });
}

module.exports = { list, create, update, getOne, offboard, me, updateMe, importEmployees };
