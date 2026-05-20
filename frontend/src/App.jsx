import toast, { Toaster } from "react-hot-toast";
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
  if (data?.error?.message) return friendlyApiMessage(data.error.message);
  if (data?.message) return data.message;
  if (data?.user?.email) return `User ${data.user.email} updated successfully.`;
  if (data?.location?.name) return `Store ${data.location.name} saved successfully.`;
  if (data?.product?.name) return `Product ${data.product.name} saved successfully.`;
  if (data?.supplier?.name) return `Supplier ${data.supplier.name} saved successfully.`;
  if (data?.purchaseOrder?.id) return `Purchase order is now ${data.purchaseOrder.status}.`;
  if (data?.inventoryItem?.id) return `Stock updated. On hand: ${data.inventoryItem.quantity}, reserved: ${data.inventoryItem.reservedQuantity}.`;
  if (data?.transfer?.id) return `Transfer completed. ${data.transfer.quantity} item(s) moved successfully.`;
  if (data?.reservation?.token) return `Stock reservation created: ${data.reservation.token}.`;
  if (data?.updatedCount !== undefined) return `Dead-stock decay checked products. Updated prices: ${data.updatedCount}.`;
  return fallback;
}

function friendlyApiMessage(message) {
  if (message.includes("Insufficient source inventory") || message.includes("Not enough stock")) {
    return "Not enough stock in the source store for this operation.";
  }
  if (message.includes("Not enough available inventory")) {
    return "Not enough available stock after existing reservations.";
  }
  if (message.includes("Unique constraint")) {
    return "This value already exists. Use a different code, SKU, email, or supplier name.";
  }
  if (message.includes("Email verification is required")) {
    return "Email verification is required before this action.";
  }
  return message;
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = window.localStorage.getItem("leanstock-auth");
    return saved ? JSON.parse(saved) : initialAuth;
  });
  const [screen, setScreen] = useState("register");
  const [section, setSection] = useState("inventory");
  const [loading, setLoading] = useState(false);

  const [registerForm, setRegisterForm] = useState({ email: "", password: "" });
  const [verifyToken, setVerifyToken] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetForm, setResetForm] = useState({ email: "", token: "", newPassword: "NewStrongPass1!" });
  const [verificationPending, setVerificationPending] = useState(false);

  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobQueues, setJobQueues] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const [reservationToken, setReservationToken] = useState("");
  const [activeReservation, setActiveReservation] = useState(null);
  const [decayResult, setDecayResult] = useState(null);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editingProductId, setEditingProductId] = useState("");
  const [editingSupplierId, setEditingSupplierId] = useState("");

  const [locationForm, setLocationForm] = useState({
    name: "Main Store",
    code: "MAIN",
    address: "Main street 10",
  });
  const [productForm, setProductForm] = useState({
    sku: "SKU-1001",
    name: "Winter Jacket",
    supplierId: "",
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
    receivedAt: "2026-03-01",
  });
  const [reservationForm, setReservationForm] = useState({
    productId: "",
    locationId: "",
    quantity: "1",
    ttlSeconds: "900",
  });
  const [transferForm, setTransferForm] = useState({
    productId: "",
    sourceLocationId: "",
    destinationLocationId: "",
    quantity: "5",
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "Almaty Textile",
    email: "supplier@example.com",
    contactName: "Supply Manager",
    phone: "+77010000000",
  });
  const [purchaseOrderForm, setPurchaseOrderForm] = useState({
    supplierId: "",
    productId: "",
    locationId: "",
    quantity: "10",
    unitCost: "9000",
  });
  const [saleForm, setSaleForm] = useState({
    productId: "",
    locationId: "",
    quantity: "2",
    unitPrice: "15000",
  });
  const [forecastForm, setForecastForm] = useState({
    productId: "",
    locationId: "",
    days: "30",
    leadTimeDays: "7",
    safetyStock: "5",
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
      loadJobQueues();
    }
  }, [section, isAdmin]);

  useEffect(() => {
    if (isLoggedIn && section === "inventory") {
      refreshLocations();
      refreshProducts();
      refreshSuppliers();
      refreshPurchaseOrders();
      refreshInventory();
    }
  }, [isLoggedIn, section]);

  function notify(type, title, text) {
    const message = `${title}: ${text}`;
    if (type === "error") {
      toast.error(message);
      return;
    }
    toast.success(message);
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
      if (!options.silent) {
        notify("success", successText, apiMessage(data, successText));
      }
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

  async function refreshLocations({ silent = true } = {}) {
    const data = await request("/locations?limit=50", { auth: true, silent }, "Stores refreshed");
    setLocations(data.data || []);
  }

  async function refreshProducts({ silent = true } = {}) {
    const data = await request("/products?limit=50", { auth: true, silent }, "Products refreshed");
    setProducts(data.data || []);
  }

  async function refreshSuppliers({ silent = true } = {}) {
    const data = await request("/suppliers?limit=50", { auth: true, silent }, "Suppliers refreshed");
    setSuppliers(data.data || []);
  }

  async function refreshPurchaseOrders({ silent = true } = {}) {
    const data = await request("/purchase-orders?limit=50", { auth: true, silent }, "Purchase orders refreshed");
    setPurchaseOrders(data.data || []);
  }

  async function refreshInventory({ silent = true } = {}) {
    const data = await request("/inventory?limit=100", { auth: true, silent }, "Stock table refreshed");
    setInventoryItems(data.data || []);
  }

  function editLocation(location) {
    setEditingLocationId(location.id);
    setLocationForm({
      name: location.name,
      code: location.code,
      address: location.address || "",
    });
  }

  function resetLocationForm() {
    setEditingLocationId("");
    setLocationForm({ name: "Main Store", code: `MAIN-${Date.now().toString(36).slice(-4).toUpperCase()}`, address: "Main street 10" });
  }

  async function saveLocation(event) {
    event.preventDefault();
    const path = editingLocationId ? `/locations/${editingLocationId}` : "/locations";
    const data = await request(path, {
      method: editingLocationId ? "PATCH" : "POST",
      auth: true,
      body: locationForm,
    }, editingLocationId ? "Store updated successfully" : "Store created successfully");

    await refreshLocations();
    if (!editingLocationId && locations.length === 0) {
      setStockForm((current) => ({ ...current, locationId: data.location.id }));
      setTransferForm((current) => ({ ...current, sourceLocationId: data.location.id }));
      setPurchaseOrderForm((current) => ({ ...current, locationId: data.location.id }));
      setReservationForm((current) => ({ ...current, locationId: data.location.id }));
      setSaleForm((current) => ({ ...current, locationId: data.location.id }));
      setForecastForm((current) => ({ ...current, locationId: data.location.id }));
    }
    if (!editingLocationId && locations.length === 1) {
      setTransferForm((current) => ({ ...current, destinationLocationId: data.location.id }));
    }
    resetLocationForm();
  }

  async function deleteLocation(locationId) {
    if (!window.confirm("Delete this location?")) return;
    await request(`/locations/${locationId}`, { method: "DELETE", auth: true }, "Location deleted");
    await refreshLocations();
    await refreshInventory();
  }

  function editProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      sku: product.sku,
      name: product.name,
      supplierId: product.supplierId || "",
      supplierName: product.supplierName || "",
      supplierCost: String(product.supplierCost),
      basePrice: String(product.basePrice),
      currentPrice: String(product.currentPrice),
      deadStockAfterDays: String(product.deadStockAfterDays),
      decayPercent: String(product.decayPercent),
      decayIntervalHours: String(product.decayIntervalHours),
      minPricePercent: String(product.minPricePercent),
    });
  }

  function resetProductForm() {
    setEditingProductId("");
    setProductForm({
      sku: `SKU-${Date.now()}`,
      name: "Winter Jacket",
      supplierId: "",
      supplierName: "Almaty Textile",
      supplierCost: "9000",
      basePrice: "15000",
      currentPrice: "15000",
      deadStockAfterDays: "30",
      decayPercent: "10",
      decayIntervalHours: "72",
      minPricePercent: "50",
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    const path = editingProductId ? `/products/${editingProductId}` : "/products";
    const data = await request(path, {
      method: editingProductId ? "PATCH" : "POST",
      auth: true,
      body: {
        ...productForm,
        supplierId: productForm.supplierId || undefined,
        supplierCost: Number(productForm.supplierCost),
        basePrice: Number(productForm.basePrice),
        currentPrice: Number(productForm.currentPrice),
        deadStockAfterDays: Number(productForm.deadStockAfterDays),
        decayPercent: Number(productForm.decayPercent),
        decayIntervalHours: Number(productForm.decayIntervalHours),
        minPricePercent: Number(productForm.minPricePercent),
      },
    }, editingProductId ? "Product updated successfully" : "Product created successfully");
    await refreshProducts();
    setStockForm((current) => ({ ...current, productId: data.product.id }));
    setTransferForm((current) => ({ ...current, productId: data.product.id }));
    setReservationForm((current) => ({ ...current, productId: data.product.id }));
    setSaleForm((current) => ({ ...current, productId: data.product.id, unitPrice: String(data.product.currentPrice) }));
    setForecastForm((current) => ({ ...current, productId: data.product.id }));
    setPurchaseOrderForm((current) => ({
      ...current,
      productId: data.product.id,
      unitCost: String(data.product.supplierCost),
    }));
    resetProductForm();
  }

  async function deleteProduct(productId) {
    if (!window.confirm("Delete this product?")) return;
    await request(`/products/${productId}`, { method: "DELETE", auth: true }, "Product deleted");
    await refreshProducts();
    await refreshInventory();
  }

  function editSupplier(supplier) {
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name,
      email: supplier.email || "",
      contactName: supplier.contactName || "",
      phone: supplier.phone || "",
    });
  }

  function resetSupplierForm() {
    setEditingSupplierId("");
    setSupplierForm({
      name: "Almaty Textile",
      email: "supplier@example.com",
      contactName: "Supply Manager",
      phone: "+77010000000",
    });
  }

  async function saveSupplier(event) {
    event.preventDefault();
    const path = editingSupplierId ? `/suppliers/${editingSupplierId}` : "/suppliers";
    const body = {
      name: supplierForm.name,
      email: supplierForm.email || undefined,
      contactName: supplierForm.contactName || undefined,
      phone: supplierForm.phone || undefined,
    };
    const data = await request(path, {
      method: editingSupplierId ? "PATCH" : "POST",
      auth: true,
      body,
    }, editingSupplierId ? "Supplier updated successfully" : "Supplier created successfully");
    await refreshSuppliers();
    setProductForm((current) => ({ ...current, supplierId: data.supplier.id, supplierName: data.supplier.name }));
    setPurchaseOrderForm((current) => ({ ...current, supplierId: data.supplier.id }));
    resetSupplierForm();
  }

  async function deleteSupplier(supplierId) {
    if (!window.confirm("Delete this supplier?")) return;
    await request(`/suppliers/${supplierId}`, { method: "DELETE", auth: true }, "Supplier deleted");
    await refreshSuppliers();
  }

  async function createPurchaseOrder(event) {
    event.preventDefault();
    const data = await request("/purchase-orders", {
      method: "POST",
      auth: true,
      body: {
        supplierId: purchaseOrderForm.supplierId,
        items: [{
          productId: purchaseOrderForm.productId,
          quantity: Number(purchaseOrderForm.quantity),
          unitCost: Number(purchaseOrderForm.unitCost),
        }],
      },
    }, "Purchase order created successfully");
    await refreshPurchaseOrders();
    return data;
  }

  async function sendPurchaseOrder(purchaseOrderId) {
    await request(`/purchase-orders/${purchaseOrderId}/send`, { method: "POST", auth: true }, "Purchase order sent");
    await refreshPurchaseOrders();
  }

  async function receivePurchaseOrder(purchaseOrderId) {
    await request(`/purchase-orders/${purchaseOrderId}/receive`, {
      method: "POST",
      auth: true,
      body: { locationId: purchaseOrderForm.locationId },
    }, "Purchase order received into inventory");
    await refreshPurchaseOrders();
    await refreshInventory();
  }

  async function cancelPurchaseOrder(purchaseOrderId) {
    await request(`/purchase-orders/${purchaseOrderId}/cancel`, { method: "POST", auth: true }, "Purchase order cancelled");
    await refreshPurchaseOrders();
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
        ...(stockForm.receivedAt ? { receivedAt: stockForm.receivedAt } : {}),
      },
    }, "Stock replenished successfully");
    await refreshInventory();
  }

  async function recordSale(event) {
    event.preventDefault();
    await request("/sales", {
      method: "POST",
      auth: true,
      body: {
        productId: saleForm.productId,
        locationId: saleForm.locationId,
        quantity: Number(saleForm.quantity),
        unitPrice: Number(saleForm.unitPrice),
      },
    }, "Sale recorded successfully");
    await refreshInventory();
  }

  async function runForecast(event) {
    event.preventDefault();
    const params = new URLSearchParams({
      locationId: forecastForm.locationId,
      days: forecastForm.days,
      leadTimeDays: forecastForm.leadTimeDays,
      safetyStock: forecastForm.safetyStock,
    });
    const data = await request(`/products/${forecastForm.productId}/forecast?${params.toString()}`, {
      auth: true,
    }, "Forecast generated successfully");
    setForecastResult(data.forecast);
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
    }, "Transfer completed successfully");
    await refreshInventory();
  }

  async function reserveStock(event) {
    event.preventDefault();
    const data = await request("/inventory/reservations", {
      method: "POST",
      auth: true,
      body: {
        productId: reservationForm.productId,
        locationId: reservationForm.locationId,
        quantity: Number(reservationForm.quantity),
        ttlSeconds: Number(reservationForm.ttlSeconds),
      },
    }, "Reservation created");
    setReservationToken(data.reservation.token);
    setActiveReservation(data.reservation);
    await refreshInventory();
  }

  async function commitReservation() {
    const data = await request(`/inventory/reservations/${reservationToken}/commit`, {
      method: "POST",
      auth: true,
    }, "Reservation committed");
    setActiveReservation(data.reservation);
    await refreshInventory();
  }

  async function runDeadStockDecay() {
    const data = await request("/jobs/dead-stock-decay", {
      method: "POST",
      auth: true,
      body: {},
    }, "Dead-stock price decay");
    setDecayResult(data);
    await refreshProducts();
    await refreshInventory();
  }

  async function listUsers({ silent = true } = {}) {
    const data = await request("/admin/users?limit=100", { auth: true, silent }, "Users refreshed");
    setUsers(data.data || []);
  }

  async function loadJobQueues({ silent = true } = {}) {
    const data = await request("/admin/jobs", { auth: true, silent }, "Queues refreshed");
    setJobQueues(data);
  }

  async function changeRole(userId, role) {
    await request(`/admin/users/${userId}/role`, {
      method: "PATCH",
      auth: true,
      body: { role },
    }, "Role changed");
    await listUsers();
  }

  async function deleteUser(userId) {
    if (!window.confirm("Delete this user account?")) return;
    await request(`/admin/users/${userId}`, { method: "DELETE", auth: true }, "User deleted");
    await listUsers();
  }

  async function deleteMyAccount() {
    if (!window.confirm("Delete your account? This cannot be undone.")) return;
    await request("/auth/me", { method: "DELETE", auth: true }, "Account deleted");
    clearSession();
    notify("success", "Account deleted", "Your account and empty tenant data were removed.");
  }

  if (!isLoggedIn) {
    return (
      <main className="landing">
        <Toaster position="top-right" toastOptions={{ duration: 2000 }} />
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
              <p className="muted">Reset email is sent only if this email is already registered.</p>
              <label>Email<input required type="email" value={resetForm.email} onChange={(event) => setResetForm({ ...resetForm, email: event.target.value })} /></label>
              <button type="submit" disabled={loading}>Send reset email</button>
              <label>Reset code<input value={resetForm.token} onChange={(event) => setResetForm({ ...resetForm, token: event.target.value })} /></label>
              <label>New password<input type="password" value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} /></label>
              <button className="secondary" type="button" disabled={loading || !resetForm.token} onClick={confirmReset}>Change password</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="platform">
      <Toaster position="top-right" toastOptions={{ duration: 2000 }} />
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
        {section === "inventory" && (
          <div className="dashboardGrid">
            <form className="card" onSubmit={saveLocation}>
              <h2>{editingLocationId ? "Edit location" : "Create location"}</h2>
              <label>Name<input value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} /></label>
              <label>Code<input value={locationForm.code} onChange={(event) => setLocationForm({ ...locationForm, code: event.target.value.toUpperCase() })} /></label>
              <label>Address<input value={locationForm.address} onChange={(event) => setLocationForm({ ...locationForm, address: event.target.value })} /></label>
              <div className="inlineActions">
                <button type="submit" disabled={loading || !canManageInventory}>{editingLocationId ? "Save location" : "Create location"}</button>
                {editingLocationId && <button className="secondary" type="button" onClick={resetLocationForm}>Cancel edit</button>}
              </div>
            </form>

            <form className="card" onSubmit={saveProduct}>
              <h2>{editingProductId ? "Edit product" : "Create product"}</h2>
              <div className="twoCols">
                <label>Product SKU<input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
                <label>Name<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
                <Select label="Linked supplier" value={productForm.supplierId} options={suppliers} onChange={(value) => setProductForm({ ...productForm, supplierId: value })} />
                <label>Supplier name on product<input value={productForm.supplierName} onChange={(event) => setProductForm({ ...productForm, supplierName: event.target.value })} /></label>
                <label>Supplier cost<input type="number" value={productForm.supplierCost} onChange={(event) => setProductForm({ ...productForm, supplierCost: event.target.value })} /></label>
                <label>Base price<input type="number" value={productForm.basePrice} onChange={(event) => setProductForm({ ...productForm, basePrice: event.target.value })} /></label>
                <label>Current price<input type="number" value={productForm.currentPrice} onChange={(event) => setProductForm({ ...productForm, currentPrice: event.target.value })} /></label>
              </div>
              <div className="inlineActions">
                <button type="submit" disabled={loading || !canManageInventory}>{editingProductId ? "Save product" : "Create product"}</button>
                {editingProductId && <button className="secondary" type="button" onClick={resetProductForm}>Cancel edit</button>}
              </div>
            </form>

            <form className="card" onSubmit={saveSupplier}>
              <h2>{editingSupplierId ? "Edit supplier" : "Create supplier"}</h2>
              <div className="twoCols">
                <label>Name<input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} /></label>
                <label>Email<input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} /></label>
                <label>Contact<input value={supplierForm.contactName} onChange={(event) => setSupplierForm({ ...supplierForm, contactName: event.target.value })} /></label>
                <label>Phone<input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} /></label>
              </div>
              <div className="inlineActions">
                <button type="submit" disabled={loading || !canManageInventory}>{editingSupplierId ? "Save supplier" : "Create supplier"}</button>
                {editingSupplierId && <button className="secondary" type="button" onClick={resetSupplierForm}>Cancel edit</button>}
              </div>
            </form>

            <form className="card" onSubmit={createPurchaseOrder}>
              <h2>Purchase order</h2>
              <Select label="Supplier" value={purchaseOrderForm.supplierId} options={suppliers} onChange={(value) => setPurchaseOrderForm({ ...purchaseOrderForm, supplierId: value })} />
              <Select label="Product" value={purchaseOrderForm.productId} options={products} onChange={(value) => setPurchaseOrderForm({ ...purchaseOrderForm, productId: value })} />
              <Select label="Receiving location" value={purchaseOrderForm.locationId} options={locations} onChange={(value) => setPurchaseOrderForm({ ...purchaseOrderForm, locationId: value })} />
              <div className="twoCols">
                <label>Quantity<input type="number" min="1" value={purchaseOrderForm.quantity} onChange={(event) => setPurchaseOrderForm({ ...purchaseOrderForm, quantity: event.target.value })} /></label>
                <label>Unit cost<input type="number" min="1" value={purchaseOrderForm.unitCost} onChange={(event) => setPurchaseOrderForm({ ...purchaseOrderForm, unitCost: event.target.value })} /></label>
              </div>
              <button type="submit" disabled={loading || !purchaseOrderForm.supplierId || !purchaseOrderForm.productId}>Create PO</button>
            </form>

            <form className="card" onSubmit={setStock}>
              <h2>Add stock</h2>
              <Select label="Product" value={stockForm.productId} options={products} onChange={(value) => setStockForm({ ...stockForm, productId: value })} />
              <Select label="Location" value={stockForm.locationId} options={locations} onChange={(value) => setStockForm({ ...stockForm, locationId: value })} />
              <label>Quantity<input type="number" min="0" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></label>
              <label>Received date for decay demo<input type="date" value={stockForm.receivedAt} onChange={(event) => setStockForm({ ...stockForm, receivedAt: event.target.value })} /></label>
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

            <form className="card" onSubmit={recordSale}>
              <h2>Record sale</h2>
              <Select label="Product" value={saleForm.productId} options={products} onChange={(value) => setSaleForm({ ...saleForm, productId: value })} />
              <Select label="Location" value={saleForm.locationId} options={locations} onChange={(value) => setSaleForm({ ...saleForm, locationId: value })} />
              <div className="twoCols">
                <label>Quantity<input type="number" min="1" value={saleForm.quantity} onChange={(event) => setSaleForm({ ...saleForm, quantity: event.target.value })} /></label>
                <label>Unit price<input type="number" min="1" value={saleForm.unitPrice} onChange={(event) => setSaleForm({ ...saleForm, unitPrice: event.target.value })} /></label>
              </div>
              <button type="submit" disabled={loading || !saleForm.productId || !saleForm.locationId}>Record sale</button>
            </form>

            <form className="card" onSubmit={runForecast}>
              <h2>Forecast reorder</h2>
              <Select label="Product" value={forecastForm.productId} options={products} onChange={(value) => setForecastForm({ ...forecastForm, productId: value })} />
              <Select label="Location" value={forecastForm.locationId} options={locations} onChange={(value) => setForecastForm({ ...forecastForm, locationId: value })} />
              <div className="threeCols">
                <label>Days<input type="number" min="1" value={forecastForm.days} onChange={(event) => setForecastForm({ ...forecastForm, days: event.target.value })} /></label>
                <label>Lead time<input type="number" min="1" value={forecastForm.leadTimeDays} onChange={(event) => setForecastForm({ ...forecastForm, leadTimeDays: event.target.value })} /></label>
                <label>Safety stock<input type="number" min="0" value={forecastForm.safetyStock} onChange={(event) => setForecastForm({ ...forecastForm, safetyStock: event.target.value })} /></label>
              </div>
              <button type="submit" disabled={loading || !forecastForm.productId || !forecastForm.locationId}>Run forecast</button>
              {forecastResult && <ForecastResult forecast={forecastResult} />}
            </form>

            <form className="card" onSubmit={reserveStock}>
              <h2>Reserve checkout stock</h2>
              <Select label="Product" value={reservationForm.productId} options={products} onChange={(value) => setReservationForm({ ...reservationForm, productId: value })} />
              <Select label="Location" value={reservationForm.locationId} options={locations} onChange={(value) => setReservationForm({ ...reservationForm, locationId: value })} />
              <div className="twoCols">
                <label>Quantity<input type="number" min="1" value={reservationForm.quantity} onChange={(event) => setReservationForm({ ...reservationForm, quantity: event.target.value })} /></label>
                <label>TTL seconds<input type="number" min="60" value={reservationForm.ttlSeconds} onChange={(event) => setReservationForm({ ...reservationForm, ttlSeconds: event.target.value })} /></label>
              </div>
              <div className="inlineActions">
                <button type="submit" disabled={loading || !reservationForm.productId || !reservationForm.locationId}>Create reservation</button>
                <button className="secondary" type="button" disabled={loading || !reservationToken} onClick={commitReservation}>Commit reservation</button>
              </div>
              {activeReservation && <ReservationResult reservation={activeReservation} />}
            </form>

            <div className="card">
              <h2>Quick operations</h2>
              <button className="secondary" type="button" disabled={loading} onClick={() => refreshLocations({ silent: false })}>Refresh locations</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => refreshProducts({ silent: false })}>Refresh products</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => refreshSuppliers({ silent: false })}>Refresh suppliers</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => refreshPurchaseOrders({ silent: false })}>Refresh POs</button>
              <button className="secondary" type="button" disabled={loading} onClick={() => refreshInventory({ silent: false })}>Refresh stock table</button>
              <button className="secondary" type="button" disabled={loading} onClick={runDeadStockDecay}>Run dead-stock price decay</button>
              {decayResult && <DecayResult result={decayResult} />}
            </div>

            <div className="card stockBoard">
              <div className="cardHeader">
                <div>
                  <h2>Stock by location</h2>
                  <p>Use this table to verify stock after replenishment, transfer, reservation, PO receiving, and sales.</p>
                </div>
                <button className="secondary" type="button" disabled={loading} onClick={() => refreshInventory({ silent: false })}>Refresh</button>
              </div>
              <InventoryTable items={inventoryItems} />
            </div>

            <div className="card listCard">
              <h2>Current session data</h2>
              <DataList title="Locations" items={locations} onEdit={editLocation} onDelete={deleteLocation} />
              <ProductList items={products} onEdit={editProduct} onDelete={deleteProduct} />
              <DataList title="Suppliers" items={suppliers} onEdit={editSupplier} onDelete={deleteSupplier} />
              <PurchaseOrderList
                items={purchaseOrders}
                canReceive={Boolean(purchaseOrderForm.locationId)}
                onSend={sendPurchaseOrder}
                onReceive={receivePurchaseOrder}
                onCancel={cancelPurchaseOrder}
              />
              {reservationToken && <p className="muted">Reservation: {reservationToken}</p>}
            </div>
          </div>
        )}

        {section === "admin" && isAdmin && (
          <div className="card">
            <div className="cardHeader">
              <div>
                <h2>User management</h2>
                <p>Admin can see users, change roles, and inspect background queues.</p>
              </div>
              <div className="inlineActions">
                <button type="button" onClick={() => listUsers({ silent: false })} disabled={loading}>Refresh users</button>
                <button className="secondary" type="button" onClick={() => loadJobQueues({ silent: false })} disabled={loading}>Refresh queues</button>
              </div>
            </div>
            <div className="table">
              {users.map((user) => (
                <div className="tableRow" key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>{user.tenant?.name || "No tenant"} - {user.emailVerifiedAt ? "verified" : "not verified"}</span>
                  </div>
                  <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value)} disabled={loading}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MERCHANT">MERCHANT</option>
                    <option value="STAFF">STAFF</option>
                  </select>
                  <button className="danger" type="button" onClick={() => deleteUser(user.id)} disabled={loading || user.id === auth.user?.id}>Delete</button>
                </div>
              ))}
            </div>
            {jobQueues && <QueueSummary queues={jobQueues} />}
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
              <button className="danger" type="button" onClick={deleteMyAccount} disabled={loading}>Delete my account</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function InventoryTable({ items }) {
  if (items.length === 0) {
    return <p className="muted">No stock rows yet. Create a product and store, then replenish stock.</p>;
  }

  return (
    <div className="stockTable">
      <div className="stockHeader">
        <span>Product</span>
        <span>Store</span>
        <span>On hand</span>
        <span>Reserved</span>
        <span>Available</span>
      </div>
      {items.map((item) => {
        const available = item.quantity - item.reservedQuantity;
        return (
          <div className="stockRow" key={item.id}>
            <span>
              <strong>{item.product?.name || item.productId}</strong>
              <small>{item.product?.sku}</small>
            </span>
            <span>
              <strong>{item.location?.name || item.locationId}</strong>
              <small>{item.location?.code}</small>
            </span>
            <b>{item.quantity}</b>
            <b>{item.reservedQuantity}</b>
            <b className={available <= 0 ? "dangerText" : ""}>{available}</b>
          </div>
        );
      })}
    </div>
  );
}

