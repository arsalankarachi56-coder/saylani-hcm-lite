import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, Bot, BriefcaseBusiness, CalendarDays, Check,
  ChevronDown, CircleHelp, Clock3, FileText, LayoutDashboard, LogOut, Menu, Pencil, Plus, Search,
  Moon, Settings2, ShieldCheck, Sun, Trash2, Users, X
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import api, { messageFromError } from "./api";

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const roleLabels = { admin: "Administrator", hr: "People operations", employee: "Employee" };

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hcm.user") || "null"); } catch { return null; }
  });
  const [notice, setNotice] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  };
  const signIn = (data) => {
    localStorage.setItem("hcm.accessToken", data.accessToken);
    localStorage.setItem("hcm.refreshToken", data.refreshToken);
    localStorage.setItem("hcm.user", JSON.stringify(data.user));
    setUser(data.user);
  };
  const signOut = async () => {
    try { await api.post("/auth/logout"); } catch { /* Local session is always cleared. */ }
    ["hcm.accessToken", "hcm.refreshToken", "hcm.user"].forEach((key) => localStorage.removeItem(key));
    setUser(null);
    navigate("/login");
  };
  const completePasswordChange = (session) => {
    localStorage.setItem("hcm.accessToken", session.accessToken);
    localStorage.setItem("hcm.refreshToken", session.refreshToken);
    localStorage.setItem("hcm.user", JSON.stringify(session.user));
    setUser(session.user);
  };
  const value = useMemo(() => ({ user, signIn, signOut, notify, completePasswordChange }), [user]);

  useEffect(() => {
    if (location.pathname === "/") {
      api.get("/setup/status").then(({ data }) => navigate(data.setupRequired ? "/setup" : user ? "/app" : "/login", { replace: true }))
        .catch(() => navigate("/login", { replace: true }));
    }
  }, [location.pathname, navigate, user]);

  return <AuthContext.Provider value={value}>
    {notice && <div className="toast"><Check size={17} />{notice}</div>}
    <Routes>
      <Route path="/" element={<div className="page-loading"><span className="spinner" /></div>} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app/*" element={user ? <AppShell /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AuthContext.Provider>;
}

function SetupPage() {
  const navigate = useNavigate();
  const { notify } = useAuth();
  const [form, setForm] = useState({ companyName: "", adminName: "", adminEmail: "", adminPassword: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/setup/status").then(({ data }) => { if (!data.setupRequired) navigate("/login", { replace: true }); }); }, [navigate]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/setup", form);
      notify("Your company workspace is ready.");
      navigate("/login");
    } catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  return <AuthFrame eyebrow="FIRST-RUN SETUP" title="Build your people workspace." subtitle="Start with your organization and administrator account. Your employee data stays empty until you add your team.">
    <form onSubmit={submit} className="form-stack">
      <Field label="Company name" placeholder="e.g. Saylani Welfare" value={form.companyName} onChange={(value) => setForm({ ...form, companyName: value })} required />
      <Field label="Administrator name" placeholder="Your full name" value={form.adminName} onChange={(value) => setForm({ ...form, adminName: value })} required />
      <Field label="Work email" type="email" placeholder="you@company.com" value={form.adminEmail} onChange={(value) => setForm({ ...form, adminEmail: value })} required />
      <Field label="Password" type="password" placeholder="At least 10 characters" value={form.adminPassword} onChange={(value) => setForm({ ...form, adminPassword: value })} required minLength={10} />
      <button className="button button-primary button-full" disabled={busy}>{busy ? "Creating workspace…" : "Create workspace"}<ArrowRight size={17} /></button>
    </form>
  </AuthFrame>;
}

function LoginPage() {
  const { signIn, notify } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try { const { data } = await api.post("/auth/login", { email, password }); signIn(data); navigate("/app"); }
    catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  return <AuthFrame eyebrow="SAYLANI HCM LITE" title="Welcome back." subtitle="Sign in to manage your workday, your people, and everything in between.">
    <form onSubmit={submit} className="form-stack">
      <Field label="Work email" type="email" placeholder="you@company.com" value={email} onChange={setEmail} required />
      <Field label="Password" type="password" placeholder="Enter your password" value={password} onChange={setPassword} required />
      <button className="button button-primary button-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
    </form>
    <div className="login-foot"><ShieldCheck size={15} /> Secure access protected by your organization</div>
  </AuthFrame>;
}

function AuthFrame({ eyebrow, title, subtitle, children }) {
  return <main className="auth-layout">
    <section className="auth-art">
      <div className="brand brand-light"><span className="brand-mark">S</span><span>saylani<span className="brand-muted"> / people</span></span></div>
      <div className="art-copy"><div className="art-kicker">PEOPLE FIRST. ALWAYS.</div><h2>Great work<br />starts with<br /><em>great people.</em></h2><p>A thoughtful, connected workspace for the people who make your organization thrive.</p></div>
      <div className="art-bottom"><span>HUMAN CAPITAL · MADE SIMPLE</span><span>01 — 04</span></div>
      <div className="art-orb" />
    </section>
    <section className="auth-main"><div className="auth-card"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</div><div className="auth-copyright">© {new Date().getFullYear()} Saylani HCM Lite · Built for better work</div></section>
  </main>;
}

const navItems = [
  { label: "Overview", path: "/app", icon: LayoutDashboard, roles: ["admin", "hr", "employee"] },
  { label: "People", path: "/app/people", icon: Users, roles: ["admin", "hr"] },
  { label: "Attendance", path: "/app/attendance", icon: Clock3, roles: ["admin", "hr", "employee"] },
  { label: "Time off", path: "/app/leave", icon: CalendarDays, roles: ["admin", "hr", "employee"] },
  { label: "Payroll", path: "/app/payroll", icon: BriefcaseBusiness, roles: ["admin", "hr", "employee"] },
  { label: "Announcements", path: "/app/announcements", icon: Bell, roles: ["admin", "hr", "employee"] },
  { label: "AI assistant", path: "/app/assistant", icon: Bot, roles: ["admin", "hr", "employee"] },
  { label: "My account", path: "/app/account", icon: ShieldCheck, roles: ["admin", "hr", "employee"] },
  { label: "Organization", path: "/app/settings", icon: Settings2, roles: ["admin"] },
  { label: "Audit log", path: "/app/audit", icon: ShieldCheck, roles: ["admin"] }
];

function AppShell() {
  const { user, signOut } = useAuth();
  const { data: workspace } = useLoad("/organization/summary", []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const preference = localStorage.getItem("hcm.theme");
    return preference ? preference === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
  });
  const location = useLocation();
  const title = navItems.find((item) => item.path === location.pathname)?.label || "Overview";
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("hcm.theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  return <div className="workspace">
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <Link to="/app" className="brand"><span className="brand-mark">S</span><span>saylani<span className="brand-muted"> / people</span></span></Link>
      <div className="workspace-switch"><span className="company-avatar">{(workspace?.name || "S").slice(0, 1).toUpperCase()}</span><span className="workspace-name">{workspace?.name || "People workspace"}<small>People operations</small></span><ChevronDown size={15} /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav">{navItems.filter((item) => item.roles.includes(user.role)).map(({ label, path, icon: Icon }) =>
        <NavLink key={path} to={path} end={path === "/app"} className={({ isActive }) => `nav-link ${isActive ? "nav-active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>
      )}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><b>Need a hand?</b><span>Explore the AI assistant for quick answers.</span><Link to="/app/assistant">Ask a question <ArrowRight size={13} /></Link></div>
        <button className="profile-row" onClick={signOut}><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><b>{user.name}</b><small>{roleLabels[user.role]}</small></span><LogOut size={17} /></button>
      </div>
    </aside>
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumbs">Workspace <span>/</span> <b>{title}</b></div><div className="topbar-right"><span className="today-label">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><button className="icon-button theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`} title={`Switch to ${darkMode ? "light" : "dark"} mode`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><NotificationButton /><span className="top-avatar">{user.name?.slice(0, 1).toUpperCase()}</span></div></header>
      <div className="page-content">{user.temporaryPassword ? <TemporaryPasswordGate /> : <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function StatCard({ label, value, detail, icon: Icon, tone = "teal" }) {
  return <div className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={18} /></div><div className="stat-label">{label}</div><div className="stat-value">{value ?? "—"}</div><div className="stat-detail">{detail}</div></div>;
}
function EmptyState({ title, description }) { return <div className="empty-state"><span><FileText size={20} /></span><b>{title}</b><p>{description}</p></div>; }
function Field({ label, value, onChange, type = "text", placeholder, required, minLength, options, rows, step }) {
  return <label className="field"><span>{label}</span>{options
    ? <select value={value} onChange={(event) => onChange(event.target.value)} required={required}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
    : rows ? <textarea rows={rows} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
      : <input type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} required={required} minLength={minLength} step={step} />}</label>;
}
function DataTable({ columns, rows, emptyTitle = "Nothing to see here yet", emptyText = "Once there's something to show, it'll appear here." }) {
  if (!rows?.length) return <EmptyState title={emptyTitle} description={emptyText} />;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || row.id || row.employee?._id || index}>{columns.map((column) => <td key={column.label}>{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}</tr>)}</tbody></table></div>;
}
function StatusPill({ status }) { return <span className={`status-pill status-${String(status).toLowerCase().replaceAll(" ", "-")}`}>{String(status).replaceAll("-", " ")}</span>; }
function useLoad(path, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = async () => {
    setLoading(true);
    try { const response = await api.get(path); setData(response.data); setError(""); }
    catch (reason) { setError(messageFromError(reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, dependencies);
  return { data, loading, error, reload };
}
function LoadingState() { return <div className="loading-state"><span className="spinner" />Loading your workspace…</div>; }
function Panel({ title, subtitle, action, children, className = "" }) { return <section className={`panel ${className}`}><div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }

function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState("");
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const { data, loading, error } = useLoad(`/dashboard?from=${month}-01&to=${month}-${String(lastDay).padStart(2, "0")}&department=${encodeURIComponent(department)}`, [month, department]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorPanel message={error} />;
  if (user.role === "employee") return <EmployeeDashboard data={data} />;
  const isAdmin = user.role === "admin";
  return <><PageHeading eyebrow={`${isAdmin ? "ADMINISTRATOR" : "PEOPLE OPERATIONS"} · OVERVIEW`} title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${user.name.split(" ")[0]}.`} description="Here’s the latest from your people workspace." action={<div className="dashboard-filters"><input aria-label="Dashboard month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><input aria-label="Filter department" placeholder="All departments" value={department} onChange={(event) => setDepartment(event.target.value)} /><Link to="/app/assistant" className="button button-outline"><Bot size={16} />Ask AI</Link></div>} />
    <DashboardSummary role={user.role} data={data} />
    <div className="stat-grid">{isAdmin ? <>
      <StatCard label="Team members" value={data.headcount} detail="Active employees" icon={Users} />
      <StatCard label="Average salary" value={`PKR ${Math.round(data.averageSalary || 0).toLocaleString()}`} detail="Monthly gross average" icon={BriefcaseBusiness} tone="blue" />
      <StatCard label="Payroll cost" value={`PKR ${Math.round(data.payrollCost || 0).toLocaleString()}`} detail="Finalized payroll in range" icon={Activity} tone="purple" />
      <StatCard label="Attrition" value={`${data.attritionRate}%`} detail={`${data.departures} departures in range`} icon={Users} tone="amber" />
    </> : <>
      <StatCard label="Present in range" value={data.present} detail={`${data.late} arrived late`} icon={Activity} tone="blue" />
      <StatCard label="Approved leave days" value={data.leave} detail="Working days in range" icon={CalendarDays} tone="purple" />
      <StatCard label="Late arrivals" value={data.late} detail="In selected period" icon={Clock3} tone="amber" />
      <StatCard label="Pending approvals" value={data.pendingApprovals} detail="Leave & corrections" icon={BriefcaseBusiness} />
    </>}</div>
    <div className="dashboard-grid"><Panel title="Attendance pulse" subtitle="Daily attendance activity" className="chart-panel"><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.attendanceTrend}><defs><linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b8074" stopOpacity={0.2} /><stop offset="95%" stopColor="#0b8074" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eff1" /><XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={28} /><Tooltip /><Area type="monotone" dataKey="present" stroke="#0b8074" fill="url(#presentFill)" strokeWidth={2.5} /><Area type="monotone" dataKey="late" stroke="#d88c37" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-teal" />On time</span><span><i className="legend-amber" />Late arrivals</span></div></Panel>
      <Panel title="Team distribution" subtitle="Employees by department">{data.departmentDistribution?.length ? <><div className="pie-wrap"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={data.departmentDistribution} dataKey="count" nameKey="department" innerRadius={55} outerRadius={78} paddingAngle={3}>{data.departmentDistribution.map((entry, index) => <Cell key={entry.department} fill={["#0b8074", "#7a8ce2", "#dfa852", "#df786f", "#55a5c1"][index % 5]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="distribution-list">{data.departmentDistribution.slice(0, 4).map((item, index) => <div key={item.department}><span><i style={{ background: ["#0b8074", "#7a8ce2", "#dfa852", "#df786f"][index % 4] }} />{item.department}</span><b>{item.count}</b></div>)}</div></> : <EmptyState title="No departments yet" description="Add your first team to see the distribution." />}</Panel>
      {!isAdmin && <Panel title="Leave trend" subtitle="Approved leave days by type" className="wide-panel"><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.leaveTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eff1" /><XAxis dataKey="type" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} /><Tooltip /><Bar dataKey="days" name="Approved days" fill="#7a8ce2" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>}
      {isAdmin && <Panel title="Recent activity" subtitle="A read-only record of workspace changes" action={<Link className="text-link" to="/app/audit">View all <ArrowRight size={14} /></Link>} className="wide-panel"><DataTable columns={[{ label: "Activity", render: (row) => <b>{row.action?.replaceAll(".", " ")}</b> }, { label: "By", key: "actorName" }, { label: "Area", key: "entity" }, { label: "When", render: (row) => new Date(row.timestamp).toLocaleString() }]} rows={data.auditFeed} /></Panel>}
      {isAdmin && <Panel title="Attrition trend" subtitle="Aggregate estimate from recorded separations" className="wide-panel"><div className="insight-summary"><b>{data.attritionForecast?.estimatedNext30Days ?? 0}</b><span>estimated departures in the next 30 days if the recent 90-day pace continues</span></div><p className="setting-note">{data.attritionForecast?.recentDepartures90Days ?? 0} recorded departures in the last 90 days. {data.attritionForecast?.label} With a new or empty workspace there is not enough history to forecast reliably.</p></Panel>}
      {data.topLateEmployees?.length > 0 && <Panel title="Frequent late arrivals" subtitle="Based on selected period"><DataTable columns={[{ label: "Employee", key: "name" }, { label: "Late arrivals", render: (row) => <b>{row.count}</b> }]} rows={data.topLateEmployees} /></Panel>}
      <Panel title="Absence pattern signals" subtitle="Rule-based flags for HR review; not a disciplinary finding"><p className="setting-note">Flags appear after at least three unrecorded workday absences. Confirm attendance and leave records before taking action.</p>{data.absenceAnomalies?.length ? <DataTable columns={[{ label: "Employee", key: "employee" }, { label: "Department", key: "department" }, { label: "Unrecorded days", key: "absenceDays" }, { label: "Workdays", key: "workdays" }, { label: "Review note", key: "signal" }]} rows={data.absenceAnomalies} /> : <EmptyState title="No absence patterns flagged" description="This period has no repeated unrecorded workday absences." />}</Panel>
      <Panel title="Latest announcements" subtitle="Updates for your organization" action={<Link className="text-link" to="/app/announcements">All updates <ArrowRight size={14} /></Link>} className="wide-panel"><AnnouncementList announcements={data.announcements} /></Panel>
    </div>
  </>;
}

function EmployeeDashboard({ data }) {
  const { notify, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const { data: workspace } = useLoad("/organization/summary", []);
  const refresh = () => window.location.reload();
  const action = async (path, payload = {}) => {
    setBusy(true);
    try {
      if (path === "/attendance/check-in" && workspace?.attendancePolicy?.geofenceEnabled) {
        if (!navigator.geolocation) throw new Error("This browser does not support location access.");
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, maximumAge: 0, timeout: 12000
        }));
        payload = { ...payload, latitude: position.coords.latitude, longitude: position.coords.longitude };
      }
      await api.post(path, payload);
      notify("Attendance updated.");
      refresh();
    } catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  const checkedIn = !!data.today.attendance;
  const checkedOut = !!data.today.attendance?.checkOut;
  return <><PageHeading eyebrow="YOUR WORKSPACE" title={`Hello, ${user.name.split(" ")[0]}.`} description="Your workday, in one calm place." />
    <DashboardSummary role="employee" data={data} />
    <div className="employee-welcome"><div><div className="eyebrow">TODAY · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div><h2>{checkedOut ? "You’re all wrapped up." : checkedIn ? "You’re checked in." : "Ready when you are."}</h2><p>{checkedOut ? `You worked ${data.today.hoursWorked} hours today.` : checkedIn ? "Remember to check out when you're done." : "Start your day by checking in."}</p></div><div className="checkin-actions">{!checkedIn && <button disabled={busy} className="button button-light" onClick={() => workspace?.attendancePolicy?.cameraCheckEnabled ? setCameraOpen(true) : action("/attendance/check-in")}><Check size={16} />Check in</button>}{checkedIn && !checkedOut && <button disabled={busy} className="button button-light" onClick={() => action("/attendance/check-out")}><LogOut size={16} />Check out</button>}<span><Clock3 size={15} />{checkedIn ? new Date(data.today.attendance.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No check-in yet"}</span></div></div>
    {cameraOpen && <CameraPresenceModal onClose={() => setCameraOpen(false)} onVerified={() => { setCameraOpen(false); action("/attendance/check-in", { cameraPresenceChecked: true }); }} />}
    <div className="stat-grid stat-grid-three"><StatCard label="Hours today" value={data.today.hoursWorked || "—"} detail="Hours recorded" icon={Clock3} /><StatCard label="Late arrivals" value={data.lateCount} detail="All time" icon={Activity} tone="amber" /><StatCard label="Leave types" value={data.balances.length} detail="Your available balances" icon={CalendarDays} tone="purple" /></div>
    <div className="dashboard-grid"><Panel title="Your leave balance" subtitle="Available days this year"><DataTable columns={[{ label: "Leave type", key: "type" }, { label: "Used", key: "used" }, { label: "Remaining", render: (row) => row.remaining ?? "Unlimited" }]} rows={data.balances} /></Panel><Panel title="Latest announcements" subtitle="From your organization"><AnnouncementList announcements={data.announcements} /></Panel></div>
    <EmployeeContactPanel />
    {data.lastPayslip && <Panel title="Your latest payslip" subtitle={data.lastPayslip.month} action={<Link to="/app/payroll" className="text-link">View payroll <ArrowRight size={14} /></Link>}><p className="net-pay">PKR {data.lastPayslip.item?.net?.toLocaleString() || "Available"}</p></Panel>}
  </>;
}

function CameraPresenceModal({ onClose, onVerified }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [message, setMessage] = useState("Starting your camera…");
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera access is unavailable in this browser.");
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMessage(typeof window.FaceDetector === "function"
          ? "Center your face in the frame, then continue."
          : "Face detection is unsupported in this browser. Ask HR to disable the camera requirement.");
      })
      .catch((error) => setMessage(error.message || "Camera permission was denied."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const verify = async () => {
    if (typeof window.FaceDetector !== "function") {
      setMessage("Face detection is unsupported in this browser.");
      return;
    }
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setMessage("Wait for the camera preview to start, then try again.");
      return;
    }
    setBusy(true);
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(videoRef.current);
      if (!faces.length) { setMessage("No face was detected. Adjust the camera and try again."); return; }
      onVerified();
    } catch (error) { setMessage(error.message || "Face detection failed. Please try again."); }
    finally { setBusy(false); }
  };
  return <Modal title="Camera presence check" onClose={onClose}>
    <div className="camera-check">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" onLoadedData={() => setCameraReady(true)} />
      <p>{message}</p>
      <small>Detection runs on this device only. No photo or face template is stored; this checks presence, not identity.</small>
      <div className="row-actions"><button className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !cameraReady || typeof window.FaceDetector !== "function"} onClick={verify}>{busy ? "Checking…" : "Detect face & check in"}</button></div>
    </div>
  </Modal>;
}

function EmployeeContactPanel() {
  const { notify } = useAuth();
  const { data, loading, error, reload } = useLoad("/employees/me", []);
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data?.employee && !form) setForm({ phone: data.employee.phone || "", address: data.employee.address || "" });
  }, [data, form]);
  const save = async (event) => {
    event.preventDefault();
    try { await api.patch("/employees/me", form); notify("Your contact details were updated."); reload(); }
    catch (reason) { notify(messageFromError(reason)); }
  };
  return <Panel title="Your contact details" subtitle="Only you can update your phone number and address">{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : form && <form className="inline-form" onSubmit={save}><Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} /><Field label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} /><button className="button button-primary">Save details</button></form>}</Panel>;
}

function DashboardSummary({ role, data }) {
  const { notify } = useAuth();
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const { data: result } = await api.post("/ai", {
        question: role === "employee"
          ? "Use my personal attendance summary and leave balance tools to summarize my workday."
          : "Use the company headcount, attendance, leave, and payroll tools to summarize the current dashboard and mention items needing attention."
      });
      setSummary(result.answer);
    } catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  return <section className="dashboard-summary"><span className="summary-icon"><Bot size={18} /></span><div className="summary-content"><div><b>AI workspace summary</b><small>AI-generated · Based on your current dashboard data</small></div>{summary && <p>{summary}</p>}</div><button disabled={busy} className="button button-outline button-small" onClick={generate}>{busy ? "Thinking…" : summary ? "Refresh summary" : "Generate summary"}<ArrowRight size={14} /></button></section>;
}

function ErrorPanel({ message }) { return <div className="error-panel"><CircleHelp size={19} /><div><b>We couldn’t load this page</b><p>{message}</p></div></div>; }
function TemporaryPasswordGate() {
  const { user, signOut, completePasswordChange, notify } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      completePasswordChange(data);
      notify("Password updated. Welcome to your workspace.");
    } catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  return <div className="password-gate"><span className="stat-icon stat-teal"><ShieldCheck size={19} /></span><div className="eyebrow">ONE QUICK SECURITY STEP</div><h1>Make this account yours.</h1><p>Set a new password before you continue into the workspace.</p><form className="form-stack" onSubmit={submit}><Field label="Temporary password" type="password" value={currentPassword} onChange={setCurrentPassword} required /><Field label="New password" type="password" minLength={10} value={newPassword} onChange={setNewPassword} placeholder="At least 10 characters" required /><button disabled={busy} className="button button-primary button-full">{busy ? "Updating…" : "Update password"}</button></form><button className="text-link" onClick={signOut}>Sign out of {user.email}</button></div>;
}
function NotificationButton() {
  const { notify } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, reload } = useLoad("/notifications", []);
  const notifications = data?.notifications || [];
  const markRead = async (notification) => {
    if (notification.readAt) return;
    try { await api.patch(`/notifications/${notification._id}/read`); reload(); }
    catch (error) { notify(messageFromError(error)); }
  };
  return <div className="notification-menu"><button className="icon-button" aria-label="Notifications" onClick={() => setOpen(!open)}><Bell size={18} />{data?.unread > 0 && <i />}</button>{open && <div className="notification-popover"><div className="notification-title"><b>Notifications</b><button onClick={() => setOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>{notifications.length ? notifications.map((notification) => <button className={`notification-item ${notification.readAt ? "" : "notification-unread"}`} key={notification._id} onClick={() => markRead(notification)}><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()}</small></button>) : <p className="notification-empty">You’re all caught up.</p>}</div>}</div>;
}
function AnnouncementList({ announcements }) {
  if (!announcements?.length) return <EmptyState title="A little quiet here" description="New company updates will show up here." />;
  return <div className="announcement-list">{announcements.map((entry) => <article className="announcement-item" key={entry._id}><span className="announcement-mark"><Bell size={16} /></span><div><b>{entry.title}</b><p>{entry.body}</p><small>{new Date(entry.createdAt).toLocaleDateString()}</small></div></article>)}</div>;
}

function AccountPage() {
  const { user, notify, completePasswordChange } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      completePasswordChange(data);
      setCurrentPassword("");
      setNewPassword("");
      notify("Password changed successfully. Your other sessions were signed out.");
    } catch (error) { notify(messageFromError(error)); }
    finally { setBusy(false); }
  };
  return <><PageHeading eyebrow="ACCOUNT SECURITY" title="Your account, your control." description="Manage your sign-in and keep your account secure." /><div className="account-grid"><Panel title="Account details" subtitle="Your role is managed by your organization"><div className="account-person"><span className="profile-large-avatar">{user.name.slice(0, 1)}</span><div><b>{user.name}</b><small>{user.email}</small></div></div><div className="profile-facts"><div><span>Access role</span><b>{roleLabels[user.role]}</b></div><div><span>Employee code</span><b>{user.employeeCode || "—"}</b></div></div></Panel><Panel title="Change password" subtitle="Other access tokens are revoked when you update your password"><form className="form-stack" onSubmit={submit}><Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} required /><Field label="New password" type="password" minLength={10} placeholder="At least 10 characters" value={newPassword} onChange={setNewPassword} required /><button disabled={busy} className="button button-primary">{busy ? "Changing…" : "Change password"}</button></form></Panel></div></>;
}

function PeoplePage() {
  const { user, notify } = useAuth();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const query = `/employees?q=${encodeURIComponent(search)}&department=${encodeURIComponent(department)}&page=${page}&limit=20`;
  const { data, loading, error, reload } = useLoad(query, [search, department, page]);
  const catalog = useLoad("/organization/catalog", []);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", department: "", designation: "", joiningDate: "", basicSalary: "" });
  const [credential, setCredential] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const submit = async (event) => { event.preventDefault(); try { const { data: result } = await api.post("/employees", { ...form, joiningDate: form.joiningDate || undefined, basicSalary: Number(form.basicSalary) || 0 }); setCredential(result); setForm({ name: "", email: "", phone: "", address: "", department: "", designation: "", joiningDate: "", basicSalary: "" }); reload(); notify("Employee added to your directory."); } catch (error) { notify(messageFromError(error)); } };
  const exportCsv = async () => {
    try {
    const pages = await Promise.all(Array.from({ length: data?.pagination?.pages || 1 }, (_, index) =>
      api.get(`/employees?q=${encodeURIComponent(search)}&department=${encodeURIComponent(department)}&page=${index + 1}&limit=100`)
    ));
    const rows = pages.flatMap((response) => response.data.employees);
    const csv = ["name,email,phone,address,department,designation,joiningDate,basicSalary", ...rows.map((row) => [row.name, row.email, row.phone, row.address, row.department, row.designation, row.joiningDate, row.salary?.basic].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "employees.csv"; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { notify(messageFromError(error)); }
  };
  const parseCsv = (text) => {
    const rows = [];
    let row = [], value = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(value); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = "";
      } else value += char;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    const headers = (rows.shift() || []).map((header) => header.trim().replace(/^\uFEFF/, "").toLowerCase());
    return rows.filter((cells) => cells.some((cell) => cell.trim())).map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]))
    );
  };
  const previewCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const { data: result } = await api.post("/employees/import", { dryRun: true, rows });
      setImportPreview(rows);
      setImportResult(result);
    } catch (error) { notify(messageFromError(error)); }
  };
  const commitCsv = async () => {
    try {
      const { data: result } = await api.post("/employees/import", { dryRun: false, rows: importPreview });
      setImportResult(result);
      setImportPreview(null);
      reload();
      notify(`${result.imported} employees imported.`);
    } catch (error) { notify(messageFromError(error)); }
  };
  return <><PageHeading eyebrow="PEOPLE" title="Your people, together." description="Manage your employee directory and keep the details that matter close." action={user.role === "hr" && <button className="button button-primary" onClick={() => { setCredential(null); setModal(true); }}><Plus size={17} />Add employee</button>} />
    <Panel title="Employee directory" subtitle={`${data?.pagination?.total ?? "—"} people in your workspace`} action={<div className="row-actions">{user.role === "hr" && <label className="button button-outline button-small">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={previewCsv} /></label>}<button onClick={exportCsv} className="button button-outline button-small"><ArrowDownToLine size={15} />Export CSV</button></div>}><div className="directory-filters"><div className="search-wrap"><Search size={16} /><input placeholder="Search by name, email, or employee code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><label className="field"><span>Department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}><option value="">All departments</option>{catalog.data?.departments?.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}</select></label></div>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <DataTable columns={[{ label: "Employee", render: (row) => <div className="table-person"><span className="mini-avatar">{row.name?.slice(0, 1)}</span><span><b>{row.name}</b><small>{row.email}</small></span></div> }, { label: "Employee code", key: "employeeCode" }, { label: "Department", key: "department" }, { label: "Designation", key: "designation" }, { label: "Status", render: () => <StatusPill status="Active" /> }, { label: "Profile", render: (row) => <button className="text-link" onClick={() => setSelectedEmployee(row)}>View 360 <ArrowRight size={13} /></button> }]} rows={data?.employees} emptyTitle="Your directory is ready for its first member" emptyText="Add your first employee to create a real, searchable people directory." />}
      {data?.pagination?.pages > 1 && <div className="pagination"><span>Page {page} of {data.pagination.pages} · {data.pagination.total} people</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      {importResult && <div className="import-report"><b>{importResult.dryRun ? "CSV validation report" : `${importResult.imported} employees imported`}</b><span>{importResult.dryRun ? `${importResult.valid} valid · ${importResult.invalid} need attention` : "Temporary passwords are shown only once below."}</span>{importResult.rows?.some((row) => !row.valid) && <ul>{importResult.rows.filter((row) => !row.valid).map((row) => <li key={row.row}>Row {row.row} ({row.email || "missing email"}): {row.errors.join(" ")}</li>)}</ul>}{importResult.credentials?.map((entry) => <div key={entry.email}>{entry.email} · temporary password: <code>{entry.temporaryPassword}</code></div>)}{importResult.dryRun && importResult.valid > 0 && <button className="button button-primary button-small" onClick={commitCsv}>Import {importResult.valid} valid employees</button>}</div>}
    </Panel>
    {modal && <Modal title="Add an employee" onClose={() => setModal(false)}>{credential ? <div className="credential-box"><div className="credential-success"><Check size={18} />Employee account created</div><p>Share this one-time login password securely. The employee will be asked to change it after signing in.</p><div><span>Email</span><b>{credential.employee.email}</b></div><div><span>Temporary password</span><code>{credential.temporaryPassword}</code></div><button className="button button-primary button-full" onClick={() => setModal(false)}>Done</button></div> : <form onSubmit={submit} className="form-stack"><Field label="Full name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Field label="Work email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required /><Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><Field label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} /><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} options={catalog.data?.departments?.map((item) => item.name) || []} /><Field label="Designation" value={form.designation} onChange={(value) => setForm({ ...form, designation: value })} options={catalog.data?.designations?.map((item) => item.name) || []} /><Field label="Joining date" type="date" value={form.joiningDate} onChange={(value) => setForm({ ...form, joiningDate: value })} /><Field label="Basic monthly salary (PKR)" type="number" value={form.basicSalary} onChange={(value) => setForm({ ...form, basicSalary: value })} /><button className="button button-primary button-full">Create employee account <ArrowRight size={16} /></button></form>}</Modal>}
    {selectedEmployee && <EmployeeProfileModal employee={selectedEmployee} editable={user.role === "hr"} notify={notify} onClose={() => setSelectedEmployee(null)} onSaved={() => { setSelectedEmployee(null); reload(); }} />}
  </>;
}

function EmployeeProfileModal({ employee, editable, notify, onClose, onSaved }) {
  const { data, loading, error } = useLoad(`/employees/${employee._id}`, [employee._id]);
  const attendance = useLoad(`/attendance?employeeId=${employee._id}&from=2000-01-01&to=2999-12-31`, [employee._id]);
  const leave = useLoad(`/leave?employeeId=${employee._id}`, [employee._id]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  useEffect(() => {
    const profile = data?.employee;
    if (profile) setForm({
      name: profile.name || "",
      phone: profile.phone || "",
      address: profile.address || "",
      department: profile.department || "",
      designation: profile.designation || "",
      joiningDate: profile.joiningDate ? new Date(profile.joiningDate).toISOString().slice(0, 10) : "",
      basicSalary: String(profile.salary?.basic || 0)
    });
  }, [data]);
  const save = async (event) => {
    event.preventDefault();
    try {
      await api.patch(`/employees/${employee._id}`, { ...form, joiningDate: form.joiningDate || undefined, basicSalary: Number(form.basicSalary) });
      notify("Employee profile updated.");
      onSaved();
    } catch (reason) { notify(messageFromError(reason)); }
  };
  const offboard = async () => {
    const reason = window.prompt("Enter a reason for offboarding this employee:");
    if (!reason?.trim()) return;
    try {
      await api.post(`/employees/${employee._id}/offboard`, { reason });
      notify("Employee account deactivated.");
      onSaved();
    } catch (error) { notify(messageFromError(error)); }
  };
  const profile = data?.employee;
  return <Modal title="Employee 360 profile" onClose={onClose}>
    {loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : profile && <>
      <div className="profile-summary"><span className="profile-large-avatar">{profile.name.slice(0, 1)}</span><div><h3>{profile.name}</h3><p>{profile.designation || "Employee"} · {profile.department || "Unassigned"}</p><small>{profile.employeeCode} · {profile.email}</small></div>{editable && <div className="row-actions"><button className="button button-outline button-small" onClick={() => setEditing(!editing)}>{editing ? "Cancel edit" : "Edit profile"}</button><button className="button button-danger button-small" onClick={offboard}>Offboard</button></div>}</div>
      {editing && form ? <form className="profile-edit form-stack" onSubmit={save}><Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required /><Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} /><Field label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} /><Field label="Department" value={form.department} onChange={(department) => setForm({ ...form, department })} /><Field label="Designation" value={form.designation} onChange={(designation) => setForm({ ...form, designation })} /><Field label="Joining date" type="date" value={form.joiningDate} onChange={(joiningDate) => setForm({ ...form, joiningDate })} /><Field label="Basic monthly salary (PKR)" type="number" value={form.basicSalary} onChange={(basicSalary) => setForm({ ...form, basicSalary })} /><button className="button button-primary">Save profile</button></form> : <>
        <div className="profile-facts"><div><span>Phone</span><b>{profile.phone || "Not provided"}</b></div><div><span>Address</span><b>{profile.address || "Not provided"}</b></div><div><span>Joining date</span><b>{profile.joiningDate ? new Date(profile.joiningDate).toLocaleDateString() : "Not provided"}</b></div><div><span>Basic salary</span><b>PKR {Number(profile.salary?.basic || 0).toLocaleString()}</b></div><div><span>HRA · 40%</span><b>PKR {Number(profile.salary?.hra || 0).toLocaleString()}</b></div><div><span>Medical · 10%</span><b>PKR {Number(profile.salary?.medical || 0).toLocaleString()}</b></div></div>
        <Panel title="Leave history" subtitle="Requests associated with this employee"><DataTable columns={[{ label: "Type", key: "type" }, { label: "Dates", render: (row) => `${new Date(row.startDate).toLocaleDateString()} – ${new Date(row.endDate).toLocaleDateString()}` }, { label: "Days", key: "days" }, { label: "Status", render: (row) => <StatusPill status={row.status} /> }]} rows={leave.data?.leaves?.slice(0, 5)} /></Panel>
        <Panel title="Recent attendance" subtitle="Recorded check-ins and check-outs">{attendance.loading ? <LoadingState /> : attendance.error ? <ErrorPanel message={attendance.error} /> : <DataTable columns={[{ label: "Date", key: "dateKey" }, { label: "Status", render: (row) => <StatusPill status={row.status} /> }, { label: "Check in", render: (row) => row.checkIn ? new Date(row.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" }, { label: "Check out", render: (row) => row.checkOut ? new Date(row.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" }]} rows={attendance.data?.attendance?.slice(0, 5)} />}</Panel>
      </>}
    </>}
  </Modal>;
}

function AttendancePage() {
  const { user, notify } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState("");
  const catalog = useLoad("/organization/catalog", [user.role]);
  const path = user.role === "employee" ? `/attendance?from=${date}&to=${date}` : `/attendance/board?date=${date}&department=${encodeURIComponent(department)}`;
  const { data, loading, error, reload } = useLoad(path, [path]);
  const [correction, setCorrection] = useState({ dateKey: date, requestedCheckIn: "", requestedCheckOut: "", reason: "" });
  const records = user.role === "employee" ? data?.attendance : data?.rows;
  const sendCorrection = async (event) => { event.preventDefault(); try { await api.post("/attendance/corrections", { ...correction, requestedCheckIn: correction.requestedCheckIn || undefined, requestedCheckOut: correction.requestedCheckOut || undefined }); notify("Correction request sent to HR."); reload(); } catch (error) { notify(messageFromError(error)); } };
  return <><PageHeading eyebrow="ATTENDANCE" title={user.role === "employee" ? "Your time, accounted for." : "The daily attendance board."} description="A clear view of check-ins, leave, and the days in between." action={<div className="attendance-filters"><label className="date-filter">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{user.role !== "employee" && <label className="date-filter">Department<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{catalog.data?.departments?.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}</select></label>}</div>} />
    {user.role === "employee" && <AttendanceCalendar selectedDate={date} onSelectDate={setDate} />}
    {user.role !== "employee" && <div className="stat-grid stat-grid-five">{Object.entries(data?.summary || {}).map(([key, value]) => <StatCard key={key} label={key.replace(/([A-Z])/g, " $1")} value={value} detail="Selected day" icon={key === "absent" ? CircleHelp : Check} />)}</div>}
    <Panel title={user.role === "employee" ? "Your attendance" : "Team attendance"} subtitle={date}>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <DataTable columns={user.role === "employee" ? [{ label: "Date", key: "dateKey" }, { label: "Check in", render: (row) => row.checkIn ? new Date(row.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" }, { label: "Check out", render: (row) => row.checkOut ? new Date(row.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" }, { label: "Status", render: (row) => <StatusPill status={row.status} /> }, { label: "Correction", render: (row) => row.correction?.status ? <StatusPill status={row.correction.status} /> : "—" }] : [{ label: "Employee", render: (row) => row.employee?.name }, { label: "Department", render: (row) => row.employee?.department }, { label: "Check in", render: (row) => row.attendance?.checkIn ? new Date(row.attendance.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" }, { label: "Status", render: (row) => <StatusPill status={row.status} /> }]} rows={records} emptyTitle="No attendance for this date" emptyText="Attendance entries appear here as your team checks in." />}</Panel>
    {user.role === "employee" && <Panel title="Request a correction" subtitle="Ask HR to review a missed or incorrect check-in"><form className="correction-form" onSubmit={sendCorrection}><Field label="Date" type="date" value={correction.dateKey} onChange={(value) => setCorrection({ ...correction, dateKey: value })} required /><Field label="Correct check-in (optional)" type="datetime-local" value={correction.requestedCheckIn} onChange={(value) => setCorrection({ ...correction, requestedCheckIn: value })} /><Field label="Correct check-out (optional)" type="datetime-local" value={correction.requestedCheckOut} onChange={(value) => setCorrection({ ...correction, requestedCheckOut: value })} /><Field label="Reason" value={correction.reason} onChange={(value) => setCorrection({ ...correction, reason: value })} placeholder="What needs to be corrected?" required /><button className="button button-primary">Send request</button></form></Panel>}
    {user.role !== "employee" && <Panel title="Pending correction requests" subtitle="Review employee attendance corrections">{loading ? <LoadingState /> : <CorrectionQueue notify={notify} reload={reload} />}</Panel>}
  </>;
}

function AttendanceCalendar({ selectedDate, onSelectDate }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const first = new Date(`${month}-01T00:00:00.000Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const attendance = useLoad(`/attendance?from=${from}&to=${to}&page=1&limit=100`, [from, to]);
  const leaves = useLoad(`/leave?from=${from}&to=${to}&status=approved`, [from, to]);
  const statuses = new Map((attendance.data?.attendance || []).map((record) => [record.dateKey, record]));
  const approvedLeaves = (leaves.data?.leaves || []).filter((leave) => leave.status === "approved");
  const offset = new Date(`${from}T00:00:00.000Z`).getUTCDay();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const moveMonth = (amount) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1));
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const stateFor = (day) => {
    if (!day) return "";
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const record = statuses.get(key);
    if (record) {
      if (record.status === "half-day") return "half-day";
      if (record.lateArrival || record.status === "late") return "late";
      if (!record.checkOut && key < (attendance.data?.today || selectedDate)) return "missing";
      return "present";
    }
    if (approvedLeaves.some((leave) => leave.startDate.slice(0, 10) <= key && leave.endDate.slice(0, 10) >= key)) return "leave";
    return "";
  };
  return <Panel title="Attendance calendar" subtitle="Your check-ins, approved leave, and missing days"><div className="calendar-toolbar"><button className="button button-outline button-small" onClick={() => moveMonth(-1)}>Previous</button><b>{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><button className="button button-outline button-small" onClick={() => moveMonth(1)}>Next</button></div>{attendance.loading || leaves.loading ? <LoadingState /> : attendance.error ? <ErrorPanel message={attendance.error} /> : leaves.error ? <ErrorPanel message={leaves.error} /> : <div className="calendar-grid"><div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((day, index) => { const state = stateFor(day); const key = day ? `${month}-${String(day).padStart(2, "0")}` : `blank-${index}`; return <button key={key} disabled={!day} onClick={() => day && onSelectDate(key)} className={`calendar-day ${state ? `calendar-${state}` : ""} ${selectedDate === key ? "calendar-selected" : ""}`} title={state || undefined}>{day || ""}</button>; })}</div><div className="calendar-legend"><span><i className="calendar-present" />Present</span><span><i className="calendar-late" />Late</span><span><i className="calendar-leave" />Leave</span><span><i className="calendar-missing" />Missing checkout</span></div></div>}</Panel>;
}

function CorrectionQueue({ notify, reload }) {
  const { data } = useLoad("/attendance/corrections", []);
  const pending = data?.attendance?.filter((record) => record.correction?.status === "pending") || [];
  const review = async (record, status) => { const comment = window.prompt(`${status === "approved" ? "Approval" : "Decline"} comment (optional):`) || ""; try { await api.patch(`/attendance/${record._id}/correction`, { status, comment }); notify(`Correction ${status}.`); reload(); } catch (error) { notify(messageFromError(error)); } };
  return <DataTable columns={[{ label: "Employee", render: (row) => row.employee?.name }, { label: "Date", key: "dateKey" }, { label: "Reason", render: (row) => row.correction?.reason }, { label: "Review", render: (row) => <span className="row-actions"><button onClick={() => review(row, "approved")} className="action-approve">Approve</button><button onClick={() => review(row, "rejected")} className="action-reject">Decline</button></span> }]} rows={pending} emptyTitle="No pending corrections" emptyText="New correction requests will be listed here." />;
}

function LeavePage() {
  const { user, notify } = useAuth();
  const [draft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("hcm.leaveDraft") || "null");
      sessionStorage.removeItem("hcm.leaveDraft");
      return saved;
    } catch {
      sessionStorage.removeItem("hcm.leaveDraft");
      return null;
    }
  });
  const [type, setType] = useState(draft?.type || "Annual");
  const [form, setForm] = useState({ startDate: draft?.startDate || "", endDate: draft?.endDate || "", reason: draft?.reason || "" });
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad("/leave", []);
  const balances = useLoad("/leave/balance", [user.role]);
  const requests = data?.leaves || [];
  const create = async (event) => { event.preventDefault(); setBusy(true); try { await api.post("/leave", { ...form, type }); notify("Leave request submitted."); setForm({ startDate: "", endDate: "", reason: "" }); reload(); } catch (error) { notify(messageFromError(error)); } finally { setBusy(false); } };
  const review = async (leave, status) => { const comment = window.prompt(`${status === "approved" ? "Approval" : "Decline"} comment (optional):`) || ""; try { await api.patch(`/leave/${leave._id}/review`, { status, comment }); notify(`Leave ${status}.`); reload(); } catch (error) { notify(messageFromError(error)); } };
  const cancel = async (leave) => { try { await api.post(`/leave/${leave._id}/cancel`); notify("Leave request cancelled."); reload(); } catch (error) { notify(messageFromError(error)); } };
  return <><PageHeading eyebrow="TIME OFF" title={user.role === "employee" ? "Make room for life." : "Leave, thoughtfully managed."} description="Requests, balances, and approvals in one shared place." action={user.role === "employee" && <Link to="/app/assistant" className="button button-outline"><Bot size={16} />Plan with AI</Link>} />
    {user.role === "employee" && <div className="balance-row">{balances.data?.balances?.map((item) => <div className="balance-card" key={item.type}><span>{item.type}</span><b>{item.remaining ?? "∞"}</b><small>{item.remaining == null ? "unlimited" : `${item.used} days used`}</small></div>)}</div>}
    {user.role === "employee" && <Panel title="Request time off" subtitle="Choose your dates and a leave type"><form className="leave-form" onSubmit={create}><Field label="Leave type" value={type} onChange={setType} options={balances.data?.balances?.map((item) => item.type) || ["Annual", "Sick", "Casual", "Unpaid"]} /><Field label="From" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} required /><Field label="To" type="date" value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} required /><Field label="Reason" rows={2} placeholder="A little context helps your approver" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required /><button disabled={busy} className="button button-primary">{busy ? "Sending…" : "Submit request"}<ArrowRight size={16} /></button></form></Panel>}
    <Panel title={user.role === "employee" ? "Your requests" : "Leave requests"} subtitle={user.role === "employee" ? "Track your upcoming and past time off" : "Review, approve, or decline employee requests"}>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <DataTable columns={[...(user.role !== "employee" ? [{ label: "Employee", render: (row) => row.employee?.name }] : []), { label: "Type", key: "type" }, { label: "Dates", render: (row) => `${new Date(row.startDate).toLocaleDateString()} – ${new Date(row.endDate).toLocaleDateString()}` }, { label: "Days", key: "days" }, { label: "Reason", key: "reason" }, { label: "Status", render: (row) => <StatusPill status={row.status} /> }, { label: "Action", render: (row) => user.role === "hr" && row.status === "pending" ? <span className="row-actions"><button className="action-approve" onClick={() => review(row, "approved")}>Approve</button><button className="action-reject" onClick={() => review(row, "rejected")}>Decline</button></span> : user.role === "employee" && ["pending", "approved"].includes(row.status) ? <button className="action-reject" onClick={() => cancel(row)}>Cancel</button> : row.comment || "—" }]} rows={requests} emptyTitle="No leave requests yet" emptyText="Leave requests will appear here when submitted." />}</Panel>
  </>;
}

function PayrollPage() {
  const { user, notify } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, loading, error, reload } = useLoad("/payroll", []);
  const generate = async () => { try { await api.post("/payroll/generate", { month }); notify("Payroll draft generated."); reload(); } catch (error) { notify(messageFromError(error)); } };
  const finalize = async (payroll) => { if (!window.confirm(`Finalize payroll for ${payroll.month}? This cannot be edited.`)) return; try { await api.post(`/payroll/${payroll._id}/finalize`); notify("Payroll finalized and locked."); reload(); } catch (error) { notify(messageFromError(error)); } };
  const download = async (monthValue) => {
    try { const response = await api.get(`/payroll/${monthValue}/payslip`, { responseType: "blob" }); const url = URL.createObjectURL(response.data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `payslip-${monthValue}.pdf`; anchor.click(); URL.revokeObjectURL(url); }
    catch (error) { notify(messageFromError(error)); }
  };
  return <><PageHeading eyebrow="PAYROLL" title={user.role === "employee" ? "Your pay, clearly presented." : "Payroll with fewer surprises."} description="Review pay details and keep finalized records locked." action={user.role === "hr" && <div className="generate-action"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="button button-primary" onClick={generate}><Plus size={16} />Generate draft</button></div>} />
    <Panel title={user.role === "employee" ? "Your payslips" : "Payroll runs"} subtitle={user.role === "employee" ? "Only finalized payslips are available to download." : "Drafts can be regenerated; finalized runs are permanently locked."}>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <DataTable columns={[{ label: "Pay period", key: "month" }, ...(user.role !== "employee" ? [{ label: "People", render: (row) => row.items?.length }, { label: "Net payroll", render: (row) => `PKR ${Math.round(row.total || 0).toLocaleString()}` }] : [{ label: "Net pay", render: (row) => `PKR ${Math.round(row.items?.find((item) => String(item.employee) === String(user.id))?.net || 0).toLocaleString()}` }]), { label: "Status", render: (row) => <StatusPill status={row.status} /> }, { label: "Action", render: (row) => user.role === "admin" && row.status === "draft" ? <button className="action-approve" onClick={() => finalize(row)}>Finalize & lock</button> : user.role === "employee" ? <button className="text-link" onClick={() => download(row.month)}><ArrowDownToLine size={14} /> PDF</button> : "—" }]} rows={data?.payrolls} emptyTitle="No payroll runs yet" emptyText={user.role === "hr" ? "Generate a monthly draft once employee salary structures are in place." : "Finalized payslips will be available here."} />}</Panel>
    {user.role === "admin" && <div className="notice-box"><ShieldCheck size={18} /><span><b>Finalization is permanent.</b> Please review every payroll draft before locking it. Admins cannot edit a finalized run.</span></div>}
  </>;
}

function AnnouncementsPage() {
  const { user, notify } = useAuth();
  const [form, setForm] = useState({ title: "", body: "" });
  const { data, loading, error, reload } = useLoad("/announcements", []);
  const create = async (event) => { event.preventDefault(); try { await api.post("/announcements", form); setForm({ title: "", body: "" }); notify("Announcement published."); reload(); } catch (error) { notify(messageFromError(error)); } };
  return <><PageHeading eyebrow="COMMUNICATION" title="A note to your people." description="Share important updates with everyone in your organization." />
    {user.role === "hr" && <Panel title="Publish an announcement" subtitle="Everyone in the workspace can read company updates"><form className="form-stack announcement-form" onSubmit={create}><Field label="Headline" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required /><Field label="Message" rows={3} value={form.body} onChange={(value) => setForm({ ...form, body: value })} required /><button className="button button-primary">Publish update <ArrowRight size={16} /></button></form></Panel>}
    <Panel title="Workspace updates" subtitle={`${data?.announcements?.length || 0} latest updates`}>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <AnnouncementList announcements={data?.announcements} />}</Panel>
  </>;
}

function AssistantPage() {
  const { user } = useAuth();
  const { notify } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([{ from: "assistant", text: user.role === "employee" ? "Hi! I can help with your own leave balance, time-off policies, and navigating your workspace." : "Hi! Ask me about headcount, attendance, leave, payroll, or people operations. I’ll use your workspace records to answer." }]);
  const [busy, setBusy] = useState(false);
  const ask = async (text = question) => {
    if (!text.trim() || busy) return;
    setMessages((items) => [...items, { from: "user", text }]); setQuestion(""); setBusy(true);
    try {
      const { data } = await api.post("/ai", { question: text });
      let leaveDraft;
      try {
        const structured = JSON.parse(data.answer.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        if (structured.type && structured.startDate && structured.endDate && structured.reason) leaveDraft = structured;
      } catch { /* A normal prose answer is not a structured leave request. */ }
      setMessages((items) => [...items, { from: "assistant", text: data.answer, label: data.label, leaveDraft }]);
    }
    catch (error) { const message = messageFromError(error); notify(message); setMessages((items) => [...items, { from: "assistant", text: message, label: "AI-generated" }]); }
    finally { setBusy(false); }
  };
  const suggestions = user.role === "employee" ? ["How many annual leave days do I have?", "What is the leave policy?", "Help me plan time off next month"] : ["Who is on leave?", "Summarize attendance this month", "How many people are in each department?"];
  return <><PageHeading eyebrow="YOUR AI ASSISTANT" title="People questions, answered." description="Grounded in your workspace. Sensitive employee data stays protected." /><div className="assistant-layout"><div className="assistant-window"><div className="assistant-header"><span className="assistant-avatar"><Bot size={19} /></span><div><b>Saylani People Assistant</b><small><i />Connected to your workspace</small></div><span className="ai-badge">AI-GENERATED</span></div><div className="chat-messages">{messages.map((message, index) => <div className={`chat-message message-${message.from}`} key={`${message.from}-${index}`}><span className="chat-avatar">{message.from === "assistant" ? <Bot size={16} /> : user.name.slice(0, 1)}</span><div><p>{message.text}</p>{message.label && <small>{message.label}</small>}{message.leaveDraft && <button className="button button-primary button-small" onClick={() => { sessionStorage.setItem("hcm.leaveDraft", JSON.stringify(message.leaveDraft)); navigate("/app/leave"); }}>Use this leave request <ArrowRight size={14} /></button>}</div></div>)}{busy && <div className="chat-thinking"><span className="spinner" />Looking through your workspace…</div>}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your people workspace…" /><button disabled={busy || !question.trim()} aria-label="Send message"><ArrowRight size={17} /></button></form><div className="ai-disclaimer">AI-generated · Answers are based on the records and permissions available to your account.</div></div><aside className="suggestion-panel"><h3>Try asking</h3>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)}>{suggestion}<ArrowRight size={14} /></button>)}<div className="privacy-note"><ShieldCheck size={17} /><span><b>Privacy comes first</b><small>Employees can only ask about their own personal records. Salary and compensation data is never exposed to employee AI chats.</small></span></div></aside></div></>;
}

