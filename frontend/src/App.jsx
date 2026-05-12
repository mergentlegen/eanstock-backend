import { useEffect, useState } from "react";

const demoAdmin = { email: "admin@leanstock.local", password: "AdminPass1!" };
const initialAuth = { accessToken: "", refreshToken: "", user: null };

function cleanUsername(email) {
  const base = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 22) || "user";
  return `${base}_${Date.now().toString(36).slice(-6)}`;
}

function marketName(email) {
  const base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return `${base || "New"} Market`;
}

function apiMessage(data, fallback) {
  if (data?.error?.message) return data.error.message;
  if (data?.message) return data.message;
  if (data?.user?.email) return `${data.user.email} updated`;
  if (data?.location?.name) return `${data.location.name} created`;
  if (data?.product?.name) return `${data.product.name} created`;
  if (data?.transfer?.id) return "Inventory transfer completed";
  if (data?.reservation?.token) return "Stock reservation created";
  return fallback;
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = window.localStorage.getItem("leanstock-auth");
    return saved ? JSON.parse(saved) : initialAuth;
  });
  const [screen, setScreen] = useState("register");
  const [section, setSection] = useState("inventory");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({
    type: "info",
    title: "Ready",
    text: "Create an account, verify email, then manage inventory.",
  });

  const [registerForm, setRegisterForm] = useState({ email: "", password: "" });
  const [verifyToken, setVerifyToken] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetForm, setResetForm] = useState({ email: "", token: "", newPassword: "NewStrongPass1!" });
  const [verificationPending, setVerificationPending] = useState(false);

  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [reservationToken, setReservationToken] = useState("");

  const [locationForm, setLocationForm] = useState({
    name: "Main Store",
    code: "MAIN",
    address: "Main street 10",
  });
  const [productForm, setProductForm] = useState({
    sku: "SKU-1001",
    name: "Winter Jacket",
    supplierName: "Almaty Textile",
    supplierCost: "9000",
    basePrice: "15000",
    currentPrice: "15000",
    deadStockAfterDays: "30",
    decayPercent: "10",
    decayIntervalHours: "72",
    minPricePercent: "50",
  });
  const [stockForm, setStockForm] = useState({
    productId: "",
    locationId: "",
    quantity: "20",
  });
  const [transferForm, setTransferForm] = useState({
    productId: "",
    sourceLocationId: "",
    destinationLocationId: "",
    quantity: "5",
  });

  const isLoggedIn = Boolean(auth.accessToken);
  const isAdmin = auth.user?.role === "ADMIN";
  const canManageInventory = ["ADMIN", "MERCHANT"].includes(auth.user?.role);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("verifyToken");
    const resetToken = params.get("resetToken");
    if (token) {
      setVerifyToken(token);
      setVerificationPending(true);
      verifyEmail(token);
      window.history.replaceState({}, "", "/");
    }
    if (resetToken) {
      setScreen("reset");
      setResetForm((current) => ({ ...current, token: resetToken }));
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (section === "admin" && isAdmin) {
      listUsers();
    }
  }, [section, isAdmin]);

  function notify(type, title, text) {
    setNotice({ type, title, text });
  }

  function saveAuth(nextAuth) {
    setAuth(nextAuth);
    window.localStorage.setItem("leanstock-auth", JSON.stringify(nextAuth));
  }

  function clearSession() {
    setAuth(initialAuth);
    window.localStorage.removeItem("leanstock-auth");
    setSection("inventory");
  }

  async function parseResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw { status: response.status, ...data };
    }
    return data;
  }

  async function refreshSession() {
    if (!auth.refreshToken) {
      return null;
    }
    const response = await fetch("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    const data = await parseResponse(response);
    const nextAuth = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: auth.user,
    };
    saveAuth(nextAuth);
    return nextAuth;
  }

  async function send(path, options = {}, token = auth.accessToken) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return parseResponse(response);
  }

  async function request(path, options = {}, successText = "Done") {
    setLoading(true);
    try {
      let data;
      try {
        data = await send(path, options);
      } catch (error) {
        if (error.status === 401 && options.auth && !options.skipAutoRefresh) {
          const refreshed = await refreshSession();
          if (refreshed) {
            data = await send(path, options, refreshed.accessToken);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      notify("success", successText, apiMessage(data, successText));
      return data;
    } catch (error) {
      if (error.status === 401 && options.auth) {
        clearSession();
        notify("error", "Session expired", "Please login again.");
        throw error;
      }
      notify("error", "Request failed", apiMessage(error, "Something went wrong"));
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    const body = {
      tenantName: marketName(registerForm.email),
      email: registerForm.email,
      username: cleanUsername(registerForm.email),
      password: registerForm.password,
    };
    await request("/auth/register", { method: "POST", body }, "Verification email sent");
    setVerificationPending(true);
    setLoginForm({ email: registerForm.email, password: registerForm.password });
    notify("success", "Check your email", "Paste the verification code below or click the link from the email.");
  }

  async function verifyEmail(token = verifyToken) {
    const data = await request("/auth/verify-email", {
      method: "POST",
      body: { token },
    }, "Email verified");
    if (data.accessToken && data.refreshToken) {
      saveAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      setSection("inventory");
      notify("success", "Welcome in", "Email verified and login completed automatically.");
    }
  }

  async function login(event, credentials = loginForm) {
    event?.preventDefault();
    const data = await request("/auth/login", { method: "POST", body: credentials }, "Logged in");
    saveAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    setSection("inventory");
  }

  async function logout() {
    setLoading(true);
    try {
      if (auth.refreshToken) {
        await send("/auth/logout", {
          method: "POST",
          auth: true,
          body: { refreshToken: auth.refreshToken },
          skipAutoRefresh: true,
        });
      }
    } catch (_error) {
      // The local session must be cleared even when the access token already expired.
    } finally {
      clearSession();
      notify("success", "Logged out", "Local session cleared. Login again to continue.");
      setLoading(false);
    }
  }

  async function refreshAccessToken() {
    const data = await request("/auth/refresh", {
      method: "POST",
      body: { refreshToken: auth.refreshToken },
    }, "Token refreshed");
    saveAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: auth.user });
  }

  async function requestReset(event) {
    event.preventDefault();
    await request("/auth/password-reset/request", {
      method: "POST",
      body: { email: resetForm.email },
    }, "Reset email sent");
  }

  async function confirmReset() {
    await request("/auth/password-reset/confirm", {
      method: "POST",
      body: { token: resetForm.token, newPassword: resetForm.newPassword },
    }, "Password changed");
    setScreen("login");
  }

  async function createLocation(event) {
    event.preventDefault();
    const data = await request("/locations", {
      method: "POST",
      auth: true,
      body: locationForm,
    }, "Location created");
    const next = [...locations, data.location];
    setLocations(next);
    if (next.length === 1) {
      setStockForm((current) => ({ ...current, locationId: data.location.id }));
      setTransferForm((current) => ({ ...current, sourceLocationId: data.location.id }));
    }
    if (next.length === 2) {
      setTransferForm((current) => ({ ...current, destinationLocationId: data.location.id }));
    }
    setLocationForm((current) => ({ ...current, code: `${current.code}-${next.length + 1}` }));
  }

  async function createProduct(event) {
    event.preventDefault();
    const data = await request("/products", {
      method: "POST",
      auth: true,
      body: {
        ...productForm,
        supplierCost: Number(productForm.supplierCost),
        basePrice: Number(productForm.basePrice),
        currentPrice: Number(productForm.currentPrice),
        deadStockAfterDays: Number(productForm.deadStockAfterDays),
        decayPercent: Number(productForm.decayPercent),
        decayIntervalHours: Number(productForm.decayIntervalHours),
        minPricePercent: Number(productForm.minPricePercent),
      },
    }, "Product created");
    const next = [...products, data.product];
    setProducts(next);
    setStockForm((current) => ({ ...current, productId: data.product.id }));
    setTransferForm((current) => ({ ...current, productId: data.product.id }));
    setProductForm((current) => ({ ...current, sku: `SKU-${Date.now()}` }));
  }

  async function setStock(event) {
    event.preventDefault();
    await request("/inventory/stock", {
      method: "POST",
      auth: true,
      body: {
        productId: stockForm.productId,
        locationId: stockForm.locationId,
        quantity: Number(stockForm.quantity),
      },
    }, "Stock updated");
  }

  async function transferStock(event) {
    event.preventDefault();
    await request("/inventory/transfers", {
      method: "POST",
      auth: true,
      body: {
        productId: transferForm.productId,
        sourceLocationId: transferForm.sourceLocationId,
        destinationLocationId: transferForm.destinationLocationId,
        quantity: Number(transferForm.quantity),
      },
    }, "Transfer completed");
  }

  async function reserveStock() {
    const data = await request("/inventory/reservations", {
      method: "POST",
      auth: true,
      body: {
        productId: transferForm.productId,
        locationId: transferForm.destinationLocationId,
        quantity: 1,
        ttlSeconds: 900,
      },
    }, "Reservation created");
    setReservationToken(data.reservation.token);
  }

  async function listUsers() {
    const data = await request("/admin/users?limit=100", { auth: true }, "Users loaded");
    setUsers(data.data || []);
  }

  async function changeRole(userId, role) {
    await request(`/admin/users/${userId}/role`, {
      method: "PATCH",
      auth: true,
      body: { role },
    }, "Role changed");
    await listUsers();
  }

  if (!isLoggedIn) {
    return (
      <main className="landing">
        <section className="hero">
          <div className="brand"><span>LS</span> LeanStock</div>
          <h1>Inventory platform for small retail teams</h1>
          <p>Register, verify email, login, then manage locations, products, stock transfers, reservations, and roles from one dashboard.</p>
        </section>

        <section className="authPanel">
          <div className="authSwitch">
            <button className={screen === "register" ? "active" : ""} type="button" onClick={() => setScreen("register")}>Register</button>
            <button className={screen === "login" ? "active" : ""} type="button" onClick={() => setScreen("login")}>Login</button>
            <button className={screen === "reset" ? "active" : ""} type="button" onClick={() => setScreen("reset")}>Reset password</button>
          </div>

          {screen === "register" && (
            <div className="authStack">
              <form onSubmit={register}>
                <h2>Create account</h2>
                <label>Email<input required type="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} /></label>
                <label>Password<input required type="password" placeholder="StrongPass1!" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} /></label>
                <button type="submit" disabled={loading}>Send verification email</button>
              </form>

              {verificationPending && (
                <form className="verifyBox" onSubmit={(event) => { event.preventDefault(); verifyEmail(); }}>
                  <h3>Verify your email</h3>
                  <p>Open the email and click the link. If you use log mode, paste the verification token here.</p>
                  <label>Verification code<input required value={verifyToken} onChange={(event) => setVerifyToken(event.target.value)} /></label>
                  <button type="submit" disabled={loading}>Verify and enter dashboard</button>
                </form>
              )}
            </div>
          )}

          {screen === "login" && (
            <form onSubmit={login}>
              <h2>Login</h2>
              <label>Email<input required type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} /></label>
              <label>Password<input required type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} /></label>
              <button type="submit" disabled={loading}>Login</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => login(null, demoAdmin)}>Login as demo admin</button>
            </form>
          )}

          {screen === "reset" && (
            <form onSubmit={requestReset}>
              <h2>Reset password</h2>
              <label>Email<input required type="email" value={resetForm.email} onChange={(event) => setResetForm({ ...resetForm, email: event.target.value })} /></label>
              <button type="submit" disabled={loading}>Send reset email</button>
              <label>Reset code<input value={resetForm.token} onChange={(event) => setResetForm({ ...resetForm, token: event.target.value })} /></label>
              <label>New password<input type="password" value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} /></label>
              <button className="secondary" type="button" disabled={loading || !resetForm.token} onClick={confirmReset}>Change password</button>
            </form>
          )}

          <Notice notice={notice} />
        </section>
      </main>
    );
  }

  return (
    <main className="platform">
      <aside className="sidebar">
        <div className="brand compact"><span>LS</span> LeanStock</div>
        <button className={section === "inventory" ? "active" : ""} type="button" onClick={() => setSection("inventory")}>Inventory</button>
        {isAdmin && <button className={section === "admin" ? "active" : ""} type="button" onClick={() => setSection("admin")}>Admin panel</button>}
        <button className={section === "account" ? "active" : ""} type="button" onClick={() => setSection("account")}>Account</button>
        <div className="userCard">
          <strong>{auth.user?.email}</strong>
          <span>{auth.user?.role}</span>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <div>
            <h1>{section === "admin" ? "Admin panel" : section === "account" ? "Account" : "Inventory"}</h1>
            <p>{section === "inventory" ? "Create real catalog data and run protected inventory operations." : "Manage the current session and access control."}</p>
          </div>
          <div className="topActions">
            <a href="/docs" target="_blank" rel="noreferrer">Swagger</a>
            <button className="secondary" type="button" onClick={refreshAccessToken} disabled={loading}>Refresh token</button>
            <button type="button" onClick={logout} disabled={loading}>Logout</button>
          </div>
        </header>

        <Notice notice={notice} />

        {section === "inventory" && (
          <div className="dashboardGrid">
            <form className="card" onSubmit={createLocation}>
              <h2>Create location</h2>
              <label>Name<input value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} /></label>
              <label>Code<input value={locationForm.code} onChange={(event) => setLocationForm({ ...locationForm, code: event.target.value.toUpperCase() })} /></label>
              <label>Address<input value={locationForm.address} onChange={(event) => setLocationForm({ ...locationForm, address: event.target.value })} /></label>
              <button type="submit" disabled={loading || !canManageInventory}>Create location</button>
            </form>

            <form className="card" onSubmit={createProduct}>
              <h2>Create product</h2>
              <div className="twoCols">
                <label>SKU<input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
                <label>Name<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
                <label>Supplier<input value={productForm.supplierName} onChange={(event) => setProductForm({ ...productForm, supplierName: event.target.value })} /></label>
                <label>Supplier cost<input type="number" value={productForm.supplierCost} onChange={(event) => setProductForm({ ...productForm, supplierCost: event.target.value })} /></label>
                <label>Base price<input type="number" value={productForm.basePrice} onChange={(event) => setProductForm({ ...productForm, basePrice: event.target.value })} /></label>
                <label>Current price<input type="number" value={productForm.currentPrice} onChange={(event) => setProductForm({ ...productForm, currentPrice: event.target.value })} /></label>
              </div>
              <button type="submit" disabled={loading || !canManageInventory}>Create product</button>
            </form>

            <form className="card" onSubmit={setStock}>
              <h2>Add stock</h2>
              <Select label="Product" value={stockForm.productId} options={products} onChange={(value) => setStockForm({ ...stockForm, productId: value })} />
              <Select label="Location" value={stockForm.locationId} options={locations} onChange={(value) => setStockForm({ ...stockForm, locationId: value })} />
              <label>Quantity<input type="number" min="0" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></label>
              <button type="submit" disabled={loading || !stockForm.productId || !stockForm.locationId}>Save stock</button>
            </form>

            <form className="card" onSubmit={transferStock}>
              <h2>Transfer stock</h2>
              <Select label="Product" value={transferForm.productId} options={products} onChange={(value) => setTransferForm({ ...transferForm, productId: value })} />
              <Select label="From" value={transferForm.sourceLocationId} options={locations} onChange={(value) => setTransferForm({ ...transferForm, sourceLocationId: value })} />
              <Select label="To" value={transferForm.destinationLocationId} options={locations} onChange={(value) => setTransferForm({ ...transferForm, destinationLocationId: value })} />
              <label>Quantity<input type="number" min="1" value={transferForm.quantity} onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })} /></label>
              <button type="submit" disabled={loading || !transferForm.productId || !transferForm.sourceLocationId || !transferForm.destinationLocationId}>Transfer</button>
            </form>

            <div className="card">
              <h2>Quick operations</h2>
              <button type="button" disabled={loading || !transferForm.productId || !transferForm.destinationLocationId} onClick={reserveStock}>Reserve one item</button>
              <button className="secondary" type="button" disabled={loading || !reservationToken} onClick={() => request(`/inventory/reservations/${reservationToken}/commit`, { method: "POST", auth: true }, "Reservation committed")}>Commit reservation</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => request("/jobs/dead-stock-decay", { method: "POST", auth: true, body: {} }, "Dead stock job executed")}>Run dead-stock decay</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => request("/products", { auth: true }, "Products loaded")}>Refresh products</button>
            </div>

            <div className="card listCard">
              <h2>Current session data</h2>
              <DataList title="Locations" items={locations} />
              <DataList title="Products" items={products} />
              {reservationToken && <p className="muted">Reservation: {reservationToken}</p>}
            </div>
          </div>
        )}

        {section === "admin" && isAdmin && (
          <div className="card">
            <div className="cardHeader">
              <div>
                <h2>User management</h2>
                <p>Admin can see registered users and change their role.</p>
              </div>
              <button type="button" onClick={listUsers} disabled={loading}>Refresh users</button>
            </div>
            <div className="table">
              {users.map((user) => (
                <div className="tableRow" key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>{user.tenant?.name || "No tenant"} · {user.emailVerifiedAt ? "verified" : "not verified"}</span>
                  </div>
                  <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value)} disabled={loading}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MERCHANT">MERCHANT</option>
                    <option value="STAFF">STAFF</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === "account" && (
          <div className="dashboardGrid small">
            <div className="card">
              <h2>Profile</h2>
              <p><strong>Email:</strong> {auth.user?.email}</p>
              <p><strong>Role:</strong> {auth.user?.role}</p>
              <p><strong>Tenant:</strong> {auth.user?.tenantId}</p>
            </div>
            <div className="card">
              <h2>Security</h2>
              <p className="muted">Access token is short-lived. Refresh token is revocable and rotates when refreshed.</p>
              <button type="button" onClick={refreshAccessToken} disabled={loading}>Refresh access token</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Notice({ notice }) {
  return (
    <div className={`notice ${notice.type}`}>
      <strong>{notice.title}</strong>
      <span>{notice.text}</span>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select...</option>
        {options.map((item) => (
          <option value={item.id} key={item.id}>{item.name || item.sku}</option>
        ))}
      </select>
    </label>
  );
}

function DataList({ title, items }) {
  return (
    <div className="dataList">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted">Nothing created yet.</p>}
      {items.map((item) => (
        <div key={item.id}>
          <strong>{item.name || item.sku}</strong>
          <span>{item.code || item.sku || item.id}</span>
        </div>
      ))}
    </div>
  );
}