function ForecastResult({ forecast }) {
  return (
    <div className="resultBox">
      <strong>{forecast.shouldReorder ? "Reorder recommended" : "Stock is enough"}</strong>
      <span>Available: {forecast.availableQuantity}</span>
      <span>Reorder point: {forecast.reorderPoint}</span>
      <span>Recommended order: {forecast.recommendedOrderQuantity}</span>
      <span>Average daily demand: {forecast.averageDailyDemand}</span>
    </div>
  );
}

function ReservationResult({ reservation }) {
  return (
    <div className="resultBox">
      <strong>Reservation status: {reservation.status}</strong>
      <span>Token: {reservation.token}</span>
      <span>Quantity reserved: {reservation.quantity}</span>
      <span>Expires at: {new Date(reservation.expiresAt).toLocaleString()}</span>
    </div>
  );
}

function DecayResult({ result }) {
  return (
    <div className="resultBox">
      <strong>Dead-stock decay result</strong>
      <span>Updated products: {result.updatedCount}</span>
      {result.products?.length > 0 && (
        <span>{result.products.map((product) => `${product.name}: ${product.currentPrice}`).join(", ")}</span>
      )}
      {result.updatedCount === 0 && <span>No product met the age/interval rules. Use an older received date and run again.</span>}
    </div>
  );
}