function SettingsPage() {
  const { user, notify } = useAuth();
  const { data, loading, error, reload } = useLoad("/organization", []);
  const [hr, setHr] = useState({ name: "", email: "", password: "" });
  const [department, setDepartment] = useState("");
  const company = data?.company;
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (company) setSettings({
      name: company.name || "",
      officeStart: company.officeStart || "09:00",
      timezone: company.timezone || "Asia/Karachi",
      graceMinutes: String(company.graceMinutes ?? 15),
      attendanceRadiusMeters: String(company.attendanceRadiusMeters || 500),
      officeLocation: company.officeLocation || "",
      officeLatitude: company.officeLatitude === undefined ? "" : String(company.officeLatitude),
      officeLongitude: company.officeLongitude === undefined ? "" : String(company.officeLongitude),
      geofenceEnabled: Boolean(company.geofenceEnabled),
      cameraCheckEnabled: Boolean(company.cameraCheckEnabled),
      latePenaltyPercent: String(company.latePenaltyPercent || 0)
    });
  }, [company]);
  const update = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch("/organization", {
        ...settings,
        graceMinutes: Number(settings.graceMinutes),
        attendanceRadiusMeters: Number(settings.attendanceRadiusMeters),
        officeLatitude: settings.officeLatitude === "" ? undefined : Number(settings.officeLatitude),
        officeLongitude: settings.officeLongitude === "" ? undefined : Number(settings.officeLongitude),
        latePenaltyPercent: Number(settings.latePenaltyPercent)
      });
      notify("Organization settings saved.");
      reload();
    } catch (error) { notify(messageFromError(error)); }
    finally { setSavingSettings(false); }
  };
  const addDepartment = async (event) => { event.preventDefault(); try { await api.post("/organization/departments", { name: department }); setDepartment(""); notify("Department added."); reload(); } catch (error) { notify(messageFromError(error)); } };
  const createHr = async (event) => { event.preventDefault(); try { await api.post("/organization/hr", hr); setHr({ name: "", email: "", password: "" }); notify("HR account created."); } catch (error) { notify(messageFromError(error)); } };
  return <><PageHeading eyebrow="ORGANIZATION" title="The way your workplace works." description="Manage your organization’s foundational people settings." />{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <div className="settings-grid"><Panel title="Workday rules" subtitle="Default attendance policy"><form onSubmit={update}><div className="settings-fields"><Field label="Organization name" value={settings?.name || ""} onChange={(name) => setSettings({ ...settings, name })} /><Field label="Office starts at" type="time" value={settings?.officeStart || "09:00"} onChange={(officeStart) => setSettings({ ...settings, officeStart })} /><Field label="Office timezone" value={settings?.timezone || "Asia/Karachi"} onChange={(timezone) => setSettings({ ...settings, timezone })} /><Field label="Grace period (minutes)" type="number" value={settings?.graceMinutes || "15"} onChange={(value) => setSettings({ ...settings, graceMinutes: value })} /><Field label="Attendance radius (meters)" type="number" value={settings?.attendanceRadiusMeters || "500"} onChange={(value) => setSettings({ ...settings, attendanceRadiusMeters: value })} /><Field label="Office location" value={settings?.officeLocation || ""} onChange={(officeLocation) => setSettings({ ...settings, officeLocation })} /><Field label="Office latitude" type="number" step="any" value={settings?.officeLatitude ?? ""} onChange={(officeLatitude) => setSettings({ ...settings, officeLatitude })} /><Field label="Office longitude" type="number" step="any" value={settings?.officeLongitude ?? ""} onChange={(officeLongitude) => setSettings({ ...settings, officeLongitude })} /><Field label="Late penalty (% of daily pay per late arrival)" type="number" value={settings?.latePenaltyPercent ?? "0"} onChange={(latePenaltyPercent) => setSettings({ ...settings, latePenaltyPercent })} /><label className="check-field"><input type="checkbox" checked={settings?.geofenceEnabled || false} onChange={(event) => setSettings({ ...settings, geofenceEnabled: event.target.checked })} />Require office-radius location at check-in</label><label className="check-field"><input type="checkbox" checked={settings?.cameraCheckEnabled || false} onChange={(event) => setSettings({ ...settings, cameraCheckEnabled: event.target.checked })} />Require on-device face-presence check</label></div><p className="setting-note">Late arrival is calculated after office start + grace period. Attendance timestamps use server time. Geofence and camera checks are optional; camera presence is not identity verification. Late penalties are disabled at 0%.</p><button disabled={savingSettings} className="button button-primary">{savingSettings ? "Saving…" : "Save workday rules"}</button></form><WeekendSettings company={company} notify={notify} reload={reload} /></Panel>  <Panel title="Departments" subtitle="Use consistent department names for employee records"><CatalogItems type="departments" items={company?.departments} notify={notify} reload={reload} /><form className="inline-form" onSubmit={addDepartment}><Field label="New department" value={department} onChange={setDepartment} placeholder="e.g. Operations" required /><button className="button button-primary"><Plus size={15} />Add</button></form></Panel>  <Panel title="Leave types" subtitle="Annual allowances configured for your organization"><CatalogItems type="leave-types" items={company?.leaveTypes} notify={notify} reload={reload} /><div className="organization-list"><b>Designations</b><CatalogItems type="designations" items={company?.designations} notify={notify} reload={reload} /></div></Panel><OrganizationCatalog company={company} notify={notify} reload={reload} /><Panel title="Create an HR account" subtitle="HR accounts can manage employees and approve requests"><form className="form-stack" onSubmit={createHr}><Field label="Full name" value={hr.name} onChange={(name) => setHr({ ...hr, name })} required /><Field label="Work email" type="email" value={hr.email} onChange={(email) => setHr({ ...hr, email })} required /><Field label="Temporary password" type="password" minLength={10} value={hr.password} onChange={(password) => setHr({ ...hr, password })} required /><button className="button button-primary">Create HR account <ArrowRight size={15} /></button></form></Panel><PasswordResetPanel notify={notify} /></div>}</>;
}

