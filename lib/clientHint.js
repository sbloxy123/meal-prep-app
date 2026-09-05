// The frontend sends `X-Fornetto-Client: <mode>/<platform>` on every data
// request (src/lib/api.ts): `standalone/ios`, `browser/desktop`, … "standalone"
// means the page is running from the home screen (display-mode: standalone or
// navigator.standalone), which is the only install signal iOS gives us. The
// value is client-supplied, so it is parsed strictly and anything odd is
// treated as "no hint" rather than trusted.

const HINT_HEADER = "x-fornetto-client";
const HINT_RE = /^(standalone|browser)(?:\/([a-z]{1,16}))?$/;

function parseClientHint(value) {
    if (typeof value !== "string") return null;
    const m = HINT_RE.exec(value.trim().toLowerCase());
    if (!m) return null;
    return { standalone: m[1] === "standalone", platform: m[2] || null };
}

function clientHintFrom(req) {
    return parseClientHint(req?.headers?.[HINT_HEADER]);
}

module.exports = { HINT_HEADER, parseClientHint, clientHintFrom };
