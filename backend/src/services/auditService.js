const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({
  benutzer,
  benutzerName,
  aktion,
  lieferschein = null,
  lieferscheinNr = null,
  details = {},
  req = null
}) => {
  try {
    await AuditLog.create({
      benutzer,
      benutzerName,
      aktion,
      lieferschein,
      lieferscheinNr,
      details,
      ip: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent']
    });
  } catch (err) {
    console.error('Audit-Log Fehler:', err.message);
  }
};

module.exports = { createAuditLog };