function WeekendSettings({ company, notify, reload }) {
  const days = [{ name: "Sunday", value: 0 }, { name: "Monday", value: 1 }, { name: "Tuesday", value: 2 }, { name: "Wednesday", value: 3 }, { name: "Thursday", value: 4 }, { name: "Friday", value: 5 }, { name: "Saturday", value: 6 }];
  const [selected, setSelected] = useState(company?.weekends || [0, 6]);
  const save = async () => {
    try { await api.patch("/organization", { weekends: selected }); notify("Weekend settings saved."); reload(); }
    catch (error) { notify(messageFromError(error)); }
  };
  return <div className="weekend-settings"><b>Weekend days</b><div>{days.map((day) => <label key={day.value}><input type="checkbox" checked={selected.includes(day.value)} onChange={() => setSelected((current) => current.includes(day.value) ? current.filter((value) => value !== day.value) : [...current, day.value])} />{day.name.slice(0, 3)}</label>)}</div><button className="button button-outline button-small" onClick={save}>Save weekends</button></div>;
}

function OrganizationCatalog({ company, notify, reload }) {
  const [designation, setDesignation] = useState("");
  const [leaveType, setLeaveType] = useState({ name: "", yearlyQuota: "0", unlimited: false });
  const [holiday, setHoliday] = useState({ name: "", date: "" });
  const add = async (path, body, done) => {
    try { await api.post(`/organization/${path}`, body); done(); notify("Organization item added."); reload(); }
    catch (error) { notify(messageFromError(error)); }
  };
  return <>
    <Panel title="Designations" subtitle="Titles available on employee profiles"><form className="inline-form" onSubmit={(event) => { event.preventDefault(); add("designations", { name: designation }, () => setDesignation("")); }}><Field label="New designation" value={designation} onChange={setDesignation} placeholder="e.g. Team lead" required /><button className="button button-primary"><Plus size={15} />Add</button></form></Panel>
    <Panel title="Add a leave type" subtitle="Set a yearly allowance or choose unlimited"><form className="form-stack" onSubmit={(event) => { event.preventDefault(); add("leave-types", { ...leaveType, yearlyQuota: Number(leaveType.yearlyQuota) }, () => setLeaveType({ name: "", yearlyQuota: "0", unlimited: false })); }}><Field label="Leave type name" value={leaveType.name} onChange={(name) => setLeaveType({ ...leaveType, name })} required /><Field label="Yearly quota (days)" type="number" value={leaveType.yearlyQuota} onChange={(yearlyQuota) => setLeaveType({ ...leaveType, yearlyQuota })} /><label className="check-field"><input type="checkbox" checked={leaveType.unlimited} onChange={(event) => setLeaveType({ ...leaveType, unlimited: event.target.checked })} />Unlimited</label><button className="button button-primary"><Plus size={15} />Add leave type</button></form></Panel>
    <Panel title="Holiday calendar" subtitle={`${company?.holidays?.length || 0} configured dates`}><CatalogItems type="holidays" items={company?.holidays} notify={notify} reload={reload} /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); add("holidays", holiday, () => setHoliday({ name: "", date: "" })); }}><Field label="Holiday name" value={holiday.name} onChange={(name) => setHoliday({ ...holiday, name })} required /><Field label="Date" type="date" value={holiday.date} onChange={(date) => setHoliday({ ...holiday, date })} required /><button className="button button-primary"><Plus size={15} />Add</button></form></Panel>
  </>;
}

