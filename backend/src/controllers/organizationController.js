const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Company, User, Leave } = require("../models");
const { recordAudit } = require("../services/auditService");

async function getSettings(_req, res) {
  res.json({ company: await Company.findOne() });
}

async function updateSettings(req, res) {
  const schema = z.object({
    name: z.string().trim().min(2).optional(),
    officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    timezone: z.string().min(1).max(100).refine((timezone) => {
      try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; }
      catch (error) { if (error instanceof RangeError) return false; throw error; }
    }, "Enter a valid IANA timezone.").optional(),
    graceMinutes: z.number().int().min(0).max(240).optional(),
    weekends: z.array(z.number().int().min(0).max(6)).optional(),
    officeLocation: z.string().max(300).optional(),
    attendanceRadiusMeters: z.number().positive().max(100000).optional(),
    geofenceEnabled: z.boolean().optional(),
    officeLatitude: z.number().min(-90).max(90).optional(),
    officeLongitude: z.number().min(-180).max(180).optional(),
    cameraCheckEnabled: z.boolean().optional(),
    latePenaltyPercent: z.number().min(0).max(100).optional()
  }).strict().superRefine((input, context) => {
    if (input.geofenceEnabled === true && (input.officeLatitude === undefined || input.officeLongitude === undefined)) {
      context.addIssue({ code: "custom", message: "Set office latitude and longitude before enabling geofence validation." });
    }
  });
  const input = schema.parse(req.body);
  const company = await Company.findOne();
  const before = company.toObject();
  Object.assign(company, input);
  await company.save();
  await recordAudit(req.user, "company.settings_updated", "Company", company._id, before, company.toObject());
  res.json({ company });
}

async function getCatalog(_req, res) {
  const company = await Company.findOne().select("departments designations leaveTypes holidays");
  res.json({ departments: company?.departments || [], designations: company?.designations || [], leaveTypes: company?.leaveTypes || [], holidays: company?.holidays || [] });
}

async function getWorkspaceSummary(_req, res) {
  const company = await Company.findOne().select("name geofenceEnabled cameraCheckEnabled");
  res.json({
    name: company?.name || "Saylani HCM",
    attendancePolicy: {
      geofenceEnabled: company?.geofenceEnabled || false,
      cameraCheckEnabled: company?.cameraCheckEnabled || false
    }
  });
}

async function addOrganizationItem(req, res) {
  const company = await Company.findOne();
  const type = req.params.type;
  let item;
  if (type === "departments" || type === "designations") item = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  else if (type === "leave-types") item = z.object({ name: z.string().trim().min(2), yearlyQuota: z.number().min(0).default(0), unlimited: z.boolean().default(false) }).parse(req.body);
  else if (type === "holidays") item = z.object({ name: z.string().trim().min(2), date: z.coerce.date() }).parse(req.body);
  else return res.status(404).json({ message: "Unknown organization collection." });
  const field = { departments: "departments", designations: "designations", "leave-types": "leaveTypes", holidays: "holidays" }[type];
  const list = company[field];
  if (list.some((current) => current.name?.toLowerCase() === item.name.toLowerCase())) return res.status(409).json({ message: "An item with this name already exists." });
  list.push(item);
  await company.save();
  await recordAudit(req.user, `company.${type}.added`, "Company", company._id, null, item);
  res.status(201).json({ company });
}

const catalogFields = {
  departments: "departments",
  designations: "designations",
  "leave-types": "leaveTypes",
  holidays: "holidays"
};

function catalogSchema(type) {
  if (type === "departments" || type === "designations") {
    return z.object({ name: z.string().trim().min(2).max(80) }).strict();
  }
  if (type === "leave-types") {
    return z.object({
      name: z.string().trim().min(2).max(80),
      yearlyQuota: z.number().min(0),
      unlimited: z.boolean()
    }).strict();
  }
  if (type === "holidays") {
    return z.object({ name: z.string().trim().min(2).max(80), date: z.coerce.date() }).strict();
  }
  throw Object.assign(new Error("Unknown organization collection."), { status: 404 });
}

