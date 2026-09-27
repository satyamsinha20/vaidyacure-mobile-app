"use client";
 
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Shield,
  CheckCircle2,
  Key,
  Lock,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  User,
  Mail,
  ShieldAlert,
  Edit3,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser, RoleUser } from "@/services/auth.service";
import { ROUTES } from "@/lib/constants";

export default function ManageRolesPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [rolesList, setRolesList] = useState<RoleUser[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  // Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"moderator" | "viewer">("moderator");
  const [password, setPassword] = useState("");
  const [isPasswordHidden, setIsPasswordHidden] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"moderator" | "viewer">("moderator");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [isEditPasswordHidden, setIsEditPasswordHidden] = useState(false);
  const [isEditCopied, setIsEditCopied] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editErrorMsg, setEditErrorMsg] = useState("");

  // Delete Confirmation State
  const [roleToDelete, setRoleToDelete] = useState<RoleUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const editModalRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  // Load Admin Profile and Roles (Only Super Admin permitted)
  useEffect(() => {
    const cachedUser = authService.getStoredUser();
    if (cachedUser) {
      if (cachedUser.role !== "superadmin") {
        router.push(ROUTES.DASHBOARD);
        return;
      }
      setAdminUser(cachedUser);
    }

    authService
      .getMe()
      .then((u) => {
        if (u.role !== "superadmin") {
          router.push(ROUTES.DASHBOARD);
          return;
        }
        setAdminUser(u);
      })
      .catch(() => {});

    fetchRoles();
  }, [router]);

  const fetchRoles = async () => {
    setIsLoadingRoles(true);
    try {
      const fetched = await authService.getRoles();
      if (fetched && fetched.length > 0) {
        setRolesList(fetched);
      }
    } catch {
      // Backend roles endpoint fallback
    } finally {
      setIsLoadingRoles(false);
    }
  };

  // Close modals when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isModalOpen && modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsModalOpen(false);
      }
      if (isEditModalOpen && editModalRef.current && !editModalRef.current.contains(e.target as Node)) {
        setIsEditModalOpen(false);
      }
      if (roleToDelete && deleteModalRef.current && !deleteModalRef.current.contains(e.target as Node)) {
        setRoleToDelete(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isModalOpen, isEditModalOpen, roleToDelete]);

  // Generate strong random password
  const generateStrongPassword = (isForEdit = false) => {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowercase = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%&*";
    const combined = uppercase + lowercase + numbers + symbols;

    let pwd = "";
    pwd += uppercase[Math.floor(Math.random() * uppercase.length)];
    pwd += lowercase[Math.floor(Math.random() * lowercase.length)];
    pwd += numbers[Math.floor(Math.random() * numbers.length)];
    pwd += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = 4; i < 12; i++) {
      pwd += combined[Math.floor(Math.random() * combined.length)];
    }

    const shuffled = pwd
      .split("")
      .sort(() => 0.5 - Math.random())
      .join("");

    if (isForEdit) {
      setEditPassword(shuffled);
      setIsEditPasswordHidden(false);
      setIsEditCopied(false);
      setEditErrorMsg("");
    } else {
      setPassword(shuffled);
      setIsPasswordHidden(false);
      setIsCopied(false);
      setErrorMsg("");
    }
  };

  // Copy password and IMMEDIATELY hide it as requested
  const handleCopyPassword = async (pwdText: string, isForEdit = false) => {
    if (!pwdText) return;
    try {
      await navigator.clipboard.writeText(pwdText);
      if (isForEdit) {
        setIsEditCopied(true);
        setIsEditPasswordHidden(true);
        setTimeout(() => setIsEditCopied(false), 3000);
      } else {
        setIsCopied(true);
        setIsPasswordHidden(true);
        setTimeout(() => setIsCopied(false), 3000);
      }
    } catch (err) {
      console.error("Failed to copy password:", err);
    }
  };

  // Reset form
  const resetForm = () => {
    setName("");
    setEmail("");
    setRole("moderator");
    setPassword("");
    setIsPasswordHidden(false);
    setIsCopied(false);
    setErrorMsg("");
  };

  // Open Edit Modal
  const handleOpenEditModal = (targetRole: RoleUser) => {
    if (targetRole.role === "superadmin") return;
    setEditingRole(targetRole);
    setEditName(targetRole.name);
    setEditEmail(targetRole.email);
    setEditRole((targetRole.role === "viewer" ? "viewer" : "moderator") as "moderator" | "viewer");
    setEditIsActive(targetRole.isActive !== false);
    setEditPassword("");
    setIsEditPasswordHidden(false);
    setIsEditCopied(false);
    setEditErrorMsg("");
    setIsEditModalOpen(true);
  };

  // Handle Create Role Submit
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Please enter the user's name.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMsg("Please click 'Generate Password' to create a password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const response = await authService.createRole({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        password,
      });

      if (response && response.roleUser) {
        setRolesList((prev) => [response.roleUser, ...prev.filter((r) => r.id !== response.roleUser.id)]);
      } else {
        const newEntry: RoleUser = {
          id: String(Date.now()),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        setRolesList((prev) => [newEntry, ...prev]);
      }

      setIsModalOpen(false);
      resetForm();
      setSuccessToast(`Role for ${name.trim()} created successfully!`);
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create role. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Role Submit
  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    if (!editName.trim()) {
      setEditErrorMsg("Please enter the user's name.");
      return;
    }
    if (!editEmail.trim()) {
      setEditErrorMsg("Please enter a valid email address.");
      return;
    }

    setIsEditSubmitting(true);
    setEditErrorMsg("");

    try {
      const payload: any = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        isActive: editIsActive,
      };
      if (editPassword && editPassword.trim().length >= 6) {
        payload.password = editPassword.trim();
      }

      const response = await authService.updateRole(editingRole.id, payload);

      if (response && response.roleUser) {
        setRolesList((prev) =>
          prev.map((r) => (r.id === editingRole.id ? response.roleUser : r))
        );
      } else {
        setRolesList((prev) =>
          prev.map((r) =>
            r.id === editingRole.id
              ? { ...r, name: editName.trim(), email: editEmail.trim().toLowerCase(), role: editRole, isActive: editIsActive }
              : r
          )
        );
      }

      setIsEditModalOpen(false);
      setEditingRole(null);
      setSuccessToast(`Role for ${editName.trim()} updated successfully!`);
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err: any) {
      setEditErrorMsg(err.message || "Failed to update role. Please try again.");
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // Handle Delete Role
  const handleConfirmDelete = async () => {
    if (!roleToDelete) return;
    if (roleToDelete.role === "superadmin") return;

    setIsDeleting(true);
    try {
      await authService.deleteRole(roleToDelete.id);
      setRolesList((prev) => prev.filter((r) => r.id !== roleToDelete.id));
      setSuccessToast(`Role "${roleToDelete.name}" deleted successfully.`);
      setTimeout(() => setSuccessToast(""), 4000);
      setRoleToDelete(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete role.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Super Admin display object
  const superAdminItem: RoleUser = {
    id: adminUser?.id || "superadmin-default",
    name: adminUser?.name || "Satyam Kumar Sinha",
    email: adminUser?.email || "admin@vaidyacure.com",
    role: "superadmin",
    isActive: true,
    createdAt: adminUser?.createdAt,
  };

  // Combine roles list ensuring super admin is always first
  const displayRoles: RoleUser[] =
    rolesList.length > 0
      ? [superAdminItem, ...rolesList.filter((r) => r.email !== superAdminItem.email && r.id !== superAdminItem.id)]
      : [superAdminItem];

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20 relative">
      {/* Full-Width Top Navigation Bar */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      {/* Main Body Container (Sidebar below navbar + Content) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar positioned under TopNav */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          adminUser={adminUser}
        />

        {/* Manage Roles Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
          {/* Manage Roles Body */}
          <main className="flex-1 p-3 sm:p-4 lg:p-5 flex flex-col justify-between overflow-hidden max-w-[1240px] w-full mx-auto gap-3">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Link
                  href={ROUTES.DASHBOARD}
                  className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Link>
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight">
                    Manage Roles
                  </h1>
                  <p className="text-[11px] text-gray-500">
                    Configure administrator roles, permissions, and access privileges
                  </p>
                </div>
              </div>

              {/* Add New Role Button */}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] rounded-xl shadow-2xs transition-all cursor-pointer hover:shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Role</span>
              </button>
            </div>

            {/* Success Toast */}
            {successToast && (
              <div className="shrink-0 p-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {successToast}
                </span>
                <button
                  type="button"
                  onClick={() => setSuccessToast("")}
                  className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick Metrics - Compact */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-white rounded-2xl p-3.5 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Active Roles</p>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">
                    {displayRoles.length} {displayRoles.length === 1 ? "Role" : "Roles"} Configured
                  </h3>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Super Administrators</p>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">
                    {displayRoles.filter((r) => r.role === "superadmin").length} Active
                  </h3>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Security Policy</p>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">Protected Super Admin</h3>
                </div>
              </div>
            </div>

            {/* Roles Table */}
            <div className="bg-white rounded-2xl border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xs font-bold text-gray-800">System Roles & Permissions</h2>
                <span className="text-[10.5px] text-gray-400">Production Environment</span>
              </div>

              <div className="overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead className="bg-gray-50/75 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[9.5px] sticky top-0 bg-gray-50/95 backdrop-blur-xs">
                    <tr>
                      <th className="px-4 py-2.5">Role Name</th>
                      <th className="px-4 py-2.5">Assigned To</th>
                      <th className="px-4 py-2.5">Permissions</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRoles.map((userRole) => {
                      const isSuperAdmin = userRole.role === "superadmin";
                      const isModerator = userRole.role === "moderator";

                      const badgeColor = isSuperAdmin
                        ? "bg-emerald-100 text-emerald-800"
                        : isModerator
                        ? "bg-teal-100 text-teal-800"
                        : "bg-sky-100 text-sky-800";

                      const avatarInitials = isSuperAdmin
                        ? "SA"
                        : isModerator
                        ? "MO"
                        : "VI";

                      const roleTitle = isSuperAdmin
                        ? "Super Administrator"
                        : isModerator
                        ? "Moderator"
                        : "Viewer";

                      const roleDesc = isSuperAdmin
                        ? "Master system access"
                        : isModerator
                        ? "Moderator content & catalog access"
                        : "Read-only reporting & audit access";

                      const permissionBadge = isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Full Control (Master Access)
                        </span>
                      ) : isModerator ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Moderate Content & Catalog
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Read-Only Access
                        </span>
                      );

                      return (
                        <tr key={userRole.id || userRole.email} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px] ${badgeColor}`}
                              >
                                {avatarInitials}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 leading-tight">{roleTitle}</p>
                                <p className="text-[10px] text-gray-400">{roleDesc}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-gray-800 leading-tight">{userRole.name}</p>
                            <p className="text-[10px] text-gray-400">{userRole.email}</p>
                          </td>

                          <td className="px-4 py-2.5">{permissionBadge}</td>

                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                userRole.isActive !== false
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  userRole.isActive !== false ? "bg-emerald-600" : "bg-gray-400"
                                }`}
                              />
                              {userRole.isActive !== false ? "Active" : "Disabled"}
                            </span>
                          </td>

                          {/* Actions Column */}
                          <td className="px-4 py-2.5 text-right">
                            {isSuperAdmin ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 select-none">
                                <Lock className="w-2.5 h-2.5 text-amber-600" />
                                Protected
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(userRole)}
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 transition-colors cursor-pointer"
                                  title="Edit Role"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRoleToDelete(userRole)}
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
                                  title="Delete Role"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ADD NEW ROLE MODAL                                                        */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 transition-all">
          <div
            ref={modalRef}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-[#0D4827] to-[#145C33] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Add New Role</h3>
                  <p className="text-[10px] text-emerald-100">Create administrator credentials & permissions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateRole} className="p-5 space-y-3.5">
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Name Field */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter full name"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@vaidyacure.com"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Role Dropdown */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Role
                </label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "moderator" | "viewer")}
                    className="w-full px-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold cursor-pointer appearance-none"
                  >
                    <option value="moderator">Moderator (Content & Catalog Management)</option>
                    <option value="viewer">Viewer (Read-Only Access)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-[10px]">
                    ▼
                  </div>
                </div>
              </div>

              {/* Generate Password Section */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Password</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => generateStrongPassword(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Generate Password</span>
                  </button>
                </div>

                {password ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1.5 pr-2">
                      <div className="flex-1 px-2 font-mono text-xs text-gray-900 tracking-wider overflow-hidden text-ellipsis select-all">
                        {isPasswordHidden ? (
                          <span className="text-gray-400 tracking-widest">••••••••••••</span>
                        ) : (
                          <span className="font-semibold text-emerald-900">{password}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsPasswordHidden(!isPasswordHidden)}
                        title={isPasswordHidden ? "Show password" : "Hide password"}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {isPasswordHidden ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyPassword(password, false)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isCopied
                            ? "bg-emerald-600 text-white shadow-2xs"
                            : "bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white"
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isCopied && (
                      <p className="text-[10.5px] text-emerald-700 font-medium flex items-center gap-1 animate-in fade-in duration-150">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>Password copied to clipboard & hidden for security.</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 text-center text-gray-400 text-[11px]">
                    Click <span className="font-bold text-emerald-800">Generate Password</span> above to create secure credentials.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span>Create Role</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT ROLE MODAL                                                           */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 transition-all">
          <div
            ref={editModalRef}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-[#0D4827] to-[#145C33] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Edit Role</h3>
                  <p className="text-[10px] text-emerald-100">Update credentials and access permissions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUpdateRole} className="p-5 space-y-3.5">
              {editErrorMsg && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{editErrorMsg}</span>
                </div>
              )}

              {/* Name Field */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter full name"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="user@vaidyacure.com"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Role & Status Fields Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Role
                  </label>
                  <div className="relative">
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as "moderator" | "viewer")}
                      className="w-full px-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold cursor-pointer appearance-none"
                    >
                      <option value="moderator">Moderator</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-[10px]">
                      ▼
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      value={editIsActive ? "active" : "disabled"}
                      onChange={(e) => setEditIsActive(e.target.value === "active")}
                      className="w-full px-3 py-2 text-xs text-gray-800 bg-gray-50/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold cursor-pointer appearance-none"
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-[10px]">
                      ▼
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset / Change Password (Optional) */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Change Password (Optional)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => generateStrongPassword(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Generate New</span>
                  </button>
                </div>

                {editPassword ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1.5 pr-2">
                      <div className="flex-1 px-2 font-mono text-xs text-gray-900 tracking-wider overflow-hidden text-ellipsis select-all">
                        {isEditPasswordHidden ? (
                          <span className="text-gray-400 tracking-widest">••••••••••••</span>
                        ) : (
                          <span className="font-semibold text-emerald-900">{editPassword}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditPasswordHidden(!isEditPasswordHidden)}
                        title={isEditPasswordHidden ? "Show password" : "Hide password"}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {isEditPasswordHidden ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyPassword(editPassword, true)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isEditCopied
                            ? "bg-emerald-600 text-white shadow-2xs"
                            : "bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white"
                        }`}
                      >
                        {isEditCopied ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isEditCopied && (
                      <p className="text-[10.5px] text-emerald-700 font-medium flex items-center gap-1 animate-in fade-in duration-150">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>Password copied to clipboard & hidden for security.</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    Leave blank to keep existing password unchanged.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isEditSubmitting}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isEditSubmitting ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL                                                 */}
      {/* ========================================================================= */}
      {roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 transition-all">
          <div
            ref={deleteModalRef}
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200 p-5"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3 mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="text-sm font-bold text-gray-900 text-center mb-1">
              Delete Role Account
            </h3>
            <p className="text-xs text-gray-500 text-center mb-4">
              Are you sure you want to remove <span className="font-bold text-gray-800">{roleToDelete.name}</span> ({roleToDelete.email})? This action cannot be undone.
            </p>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Role</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


