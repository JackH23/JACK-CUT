const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

const REFRESH_TOKEN_DAYS =
  Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function createToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userId) {
  const refreshToken = crypto.randomBytes(48).toString("hex");

  await RefreshToken.create({
    user_id: userId,
    token_hash: hashToken(refreshToken),
    expires_at: new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    ),
  });

  return refreshToken;
}

async function register(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!name || !email || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message:
          "Name, email, and a password of at least 8 characters are required.",
      });
    }

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered.",
      });
    }

    const user = await User.create({
      name,
      email,
      password_hash: await bcrypt.hash(password, 12),
    });

    const refreshToken = await createRefreshToken(user.id);

    return res.status(201).json({
      message: "Account created successfully.",
      token: createToken(user),
      refreshToken,
      user: publicUser(user),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message: "Email is already registered.",
      });
    }

    console.error("Register error:", error);
    return res.status(500).json({
      message: "Could not create account.",
    });
  }
}

async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!email || typeof password !== "string") {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({ where: { email } });
    const validPassword =
      user && (await bcrypt.compare(password, user.password_hash));

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const refreshToken = await createRefreshToken(user.id);

    return res.json({
      token: createToken(user),
      refreshToken,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Could not log in.",
    });
  }
}

async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body;

    if (
      typeof refreshToken !== "string" ||
      !/^[0-9a-f]{96}$/.test(refreshToken)
    ) {
      return res.status(401).json({
        message: "Invalid refresh token.",
      });
    }

    const tokenHash = hashToken(refreshToken);

    const storedToken = await RefreshToken.findOne({
      where: { token_hash: tokenHash },
    });

    if (!storedToken || storedToken.expires_at <= new Date()) {
      return res.status(401).json({
        message: "Invalid or expired refresh token.",
      });
    }

    const user = await User.findByPk(storedToken.user_id);

    if (!user) {
      return res.status(401).json({
        message: "Invalid refresh token.",
      });
    }

    // Only one request can consume this token.
    const deletedCount = await RefreshToken.destroy({
      where: {
        id: storedToken.id,
        token_hash: tokenHash,
      },
    });

    if (deletedCount !== 1) {
      return res.status(401).json({
        message: "Refresh token has already been used.",
      });
    }

    const newRefreshToken = await createRefreshToken(user.id);

    return res.json({
      token: createToken(user),
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({
      message: "Could not refresh token.",
    });
  }
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body;

    if (
      typeof refreshToken === "string" &&
      /^[0-9a-f]{96}$/.test(refreshToken)
    ) {
      await RefreshToken.destroy({
        where: { token_hash: hashToken(refreshToken) },
      });
    }

    return res.json({
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      message: "Could not log out.",
    });
  }
}

async function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  me,
};