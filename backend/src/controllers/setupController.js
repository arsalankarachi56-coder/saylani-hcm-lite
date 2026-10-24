const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Company, User } = require("../models");
const { recordAudit } = require("../services/auditService");

const setupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  adminName: z.string().trim().min(2).max(100),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(10)
});

async function setupStatus(_req, res) {
  res.json({ setupRequired: !(await User.exists({ role: "admin" })) });
}

async function createCompany(req, res) {
  const input = setupSchema.parse(req.body);
  if (await User.exists({ role: "admin" })) return res.status(409).json({ message: "Initial setup has already been completed." });
  const company = await Company.findOneAndUpdate(
    { singletonKey: "main" },
    { $set: { name: input.companyName }, $setOnInsert: { singletonKey: "main" } },
    { new: true, upsert: true, runValidators: true }
  );
  const admin = await User.create({
    name: input.adminName, email: input.adminEmail.toLowerCase(),
    passwordHash: await bcrypt.hash(input.adminPassword, 12), role: "admin"
  });
  await recordAudit(admin, "company.setup", "Company", company._id, null, { name: company.name });
  res.status(201).json({ message: "Company and administrator created.", company: { name: company.name }, admin: { name: admin.name, email: admin.email } });
}

module.exports = { setupStatus, createCompany };