function QueueSummary({ queues }) {
  return (
    <div className="queueGrid">
      {["email", "maintenance"].map((name) => {
        const queue = queues[name];
        return (
          <section key={name}>
            <h3>{name} queue</h3>
            <div className="metricRow">
              <span>Waiting <b>{queue?.counts?.waiting || 0}</b></span>
              <span>Active <b>{queue?.counts?.active || 0}</b></span>
              <span>Completed <b>{queue?.counts?.completed || 0}</b></span>
              <span>Failed <b>{queue?.counts?.failed || 0}</b></span>
            </div>
          </section>
        );
      })}
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

function DataList({ title, items, onEdit, onDelete }) {
  return (
    <div className="dataList">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted">Nothing created yet.</p>}
      {items.map((item) => (
        <div key={item.id}>
          <section>
            <strong>{item.name || item.sku}</strong>
            <span>{item.code || item.sku || item.id}</span>
          </section>
          <nav>
            <button className="secondary" type="button" onClick={() => onEdit(item)}>Edit</button>
            <button className="danger" type="button" onClick={() => onDelete(item.id)}>Delete</button>
          </nav>
        </div>
      ))}
    </div>
  );
}

function ProductList({ items, onEdit, onDelete }) {
  return (
    <div className="dataList">
      <h3>Products</h3>
      {items.length === 0 && <p className="muted">Nothing created yet.</p>}
      {items.map((item) => (
        <div key={item.id}>
          <section>
            <strong>{item.name}</strong>
            <span>SKU {item.sku} - price {item.currentPrice} - decay {item.decayPercent}%</span>
          </section>
          <nav>
            <button className="secondary" type="button" onClick={() => onEdit(item)}>Edit</button>
            <button className="danger" type="button" onClick={() => onDelete(item.id)}>Delete</button>
          </nav>
        </div>
      ))}
    </div>
  );
}

function PurchaseOrderList({ items, canReceive, onSend, onReceive, onCancel }) {
  return (
    <div className="dataList">
      <h3>Purchase orders</h3>
      {items.length === 0 && <p className="muted">Nothing created yet.</p>}
      {items.map((item) => (
        <div key={item.id}>
          <section>
            <strong>{item.supplier?.name || item.supplierId}</strong>
            <span>{item.status} - {item.items?.length || 0} item(s)</span>
          </section>
          <nav>
            <button className="secondary" type="button" disabled={item.status !== "DRAFT"} onClick={() => onSend(item.id)}>Send</button>
            <button className="secondary" type="button" disabled={!canReceive || !["DRAFT", "SENT"].includes(item.status)} onClick={() => onReceive(item.id)}>Receive</button>
            <button className="danger" type="button" disabled={["RECEIVED", "CANCELLED"].includes(item.status)} onClick={() => onCancel(item.id)}>Cancel</button>
          </nav>
        </div>
      ))}
    </div>
  );
}
