const { Notification } = require("../models");

function notifyUsers(recipients, message, entity, entityId) {
  if (!recipients.length) return Promise.resolve([]);
  return Notification.insertMany(recipients.map((recipient) => ({
    recipient, message, entity, entityId: entityId.toString()
  })));
}

module.exports = { notifyUsers };
