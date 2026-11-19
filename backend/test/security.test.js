const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "isolated-security-test-secret";

const accounts = [];
const queries = [];
let nextAccountId = 1;

const fakePool = {
  request() {
    const inputs = {};
    return {
      input(name, type, value) {
        inputs[name] = value;
        return this;
      },
      async query(statement) {
        const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
        queries.push({ normalized, inputs: { ...inputs } });

        if (normalized.startsWith("insert into systemlog")) {
          return { recordset: [], rowsAffected: [1] };
        }
        if (normalized.includes("select id from taikhoan where sodienthoai")) {
          const account = accounts.find(
            (item) => item.soDienThoai === inputs.sdt,
          );
          return { recordset: account ? [{ id: account.id }] : [] };
        }
        if (
          normalized.includes(
            "select * from taikhoan where sodienthoai = @sdt",
          )
        ) {
          const account = accounts.find(
            (item) => item.soDienThoai === inputs.sdt,
          );
          return { recordset: account ? [{ ...account }] : [] };
        }
        if (normalized.startsWith("select id, hoten, sodienthoai")) {
          return {
            recordset: accounts.map(
              ({ id, hoTen, soDienThoai, vaiTro, trangThai }) => ({
                id,
                hoTen,
                soDienThoai,
                vaiTro,
                trangThai,
              }),
            ),
          };
        }
        if (
          normalized.includes(
            "select matkhauhash from taikhoan where id = @id",
          )
        ) {
          const account = accounts.find((item) => item.id === inputs.id);
          return {
            recordset: account ? [{ matKhauHash: account.matKhauHash }] : [],
          };
        }
        if (
          normalized.startsWith("update taikhoan set matkhauhash = @mk")
        ) {
          const account = accounts.find((item) => item.id === inputs.id);
          if (account) account.matKhauHash = inputs.mk;
          return { recordset: [], rowsAffected: [account ? 1 : 0] };
        }
        if (normalized.startsWith("insert into taikhoan")) {
          const account = {
            id: nextAccountId++,
            hoTen: inputs.ht,
            soDienThoai: inputs.sdt,
            email: inputs.em,
            vaiTro: inputs.vt || "BenhNhan",
            matKhauHash: inputs.mk,
            trangThai: "HoatDong",
          };
          accounts.push(account);
          return { recordset: [{ id: account.id }], rowsAffected: [1] };
        }

        throw new Error(`Unexpected test query: ${statement}`);
      },
    };
  },
};

const databasePath = require.resolve("../config/database");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    getPool: async () => fakePool,
    sql: {
      Int: "Int",
      VarChar: "VarChar",
      NVarChar: "NVarChar",
    },
  },
};

const app = require("../server");
const paymentController = require("../controllers/payment.controller");
let server;
let baseUrl;

function tokenFor(vaiTro, id = 1) {
  return jwt.sign({ id, vaiTro, hoTen: "Test User" }, process.env.JWT_SECRET);
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("admin endpoints reject unauthenticated and non-admin callers", async () => {
  const unauthenticated = await request("/api/admin/accounts");
  assert.equal(unauthenticated.status, 401);

  const patient = await request("/api/admin/accounts", {
    token: tokenFor("BenhNhan"),
  });
  assert.equal(patient.status, 403);
});

test("admin account creation rejects Admin role and hashes staff passwords", async () => {
  const adminToken = tokenFor("Admin");
  const queryCount = queries.length;
  const rejected = await request("/api/admin/accounts", {
    method: "POST",
    token: adminToken,
    body: {
      hoTen: "Unauthorized Admin",
      soDienThoai: "0900000010",
      vaiTro: "Admin",
      matKhau: "StrongPass1",
    },
  });
  assert.equal(rejected.status, 400);
  assert.equal(queries.length, queryCount);

  const created = await request("/api/admin/accounts", {
    method: "POST",
    token: adminToken,
    body: {
      hoTen: "Test Doctor",
      soDienThoai: "0900000011",
      vaiTro: "BacSi",
      matKhau: "StrongPass1",
    },
  });
  assert.equal(created.status, 201);
  const account = accounts.find((item) => item.soDienThoai === "0900000011");
  assert.notEqual(account.matKhauHash, "StrongPass1");
  assert.equal(await bcrypt.compare("StrongPass1", account.matKhauHash), true);
});

test("registration hashes passwords and legacy login upgrades plaintext", async () => {
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: {
      hoTen: "Test Patient",
      soDienThoai: "0900000020",
      matKhau: "StrongPass2",
    },
  });
  assert.equal(registered.status, 201);

  const registeredAccount = accounts.find(
    (item) => item.soDienThoai === "0900000020",
  );
  assert.notEqual(registeredAccount.matKhauHash, "StrongPass2");
  assert.equal(
    await bcrypt.compare("StrongPass2", registeredAccount.matKhauHash),
    true,
  );

  accounts.push({
    id: 90,
    hoTen: "Legacy Patient",
    soDienThoai: "0900000090",
    matKhauHash: "LegacyPass3",
    vaiTro: "BenhNhan",
    trangThai: "HoatDong",
  });
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { soDienThoai: "0900000090", matKhau: "LegacyPass3" },
  });
  assert.equal(login.status, 200);
  const legacyAccount = accounts.find((item) => item.id === 90);
  assert.notEqual(legacyAccount.matKhauHash, "LegacyPass3");
  assert.equal(
    await bcrypt.compare("LegacyPass3", legacyAccount.matKhauHash),
    true,
  );
});

