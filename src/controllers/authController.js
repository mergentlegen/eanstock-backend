const { registerUser, loginUser, refreshAccessToken, logoutUser, publicUser } = require("../services/auth.service");

async function register(req, res) {
  const result = await registerUser(req.body, req.ip);
  res.status(201).json({
    user: result.user,
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
    },
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
}

async function login(req, res) {
  const result = await loginUser(req.body, req.ip);
  res.json(result);
}

async function refresh(req, res) {
  const result = await refreshAccessToken(req.body.refreshToken, req.ip);
  res.json(result);
}

async function logout(req, res) {
  const result = await logoutUser(req.body.refreshToken, req.user.id, req.user.tenantId, req.ip);
  res.json(result);
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
};
