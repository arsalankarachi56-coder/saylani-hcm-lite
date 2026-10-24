const PDFDocument = require("pdfkit");
const { Payroll } = require("../models");
const { buildPayroll } = require("../services/payrollService");
const { recordAudit } = require("../services/auditService");

async function generate(req, res) {
  const month = String(req.body.month || "");
  const computed = await buildPayroll(month);
  const payroll = await Payroll.findOneAndUpdate(
    { month, status: "draft" },
    { $set: { items: computed.items, total: computed.total } },
    { new: true, upsert: true, runValidators: true }
  );
  await recordAudit(req.user, "payroll.draft_generated", "Payroll", payroll._id, null, { month, total: payroll.total });
  res.status(201).json({ payroll });
}

async function list(req, res) {
  const payrolls = req.user.role === "employee"
    ? (await Payroll.find({ status: "finalized", "items.employee": req.user._id }).sort({ month: -1 }))
      .map((payroll) => ({
        _id: payroll._id,
        month: payroll.month,
        status: payroll.status,
        items: payroll.items.filter((item) => item.employee.toString() === req.user._id.toString())
      }))
    : await Payroll.find().sort({ month: -1 });
  res.json({ payrolls });
}

async function finalize(req, res) {
  const payroll = await Payroll.findById(req.params.id);
  if (!payroll) return res.status(404).json({ message: "Payroll not found." });
  if (payroll.status === "finalized") return res.status(409).json({ message: "Finalized payroll is locked." });
  const before = { status: payroll.status, total: payroll.total };
  payroll.status = "finalized";
  payroll.finalizedAt = new Date();
  payroll.finalizedBy = req.user._id;
  await payroll.save();
  await recordAudit(req.user, "payroll.finalized", "Payroll", payroll._id, before, { status: payroll.status, total: payroll.total });
  res.json({ payroll });
}

async function payslip(req, res) {
  const payroll = await Payroll.findOne({ month: req.params.month, status: "finalized", "items.employee": req.user._id });
  if (!payroll) return res.status(404).json({ message: "Payslip not found." });
  const item = payroll.items.find((entry) => entry.employee.toString() === req.user._id.toString());
  if (!item) return res.status(404).json({ message: "Payslip not found." });
  const doc = new PDFDocument({ size: "A4", margin: 52 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="payslip-${payroll.month}.pdf"`);
  doc.pipe(res);
  doc.fontSize(22).fillColor("#12263a").text("PAYSLIP", { align: "right" });
  doc.moveDown().fontSize(12).fillColor("#334155").text("Saylani HCM Lite");
  doc.text(`Pay period: ${payroll.month}`).text(`Employee: ${item.name}`).text(`Employee code: ${item.employeeCode || "-"}`);
  doc.moveDown().fontSize(14).text("Earnings", { underline: true });
  doc.fontSize(11).text(`Basic salary: PKR ${item.basic.toLocaleString()}`);
  doc.text(`HRA: PKR ${item.hra.toLocaleString()}`).text(`Medical: PKR ${item.medical.toLocaleString()}`);
  doc.text(`Gross salary: PKR ${item.gross.toLocaleString()}`);
  doc.moveDown().fontSize(14).text("Deductions", { underline: true });
  doc.fontSize(11).text(`Absence: PKR ${item.absentDeduction.toLocaleString()}`);
  doc.text(`Unpaid leave: PKR ${item.unpaidDeduction.toLocaleString()}`).text(`Half day: PKR ${item.halfDayDeduction.toLocaleString()}`);
  doc.text(`Late attendance: PKR ${(item.latePenaltyDeduction || 0).toLocaleString()}`);
  doc.text(`Tax: PKR ${item.tax.toLocaleString()}`);
  doc.moveDown().fontSize(16).fillColor("#047857").text(`Net pay: PKR ${item.net.toLocaleString()}`);
  doc.end();
}

module.exports = { generate, list, finalize, payslip };
