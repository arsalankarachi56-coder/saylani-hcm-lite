const { distanceMeters } = require("./geofenceService");

function validateCheckInPolicy(company, input) {
  if (company?.geofenceEnabled) {
    if (company.officeLatitude === undefined || company.officeLongitude === undefined) {
      return { status: 503, message: "Office geofence is enabled but its coordinates are not configured." };
    }
    if (input.latitude === undefined || input.longitude === undefined) {
      return { status: 400, message: "Allow location access to check in from the configured office area." };
    }
    const distance = distanceMeters(input.latitude, input.longitude, company.officeLatitude, company.officeLongitude);
    if (distance > company.attendanceRadiusMeters) {
      return { status: 403, message: `You are outside the configured office radius (${Math.ceil(distance)} m away).` };
    }
  }
  if (company?.cameraCheckEnabled && input.cameraPresenceChecked !== true) {
    return { status: 400, message: "Complete the optional on-device camera presence check before checking in." };
  }
  return null;
}

module.exports = { validateCheckInPolicy };