function CatalogItems({ type, items = [], notify, reload }) {
  const update = async (item) => {
    const name = window.prompt("Name", item.name || "");
    if (!name?.trim()) return;
    let patch = { name: name.trim() };
    if (type === "leave-types") {
      const quota = window.prompt("Yearly quota (enter 0 for unlimited)", String(item.yearlyQuota || 0));
      if (quota === null || !Number.isFinite(Number(quota)) || Number(quota) < 0) return;
      const unlimitedAnswer = window.prompt("Unlimited leave type? Enter yes or no.", item.unlimited ? "yes" : "no");
      if (unlimitedAnswer === null || !["yes", "no"].includes(unlimitedAnswer.trim().toLowerCase())) return;
      const unlimited = unlimitedAnswer.trim().toLowerCase() === "yes";
      patch = { ...patch, yearlyQuota: Number(quota), unlimited };
    }
    if (type === "holidays") {
      const current = new Date(item.date).toISOString().slice(0, 10);
      const date = window.prompt("Holiday date (YYYY-MM-DD)", current);
      if (!date) return;
      patch = { ...patch, date };
    }
    try {
      await api.patch(`/organization/${type}/${item._id}`, patch);
      notify("Organization item updated.");
      reload();
    } catch (error) { notify(messageFromError(error)); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await api.delete(`/organization/${type}/${item._id}`);
      notify("Organization item removed.");
      reload();
    } catch (error) { notify(messageFromError(error)); }
  };
  if (!items.length) return <EmptyState title="Nothing configured yet" description="Add an item to make it available in your organization." />;
  return <div className="catalog-items">{items.map((item) => <div className="catalog-item" key={item._id}><span><b>{item.name}</b><small>{type === "leave-types" ? (item.unlimited ? "Unlimited" : `${item.yearlyQuota} days / year`) : type === "holidays" ? new Date(item.date).toLocaleDateString() : ""}</small></span><div className="catalog-actions"><button aria-label={`Edit ${item.name}`} onClick={() => update(item)}><Pencil size={13} /></button><button aria-label={`Remove ${item.name}`} onClick={() => remove(item)}><Trash2 size={13} /></button></div></div>)}</div>;
}

