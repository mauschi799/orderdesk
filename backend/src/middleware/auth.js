const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Kein Token, Zugriff verweigert' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-pin');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Benutzer nicht gefunden oder inaktiv' });
    }

    // Auto-logout check
    const autoLogoutMinutes = parseInt(process.env.AUTO_LOGOUT_MINUTES || '60');
    if (user.lastActivity) {
      const minutesSinceActivity = (Date.now() - user.lastActivity) / 1000 / 60;
      if (minutesSinceActivity > autoLogoutMinutes) {
        return res.status(401).json({ message: 'Sitzung abgelaufen, bitte erneut anmelden' });
      }
    }

    // Update last activity
    await User.findByIdAndUpdate(user._id, { lastActivity: new Date() });

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token abgelaufen' });
    }
    res.status(401).json({ message: 'Ungültiger Token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Zugriff verweigert. Erforderliche Rolle: ${roles.join(' oder ')}`
    });
  }
  next();
};

const requirePermission = (permission) => (req, res, next) => {
  const permissions = User.getRolePermissions(req.user.role);
  if (!permissions.includes(permission)) {
    return res.status(403).json({ message: 'Keine Berechtigung für diese Aktion' });
  }
  next();
};

module.exports = { auth, requireRole, requirePermission };
