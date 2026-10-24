const express = require("express");
const { authenticate, allowRoles } = require("./middleware/auth");
const setup = require("./controllers/setupController");
const auth = require("./controllers/authController");
const employees = require("./controllers/employeeController");
const attendance = require("./controllers/attendanceController");
const leave = require("./controllers/leaveController");
const organization = require("./controllers/organizationController");
const payroll = require("./controllers/payrollController");
const dashboard = require("./controllers/dashboardController");
const communication = require("./controllers/communicationController");
const ai = require("./controllers/aiController");

const router = express.Router();
router.get("/setup/status", setup.setupStatus);
router.post("/setup", setup.createCompany);
router.post("/auth/login", auth.login);
router.post("/auth/refresh", auth.refresh);
router.use(authenticate);
router.post("/auth/logout", auth.logout);
router.post("/auth/change-password", auth.changePassword);
router.get("/auth/me", (req, res) => res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, temporaryPassword: req.user.temporaryPassword } }));

router.get("/employees/me", employees.me);
router.patch("/employees/me", allowRoles("employee"), employees.updateMe);
router.get("/employees", allowRoles("admin", "hr", "employee"), employees.list);
router.post("/employees", allowRoles("hr"), employees.create);
router.post("/employees/import", allowRoles("hr"), employees.importEmployees);
router.get("/employees/:id", allowRoles("admin", "hr"), employees.getOne);
router.patch("/employees/:id", allowRoles("hr"), employees.update);
router.post("/employees/:id/offboard", allowRoles("hr"), employees.offboard);
router.get("/directory", allowRoles("admin", "hr"), communication.directory);

router.post("/attendance/check-in", attendance.checkIn);
router.post("/attendance/check-out", attendance.checkOut);
router.post("/attendance/corrections", attendance.requestCorrection);
router.get("/attendance", allowRoles("admin", "hr", "employee"), attendance.list);
router.get("/attendance/board", allowRoles("admin", "hr"), attendance.board);
router.get("/attendance/corrections", allowRoles("hr"), attendance.corrections);
router.patch("/attendance/:id/correction", allowRoles("hr"), attendance.reviewCorrection);

router.get("/leave", leave.list);
router.get("/leave/balance", leave.balance);
router.post("/leave", leave.create);
router.post("/leave/:id/cancel", allowRoles("employee"), leave.cancel);
router.patch("/leave/:id/review", allowRoles("hr"), leave.review);

router.get("/organization", allowRoles("admin"), organization.getSettings);
router.get("/organization/catalog", allowRoles("admin", "hr"), organization.getCatalog);
router.get("/organization/summary", organization.getWorkspaceSummary);
router.patch("/organization", allowRoles("admin"), organization.updateSettings);
router.post("/organization/hr", allowRoles("admin"), organization.createHr);
router.post("/organization/:type", allowRoles("admin"), organization.addOrganizationItem);
router.patch("/organization/:type/:id", allowRoles("admin"), organization.updateOrganizationItem);
router.delete("/organization/:type/:id", allowRoles("admin"), organization.deleteOrganizationItem);
router.post("/organization/users/:id/reset-password", allowRoles("admin"), organization.resetPassword);

router.get("/payroll", payroll.list);
router.post("/payroll/generate", allowRoles("hr"), payroll.generate);
router.post("/payroll/:id/finalize", allowRoles("admin"), payroll.finalize);
router.get("/payroll/:month/payslip", allowRoles("employee"), payroll.payslip);

router.get("/dashboard", dashboard.getDashboard);
router.get("/announcements", communication.listAnnouncements);
router.post("/announcements", allowRoles("hr"), communication.createAnnouncement);
router.get("/notifications", communication.listNotifications);
router.patch("/notifications/:id/read", communication.readNotification);
router.get("/audit", allowRoles("admin"), communication.auditFeed);
router.post("/ai", ai.ask);

module.exports = router;
