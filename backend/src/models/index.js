const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true } }, { _id: true });
const designationSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true } }, { _id: true });
const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  yearlyQuota: { type: Number, default: 0 },
  unlimited: { type: Boolean, default: false }
}, { _id: true });
const holidaySchema = new mongoose.Schema({ name: String, date: { type: Date, required: true } }, { _id: true });

const companySchema = new mongoose.Schema({
  singletonKey: { type: String, default: "main", unique: true, immutable: true },
  name: { type: String, required: true, trim: true },
  officeStart: { type: String, default: "09:00" },
  timezone: { type: String, default: "Asia/Karachi" },
  graceMinutes: { type: Number, default: 15 },
  weekends: { type: [Number], default: [0, 6] },
  officeLocation: { type: String, default: "" },
  attendanceRadiusMeters: { type: Number, default: 500 },
  geofenceEnabled: { type: Boolean, default: false },
  officeLatitude: { type: Number, min: -90, max: 90 },
  officeLongitude: { type: Number, min: -180, max: 180 },
  cameraCheckEnabled: { type: Boolean, default: false },
  latePenaltyPercent: { type: Number, default: 0, min: 0, max: 100 },
  departments: [departmentSchema],
  designations: [designationSchema],
  leaveTypes: { type: [leaveTypeSchema], default: [
    { name: "Annual", yearlyQuota: 14 }, { name: "Sick", yearlyQuota: 8 },
    { name: "Casual", yearlyQuota: 10 }, { name: "Unpaid", unlimited: true }
  ] },
  holidays: [holidaySchema]
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  refreshTokenHash: { type: String, select: false },
  role: { type: String, enum: ["admin", "hr", "employee"], required: true },
  tokenVersion: { type: Number, default: 0 },
  employeeCode: { type: String, unique: true, sparse: true },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  department: { type: String, default: "" },
  designation: { type: String, default: "" },
  joiningDate: Date,
  salary: { basic: { type: Number, default: 0 }, hra: { type: Number, default: 0 }, medical: { type: Number, default: 0 } },
  temporaryPassword: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  separationDate: Date,
  terminationReason: String
}, { timestamps: true });
userSchema.index({ name: "text", email: "text", employeeCode: "text" });
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "admin" } });

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  dateKey: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: Date,
  status: { type: String, enum: ["present", "late", "half-day", "missing-checkout"], default: "present" },
  lateArrival: { type: Boolean, default: false },
  cameraPresenceChecked: { type: Boolean, default: false },
  correction: { requestedCheckIn: Date, requestedCheckOut: Date, reason: String, status: String, comment: String }
}, { timestamps: true });
attendanceSchema.index({ employee: 1, dateKey: 1 }, { unique: true });

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true }, startDate: { type: Date, required: true }, endDate: { type: Date, required: true },
  days: { type: Number, required: true }, reason: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, comment: String
}, { timestamps: true });

const payrollSchema = new mongoose.Schema({
  month: { type: String, required: true },
  items: [{ employee: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String, employeeCode: String, basic: Number, hra: Number, medical: Number, gross: Number, absentDeduction: Number, unpaidDeduction: Number, halfDayDeduction: Number, latePenaltyDeduction: Number, tax: Number, net: Number }],
  total: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "finalized"], default: "draft" },
  finalizedAt: Date,
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });
payrollSchema.index({ month: 1 }, { unique: true });

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, actorName: String,
  action: { type: String, required: true }, entity: String, entityId: String,
  before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});
auditSchema.index({ timestamp: -1 });
const announcementSchema = new mongoose.Schema({ title: String, body: String, author: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, createdAt: { type: Date, default: Date.now } });
const aiLogSchema = new mongoose.Schema({ user: mongoose.Schema.Types.ObjectId, question: String, answer: String, createdAt: { type: Date, default: Date.now } });
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  entity: String,
  entityId: String,
  readAt: Date,
  createdAt: { type: Date, default: Date.now }
});
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = {
  Company: mongoose.models.Company || mongoose.model("Company", companySchema),
  User: mongoose.models.User || mongoose.model("User", userSchema),
  Attendance: mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema),
  Leave: mongoose.models.Leave || mongoose.model("Leave", leaveSchema),
  Payroll: mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema),
  Announcement: mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema),
  AiLog: mongoose.models.AiLog || mongoose.model("AiLog", aiLogSchema),
  Notification: mongoose.models.Notification || mongoose.model("Notification", notificationSchema)
};
