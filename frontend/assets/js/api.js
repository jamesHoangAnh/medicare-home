const API_URL = "http://localhost:3000/api";

const api = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  },
  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Backend trả về HTML:", text.substring(0, 200));
        throw new Error(
          "Backend không phản hồi JSON. Kiểm tra backend có chạy không.",
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi server");
      return data;
    } catch (err) {
      if (err.message.includes("Failed to fetch"))
        throw new Error(
          "Không kết nối được backend. Hãy chạy: cd backend && node server.js",
        );
      throw err;
    }
  },

  // AUTH
  login: (sdt, mk) =>
    api.request("/auth/login", {
      method: "POST",
      body: { soDienThoai: sdt, matKhau: mk },
    }),
  register: (data) =>
    api.request("/auth/register", { method: "POST", body: data }),
  getMe: () => api.request("/auth/me"),
  changePassword: (oldPass, newPass) =>
    api.request("/auth/change-password", {
      method: "PUT",
      body: { matKhauCu: oldPass, matKhauMoi: newPass },
    }),

  // DOCTORS
  getDoctors: () => api.request("/doctors"),
  getDoctorAppointments: () => api.request("/doctor/appointments/my"),
  setAppointmentStatus: (id, trangThai, lyDo) =>
    api.request(`/appointments/${id}/status`, {
      method: "PUT",
      body: { trangThai, lyDo },
    }),
  updateAppointment: (id, data) =>
    api.request(`/appointments/${id}`, { method: "PUT", body: data }),
  getAccountDependencies: (id) =>
    api.request(`/admin/accounts/${id}/dependencies`),

  // PATIENT
  createConsultation: (data) =>
    api.request("/patient/consultation/request", {
      method: "POST",
      body: data,
    }),
  getMyConsultations: () => api.request("/patient/consultation/my-requests"),
  createAppointment: (data) =>
    api.request("/patient/appointment", { method: "POST", body: data }),
  getMyAppointments: () => api.request("/patient/appointment/my"),
  cancelAppointment: (id) =>
    api.request(`/patient/appointment/${id}/cancel`, { method: "PUT" }),
  getMyMedicalRecords: () => api.request("/patient/medical-records"),
  getMyInvoices: () => api.request("/patient/invoices"),
  generateQR: (id) =>
    api.request(`/patient/invoices/${id}/generate-qr`, { method: "POST" }),
  confirmPayment: (id) =>
    api.request(`/patient/invoices/${id}/confirm-payment`, {
      method: "POST",
      body: {},
    }),

  // DOCTOR
  getDoctorPendingAppointments: () =>
    api.request("/doctor/appointments/pending"),
  updateAppointmentStatus: (id, status) =>
    api.request(`/doctor/appointments/${id}/status`, {
      method: "PUT",
      body: { trangThai: status },
    }),
  createMedicalRecord: (data) =>
    api.request("/doctor/medical-records", { method: "POST", body: data }),
  createInvoice: (data) =>
    api.request("/doctor/invoices", { method: "POST", body: data }),

  // CONSULTANT
  getPendingConsultations: () => api.request("/consultant/requests/pending"),
  assignDoctor: (data) =>
    api.request("/consultant/requests/assign", { method: "POST", body: data }),

  // ADMIN
  getStatistics: () => api.request("/admin/statistics"),
  getAccounts: () => api.request("/admin/accounts"),
  createStaff: (data) =>
    api.request("/admin/accounts", { method: "POST", body: data }),
  suspendAccount: (id) =>
    api.request(`/admin/accounts/${id}/suspend`, { method: "PUT" }),
  activateAccount: (id) =>
    api.request(`/admin/accounts/${id}/activate`, { method: "PUT" }),
  deleteAccount: (id) =>
    api.request(`/admin/accounts/${id}`, { method: "DELETE" }),
  getSystemLogs: () => api.request("/admin/logs"),
  getLogActions: () => api.request("/admin/log-actions"),
  getConfig: () => api.request("/admin/config"),
  updateConfig: (configs) =>
    api.request("/admin/config", { method: "PUT", body: { configs } }),
  backup: () => api.request("/admin/backup", { method: "POST" }),
};