test("password changes verify and store bcrypt hashes", async () => {
  const oldPassword = "OldPass123";
  accounts.push({
    id: 91,
    hoTen: "Change Password User",
    soDienThoai: "0900000091",
    matKhauHash: await bcrypt.hash(oldPassword, 4),
    vaiTro: "BenhNhan",
    trangThai: "HoatDong",
  });

  const changed = await request("/api/auth/change-password", {
    method: "PUT",
    token: tokenFor("BenhNhan", 91),
    body: { matKhauCu: oldPassword, matKhauMoi: "NewPass123" },
  });
  assert.equal(changed.status, 200);
  const account = accounts.find((item) => item.id === 91);
  assert.notEqual(account.matKhauHash, "NewPass123");
  assert.equal(await bcrypt.compare("NewPass123", account.matKhauHash), true);
});

test("payment confirmation requires login and never marks invoices paid manually", async () => {
  const unauthenticated = await request(
    "/api/patient/invoices/123/confirm-payment",
    { method: "POST", body: {} },
  );
  assert.equal(unauthenticated.status, 401);

  const queryCount = queries.length;
  const patientRequest = await request(
    "/api/patient/invoices/123/confirm-payment",
    {
      method: "POST",
      token: tokenFor("BenhNhan"),
      body: {},
    },
  );
  assert.equal(patientRequest.status, 501);
  assert.equal(queries.length, queryCount);
});

test("the patient payment controller also fails closed without verification", async () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await paymentController.confirmPayment({}, response);
  assert.equal(response.statusCode, 501);
  assert.match(response.body.error, /xác minh giao dịch/i);
});

test("patient, doctor, and admin accounts authenticate and enforce role access", async () => {
  const fixtures = [
    {
      id: 101,
      hoTen: "Test Patient",
      soDienThoai: "0900000101",
      password: "PatientPass1",
      vaiTro: "BenhNhan",
    },
    {
      id: 102,
      hoTen: "Test Doctor",
      soDienThoai: "0900000102",
      password: "DoctorPass1",
      vaiTro: "BacSi",
    },
    {
      id: 103,
      hoTen: "Test Admin",
      soDienThoai: "0900000103",
      password: "AdminPass1",
      vaiTro: "Admin",
    },
  ];

  for (const fixture of fixtures) {
    accounts.push({
      id: fixture.id,
      hoTen: fixture.hoTen,
      soDienThoai: fixture.soDienThoai,
      matKhauHash: await bcrypt.hash(fixture.password, 4),
      vaiTro: fixture.vaiTro,
      trangThai: "HoatDong",
    });
  }

  const tokens = {};
  for (const fixture of fixtures) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: {
        soDienThoai: fixture.soDienThoai,
        matKhau: fixture.password,
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.user.vaiTro, fixture.vaiTro);
    tokens[fixture.vaiTro] = result.token;
  }

  const adminAccounts = await request("/api/admin/accounts", {
    token: tokens.Admin,
  });
  assert.equal(adminAccounts.status, 200);

  for (const role of ["BenhNhan", "BacSi"]) {
    const denied = await request("/api/admin/accounts", { token: tokens[role] });
    assert.equal(denied.status, 403);
  }

  const patientPayment = await request(
    "/api/patient/invoices/123/confirm-payment",
    { method: "POST", token: tokens.BenhNhan, body: {} },
  );
  assert.equal(patientPayment.status, 501);

  for (const role of ["BacSi", "Admin"]) {
    const denied = await request(
      "/api/patient/invoices/123/confirm-payment",
      { method: "POST", token: tokens[role], body: {} },
    );
    assert.equal(denied.status, 403);
  }
});
