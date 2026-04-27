const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/database");
const { slugify } = require("../utils/slug");
const { conflict, unauthorized } = require("../utils/errors");
const { signAccessToken, issueRefreshToken, revokeRefreshToken, findValidRefreshToken } = require("./token.service");
const { writeAudit } = require("./audit.service");

async function registerUser(input, ipAddress) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });

  if (existing) {
    throw conflict("Email or username is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const tenantSlugBase = slugify(input.tenantName);
  const tenantSlug = `${tenantSlugBase}-${Date.now().toString(36)}`;

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: tenantSlug,
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        username: input.username,
        passwordHash,
        role: input.role ?? "MERCHANT",
      },
    });

    await writeAudit({
      tx,
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ipAddress,
    });

    const refresh = await issueRefreshToken(user.id, tx);
    const accessToken = signAccessToken(user);

    return {
      user: publicUser(user),
      tenant,
      accessToken,
      refreshToken: refresh.refreshToken,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  });
}

async function loginUser(input, ipAddress) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    throw unauthorized("Invalid email or password");
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw unauthorized("Invalid email or password");
  }

  const refresh = await issueRefreshToken(user.id);
  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress,
  });

  return {
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

async function refreshAccessToken(rawRefreshToken, ipAddress) {
  const token = await findValidRefreshToken(rawRefreshToken);
  if (!token) {
    throw unauthorized("Refresh token is invalid, expired, or revoked");
  }

  await writeAudit({
    tenantId: token.user.tenantId,
    actorUserId: token.user.id,
    action: "TOKEN_REFRESH",
    entityType: "RefreshToken",
    entityId: token.id,
    ipAddress,
  });

  return {
    accessToken: signAccessToken(token.user),
    expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  };
}

async function logoutUser(rawRefreshToken, actorUserId, tenantId, ipAddress) {
  const result = await revokeRefreshToken(rawRefreshToken);
  await writeAudit({
    tenantId,
    actorUserId,
    action: "LOGOUT",
    entityType: "RefreshToken",
    metadata: { revoked: result.count > 0 },
    ipAddress,
  });
  return { revoked: result.count > 0 };
}

function publicUser(user) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function mapPrismaError(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return conflict("Unique value already exists", error.meta);
  }
  return error;
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  publicUser,
  mapPrismaError,
};