function PasswordResetPanel({ notify }) {
  const { data, error } = useLoad("/directory", []);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const reset = async (event) => {
    event.preventDefault();
    try { await api.post(`/organization/users/${userId}/reset-password`, { password }); setPassword(""); notify("Temporary password reset."); }
    catch (reason) { notify(messageFromError(reason)); }
  };
  return <Panel title="Reset an account password" subtitle="The user will need to change this temporary password"><form className="form-stack" onSubmit={reset}>{error && <ErrorPanel message={error} />}<label className="field"><span>Employee or HR account</span><select value={userId} onChange={(event) => setUserId(event.target.value)} required><option value="">Select an account</option>{data?.users?.map((person) => <option key={person._id} value={person._id}>{person.name} · {person.role} · {person.email}</option>)}</select></label><Field label="New temporary password" type="password" minLength={10} value={password} onChange={setPassword} required /><button className="button button-outline">Set temporary password</button></form></Panel>;
}

function AuditPage() {
  const { data, loading, error } = useLoad("/audit", []);
  return <><PageHeading eyebrow="GOVERNANCE" title="An uneditable record." description="A chronological record of important workspace actions." /><Panel title="Audit activity" subtitle={`${data?.pagination?.total ?? "—"} events recorded`}>{loading ? <LoadingState /> : error ? <ErrorPanel message={error} /> : <DataTable columns={[{ label: "Action", render: (row) => <b>{row.action}</b> }, { label: "Actor", key: "actorName" }, { label: "Entity", render: (row) => `${row.entity || "—"} ${row.entityId || ""}` }, { label: "Timestamp", render: (row) => new Date(row.timestamp).toLocaleString() }]} rows={data?.logs} emptyTitle="No recorded activity yet" emptyText="As your team starts using HCM, important actions will be recorded here." />}</Panel></>;
}

function Modal({ title, onClose, children }) {
  useEffect(() => { const handler = (event) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>;
}

export default App;
