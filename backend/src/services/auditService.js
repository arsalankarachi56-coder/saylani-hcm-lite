const { AuditLog } = require("../models");

function recordAudit(user, action, entity, entityId, before, after) {
  return AuditLog.create({
    actor: user?._id, actorName: user?.name || "System", action, entity, entityId,
    before: before || undefined, after: after || undefined
  });
}

module.exports = { recordAudit };
