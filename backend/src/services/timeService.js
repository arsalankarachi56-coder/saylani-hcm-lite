function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateKey(date = new Date(), timeZone = "Asia/Karachi") {
  const parts = localParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMinutes(date = new Date(), timeZone = "Asia/Karachi") {
  const parts = localParts(date, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseOfficeDateTime(value, timeZone) {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    const explicit = new Date(value);
    if (!Number.isNaN(explicit.getTime())) return explicit;
    throw Object.assign(new Error("Enter a valid correction time."), { status: 400 });
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw Object.assign(new Error("Enter a valid correction time."), { status: 400 });
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const calendar = new Date(target);
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) ||
      calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) {
    throw Object.assign(new Error("Enter a valid correction time."), { status: 400 });
  }
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = localParts(new Date(timestamp), timeZone);
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    timestamp += target - observed;
  }
  const result = new Date(timestamp);
  if (localDateKey(result, timeZone) !== `${year}-${month}-${day}` || localMinutes(result, timeZone) !== Number(hour) * 60 + Number(minute)) {
    throw Object.assign(new Error("The correction time is invalid for the configured office timezone."), { status: 400 });
  }
  return result;
}

module.exports = { localDateKey, localMinutes, parseOfficeDateTime };