async function updateOrganizationItem(req, res) {
  const field = catalogFields[req.params.type];
  if (!field) return res.status(404).json({ message: "Unknown organization collection." });
  const input = catalogSchema(req.params.type).partial().parse(req.body);
  const company = await Company.findOne();
  const item = company[field].id(req.params.id);
  if (!item) return res.status(404).json({ message: "Organization item not found." });
  if (input.name && input.name.toLowerCase() !== item.name?.toLowerCase()) {
    if (company[field].some((entry) => entry._id.toString() !== item._id.toString() && entry.name.toLowerCase() === input.name.toLowerCase())) {
      return res.status(409).json({ message: "An item with this name already exists." });
    }
    if (req.params.type === "departments" && await User.exists({ role: "employee", department: item.name })) {
      return res.status(409).json({ message: "This department is assigned to employees. Update those employee profiles first." });
    }
    if (req.params.type === "designations" && await User.exists({ role: "employee", designation: item.name })) {
      return res.status(409).json({ message: "This designation is assigned to employees. Update those employee profiles first." });
    }
    if (req.params.type === "leave-types" && await Leave.exists({ type: item.name })) {
      return res.status(409).json({ message: "This leave type has historical requests and cannot be renamed." });
    }
  }
  const before = item.toObject();
  item.set(input);
  await company.save();
  await recordAudit(req.user, `company.${req.params.type}.updated`, "Company", company._id, before, item.toObject());
  res.json({ item });
}

async function deleteOrganizationItem(req, res) {
  const field = catalogFields[req.params.type];
  if (!field) return res.status(404).json({ message: "Unknown organization collection." });
  const company = await Company.findOne();
  const item = company[field].id(req.params.id);
  if (!item) return res.status(404).json({ message: "Organization item not found." });
  if (req.params.type === "departments" && await User.exists({ role: "employee", department: item.name })) {
    return res.status(409).json({ message: "This department is assigned to employees and cannot be removed." });
  }
  if (req.params.type === "designations" && await User.exists({ role: "employee", designation: item.name })) {
    return res.status(409).json({ message: "This designation is assigned to employees and cannot be removed." });
  }
  if (req.params.type === "leave-types" && await Leave.exists({ type: item.name })) {
    return res.status(409).json({ message: "This leave type has historical requests and cannot be removed." });
  }
  const before = item.toObject();
  item.deleteOne();
  await company.save();
  await recordAudit(req.user, `company.${req.params.type}.removed`, "Company", company._id, before, null);
  res.json({ message: "Organization item removed." });
}

async function createHr(req, res) {
  const input = z.object({ name: z.string().trim().min(2), email: z.string().email(), password: z.string().min(10) }).parse(req.body);
  if (await User.exists({ email: input.email.toLowerCase() })) return res.status(409).json({ message: "Email already exists." });
  const user = await User.create({ name: input.name, email: input.email.toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12), role: "hr", temporaryPassword: true });
  await recordAudit(req.user, "hr.created", "User", user._id, null, { name: user.name, email: user.email });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
}

async function resetPassword(req, res) {
  const input = z.object({ password: z.string().min(10) }).parse(req.body);
  const user = await User.findOne({ _id: req.params.id, role: { $in: ["hr", "employee"] } });
  if (!user) return res.status(404).json({ message: "HR or employee account not found." });
  const before = { temporaryPassword: user.temporaryPassword };
  user.passwordHash = await bcrypt.hash(input.password, 12);
  user.temporaryPassword = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.refreshTokenHash = undefined;
  await user.save();
  await recordAudit(req.user, "user.password_reset", "User", user._id, before, { temporaryPassword: true });
  res.json({ message: "Temporary password has been set." });
}

module.exports = { getSettings, getCatalog, getWorkspaceSummary, updateSettings, addOrganizationItem, updateOrganizationItem, deleteOrganizationItem, createHr, resetPassword };
